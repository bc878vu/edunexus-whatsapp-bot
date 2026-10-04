# WhatsApp Group Bot 🤖

Group mein `@Jarvis cs620 final term files` likho — bot PDF bhej dega, bilkul screenshot ki tarah.

## Setup (pehli dafa)

**1. Ek alag number lo**
- Bot ke liye apna personal number use NA karo (ban ka risk hota hai)
- Koi spare SIM/eSIM number best hai

**2. Bot chalao**
```bash
cd ~/workspace/whatsapp-bot
node bot.js
```

**3. QR scan karo**
- Terminal mein QR code aayega
- Us number ke WhatsApp mein jao: **Settings → Linked Devices → Link a Device**
- QR scan karo — bot online ho jayega ✅
- (Login `auth/` folder mein save rehta hai, dobara QR nahi chahiye)

**4. Group mein add karo**
- Bot wale number ko apne group mein add karo (admin banao zaroori nahi)
- Test: `@Jarvis help` likho

## Files add karna

1. PDF `files/` folder mein rakho, masalan:
   ```
   files/CS620_Final_Term_MCQs.pdf
   ```
2. `config.js` kholo, `fileCommands` mein entry add/update karo:
   ```js
   'cs620 final term files': {
     subject: 'CS620 Finals',
     files: ['CS620_Final_Term_MCQs.pdf', 'CS620_Notes.pdf'],
   },
   ```
3. Bot restart karo (`Ctrl+C` phir `node bot.js`)

## Commands

| Likho | Hoga |
|---|---|
| `@Jarvis cs620 final term files` | 2 PDFs + fancy success message |
| `@Jarvis help` | Saari available commands ki list |

## Customization (`config.js`)

- `botName` — bot ka naam
- `brandLine` — har reply ke neeche (masalan `© EduNexus 🤖`)
- `headerTitle` — fancy box ka title
- `allowedGroups` — sirf in groups mein jawab de (khali = sab groups)
- `allowedSenders` — sirf in numbers ko jawab de (khali = sab)

## 24/7 chalana (server par)

```bash
# PM2 se background mein
npm install -g pm2
pm2 start bot.js --name whatsapp-bot
pm2 save
pm2 startup   # reboot par auto-start
```

Logs: `pm2 logs whatsapp-bot`

## ⚠️ Zaroori baatein

1. **Ban risk:** Ye unofficial library (Baileys) hai — WhatsApp isko allow nahi karta. Hamesha **spare number** use karo, personal number kabhi nahi.
2. **Rate limit:** Ek saath bahut si files bhejne par WhatsApp temporarily rok sakta hai — bot mein 1.5 sec ka waqfa pehle se lagaya hai.
3. **Group spam se bacho:** Bot group mein sirf tab jawab deta hai jab usko **@tag** kiya jaye — bina tag ke khamosh rehta hai.
4. **Session:** `auth/` folder delete karne par dobara QR scan karna parega. Is folder ko kisi se share NA karo.
