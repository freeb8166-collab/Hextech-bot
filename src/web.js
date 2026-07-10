// ═══════════════════════════════════════════════════════════════
// 🌐 WEB.JS - Serveur Express pour le couplage
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { 
  isBotReady, 
  generatePairCode, 
  getSessions, 
  getConfig,
  waitForBotReady 
} = require('./bot');

// ==================== CONFIGURATION ====================
const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hextech-bot-8roirenoir.vercel.app';

// ==================== MIDDLEWARES ====================
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

/**
 * Route de santé - Vérifie que le serveur est en ligne
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    botReady: isBotReady(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Route de statut - Informations détaillées
 */
app.get('/status', (req, res) => {
  const config = getConfig();
  res.json({
    status: 'online',
    botReady: isBotReady(),
    sessions: getSessions().size,
    maxSessions: config.maxSessions || 3,
    uptime: Math.floor(process.uptime()),
    version: '3.0.0'
  });
});

/**
 * Route /pair - Génération du code de pairage
 * POST /pair
 * Body: { "number": "243819069962" }
 */
app.post('/pair', async (req, res) => {
  const startTime = Date.now();
  const { number } = req.body;

  // --- Validation des entrées ---
  if (!number) {
    return res.status(400).json({
      success: false,
      error: 'Numéro de téléphone requis'
    });
  }

  const cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.length < 9) {
    return res.status(400).json({
      success: false,
      error: 'Numéro invalide (minimum 9 chiffres)'
    });
  }

  console.log(`📱 Demande de pairage pour: ${cleanNumber}`);

  // --- Vérification du bot ---
  // 1. Si le bot n'est pas prêt, on attend jusqu'à 30 secondes
  if (!isBotReady()) {
    console.log(`⏳ Bot pas prêt, attente de connexion...`);
    try {
      await waitForBotReady(30000);
      console.log(`✅ Bot prêt après attente`);
    } catch (timeoutError) {
      console.log(`❌ Timeout: Bot pas prêt après 30s`);
      return res.status(503).json({
        success: false,
        error: 'Bot pas encore prêt, veuillez réessayer dans quelques secondes'
      });
    }
  }

  // 2. Double vérification
  if (!isBotReady()) {
    return res.status(503).json({
      success: false,
      error: 'Bot pas encore prêt, veuillez réessayer'
    });
  }

  // --- Vérification des sessions ---
  const sessions = getSessions();
  const config = getConfig();
  const MAX_SESSIONS = config.maxSessions || 3;

  if (sessions.size >= MAX_SESSIONS) {
    return res.status(429).json({
      success: false,
      error: `Limite de ${MAX_SESSIONS} sessions atteinte`
    });
  }

  if (sessions.has(cleanNumber)) {
    return res.status(409).json({
      success: false,
      error: `Session déjà existante pour +${cleanNumber}`
    });
  }

  // --- Génération du code ---
  try {
    console.log(`🔐 Génération du code pour ${cleanNumber}...`);
    const code = await generatePairCode(cleanNumber);
    
    if (code) {
      // Stocker la session
      sessions.set(cleanNumber, {
        number: cleanNumber,
        createdAt: Date.now(),
        code: code
      });
      
      console.log(`✅ Code généré pour ${cleanNumber}: ${code} (${Date.now() - startTime}ms)`);
      
      res.json({
        success: true,
        code: code,
        message: 'Code généré avec succès',
        sessionsUsed: sessions.size,
        maxSessions: MAX_SESSIONS
      });
    } else {
      console.log(`❌ Échec génération pour ${cleanNumber}`);
      res.status(500).json({
        success: false,
        error: 'Impossible de générer le code'
      });
    }
  } catch (error) {
    console.error(`❌ Erreur /pair: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur interne du serveur'
    });
  }
});

/**
 * Route /sessions - Liste des sessions (réservé au propriétaire)
 */
app.get('/sessions', (req, res) => {
  // Vérification basique du propriétaire via un header
  const auth = req.headers.authorization;
  const config = getConfig();
  const ownerToken = process.env.OWNER_TOKEN || 'secret';
  
  if (!auth || auth !== `Bearer ${ownerToken}`) {
    return res.status(401).json({
      success: false,
      error: 'Non autorisé'
    });
  }
  
  const sessions = getSessions();
  const sessionList = [];
  
  for (const [id, data] of sessions.entries()) {
    sessionList.push({
      number: id,
      createdAt: data.createdAt,
      code: data.code || null
    });
  }
  
  res.json({
    success: true,
    sessions: sessionList,
    total: sessions.size,
    max: config.maxSessions || 3
  });
});

/**
 * Route /sessions/:number - Supprimer une session
 */
app.delete('/sessions/:number', (req, res) => {
  const auth = req.headers.authorization;
  const ownerToken = process.env.OWNER_TOKEN || 'secret';
  
  if (!auth || auth !== `Bearer ${ownerToken}`) {
    return res.status(401).json({
      success: false,
      error: 'Non autorisé'
    });
  }
  
  const number = req.params.number.replace(/\D/g, '');
  const sessions = getSessions();
  
  if (!sessions.has(number)) {
    return res.status(404).json({
      success: false,
      error: `Session +${number} non trouvée`
    });
  }
  
  sessions.delete(number);
  res.json({
    success: true,
    message: `Session +${number} supprimée`
  });
});

/**
 * Route par défaut - Sert l'interface de couplage
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== DÉMARRAGE ====================

let server = null;

function startWebServer() {
  if (server) {
    console.log('⚠️ Serveur déjà démarré');
    return app;
  }
  
  server = app.listen(PORT, () => {
    console.log(`✅ Site de couplage démarré sur le port ${PORT}`);
    console.log(`✅ CORS autorisé pour: ${FRONTEND_URL}`);
    console.log(`✅ Routes disponibles: /health, /status, /pair, /sessions`);
  });
  
  return app;
}

function stopWebServer() {
  if (server) {
    server.close(() => {
      console.log('🛑 Serveur web arrêté');
      server = null;
    });
  }
}

// ==================== EXPORTS ====================
module.exports = {
  app,
  startWebServer,
  stopWebServer
};
