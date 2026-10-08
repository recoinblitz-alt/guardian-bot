// VoiceGuard — Discord voice moderation bot with optional context checking.
// Listens in assigned voice channels, transcribes speech with Deepgram (rotating keys),
// matches slang with matcher.js and punishes according to the rules set in the web panel.
require("dotenv").config();

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
  SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const {
  joinVoiceChannel, getVoiceConnection, EndBehaviorType, VoiceConnectionStatus, entersState,
} = require("@discordjs/voice");
const prism = require("prism-media");
const DeepgramManager = require("./deepgram-manager");
const { compile, findMatches, normalize } = require("./matcher");
const { alertRoles } = require("./appeal-helpers");
const createAppeals = require("./appeals");

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
const pendingReviews = new Map(); // reviewId -> uncertain voice match (10 minute lifetime)

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

function canModerate(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.member?.roles?.cache?.some((role) => alertRoles(config?.settings).includes(role.id)) || false;
}
const appeals = createAppeals({ client, api, getSettings: () => config?.settings, canModerate });

async function sendPunishmentNotice(member, channel, transcript, m, d, message) {
  const components = d.infraction_id && ["warn", "timeout", "ban"].includes(d.action) ? [appeals.button(d.infraction_id)] : [];
  await member.send({ content: `${warningText(member, channel, transcript, m, d, message)}\nPunishment: **${d.action.toUpperCase()}**${d.duration ? ` (${Math.round(d.duration / 60)} min)` : ""}`, components, allowedMentions: { parse: [] } })
    .catch((e) => console.warn("⚠️ Punishment DM unavailable (appeal button could not be delivered):", e.message));
}

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
    // Wait for Deepgram's end-of-speech decision. Acting on intermediate final
    // segments makes background sounds much more likely to become a fake word.
    onTranscript: (r) => r.isFinal && r.speechFinal && r.transcript && onText(r),
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
const VAD_RMS = Number(process.env.VAD_THRESHOLD) || 1100; // background-noise floor
const MIN_SPEECH_MS = Number(process.env.MIN_SPEECH_MS) || 500;
const NOISE_MULTIPLIER = Number(process.env.NOISE_MULTIPLIER) || 2.4;
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
  let noiseFloor = 250;

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
    const threshold = Math.max(VAD_RMS, noiseFloor * NOISE_MULTIPLIER);
    const voiced = rms >= threshold;
    // Learn stationary room/fan noise only while it is below the speech gate.
    // This lets the threshold adapt without treating normal speech as noise.
    if (!voiced) noiseFloor = noiseFloor * 0.97 + rms * 0.03;
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
function stripDiscordMarkup(text) {
  return String(text || "")
    .replace(/<a?:[^:>]+:\d+>/g, " ") // custom emoji names are metadata, not written words
    .replace(/<[@#][!&]?\d+>/g, " ") // user, role and channel mentions
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ") // links
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const checkedText = message ? stripDiscordMarkup(transcript) : transcript;
  if (!checkedText) return;
  const matches = findMatches(checkedText, compiled, config.settings.fuzzy_matching);
  if (!matches.length) return;
  const m = matches[0];
  let confidence = null;
  let aiDecision = null;
  if (!message) {
    const voice = voiceConfidence(m, speech);
    confidence = voice.confidence;
    const short = normalize(m.word).join("").length <= 4;
    const required = Number(short ? (config.settings.min_confidence_short ?? 0.92) : (config.settings.min_confidence ?? 0.85));
    const reviewMinimum = short ? 0.8 : 0.7;
    // Very short, one-word clips are commonly noise. Never punish them.
    if (Array.isArray(speech?.words) && speech.words.length === 1 && voice.duration < 0.4) {
      console.log(`🟡 Ignored tiny voice clip: "${transcript}" → ${m.word}`);
      return;
    }
    // A sound-alike/fuzzy result is never punished automatically. If Deepgram
    // is reasonably sure what it heard, a moderator decides; otherwise ignore it.
    if (m.how !== "exact") {
      if (confidence >= reviewMinimum) await requestReview(member, channel, m, checkedText, confidence);
      else console.log(`🟡 Ignored uncertain voice catch: "${checkedText}" → ${m.word} (${Math.round(confidence * 100)}%)`);
      return;
    }
    if (!Number.isFinite(confidence) || confidence < required) {
      console.log(`🟡 Ignored low-confidence exact voice catch: "${checkedText}" → ${m.word} (${Math.round(confidence * 100)}%, need ${Math.round(required * 100)}%)`);
      return;
    }
  }
  if (config.settings.ai_enabled) {
    let judged;
    try {
      judged = await api("ai-check", {
        method: "POST",
        body: {
          transcript: checkedText,
          matched: m.heard,
          keyword: m.word,
          category: m.category,
          source: message ? "text" : "voice",
          discord_user_id: member.id,
          username: member.user.tag,
          channel_id: channel.id,
          channel_name: channel.name,
        },
      });
    } catch (e) {
      judged = { verdict: "uncertain", reason: `AI check failed: ${e.message}` };
    }
    aiDecision = judged;
    if (judged.verdict === "safe") {
      await postAiDecision(member, channel, m, checkedText, judged);
      console.log(`🟢 AI marked context safe: "${checkedText}" → ${m.word} (${judged.reason})`);
      return;
    }
    if (judged.verdict !== "violation") {
      await requestReview(member, channel, m, checkedText, confidence, message, judged.reason);
      return;
    }
    await postAiDecision(member, channel, m, checkedText, judged);
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
      body: { discord_user_id: member.id, username: member.user.tag, channel_name: (message ? "#" : "") + channel.name, guild_id: member.guild.id, ai_verdict: aiDecision?.verdict || "", ai_reason: aiDecision?.reason || "", category: m.category, matched: m.heard, transcript: checkedText },
    });
  } catch (e) {
    return console.error("⚠️", e.message);
  }

  const reason = `VoiceGuard case:${d.infraction_id}: ${d.reason} — said "${m.heard}"`;
  let result = "done";
  try {
    await sendPunishmentNotice(member, channel, checkedText, m, d, message);
    if (message) {
      const sent = await channel.send(`⚠️ <@${member.id}>, your message was removed for saying **${m.heard}** (matched **${m.word}**).`).catch(() => null);
      if (sent) setTimeout(() => sent.delete().catch(() => {}), 10_000);
    }
    if (d.action === "timeout") {
      const applied = await member.timeout(d.duration * 1000, reason);
      await api("punishment-applied", { method: "POST", body: { infraction_id: d.infraction_id, punishment_expires_at: applied.communicationDisabledUntil?.toISOString() || null } });
    }
    else if (d.action === "ban") await member.ban({ reason, deleteMessageSeconds: 0 });
  } catch (e) {
    result = `failed: ${e.message}`;
  }

  if (d.action === "alert") await alert(member, channel, m, checkedText);
  await log(member, channel, m, checkedText, d, result, confidence);
}

