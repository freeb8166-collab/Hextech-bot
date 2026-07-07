const config = require('../config');
const { getContentType } = require('baileys');
const { getTime, getDate, getRam, getUptime } = require('../lib/utils');
const { isOwner } = require('../lib/utils');
const { handleCommand } = require('../commands');

const NO_PREFIX_CMDS = new Set(['menu','help','aide','start','bot','commandes']);

function getMentionedJids(rawMsg) {
  const paths = [
    rawMsg?.extendedTextMessage?.contextInfo?.mentionedJid,
    rawMsg?.imageMessage?.contextInfo?.mentionedJid,
    rawMsg?.videoMessage?.contextInfo?.mentionedJid,
    rawMsg?.audioMessage?.contextInfo?.mentionedJid,
    rawMsg?.documentMessage?.contextInfo?.mentionedJid,
    rawMsg?.stickerMessage?.contextInfo?.mentionedJid,
  ];
  for (const jids of paths) {
    if (Array.isArray(jids) && jids.length > 0) return jids;
  }
  return [];
}

async function messageHandler(sock, { messages, type }) {
  if (type !== 'notify') return;
  const msg = messages[0];
  if (!msg?.message) return;
  if (!sock.user) return;

  const from = msg.key.remoteJid;
  if (!from) return;
  if (from === 'status@broadcast') return;

  const isGroup   = from.endsWith('@g.us');
  const botNumber = sock.user.id.split(':')[0];
  const botFullJid = botNumber + '@s.whatsapp.net';

  const sender = isGroup
    ? (msg.key.fromMe ? botFullJid : (msg.key.participant || from))
    : (msg.key.fromMe ? botFullJid : from);
  const senderNumber = sender?.split('@')[0];

  const rawMsg = msg.message?.ephemeralMessage?.message
    || msg.message?.viewOnceMessage?.message
    || msg.message?.viewOnceMessageV2?.message?.message
    || msg.message?.documentWithCaptionMessage?.message
    || msg.message;

  // ── Mention detection ────────────────────────────────────────
  const mentionedJids = getMentionedJids(rawMsg);
  const isMentioned = mentionedJids.some(j =>
    j === botFullJid ||
    j === botNumber + '@s.whatsapp.net' ||
    j.startsWith(botNumber + ':')
  );

  if (isMentioned) {
    sock.sendMessage(from, {
      audio: { url: 'https://files.catbox.moe/nacq93.mp3' },
      mimetype: 'audio/mpeg',
      ptt: true,
    }, { quoted: msg }).catch(e => {
      console.error('[MENTION] Erreur audio:', e.message);
    });
  }

  const mtype = getContentType(rawMsg);
  const body =
    mtype === 'conversation'                 ? rawMsg.conversation
    : mtype === 'imageMessage'               ? rawMsg.imageMessage?.caption || ''
    : mtype === 'videoMessage'               ? rawMsg.videoMessage?.caption || ''
    : mtype === 'extendedTextMessage'        ? rawMsg.extendedTextMessage?.text || ''
    : mtype === 'buttonsResponseMessage'     ? rawMsg.buttonsResponseMessage?.selectedButtonId || ''
    : mtype === 'listResponseMessage'        ? rawMsg.listResponseMessage?.singleSelectReply?.selectedRowId || ''
    : mtype === 'templateButtonReplyMessage' ? rawMsg.templateButtonReplyMessage?.selectedId || ''
    : mtype === 'interactiveResponseMessage'
        ? (() => { try { return JSON.parse(rawMsg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}').id || ''; } catch { return ''; } })()
        : '';

  // Fallback mention via texte (vieux clients WhatsApp)
  if (!isMentioned && body && body.includes(`@${botNumber}`)) {
    sock.sendMessage(from, {
      audio: { url: 'https://files.catbox.moe/nacq93.mp3' },
      mimetype: 'audio/mpeg',
      ptt: true,
    }, { quoted: msg }).catch(() => {});
  }

  if (!body) return;

  const PREFIXES = config.PREFIXES || ['.', '!', '/', '#', '$'];
  let usedPrefix = '', command = '', args = [];
  for (const p of PREFIXES) {
    if (body.startsWith(p)) {
      usedPrefix = p;
      const parts = body.slice(p.length).trim().split(/\s+/);
      command = (parts.shift() || '').toLowerCase();
      args = parts;
      break;
    }
  }
  if (!command) {
    const lw = body.trim().toLowerCase();
    if (NO_PREFIX_CMDS.has(lw)) { command = lw; usedPrefix = ''; args = []; }
  }
  if (!command) return;

  const text = args.join(' ');

  // ── AUTO TYPING: affiche "en train d'écrire..." pendant le traitement ──
  try {
    await sock.sendPresenceUpdate('composing', from);
  } catch (_) {}

  const reply = async (content) => {
    if (typeof content === 'string') return sock.sendMessage(from, { text: content }, { quoted: msg });
    return sock.sendMessage(from, content, { quoted: msg });
  };
  const sendImage = async (url, caption = '') =>
    sock.sendMessage(from, { image: { url }, caption }, { quoted: msg });

  const ctx = {
    sock, msg, from, sender, senderNumber, isGroup,
    args, text, reply, sendImage,
    command, prefix: usedPrefix || config.PREFIX, botNumber,
    isOwner: isOwner(sender),
  };

  try {
    if (NO_PREFIX_CMDS.has(command)) {
      await sendMainMenu(ctx);
    } else {
      const handled = await handleCommand(ctx);
      if (handled === false) {
        await reply(`❌ Unknown command *${command}*.\nType *.menu* to see all commands.`);
      }
    }
  } catch (err) {
    console.error(`[CMD:${command}]`, err.message);
    try { await reply(`⚠️ Error in *${command}*: ${err.message}`); } catch (_) {}
  } finally {
    // Arrête le "en train d'écrire..." après la réponse
    sock.sendPresenceUpdate('paused', from).catch(() => {});
  }
}

async function sendMainMenu(ctx) {
  const { sock, from, msg, sender, senderNumber } = ctx;

  // 🚀 Réaction uniquement sur le menu
  sock.sendMessage(from, { react: { text: '🚀', key: msg.key } }).catch(() => {});

  const P = config.PREFIX;
  const caption =
`『 *DENTSU MD V9* 』
────────────────────────────
⁍ *Bot:* DENTSU MD
⁍ *Version:* V9
⁍ *Date:* ${getDate()}
⁍ *Time:* ${getTime()}
⁍ *User:* @${senderNumber}
⁍ *Mode:* ${(config.MODE || 'public').toUpperCase()}
⁍ *Ram:* ${getRam()}
⁍ *Host:* dentsu-md-v9.onrender.com
────────────────────────────

【 👥 GROUP MENU 】
⁍ ${P}tagall
⁍ ${P}tagadmins
⁍ ${P}tag
⁍ ${P}hidetag
⁍ ${P}opengc
⁍ ${P}closegc
⁍ ${P}kickall
⁍ ${P}kickall2
⁍ ${P}kick
⁍ ${P}add
⁍ ${P}promote
⁍ ${P}demote
⁍ ${P}mute
⁍ ${P}unmute
⁍ ${P}grouplink
⁍ ${P}resetlink
⁍ ${P}listadmin
⁍ ${P}listonline
⁍ ${P}opentime
⁍ ${P}closetime
⁍ ${P}antilink
⁍ ${P}warn
⁍ ${P}warncount
⁍ ${P}warnreset
⁍ ${P}groupinfo
⁍ ${P}desc
⁍ ${P}subject
⁍ ${P}join
⁍ ${P}left
⁍ ${P}creategroup
⁍ ${P}setgpp
⁍ ${P}everyone
⁍ ${P}announce
⁍ ${P}hijack

【 👑 OWNER MENU 】
⁍ ${P}setpp
⁍ ${P}setname
⁍ ${P}setbio
⁍ ${P}getpp
⁍ ${P}block
⁍ ${P}unblock
⁍ ${P}ban
⁍ ${P}unban
⁍ ${P}delete
⁍ ${P}vv
⁍ ${P}vv2
⁍ ${P}broadcast
⁍ ${P}addsudo
⁍ ${P}delsudo
⁍ ${P}listsudo
⁍ ${P}public
⁍ ${P}self
⁍ ${P}ping
⁍ ${P}alive
⁍ ${P}runtime
⁍ ${P}jid
⁍ ${P}idch
⁍ ${P}pair
⁍ ${P}qc

【 🧠 AI MENU 】
⁍ ${P}ai
⁍ ${P}gpt
⁍ ${P}gpt4
⁍ ${P}gpt5
⁍ ${P}metaai
⁍ ${P}deepseek
⁍ ${P}gemini
⁍ ${P}qwen
⁍ ${P}codeai
⁍ ${P}storyai
⁍ ${P}aiimg
⁍ ${P}photoai

【 🎉 FUN MENU 】
⁍ ${P}joke
⁍ ${P}dadjoke
⁍ ${P}truth
⁍ ${P}dare
⁍ ${P}8ball
⁍ ${P}ship
⁍ ${P}roast
⁍ ${P}compliment
⁍ ${P}advice
⁍ ${P}quote
⁍ ${P}funfact
⁍ ${P}meme
⁍ ${P}coin
⁍ ${P}dice
⁍ ${P}urban
⁍ ${P}inspire
⁍ ${P}ascii

【 🎮 GAME MENU 】
⁍ ${P}rps
⁍ ${P}rpsls
⁍ ${P}guess
⁍ ${P}numbattle
⁍ ${P}trivia
⁍ ${P}hangman
⁍ ${P}tictactoe

【 📥 DOWNLOADER MENU 】
⁍ ${P}tt / ${P}tiktok
⁍ ${P}ytb / ${P}youtube
⁍ ${P}ytmp3 / ${P}play
⁍ ${P}yts
⁍ ${P}fb
⁍ ${P}insta
⁍ ${P}apk
⁍ ${P}shorturl
⁍ ${P}catbox

【 ✨ EPHOTO MENU 】
⁍ ${P}glitchtext
⁍ ${P}writetext
⁍ ${P}advancedglow
⁍ ${P}typographytext
⁍ ${P}pixelglitch
⁍ ${P}neonglitch
⁍ ${P}flagtext
⁍ ${P}flag3dtext
⁍ ${P}deletingtext
⁍ ${P}blackpinkstyle
⁍ ${P}glowingtext
⁍ ${P}underwatertext
⁍ ${P}logomaker
⁍ ${P}cartoonstyle
⁍ ${P}papercutstyle
⁍ ${P}watercolortext
⁍ ${P}effectclouds
⁍ ${P}blackpinklogo
⁍ ${P}gradienttext
⁍ ${P}summerbeach
⁍ ${P}luxurygold
⁍ ${P}multicoloredneon
⁍ ${P}sandsummer
⁍ ${P}galaxywallpaper
⁍ ${P}style1917
⁍ ${P}makingneon
⁍ ${P}royaltext
⁍ ${P}freecreate
⁍ ${P}galaxystyle
⁍ ${P}createlogo
⁍ ${P}lighteffects

【 ♉ LOGO MENU 】
⁍ ${P}gfx
⁍ ${P}gfx2
⁍ ${P}gfx3
⁍ ${P}gfx4
⁍ ${P}gfx5
⁍ ${P}gfx6
⁍ ${P}gfx7
⁍ ${P}gfx8
⁍ ${P}gfx9
⁍ ${P}gfx10
⁍ ${P}gfx11
⁍ ${P}gfx12

【 🎵 AUDIO EFFECTS 】
⁍ ${P}bass
⁍ ${P}blown
⁍ ${P}deep
⁍ ${P}earrape
⁍ ${P}fast
⁍ ${P}nightcore
⁍ ${P}reverse
⁍ ${P}robot
⁍ ${P}slow
⁍ ${P}smooth
⁍ ${P}squirrel
⁍ ${P}say / ${P}tts

【 🐾 MEDIA MENU 】
⁍ ${P}sticker / ${P}s
⁍ ${P}toimg
⁍ ${P}getpp
⁍ ${P}setgpp
⁍ ${P}cat
⁍ ${P}dog
⁍ ${P}fox
⁍ ${P}bird
⁍ ${P}panda
⁍ ${P}waifu
⁍ ${P}neko
⁍ ${P}maid
⁍ ${P}kitsune
⁍ ${P}rwaifu

────────────────────────────
🌐 *Website* → dentsu-md-v9.onrender.com
📋 *Prefix* → ${P}
> _Powered by DENTSU MD V9 🤖_`;

  try {
    await sock.sendMessage(from, {
      image: { url: config.MENU_IMAGE },
      caption,
      mentions: [sender],
    }, { quoted: msg });
  } catch (_) {
    await sock.sendMessage(from, { text: caption, mentions: [sender] }, { quoted: msg });
  }
}

module.exports = { messageHandler, sendMainMenu };
