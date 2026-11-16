// Short farm messages for SMS / WhatsApp / read-aloud.
// Times use h:mm so they read the same in every language and stay short.

export const LANGS = {
  en: { label: 'English', speech: 'en-GB', dir: 'ltr' },
  ar: { label: 'العربية', speech: 'ar-AE', dir: 'rtl' },
  hi: { label: 'हिन्दी', speech: 'hi-IN', dir: 'ltr' },
  ur: { label: 'اردو', speech: 'ur-PK', dir: 'rtl' },
};

export const hmm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

const LRM = '‎'; // keeps "1:30" and block letters left-to-right inside Arabic/Urdu text

const T = {
  en: {
    head: 'Nakhla: water tonight',
    block: (b, t) => `${b} ${t}`,
    salty: (b) => `${b} too salty, test well`,
    flush: '(incl. salt flush)',
    usual: (t) => `Usual ${t}.`,
    saved: (m3) => `Saves ${m3} m3 today.`,
  },
  ar: {
    head: 'نخلة: السقي الليلة',
    block: (b, t) => `${LRM}${b} ${t}${LRM}`,
    salty: (b) => `${LRM}${b}${LRM} الماء مالح جداً، افحص البئر`,
    flush: '(مع غسيل الأملاح)',
    usual: (t) => `المعتاد ${LRM}${t}${LRM}.`,
    saved: (m3) => `توفير ${LRM}${m3}${LRM} م³ اليوم.`,
  },
  hi: {
    head: 'नख़ला: आज रात पानी दें',
    block: (b, t) => `${b} ${t}`,
    salty: (b) => `${b} पानी बहुत खारा, कुआँ जाँचें`,
    flush: '(नमक धुलाई सहित)',
    usual: (t) => `आम तौर पर ${t}।`,
    saved: (m3) => `आज ${m3} m³ बचत।`,
  },
  ur: {
    head: 'نخلہ: آج رات پانی دیں',
    block: (b, t) => `${LRM}${b} ${t}${LRM}`,
    salty: (b) => `${LRM}${b}${LRM} پانی بہت کھارا، کنواں چیک کریں`,
    flush: '(نمک دھلائی سمیت)',
    usual: (t) => `عام طور پر ${LRM}${t}${LRM}۔`,
    saved: (m3) => `آج ${LRM}${m3}${LRM} m³ بچت۔`,
  },
};

export function buildMessage(decisions, lang = 'en') {
  const t = T[lang] || T.en;
  const parts = decisions.map((d) => (d.saltWarning ? t.salty(d.block) : t.block(d.block, hmm(d.minutes))));
  const anyFlush = decisions.some((d) => !d.saltWarning && d.lr >= 0.1);
  const usual = decisions.length ? hmm(Math.max(...decisions.map((d) => d.habitMinutes))) : '0:00';
  const saved = Math.round(decisions.reduce((a, d) => a + (d.saltWarning ? 0 : d.savedM3), 0));
  const sep = lang === 'ar' || lang === 'ur' ? '، ' : ', ';
  let msg = `${t.head}: ${parts.join(sep)}`;
  if (anyFlush) msg += ` ${t.flush}`;
  msg += `. ${t.usual(usual)}`;
  if (saved > 0) msg += ` ${t.saved(saved)}`;
  return msg;
}

// GSM-7 messages fit 160 chars per SMS; anything else (Arabic, Hindi, Urdu) is UCS-2 → 70.
const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r]*$/;

export function smsInfo(text) {
  const clean = text.replace(/‎/g, '');
  const gsm = GSM7.test(clean);
  const len = [...clean].length;
  const per = gsm ? (len <= 160 ? 160 : 153) : (len <= 70 ? 70 : 67);
  return { chars: len, encoding: gsm ? 'GSM-7' : 'Unicode', segments: Math.max(1, Math.ceil(len / per)) };
}
