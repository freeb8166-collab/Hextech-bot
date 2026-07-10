// app.js - Frontend JavaScript (website/public/js/app.js)

// ═══ TRADUCTIONS — 10 LANGUES ═══
const TRANSLATIONS = {
  fr: {
    h2_connect: '📱 Connecter WhatsApp',
    subtitle_connect: 'Entre ton numéro avec le code pays pour obtenir ton code de jumelage',
    hint: '⚠️ Inclure le code pays sans le + (ex: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 Obtenir mon code',
    btn_pair_loading: '⏳ Génération du code...',
    btn_copy: '📋 Copier le code',
    btn_copied: '✅ Copié !',
    code_label: '🔑 Ton code de jumelage :',
    steps_title: '📋 Comment entrer le code dans WhatsApp :',
    warning: '⏱️ Le code expire dans <strong>60 secondes</strong> — entre-le rapidement !',
    social_channel: '📢 Canal',
    social_group: '👥 Groupe',
    footer: '© 2025 NatsuTech • Tous droits réservés',
    error_invalid: 'Entre un numéro valide avec le code pays. Ex: 242065121108',
    error_network: 'Erreur réseau. Vérifie ta connexion et réessaie.',
    success_code: 'Code généré ! Suis les étapes ci-dessous 👇',
    success_already: '✅ Déjà connecté !',
    error_unknown: 'Erreur inconnue',
    steps: [
      'Ouvre <strong>WhatsApp</strong> sur ton téléphone',
      'Appuie sur les <strong>3 points</strong> (menu) en haut à droite',
      'Va dans <strong>Appareils liés</strong>',
      'Appuie sur <strong>Lier un appareil</strong>',
      'Choisis <strong>"Lier avec un numéro de téléphone"</strong> (pas le QR)',
      'Entre le code <strong id="codeInSteps"></strong> affiché ci-dessus',
      '✅ Le bot se connecte automatiquement !'
    ]
  },
  en: {
    h2_connect: '📱 Connect WhatsApp',
    subtitle_connect: 'Enter your number with country code to get your pairing code',
    hint: '⚠️ Include country code without + (e.g. <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 Get my code',
    btn_pair_loading: '⏳ Generating code...',
    btn_copy: '📋 Copy code',
    btn_copied: '✅ Copied!',
    code_label: '🔑 Your pairing code:',
    steps_title: '📋 How to enter the code in WhatsApp:',
    warning: '⏱️ The code expires in <strong>60 seconds</strong> — enter it quickly!',
    social_channel: '📢 Channel',
    social_group: '👥 Group',
    footer: '© 2025 NatsuTech • All rights reserved',
    error_invalid: 'Enter a valid number with country code. Ex: 242065121108',
    error_network: 'Network error. Check your connection and try again.',
    success_code: 'Code generated! Follow the steps below 👇',
    success_already: '✅ Already connected!',
    error_unknown: 'Unknown error',
    steps: [
      'Open <strong>WhatsApp</strong> on your phone',
      'Tap the <strong>3 dots</strong> (menu) at the top right',
      'Go to <strong>Linked Devices</strong>',
      'Tap <strong>Link a Device</strong>',
      'Choose <strong>"Link with phone number"</strong> (not QR)',
      'Enter the code <strong id="codeInSteps"></strong> shown above',
      '✅ The bot connects automatically!'
    ]
  },
  es: {
    h2_connect: '📱 Conectar WhatsApp',
    subtitle_connect: 'Introduce tu número con el código de país para obtener tu código',
    hint: '⚠️ Incluye el código de país sin el + (ej: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 Obtener mi código',
    btn_pair_loading: '⏳ Generando código...',
    btn_copy: '📋 Copiar código',
    btn_copied: '✅ ¡Copiado!',
    code_label: '🔑 Tu código de emparejamiento:',
    steps_title: '📋 Cómo ingresar el código en WhatsApp:',
    warning: '⏱️ El código expira en <strong>60 segundos</strong> — ¡ingrésalo rápido!',
    social_channel: '📢 Canal',
    social_group: '👥 Grupo',
    footer: '© 2025 NatsuTech • Todos los derechos reservados',
    error_invalid: 'Introduce un número válido con código de país. Ej: 242065121108',
    error_network: 'Error de red. Verifica tu conexión e intenta de nuevo.',
    success_code: '¡Código generado! Sigue los pasos a continuación 👇',
    success_already: '✅ ¡Ya conectado!',
    error_unknown: 'Error desconocido',
    steps: [
      'Abre <strong>WhatsApp</strong> en tu teléfono',
      'Toca los <strong>3 puntos</strong> (menú) arriba a la derecha',
      'Ve a <strong>Dispositivos vinculados</strong>',
      'Toca <strong>Vincular un dispositivo</strong>',
      'Elige <strong>"Vincular con número de teléfono"</strong> (no QR)',
      'Ingresa el código <strong id="codeInSteps"></strong> mostrado arriba',
      '✅ ¡El bot se conecta automáticamente!'
    ]
  },
  zh: {
    h2_connect: '📱 连接 WhatsApp',
    subtitle_connect: '输入您的国家代码和手机号码以获取配对码',
    hint: '⚠️ 包含国家代码，不含 + (例: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 获取我的验证码',
    btn_pair_loading: '⏳ 正在生成验证码...',
    btn_copy: '📋 复制验证码',
    btn_copied: '✅ 已复制！',
    code_label: '🔑 您的配对码：',
    steps_title: '📋 如何在 WhatsApp 中输入验证码：',
    warning: '⏱️ 验证码将在 <strong>60秒</strong> 后过期 — 请尽快输入！',
    social_channel: '📢 频道',
    social_group: '👥 群组',
    footer: '© 2025 NatsuTech • 保留所有权利',
    error_invalid: '请输入包含国家代码的有效号码。例：242065121108',
    error_network: '网络错误。请检查连接后重试。',
    success_code: '验证码已生成！请按以下步骤操作 👇',
    success_already: '✅ 已连接！',
    error_unknown: '未知错误',
    steps: [
      '在手机上打开 <strong>WhatsApp</strong>',
      '点击右上角的 <strong>三点菜单</strong>',
      '进入 <strong>已关联的设备</strong>',
      '点击 <strong>关联设备</strong>',
      '选择 <strong>"通过电话号码关联"</strong>（不是二维码）',
      '输入上方验证码 <strong id="codeInSteps"></strong>',
      '✅ 机器人自动连接成功！'
    ]
  },
  hi: {
    h2_connect: '📱 WhatsApp कनेक्ट करें',
    subtitle_connect: 'अपना देश कोड सहित नंबर दर्ज करें और पेयरिंग कोड प्राप्त करें',
    hint: '⚠️ + के बिना देश कोड शामिल करें (जैसे: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 मेरा कोड प्राप्त करें',
    btn_pair_loading: '⏳ कोड जनरेट हो रहा है...',
    btn_copy: '📋 कोड कॉपी करें',
    btn_copied: '✅ कॉपी हो गया!',
    code_label: '🔑 आपका पेयरिंग कोड:',
    steps_title: '📋 WhatsApp में कोड कैसे दर्ज करें:',
    warning: '⏱️ कोड <strong>60 सेकंड</strong> में समाप्त होगा — जल्दी दर्ज करें!',
    social_channel: '📢 चैनल',
    social_group: '👥 ग्रुप',
    footer: '© 2025 NatsuTech • सर्वाधिकार सुरक्षित',
    error_invalid: 'देश कोड सहित एक वैध नंबर दर्ज करें। जैसे: 242065121108',
    error_network: 'नेटवर्क त्रुटि। अपना कनेक्शन जांचें और पुनः प्रयास करें।',
    success_code: 'कोड जनरेट हुआ! नीचे दिए चरणों का पालन करें 👇',
    success_already: '✅ पहले से कनेक्ट है!',
    error_unknown: 'अज्ञात त्रुटि',
    steps: [
      'अपने फोन पर <strong>WhatsApp</strong> खोलें',
      'ऊपर दाईं ओर <strong>3 बिंदु</strong> (मेनू) पर टैप करें',
      '<strong>लिंक्ड डिवाइस</strong> में जाएं',
      '<strong>डिवाइस लिंक करें</strong> पर टैप करें',
      '<strong>"फोन नंबर से लिंक करें"</strong> चुनें (QR नहीं)',
      'ऊपर दिखाया गया कोड <strong id="codeInSteps"></strong> दर्ज करें',
      '✅ बॉट स्वचालित रूप से कनेक्ट होता है!'
    ]
  },
  ar: {
    h2_connect: '📱 ربط واتساب',
    subtitle_connect: 'أدخل رقمك مع رمز الدولة للحصول على رمز الإقران',
    hint: '⚠️ أدخل رمز الدولة بدون + (مثال: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 احصل على رمزي',
    btn_pair_loading: '⏳ جارٍ توليد الرمز...',
    btn_copy: '📋 نسخ الرمز',
    btn_copied: '✅ تم النسخ!',
    code_label: '🔑 رمز الإقران الخاص بك:',
    steps_title: '📋 كيفية إدخال الرمز في واتساب:',
    warning: '⏱️ ينتهي صلاحية الرمز خلال <strong>60 ثانية</strong> — أدخله بسرعة!',
    social_channel: '📢 القناة',
    social_group: '👥 المجموعة',
    footer: '© 2025 NatsuTech • جميع الحقوق محفوظة',
    error_invalid: 'أدخل رقمًا صالحًا مع رمز الدولة. مثال: 242065121108',
    error_network: 'خطأ في الشبكة. تحقق من اتصالك وحاول مرة أخرى.',
    success_code: 'تم توليد الرمز! اتبع الخطوات أدناه 👇',
    success_already: '✅ متصل بالفعل!',
    error_unknown: 'خطأ غير معروف',
    steps: [
      'افتح <strong>واتساب</strong> على هاتفك',
      'اضغط على <strong>النقاط الثلاث</strong> في أعلى اليمين',
      'اذهب إلى <strong>الأجهزة المرتبطة</strong>',
      'اضغط على <strong>ربط جهاز</strong>',
      'اختر <strong>"الربط برقم الهاتف"</strong> (ليس QR)',
      'أدخل الرمز <strong id="codeInSteps"></strong> المعروض أعلاه',
      '✅ يتصل البوت تلقائياً!'
    ]
  },
  pt: {
    h2_connect: '📱 Conectar WhatsApp',
    subtitle_connect: 'Digite seu número com código do país para obter seu código de emparelhamento',
    hint: '⚠️ Inclua o código do país sem o + (ex: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 Obter meu código',
    btn_pair_loading: '⏳ Gerando código...',
    btn_copy: '📋 Copiar código',
    btn_copied: '✅ Copiado!',
    code_label: '🔑 Seu código de emparelhamento:',
    steps_title: '📋 Como inserir o código no WhatsApp:',
    warning: '⏱️ O código expira em <strong>60 segundos</strong> — insira-o rapidamente!',
    social_channel: '📢 Canal',
    social_group: '👥 Grupo',
    footer: '© 2025 NatsuTech • Todos os direitos reservados',
    error_invalid: 'Digite um número válido com código do país. Ex: 242065121108',
    error_network: 'Erro de rede. Verifique sua conexão e tente novamente.',
    success_code: 'Código gerado! Siga os passos abaixo 👇',
    success_already: '✅ Já conectado!',
    error_unknown: 'Erro desconhecido',
    steps: [
      'Abra o <strong>WhatsApp</strong> no seu celular',
      'Toque nos <strong>3 pontos</strong> (menu) no canto superior direito',
      'Vá em <strong>Dispositivos vinculados</strong>',
      'Toque em <strong>Vincular dispositivo</strong>',
      'Escolha <strong>"Vincular com número de telefone"</strong> (não QR)',
      'Digite o código <strong id="codeInSteps"></strong> mostrado acima',
      '✅ O bot conecta automaticamente!'
    ]
  },
  ru: {
    h2_connect: '📱 Подключить WhatsApp',
    subtitle_connect: 'Введите номер с кодом страны для получения кода сопряжения',
    hint: '⚠️ Включите код страны без + (пример: <strong>242</strong>XXXXXXXX)',
    btn_pair: '📲 Получить мой код',
    btn_pair_loading: '⏳ Генерация кода...',
    btn_copy: '📋 Скопировать код',
    btn_copied: '✅ Скопировано!',
    code_label: '🔑 Ваш код сопряжения:',
    steps_title: '📋 Как ввести код в WhatsApp:',
    warning: '⏱️ Код истекает через <strong>60 секунд</strong> — введите его быстро!',
    social_channel: '📢 Канал',
    social_group: '👥 Группа',
    footer: '© 2025 NatsuTech • Все права защищены',
    error_invalid: 'Введите действительный номер с кодом страны. Пример: 242065121108',
    error_network: 'Ошибка сети. Проверьте подключение и повторите попытку.',
    success_code: 'Код сгенерирован! Следуйте инструкциям ниже 👇',
    success_already: '✅ Уже подключён!',
    error_unknown: 'Неизвестная ошибка',
    steps: [
      'Откройте <strong>WhatsApp</strong> на телефоне',
      'Нажмите на <strong>3 точки</strong> (меню) в правом верхнем углу',
      'Перейдите в <strong>Связанные устройства</strong>',
      'Нажмите <strong>Привязать устройство</strong>',
      'Выберите <strong>"Привязать по номеру телефона"</strong> (не QR)',
      'Введите код <strong id="codeInSteps"></strong> из поля выше',
      '✅ Бот подключается автоматически!'
    ]
  }
};

