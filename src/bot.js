// ═══════════════════════════════════════════════════════════════
// 📦 BOT.JS - HEXGATE V3 - WhatsApp Bot Multi-Sessions
// ═══════════════════════════════════════════════════════════════

const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadContentFromMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  delay,
  getContentType
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// ==================== COULEURS ====================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// ==================== CONFIGURATION ====================
const config = {
  prefix: ",",
  ownerNumber: "243819069962",
  botPublic: true,
  fakeRecording: false,
  fakeTyping: false,
  antiLink: false,
  alwaysOnline: true,
  logLevel: "silent",
  maxSessions: 3,
  botImageUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcScDteMn6Vx9AffrVZG2S7NDAPotzYSzqILpbhc6GpqwYoTh1jQX-mobTYA&s=10",
  channelLink: "https://whatsapp.com/channel/0029VbBQb5b4Y9lwZ27BCn0o",
  autoJoinGroup: "https://chat.whatsapp.com/Dn9AwwsTtaFG4Z0giysIVJ",
  autoJoinChannel: "https://whatsapp.com/channel/0029VbBQb5b4Y9lwZ27BCn0o"
};

// ==================== VARIABLES ====================
let sock = null;
let botReady = false;
let botStartTime = Date.now();
let isConnecting = false;
let pairingAttempted = false;
const userSessions = new Map();
const MAX_SESSIONS = config.maxSessions || 3;

// ==================== FONCTION PRINCIPALE ====================

