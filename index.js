require('dotenv').config();
const { startBot } = require('./src/bot');
const { startWebServer, app } = require('./src/web');

console.log(`
╔═══════════════════════════════════════╗
║       DOOMSDAY MD V9 - Natsu Tech       ║
║    Multi-Session WhatsApp Bot v9.0    ║
╚═══════════════════════════════════════╝
`);

// Démarrer le serveur web (site de couplage)
const webApp = startWebServer();

// ==================== ROUTE /pair ====================
// Cette route est utilisée par le frontend pour générer un code de pairage
webApp.post('/pair', async (req, res) => {
  try {
    const { number } = req.body;
    
    if (!number) {
      return res.status(400).json({ 
        success: false, 
        error: 'Numéro de téléphone requis' 
      });
    }
    
    // Nettoyer le numéro
    const cleanNumber = number.replace(/\D/g, '');
    
    if (cleanNumber.length < 9) {
      return res.status(400).json({ 
        success: false, 
        error: 'Numéro invalide (minimum 9 chiffres)' 
      });
    }
    
    console.log(`📱 Demande de pairage pour: ${cleanNumber}`);
    
    // Vérifier si le bot est prêt
    if (!webApp.botReady) {
      return res.status(503).json({ 
        success: false, 
        error: 'Bot pas encore prêt, veuillez réessayer' 
      });
    }
    
    // Générer le code de pairage
    const code = await webApp.generatePairCode(cleanNumber);
    
    if (code) {
      res.json({ 
        success: true, 
        code: code,
        message: 'Code généré avec succès'
      });
      console.log(`✅ Code généré pour ${cleanNumber}: ${code}`);
    } else {
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

// ==================== ROUTE /health ====================
// Route de santé pour vérifier que le serveur est en ligne
webApp.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    botReady: webApp.botReady || false,
    timestamp: new Date().toISOString()
  });
});

// ==================== ROUTE /status ====================
// Route pour vérifier le statut du bot
webApp.get('/status', (req, res) => {
  res.json({ 
    status: 'online',
    botReady: webApp.botReady || false,
    sessions: webApp.userSessions ? webApp.userSessions.size : 0,
    maxSessions: webApp.maxSessions || 3
  });
});

console.log('✅ Serveur démarré avec les routes /pair, /health et /status');
console.log('🔗 Frontend autorisé:', process.env.FRONTEND_URL || 'https://hextech-bot-8roirenoir.vercel.app');

// Les sessions bot sont gérées via le site web
