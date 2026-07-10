// web.js - Serveur Express complet (Frontend + Backend)
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');

// ── CONFIGURATION ──────────────────────────────────────────────
// Détection de l'environnement
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT !== undefined || process.env.RAILWAY_SERVICE_ID !== undefined;

console.log(`🔍 Environnement: ${IS_VERCEL ? 'Vercel' : IS_RAILWAY ? 'Railway' : 'Local'}`);

// ── CONFIGURATION CORS (IMPORTANT) ────────────────────────────
const allowedOrigins = [
  // Frontends Vercel
  'https://dayjugment.vercel.app',
  
  // Backend Railway
  'https://dentsu-md-v9-production-5cfd.up.railway.app',
  // Développement local
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (Postman, curl, etc.)
    if (!origin) {
      console.log('✅ CORS: Requête sans origine autorisée');
      return callback(null, true);
    }
    
    // Autoriser les origines de la liste
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS autorisé pour: ${origin}`);
      return callback(null, true);
    }
    
    // Autoriser toutes les origines contenant "railway.app" ou "vercel.app"
    if (origin.includes('railway.app') || origin.includes('vercel.app')) {
      console.log(`✅ CORS autorisé pour: ${origin}`);
      return callback(null, true);
    }
    
    // En développement, autoriser tout
    if (!IS_RAILWAY && !IS_VERCEL) {
      console.log(`✅ CORS (dev) autorisé pour: ${origin}`);
      return callback(null, true);
    }
    
    console.warn(`❌ CORS bloqué pour: ${origin}`);
    return callback(new Error(`CORS non autorisé pour ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Requested-With',
    'Origin',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  credentials: false,
  maxAge: 86400 // 24 heures
};

// ── CRÉATION DE L'APP ──────────────────────────────────────────
const app = express();

// ── MIDDLEWARES ──────────────────────────────────────────────────

// CORS (APPLIQUÉ EN PREMIER)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Logging des requêtes
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Middlewares standards
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── FICHIERS STATIQUES ──────────────────────────────────────────

// Servir les fichiers statiques depuis le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// ── CONFIGURATION DES VUES ──────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── VARIABLES D'ENVIRONNEMENT ──────────────────────────────────

const API_URL = process.env.API_URL || 'https://dentsu-md-v9-production-5cfd.up.railway.app';
const BOT_NAME = process.env.BOT_NAME || 'DENTSU MD V9';
const DEV_NAME = process.env.DEV_NAME || 'NatsuTech';
const CHANNEL_LINK = process.env.CHANNEL_LINK || '#';
const GROUP_LINK = process.env.GROUP_LINK || '#';
const TELEGRAM = process.env.TELEGRAM || '#';
const WEBSITE = process.env.WEBSITE || 'https://dentsu-md-v9-production-5cfd.up.railway.app';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 5;

// ── STOCKAGE DES DEMANDES DE PAIRING ──────────────────────────

const pendingPairs = new Map();

// ── ROUTES FRONTEND (Pages HTML) ──────────────────────────────

/**
 * Page d'accueil
 * Sert le frontend avec les variables nécessaires
 */