async function postAiDecision(member, channel, m, transcript, decision) {
  const id = config.settings.alert_channel_id;
  if (!id) return;
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!ch?.isTextBased()) return;
  const verdict = decision.verdict === "violation" ? "VIOLATION" : "SAFE";
  const outcome = decision.verdict === "violation" ? "Punishment continues" : "Ignored — no deletion or points";
  const embed = new EmbedBuilder()
    .setColor(decision.verdict === "violation" ? 0xe5484d : 0x30a46c)
    .setTitle(`AI ${verdict} — ${member.user.tag}`)
    .addFields(
      { name: "User", value: `<@${member.id}> (${member.id})`, inline: true },
      { name: channel.isVoiceBased?.() ? "Voice channel" : "Text channel", value: `<#${channel.id}>`, inline: true },
      { name: "Outcome", value: outcome, inline: true },
      { name: "Matched", value: `“${m.heard}” → “${m.word}” (${m.category})` },
      { name: "Full sentence", value: transcript.slice(0, 1000) || "—" },
      { name: "AI reason", value: String(decision.reason || "No reason supplied.").slice(0, 1000) },
    )
    .setTimestamp();
  const roles = alertRoles(config.settings);
  await ch.send({ content: roles.map((id) => `<@&${id}>`).join(" ") || undefined, embeds: [embed], allowedMentions: { users: [], roles } })
    .catch((e) => console.error("⚠️ AI decision alert:", e.message));
}