async function startBot() {
  if (isConnecting) {
    console.log(`${colors.yellow}⚠️ Connexion déjà en cours...${colors.reset}`);
    return;
  }
  
  isConnecting = true;
  pairingAttempted = false;
  
  try {
    console.log(`${colors.cyan}🚀 Démarrage du bot...${colors.reset}`);
    console.log(`${colors.cyan}📱 Utilisation du code de couplage (pas de QR)${colors.reset}`);
    
    // Supprimer l'ancienne session si elle existe pour forcer un nouveau code
    const authFolder = "auth_info_baileys";
    if (fs.existsSync(authFolder)) {
      console.log(`${colors.yellow}⚠️ Suppression de l'ancienne session pour forcer le code...${colors.reset}`);
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      logger: P({ level: config.logLevel }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: config.alwaysOnline,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    // ========== GÉNÉRATION FORCÉE DU CODE ==========
    // On génère le code immédiatement après la création du socket
    setTimeout(async () => {
      if (!pairingAttempted) {
        pairingAttempted = true;
        const ownerNumber = config.ownerNumber.replace(/\D/g, '');
        
        try {
          console.log(`${colors.cyan}⏳ Génération du code de couplage pour +${ownerNumber}...${colors.reset}`);
          
          // Attendre que le socket soit prêt
          await delay(3000);
          
          const code = await sock.requestPairingCode(ownerNumber);
          
          if (code) {
            console.log(`
${colors.green}╔══════════════════════════════════════════════════════════════════╗
║                    ✅ CODE DE COUPLAGE                                 ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  📱 Numéro: +${ownerNumber}                                             ║
║  🔑 Code: ${code}                                              ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════╣
║  📱 Entrez ce code dans WhatsApp :                                  ║
║  WhatsApp > Appareils liés > Lier un appareil                      ║
║  > "Lier avec un numéro de téléphone"                             ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════╝${colors.reset}
`);
            
            userSessions.set(ownerNumber, {
              number: ownerNumber,
              createdAt: Date.now(),
              code: code,
              isOwner: true
            });
            
            console.log(`${colors.green}✅ Code généré avec succès !${colors.reset}`);
            console.log(`${colors.yellow}⏳ En attente de la connexion WhatsApp...${colors.reset}`);
            
          } else {
            console.log(`${colors.red}❌ Échec génération du code${colors.reset}`);
          }
          
        } catch (pairError) {
          console.log(`${colors.red}❌ Erreur pairage: ${pairError.message}${colors.reset}`);
          console.log(`${colors.yellow}💡 Vérifiez le numéro: +${ownerNumber}${colors.reset}`);
          pairingAttempted = false;
          
          // Réessayer après 10s
          setTimeout(() => {
            pairingAttempted = false;
          }, 10000);
        }
      }
    }, 2000);

    // ========== GESTION DE LA CONNEXION ==========
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === "close") {
        const reason = new Error(lastDisconnect?.error)?.output?.statusCode;
        botReady = false;
        isConnecting = false;
        
        if (reason === DisconnectReason.loggedOut) {
          console.log(`${colors.red}❌ Déconnecté, nettoyage...${colors.reset}`);
          exec("rm -rf auth_info_baileys", () => {
            pairingAttempted = false;
            setTimeout(startBot, 3000);
          });
        } else {
          console.log(`${colors.yellow}⚠️ Reconnexion dans 5s...${colors.reset}`);
          setTimeout(startBot, 5000);
        }
        return;
      }
      
      if (connection === "open") {
        console.log(`
${colors.green}╔══════════════════════════════════════════════════════════════════╗
║                    ✅ BOT CONNECTÉ !                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  WhatsApp connecté avec succès !                                 ║
║  Bot prêt à l'emploi !                                           ║
║  📊 Sessions: ${userSessions.size}/${MAX_SESSIONS}                                 ║
╚══════════════════════════════════════════════════════════════════╝${colors.reset}
`);
        botReady = true;
        isConnecting = false;
        botStartTime = Date.now();
        
        await sendMessageToOwner(`✅ *HEXGATE V3 EN LIGNE*

🚀 Bot prêt à l'emploi !
📊 Commandes disponibles
🔗 Canal: ${config.channelLink}
📱 Sessions: ${userSessions.size}/${MAX_SESSIONS}`);
      }
    });

    // ==================== TRAITEMENT DES MESSAGES ====================
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message) return;
      
      const from = msg.key.remoteJid;
      let sender = msg.key.participant || msg.key.remoteJid;
      
      if (sender && sender.includes(':')) sender = sender.split(':')[0];
      
      const isOwner = sender === `${config.ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`;
      const messageType = Object.keys(msg.message)[0];
      
      if (sock.user && sender === sock.user.id) return;
      if (messageType === "protocolMessage") return;
      
      let body = "";
      if (messageType === "conversation") body = msg.message.conversation;
      else if (messageType === "extendedTextMessage") body = msg.message.extendedTextMessage.text;
      else if (messageType === "imageMessage") body = msg.message.imageMessage?.caption || "";
      else if (messageType === "videoMessage") body = msg.message.videoMessage?.caption || "";
      else return;
      
      if (!body.startsWith(config.prefix)) return;
      
      const args = body.slice(config.prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();
      
      console.log(`${colors.cyan}📨 Commande reçue: ${command}${colors.reset}`);
      await executeCommand(command, sock, msg, args, { isOwner, sender });
    });
    
    // ==================== ÉVÉNEMENTS GROUPE ====================
    sock.ev.on("group-participants.update", async (update) => {
      if (update.action !== "add") return;
      
      const groupJid = update.id;
      const newMember = update.participants[0];
      const memberName = newMember.split("@")[0];
      
      await sendWithButtons(sock, groupJid, 
        `👋 *BIENVENUE ${memberName}*

📢 Canal: ${config.channelLink}
> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`,
        [newMember]
      );
    });
    
    return sock;
    
  } catch (error) {
    console.log(`${colors.red}❌ Erreur démarrage bot: ${error.message}${colors.reset}`);
    isConnecting = false;
    botReady = false;
    setTimeout(startBot, 5000);
    return null;
  }
}

// ==================== COMMANDES ====================

