const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recordBeforeDelete } = require("./punishment-flow");

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