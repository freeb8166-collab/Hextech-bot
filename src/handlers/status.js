const config = require('../config');
const { delay } = require('baileys');

async function setupStatusHandlers(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    if (message.key.remoteJid !== 'status@broadcast') return;
    if (!message.key.participant) return;

    try {
      if (config.AUTO_RECORDING) {
        await sock.sendPresenceUpdate('recording', message.key.participant);
      }

      if (config.AUTO_VIEW_STATUS) {
        let retries = config.MAX_RETRIES || 3;
        while (retries > 0) {
          try {
            await sock.readMessages([message.key]);
            break;
          } catch (e) {
            retries--;
            if (retries === 0) break;
            await delay(1000);
          }
        }
      }

      if (config.AUTO_LIKE_STATUS) {
        const emoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        let retries = config.MAX_RETRIES || 3;
        while (retries > 0) {
          try {
            await sock.sendMessage(
              message.key.remoteJid,
              { react: { text: emoji, key: message.key } },
              { statusJidList: [message.key.participant] }
            );
            break;
          } catch (e) {
            retries--;
            if (retries === 0) break;
            await delay(1000);
          }
        }
      }
    } catch (err) {
      console.error('Status handler error:', err.message);
    }
  });


}

module.exports = { setupStatusHandlers };
