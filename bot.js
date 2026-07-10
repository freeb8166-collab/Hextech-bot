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

// ── FONCTIONS UTILITAIRES ──────────────────────────────────────

async function getVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[BOT] 📱 WhatsApp version: ${version.join('.')}`);
    return version;
  } catch (e) {
    console.warn('[BOT] ⚠️ fetchLatestBaileysVersion failed → fallback version');
    return FALLBACK_VERSION;
  }
}

function getBrowserValue() {
  if (typeof Browsers?.macOS === 'function') {
    return Browsers.macOS('Safari');
  }
  if (Array.isArray(Browsers?.macOS)) {
    return Browsers.macOS;
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
    // Créer le dossier de session
    await fs.ensureDir(sessionPath);

    // Si une session existe déjà, la supprimer pour éviter les conflits
    if (sessions.has(sanitized)) {
      console.log(`[${sanitized}] 🔄 Session existante trouvée, fermeture...`);
      try {
        const oldSock = sessions.get(sanitized);
        await oldSock.end(new Error('New session starting'));
      } catch (e) {}
      sessions.delete(sanitized);
    }

    // Charger l'état d'authentification
    console.log(`[${sanitized}] 🔑 Chargement de l'état d'authentification...`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const version = await getVersion();

    // Initialiser le cache des messages
    if (!msgCaches.has(sanitized)) {
      msgCaches.set(sanitized, new Map());
    }
    const msgCache = msgCaches.get(sanitized);

    // Créer la socket WhatsApp
    console.log(`[${sanitized}] 🔌 Création de la socket WhatsApp...`);
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

    // Stocker la socket
    sessions.set(sanitized, sock);
    pendingSockets.set(sanitized, sock);

    // ── GESTIONNAIRES D'ÉVÉNEMENTS ─────────────────────────────

    // Sauvegarde des credentials
    sock.ev.on('creds.update', saveCreds);

    // Gestion des messages
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

    // Statut des messages (vus, délivrés, etc.)
    setupStatusHandlers(sock);

    // Gestion des participants de groupe
    sock.ev.on('group-participants.update', async (update) => {
      try {
        const { id, participants, action } = update;
        const meta = await sock.groupMetadata(id);
        
        for (const jid of participants) {
          const num = jid.split('@')[0];
          if (action === 'add') {
            await sock.sendMessage(id, {
              image: { url: config.MENU_IMAGE || 'https://i.ibb.co/xxx/welcome.jpg' },
              caption: `╔╦══════════════════╦╗\n║║   *WELCOME* 🎉   ║║\n╚╩══════════════════╩╝\n\n👋 Welcome @${num} to *${meta.subject}*!\n\nWe're glad to have you here. Please read the group rules.\n\n_Powered by DENTSU MD V9_`,
              mentions: [jid],
            });
          } else if (action === 'remove') {
            await sock.sendMessage(id, {
              image: { url: config.MENU_IMAGE || 'https://i.ibb.co/xxx/goodbye.jpg' },
              caption: `╔╦══════════════════╦╗\n║║   *GOODBYE* 👋   ║║\n╚╩══════════════════╩╝\n\n😢 @${num} has left *${meta.subject}*.\n\nWe'll miss you! Come back anytime.\n\n_Powered by DENTSU MD V9_`,
              mentions: [jid],
            });
          }
        }
      } catch (e) {
        console.error(`[${sanitized}] group-participants error:`, e.message);
      }
    });

    // Connexion et déconnexion
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`[${sanitized}] ✅ Connecté avec succès!`);
        pendingSockets.delete(sanitized);
        store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });

        // Envoyer la présence
        try {
          await sock.sendPresenceUpdate('available');
        } catch (_) {}

        // Message de bienvenue au propriétaire
        setTimeout(async () => {
          try {
            const now = new Date();
            const date = now.toLocaleDateString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric'
            });
            const heure = now.toLocaleTimeString('fr-FR', {
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            const pushName = sock.user?.name || sock.user?.verifiedName || sanitized;
            const selfJid = sanitized + '@s.whatsapp.net';
            const welcome = 
`╭───────────────────
• DENTSU MD V9 ACTIF 🟢

• 📆 DATE : ${date}
• ⌚ HEURE : ${heure}
• 🤳 SESSION : ${sanitized}
• 📟 NUMBER : +${sanitized}
• ✍️ NAMEUSER : ${pushName}
• 🚀 BOT LINK : https://dentsu-md-v9.onrender.com
> BY NATSUTECH'S PROJECT 
╰───────────────────`;
            await sock.sendMessage(selfJid, { text: welcome });
          } catch (_) {}
        }, 2500);

        // Watchdog pour détecter les sessions zombies
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
              console.log(`[${sanitized}] 🔴 Zombie confirmé, reconnexion...`);
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
        const reason = lastDisconnect?.error?.output?.payload?.error || statusCode;
        console.log(`[${sanitized}] 🔌 Connexion fermée. Code: ${statusCode}, Raison: ${reason}`);

        clearWatchdog(sanitized);
        pendingSockets.delete(sanitized);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[${sanitized}] 🚪 Session déconnectée, suppression...`);
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          await fs.remove(sessionPath);
          msgCaches.delete(sanitized);
        } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`[${sanitized}] 🔄 Redémarrage requis, reconnexion dans 2s...`);
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 2000);
        } else if (RECONNECT_CODES.has(statusCode)) {
          console.log(`[${sanitized}] 🔄 Code ${statusCode}, reconnexion dans 8s...`);
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 8000);
        } else {
          console.log(`[${sanitized}] 🔄 Reconnexion dans 5s...`);
          store.deleteSession(sanitized);
          sessions.delete(sanitized);
          setTimeout(() => reconnectSession(sanitized), 5000);
        }
      }
    });

    // ── DEMANDE DE CODE DE COUPLAGE ─────────────────────────────

    // Vérifier si le numéro est déjà enregistré
    if (!sock.authState.creds.registered) {
      await delay(3000);
      console.log(`[${sanitized}] 📱 Demande de code de couplage...`);

      try {
        const code = await sock.requestPairingCode(sanitized);
        const formattedCode = formatPairingCode(code);
        console.log(`[${sanitized}] ✅ Code généré: ${formattedCode}`);

        // Timeout pour nettoyer
        setTimeout(() => {
          if (pendingSockets.has(sanitized)) {
            console.log(`[${sanitized}] ⏰ Pairing timeout, nettoyage...`);
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

    // Numéro déjà enregistré
    pendingSockets.delete(sanitized);
    store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });
    console.log(`[${sanitized}] ✅ Numéro déjà enregistré, connexion établie.`);
    return { sock, code: null };

  } catch (err) {
    console.error(`[${sanitized}] ❌ Erreur startSession:`, err.message);
    pendingSockets.delete(sanitized);
    sessions.delete(sanitized);
    throw err;
  }
}

// ── RECONNEXION ──────────────────────────────────────────────────

async function reconnectSession(sanitized, retryCount = 0) {
  const sessionPath = path.join(config.SESSION_BASE_PATH, sanitized);
  
  // Vérifier si le dossier de session existe
  if (!await fs.pathExists(sessionPath)) {
    console.log(`[${sanitized}] ℹ️ Aucune session à reconnecter.`);
    return;
  }

  // Vérifier si une session est déjà active
  if (store.getSession(sanitized) || sessions.has(sanitized)) {
    console.log(`[${sanitized}] ℹ️ Session déjà active.`);
    return;
  }

  try {
    console.log(`[${sanitized}] 🔄 Tentative de reconnexion ${retryCount + 1}/${MAX_RETRIES}...`);
    await startSession(sanitized);
  } catch (e) {
    console.error(`[${sanitized}] ❌ Reconnection error:`, e.message);
    
    if (retryCount < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[retryCount] || 30000;
      console.log(`[${sanitized}] ⏳ Nouvelle tentative dans ${delay/1000}s...`);
      setTimeout(() => reconnectSession(sanitized, retryCount + 1), delay);
    } else {
      console.log(`[${sanitized}] ❌ Échec après ${MAX_RETRIES} tentatives.`);
    }
  }
}

// ── DÉMARRER LES SESSIONS EXISTANTES ──────────────────────────

async function startExistingSessions() {
  try {
    if (!await fs.pathExists(config.SESSION_BASE_PATH)) {
      await fs.ensureDir(config.SESSION_BASE_PATH);
      console.log('[BOT] 📁 Dossier de sessions créé.');
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

    console.log(`[BOT] 📂 ${validDirs.length} session(s) existante(s) à restaurer`);

    for (const dir of validDirs) {
      try {
        console.log(`[BOT] 🔄 Restauration de la session ${dir}...`);
        await startSession(dir);
        await delay(3000);
      } catch (e) {
        console.error(`[BOT] ❌ Erreur session ${dir}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[BOT] ❌ Erreur startExistingSessions:', err.message);
  }
}

// ── FONCTION PRINCIPALE ─────────────────────────────────────────

function startBot() {
  console.log('[BOT] 🤖 Démarrage du bot WhatsApp...');
  startExistingSessions();
  
  // Nettoyage périodique des sessions mortes
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