app.get('/', (req, res) => {
  try {
    res.render('index', {
      API_URL: API_URL,
      botName: BOT_NAME,
      devName: DEV_NAME,
      channelLink: CHANNEL_LINK,
      groupLink: GROUP_LINK,
      telegram: TELEGRAM,
      website: WEBSITE,
      maxSessions: MAX_SESSIONS,
      // Statut des sessions (si disponible)
      sessions: 0 // Sera mis à jour si store est chargé
    });
  } catch (err) {
    console.error('❌ Erreur render index:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Erreur</title></head>
      <body>
        <h1>⚠️ Erreur serveur</h1>
        <p>Une erreur est survenue lors du chargement de la page.</p>
        <p><a href="/">Réessayer</a></p>
      </body>
      </html>
    `);
  }
});

/**
 * Healthcheck - Pour Railway et Vercel
 * Répond immédiatement pour éviter les timeouts
 */
app.get('/health', (req, res) => {
  try {
    let sessionCount = 0;
    // Charger le store si disponible
    try {
      const store = require('./lib/store');
      sessionCount = store.sessionCount();
    } catch (_) {}
    
    res.status(200).json({
      status: 'ok',
      bot: BOT_NAME,
      environment: IS_RAILWAY ? 'Railway' : IS_VERCEL ? 'Vercel' : 'Local',
      sessions: sessionCount,
      maxSessions: MAX_SESSIONS,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Erreur healthcheck:', err);
    res.status(500).json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Ping - Pour les moniteurs (UptimeRobot, etc.)
 */
app.get('/ping', (req, res) => {
  res.status(200).send('pong 🟢');
});

// ── ROUTES API (Backend) ───────────────────────────────────────

// Vérifier si les modules backend sont disponibles
let backendAvailable = false;
try {
  require.resolve('./bot');
  require.resolve('./lib/store');
  require.resolve('./config');
  backendAvailable = true;
  console.log('✅ Modules backend chargés avec succès');
} catch (err) {
  console.warn('⚠️ Modules backend non disponibles (mode frontend uniquement)');
}

// Charger les modules backend si disponibles
let startSession, store, config;
if (backendAvailable) {
  try {
    startSession = require('./bot').startSession;
    store = require('./lib/store');
    config = require('./config');
    console.log('✅ Backend initialisé');
  } catch (err) {
    console.warn('⚠️ Erreur chargement backend:', err.message);
    backendAvailable = false;
  }
}

/**
 * API: Demander un code de couplage
 * POST /pair
 */
app.post('/pair', async (req, res) => {
  // Si backend non disponible
  if (!backendAvailable || !startSession) {
    return res.status(503).json({
      success: false,
      error: 'Service temporairement indisponible. Veuillez réessayer plus tard.'
    });
  }

  let { number } = req.body;
  
  console.log(`📱 Demande de code pour: ${number}`);
  
  if (!number) {
    return res.status(400).json({
      success: false,
      error: 'Numéro requis'
    });
  }

  // Nettoyer le numéro (garder uniquement les chiffres)
  const sanitized = number.replace(/[^0-9]/g, '');

  // Validation
  if (sanitized.length < 7 || sanitized.length > 15) {
    return res.status(400).json({
      success: false,
      error: 'Numéro invalide. Exemple: 242065121108'
    });
  }

  // Vérifier la limite de sessions
  try {
    const sessionCount = store.sessionCount();
    if (sessionCount >= (config.MAX_SESSIONS || MAX_SESSIONS)) {
      return res.status(429).json({
        success: false,
        error: `Limite de ${config.MAX_SESSIONS || MAX_SESSIONS} sessions atteinte`
      });
    }
  } catch (_) {}

  // Vérifier si le numéro est déjà connecté
  try {
    const existing = store.getSession(sanitized);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Ce numéro est déjà connecté au bot!'
      });
    }
  } catch (_) {}

  // Empêcher les doublons de demande
  if (pendingPairs.has(sanitized)) {
    const remaining = pendingPairs.get(sanitized);
    if (remaining > 0) {
      return res.status(429).json({
        success: false,
        error: `Attends ${Math.ceil(remaining/1000)} secondes avant de réessayer.`
      });
    }
    pendingPairs.delete(sanitized);
  }

  // Enregistrer la demande avec un timeout de 60 secondes
  pendingPairs.set(sanitized, 60000);
  const timeoutId = setTimeout(() => {
    pendingPairs.delete(sanitized);
  }, 60000);

  try {
    console.log(`🔄 Génération du code pour ${sanitized}...`);
    const result = await startSession(sanitized);

    if (result && result.code) {
      console.log(`✅ Code généré pour ${sanitized}: ${result.code}`);
      
      // Nettoyer la demande
      clearTimeout(timeoutId);
      pendingPairs.delete(sanitized);
      
      return res.status(200).json({
        success: true,
        code: result.code,
        message: 'Code généré avec succès!'
      });
    }

    // Si le numéro est déjà connecté
    if (result && result.code === null) {
      clearTimeout(timeoutId);
      pendingPairs.delete(sanitized);
      
      return res.status(200).json({
        success: true,
        code: null,
        message: 'Numéro déjà connecté!'
      });
    }

    throw new Error('Échec de la génération du code');

  } catch (err) {
    // Nettoyer
    clearTimeout(timeoutId);
    pendingPairs.delete(sanitized);
    
    const raw = err.message || String(err);
    console.error(`❌ Erreur pour ${sanitized}:`, raw);

    // Traduire les erreurs
    let errorMsg = raw;
    if (raw.toLowerCase().includes('timed out') || raw.toLowerCase().includes('timeout')) {
      errorMsg = '⏰ Délai dépassé. Vérifie ta connexion internet et réessaie.';
    } else if (raw.toLowerCase().includes('rate-limit') || raw.toLowerCase().includes('429')) {
      errorMsg = '🚦 Trop de demandes. Attends 2 minutes et réessaie.';
    } else if (raw.toLowerCase().includes('not registered') || raw.toLowerCase().includes('404')) {
      errorMsg = '❌ Ce numéro n\'est pas enregistré sur WhatsApp.';
    } else if (raw.toLowerCase().includes('connection closed')) {
      errorMsg = '🔌 Connexion perdue. Redémarre le bot et réessaie.';
    } else if (raw.toLowerCase().includes('unauthorized') || raw.toLowerCase().includes('401')) {
      errorMsg = '🔑 Erreur d\'autorisation. Contacte l\'administrateur.';
    } else if (raw.toLowerCase().includes('invalid')) {
      errorMsg = '⚠️ Numéro invalide. Vérifie le format.';
    }

    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
});

/**
 * API: Status des sessions
 * GET /status
 */
app.get('/status', (req, res) => {
  if (!backendAvailable || !store) {
    return res.status(200).json({
      success: true,
      sessions: [],
      count: 0,
      max: MAX_SESSIONS,
      message: 'Mode frontend uniquement'
    });
  }

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
      max: config.MAX_SESSIONS || MAX_SESSIONS,
      uptime: process.uptime(),
      environment: IS_RAILWAY ? 'Railway' : IS_VERCEL ? 'Vercel' : 'Local'
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
  if (req.accepts('html')) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 - Page non trouvée</title></head>
      <body style="font-family:system-ui;text-align:center;padding:50px;background:#0a0a0f;color:#e0e0e0;">
        <h1 style="color:#00ff88;">🚀 DENTSU MD V9</h1>
        <h2>404 - Page non trouvée</h2>
        <p>La page que vous cherchez n'existe pas.</p>
        <p><a href="/" style="color:#00ff88;">Retour à l'accueil</a></p>
      </body>
      </html>
    `);
  } else {
    res.status(404).json({
      success: false,
      error: 'Route non trouvée'
    });
  }
});

