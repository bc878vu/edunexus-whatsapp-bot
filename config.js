// ============================================================
//  Bot Configuration — yahan apni settings change karein
// ============================================================

// API key secure tareeqe se load karo (kabhi public/share nahi hogi):
// 1. Environment variable: GEMINI_API_KEY
// 2. .env file (bot folder mein, ye file kabhi share mat karna)
// 3. Neeche hardcode (sirf test ke liye — share karne se pehle hata dena)
function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch (_) {}
  return '';
}
const ENV_API_KEY = loadApiKey();

module.exports = {
  // Bot ka naam (group mein @tag isi naam se hoga)
  botName: 'EduNexus',

  // ---- AI (Gemini) — full intelligent replies ----
  // https://aistudio.google.com se FREE API key lein aur yahan dalein
  ai: {
    enabled: true,               // API key hone par AI jawab dega, warna rule-based
    apiKey: ENV_API_KEY,         // .env file ya GEMINI_API_KEY se auto-load (secure)
    // ⚠️ Neeche hardcode mat karo — key .env file mein rakho
    model: 'gemini-2.5-flash',   // fast + free tier
    // Agar ye model na chale to ye try hon ge (auto-fallback)
    fallbackModels: ['gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    // AI ko batayein ke wo kaun hai aur kaise baat kare
    systemPrompt:
      'Tum "EduNexus" ho — Asad ka smart WhatsApp assistant. Tum ek zinda-dil Pakistani university student ho, ' +
      'jo doston se WhatsApp par baat karta hai. Tumhein har cheez samajh aati hai, tum witty ho, aur VU ki parhai ka poora pata hai.\n\n' +
      'ZUBAAN (sakht rule):\n' +
      '- SIRF Roman Urdu: Urdu lafz, English letters. Jaise: "yr", "wese", "acha", "han yr", "theek hai", "kya scene hai"\n' +
      '- HINDI BILKUL NAHI: "mai", "aap", "bataiye", "maujud", "kripya" — ye sab FORBIDDEN\n' +
      '- "tum" kaho, "aap" nahi\n\n' +
      'PERSONALITY:\n' +
      '- Dostana, funny, thora witty — boring robot nahi\n' +
      '- Emoji use karo lekin 1-2 per message se zyada nahi\n' +
      '- Short replies: 1-3 lines. Lambi lecture nahi\n' +
      '- Sawal poocho taake baat aage barhe\n' +
      '- Har bande se uske naam se baat karo\n\n' +
      'EXAMPLES (isi style mein jawab do):\n' +
      'User: kaha ho?\n' +
      'Tum: Yahi hun yr! 😄 Tum sunao, kya chal raha hai? Kuch chahiye tha?\n\n' +
      'User: bore ho raha hun\n' +
      'Tum: Haha same yr! Wese parhai ka kya scene hai? Exams qareeb hain? 📚\n\n' +
      'User: cs620 ki file chahiye\n' +
      'Tum: Zaroor! Midterm ya finalterm ki? Batao to sahi file bhejun 🙂\n\n' +
      'User: tum kaun ho\n' +
      'Tum: Mein EduNexus hun — Asad ka assistant! VU ki files, notes, MCQs mein madad karta hun. Tumhein kya chahiye? 😊\n\n' +
      'KNOWLEDGE:\n' +
      '- Website: https://edunexus.dpdns.org (notes, handouts, MCQs — sab FREE)\n' +
      '- File command: "cs620 final term files" likhne par file milti hai\n' +
      '- "help" likhne par commands ki list\n\n' +
      'RULES:\n' +
      '- Har jawab unique ho — kabhi repeat mat karo\n' +
      '- Context yaad rakho, pichli baat ka zikr karo\n' +
      '- Hamesha polite, kabhi rude nahi — ghusse wale ko bhi pyar se handle karo\n' +
      '- Study ki baat ho to helpful raho, file/website suggest karo',
    maxTokens: 500,
    temperature: 0.85,
  },

  // ---- Personal messages ka auto-reply (DM mein) ----
  // Har kisi ko foran jawab — chahe tum online ho ya offline
  personalReply: {
    enabled: true,

    // Kitne minute khamoshi ke baad conversation reset ho
    resetMinutes: 30,

    // Koi call kare to ye message jayega
    callMessage:
      '📞 Maazrat! Asad abhi call par available nahi hain.\n\n' +
      '📝 Baraye meherbani thori der baad *message* kar dein, jald jawab milega. 🙏\n\n' +
      '🌐 Files ke liye: {url}\n\n{brand}',

    // Voice message sunne ke baad (transcribe karke AI jawab dega)
    // Agar transcribe na ho sake to ye jayega
    voiceFallback:
      '🎤 Voice message mil gaya! Lekin samajh nahi aaya.\n' +
      '📝 Baraye meherbani likh kar bhej dein. 🙏\n\n🌐 {url}\n\n{brand}',

    // ---- Voice REPLY (bot khud voice message bheje) ----
    voiceReply: {
      enabled: true,
      // Kab voice mein jawab de:
      replyToVoiceWithVoice: true,  // koi voice bheje → bot bhi voice mein jawab de
      // Kitne harf se lamba jawab ho to voice mein bhejo (0 = kabhi nahi, sirf voice par voice)
      longReplyThreshold: 0,
      language: 'ur',  // TTS zubaan (ur = Urdu)
    },

    instantGreeting: true,
    greetingKeywords: [
      'salam', 'assalam', 'aoa', 'hello', 'hi', 'hey',
      'hal chal', 'haal chaal', 'kya hal', 'kya haal',
      'kesy ho', 'kese ho', 'kaise ho', 'kaisay ho', 'thik ho', 'theek ho',
    ],

    // Koi keyword match na ho to ye jawab jayega
    defaultReply:
      '👋 Assalam-o-Alaikum {name}! Mein abhi busy hun.\n\n' +
      '📚 Agar VU ki files (notes, handouts, MCQs) chahiye to yahan dekhein:\n' +
      '{url}\n\n' +
      'Zaroori baat ho to thori der mein jawab dun ga. Shukriya! 🙏\n\n' +
      '{brand}',

    // Keyword-based jawab — pehla match hone wala use hoga
    keywordReplies: [
      {
        keywords: ['kya hal', 'kya haal', 'hal chal', 'haal chaal', 'kesy ho', 'kese ho', 'kaise ho', 'kaisay ho', 'thik ho', 'theek ho', 'kidr ho', 'kdr ho', 'kahan ho'],
        reply:
          '😊 Mein bilkul theek hun {name}, tum sunao! Kya chal raha hai?\n\n' +
          '📚 Files chahiye to batao, ya website visit karo: {url}\n\n{brand}',
      },
      {
        keywords: ['salam', 'assalam', 'aoa'],
        reply:
          '👋 Walaikum Assalam {name}! Kaise ho?\n\n' +
          '📚 Files chahiye to bas subject ka naam likho (jaise: cs620 final term files)\n' +
          '🌐 Ya website visit karo: {url}\n\n{brand}',
      },
      {
        keywords: ['hello', 'hey'],
        reply:
          '👋 Hello {name}! Kaise ho?\n\n' +
          '📚 Files chahiye to bas subject ka naam likho\n' +
          '🌐 Ya website visit karo: {url}\n\n{brand}',
      },
      {
        keywords: ['file', 'pdf', 'notes', 'mcq', 'handout', 'past paper', 'paper'],
        reply:
          '📁 Zaroor! Konsi file chahiye? Subject ka naam likho.\n\n' +
          'Misal: *cs620 final term files*\n\n' +
          '🌐 Ya foran website se download karo: {url}\n\n{brand}',
      },
      {
        keywords: ['price', 'fees', 'payment', 'paisa', 'kitne'],
        reply:
          '💰 Sab kuch bilkul FREE hai! Koi fees nahi. 😊\n\n' +
          '🌐 Yahan se download karo: {url}\n\n{brand}',
      },
      {
        keywords: ['shukriya', 'thanks', 'thank'],
        reply: '🤗 Khush raho! Aur doston ke sath bhi share karna. 🌐 {url}\n\n{brand}',
      },
    ],
  },

  // Tumhari website — jab file na mile to ye link diya jayega
  websiteUrl: 'https://edunexus.dpdns.org',  websiteText:
    '🌐 Wese tumhein jo file chahiye, wo yahan bhi mil sakti hai:\n' +
    '{url}\n' +
    '📚 Notes, handouts, MCQs — sab kuch free!',

  // Har reply ke neeche aane wala branding/footer
  brandLine: '© EduNexus 🤖',

  // Header style — screenshot jaisa fancy box
  headerTitle: '📚 ELITE HANDOUTS',

  // Kaun se commands par kaun si files bhejni hain
  // Format: 'command text (chhote harf mein)' : [ 'file1.pdf', 'file2.pdf' ]
  // Files ko "files" folder mein rakhein
  fileCommands: {
    'cs620 final term files': {
      subject: 'CS620 Finals',
      files: [
        'CS620_Modeling_and_Simulation_Final_Term_MCQs_EduNexus.pdf',
      ],
    },
    'cs620 midterm files': {
      subject: 'CS620 Midterm',
      files: [],
    },
    // Apne aur subjects yahan add karein:
    // 'cs511 final term files': {
    //   subject: 'CS511 Finals',
    //   files: ['CS511_Final_Term_MCQs.pdf'],
    // },
  },

  // Help command ka jawab
  helpText:
    '🤖 *{botName}* — Commands:\n\n' +
    '📁 *Files hasil karne ke liye likhein:*\n' +
    '{fileList}\n\n' +
    '💡 Bot ko tag karke bhi pooch sakte hain: @{botName} cs620 final term files',

  // Sirf in groups mein jawab de (khali = har group mein)
  // Group ka naam ya JID yahan likhein, e.g. ['VU ALL SOLUTIONS WITH...']
  allowedGroups: [],

  // Sirf in numbers ko jawab de (khali = sab ko). Format: '923275978456@s.whatsapp.net'
  allowedSenders: [],

  // ---- Auto Follow-up: 1 ghante baad jawab na milne par yaad dilao ----
  followUp: {
    enabled: true,
    delayMinutes: 60,        // kitne minute baad follow-up kare
    // Ye lafz hon to "request" samjho
    requestKeywords: [
      'file', 'pdf', 'notes', 'handout', 'handouts', 'mcq', 'mcqs',
      'chahiye', 'chahiyen', 'send', 'bhej', 'bhejo', 'bhejdo',
      'need', 'plz', 'please', 'share', 'dedo', 'de do',
    ],
    followUpText:
      '⏰ @{user} — 1 ghanta ho gaya, kya aapko file mil gayi?\n\n' +
      'Agar nahi mili to yahan se foran download kar lein:\n' +
      '{url}\n' +
      '📚 Notes, handouts, MCQs — sab kuch free!\n\n' +
      'Ya phir mujhe tag karke file ka naam likhein: @{bot} cs620 final term files\n\n' +
      '{brand}',
  },

  // ---- Group Moderation (bot ko group ka ADMIN hona zaroori hai) ----
  moderation: {    enabled: true,           // poori moderation on/off
    deleteLinks: true,       // link wale messages delete karo
    deleteStatusMentions: true, // status share / status mention delete karo
    // In links ko delete NA karo (apni website waghera)
    linkWhitelist: ['edunexus.dpdns.org'],
    // In numbers ko maaf rakho (admins). Format: '923275978456@s.whatsapp.net'
    adminBypass: [],
    // 3-strike rule: itni violations par group se remove
    maxStrikes: 3,
    // Kitne ghante baad strikes reset hon (purani ghaltiyan maaf)
    strikeResetHours: 24,
    // Warning message — {user}=tag, {reason}=wajah, {strikes}=count
    warnText:
      '⚠️ @{user} — {reason}\n\n' +
      '📌 Group rules ki khilaf-warzi par message delete kar diya gaya hai.\n' +
      '⚡ Strike {strikes}/{max} — {max} strikes par group se remove kar diya jayega!\n\n' +
      '{brand}',
    // Remove hone par ye message
    removeText:
      '🚫 @{user} ko {max} strikes mukammal hone par group se remove kar diya gaya.\n\n{brand}',
  },
};
