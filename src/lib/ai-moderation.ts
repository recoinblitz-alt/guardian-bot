export type AiVerdict = "violation" | "safe" | "uncertain";

export type AiContextInput = {
  transcript: string;
  matched: string;
  keyword: string;
  category: "mild" | "abuse" | "severe" | "sexual" | "provoking";
  source: "voice" | "text";
};

export const AI_CONTEXT_SYSTEM_PROMPT = `You are a conservative multilingual Discord moderation context checker. A deterministic keyword matcher found a possible violation, including possible misspellings or phonetic spellings. Judge the meaning and intent of the ENTIRE sentence, not the keyword alone.

Return VIOLATION only when the sentence clearly uses the matched meaning as direct abuse, harassment, a threat, sexual harassment, or a standalone insult aimed at an explicit or clearly implied person/group. A spelling resemblance by itself is never evidence of abusive intent. Your reason must briefly identify the abusive meaning and its target or the evidence that it is a standalone insult.

Return SAFE for innocent meanings, ordinary words, names, usernames, quotations, translations, discussions, condemnations, self-reference without attacking someone, song/movie references, and homophones or misspellings whose sentence meaning is non-abusive.

Roman Hindi/Hinglish examples:
- "Garmi ki chuttiya mein ghumne ja raha hai" and misspellings such as "garmi ki chutiya kha ghumne ja raha hai" mean going out during summer holidays: SAFE.
- "School ki chhuttiyan kab hain?" means asking about school holidays: SAFE.
- "Tu chutiya hai" directly insults a person: VIOLATION.
- "Chutiya" used alone as an insult in an active conversation: VIOLATION.
- Quoting "usne mujhe chutiya bola" to report what someone said is SAFE unless the speaker is also attacking someone.

If the sentence is incomplete, its intended meaning or target is genuinely ambiguous, or there is not enough context to distinguish abuse from an innocent homophone, return UNCERTAIN for moderator review. Never decide a punishment. Return only JSON: {"verdict":"violation|safe|uncertain","reason":"brief contextual reason"}.`;

function normalizedRoman(text: string) {
  return text
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function knownSafeContext(input: AiContextInput): { verdict: "safe"; reason: string } | null {
  const text = normalizedRoman(input.transcript);
  const holidayWord = /\b(?:ch+h?u+t+i+y+a+n?|ch+h?u+t+t+i+y+a+n?|holidays?|vacations?)\b/.test(text)
    || /(?:छुट्टी|छुट्टियां|छुट्टियों)/u.test(text);
  const seasonOrBreak = /\b(?:garmi|summer|sardi|winter|school|college|diwali|puja)\b/.test(text)
    || /(?:गर्मी|सर्दी|स्कूल|कॉलेज|दिवाली)/u.test(text);
  const holidayGrammar = /\b(?:ki|mein|me|par|during|break|ghum\w*|ghoom\w*|travel\w*|trip|ja\w*)\b/.test(text)
    || /(?:की|में|पर|घूम|छुट्टी)/u.test(text);

  if (holidayWord && seasonOrBreak && holidayGrammar) {
    return {
      verdict: "safe",
      reason: "The sentence uses the matched spelling in the context of holidays or vacation, not as an insult.",
    };
  }
  return null;
}

export function parseAiVerdict(text: string): { verdict: AiVerdict; reason: string } {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return { verdict: "uncertain", reason: "AI returned an unreadable response." };
  try {
    const value = JSON.parse(candidate) as { verdict?: unknown; reason?: unknown };
    if (value.verdict !== "violation" && value.verdict !== "safe" && value.verdict !== "uncertain") {
      return { verdict: "uncertain", reason: "AI returned an invalid verdict." };
    }
    return { verdict: value.verdict, reason: String(value.reason || "No reason supplied.").slice(0, 300) };
  } catch {
    return { verdict: "uncertain", reason: "AI returned malformed JSON." };
  }
}