async function requestReview(member, channel, m, transcript, confidence, message = null, reviewReason = "The voice match is not certain enough.") {
  const { alert_channel_id } = config.settings;
  const roles = alertRoles(config.settings);
  const ch = alert_channel_id && (await client.channels.fetch(alert_channel_id).catch(() => null));
  if (!ch?.isTextBased()) return;
  const id = Math.random().toString(36).slice(2, 12);
  const expiresAt = Date.now() + 10 * 60_000;
  pendingReviews.set(id, { member, channel, m, transcript, confidence, expiresAt, message, reviewReason });
  setTimeout(() => pendingReviews.delete(id), 10 * 60_000);
  const embed = new EmbedBuilder()
    .setColor(0xffc53d)
    .setTitle(`REVIEW NEEDED — ${member.user.tag}`)
    .setDescription(reviewReason.slice(0, 500))
    .addFields(
      { name: "User", value: `<@${member.id}> (${member.id})`, inline: true },
      { name: message ? "Text channel" : "Voice channel", value: channel.name, inline: true },
      ...(confidence === null ? [] : [{ name: "Confidence", value: `${Math.round(confidence * 100)}%`, inline: true }]),
      { name: "Heard", value: `“${m.heard}” → matched “${m.word}” (${m.how})` },
      { name: "Full sentence", value: transcript.slice(0, 1000) || "—" },
      { name: "Expires", value: `<t:${Math.floor(expiresAt / 1000)}:R>` },
    )
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`vg:${id}:warn`).setLabel("Warn").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`vg:${id}:timeout`).setLabel("Timeout 10m").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`vg:${id}:ban`).setLabel("Ban").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`vg:${id}:ignore`).setLabel("Ignore").setStyle(ButtonStyle.Secondary),
  );
  await ch.send({
    content: `${roles.map((id) => `<@&${id}>`).join(" ")} Moderation review needed`,
    embeds: [embed], components: [row],
    allowedMentions: { roles, users: [] },
  }).catch((e) => console.error("⚠️ review alert:", e.message));
}

