import { useState, useEffect, useRef } from 'react';
import { translations, langMeta } from './i18n.js';

const API_URL = import.meta.env.VITE_API_URL || '';
if (!import.meta.env.VITE_API_URL) {
  console.warn('[DENTSU] VITE_API_URL non défini — les appels API échoueront en production. Ajoute-le dans les variables Vercel.');
}
const BOT_NAME = import.meta.env.VITE_BOT_NAME || 'DENTSU MD V9';
const DEV_NAME = import.meta.env.VITE_DEV_NAME || 'Natsu Tech';
const BOT_IMAGE = import.meta.env.VITE_BOT_IMAGE || 'https://files.catbox.moe/uwcemj.jpg';
const CHANNEL_LINK = import.meta.env.VITE_CHANNEL_LINK || 'https://whatsapp.com/channel/0029VbC1s7fFnSz1YhZYc01h';
const GROUP_LINK = import.meta.env.VITE_GROUP_LINK || 'https://chat.whatsapp.com/GtXASqDdchAFvEJ95cQQ0F';
const TELEGRAM = import.meta.env.VITE_TELEGRAM || 'https://t.me/Natsu_or_Dentsu';
const MAX_SESSIONS = parseInt(import.meta.env.VITE_MAX_SESSIONS || '50');

function FlagImg({ code, size = 24 }) {
  const h = size === 24 ? 18 : 36;
  const w = size === 24 ? 32 : 48;
  return (
    <img
      src={`https://flagcdn.com/${w}x${h}/${code}.png`}
      alt={code}
      width={w}
      height={h}
      style={{ borderRadius: 3, objectFit: 'cover' }}
    />
  );
}

function WaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 2.822.736 5.474 2.027 7.773L0 32l8.476-2.003A15.94 15.94 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.27 13.27 0 01-6.773-1.853l-.487-.29-5.027 1.187 1.253-4.893-.32-.507A13.267 13.267 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667c7.363 0 13.333 5.97 13.333 13.333 0 7.363-5.97 13.333-13.333 13.333zm7.307-9.947c-.4-.2-2.367-1.167-2.733-1.3-.367-.133-.633-.2-.9.2-.267.4-1.033 1.3-1.267 1.567-.233.267-.467.3-.867.1-.4-.2-1.687-.623-3.213-1.98-1.187-1.057-1.987-2.363-2.22-2.763-.233-.4-.025-.617.175-.817.18-.18.4-.467.6-.7.2-.233.267-.4.4-.667.133-.267.067-.5-.033-.7-.1-.2-.9-2.167-1.233-2.967-.325-.78-.655-.673-.9-.685-.233-.012-.5-.015-.767-.015s-.7.1-1.067.5c-.367.4-1.4 1.367-1.4 3.333s1.433 3.867 1.633 4.133c.2.267 2.82 4.307 6.833 6.04 4.013 1.733 4.013 1.155 4.733 1.083.72-.073 2.367-.967 2.7-1.9.333-.933.333-1.733.233-1.9-.1-.167-.367-.267-.767-.467z"/>
    </svg>
  );
}

function TgIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
      <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm7.9 10.933l-2.693 12.694c-.2.893-.727 1.113-1.473.693l-4.08-3.007-1.967 1.893c-.22.22-.4.4-.813.4l.287-4.147 7.507-6.78c.327-.293-.073-.453-.507-.16L9.22 17.4l-4-1.253c-.867-.273-.88-.867.187-1.287l15.6-6.013c.72-.267 1.353.16 1.12 1.087h-.227z"/>
    </svg>
  );
}

