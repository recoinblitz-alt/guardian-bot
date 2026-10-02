# Voice Moderation Bot – Upgrade Plan

## Important limitation
A bot that sits in voice channels and listens all the time needs a computer that runs 24/7 (a VPS, Railway, Render, Oracle free tier, or your own PC). Lovable's hosting can only answer short requests, so it **cannot run the listening bot itself**. What I will do:

1. **Upgrade your existing bot code** (the files you uploaded) and give you a ready-to-run download.
2. **Build a web dashboard here in Lovable** where you change all settings (channels, words, punishments, roles) without editing files. The bot reads its settings from the dashboard.

Security note: your uploaded `.env` holds your Discord token and 10 Deepgram keys. I will not copy it anywhere. Consider resetting the Discord token since it was shared in a file.

## What the bot will do
- **Auto-join** the voice channels you choose and stay, rejoining after a disconnect.
- **Listen per speaker** and send audio to Deepgram (Hindi + English, multilingual mode) – no AI used for deciding.
- **Smart slang matching (no AI):**
  - Word lists grouped into categories: mild, abuse, severe, sexual harassment, provoking.
  - Handles spelling variants and how speech-to-text writes them (e.g. "bc", "b c", "bee see", "behen", "bhopadike", "bhosdike", "mc", "em see").
  - Phrase patterns for indirect slang ("teri mummy…", "teri maa…", "teri behen…") using word-distance rules.
  - Sound-alike matching so slight mistranscriptions still get caught.
  - Allow-list to avoid false positives (e.g. normal words that contain "bc").
- **Punishment ladder (customizable):** e.g. 1st–3rd offence = warn, 4th = timeout 10 min, repeat = longer timeout, after N timeouts = ban. Warnings expire after X days (your choice).
- **Sexual harassment category = instant ban** (toggle in dashboard).
- **Provoking category** = no punishment by default, but tags admin / a chosen role in an alert channel.
- **Log channel embed** for every action: user, channel, the exact words heard, category, action taken, warning count, time.
- **Deepgram key rotation:** uses key 1 until its credit runs out (detected by error/balance check), then automatically switches to the next; dashboard shows remaining balance per key.
- **Slash commands:** /warnings @user, /clearwarnings, /addword, /removeword, /join, /leave, /status.

## Dashboard pages
- **Overview** – bot online status, active voice channels, active Deepgram key, recent actions.
- **Channels & roles** – voice channels to watch, log channel, alert channel, admin role to tag, ignored users/roles.
- **Word lists** – add/remove words per category and per language, test box ("type a sentence, see if it triggers").
- **Punishment rules** – edit the warning ladder and per-category actions.
- **History** – searchable list of all warnings/timeouts/bans.

## Accuracy note
Speech-to-text is never 100%. Mixed Hindi/English slang is the hardest part. The variant lists + sound-alike matching + test box are how we push accuracy up; you'll tune words after real use.

## Technical details
- Bot: Node.js, discord.js v14, @discordjs/voice, Deepgram live streaming (`nova-2`/`nova-3`, `language=multi` or `hi`), keeping your current file structure, refactored into `matcher.js` (normalization, variant map, Levenshtein/phonetic match, phrase window rules), `punish.js` (escalation ladder), `deepgram-manager.js` (rotation via `/v1/projects/{id}/balances` + 402/401 failover).
- Dashboard: Lovable Cloud database for settings, word lists, warnings, action history. Bot fetches config through a public API route protected by a shared bot secret and posts actions back; dashboard login for you only.
- Delivered: bot as a zip in Files with a setup guide (VPS / Railway steps), plus the live dashboard.
- Deepgram's terms may not allow using multiple accounts to avoid paying; that risk is yours.