async function executeCommand(command, sock, msg, args, context) {
  const from = msg.key.remoteJid;
  
  switch (command) {
    case 'ping':
      const start = Date.now();
      await simulateTyping(sock, from);
      const latency = Date.now() - start;
      await sendWithButtons(sock, from, 
        `🏓 *PONG!*\n\n📡 Latence: ${latency}ms\n🤖 Bot: ${botReady ? '✅ En ligne' : '⏳ En attente...'}\n⏰ Uptime: ${Math.floor((Date.now() - botStartTime) / 1000)}s\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`
      );
      break;
    
    case 'status':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      await sendWithButtons(sock, from, `
📊 *STATUT DU BOT*

🏷️ Nom: HEXGATE V3
🟢 Statut: ${botReady ? 'CONNECTÉ ✅' : 'DÉCONNECTÉ ❌'}
📊 Sessions: ${userSessions.size}/${MAX_SESSIONS}
⏰ Uptime: ${Math.floor((Date.now() - botStartTime) / 1000)}s
🎤 Fake Recording: ${config.fakeRecording ? 'ON' : 'OFF'}
✍️ Fake Typing: ${config.fakeTyping ? 'ON' : 'OFF'}
🔗 Canal: ${config.channelLink}
> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`);
      break;
    
    case 'fakerecording':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      const recState = args[0]?.toLowerCase();
      if (recState === 'on') {
        config.fakeRecording = true;
        await sendWithButtons(sock, from, "🎤 *Fake Recording ACTIVÉ*");
      } else if (recState === 'off') {
        config.fakeRecording = false;
        await sendWithButtons(sock, from, "🎤 *Fake Recording DÉSACTIVÉ*");
      } else {
        await sendWithButtons(sock, from, "❌ Usage: .fakerecording on/off");
      }
      break;
    
    case 'faketyping':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      const typeState = args[0]?.toLowerCase();
      if (typeState === 'on') {
        config.fakeTyping = true;
        await sendWithButtons(sock, from, "✍️ *Fake Typing ACTIVÉ*");
      } else if (typeState === 'off') {
        config.fakeTyping = false;
        await sendWithButtons(sock, from, "✍️ *Fake Typing DÉSACTIVÉ*");
      } else {
        await sendWithButtons(sock, from, "❌ Usage: .faketyping on/off");
      }
      break;
    
    case 'public':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      config.botPublic = true;
      await sendWithButtons(sock, from, "🌐 *MODE PUBLIC ACTIVÉ*");
      break;
    
    case 'private':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      config.botPublic = false;
      await sendWithButtons(sock, from, "🔒 *MODE PRIVÉ ACTIVÉ*");
      break;
    
    case 'pair':
      if (!args[0]) {
        await sendWithButtons(sock, from, 
          `🔐 *COMMANDE .PAIR*\n\nUtilisation: .pair [numéro]\n\nExemple: .pair 243XXXXXXXXX\n\n📊 Sessions: ${userSessions.size}/${MAX_SESSIONS}\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`
        );
        return;
      }
      
      if (!botReady) {
        await sendWithButtons(sock, from, "⏳ *Bot en cours de connexion...*\n\nVeuillez patienter.\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩");
        return;
      }
      
      if (userSessions.size >= MAX_SESSIONS) {
        await sendWithButtons(sock, from, `⚠️ *LIMITE ATTEINTE*\n\nMaximum ${MAX_SESSIONS} sessions.\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`);
        return;
      }
      
      const phoneNumber = args[0].replace(/\D/g, '');
      
      if (userSessions.has(phoneNumber)) {
        await sendWithButtons(sock, from, `⚠️ Session déjà existante pour +${phoneNumber}`);
        return;
      }
      
      try {
        await sendWithButtons(sock, from, `⏳ Génération du code pour +${phoneNumber}...`);
        const code = await sock.requestPairingCode(phoneNumber);
        
        if (code) {
          userSessions.set(phoneNumber, { number: phoneNumber, createdAt: Date.now() });
          await sendWithButtons(sock, from, 
            `🔐 *CODE DE CONNEXION*\n\n✅ Code généré pour +${phoneNumber}\n📱 Code: *${code}*\n\n⚠️ Entrez ce code dans WhatsApp > Appareils liés > Lier un appareil\n\n📊 Sessions: ${userSessions.size}/${MAX_SESSIONS}\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`
          );
          console.log(`${colors.green}✅ Code généré pour ${phoneNumber}${colors.reset}`);
        } else {
          await sendWithButtons(sock, from, "❌ Erreur: Impossible de générer le code.");
        }
      } catch (error) {
        await sendWithButtons(sock, from, `❌ *ERREUR*\n\n${error.message}\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`);
      }
      break;
    
    case 'menu':
    case 'help':
      await sendWithButtons(sock, from, `
┏━━❖ ＡＲＣＡＮＥ ❖━━┓
┃ 🛡️ HEX✦GATE V3
┃ 👨‍💻 Dev: @${config.ownerNumber}
┗━━━━━━━━━━━━━━━━

╭━━〔 COMMANDES 〕━━┈⊷
┃✰│➫ ${config.prefix}ping - Test
┃✰│➫ ${config.prefix}status - Statut
┃✰│➫ ${config.prefix}menu - Menu
┃✰│➫ ${config.prefix}pair [numéro]
┃✰│➫ ${config.prefix}fakerecording on/off
┃✰│➫ ${config.prefix}faketyping on/off
┃✰│➫ ${config.prefix}public / private
┃✰│➫ ${config.prefix}sessions
┃✰│➫ ${config.prefix}removesession [numéro]
╰━━━━━━━━━━━━━━━┈⊷

🔗 Canal: ${config.channelLink}
> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`, [], config.botImageUrl);
      break;
    
    case 'sessions':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      let sessionList = `📊 *SESSIONS ACTIVES*\n\n📌 Total: ${userSessions.size}/${MAX_SESSIONS}\n\n`;
      if (userSessions.size === 0) {
        sessionList += "Aucune session active.";
      } else {
        let i = 1;
        for (const [id, data] of userSessions.entries()) {
          sessionList += `${i}. 📱 +${id}\n   ⏰ ${new Date(data.createdAt).toLocaleString()}\n\n`;
          i++;
        }
      }
      sessionList += `\n> 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 𝐻𝐸𝑋𝑇𝐸𝐶𝐻 🇨🇩`;
      await sendWithButtons(sock, from, sessionList);
      break;
    
    case 'removesession':
      if (!context.isOwner) {
        await sendWithButtons(sock, from, "❌ Commande réservée au propriétaire");
        return;
      }
      if (!args[0]) {
        await sendWithButtons(sock, from, "❌ Usage: .removesession [numéro]");
        return;
      }
      const sessionId = args[0].replace(/\D/g, '');
      if (!userSessions.has(sessionId)) {
        await sendWithButtons(sock, from, `❌ Aucune session pour +${sessionId}`);
        return;
      }
      userSessions.delete(sessionId);
      await sendWithButtons(sock, from, `✅ Session supprimée pour +${sessionId}\n\n📊 Restant: ${userSessions.size}/${MAX_SESSIONS}`);
      break;
    
    default:
      break;
  }
}

