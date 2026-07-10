// index.js - Fichier hybride pour Railway et Vercel
const express = require('express');
const path = require('path');

// ── DÉTECTION DE L'ENVIRONNEMENT ──────────────────────────────────
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT !== undefined || process.env.RAILWAY_SERVICE_ID !== undefined;

console.log(`🔍 Environnement: ${IS_VERCEL ? 'Vercel' : IS_RAILWAY ? 'Railway' : 'Local'}`);

// ── CRÉATION DE L'APP EXPRESS ────────────────────────────────────
const app = express();

// ── CONFIGURATION COMMUNE (Frontend + API) ──────────────────────

// Configuration des vues (pour le frontend)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware pour les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// URL de l'API (pour le frontend)
const API_URL = process.env.API_URL || 'https://dentsu-md-v9-production-5cfd.up.railway.app';

// ── ROUTES FRONTEND (Pages HTML) ────────────────────────────────

// Page d'accueil
app.get('/', (req, res) => {
  try {
    res.render('index', {
      API_URL: API_URL,
      botName: 'DENTSU MD V9',
      devName: 'NatsuTech',
      channelLink: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/...',
      groupLink: process.env.GROUP_LINK || 'https://chat.whatsapp.com/...',
      telegram: process.env.TELEGRAM || 'https://t.me/...',
      website: process.env.WEBSITE || 'https://dentsu-md-v9-production-5cfd.up.railway.app',
      maxSessions: parseInt(process.env.MAX_SESSIONS) || 5
    });
  } catch (err) {
    console.error('❌ Erreur render:', err);
    res.status(500).send('Erreur serveur');
  }
});

// Healthcheck (commun)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    platform: IS_VERCEL ? 'Vercel' : IS_RAILWAY ? 'Railway' : 'Local',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── ROUTES API (Uniquement sur Railway) ─────────────────────────

// Si on est sur Railway ou en local, charger les modules backend
if (IS_RAILWAY || !IS_VERCEL) {
  console.log('📦 Chargement des modules backend...');
  
  try {
    // Import des modules backend (seulement sur Railway)
    const { startSession } = require('./bot');
    const store = require('./lib/store');
    const config = require('./config');
    const pendingPairs = new Map();

    // ── API: Demander un code de couplage ──────────────────────
    app.post('/pair', async (req, res) => {
      let { number } = req.body;
      
      console.log(`📱 Demande de code pour: ${number}`);
      
      if (!number) {
        return res.status(400).json({ success: false, error: 'Numéro requis' });
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
          console.log(`✅ Code généré: ${result.code}`);
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
        console.error(`❌ Erreur:`, err.message);
        return res.status(500).json({ 
          success: false, 
          error: err.message || 'Erreur inconnue'
        });
      }
    });

    // ── API: Status ──────────────────────────────────────────────
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
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ── API: Ping ──────────────────────────────────────────────────
    app.get('/ping', (req, res) => {
      res.status(200).send('pong 🟢');
    });

    console.log('✅ Routes API backend chargées');

  } catch (err) {
    console.warn('⚠️ Modules backend non disponibles (mode Vercel):', err.message);
  }
} else {
  // Mode Vercel: routes simplifiées
  console.log('🌐 Mode Vercel - Routes API désactivées');
  
  // Sur Vercel, /pair redirige vers le backend Railway
  app.post('/pair', (req, res) => {
    res.status(501).json({
      success: false,
      error: 'Cette fonction est disponible sur le backend Railway',
      backend_url: API_URL
    });
  });
}

// ── ROUTE 404 ──────────────────────────────────────────────────────
app.use('*', (req, res) => {
  if (req.accepts('html')) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>404 - Page non trouvée</title></head>
      <body>
        <h1>🚀 DENTSU MD V9</h1>
        <p>La page que vous cherchez n'existe pas.</p>
        <p><a href="/">Retour à l'accueil</a></p>
      </body>
      </html>
    `);
  } else {
    res.status(404).json({ success: false, error: 'Route non trouvée' });
  }
});

// ── DÉMARRAGE (UNIQUEMENT SUR RAILWAY / LOCAL) ──────────────────

// Si on est sur Railway ou en local, démarrer le serveur
if (IS_RAILWAY || !IS_VERCEL) {
  const PORT = process.env.PORT || 3000;
  
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log(`║   🌐 Serveur démarré sur le port ${PORT}         ║`);
    console.log(`║   🔗 URL: http://localhost:${PORT}              ║`);
    console.log(`║   📦 Mode: ${IS_RAILWAY ? 'Railway' : 'Local'}              ║`);
    console.log('╚═══════════════════════════════════════════════╝');
  });

  // Démarrer le bot (seulement sur Railway)
  if (IS_RAILWAY) {
    try {
      const { startBot } = require('./bot');
      console.log('🤖 Démarrage du bot WhatsApp...');
      startBot();
    } catch (err) {
      console.warn('⚠️ Bot non disponible:', err.message);
    }
  }

  // Export pour les tests
  module.exports = server;
} else {
  // Sur Vercel: exporter l'app (sans app.listen)
  console.log('🌐 Mode Vercel - Exportation de l\'app');
  module.exports = app;
}