const RTL_LANGS = new Set(['ar']);

// ═══ LANGUE ═══
let currentLang = null;
let isSubmitting = false;

function t(key) {
  const tr = TRANSLATIONS[currentLang] || TRANSLATIONS['fr'];
  return tr[key] !== null && tr[key] !== undefined ? tr[key] : (TRANSLATIONS['fr'][key] || key);
}

function setLang(lang) {
  if (!TRANSLATIONS[lang]) lang = 'fr';
  currentLang = lang;
  localStorage.setItem('dentsu_lang', lang);

  const overlay = document.getElementById('langOverlay');
  const main = document.getElementById('mainContent');
  if (overlay) overlay.style.display = 'none';
  if (main) {
    main.style.display = 'block';
    main.style.opacity = '0';
    setTimeout(() => {
      main.style.transition = 'opacity 0.3s';
      main.style.opacity = '1';
    }, 10);
  }

  const html = document.getElementById('htmlRoot');
  if (html) {
    html.lang = lang;
    html.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key === 'footer') return;
    const val = t(key);
    if (val) el.innerHTML = val;
  });

  document.querySelectorAll('.flag-mini').forEach(b => b.classList.remove('active-flag'));
  const activeBtn = document.getElementById('flag-' + lang);
  if (activeBtn) activeBtn.classList.add('active-flag');

  const btn = document.getElementById('pairBtn');
  if (btn && !btn.disabled) btn.innerHTML = t('btn_pair');

  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) copyBtn.innerHTML = t('btn_copy');

  renderSteps();
}

