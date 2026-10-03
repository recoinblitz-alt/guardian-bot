// VoiceGuard — Discord voice moderation bot (no AI).
// Listens in assigned voice channels, transcribes speech with Deepgram (rotating keys),
// matches slang with matcher.js and punishes according to the rules set in the web panel.
require("dotenv").config();

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  SlashCommandBuilder, ChannelType,
} = require("discord.js");
const {
  joinVoiceChannel, getVoiceConnection, EndBehaviorType, VoiceConnectionStatus, entersState,
} = require("@discordjs/voice");
const prism = require("prism-media");
const DeepgramManager = require("./deepgram-manager");
const { compile, findMatches, normalize } = require("./matcher");

const { PANEL_URL, BOT_KEY } = process.env;
if (!PANEL_URL || !BOT_KEY) {
  console.error("❌ Set PANEL_URL and BOT_KEY in .env (copy both from the panel Overview page).");
  process.exit(1);
}
// Exit code 75 = "restart me" (run.js / start-all restart the bot with fresh credentials)
const RESTART_CODE = 75;
let credentialsFp = null;

let deepgram = null;
let config = null; // { settings, words }
let compiled = compile([]);
let activeKeyId = null;
const cooldown = new Map(); // userId -> timestamp
const listening = new Map(); // userId -> cleanup fn

// ---------------------------------------------------------------- panel API
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${PANEL_URL.replace(/\/$/, "")}/${path}`, {
    method,
    headers: { "x-bot-key": BOT_KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Panel ${path} failed [${res.status}]: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function loadConfig() {
  try {
    config = await api("config");
    compiled = compile(config.words, config.settings.server_words || []);
    if (config.credentials_fp) {
      if (credentialsFp && credentialsFp !== config.credentials_fp) {
        console.log("🔁 Token or Deepgram keys changed in the panel — restarting…");
        process.exit(RESTART_CODE);
      }
      credentialsFp = config.credentials_fp;
    }
    console.log(`🔄 Config loaded: ${config.words.length} words, ${config.settings.voice_channel_ids.length} voice channels`);
  } catch (e) {
    console.error("⚠️ Could not load config:", e.message);
  }
}

async function heartbeat() {
  try {
    const voice = [];
    for (const g of client.guilds.cache.values()) {
      const c = getVoiceConnection(g.id);
      if (c?.joinConfig.channelId) voice.push(c.joinConfig.channelId);
    }
    await api("heartbeat", {
      method: "POST",
      body: { voice_channels: voice, active_key: activeKeyId, keys: deepgram.getAccountInfo(), guilds: client.guilds.cache.map((g) => g.name) },
    });
  } catch (e) {
    console.error("⚠️ Heartbeat failed:", e.message);
  }
}

// ---------------------------------------------------------------- discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

function isIgnored(member) {
  const s = config?.settings;
  if (!s || !member || member.user.bot) return true;
  if (s.ignored_user_ids.includes(member.id)) return true;
  return member.roles.cache.some((r) => s.ignored_role_ids.includes(r.id));
}

async function ensureJoined() {
  if (!config) return;
  for (const id of config.settings.voice_channel_ids) {
    const channel = await client.channels.fetch(id).catch(() => null);
    if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) continue;
    const existing = getVoiceConnection(channel.guild.id);
    if (existing && existing.joinConfig.channelId === id && existing.state.status !== VoiceConnectionStatus.Destroyed) continue;
    connect(channel);
  }
}

function connect(channel) {
  const conn = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });
  console.log(`🎧 Joined ${channel.name}`);

  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      conn.destroy();
      setTimeout(ensureJoined, 3000); // rejoin
    }
  });

  conn.receiver.speaking.on("start", (userId) => {
    if (listening.has(userId)) return;
    const member = channel.guild.members.cache.get(userId);
    if (isIgnored(member)) return;
    listen(conn, member, channel);
  });
  return conn;
}

// ---------------------------------------------------------------- listening
function openDeepgram(member, channel, onText) {
  const account = deepgram.getAvailableAccount();
  if (!account) {
    console.error("❌ All Deepgram keys are used up");
    return null;
  }
  activeKeyId = account.id;
  return deepgram.createStream({
    account,
    // Only safe server words are recognition hints. Sending slang here causes
    // Deepgram to hallucinate slang in ordinary speech (for example VC -> BC).
    keyterms: config.settings.server_words || [],
    onTranscript: (r) => r.isFinal && r.transcript && onText(r),
    onError: (err) => {
      const msg = String(err?.message || err);
      if (/401|402|403|insufficient|credit|balance|unauthori/i.test(msg)) {
        deepgram.markExhausted(account.id, msg.slice(0, 120));
        console.warn(`🔁 Switching away from Deepgram key #${account.id}`);
      }
    },
  });
}

