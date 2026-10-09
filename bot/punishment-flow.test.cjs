const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recordBeforeDelete } = require("./punishment-flow");
const fs = require("node:fs");
const vm = require("node:vm");

test("failed punishment recording never deletes the message", async () => {
  let deleted = false;
  await assert.rejects(recordBeforeDelete(async () => { throw new Error("missing column"); }, { delete: async () => { deleted = true; } }), /missing column/);
  assert.equal(deleted, false);
});
test("punishment is recorded before deleting the message", async () => {
  const events = [];
  const decision = { infraction_id: "case-1", action: "timeout" };
  assert.equal(await recordBeforeDelete(async () => { events.push("record"); return decision; }, { delete: async () => events.push("delete") }), decision);
  assert.deepEqual(events, ["record", "delete"]);
});
test("invalid punishment response cannot delete a message", async () => {
  let deleted = false;
  await assert.rejects(recordBeforeDelete(async () => ({}), { delete: async () => { deleted = true; } }), /invalid punishment/);
  assert.equal(deleted, false);
});
test("missing delete permission does not prevent the recorded punishment", async () => {
  const decision = { infraction_id: "case-1", action: "warn" };
  let error;
  assert.equal(await recordBeforeDelete(async () => decision, { delete: async () => { throw new Error("Missing Permissions"); } }, (e) => { error = e; }), decision);
  assert.equal(error.message, "Missing Permissions");
});
test("voice punishment does not require a message", async () => {
  const decision = { infraction_id: "case-1", action: "ban" };
  assert.equal(await recordBeforeDelete(async () => decision, null), decision);
});

function moderationHarness({ fail = false, verdict = "violation", action = "timeout" } = {}) {
  const events = [];
  const source = fs.readFileSync(require.resolve("./index.js"), "utf8");
  const start = source.indexOf("async function moderate(");
  const end = source.indexOf("async function reportPunishmentFailure", start);
  const context = {
    config: { settings: { ai_enabled: true, fuzzy_matching: true } }, compiled: {},
    stripDiscordMarkup: (text) => text,
    findMatches: () => [{ word: "idiot", heard: "idiot", category: "mild", how: "exact" }],
    cooldown: new Map(), recordBeforeDelete,
    console: { log() {}, error() {}, warn() {} }, Date,
    api: async (path) => {
      events.push(path);
      if (path === "ai-check") return { verdict, reason: "context" };
      if (path === "offense") {
        if (fail) throw new Error("database insert failed");
        return { infraction_id: "case-1", action, duration: 600, reason: "abuse" };
      }
      return {};
    },
    postAiDecision: async () => {}, requestReview: async () => events.push("review"),
    reportPunishmentFailure: async () => events.push("failure-alert"),
    sendPunishmentNotice: async () => events.push("notice"),
    alert: async () => {}, log: async () => events.push("log"),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const member = {
    id: "12345", user: { tag: "tester" }, guild: { id: "67890" },
    timeout: async () => { events.push("timeout"); return { communicationDisabledUntil: new Date() }; },
    ban: async () => events.push("ban"),
  };
  const channel = { name: "test", id: "54321", send: async () => null };
  const message = { delete: async () => events.push("delete") };
  return { events, run: () => context.moderate(member, channel, "you are an idiot", message) };
}

test("real moderation function: failed insert leaves message and alerts moderators", async () => {
  const h = moderationHarness({ fail: true });
  await h.run();
  assert.deepEqual(h.events, ["ai-check", "offense", "failure-alert"]);
});
test("real moderation function: violation records, deletes, notifies, and times out", async () => {
  const h = moderationHarness();
  await h.run();
  assert.deepEqual(h.events, ["ai-check", "offense", "delete", "notice", "timeout", "punishment-applied", "log"]);
});
test("real moderation function: safe AI verdict never deletes or punishes", async () => {
  const h = moderationHarness({ verdict: "safe" });
  await h.run();
  assert.deepEqual(h.events, ["ai-check"]);
});
test("real moderation function: warning is recorded and notification sent", async () => {
  const h = moderationHarness({ action: "warn" });
  await h.run();
  assert.deepEqual(h.events, ["ai-check", "offense", "delete", "notice", "log"]);
});