// ── GESTION DES ERREURS ────────────────────────────────────────

// Erreur 500
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur',
    message: err.message
  });
});

// ── FONCTION DE DÉMARRAGE ──────────────────────────────────────

function startWebServer() {
  const PORT = process.env.PORT || 3000;
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log(`║   🌐 Serveur web démarré sur le port ${PORT}             ║`);
    console.log(`║   🔗 URL: http://localhost:${PORT}                      ║`);
    console.log(`║   📦 Mode: ${IS_RAILWAY ? 'Railway (Complet)' : IS_VERCEL ? 'Vercel (Frontend)' : 'Local (Complet)'}`);
    console.log(`║   📱 Backend: ${backendAvailable ? '✅ Disponible' : '❌ Non disponible'}`);
    console.log(`║   🚀 Prêt à générer des codes de couplage!              ║`);
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    
    // Afficher les routes disponibles
    console.log('📋 Routes disponibles:');
    console.log(`  GET  /          → Page d'accueil`);
    console.log(`  GET  /health    → Healthcheck`);
    console.log(`  GET  /ping      → Ping`);
    console.log(`  POST /pair      → Générer un code de couplage`);
    console.log(`  GET  /status    → Status des sessions`);
    console.log(`  GET  /static/*  → Fichiers statiques`);
    console.log('\n');
  });

  server.on('error', (err) => {
    console.error('❌ Erreur du serveur web:', err);
  });

  return server;
}

// ── EXPORT ──────────────────────────────────────────────────────

// Pour Vercel: exporter l'app (sans app.listen)
if (IS_VERCEL) {
  console.log('🌐 Mode Vercel - Exportation de l\'app');
  module.exports = app;
} else {
  // Pour Railway et local: exporter la fonction de démarrage
  module.exports = { startWebServer };
}