// Saves Deepgram minutes:
//  * 48 kHz stereo -> 16 kHz mono (what speech models use anyway, 6x less data)
//  * silent frames are never sent (Deepgram bills per second of audio sent)
//  * Deepgram is only opened after ~0.35 s of real speech, so coughs, clicks,
//    keyboard noise and breathing never open a stream at all
const VAD_RMS = Number(process.env.VAD_THRESHOLD) || 900; // raise if noise still gets sent
const MIN_SPEECH_MS = Number(process.env.MIN_SPEECH_MS) || 350;
const HANGOVER_FRAMES = 15; // keep ~300 ms after a word so endings aren't cut

function toMono16k(pcm) {
  // input: 16-bit LE stereo 48 kHz. output: 16-bit LE mono 16 kHz
  const frames = Math.floor(pcm.length / 4);
  const outLen = Math.floor(frames / 3);
  const out = Buffer.alloc(outLen * 2);
  let sumSq = 0;
  for (let i = 0; i < outLen; i++) {
    let acc = 0;
    for (let k = 0; k < 3; k++) {
      const o = (i * 3 + k) * 4;
      acc += pcm.readInt16LE(o) + pcm.readInt16LE(o + 2);
    }
    const v = Math.max(-32768, Math.min(32767, Math.round(acc / 6)));
    out.writeInt16LE(v, i * 2);
    sumSq += v * v;
  }
  return { out, rms: outLen ? Math.sqrt(sumSq / outLen) : 0 };
}

function listen(conn, member, channel) {
  const opus = conn.receiver.subscribe(member.id, { end: { behavior: EndBehaviorType.AfterSilence, duration: config.settings.silence_ms || 1200 } });
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  let bytes = 0;
  let accountId = null;
  let dg = null;
  let preroll = [];   // voiced frames held until we know it's real speech
  let voicedMs = 0;
  let hang = 0;

  const cleanup = () => {
    if (!listening.has(member.id)) return;
    listening.delete(member.id);
    try { dg?.close(); } catch {}
    try { opus.destroy(); decoder.destroy(); } catch {}
    if (accountId && bytes) deepgram.addUsage(accountId, bytes);
  };
  listening.set(member.id, cleanup);

  const push = (buf) => {
    if (dg?.send(buf)) bytes += buf.length;
  };

  decoder.on("error", () => {});
  opus.on("error", cleanup);
  opus.on("end", () => setTimeout(cleanup, dg ? 1500 : 0));
  opus.pipe(decoder).on("data", (pcm) => {
    const { out, rms } = toMono16k(pcm);
    const voiced = rms >= VAD_RMS;
    if (voiced) hang = HANGOVER_FRAMES; else if (hang > 0) hang--;
    if (!voiced && hang === 0) return; // silence: send nothing

    if (!dg) {
      preroll.push(out);
      if (voiced) voicedMs += 20;
      if (voicedMs < MIN_SPEECH_MS) return;
      dg = openDeepgram(member, channel, (speech) => moderate(member, channel, speech.transcript, null, speech));
      accountId = activeKeyId;
      if (!dg) return cleanup();
      preroll.forEach(push);
      preroll = [];
      return;
    }
    push(out);
  });
}

