const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
} = require('baileys');

// Codes qui déclenchent reconnexion (pas logout)
const RECONNECT_CODES = new Set([405, 408, 503, 428, 500, 502]);
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const store = require('./lib/store');
const { messageHandler } = require('./handlers/message');
const { setupStatusHandlers } = require('./handlers/status');

const logger = pino({ level: 'silent' });
const pendingSockets = new Map();
const msgCaches = new Map();
const watchdogs = new Map();

const FALLBACK_VERSION = [2, 3000, 1023596128];

async function getVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log('[BOT] WhatsApp version:', version.join('.'));
    return version;
  } catch (e) {
    console.log('[BOT] fetchLatestBaileysVersion failed → fallback version');
    return FALLBACK_VERSION;
  }
}

function getBrowserValue() {
  if (typeof Browsers?.macOS === 'function') return Browsers.macOS('Safari');
  if (Array.isArray(Browsers?.macOS)) return Browsers.macOS;
  return ['Ubuntu', 'Chrome', '22.0.0'];
}

function clearWatchdog(sanitized) {
  if (watchdogs.has(sanitized)) {
    clearInterval(watchdogs.get(sanitized));
    watchdogs.delete(sanitized);
  }
}

async function startSession(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(config.SESSION_BASE_PATH, sanitized);

  fs.ensureDirSync(sessionPath);
  // Note: on ne supprime jamais les fichiers de session automatiquement
  // (Render filesystem éphémère — les sessions sont dans SESSION_BASE_PATH)

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const version = await getVersion();

  const msgRetryCounterMap = new Map();
  if (!msgCaches.has(sanitized)) msgCaches.set(sanitized, new Map());
  const msgCache = msgCaches.get(sanitized);

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
    msgRetryCounterMap,
    getMessage: async (key) => {
      const cached = msgCache.get(key.id);
      if (cached) return cached;
      return { conversation: '' };
    },
  });

  pendingSockets.set(sanitized, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
    for (const m of msgs) {
      if (m.message && m.key?.id) {
        msgCache.set(m.key.id, m.message);
        if (msgCache.size > 500) {
          msgCache.delete(msgCache.keys().next().value);
        }
      }
    }
    messageHandler(sock, { messages: msgs, type }).catch(e =>
      console.error(`[${sanitized}] messageHandler error:`, e.message)
    );
  });

  setupStatusHandlers(sock);

  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      const meta = await sock.groupMetadata(id);
      for (const jid of participants) {
        const num = jid.split('@')[0];
        if (action === 'add') {
          await sock.sendMessage(id, {
            image: { url: config.MENU_IMAGE },
            caption: `╔╦══════════════════╦╗\n║║   *WELCOME* 🎉   ║║\n╚╩══════════════════╩╝\n\n👋 Welcome @${num} to *${meta.subject}*!\n\nWe're glad to have you here. Please read the group rules.\n\n_Powered by DENTSU MD V9_`,
            mentions: [jid],
          });
        } else if (action === 'remove') {
          await sock.sendMessage(id, {
            image: { url: config.MENU_IMAGE },
            caption: `╔╦══════════════════╦╗\n║║   *GOODBYE* 👋   ║║\n╚╩══════════════════╩╝\n\n😢 @${num} has left *${meta.subject}*.\n\nWe'll miss you! Come back anytime.\n\n_Powered by DENTSU MD V9_`,
            mentions: [jid],
          });
        }
      }
    } catch (e) {
      console.log(`[group-participants] Error:`, e.message);
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`[${sanitized}] ✅ Connected!`);
      pendingSockets.delete(sanitized);
      store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });

      // FIX: Annonce présence immédiatement → WhatsApp route les messages au bot dès maintenant
      try { await sock.sendPresenceUpdate('available'); } catch (_) {}

      // ── MESSAGE DE BIENVENUE (envoyé au proprio dès connexion) ──
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

