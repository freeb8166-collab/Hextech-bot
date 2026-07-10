require('dotenv').config();
const { startBot } = require('./src/bot');
const { startWebServer } = require('./src/web');

console.log(`
╔═══════════════════════════════════════╗
║       DENTSU MD V9 - Natsu Tech       ║
║    Multi-Session WhatsApp Bot v9.0    ║
╚═══════════════════════════════════════╝
`);

// ==================== DÉMARRAGE ====================

// Démarrer le BOT en premier
console.log('🚀 Démarrage du bot...');
startBot().then(() => {
  console.log('✅ Bot initialisé');
}).catch((error) => {
  console.error('❌ Erreur démarrage bot:', error.message);
});

// Démarrer le serveur web après un court délai
setTimeout(() => {
  console.log('🌐 Démarrage du serveur web...');
  startWebServer();
}, 2000);

// ==================== GESTION DES ERREURS ====================
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non capturée:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesse rejetée:', reason);
});