// ---------------------------------------------------------------- moderation
function voiceConfidence(match, speech) {
  const words = Array.isArray(speech?.words) ? speech.words : [];
  if (!words.length) return { confidence: Number(speech?.confidence || 0), duration: 0 };
  const heard = new Set(normalize(match.heard));
  const relevant = words.filter((w) => normalize(w.word).some((t) => heard.has(t)));
  const chosen = relevant.length ? relevant : words;
  return {
    confidence: Math.min(...chosen.map((w) => Number(w.confidence || 0))),
    duration: Math.max(...chosen.map((w) => Number(w.end || 0))) - Math.min(...chosen.map((w) => Number(w.start || 0))),
  };
}

function nextText(next) {
  if (!next) return "This is the final level.";
  const count = `${next.pointsLeft} more point${next.pointsLeft === 1 ? "" : "s"}`;
  if (next.action === "timeout") return `${count} = ${Math.round(next.duration / 60)} minute timeout.`;
  return `${count} = ${next.action}.`;
}

function warningText(member, channel, transcript, m, d, message) {
  const place = message ? `#${channel.name}` : `voice channel ${channel.name}`;
  const escaped = m.heard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marked = escaped ? transcript.replace(new RegExp(escaped, "i"), (word) => `**${word}**`) : transcript;
  return [
    `⚠️ **VoiceGuard — ${member.guild.name}**`,
    `You said: “${marked.slice(0, 700)}”`,
    `Caught: **${m.heard}** → matched **${m.word}** (${m.category})`,
    `Where: ${place}`,
    `Points now: **${d.total}**. ${nextText(d.next)}`,
  ].join("\n");
}

async function moderate(member, channel, transcript, message = null, speech = null) {
  const matches = findMatches(transcript, compiled, config.settings.fuzzy_matching);
  if (!matches.length) return;
  const m = matches[0];
  let confidence = null;
  if (!message) {
    const voice = voiceConfidence(m, speech);
    confidence = voice.confidence;
    const short = normalize(m.word).join("").length <= 4;
    const required = Number(short ? (config.settings.min_confidence_short ?? 0.92) : (config.settings.min_confidence ?? 0.85));
    // Very short, one-word clips are commonly noise. Never punish them.
    if ((Array.isArray(speech?.words) && speech.words.length === 1 && voice.duration < 0.4) || confidence < required) {
      console.log(`🟡 Ignored uncertain voice catch: "${transcript}" → ${m.word} (${Math.round(confidence * 100)}%, need ${Math.round(required * 100)}%)`);
      return;
    }
  }
  if (message) await message.delete().catch((e) => console.warn("⚠️ couldn't delete message:", e.message));
  const last = cooldown.get(member.id) || 0;
  if (Date.now() - last < 4000) return;
  cooldown.set(member.id, Date.now());

  console.log(`🚨 ${member.user.tag}: "${transcript}" → ${m.category} (${m.word})`);
  let d;
  try {
    d = await api("offense", {
      method: "POST",
      body: { discord_user_id: member.id, username: member.user.tag, channel_name: (message ? "#" : "") + channel.name, category: m.category, matched: m.heard, transcript },
    });
  } catch (e) {
    return console.error("⚠️", e.message);
  }

  const reason = `VoiceGuard: ${d.reason} — said "${m.heard}"`;
  let result = "done";
  try {
    const notice = warningText(member, channel, transcript, m, d, message);
    await member.send(notice).catch(() => {});
    if (message) {
      const sent = await channel.send(`⚠️ <@${member.id}>, your message was removed for saying **${m.heard}** (matched **${m.word}**).`).catch(() => null);
      if (sent) setTimeout(() => sent.delete().catch(() => {}), 10_000);
    }
    if (d.action === "timeout") await member.timeout(d.duration * 1000, reason);
    else if (d.action === "ban") await member.ban({ reason, deleteMessageSeconds: 0 });
  } catch (e) {
    result = `failed: ${e.message}`;
  }

  if (d.action === "alert") await alert(member, channel, m, transcript);
  await log(member, channel, m, transcript, d, result, confidence);
}