async function resolveReview(interaction, review, action) {
  const duration = action === "timeout" ? 600 : 0;
  const d = await api("review-offense", {
    method: "POST",
    body: {
      discord_user_id: review.member.id,
      username: review.member.user.tag,
      channel_name: (review.message ? "#" : "") + review.channel.name,
      guild_id: review.member.guild.id,
      ai_verdict: "moderator_review",
      ai_reason: review.reviewReason || "Moderator reviewed uncertain match",
      category: review.m.category,
      matched: review.m.heard,
      transcript: review.transcript,
      action,
      duration_seconds: duration,
    },
  });
  const reason = `VoiceGuard case:${d.infraction_id} moderator review: said "${review.m.heard}"`;
  let result = `approved by ${interaction.user.tag}`;
  try {
    if (review.message) await review.message.delete().catch(() => {});
    await sendPunishmentNotice(review.member, review.channel, review.transcript, review.m, d, review.message);
    if (action === "timeout") {
      const applied = await review.member.timeout(duration * 1000, reason);
      await api("punishment-applied", { method: "POST", body: { infraction_id: d.infraction_id, punishment_expires_at: applied.communicationDisabledUntil?.toISOString() || null } });
    }
    else if (action === "ban") await review.member.ban({ reason, deleteMessageSeconds: 0 });
  } catch (e) {
    result = `failed: ${e.message}`;
  }
  await log(review.member, review.channel, review.m, review.transcript, d, result, review.confidence);
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
  const { alert_channel_id } = config.settings;
  const roles = alertRoles(config.settings);
  const ch = alert_channel_id && (await client.channels.fetch(alert_channel_id).catch(() => null));
  if (!ch?.isTextBased()) return;
  await ch.send({
    content: `${roles.map((id) => `<@&${id}>`).join(" ")} 👀 <@${member.id}> may be provoking in **${channel.name}**: “${transcript.slice(0, 300)}”`,
    allowedMentions: { roles, users: [] },
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
const moderationCommands = [
  new SlashCommandBuilder().setName("warnings").setDescription("Show a user's offences")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear a user's points")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("join").setDescription("Join your current voice channel now"),
  new SlashCommandBuilder().setName("leave").setDescription("Leave the voice channel"),
  new SlashCommandBuilder().setName("status").setDescription("Bot and Deepgram key status"),
].map((c) => c.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).toJSON());
const wordCommands = [
  new SlashCommandBuilder().setName("add").setDescription("Add a moderation word or phrase")
    .addStringOption((o) => o.setName("category").setDescription("Category").setRequired(true).addChoices(...CATS))
    .addStringOption((o) => o.setName("word").setDescription("Word or phrase").setRequired(true)),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a moderation word or phrase")
    .addStringOption((o) => o.setName("category").setDescription("Category").setRequired(true).addChoices(...CATS))
    .addStringOption((o) => o.setName("word").setDescription("Word or phrase").setRequired(true)),
].map((c) => c.toJSON());
const commands = [...moderationCommands, ...wordCommands];

function canManageWords(interaction) {
  const settings = config?.settings;
  if (!settings || !settings.command_channel_id || interaction.channelId !== settings.command_channel_id) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if ((settings.command_allowed_user_ids || []).includes(interaction.user.id)) return true;
  return interaction.member?.roles?.cache?.some((role) => (settings.command_allowed_role_ids || []).includes(role.id)) || false;
}

client.on("interactionCreate", async (i) => {
  if (await appeals.handle(i)) return;
  if (i.isButton() && i.customId.startsWith("vg:")) {
    const [, id, action] = i.customId.split(":");
    const review = pendingReviews.get(id);
    if (!canModerate(i)) return i.reply({ content: "You need the moderator role to decide this.", ephemeral: true });
    if (!review || review.expiresAt <= Date.now()) {
      pendingReviews.delete(id);
      return i.update({ content: "This review expired.", components: [] });
    }
    pendingReviews.delete(id);
    if (action === "ignore") return i.update({ content: `Ignored by ${i.user}. No punishment was recorded.`, components: [] });
    if (!["warn", "timeout", "ban"].includes(action)) return i.reply({ content: "Unknown review action.", ephemeral: true });
    await i.deferUpdate();
    try {
      await resolveReview(i, review, action);
      return i.editReply({ content: `${action.toUpperCase()} approved by ${i.user}.`, components: [] });
    } catch (e) {
      pendingReviews.set(id, review);
      return i.editReply({ content: `Could not apply punishment: ${e.message}`, components: [] });
    }
  }
  if (!i.isChatInputCommand()) return;
  const isWordCmd = ["add", "remove"].includes(i.commandName);
  if (isWordCmd && !canManageWords(i)) {
    return i.reply({ content: "This command is restricted to the configured command channel and approved users or roles.", ephemeral: true });
  }
  // Word changes are public in the command channel so everyone can track who added what.
  await i.deferReply({ ephemeral: !isWordCmd });
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
      case "add":
      case "remove": {
        const category = i.options.getString("category", true);
        const word = i.options.getString("word", true);
        const r = await api("word", { method: "POST", body: { category, word, remove: i.commandName === "remove" } });
        const by = `— by ${i.user}`;
        const other = (r.categories || []).join(", ");
        if (r.status === "exists") return i.editReply(`⚠️ **${word}** is already added to **${category}**. ${by}`);
        if (r.status === "exists_other") return i.editReply(`⚠️ **${word}** is already listed under **${other}**. Remove it there first to change its category. ${by}`);
        if (r.status === "not_found") return i.editReply(`⚠️ **${word}** was not found in **${category}**${other ? ` (it is in **${other}**)` : ""}. ${by}`);
        await loadConfig();
        return i.editReply(`✅ ${i.user} ${i.commandName === "remove" ? "removed" : "added"} **${word}** ${i.commandName === "remove" ? "from" : "to"} **${category}**.`);
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
  await appeals.deliverPending();
  setInterval(() => appeals.deliverPending(), 60_000);
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
