const moment = require('moment-timezone');
const config = require('../config');
const os = require('os');
const fs = require('fs-extra');

function getTimestamp() {
  return moment().tz('Africa/Brazzaville').format('YYYY-MM-DD HH:mm:ss');
}

function getDate() {
  return moment().tz('Africa/Brazzaville').format('DD/MM/YYYY');
}

function getTime() {
  return moment().tz('Africa/Brazzaville').format('HH:mm:ss');
}

function getRam() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

function getUptime() {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isOwner(jid) {
  const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
  return jid === ownerJid;
}

async function countCommands() {
  try {
    const pluginsDir = require('path').join(__dirname, '../plugins');
    const files = fs.readdirSync(pluginsDir);
    let count = 0;
    for (const file of files) {
      if (file.endsWith('.js')) {
        const content = fs.readFileSync(`${pluginsDir}/${file}`, 'utf8');
        const matches = content.match(/case\s+['"][^'"]+['"]\s*:/g);
        if (matches) count += matches.length;
      }
    }
    return count;
  } catch (e) {
    return 0;
  }
}

function formatMenu(sections) {
  let out = '';
  for (const [title, cmds] of Object.entries(sections)) {
    out += `\n┌─── ${title} ───\n`;
    out += cmds.map(c => `│ ${config.PREFIX}${c}`).join('\n');
    out += '\n└──────────────────\n';
  }
  return out;
}

function getHost() {
  return process.env.RENDER_EXTERNAL_URL || os.hostname();
}

module.exports = {
  getTimestamp, getDate, getTime, getRam, getUptime,
  formatBytes, generateOTP, sleep, isOwner,
  countCommands, formatMenu, getHost
};
