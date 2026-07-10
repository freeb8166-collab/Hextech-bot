// bot.js - Gestion du bot WhatsApp
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
} = require('baileys');

const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const store = require('./lib/store');
const { messageHandler } = require('./handlers/message');
const { setupStatusHandlers } = require('./handlers/status');

// ── CONFIGURATION ────────────────────────────────────────────────
const logger = pino({ level: 'silent' });
const pendingSockets = new Map();
const msgCaches = new Map();
const watchdogs = new Map();
const sessions = new Map();

const FALLBACK_VERSION = [2, 3000, 1023596128];
const RECONNECT_CODES = new Set([405, 408, 503, 428, 500, 502]);
const MAX_RETRIES = 5;
const RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000];
let isStarting = false;

// ── FONCTIONS UTILITAIRES ──────────────────────────────────────

async function getVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[BOT] 📱 WhatsApp version: ${version.join('.')}`);
    return version;
  } catch (e) {
    console.warn('[BOT] ⚠️ Fallback version');
    return FALLBACK_VERSION;
  }
}

function getBrowserValue() {
  if (typeof Browsers?.macOS === 'function') {
    return Browsers.macOS('Safari');
  }
  return ['Ubuntu', 'Chrome', '22.0.0'];
}

function clearWatchdog(sanitized) {
  if (watchdogs.has(sanitized)) {
    clearInterval(watchdogs.get(sanitized));
    watchdogs.delete(sanitized);
  }
}

function formatPairingCode(code) {
  if (!code) return null;
  return code.match(/.{1,4}/g)?.join('-') || code;
}

// ── DÉMARRER UNE SESSION ────────────────────────────────────────

async function startSession(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(config.SESSION_BASE_PATH, sanitized);

  try {
    await fs.ensureDir(sessionPath);

    if (sessions.has(sanitized)) {
      console.log(`[${sanitized}] 🔄 Fermeture session existante...`);
      try {
        const oldSock = sessions.get(sanitized);
        await oldSock.end(new Error('New session starting'));
      } catch (e) {}
      sessions.delete(sanitized);
    }

    console.log(`[${sanitized}] 🔑 Chargement authentification...`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const version = await getVersion();

    if (!msgCaches.has(sanitized)) {
      msgCaches.set(sanitized, new Map());
    }
    const msgCache = msgCaches.get(sanitized);

    console.log(`[${sanitized}] 🔌 Création socket...`);
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: getBrowserValue(),
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 250,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      msgRetryCounterMap: new Map(),
      getMessage: async (key) => {
        const cached = msgCache.get(key.id);
        if (cached) return cached;
        return { conversation: '' };
      },
    });

    sessions.set(sanitized, sock);
    pendingSockets.set(sanitized, sock);

    // ── GESTIONNAIRES D'ÉVÉNEMENTS ─────────────────────────────

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      try {
        for (const m of msgs) {
          if (m.message && m.key?.id) {
            msgCache.set(m.key.id, m.message);
            if (msgCache.size > 500) {
              msgCache.delete(msgCache.keys().next().value);
            }
          }
        }
        await messageHandler(sock, { messages: msgs, type });
      } catch (e) {
        console.error(`[${sanitized}] ❌ messageHandler error:`, e.message);
      }
    });

    setupStatusHandlers(sock);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`[${sanitized}] ✅ Connecté!`);
        pendingSockets.delete(sanitized);
        store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });

        try {
          await sock.sendPresenceUpdate('available');
        } catch (_) {}

        // Watchdog
        clearWatchdog(sanitized);
        let wdFails = 0;
        const wd = setInterval(async () => {
          if (!store.getSession(sanitized)) {
            clearWatchdog(sanitized);
            return;
          }
          try {
            await Promise.race([
              sock.sendPresenceUpdate('available'),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
            ]);
            wdFails = 0;
          } catch (e) {
            wdFails++;
            console.log(`[${sanitized}] ⚠️ Watchdog échec ${wdFails}/3...`);
            if (wdFails >= 3) {
              console.log(`[${sanitized}] 🔴 Zombie, reconnexion...`);
              clearWatchdog(sanitized);
              store.deleteSession(sanitized);
              try { await sock.end(new Error('watchdog')); } catch (_) {}
              setTimeout(() => reconnectSession(sanitized), 3000);
            }
          }
        }, 45000);
        watchdogs.set(sanitized, wd);

        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[${sanitized}] 🔌 Déconnecté. Code: ${statusCode}`);

        clearWatchdog(sanitized);
        pendingSockets.delete(sanitized);

        if (statusCode === DisconnectReason.loggedOut) {
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          await fs.remove(sessionPath);
          msgCaches.delete(sanitized);
        } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 2000);
        } else if (RECONNECT_CODES.has(statusCode)) {
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 8000);
        } else {
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 5000);
        }
      }
    });

    // ── DEMANDE DE CODE DE COUPLAGE ─────────────────────────────

    if (!sock.authState.creds.registered) {
      await delay(3000);
      console.log(`[${sanitized}] 📱 Demande code...`);

      try {
        const code = await sock.requestPairingCode(sanitized);
        const formattedCode = formatPairingCode(code);
        console.log(`[${sanitized}] ✅ Code: ${formattedCode}`);

        setTimeout(() => {
          if (pendingSockets.has(sanitized)) {
            pendingSockets.delete(sanitized);
          }
        }, 5 * 60 * 1000);

        return { sock, code: formattedCode };
      } catch (err) {
        console.error(`[${sanitized}] ❌ requestPairingCode error:`, err.message);
        pendingSockets.delete(sanitized);
        sessions.delete(sanitized);
        try { await sock.end(); } catch (_) {}
        throw new Error(`Pairing code failed: ${err.message}`);
      }
    }

    pendingSockets.delete(sanitized);
    store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });
    console.log(`[${sanitized}] ✅ Déjà enregistré.`);
    return { sock, code: null };

  } catch (err) {
    console.error(`[${sanitized}] ❌ Erreur:`, err.message);
    pendingSockets.delete(sanitized);
    sessions.delete(sanitized);
    throw err;
  }
}

