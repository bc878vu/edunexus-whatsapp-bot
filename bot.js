// ============================================================
//  WhatsApp Group Bot — Baileys par mabni
//  QR scan karke login, group mein @tag ya command par file bheje
// ============================================================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const QRImage = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILES_DIR = path.join(__dirname, 'files');
const logger = pino({ level: 'warn' });

// ---- Fancy reply formatter (screenshot style) ----
function successBox(subject, count) {
  const line = '─'.repeat(34);
  return (
    `┌${line}┐\n` +
    `  〔 ${config.headerTitle} 〕\n` +
    `├${line}┤\n` +
    `  🟢 System   : Completed\n` +
    `  📘 Subject  : ${subject}\n` +
    `  📦 Payload  : All ${count} File${count === 1 ? '' : 's'} Delivered\n` +
    `└${line}┘\n\n` +
    `⚡ Transmission successful.\n` +
    `🎯 Payload delivered to terminal.\n` +
    `🚀 Optimize your knowledge base!\n\n` +
    `${config.brandLine}`
  );
}

function buildHelp() {
  const cmds = Object.keys(config.fileCommands);
  const fileList = cmds.length
    ? cmds.map((c) => `  • ${c}`).join('\n')
    : '  (koi file command configure nahi — config.js dekhein)';
  return config.helpText
    .replace('{botName}', config.botName)
    .replace('{fileList}', fileList);
}

// Website ka link message
function websiteMessage() {
  return (config.websiteText || '🌐 Website: {url}')
    .replace('{url}', config.websiteUrl || '')
    .replace('{brand}', config.brandLine);
}

// ---- AI (Gemini) intelligent reply ----
async function aiReply(userText, context) {
  const ai = config.ai;
  if (!ai || !ai.enabled || !ai.apiKey) return null;

  const models = [ai.model, ...((ai.fallbackModels || []))].filter(Boolean);

  for (const model of models) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ai.systemPrompt }] },
          contents: [{ parts: [{ text: `${context}\n\nUser: ${userText}` }] }],
          generationConfig: {
            maxOutputTokens: ai.maxTokens || 300,
            temperature: ai.temperature || 0.7,
          },
        }),
      });
      if (res.status === 404) {
        console.log(`[AI] Model ${model} nahi mila, agla try kar raha hun...`);
        continue; // agla model try karo
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log(`[AI] API error ${res.status}: ${errText.slice(0, 200)}`);
        return null;
      }
      const data = await res.json();
      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;
      text = text.trim();
      // Har jawab ke neeche website link LAZMI (agar pehle se nahi hai)
      const siteUrl = config.websiteUrl || '';
      if (siteUrl && !text.includes(siteUrl)) {
        text += `\n\n🌐 ${siteUrl}`;
      }
      // Branding bhi lazmi (agar nahi hai)
      if (config.brandLine && !text.includes(config.brandLine)) {
        text += `\n\n${config.brandLine}`;
      }
      return text;
    } catch (e) {
      console.log(`[AI] Error (${model}):`, e.message);
    }
  }
  console.log('[AI] Koi model kaam nahi kar raha, rule-based fallback');
  return null;
}

// ---- Personal DM auto-reply (smart timing) ----
function isGreeting(text) {
  const pr = config.personalReply;
  if (!pr || !pr.instantGreeting) return false;
  const lower = ' ' + text.toLowerCase() + ' ';
  return (pr.greetingKeywords || []).some((k) => {
    k = k.toLowerCase();
    if (k.length <= 2) return lower.includes(' ' + k + ' ');
    return lower.includes(k);
  });
}

function personalAutoReply(text) {
  const pr = config.personalReply;
  if (!pr || !pr.enabled) return null;
  const lower = ' ' + text.toLowerCase() + ' ';
  for (const kr of pr.keywordReplies || []) {
    const hit = (kr.keywords || []).some((k) => {
      k = k.toLowerCase();
      // Chhote lafz (2 ya kam harf) sirf alag lafz ke tor par match hon
      if (k.length <= 2) return lower.includes(' ' + k + ' ');
      return lower.includes(k);
    });
    if (hit) {
      return kr.reply
        .replace(/\{url\}/g, config.websiteUrl || '')
        .replace(/\{brand\}/g, config.brandLine)
        .replace(/\{bot\}/g, config.botName);
    }
  }
  return (pr.defaultReply || '👋 Busy hun, thori der mein jawab dun ga.')
    .replace(/\{url\}/g, config.websiteUrl || '')
    .replace(/\{brand\}/g, config.brandLine)
    .replace(/\{bot\}/g, config.botName);
}

