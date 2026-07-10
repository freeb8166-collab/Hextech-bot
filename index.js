// index.js - Point d'entrée principal
const { startWebServer } = require('./web');
const { startBot } = require('./bot');

console.log('╔═══════════════════════════════════════════════╗');
console.log('║   🚀 mortal MD V9 - WhatsApp Bot            ║');
console.log('║   📱 Démarrage en cours...                  ║');
console.log('╚═══════════════════════════════════════════════╝');

// Lancer le bot WhatsApp
startBot();

// Lancer le serveur web
startWebServer();

// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