// ── RECONNEXION ──────────────────────────────────────────────────

async function reconnectSession(sanitized, retryCount = 0) {
  const sessionPath = path.join(config.SESSION_BASE_PATH, sanitized);
  
  if (!await fs.pathExists(sessionPath)) {
    return;
  }

  if (store.getSession(sanitized) || sessions.has(sanitized)) {
    return;
  }

  try {
    console.log(`[${sanitized}] 🔄 Reconnexion ${retryCount + 1}/${MAX_RETRIES}...`);
    await startSession(sanitized);
  } catch (e) {
    console.error(`[${sanitized}] ❌ Reconnection error:`, e.message);
    
    if (retryCount < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[retryCount] || 30000;
      setTimeout(() => reconnectSession(sanitized, retryCount + 1), delay);
    }
  }
}

// ── DÉMARRER LES SESSIONS EXISTANTES ──────────────────────────

async function startExistingSessions() {
  if (isStarting) return;
  isStarting = true;

  try {
    if (!await fs.pathExists(config.SESSION_BASE_PATH)) {
      await fs.ensureDir(config.SESSION_BASE_PATH);
      console.log('[BOT] 📁 Dossier sessions créé.');
      isStarting = false;
      return;
    }

    const dirs = await fs.readdir(config.SESSION_BASE_PATH);
    const validDirs = [];

    for (const dir of dirs) {
      const p = path.join(config.SESSION_BASE_PATH, dir);
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        const files = await fs.readdir(p);
        if (files.length > 0) {
          validDirs.push(dir);
        }
      }
    }

    console.log(`[BOT] 📂 ${validDirs.length} session(s) à restaurer`);

    for (const dir of validDirs) {
      try {
        console.log(`[BOT] 🔄 Restauration ${dir}...`);
        await startSession(dir);
        await delay(3000);
      } catch (e) {
        console.error(`[BOT] ❌ Erreur ${dir}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[BOT] ❌ Erreur:', err.message);
  }
  
  isStarting = false;
}

// ── FONCTION PRINCIPALE ─────────────────────────────────────────

function startBot() {
  console.log('[BOT] 🤖 Démarrage...');
  
  // Démarrer les sessions en arrière-plan sans bloquer
  setImmediate(() => {
    startExistingSessions();
  });
  
  // Nettoyage périodique
  setInterval(() => {
    try {
      const activeSessions = store.sessionCount();
      if (activeSessions > 0) {
        console.log(`[BOT] 📊 ${activeSessions} session(s) active(s)`);
      }
    } catch (_) {}
  }, 60000);
}

module.exports = { startBot, startSession };
