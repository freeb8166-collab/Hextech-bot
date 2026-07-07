// Store en mémoire pour les sessions actives
const activeSessions = new Map();    // number -> { socket, createdAt }
const otpStore = new Map();          // number -> { otp, expiry }
const warnStore = new Map();         // jid -> count
const antiLinkStore = new Map();     // groupJid -> bool
const antiDeleteStore = new Map();   // groupJid -> bool

function getSession(number) {
  return activeSessions.get(number);
}

function setSession(number, data) {
  activeSessions.set(number, { ...data, createdAt: Date.now() });
}

function deleteSession(number) {
  activeSessions.delete(number);
}

function getAllSessions() {
  return [...activeSessions.entries()];
}

function sessionCount() {
  return activeSessions.size;
}

function setOTP(number, otp) {
  otpStore.set(number, { otp, expiry: Date.now() + 300000 });
}

function verifyOTP(number, otp) {
  const entry = otpStore.get(number);
  if (!entry) return false;
  if (Date.now() > entry.expiry) { otpStore.delete(number); return false; }
  if (entry.otp === otp) { otpStore.delete(number); return true; }
  return false;
}

module.exports = {
  getSession, setSession, deleteSession, getAllSessions, sessionCount,
  setOTP, verifyOTP, warnStore, antiLinkStore, antiDeleteStore
};