// Pending DMs: owner ke jawab ka intezar (jid -> { timer, lastText })
const pendingDMs = new Map();

// Conversation tracking: har user se kitni baat hui (jid -> { count, lastActive, history })
const conversations = new Map();
// Group members: kaun kis group se aaya (userJid -> { groupName, groupJid, lastSeen })
const knownGroupMembers = new Map();
const MAX_HISTORY = 10; // AI ko aakhri 10 messages ka context do (zyada intelligent)

function getConversation(jid) {
  const pr = config.personalReply || {};
  let conv = conversations.get(jid);
  const resetMs = (pr.resetMinutes || 30) * 60 * 1000;
  if (!conv || Date.now() - conv.lastActive > resetMs) {
    conv = { count: 0, lastActive: Date.now(), history: [] };
  }
  return conv;
}

// Group mein active user ko yaad rakho (phir DM kare to pehchan sakein)
function trackGroupMember(userJid, groupJid, groupName) {
  knownGroupMembers.set(userJid, { groupName, groupJid, lastSeen: Date.now() });
  if (knownGroupMembers.size > 500) {
    const oldest = [...knownGroupMembers.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
    if (oldest) knownGroupMembers.delete(oldest[0]);
  }
}

// Group mein jo bole, usko yaad rakho (DM mein pehchan ke liye)
const groupNameCache = new Map(); // groupJid -> { name, time }
async function trackGroupMemberCached(sock, userJid, groupJid) {
  let entry = groupNameCache.get(groupJid);
  if (!entry || Date.now() - entry.time > 60 * 60 * 1000) {
    try {
      const meta = await sock.groupMetadata(groupJid).catch(() => null);
      entry = { name: meta?.subject || 'group', time: Date.now() };
      groupNameCache.set(groupJid, entry);
    } catch (_) {
      entry = { name: 'group', time: Date.now() };
    }
  }
  trackGroupMember(userJid, groupJid, entry.name);
}

function getGroupContext(userJid) {
  return knownGroupMembers.get(userJid) || null;
}

function saveConversation(jid, conv) {
  conv.lastActive = Date.now();
  conversations.set(jid, conv);
  // Memory leak se bachao
  if (conversations.size > 200) {
    const oldest = [...conversations.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive)[0];
    if (oldest) conversations.delete(oldest[0]);
  }
}

function fillTemplate(tpl, name) {
  return (tpl || '')
    .replace(/\{url\}/g, config.websiteUrl || '')
    .replace(/\{brand\}/g, config.brandLine)
    .replace(/\{bot\}/g, config.botName)
    .replace(/\{name\}/g, name || 'dost');
}

// Sender ka naam nikalo (profile pushname se)
function getSenderName(msg) {
  const push = (msg.pushName || '').trim().replace(/^~+/, '');
  // Sirf pehla naam lo, aur ajeeb characters saaf karo
  const first = push.split(/[\s@_]+/)[0] || '';
  if (first.length < 2 || first.length > 25) return '';
  return first;
}

// ---- Voice REPLY: bot khud voice message bheje (TTS) ----
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Free Google Translate TTS se audio banao (koi API key nahi chahiye)
async function textToSpeech(text, lang = 'ur') {
  // Lamba text chhota karo (Google TTS limit ~200 chars per request)
  const short = text.slice(0, 180);
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(short)}&tl=${lang}&client=tw-ob`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error('TTS failed: ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error('TTS empty response');
  return buf; // MP3
}

// MP3 → OGG Opus (WhatsApp voice note format) — ffmpeg chahiye
async function convertToVoiceNote(mp3Buffer) {
  const tmpMp3 = path.join(__dirname, 'tmp-tts.mp3');
  const tmpOgg = path.join(__dirname, 'tmp-tts.ogg');
  fs.writeFileSync(tmpMp3, mp3Buffer);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', tmpMp3,
      '-c:a', 'libopus', '-b:a', '48k',
      '-ar', '48000', '-ac', '1',
      tmpOgg,
    ]);
    const ogg = fs.readFileSync(tmpOgg);
    return ogg;
  } finally {
    try { fs.unlinkSync(tmpMp3); } catch (_) {}
    try { fs.unlinkSync(tmpOgg); } catch (_) {}
  }
}

async function sendVoiceReply(sock, jid, text) {
  const vr = (config.personalReply || {}).voiceReply || {};
  if (!vr.enabled) return false;
  try {
    // Text saaf karo (link/branding voice mein nahi bolna)
    let speak = text
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/©.*$/m, '')
      .replace(/[🌐📚📁👋🤖🙏🎤]/g, '')
      .trim()
      .slice(0, 180);
    if (!speak) return false;

    console.log(`[VOICE-REPLY] TTS bana raha hun...`);
    const mp3 = await textToSpeech(speak, vr.language || 'ur');

    try {
      // Proper voice note (OGG Opus) — ffmpeg hona chahiye
      const ogg = await convertToVoiceNote(mp3);
      await sock.sendMessage(jid, {
        audio: ogg,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      });
      console.log(`[VOICE-REPLY] Voice note bhej diya: ${jid}`);
    } catch (_) {
      // ffmpeg nahi hai → MP3 audio file ke tor par bhejo
      console.log('[VOICE-REPLY] ffmpeg nahi mila, MP3 audio bhej raha hun');
      await sock.sendMessage(jid, {
        audio: mp3,
        mimetype: 'audio/mpeg',
        ptt: false,
      });
    }
    return true;
  } catch (e) {
    console.log('[VOICE-REPLY-ERROR]', e.message);
    return false;
  }
}

// ---- Voice message: suno (transcribe) aur AI se jawab dilwao ----
async function handleVoiceMessage(sock, jid, msg) {
  const pr = config.personalReply || {};
  try {
    console.log(`[VOICE] Voice message aaya: ${jid} — sun raha hun...`);
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const audioBase64 = buffer.toString('base64');

    const ai = config.ai;
    if (!ai || !ai.enabled || !ai.apiKey) {
      await sock.sendMessage(jid, { text: fillTemplate(pr.voiceFallback, getSenderName(msg)) });
      return;
    }

    // STEP 1: Pehle sirf TRANSCRIBE karo (taake file request pakri ja sake)
    const models = [ai.model, ...((ai.fallbackModels || []))].filter(Boolean);
    let transcribed = '';
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`;
      const attempt = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Is voice message ko Roman Urdu mein transcribe karo (Urdu lafz, English letters). Sirf transcription do, koi extra text nahi.' },
              { inline_data: { mime_type: 'audio/ogg', data: audioBase64 } },
            ],
          }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
        }),
      });
      if (attempt.status === 404) continue;
      if (!attempt.ok) continue;
      const tData = await attempt.json();
      transcribed = tData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (transcribed) break;
    }
    console.log(`[VOICE] Transcribed: "${transcribed}"`);

    // STEP 2: File request check karo (jaise text mein hota hai)
    if (transcribed) {
      const lowerT = transcribed.toLowerCase();
      const cmdKey = Object.keys(config.fileCommands).find((k) => lowerT.includes(k));
      if (cmdKey) {
        console.log(`[VOICE] File request mili: ${cmdKey}`);
        const cmd = config.fileCommands[cmdKey];
        if (cmd.files && cmd.files.length) {
          const sent = await sendFiles(sock, jid, cmdKey, cmd);
          await sock.sendMessage(jid, { text: successBox(cmd.subject || cmdKey, sent) });
          // Voice mein bhi confirmation
          const vr = (config.personalReply || {}).voiceReply || {};
          if (vr.enabled && vr.replyToVoiceWithVoice) {
            await sendVoiceReply(sock, jid, `${cmd.subject || cmdKey} ki file bhej di hai! Check karo 🙂`);
          }
        } else {
          await sock.sendMessage(jid, {
            text: `⚠️ "${cmdKey}" ki file abhi bot mein available nahi.\n\n${websiteMessage()}\n\n${config.brandLine}`,
          });
        }
        return;
      }
    }

    // STEP 3: File nahi mangi to AI se natural jawab
    let res = null;
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`;
      const attempt = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ai.systemPrompt }] },
          contents: [{
            parts: [
              { text: `User ne voice mein ye kaha: "${transcribed}". Iska natural, dostana jawab do — bilkul wese jese ek Pakistani dost WhatsApp par deta hai. Rules: SIRF Roman Urdu (Urdu lafz, English letters), "tum" kaho "aap" nahi, Hindi bilkul nahi, 1-3 short lines, emoji 1-2 max. Sirf jawab do.` },
            ],
          }],
          generationConfig: { maxOutputTokens: ai.maxTokens || 500, temperature: ai.temperature || 0.85 },
        }),
      });
      if (attempt.status === 404) {
        console.log(`[VOICE-AI] Model ${model} nahi mila, agla try...`);
        continue;
      }
      res = attempt;
      break;
    }
    if (!res) throw new Error('Koi AI model kaam nahi kar raha');
    if (!res.ok) throw new Error('AI error ' + res.status);
    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty AI response');

    const siteUrl = config.websiteUrl || '';
    if (siteUrl && !text.includes(siteUrl)) text += `\n\n🌐 ${siteUrl}`;
    if (config.brandLine && !text.includes(config.brandLine)) text += `\n\n${config.brandLine}`;

    // Conversation mein gin lo (asli transcribed text ke sath)
    const conv = getConversation(jid);
    conv.count++;
    conv.history.push({ role: 'user', text: transcribed || '[voice message]' }, { role: 'bot', text: text.slice(0, 200) });
    if (conv.history.length > MAX_HISTORY * 2) conv.history = conv.history.slice(-MAX_HISTORY * 2);
    saveConversation(jid, conv);

    // Voice ka jawab voice mein (agar enabled ho)
    const vr = (config.personalReply || {}).voiceReply || {};
    if (vr.enabled && vr.replyToVoiceWithVoice) {
      const sent = await sendVoiceReply(sock, jid, text);
      if (sent) {
        // Sath mein text bhi (taake parh bhi sakein)
        await sock.sendMessage(jid, { text: '🎤 ' + text }).catch(() => {});
        console.log(`[VOICE] Voice jawab bhej diya: ${jid}`);
        return;
      }
    }
    await sock.sendMessage(jid, { text: '🎤 Sun liya! ' + text });
    console.log(`[VOICE] Text jawab bhej diya: ${jid}`);
  } catch (e) {
    console.log('[VOICE-ERROR]', e.message);
    await sock.sendMessage(jid, { text: fillTemplate(pr.voiceFallback, getSenderName(msg)) }).catch(() => {});
  }
}

function cancelPendingDM(jid) {
  const p = pendingDMs.get(jid);
  if (p) {
    clearTimeout(p.timer);
    pendingDMs.delete(jid);
    console.log(`[DM] Owner ne khud jawab de diya (${jid}) — bot khamosh rahega.`);
  }
}

async function handlePersonalMessage(sock, jid, msg, text) {
  const pr = config.personalReply;
  if (!pr || !pr.enabled) return;

  const senderName = getSenderName(msg);
  const conv = getConversation(jid);

  // Kya ye user kisi group se aaya hai? (dynamic context)
  const groupCtx = getGroupContext(jid);
  const isFirstDM = conv.count === 0 && conv.history.length === 0;

  // History se context banao (naam + group ke sath)
  const historyText = conv.history
    .map((h) => `${h.role === 'user' ? 'User' : 'EduNexus'}: ${h.text}`)
    .join('\n');

  let context = 'Yeh ek personal (one-to-one) chat hai. ';
  if (senderName) context += `Saamne wale ka naam "${senderName}" hai — isko naam se pukaro. `;
  if (groupCtx) {
    context += `Yeh user "${groupCtx.groupName}" group se aaya hai (wahan tum dono ho). ` +
      (isFirstDM ? 'Yeh pehli dafa personal mein message kar raha hai — group ka zikr karke warm welcome do. ' : '');
  } else if (isFirstDM) {
    context += 'Yeh naya user hai, pehli dafa baat kar raha hai — khush-ikhlaqi se welcome karo. ';
  }
  if (historyText) context += `Pichli baat-cheet:\n${historyText}\n\n`;

  // File/study ki baat ho to usi ke according, warna general natural jawab
  const lower = text.toLowerCase();
  const isStudyTalk = /file|pdf|notes?|mcqs?|handouts?|past.?paper|study|subject|exam|paper|cs\d+|book/i.test(text);
  if (isStudyTalk) {
    context += 'User study/files ke baare mein pooch raha hai — madadgar jawab do, file command ya website suggest karo. ';
  }
  context += 'Natural, polite jawab do.';

  // AI pehle, warna rule-based
  let reply = await aiReply(text, context);
  if (!reply) reply = fillTemplate(personalAutoReply(text), senderName);

  if (reply) {
    conv.count++;
    conv.history.push({ role: 'user', text: text.slice(0, 200) }, { role: 'bot', text: reply.slice(0, 200) });
    if (conv.history.length > MAX_HISTORY * 2) conv.history = conv.history.slice(-MAX_HISTORY * 2);
    saveConversation(jid, conv);
    await sock.sendMessage(jid, { text: reply });
    console.log(`[DM] Reply (${conv.count}) to ${senderName || jid}${groupCtx ? ' [from group: ' + groupCtx.groupName + ']' : ''}`);
  }
}

// ---- Auto Follow-up: unanswered requests ko 1 ghante baad yaad dilao ----
const pendingRequests = new Map(); // msgId -> { jid, sender, text, time, answered }

function looksLikeRequest(text) {
  const lower = text.toLowerCase();
  const keywords = (config.followUp && config.followUp.requestKeywords) || [];
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function trackRequest(msgId, jid, sender, text) {
  if (!config.followUp || !config.followUp.enabled) return;
  if (!jid.endsWith('@g.us')) return; // sirf groups mein
  pendingRequests.set(msgId, {
    jid,
    sender,
    text: text.slice(0, 100),
    time: Date.now(),
    answered: false,
  });
  // Memory leak se bachne ke liye purani entries saaf karo (6 ghante se purani)
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [id, r] of pendingRequests) {
    if (r.time < cutoff) pendingRequests.delete(id);
  }
}

function markAnswered(quotedMsgId) {
  if (!quotedMsgId) return;
  // Baileys quoted stanzaId kabhi full hota hai, kabhi short — dono try karo
  for (const [id, r] of pendingRequests) {
    if (id === quotedMsgId || id.endsWith(quotedMsgId) || quotedMsgId.endsWith(id)) {
      r.answered = true;
    }
  }
}

function getQuotedId(msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    {};
  return ctx.stanzaId || null;
}

async function checkFollowUps(sock) {
  const fu = config.followUp;
  if (!fu || !fu.enabled) return;
  const delayMs = (fu.delayMinutes || 60) * 60 * 1000;
  const now = Date.now();
  for (const [id, r] of pendingRequests) {
    if (r.answered) {
      pendingRequests.delete(id);
      continue;
    }
    if (now - r.time < delayMs) continue;
    // 1 ghanta guzar gaya, koi jawab nahi — follow-up bhejo
    try {
      const text = (fu.followUpText || '⏰ @{user} — kya file mil gayi? {url}')
        .replace(/\{user\}/g, r.sender.split('@')[0])
        .replace(/\{bot\}/g, config.botName)
        .replace(/\{url\}/g, config.websiteUrl || '')
        .replace(/\{brand\}/g, config.brandLine);
      await sock.sendMessage(r.jid, { text, mentions: [r.sender] });
      console.log(`[FOLLOWUP] ${r.sender} ko yaad dilaya (${r.text})`);
    } catch (e) {
      console.log('[FOLLOWUP-ERROR]', e.message);
    }
    pendingRequests.delete(id);
  }
}

// ---- Moderation helpers ----
const LINK_RE = /(https?:\/\/[^\s]+|www\.[^\s]+|t\.me\/[^\s]+|wa\.me\/[^\s]+)/i;

function containsLink(text) {
  const m = text.match(LINK_RE);
  if (!m) return null;
  const url = m[0].toLowerCase();
  // Whitelist check — apni links rehne do
  const ok = (config.moderation.linkWhitelist || []).some((w) =>
    url.includes(w.toLowerCase())
  );
  return ok ? null : m[0];
}

function isStatusShare(msg) {
  const m = msg.message || {};
  // WhatsApp status ko group mein share karne par ye message types aate hain
  return !!(
    m.groupStatusMessage ||
    m.groupStatusMentionMessage ||
    m.statusMentionMessage
  );
}

// ---- Strike tracking: 3-strike rule ----
const strikes = new Map(); // "groupJid|userJid" -> { count, firstTime }

function addStrike(groupJid, userJid) {
  const mod = config.moderation || {};
  const key = groupJid + '|' + userJid;
  const resetMs = (mod.strikeResetHours || 24) * 60 * 60 * 1000;
  let s = strikes.get(key);
  if (!s || Date.now() - s.firstTime > resetMs) {
    s = { count: 0, firstTime: Date.now() };
  }
  s.count++;
  strikes.set(key, s);
  return s.count;
}

async function moderateMessage(sock, jid, msg, text) {
  const mod = config.moderation;
  if (!mod || !mod.enabled) return false;
  if (!jid.endsWith('@g.us')) return false; // sirf groups mein

  const sender = msg.key.participant || jid;
  // Admin bypass
  if ((mod.adminBypass || []).includes(sender)) return false;
  // Bot ke apne messages ko haath na lagao
  if (msg.key.fromMe) return false;

  let reason = null;
  if (mod.deleteLinks) {
    const link = containsLink(text);
    if (link) reason = '🔗 Link share karna mana hai.';
  }
  if (!reason && mod.deleteStatusMentions && isStatusShare(msg)) {
    reason = '📢 Status share/mention karna mana hai.';
  }
  if (!reason) return false;

  try {
    // Message delete (bot ADMIN hona chahiye)
    await sock.sendMessage(jid, { delete: msg.key });

    // Strike count karo
    const maxStrikes = mod.maxStrikes || 3;
    const strikeCount = addStrike(jid, sender);

    // 3 strikes mukammal → group se remove
    if (strikeCount >= maxStrikes) {
      try {
        await sock.groupParticipantsUpdate(jid, [sender], 'remove');
        const removeMsg = (mod.removeText || '🚫 @{user} removed.')
          .replace('{user}', sender.split('@')[0])
          .replace('{max}', maxStrikes)
          .replace('{brand}', config.brandLine);
        await sock.sendMessage(jid, { text: removeMsg, mentions: [sender] });
        console.log(`[MOD] ${sender} ko ${maxStrikes} strikes par REMOVE kiya: ${jid}`);
        strikes.delete(jid + '|' + sender); // reset
      } catch (e) {
        console.log(`[MOD-ERROR] Remove nahi ho saka (kya bot admin hai?): ${e.message}`);
      }
      return true;
    }

    // Warning — bande ko tag karke (strike count ke sath)
    const warn = (mod.warnText || '⚠️ @{user} — {reason}')
      .replace('{user}', sender.split('@')[0])
      .replace('{reason}', reason)
      .replace('{strikes}', strikeCount)
      .replace('{max}', maxStrikes)
      .replace('{brand}', config.brandLine);
    await sock.sendMessage(
      jid,
      { text: warn, mentions: [sender] },
      { quoted: msg }
    );
    console.log(`[MOD] Deleted message from ${sender} — ${reason} (strike ${strikeCount}/${maxStrikes})`);
    return true;
  } catch (e) {
    console.log(`[MOD-ERROR] Delete nahi ho saka (kya bot admin hai?): ${e.message}`);
    return false;
  }
}

// ---- Message text nikalna (har qisam ke message se) ----
function getText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

// ---- Kya bot ko tag kiya gaya? ----
function isBotTagged(msg, botJid) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    {};
  const mentioned = ctx.mentionedJid || [];
  return botJid && mentioned.includes(botJid);
}

// ---- File bhejna ----
async function sendFiles(sock, jid, cmdKey, cmd) {
  const files = cmd.files || [];
  let sent = 0;
  for (const fname of files) {
    const fpath = path.join(FILES_DIR, fname);
    if (!fs.existsSync(fpath)) {
      console.log(`[WARN] File nahi mili: ${fpath}`);
      continue;
    }
    const ext = path.extname(fname).toLowerCase();
    try {
      if (ext === '.pdf') {
        await sock.sendMessage(jid, {
          document: fs.readFileSync(fpath),
          fileName: fname,
          mimetype: 'application/pdf',
        });
      } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(fpath),
          caption: fname,
        });
      } else {
        await sock.sendMessage(jid, {
          document: fs.readFileSync(fpath),
          fileName: fname,
        });
      }
      sent++;
      // WhatsApp rate-limit se bachne ke liye halka waqfa
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.log(`[ERROR] ${fname} bhejne mein nakami: ${e.message}`);
    }
  }
  return sent;
}

// ---- Main ----
async function start() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth'));

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: [config.botName, 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 WhatsApp par QR scan karein (Settings → Linked Devices → Link a Device):\n');
      qrcode.generate(qr, { small: true });
      // QR ko image mein bhi save karo taake chat mein bheja ja sake
      const qrPath = path.join(__dirname, 'qr.png');
      QRImage.toFile(qrPath, qr, { width: 400, margin: 2 }).then(() => {
        console.log(`[INFO] QR image saved: ${qrPath} — scan within ~60 seconds!`);
      }).catch((e) => console.log('[WARN] QR image save failed:', e.message));
    }
    if (connection === 'open') {
      console.log(`\n✅ ${config.botName} online! Group mein @${config.botName} tag karke test karein.\n`);
      // Follow-up checker: har 5 minute mein pending requests check karo
      if (!global.__followUpTimer) {
        global.__followUpTimer = setInterval(() => checkFollowUps(sock), 5 * 60 * 1000);
      }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[INFO] Connection band (code ${code}). ${shouldReconnect ? 'Dobara connect ho raha…' : 'Logged out — auth folder delete karke dobara QR scan karein.'}`);
      if (shouldReconnect) setTimeout(start, 5000);
    }
  });

  // ---- Incoming calls: reject + polite message ----
  sock.ev.on('call', async (callEvents) => {
    const pr = config.personalReply || {};
    for (const call of callEvents) {
      try {
        if (call.status !== 'ringing') continue;
        const from = call.from;
        const isGroupCall = from.endsWith('@g.us');
        console.log(`[CALL] Incoming ${call.isVideo ? 'video' : 'voice'} call from ${from}`);
        // Call reject karo
        try { await sock.rejectCall(call.id, from); } catch (_) {}
        // Sirf personal calls par message bhejo (group call par nahi)
        if (!isGroupCall && pr.enabled !== false) {
          // Caller ka naam nikalne ki koshish
          let callerName = '';
          try {
            const contact = await sock.getContactById?.(from);
            callerName = (contact?.name || contact?.notify || '').split(/[\s@_]+/)[0] || '';
          } catch (_) {}
          await sock.sendMessage(from, { text: fillTemplate(pr.callMessage, callerName) });
          console.log(`[CALL] "Busy" message bhej diya: ${from}`);
        }
      } catch (e) {
        console.log('[CALL-ERROR]', e.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const botJid = sock.user?.id;

    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid) continue;
        const isGroup = jid.endsWith('@g.us');

        // Owner ne DM mein khud jawab diya → pending auto-reply cancel
        if (msg.key.fromMe && !isGroup) {
          cancelPendingDM(jid);
          continue;
        }
        if (msg.key.fromMe) continue; // apne group messages ignore

        // Group filter (agar configured ho)
        if (isGroup && config.allowedGroups.length) {
          const meta = await sock.groupMetadata(jid).catch(() => null);
          const gname = meta?.subject || '';
          const ok = config.allowedGroups.some(
            (g) => gname.toLowerCase().includes(g.toLowerCase()) || jid === g
          );
          if (!ok) continue;
        }

        // Sender filter (agar configured ho)
        if (config.allowedSenders.length) {
          const sender = msg.key.participant || jid;
          if (!config.allowedSenders.includes(sender)) continue;
        }

        const text = getText(msg);
        const msgId = msg.key.id;
        const sender = msg.key.participant || jid;

        // Group mein jo bole, usko yaad rakho (DM mein pehchan ke liye)
        if (isGroup && sender && !msg.key.fromMe) {
          trackGroupMemberCached(sock, sender, jid).catch(() => {});
        }

        // Kisi purani request ka jawab aaya? (quote/reply)
        markAnswered(getQuotedId(msg));

        // ---- Voice message (DM mein): suno aur jawab do ----
        const isVoice = !!msg.message?.audioMessage?.ptt;
        if (isVoice && !isGroup && !msg.key.fromMe) {
          await handleVoiceMessage(sock, jid, msg);
          continue;
        }

        if (!text && !isStatusShare(msg)) continue;

        // ---- Moderation pehle: link/status aaye to delete + warning ----
        const moderated = await moderateMessage(sock, jid, msg, text);
        if (moderated) continue; // delete ho gaya, aage jawab nahi dena

        const lower = text.toLowerCase();
        const tagged = isBotTagged(msg, botJid);

        // Sirf tab jawab jab: group mein tag ho, ya private chat ho, ya command match ho
        // (group mein bina tag ke har message par jawab nahi — spam se bachne ke liye)
        const cmdKey = Object.keys(config.fileCommands).find((k) => lower.includes(k));

        // ---- Follow-up tracking: file request jo command se match NA hui ----
        // (command wali requests ka jawab bot foran de deta hai, unhein track nahi karna)
        if (!cmdKey && isGroup && !msg.key.fromMe && looksLikeRequest(text)) {
          trackRequest(msgId, jid, sender, text);
        }

        // Sirf tab jawab jab: group mein tag ho, ya private chat ho, ya command match ho
        // (group mein bina tag ke har message par jawab nahi — spam se bachne ke liye)

        if (lower === 'help' || lower === `${config.botName.toLowerCase()} help` || (tagged && lower.includes('help'))) {
          await sock.sendMessage(jid, { text: buildHelp() }, { quoted: msg });
          continue;
        }

        if (cmdKey && (tagged || !isGroup)) {
          const cmd = config.fileCommands[cmdKey];
          if (!cmd.files || !cmd.files.length) {
            await sock.sendMessage(
              jid,
              {
                text:
                  `⚠️ "${cmdKey}" ki file abhi bot mein available nahi.\n\n` +
                  websiteMessage() +
                  `\n\n${config.brandLine}`,
              },
              { quoted: msg }
            );
            continue;
          }
          const sent = await sendFiles(sock, jid, cmdKey, cmd);
          await sock.sendMessage(
            jid,
            { text: successBox(cmd.subject || cmdKey, sent) },
            { quoted: msg }
          );
          continue;
        }

        // Tag kiya lekin command samajh nahi aayi (group mein)
        if (tagged && isGroup) {
          // Pehle AI se intelligent jawab try karo
          let aiText = await aiReply(
            text,
            'Yeh ek WhatsApp GROUP hai. Kisi ne tumhein @tag karke kuch poocha hai, lekin ye koi file command nahi. ' +
            'Group ka naam: ' + ((await sock.groupMetadata(jid).catch(() => null))?.subject || 'unknown')
          );
          if (aiText) {
            await sock.sendMessage(jid, { text: aiText }, { quoted: msg });
          } else {
            await sock.sendMessage(
              jid,
              {
                text:
                  `👋 Ji? Mujhe samajh nahi aaya.\n\n` +
                  `📁 File ke liye *help* likhein,\n` +
                  `ya phir website se download kar lein:\n\n` +
                  websiteMessage() +
                  `\n\n${config.brandLine}`,
              },
              { quoted: msg }
            );
          }
        }

        // Personal DM: smart timing ke sath jawab
        // - Salam/hal-chal → foran
        // - Baaki → owner ka 2 min intezar, phir bot
        if (!isGroup && !msg.key.fromMe) {
          await handlePersonalMessage(sock, jid, msg, text);
        }
      } catch (e) {
        console.log('[ERROR] message handle:', e.message);
      }
    }
  });
}

start().catch((e) => {
  console.error('Bot start nahi ho saka:', e.message);
  process.exit(1);
});