// ==================== FONCTIONS UTILITAIRES ====================

async function simulateTyping(sock, jid) {
  if (config.fakeTyping) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await delay(Math.floor(Math.random() * 2000) + 500);
      await sock.sendPresenceUpdate('paused', jid);
    } catch (error) {}
  }
}

async function simulateRecording(sock, jid) {
  if (config.fakeRecording) {
    try {
      await sock.sendPresenceUpdate('recording', jid);
      await delay(Math.floor(Math.random() * 5000) + 2000);
      await sock.sendPresenceUpdate('available', jid);
    } catch (error) {}
  }
}

async function sendWithButtons(sock, jid, text, mentions = [], imageUrl = null) {
  try {
    const finalImageUrl = imageUrl || config.botImageUrl;
    const finalMentions = mentions || [];
    const ownerJid = `${config.ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`;
    if (!finalMentions.includes(ownerJid)) {
      finalMentions.push(ownerJid);
    }
    
    const content = {
      image: { url: finalImageUrl },
      caption: text,
      mentions: finalMentions,
      contextInfo: {
        forwardingScore: 2,
        isForwarded: true
      }
    };
    
    return await sock.sendMessage(jid, content);
  } catch (error) {
    return await sock.sendMessage(jid, { text });
  }
}

async function sendMessageToOwner(text) {
  try {
    if (!sock) return;
    const ownerJid = `${config.ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`;
    await sendWithButtons(sock, ownerJid, text);
  } catch (error) {}
}

function isBotReady() {
  return botReady;
}

async function generatePairCode(phone) {
  if (!sock || !botReady) {
    throw new Error('Bot pas encore prêt');
  }
  const cleanPhone = phone.replace(/\D/g, '');
  return await sock.requestPairingCode(cleanPhone);
}

function getSessions() {
  return userSessions;
}

function getConfig() {
  return config;
}

function waitForBotReady(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (botReady) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Timeout: Bot pas prêt après ' + timeout + 'ms'));
      }
    }, 1000);
  });
}

// ==================== EXPORTS ====================
module.exports = {
  startBot,
  isBotReady,
  generatePairCode,
  getSessions,
  getConfig,
  waitForBotReady,
  bot: sock,
  botReady
};
