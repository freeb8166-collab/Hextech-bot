// ./src/web.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Configuration CORS
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hextech-bot-8roirenoir.vercel.app';
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables partagées
app.botReady = false;
app.userSessions = new Map();
app.maxSessions = parseInt(process.env.MAX_SESSIONS) || 3;

// Fonction de génération de code (à importer du bot)
app.generatePairCode = async (phone) => {
  try {
    // Cette fonction sera remplacée par celle du bot
    return null;
  } catch (error) {
    return null;
  }
};

function startWebServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Site de couplage démarré sur le port ${PORT}`);
    console.log(`✅ CORS autorisé pour: ${FRONTEND_URL}`);
  });
  return app;
}

module.exports = { startWebServer, app };
