# VoiceGuard bot — setup

This bot must run on a computer that stays on 24/7 (VPS, Railway, Render, Oracle free tier, or your PC).

## 1. Discord settings
- Developer Portal → your app → Bot → turn ON **Server Members Intent**.
- Invite the bot with permissions: View Channels, Connect, Speak, Send Messages, Embed Links, **Moderate Members** (timeout), **Ban Members**.
- The bot's role must be **above** the roles of people it should punish.

## 2. .env
Copy `.env.example` to `.env` and fill it in:
- `DISCORD_TOKEN` — your bot token (reset it if you ever shared it).
- `PANEL_URL` and `BOT_KEY` — copy both from the panel's **Overview** page.
- `DEEPGRAM_KEY_1` … `DEEPGRAM_KEY_10` — your Deepgram keys. When one runs out, the next is used automatically.

## 3. Run
```
npm install
npm start
```
On Railway/Render: create a "worker"/background service from this folder, add the .env values as variables, start command `npm start`.

## How it works
- Every minute it reloads settings and word lists from the panel. Change things in the panel, no restart needed.
- Every 15 s it checks it's in all assigned voice channels and rejoins if kicked/disconnected.
- Each person's speech goes to Deepgram (Hindi + English). The text is checked by `matcher.js` (spelling variants, "bee see" → bc, Hindi script, sound-alikes, phrases with filler words, allow-list).
- The panel decides the punishment using your points ladder; the bot carries it out and posts an embed in the log channel.
- Provoking → tags your chosen role in the alert channel.

Slash commands (moderators only): /warnings /clearwarnings /addword /removeword /join /leave /status

`matcher.js` is generated from the panel's code — the test box on the Word lists page behaves exactly like the bot.

## Saving Deepgram minutes (new)
The bot now only sends real speech: silence, coughs, clicks and keyboard noise are dropped
before anything reaches Deepgram, and audio is shrunk to 16 kHz mono.
Optional `.env` tuning:
```
VAD_THRESHOLD=700        # raise (e.g. 1000) if background noise still gets sent, lower if quiet voices are missed
MIN_SPEECH_MS=350        # how much speech before Deepgram is opened
DEEPGRAM_LANGUAGE=multi  # multi = Hindi+English mix. Use "hi" for mostly Hindi/Punjabi speakers.
```

## Text channels (new)
Pick channels on the panel's **Channels & roles** page (or tick "every text channel").
Messages with slang are deleted and get the same warn/timeout/ban as voice.
Required once: Discord Developer Portal → your app → Bot → turn ON **Message Content Intent**,
and give the bot **Manage Messages** in those channels. Admins ARE moderated too (the bot can delete their messages but cannot timeout/ban the server owner). Add roles to "Never moderate" to skip them.
