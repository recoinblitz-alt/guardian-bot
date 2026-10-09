const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { alertRoles, canReverseTimeout, canReverseBan } = require("./appeal-helpers");

module.exports = function createAppeals({ client, api, getSettings, canModerate }) {
  let delivering = false;
  function button(infractionId) {
    return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`appeal:${infractionId}`).setLabel("Appeal punishment").setStyle(ButtonStyle.Secondary));
  }
  async function post(appeal, infraction) {
    const settings = getSettings();
    const ch = settings?.alert_channel_id && await client.channels.fetch(settings.alert_channel_id);
    if (!ch?.isTextBased() || ch.guildId !== infraction.guild_id) throw new Error("Set an Alert channel in the punishment's server.");
    const roles = alertRoles(settings);
    const embed = new EmbedBuilder().setColor(0xffc53d).setTitle(`PUNISHMENT APPEAL — ${infraction.username}`)
      .addFields(
        { name: "User", value: `<@${infraction.discord_user_id}> (${infraction.discord_user_id})` },
        { name: "Punishment", value: `${infraction.action.toUpperCase()} · ${infraction.points} points${infraction.duration_seconds ? ` · ${Math.round(infraction.duration_seconds / 60)} min` : ""}` },
        { name: "Channel", value: infraction.channel_name || "—" },
        { name: "Original sentence", value: infraction.transcript.slice(0, 1000) || "—" },
        { name: "Matched keyword", value: `${infraction.matched} (${infraction.category})` },
        { name: "AI decision", value: `${infraction.ai_verdict || "Not used"}: ${infraction.ai_reason || "No AI reason recorded"}`.slice(0, 1000) },
        { name: "User's explanation", value: appeal.explanation.slice(0, 1000) },
      ).setFooter({ text: `Case: ${infraction.id} · Appeal: ${appeal.id}` }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`appeal-review:${appeal.id}:approve`).setLabel("Approve appeal").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`appeal-review:${appeal.id}:reject`).setLabel("Reject appeal").setStyle(ButtonStyle.Danger),
    );
    const sent = await ch.send({ content: `${roles.map((id) => `<@&${id}>`).join(" ")} Punishment appeal needs review`, embeds: [embed], components: [row], allowedMentions: { roles, users: [] } });
    await api("appeal-posted", { method: "POST", body: { appeal_id: appeal.id, review_channel_id: ch.id, review_message_id: sent.id } });
  }
  async function deliverPending() {
    if (delivering) return;
    delivering = true;
    try {
      const { appeals } = await api("appeal-pending");
      for (const appeal of appeals || []) {
        try { await post(appeal, appeal.infraction); }
        catch (e) { console.error("⚠️ Appeal delivery pending:", e.message); }
      }
    } catch (e) { console.error("⚠️ Appeal queue:", e.message); }
    finally { delivering = false; }
  }
  async function reverse(infraction, newer) {
    const guild = await client.guilds.fetch(infraction.guild_id);
    const reason = `VoiceGuard approved appeal case:${infraction.id}`;
    if (infraction.action === "timeout") {
      const member = await guild.members.fetch(infraction.discord_user_id).catch((e) => {
        if (e.code === 10007) return null;
        throw e;
      });
      if (!member || !member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp <= Date.now()) return "Timeout already inactive; this infraction's points removed.";
      if (!canReverseTimeout(infraction, member.communicationDisabledUntilTimestamp, newer)) return "Points removed; a different or newer timeout was left unchanged.";
      await member.timeout(null, reason);
      return "Associated timeout lifted and this infraction's points removed.";
    }
    if (infraction.action === "ban") {
      const ban = await guild.bans.fetch(infraction.discord_user_id).catch((e) => {
        if (e.code === 10026) return null;
        throw e;
      });
      if (!ban) return "Ban already inactive; this infraction's points removed.";
      if (!canReverseBan(infraction, ban.reason, newer)) return "Points removed; a different or newer ban was left unchanged.";
      await guild.members.unban(infraction.discord_user_id, reason);
      return "Associated ban lifted and points removed. The user can rejoin using a server invite.";
    }
    return "Warning pardoned and this infraction's points removed.";
  }
  async function handle(i) {
    if (i.isButton() && i.customId.startsWith("appeal:")) {
      const id = i.customId.split(":")[1];
      // Opening a modal must acknowledge within three seconds; ownership is
      // validated on submission against the actual Discord interaction user.
      const modal = new ModalBuilder().setCustomId(`appeal-submit:${id}`).setTitle("Appeal your punishment");
      const input = new TextInputBuilder().setCustomId("explanation").setLabel("What did you mean, and why was this wrong?").setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true);
      await i.showModal(modal.addComponents(new ActionRowBuilder().addComponents(input)));
      return true;
    }
    if (i.isModalSubmit() && i.customId.startsWith("appeal-submit:")) {
      await i.deferReply({ ephemeral: true });
      try {
        await api("appeal-submit", { method: "POST", body: { infraction_id: i.customId.split(":")[1], discord_user_id: i.user.id, explanation: i.fields.getTextInputValue("explanation") } });
        await i.editReply("Your appeal is saved for moderator review. You will receive the decision by DM.");
        await deliverPending();
      } catch (e) { await i.editReply(`Could not submit appeal: ${e.message}`); }
      return true;
    }
    if (i.isButton() && i.customId.startsWith("appeal-review:")) {
      const [, id, decision] = i.customId.split(":");
      if (!i.guild || !canModerate(i) || i.channelId !== getSettings()?.alert_channel_id) {
        await i.reply({ content: "Only authorized moderators in the Alert channel can review appeals.", ephemeral: true });
        return true;
      }
      if (!["approve", "reject"].includes(decision)) return true;
      await i.deferReply({ ephemeral: true });
      let claim;
      try {
        claim = await api("appeal-claim", { method: "POST", body: { appeal_id: id, guild_id: i.guildId, moderator_id: i.user.id, moderator_name: i.user.tag } });
        const approved = decision === "approve";
        const resolution = approved ? await reverse(claim.infraction, claim.newer_punishment) : "Appeal rejected. Punishment and points remain unchanged.";
        await api("appeal-finish", { method: "POST", body: { appeal_id: id, claim_token: claim.appeal.claim_token, moderator_id: i.user.id, approved, resolution } });
        const content = `${approved ? "APPROVED" : "REJECTED"} by ${i.user.tag}: ${resolution}`;
        await i.message.edit({ content, components: [], allowedMentions: { parse: [] } }).catch((e) => console.error("⚠️ Appeal review update:", e.message));
        const user = await client.users.fetch(claim.infraction.discord_user_id).catch(() => null);
        if (user) await user.send({ content: `VoiceGuard appeal ${approved ? "approved" : "rejected"} by ${i.user.tag}.\nCase: ${claim.infraction.id}\n${resolution}`, allowedMentions: { parse: [] } }).catch((e) => console.warn("⚠️ Appeal decision DM:", e.message));
        const logId = getSettings()?.log_channel_id;
        const logCh = logId && await client.channels.fetch(logId).catch(() => null);
        if (logCh?.isTextBased()) await logCh.send({ content: `${content}\nUser: ${claim.infraction.username} (${claim.infraction.discord_user_id}) · Case: ${claim.infraction.id}`, allowedMentions: { parse: [] } }).catch((e) => console.warn("⚠️ Appeal log:", e.message));
        await i.editReply(content);
      } catch (e) {
        if (claim) await api("appeal-release", { method: "POST", body: { appeal_id: id, claim_token: claim.appeal.claim_token } }).catch((err) => console.error("⚠️ Appeal claim release:", err.message));
        await i.editReply(`Could not finish appeal: ${e.message}. The decision was not confirmed; retry or check the case.`);
      }
      return true;
    }
    return false;
  }
  return { button, handle, deliverPending };
};