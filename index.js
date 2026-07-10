// index.js - Point d'entrée principal
const { startWebServer } = require('./web');
const { startBot } = require('./bot');

console.log('╔═══════════════════════════════════════════════╗');
console.log('║   🚀 DOOMSDAY MD V9 - WhatsApp Bot          ║');
console.log('║   📱 Démarrage en cours...                  ║');
console.log('╚═══════════════════════════════════════════════╝');

// ⚠️ CRITIQUE: Démarrer le serveur web EN PREMIER
// pour que Railway voie le healthcheck immédiatement
console.log('🌐 Démarrage du serveur web...');
const server = startWebServer();

// Puis démarrer le bot en arrière-plan
console.log('🤖 Démarrage du bot WhatsApp...');
startBot();

// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export du serveur pour les tests
module.exports = server;