• 📆DATE : ${date}
• ⌚HEURE : ${heure}
• 🤳SESSION : ${sanitized}
• 📟NUMBER : +${sanitized}
• ✍️NAMEUSER : ${pushName}
• 🚀BOT LINK : https://dentsu-md-v9.onrender.com
> BY NATSUTECH'S PROJECT 
╰───────────────────`;
          await sock.sendMessage(selfJid, { text: welcome });
        } catch (_) {}
      }, 2500);

      // ── WATCHDOG: détecte les connexions zombie ───────────────
      // Toutes les 45s, envoie un ping léger à WhatsApp.
      // Si ça échoue, la session est zombie → reconnexion forcée.
      clearWatchdog(sanitized);
      let _wdFails = 0;
      const wd = setInterval(async () => {
        if (!store.getSession(sanitized)) { clearWatchdog(sanitized); return; }
        try {
          await Promise.race([
            sock.sendPresenceUpdate('available'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
          ]);
          _wdFails = 0; // reset sur succès
        } catch (e) {
          _wdFails++;
          console.log(`[${sanitized}] ⚠️ Watchdog échec ${_wdFails}/3...`);
          if (_wdFails >= 3) {
            // 3 échecs consécutifs = zombie confirmé → reconnexion
            console.log(`[${sanitized}] 🔴 Zombie confirmé après 3 échecs, reconnexion...`);
            clearWatchdog(sanitized);
            store.deleteSession(sanitized);
            try { sock.end(new Error('watchdog')); } catch (_) {}
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
      console.log(`[${sanitized}] Connection closed. Reason: ${reason} (code: ${statusCode})`);

      clearWatchdog(sanitized);
      pendingSockets.delete(sanitized);

      if (statusCode === DisconnectReason.loggedOut) {
        store.deleteSession(sanitized);
        fs.removeSync(sessionPath);
        msgCaches.delete(sanitized);
        console.log(`[${sanitized}] Session deleted (logout)`);
      } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
        // BUG FIX: supprimer la session du store avant de reconnecter,
        // sinon reconnectSession() voit l'ancienne session morte et abandonne.
        store.deleteSession(sanitized);
        console.log(`[${sanitized}] Restart required, reconnecting in 2s...`);
        setTimeout(() => reconnectSession(sanitized), 2000);
      } else if (RECONNECT_CODES && RECONNECT_CODES.has(statusCode)) {
        store.deleteSession(sanitized);
        console.log(`[${sanitized}] Code ${statusCode} → reconnexion dans 8s...`);
        setTimeout(() => reconnectSession(sanitized), 8000);
      } else {
        store.deleteSession(sanitized);
        console.log(`[${sanitized}] Reconnecting in 5s...`);
        setTimeout(() => reconnectSession(sanitized), 5000);
      }
    }
  });

  if (!sock.authState.creds.registered) {
    await delay(3000);
    try {
      console.log(`[${sanitized}] Requesting pairing code (version ${version.join('.')})...`);
      const code = await sock.requestPairingCode(sanitized);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[${sanitized}] ✅ Code: ${formattedCode}`);

      setTimeout(() => {
        if (pendingSockets.has(sanitized)) {
          console.log(`[${sanitized}] Pairing timeout (5min), cleaning pending socket`);
          pendingSockets.delete(sanitized);
        }
      }, 5 * 60 * 1000);

      return { sock, code: formattedCode };
    } catch (err) {
      const realError = err?.message || String(err);
      console.error(`[${sanitized}] requestPairingCode error:`, realError);
      pendingSockets.delete(sanitized);
      try { sock.end(); } catch (_) {}
      throw new Error(`Pairing code failed: ${realError}`);
    }
  }

  pendingSockets.delete(sanitized);
  store.setSession(sanitized, { sock, number: sanitized, connectedAt: Date.now() });
  return { sock, code: null };
}

async function reconnectSession(sanitized) {
  const sessionPath = path.join(config.SESSION_BASE_PATH, sanitized);
  if (!fs.existsSync(sessionPath)) return;
  if (store.getSession(sanitized)) return;
  try {
    await startSession(sanitized);
  } catch (e) {
    console.error(`[${sanitized}] Reconnection error:`, e.message);
    setTimeout(() => reconnectSession(sanitized), 15000);
  }
}

async function startExistingSessions() {
  if (!fs.existsSync(config.SESSION_BASE_PATH)) return;
  const dirs = fs.readdirSync(config.SESSION_BASE_PATH).filter(d => {
    const p = path.join(config.SESSION_BASE_PATH, d);
    return fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0;
  });
  console.log(`[BOT] ${dirs.length} existing session(s) to restore`);
  for (const dir of dirs) {
    try {
      await startSession(dir);
      await delay(2000);
    } catch (e) {
      console.error(`[BOT] Session error ${dir}:`, e.message);
    }
  }
}

function startBot() {
  startExistingSessions();
}

module.exports = { startBot, startSession };
