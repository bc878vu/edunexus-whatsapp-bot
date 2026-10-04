// API Key test — terminal mein: node test-key.js
const fs = require('fs');
const path = require('path');

let key = '';
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) { key = m[1].replace(/^["']|["']$/g, '').trim(); break; }
  }
}

if (!key) {
  console.log('❌ .env mein GEMINI_API_KEY nahi mili!');
  console.log('   .env file banao aur us mein likho: GEMINI_API_KEY=AIzaSy...');
  process.exit(1);
}
console.log('✅ Key mili:', key.slice(0, 10) + '...' + key.slice(-4), `(${key.length} harf)`);

(async () => {
  const models = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Sirf "OK" likho.' }] }],
        }),
      });
      const data = await res.json();
      if (res.status === 404) {
        console.log(`⚠️  ${model} nahi mila, agla try...`);
        continue;
      }
      if (!res.ok) {
        console.log('❌ API Error:', res.status);
        console.log('   Detail:', JSON.stringify(data).slice(0, 300));
        if (res.status === 400) console.log('   → Key ghalat hai ya expire ho gayi. Nayi key banao.');
        if (res.status === 403) console.log('   → Key par pabandi hai. Google AI Studio mein dekho.');
        if (res.status === 429) console.log('   → Limit khatam. Thori der baad try karo.');
        process.exit(1);
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`✅ AI kaam kar rahi hai! (model: ${model}) Jawab:`, text?.trim());
      console.log('\n🎉 Ab bot restart karo (Ctrl+C → node bot.js)');
      return;
    } catch (e) {
      console.log('❌ Network error:', e.message);
      console.log('   → Internet check karo.');
      return;
    }
  }
  console.log('❌ Koi model kaam nahi kar raha.');
})();
