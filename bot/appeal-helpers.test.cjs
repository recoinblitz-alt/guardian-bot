const { test } = require("node:test");
const assert = require("node:assert/strict");
const { alertRoles, canReverseTimeout, canReverseBan } = require("./appeal-helpers");
test("multiple roles are distinct, validated, and bounded", () => {
  assert.deepEqual(alertRoles({ alert_role_ids: ["123456", "234567", "123456", "@everyone"] }), ["123456", "234567"]);
  assert.equal(alertRoles({ alert_role_ids: Array.from({ length: 25 }, (_, i) => String(100000 + i)) }).length, 20);
});
test("legacy role preserved, explicitly empty array disables tags", () => {
  assert.deepEqual(alertRoles({ alert_role_id: "123456" }), ["123456"]);
  assert.deepEqual(alertRoles({ alert_role_ids: [], alert_role_id: "123456" }), []);
});
test("only the associated timeout is reversible", () => {
  const until = Date.now() + 600000;
  const row = { punishment_expires_at: new Date(until).toISOString() };
  assert.equal(canReverseTimeout(row, until, false), true);
  assert.equal(canReverseTimeout(row, until, true), false);
  assert.equal(canReverseTimeout(row, until + 60000, false), false);
  assert.equal(canReverseTimeout({}, until, false), false);
});
test("only a case-tagged ban without newer punishment is reversible", () => {
  const row = { id: "case-123" };
  assert.equal(canReverseBan(row, "VoiceGuard case:case-123: abuse", false), true);
  assert.equal(canReverseBan(row, "Other moderator banned", false), false);
  assert.equal(canReverseBan(row, "VoiceGuard case:case-123: abuse", true), false);
  assert.equal(canReverseBan(row, null, false), false);
});