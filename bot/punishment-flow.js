// Record first: a failed panel request must leave the Discord message untouched.
async function recordBeforeDelete(record, message, onDeleteError = () => {}) {
  const decision = await record();
  if (!decision?.infraction_id || !["warn", "timeout", "ban", "alert"].includes(decision.action)) {
    throw new Error("Panel returned an invalid punishment decision");
  }
  if (message) {
    try {
      await message.delete();
    } catch (error) {
      onDeleteError(error);
    }
  }
  return decision;
}

module.exports = { recordBeforeDelete };