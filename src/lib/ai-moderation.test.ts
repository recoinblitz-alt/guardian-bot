import { describe, expect, it } from "vitest";
import { AI_CONTEXT_SYSTEM_PROMPT, knownSafeContext, parseAiVerdict, type AiContextInput } from "./ai-moderation";

const input = (transcript: string): AiContextInput => ({
  transcript,
  matched: "chutiya",
  keyword: "chutia",
  category: "abuse",
  source: "text",
});

describe("knownSafeContext", () => {
  it.each([
    "Garmi ki chutiya kha ghumne ja raha hai",
    "Garmi ki chuttiya mein ghumne ja raha hai",
    "School ki chhuttiyan kab hain?",
    "गर्मी की छुट्टियों में घूमने जा रहा हूं",
  ])("protects holiday context: %s", (sentence) => {
    expect(knownSafeContext(input(sentence))).toMatchObject({ verdict: "safe" });
  });

  it.each(["Tu chutiya hai", "Chutiya", "Us bande ko chutiya bol"]) (
    "does not whitelist direct insults: %s",
    (sentence) => expect(knownSafeContext(input(sentence))).toBeNull(),
  );
});

describe("AI verdict handling", () => {
  it("keeps a clear provider verdict", () => {
    expect(parseAiVerdict('{"verdict":"violation","reason":"Direct insult aimed at another user."}')).toEqual({
      verdict: "violation",
      reason: "Direct insult aimed at another user.",
    });
  });

  it.each(["not json", '{"verdict":"maybe","reason":"ambiguous"}', '{broken']) (
    "fails safely as uncertain: %s",
    (response) => expect(parseAiVerdict(response).verdict).toBe("uncertain"),
  );

  it("requires target evidence and Roman-Hindi context in the instructions", () => {
    expect(AI_CONTEXT_SYSTEM_PROMPT).toContain("clearly implied person/group");
    expect(AI_CONTEXT_SYSTEM_PROMPT).toContain("Garmi ki chuttiya");
    expect(AI_CONTEXT_SYSTEM_PROMPT).toContain("return UNCERTAIN");
  });
});