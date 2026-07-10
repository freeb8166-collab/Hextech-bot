// web.js - Serveur web Express
const express = require('express');
const path = require('path');
const cors = require('cors');
const { startSession } = require('./bot');
const store = require('./lib/store');
const config = require('./config');

const app = express();

// ── CONFIGURATION CORS (CORRIGÉE) ──────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL || 'https://ot-8roirenoir.vercel.app';

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (!isProd) return callback(null, true);
    
    const allowedOrigins = [
      frontendUrl,
      'https://ot-8roirenoir.vercel.app',
      'http://localhost:3000',
      'http://localhost:8080'
    ];
    
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.includes('railway.app')) return callback(null, true);
    
    console.warn(`[CORS] Origin non autorisée: ${origin}`);
    return callback(new Error(`CORS non autorisé pour ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
  credentials: false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── MIDDLEWARES ──────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'website/views'));
app.use(express.static(path.join(__dirname, 'website/public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── LOGGER ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ════════════════════════════════════════════════════════════════
// ⚠️ HEALTHCHECK - DOIT ÊTRE LA PREMIÈRE ROUTE DÉFINIE
// ════════════════════════════════════════════════════════════════

// ✅ Healthcheck RAPIDE - Répond IMMÉDIATEMENT
app.get('/health', (req, res) => {
  try {
    const sessionCount = store.sessionCount();
    res.status(200).json({
      status: 'ok',
      bot: config.BOT_NAME || 'DOOMSDAY MD V9',
      sessions: sessionCount,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('❌ Erreur health:', err);
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

// ✅ Ping rapide
app.get('/ping', (req, res) => {
  res.status(200).send('pong 🟢');
});

// ── STOCKAGE DES DEMANDES DE PAIRING ───────────────────────────
const pendingPairs = new Map();

// ── ROUTE PRINCIPALE ────────────────────────────────────────────
app.get('/', (req, res) => {
  try {
    res.render('index', {
      botName: config.BOT_NAME || 'DOOMSDAY MD V9',
      devName: config.DEV_NAME || 'NatsuTech',
      menuImage: config.MENU_IMAGE || 'https://i.ibb.co/xxx/menu.jpg',
      channelLink: config.CHANNEL_LINK || '#',
      groupLink: config.GROUP_LINK || '#',
      telegram: config.TELEGRAM || '#',
      website: config.WEBSITE || '#',
      sessions: store.sessionCount(),
      maxSessions: config.MAX_SESSIONS || 5,
    });
  } catch (err) {
    console.error('❌ Erreur render index:', err);
    res.status(500).send('Erreur serveur');
  }
});

// ── DEMANDER UN CODE DE COUPLAGE ──────────────────────────────
app.post('/pair', async (req, res) => {
  let { number } = req.body;
  
  console.log(`📱 Demande de code pour: ${number}`);
  
  if (!number) {
    return res.status(400).json({ 
      success: false, 
      error: 'Numéro requis' 
    });
  }

  const sanitized = number.replace(/[^0-9]/g, '');

  if (sanitized.length < 7 || sanitized.length > 15) {
    return res.status(400).json({ 
      success: false, 
      error: 'Numéro invalide. Exemple: 242065121108' 
    });
  }

  const sessionCount = store.sessionCount();
  if (sessionCount >= config.MAX_SESSIONS) {
    return res.status(429).json({ 
      success: false, 
      error: `Limite de ${config.MAX_SESSIONS} sessions atteinte` 
    });
  }

  const existing = store.getSession(sanitized);
  if (existing) {
    return res.status(409).json({ 
      success: false, 
      error: 'Ce numéro est déjà connecté au bot!' 
    });
  }

  if (pendingPairs.has(sanitized)) {
    return res.status(429).json({ 
      success: false, 
      error: 'Une demande est déjà en cours. Attends 30 secondes.' 
    });
  }

  pendingPairs.set(sanitized, Date.now());

  try {
    console.log(`🔄 Génération du code pour ${sanitized}...`);
    const result = await startSession(sanitized);

    if (result && result.code) {
      console.log(`✅ Code généré pour ${sanitized}: ${result.code}`);
      pendingPairs.delete(sanitized);
      
      return res.status(200).json({
        success: true,
        code: result.code,
        message: 'Code généré avec succès!'
      });
    }

    pendingPairs.delete(sanitized);
    return res.status(200).json({
      success: true,
      code: null,
      message: 'Numéro déjà connecté!'
    });

  } catch (err) {
    pendingPairs.delete(sanitized);
    const raw = err.message || String(err);
    console.error(`❌ Erreur pour ${sanitized}:`, raw);

    let errorMsg = raw;
    if (raw.toLowerCase().includes('timed out') || raw.toLowerCase().includes('timeout')) {
      errorMsg = '⏰ Délai dépassé. Vérifie ta connexion.';
    } else if (raw.toLowerCase().includes('rate-limit') || raw.toLowerCase().includes('429')) {
      errorMsg = '🚦 Trop de demandes. Attends 2 minutes.';
    } else if (raw.toLowerCase().includes('not registered') || raw.toLowerCase().includes('404')) {
      errorMsg = '❌ Ce numéro n\'est pas enregistré sur WhatsApp.';
    } else if (raw.toLowerCase().includes('connection closed')) {
      errorMsg = '🔌 Connexion perdue. Réessaie.';
    }

    return res.status(500).json({ 
      success: false, 
      error: errorMsg 
    });
  }
});

// ── STATUS DES SESSIONS ─────────────────────────────────────────
app.get('/status', (req, res) => {
  try {
    const allSessions = store.getAllSessions();
    const sessions = allSessions.map(([num]) => ({
      number: num.slice(0, 3) + '***' + num.slice(-3),
      connected: true,
    }));
    
    res.json({
      success: true,
      sessions,
      count: sessions.length,
      max: config.MAX_SESSIONS,
      uptime: process.uptime(),
    });
  } catch (err) {
    console.error('❌ Erreur status:', err);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du status'
    });
  }
});

// ── ROUTE 404 ────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée'
  });
});

// ── FONCTION DE DÉMARRAGE ───────────────────────────────────────
function startWebServer() {
  const PORT = process.env.PORT || config.PORT || 3000;
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log(`║   🌐 Serveur web démarré sur le port ${PORT}      ║`);
    console.log(`║   🔗 URL: http://localhost:${PORT}               ║`);
    console.log(`║   📱 Prêt à générer des codes de couplage!      ║`);
    console.log('╚═══════════════════════════════════════════════╝\n');
  });

  server.on('error', (err) => {
    console.error('❌ Erreur du serveur web:', err);
  });

  return server;
}

module.exports = { startWebServer };
