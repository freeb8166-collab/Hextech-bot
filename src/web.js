const express = require('express');
const path = require('path');
const { startSession } = require('./bot');
const store = require('./lib/store');
const config = require('./config');

const cors = require('cors');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────
// Requiert FRONTEND_URL en production. Accepte toutes origines uniquement
// si NODE_ENV !== 'production' (dev local uniquement).
const rawOrigins = process.env.FRONTEND_URL;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !rawOrigins) {
  console.warn('[CORS] ⚠ FRONTEND_URL non défini en production — CORS restreint aux requêtes same-origin uniquement.');
}

const allowedOrigins = rawOrigins
  ? rawOrigins.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const corsOptions = {
  origin: (origin, cb) => {
    // Pas d'origine = requête same-origin ou curl/Postman : toujours autorisé
    if (!origin) return cb(null, true);
    // En dev sans FRONTEND_URL : accepte tout (debug)
    if (!isProd && allowedOrigins.length === 0) return cb(null, true);
    // Vérifie l'origine
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin non autorisée : ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // politique uniforme pour les preflight

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../website/views'));
app.use(express.static(path.join(__dirname, '../website/public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Garder les requêtes de pairing en cours (éviter les doublons)
const pendingPairs = new Set();

// ── Page principale ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('index', {
    botName: config.BOT_NAME,
    devName: config.DEV_NAME,
    menuImage: config.MENU_IMAGE,
    channelLink: config.CHANNEL_LINK,
    groupLink: config.GROUP_LINK,
    telegram: config.TELEGRAM,
    website: config.WEBSITE,
    sessions: store.sessionCount(),
    maxSessions: config.MAX_SESSIONS,
  });
});

// ── Demander un code de jumelage ───────────────────────────────────
app.post('/pair', async (req, res) => {
  let { number } = req.body;
  if (!number) return res.json({ success: false, error: 'Numéro requis' });

  const sanitized = number.replace(/[^0-9]/g, '');

  if (sanitized.length < 7 || sanitized.length > 15) {
    return res.json({ success: false, error: 'Numéro invalide. Exemple: 242065121108' });
  }

  if (store.sessionCount() >= config.MAX_SESSIONS) {
    return res.json({ success: false, error: `Limite de ${config.MAX_SESSIONS} sessions atteinte` });
  }

  const existing = store.getSession(sanitized);
  if (existing) {
    return res.json({ success: false, error: 'Ce numéro est déjà connecté au bot!' });
  }

  if (pendingPairs.has(sanitized)) {
    return res.json({ success: false, error: 'Une demande est déjà en cours pour ce numéro. Attends 30 secondes.' });
  }

  pendingPairs.add(sanitized);

  try {
    const { code } = await startSession(sanitized);

    if (code) {
      setTimeout(() => pendingPairs.delete(sanitized), 60000);
      return res.json({
        success: true,
        code,
        message: `Entre ce code dans WhatsApp :\nParamètres → Appareils liés → Lier un appareil → Code de jumelage`,
      });
    }

    pendingPairs.delete(sanitized);
    return res.json({ success: true, code: null, message: 'Numéro déjà connecté!' });

  } catch (err) {
    pendingPairs.delete(sanitized);
    const raw = err.message || String(err);
    console.error(`[WEB] Pair error ${sanitized}:`, raw);

    // Traduction des erreurs connues en messages clairs
    let errorMsg = raw;

    if (raw.includes('timed out') || raw.includes('timeout')) {
      errorMsg = 'Délai dépassé. Vérifie ta connexion internet et réessaie.';
    } else if (raw.includes('rate-limit') || raw.includes('429') || raw.includes('rate limit')) {
      errorMsg = 'Trop de demandes. Attends 2 minutes et réessaie.';
    } else if (raw.includes('not registered') || raw.includes('404') || raw.includes('not-registered')) {
      errorMsg = 'Ce numéro n\'est pas enregistré sur WhatsApp.';
    } else if (raw.includes('Connection Closed') || raw.includes('connection closed')) {
      errorMsg = 'Connexion perdue. Redémarre le bot et réessaie.';
    } else if (raw.includes('Unauthorized') || raw.includes('401')) {
      errorMsg = 'Erreur d\'autorisation. Supprime le dossier session et redémarre.';
    } else if (raw.includes('Stream Errored') || raw.includes('stream')) {
      errorMsg = 'Erreur de flux WhatsApp. Attends 30s et réessaie.';
    }

    return res.json({ success: false, error: errorMsg });
  }
});

// ── Status ─────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const sessions = store.getAllSessions().map(([num]) => ({
    number: num.slice(0, 3) + '***' + num.slice(-3),
    connected: true,
  }));
  res.json({ sessions, count: sessions.length, max: config.MAX_SESSIONS });
});

// ── Ping (UptimeRobot / BetterUptime / Cron-job.org) ──────────────
app.get('/ping', (req, res) => {
  res.status(200).send('pong 🟢');
});

// ── Healthcheck Render ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: config.BOT_NAME,
    sessions: store.sessionCount(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

function startWebServer() {
  const PORT = process.env.PORT || config.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌐 Site de couplage démarré sur le port ${PORT}`);
    console.log(`📱 Ouvre le site et entre ton numéro WhatsApp pour obtenir le code\n`);
  });
}

module.exports = { startWebServer };
