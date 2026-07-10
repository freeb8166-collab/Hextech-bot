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
    // Autoriser les requêtes sans origine (Postman, curl, etc.)
    if (!origin) return callback(null, true);
    
    // En développement, tout autoriser
    if (!isProd) {
      console.log(`[CORS] Dev mode - Origin autorisée: ${origin}`);
      return callback(null, true);
    }
    
    // En production, autoriser uniquement le frontend
    const allowedOrigins = [
      frontendUrl,
      'https://ot-8roirenoir.vercel.app',
      'http://localhost:3000',
      'http://localhost:8080'
    ];
    
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] Origin autorisée: ${origin}`);
      return callback(null, true);
    }
    
    // Autoriser les requêtes depuis Railway (healthcheck, etc.)
    if (origin.includes('railway.app')) {
      console.log(`[CORS] Railway origin autorisée: ${origin}`);
      return callback(null, true);
    }
    
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

// ── STOCKAGE DES DEMANDES DE PAIRING ───────────────────────────
const pendingPairs = new Map();

// ── ROUTE PRINCIPALE ────────────────────────────────────────────
app.get('/', (req, res) => {
  try {
    res.render('index', {
      botName: config.BOT_NAME || 'DENTSU MD V9',
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
  const sessionCount = store.sessionCount();
  if (sessionCount >= config.MAX_SESSIONS) {
    console.warn(`⚠️ Limite de sessions atteinte: ${sessionCount}/${config.MAX_SESSIONS}`);
    return res.status(429).json({ 
      success: false, 
      error: `Limite de ${config.MAX_SESSIONS} sessions atteinte` 
    });
  }

  // Vérifier si le numéro est déjà connecté
  const existing = store.getSession(sanitized);
  if (existing) {
    console.log(`ℹ️ Numéro déjà connecté: ${sanitized}`);
    return res.status(409).json({ 
      success: false, 
      error: 'Ce numéro est déjà connecté au bot!' 
    });
  }

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

// ── HEALTH CHECK (POUR RAILWAY) ─────────────────────────────────
app.get('/health', (req, res) => {
  try {
    const sessionCount = store.sessionCount();
    res.status(200).json({
      status: 'ok',
      bot: config.BOT_NAME || 'DENTSU MD V9',
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

// ── PING (POUR LES MONITEURS) ──────────────────────────────────
app.get('/ping', (req, res) => {
  res.status(200).send('pong 🟢');
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

  // Gestion des erreurs du serveur
  server.on('error', (err) => {
    console.error('❌ Erreur du serveur web:', err);
  });

  return server;
}

module.exports = { startWebServer };