export default function App() {
  const [lang, setLang] = useState('fr');
  const [showLangOverlay, setShowLangOverlay] = useState(true);
  const [step, setStep] = useState('form'); // form | loading | success | error
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [particles, setParticles] = useState([]);
  const inputRef = useRef(null);

  const t = translations[lang] || translations.fr;
  const isRtl = lang === 'ar';

  useEffect(() => {
    const saved = localStorage.getItem('dentsu-lang');
    if (saved && translations[saved]) {
      setLang(saved);
      setShowLangOverlay(false);
    }
    // Fetch sessions
    fetchSessions();
    // Generate particles
    setParticles(Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 10 + 8,
      delay: Math.random() * 5,
    })));
  }, []);

  const fetchSessions = async () => {
    try {
      const r = await fetch(`${API_URL}/status`);
      if (r.ok) {
        const d = await r.json();
        setSessions(d.count || 0);
      }
    } catch {}
  };

  const selectLang = (code) => {
    setLang(code);
    localStorage.setItem('dentsu-lang', code);
    setShowLangOverlay(false);
  };

  const handlePair = async (e) => {
    e.preventDefault();
    const sanitized = number.replace(/[^0-9]/g, '');
    if (sanitized.length < 7 || sanitized.length > 15) {
      setErrorMsg('Numéro invalide. Ex: 224624977006');
      setStep('error');
      return;
    }
    setStep('loading');
    try {
      const res = await fetch(`${API_URL}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: sanitized }),
      });
      const data = await res.json();
      if (data.success && data.code) {
        setCode(data.code);
        setStep('success');
        fetchSessions();
      } else if (data.success && !data.code) {
        setErrorMsg(t.alreadyConnected);
        setStep('error');
      } else {
        setErrorMsg(data.error || 'Erreur inconnue');
        setStep('error');
      }
    } catch (err) {
      setErrorMsg('Impossible de contacter le bot. Vérifie que Railway est en ligne.');
      setStep('error');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setStep('form');
    setNumber('');
    setCode('');
    setErrorMsg('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="app" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Particles */}
      <div className="particles">
        {particles.map(p => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Glow blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      {/* Language Overlay */}
      {showLangOverlay && (
        <div className="lang-overlay">
          <div className="lang-card">
            <img src={BOT_IMAGE} alt={BOT_NAME} className="lang-bot-img" onError={e => e.target.style.display='none'} />
            <h1 className="lang-title">{BOT_NAME}</h1>
            <p className="lang-by">by {DEV_NAME}</p>
            <p className="lang-pick">Choisissez votre langue / Choose your language</p>
            <div className="lang-grid">
              {langMeta.map(l => (
                <button key={l.code} className="flag-btn" onClick={() => selectLang(l.code)} title={l.name}>
                  <FlagImg code={l.flag} size={48} />
                  <span>{l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      {!showLangOverlay && (
        <div className="container">
          {/* Header */}
          <header className="header">
            <div className="bot-img-wrap">
              <img src={BOT_IMAGE} alt={BOT_NAME} className="bot-img" onError={e => e.target.style.display='none'} />
              <div className="bot-img-ring" />
            </div>
            <h1 className="bot-name">{BOT_NAME}</h1>
            <p className="bot-dev">by {DEV_NAME}</p>
            <div className="stats-row">
              <div className="stat-badge stat-cmd">
                <span>⚡ {t.commandsCount}</span>
              </div>
            </div>
          </header>

          {/* Card */}
          <div className="card">
            {step === 'form' && (
              <form onSubmit={handlePair} className="pair-form">
                <h2 className="card-title">📱 {t.connectTitle}</h2>
                <p className="card-sub">{t.connectSubtitle}</p>
                <div className="input-wrap">
                  <span className="input-icon">+</span>
                  <input
                    ref={inputRef}
                    type="tel"
                    inputMode="numeric"
                    value={number}
                    onChange={e => setNumber(e.target.value)}
                    placeholder={t.placeholder}
                    className="phone-input"
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary">
                  <WaIcon />
                  {t.btnConnect}
                </button>
              </form>
            )}

            {step === 'loading' && (
              <div className="center-col">
                <div className="spinner" />
                <p className="loading-text">{t.btnLoading}</p>
                <p className="loading-num">📱 +{number.replace(/[^0-9]/g, '')}</p>
              </div>
            )}

            {step === 'success' && (
              <div className="success-col">
                <div className="success-icon">✅</div>
                <h2 className="card-title">{t.successTitle}</h2>
                <p className="card-sub">{t.successSub}</p>
                <div className="code-box">
                  <span className="code-text">{code}</span>
                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} type="button">
                    {copied ? (
                      <><span>✓</span> {t.copied}</>
                    ) : (
                      <><span>📋</span> {t.copy}</>
                    )}
                  </button>
                </div>
                <div className="steps-list">
                  {[t.step1, t.step2, t.step3, t.step4].map((s, i) => (
                    <div key={i} className="step-item">
                      <div className="step-num">{i + 1}</div>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-outline" onClick={reset} type="button">{t.tryAgain}</button>
              </div>
            )}

            {step === 'error' && (
              <div className="error-col">
                <div className="error-icon">⚠️</div>
                <h2 className="card-title">Oops!</h2>
                <p className="error-msg">{errorMsg}</p>
                <button className="btn-primary" onClick={reset} type="button">{t.tryAgain}</button>
              </div>
            )}
          </div>

          {/* Social */}
          <div className="social-row">
            <a href={CHANNEL_LINK} target="_blank" rel="noopener noreferrer" className="social-btn wa">
              <WaIcon /> {t.channel}
            </a>
            <a href={GROUP_LINK} target="_blank" rel="noopener noreferrer" className="social-btn wa">
              <WaIcon /> {t.group}
            </a>
            <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" className="social-btn tg">
              <TgIcon /> {t.telegram}
            </a>
          </div>

          <footer className="footer">
            <p>{t.madeBy} <a href={TELEGRAM} target="_blank" rel="noopener noreferrer">{DEV_NAME}</a></p>
            <p className="footer-copy">© 2025 {BOT_NAME}. All rights reserved.</p>
          </footer>
        </div>
      )}
    </div>
  );
}