async function log(member, channel, m, transcript, d, result, confidence = null) {
  const id = config.settings.log_channel_id;
  if (!id) return;
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!ch?.isTextBased()) return;
  const color = { ban: 0xe5484d, timeout: 0xf76b15, warn: 0xffc53d, alert: 0x3e63dd }[d.action];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${d.action.toUpperCase()} — ${member.user.tag}`)
    .addFields(
      { name: "User", value: `<@${member.id}> (${member.id})`, inline: true },
      { name: transcript && channel.isVoiceBased?.() ? "Voice channel" : "Text channel", value: channel.isVoiceBased?.() ? channel.name : `<#${channel.id}>`, inline: true },
      { name: "Type", value: m.category, inline: true },
      { name: channel.isVoiceBased?.() ? "Heard" : "Wrote", value: `“${m.heard}” → matched “${m.word}” (${m.how})` },
      { name: channel.isVoiceBased?.() ? "Full sentence" : "Deleted message", value: transcript.slice(0, 1000) || "—" },
      ...(confidence === null ? [] : [{ name: "Voice confidence", value: `${Math.round(confidence * 100)}%`, inline: true }]),
      { name: "Why", value: d.reason, inline: true },
      { name: "Duration", value: d.duration ? `${Math.round(d.duration / 60)} min` : "—", inline: true },
      { name: "Result", value: result, inline: true },
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] }).catch((e) => console.error("⚠️ log:", e.message));
}

async function alert(member, channel, m, transcript) {
  const { alert_channel_id, alert_role_id } = config.settings;
  const ch = alert_channel_id && (await client.channels.fetch(alert_channel_id).catch(() => null));
  if (!ch?.isTextBased()) return;
  await ch.send({
    content: `${alert_role_id ? `<@&${alert_role_id}> ` : ""}👀 <@${member.id}> may be provoking in **${channel.name}**: “${transcript.slice(0, 300)}”`,
    allowedMentions: { roles: alert_role_id ? [alert_role_id] : [], users: [] },
  });
}

// ---------------------------------------------------------------- text channels
// Same word lists and same punishment ladder as voice; the message is deleted first.
let warnedIntent = false;
client.on("messageCreate", async (message) => {
  try {
    if (!config || !message.guild || message.author.bot) return;
    if (!message.content) {
      if (!warnedIntent) { warnedIntent = true; console.warn("⚠️ Text messages arrive empty: turn ON 'Message Content Intent' in the Discord Developer Portal (Bot tab), then restart."); }
      return;
    }
    const s = config.settings;
    const watched = s.text_all_channels || (s.text_channel_ids || []).includes(message.channelId) ||
      (message.channel.isThread?.() && (s.text_channel_ids || []).includes(message.channel.parentId));
    if (!watched) return;
    const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member || isIgnored(member)) return;
    await moderate(member, message.channel, message.content, message);
  } catch (e) {
    console.error("⚠️ text moderation:", e.message);
  }
});
client.on("messageUpdate", (_old, msg) => { if (msg.partial) return; client.emit("messageCreate", msg); });