function renderSteps() {
  const list = document.getElementById('stepsList');
  if (!list) return;
  const steps = t('steps');
  if (Array.isArray(steps)) {
    list.innerHTML = steps.map(s => `<li>${s}</li>`).join('');
  }
  syncCodeInSteps();
}

function syncCodeInSteps() {
  const codeValue = document.getElementById('codeValue');
  const codeInSteps = document.getElementById('codeInSteps');
  if (codeInSteps && codeValue) {
    codeInSteps.textContent = codeValue.textContent;
  }
}

// ═══ CONFIGURATION DE L'API ═══
// URL dynamique du backend
const API_BASE_URL = (() => {
  // En développement local
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  // En production sur Vercel
  if (window.location.hostname.includes('vercel.app')) {
    return 'https://dentsu-md-v9-production-5cfd.up.railway.app';
  }
  // Par défaut, utiliser le même domaine (si backend et frontend sont ensemble)
  return '';
})();

console.log(`🌐 API_BASE_URL: ${API_BASE_URL || '(même domaine)'}`);

// ═══ INITIALISATION ═══
window.addEventListener('DOMContentLoaded', () => {
  // Toujours montrer l'overlay
  const overlay = document.getElementById('langOverlay');
  const main = document.getElementById('mainContent');
  if (overlay) overlay.style.display = 'flex';
  if (main) main.style.display = 'none';

  // ── Formulaire ──────────────────────────────────────────────────
  const form = document.getElementById('pairForm');
  const numberInput = document.getElementById('number');
  const btn = document.getElementById('pairBtn');
  const resultDiv = document.getElementById('result');
  const codeDisplay = document.getElementById('codeDisplay');
  const codeValue = document.getElementById('codeValue');
  const copyBtn = document.getElementById('copyBtn');
  const stepsDiv = document.getElementById('steps');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    const number = numberInput.value.trim().replace(/[^0-9]/g, '');
    if (!number || number.length < 7) {
      showError(t('error_invalid'));
      return;
    }

    isSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('btn_pair_loading')}`;
    resultDiv.style.display = 'none';
    codeDisplay.style.display = 'none';
    stepsDiv.style.display = 'none';

    try {
      const url = API_BASE_URL ? `${API_BASE_URL}/pair` : '/pair';
      
      console.log(`📡 Envoi de la requête à: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ number })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.code) {
        codeValue.textContent = data.code;
        codeDisplay.style.display = 'block';
        stepsDiv.style.display = 'block';
        renderSteps();
        showSuccess(t('success_code'));
        
        // Auto-copie
        setTimeout(() => {
          navigator.clipboard.writeText(data.code).catch(() => {});
        }, 1000);
        
      } else if (data.success && data.code === null) {
        showSuccess(t('success_already'));
      } else {
        showError(data.error || t('error_unknown'));
      }
    } catch (err) {
      console.error('❌ Erreur API:', err);
      showError(err.message || t('error_network'));
    }
    
    isSubmitting = false;
    btn.disabled = false;
    btn.innerHTML = t('btn_pair');
  });

  copyBtn?.addEventListener('click', () => {
    const code = codeValue.textContent;
    if (!code || code === '') return;
    
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.innerHTML = t('btn_copied');
      setTimeout(() => {
        copyBtn.innerHTML = t('btn_copy');
      }, 2000);
    }).catch(() => {
      // Fallback pour les navigateurs qui ne supportent pas clipboard
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copyBtn.innerHTML = t('btn_copied');
      setTimeout(() => {
        copyBtn.innerHTML = t('btn_copy');
      }, 2000);
    });
  });

  if (codeValue) {
    const observer = new MutationObserver(syncCodeInSteps);
    observer.observe(codeValue, { childList: true, characterData: true, subtree: true });
  }

  // Nettoyer le code si l'utilisateur change de numéro
  numberInput?.addEventListener('input', () => {
    codeDisplay.style.display = 'none';
    stepsDiv.style.display = 'none';
    resultDiv.style.display = 'none';
  });
});

function showError(msg) {
  const d = document.getElementById('result');
  d.className = 'result error';
  d.textContent = '❌ ' + msg;
  d.style.display = 'block';
}

function showSuccess(msg) {
  const d = document.getElementById('result');
  d.className = 'result success';
  d.textContent = '✅ ' + msg;
  d.style.display = 'block';
}
