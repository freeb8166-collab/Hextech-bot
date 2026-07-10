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
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    botReady: isBotReady(),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

/**
 * Route de statut - Informations détaillées
 * GET /status
 */
app.get('/status', (req, res) => {
  const config = getConfig();
  const sessions = getSessions();
  res.json({
    status: 'online',
    botReady: isBotReady(),
    sessions: sessions.size,
    maxSessions: config.maxSessions || 3,
    uptime: Math.floor(process.uptime()),
    version: '9.0.0',
    owner: config.ownerNumber
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
 * GET /sessions
 * Header: Authorization: Bearer <token>
 */
app.get('/sessions', (req, res) => {
  // Vérification basique du propriétaire via un header
  const auth = req.headers.authorization;
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
      code: data.code || null,
      isOwner: data.isOwner || false
    });
  }
  
  res.json({
    success: true,
    sessions: sessionList,
    total: sessions.size,
    max: getConfig().maxSessions || 3
  });
});

/**
 * Route /sessions/:number - Supprimer une session
 * DELETE /sessions/:number
 * Header: Authorization: Bearer <token>
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
 * Route /config - Récupère la configuration (réservé au propriétaire)
 * GET /config
 */
app.get('/config', (req, res) => {
  const auth = req.headers.authorization;
  const ownerToken = process.env.OWNER_TOKEN || 'secret';
  
  if (!auth || auth !== `Bearer ${ownerToken}`) {
    return res.status(401).json({
      success: false,
      error: 'Non autorisé'
    });
  }
  
  const config = getConfig();
  res.json({
    success: true,
    config: {
      prefix: config.prefix,
      ownerNumber: config.ownerNumber,
      botPublic: config.botPublic,
      maxSessions: config.maxSessions,
      fakeRecording: config.fakeRecording,
      fakeTyping: config.fakeTyping,
      antiLink: config.antiLink,
      channelLink: config.channelLink
    }
  });
});

/**
 * Route par défaut - Sert l'interface de couplage
 * GET /
 */
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DENTSU MD V9 - API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #0a0f1e; color: #fff; }
        h1 { color: #00d4ff; }
        .card { background: #1a1f2e; padding: 20px; border-radius: 10px; margin: 10px 0; border: 1px solid #2a2f3e; }
        code { background: #2a2f3e; padding: 2px 8px; border-radius: 4px; color: #00d4ff; }
        .status { color: #4caf50; font-weight: bold; }
        .error { color: #f44336; }
        .endpoint { color: #ff9800; }
    </style>
</head>
<body>
    <h1>🚀 DENTSU MD V9 API</h1>
    <div class="card">
        <p><span class="status">✅ Serveur en ligne</span></p>
        <p>🤖 Bot: <span class="${isBotReady() ? 'status' : 'error'}">${isBotReady() ? 'CONNECTÉ' : 'DÉCONNECTÉ'}</span></p>
        <p>📊 Sessions: ${getSessions().size}/${getConfig().maxSessions || 3}</p>
    </div>
    <div class="card">
        <h3>📌 Endpoints disponibles</h3>
        <p><span class="endpoint">POST</span> <code>/pair</code> - Générer un code de pairage</p>
        <p><span class="endpoint">GET</span> <code>/health</code> - Vérifier l'état du serveur</p>
        <p><span class="endpoint">GET</span> <code>/status</code> - Statut détaillé du bot</p>
        <p><span class="endpoint">GET</span> <code>/sessions</code> - Liste des sessions (auth requise)</p>
        <p><span class="endpoint">DELETE</span> <code>/sessions/:number</code> - Supprimer une session (auth requise)</p>
        <p><span class="endpoint">GET</span> <code>/config</code> - Configuration du bot (auth requise)</p>
    </div>
    <div class="card">
        <h3>📱 Frontend</h3>
        <p>🔗 <a href="${FRONTEND_URL}" style="color: #00d4ff;">${FRONTEND_URL}</a></p>
        <p>🔗 Canal: <a href="${getConfig().channelLink}" style="color: #00d4ff;">${getConfig().channelLink}</a></p>
    </div>
    <div style="margin-top: 20px; color: #666; font-size: 12px;">
        <p>HEXGATE V3 - Multi-Session WhatsApp Bot v9.0</p>
        <p>powered by Natsu Tech 🇨🇩</p>
    </div>
</body>
</html>
  `);
});

/**
 * Route 404 - Page non trouvée
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    availableRoutes: ['/health', '/status', '/pair', '/sessions', '/config', '/']
  });
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
    console.log(`✅ Routes disponibles: /health, /status, /pair, /sessions, /config`);
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