// ---------------------------------------------------------------- slash commands
const CATS = ["mild", "abuse", "severe", "sexual", "provoking", "allow"].map((c) => ({ name: c, value: c }));
const commands = [
  new SlashCommandBuilder().setName("warnings").setDescription("Show a user's offences")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear a user's points")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("addword").setDescription("Add a slang word/phrase")
    .addStringOption((o) => o.setName("category").setDescription("Category").setRequired(true).addChoices(...CATS))
    .addStringOption((o) => o.setName("word").setDescription("Word or phrase").setRequired(true)),
  new SlashCommandBuilder().setName("removeword").setDescription("Remove a slang word/phrase")
    .addStringOption((o) => o.setName("category").setDescription("Category").setRequired(true).addChoices(...CATS))
    .addStringOption((o) => o.setName("word").setDescription("Word or phrase").setRequired(true)),
  new SlashCommandBuilder().setName("join").setDescription("Join your current voice channel now"),
  new SlashCommandBuilder().setName("leave").setDescription("Leave the voice channel"),
  new SlashCommandBuilder().setName("status").setDescription("Bot and Deepgram key status"),
].map((c) => c.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).toJSON());

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  await i.deferReply({ ephemeral: true });
  try {
    switch (i.commandName) {
      case "warnings": {
        const u = i.options.getUser("user", true);
        const r = await api(`warnings?user=${u.id}`);
        const lines = r.recent.map((x) => `• ${x.action} — ${x.category} “${x.matched}” <t:${Math.floor(new Date(x.created_at) / 1000)}:R>${x.cleared ? " (cleared)" : ""}`);
        return i.editReply(`**${u.tag}** — ${r.points} active points\n${lines.join("\n") || "No offences"}`);
      }
      case "clearwarnings": {
        const u = i.options.getUser("user", true);
        await api("clear", { method: "POST", body: { discord_user_id: u.id } });
        return i.editReply(`✅ Cleared points for ${u.tag}`);
      }
      case "addword":
      case "removeword": {
        await api("word", { method: "POST", body: { category: i.options.getString("category", true), word: i.options.getString("word", true), remove: i.commandName === "removeword" } });
        await loadConfig();
        return i.editReply("✅ Word list updated");
      }
      case "join": {
        const ch = i.member.voice?.channel;
        if (!ch) return i.editReply("Join a voice channel first.");
        connect(ch);
        return i.editReply(`🎧 Listening in ${ch.name}`);
      }
      case "leave": {
        getVoiceConnection(i.guildId)?.destroy();
        return i.editReply("👋 Left voice (I'll rejoin assigned channels on the next check).");
      }
      case "status": {
        const keys = deepgram.getAccountInfo().map((k) => `#${k.id}: ${k.usedMinutes.toFixed(1)}/${k.limitMinutes} min${k.exhausted ? " ❌" : ""}`);
        return i.editReply(`Active key: #${activeKeyId ?? "-"}\n${keys.join("\n")}`);
      }
    }
  } catch (e) {
    await i.editReply(`⚠️ ${e.message}`);
  }
});

// ---------------------------------------------------------------- start
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const g of client.guilds.cache.values()) await g.commands.set(commands).catch((e) => console.warn(`Slash commands in ${g.name}:`, e.message));
  await loadConfig();
  await ensureJoined();
  await heartbeat();
  setInterval(loadConfig, 60_000);
  setInterval(ensureJoined, 15_000);
  setInterval(heartbeat, 60_000);
});

process.on("unhandledRejection", (e) => console.error("Unhandled:", e));
// Token + Deepgram keys come from the panel (Overview page); .env values are only a fallback.
async function start() {
  let creds = null;
  for (let attempt = 1; !creds; attempt++) {
    try {
      creds = await api("credentials");
    } catch (e) {
      console.error(`⚠️ Could not reach panel (try ${attempt}):`, e.message);
      if (attempt >= 30) process.exit(1);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const token = (creds.discord_token || process.env.DISCORD_TOKEN || "").trim();
  if (creds.deepgram_keys?.length) {
    for (let i = 1; i <= 10; i++) delete process.env[`DEEPGRAM_KEY_${i}`];
    creds.deepgram_keys.slice(0, 10).forEach((k, i) => (process.env[`DEEPGRAM_KEY_${i + 1}`] = k));
  }
  if (!token) {
    console.error("❌ No Discord bot token. Add it on the panel Overview page (Bot token & Deepgram keys).");
    await new Promise((r) => setTimeout(r, 60_000));
    process.exit(RESTART_CODE);
  }
  deepgram = new DeepgramManager();
  await loadConfig();
  client.login(token);
}
start();
