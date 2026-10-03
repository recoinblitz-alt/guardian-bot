// Slang matcher — pure logic, no AI. Shared by the dashboard test box and the Discord bot
// (the bot copy is generated from this file, see bot/README).

export type Category = "sexual" | "severe" | "abuse" | "mild" | "provoking";
export const CATEGORY_ORDER: Category[] = ["sexual", "severe", "abuse", "mild", "provoking"];

export interface WordEntry {
  category: Category | "allow";
  word: string;
}

export interface Match {
  category: Category;
  word: string;
  heard: string;
  how: "exact" | "sound-alike" | "fuzzy";
}

// Basic Devanagari -> Latin transliteration (speech-to-text often returns Hindi script).
const DEVA: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri",
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
  "ं": "n", "ँ": "n", "ः": "h", "्": "", "़": "",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h", "क़": "k", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f",
};
const DEVA_CONSONANT = /[\u0915-\u0939\u0958-\u095F]/;
const DEVA_MATRA = /[\u0900-\u0903\u093C-\u094D]/;

function transliterate(text: string): string {
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const t = DEVA[c];
    if (t === undefined) { out += c; continue; }
    out += t;
    // inherent "a" after a consonant unless followed by a matra/virama or at word end
    const next = chars[i + 1];
    if (DEVA_CONSONANT.test(c) && next && DEVA_CONSONANT.test(next)) out += "a";
    else if (DEVA_CONSONANT.test(c) && next && !DEVA_MATRA.test(next) && !/\s/.test(next) && !DEVA_CONSONANT.test(next)) out += "a";
  }
  return out;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

// How speech-to-text spells out letters
const SPOKEN_LETTERS: Record<string, string> = {
  bee: "b", be: "b", bi: "b", b: "b",
  see: "c", sea: "c", si: "c", c: "c", ce: "c",
  em: "m", m: "m", am: "m",
  ef: "f", f: "f", ess: "s", es: "s",
  tee: "t", tea: "t",
  kay: "k", k: "k", el: "l", l: "l",
};

export function normalize(text: string): string[] {
  let t = transliterate(String(text || "").normalize("NFKD")).toLowerCase();
  t = t.replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[0-9@$!]/g, (c) => LEET[c] ?? c);
  t = t.replace(/\*/g, "");
  t = t.replace(/[^a-z\s]/g, " ");
  const raw = t.split(/\s+/).filter(Boolean);
  // join spelled-out letters: "b c" / "bee see" / "em see" -> "bc" / "mc"
  const tokens: string[] = [];
  let letters = "";
  let originals: string[] = [];
  const flush = () => {
    if (letters.length >= 2) tokens.push(letters);
    else tokens.push(...originals);
    letters = "";
    originals = [];
  };
  for (const w of raw) {
    const letter = SPOKEN_LETTERS[w];
    if (letter) { letters += letter; originals.push(w); continue; }
    flush();
    tokens.push(w);
  }
  flush();
  return tokens;
}

// collapse repeated letters ("chuuutiyaa" -> "chutiya")
function squash(w: string): string {
  return w.replace(/(.)\1+/g, "$1");
}

// rough Hinglish phonetic key
export function phonetic(w: string, foldEnding = true): string {
  let s = squash(w);
  s = s.replace(/ph/g, "f").replace(/ck/g, "k").replace(/q/g, "k").replace(/z/g, "j").replace(/w/g, "v");
  // a lone "c" sounds like "k" (cutie, cute) — only "ch" is the Hindi च sound (chutiya)
  s = s.replace(/c(?!h)/g, "k");
  s = s.replace(/ee/g, "i").replace(/oo/g, "u").replace(/y/g, "i");
  s = s.replace(/([bcdgjkpt])h/g, "$1"); // bh->b, kh->k, ch->c
  s = s.replace(/sh/g, "s");
  if (foldEnding) s = s.replace(/[aeiou]+$/g, "a"); // ending vowels sound alike (chutiya/chutiye)
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

function tokenMatch(heard: string, target: string, fuzzy: boolean): Match["how"] | null {
  if (heard === target) return "exact";
  if (target.length <= 3) return null; // short words like bc / mc must be exact
  // Hindi छ / "chh" is a different sound from च / "ch". In particular,
  // "chhod/chhodo" (leave/release) must never match the abusive "chod".
  if (squash(heard).startsWith("chh") !== squash(target).startsWith("chh") &&
      (squash(heard).startsWith("ch") || squash(target).startsWith("ch"))) return null;
  const ph = phonetic(heard), pt = phonetic(target);
  // short words (gadha/gaadi, kutta/kutti...) must keep their ending sound to count
  const short = pt.length <= 4;
  if (short ? phonetic(heard, false) === phonetic(target, false) : ph === pt) return "sound-alike";
  if (!fuzzy) return null;
  // fuzzy = one typo, only for long words, and the first 3 sounds must agree.
  // (stops normal Hindi like kamane->kameena, nikal->nikamma)
  if (pt.length >= 8 && ph.slice(0, 3) === pt.slice(0, 3) && lev(ph, pt, 1) <= 1) return "fuzzy";
  return null;
}

function exactToken(heard: string, target: string): boolean {
  return heard === target;
}

export interface CompiledList {
  entries: { category: Category; word: string; tokens: string[] }[];
  /** single safe words — never punished anywhere */
  allow: Set<string>;
  /** safe multi-word phrases — protect only that whole phrase (e.g. "gangster mc") */
  phrases: string[][];
}

/**
 * Build the list. `serverWords` (VC, server name, nicknames…) are always safe.
 * Multi-word allow entries are phrases: "gangster mc" protects "gangster mc", never "mc" alone.
 */
export function compile(words: WordEntry[], serverWords: string[] = []): CompiledList {
  const entries: CompiledList["entries"] = [];
  const allow = new Set<string>();
  const phrases: string[][] = [];
  const addSafe = (text: string) => {
    const tokens = normalize(text).map(squash);
    if (tokens.length === 1) allow.add(tokens[0]!);
    else if (tokens.length > 1) phrases.push(tokens);
  };
  for (const w of words) {
    if (w.category === "allow") { addSafe(w.word); continue; }
    const tokens = normalize(w.word);
    if (!tokens.length) continue;
    entries.push({ category: w.category, word: w.word, tokens });
  }
  serverWords.forEach(addSafe);
  return { entries, allow, phrases };
}

// Speech-to-text often writes "VC" (voice chat) as "BC" and "MC" in server names.
// A lone bc / mc / vc next to these words is about the voice channel, not abuse.
const VC_CONTEXT = new Set([
  "join", "joined", "joining", "aa", "aaja", "aajao", "aao", "ao", "mein", "me", "mai", "main", "in", "chal", "chalo",
  "leave", "left", "wale", "wala", "wali", "se", "pe", "par", "on", "off", "call", "voice", "channel", "chat", "server",
  "gangster", "gangstar", "gangsters",
]);
const VC_LIKE = new Set(["bc", "mc", "vc", "bsi", "vsi"]);

function blockedTokens(tokens: string[], list: CompiledList): boolean[] {
  const sq = tokens.map(squash);
  const blocked = sq.map((t) => list.allow.has(t));
  for (const p of list.phrases) {
    for (let i = 0; i + p.length <= sq.length; i++) {
      if (p.every((t, k) => sq[i + k] === t)) for (let k = 0; k < p.length; k++) blocked[i + k] = true;
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (!VC_LIKE.has(tokens[i]!)) continue;
    if (VC_CONTEXT.has(tokens[i - 1] ?? "") || VC_CONTEXT.has(tokens[i + 1] ?? "")) blocked[i] = true;
  }
  return blocked;
}

/** Find every slang match in a transcript. Phrases may have up to 2 filler words between their parts. */
export function findMatches(transcript: string, list: CompiledList, fuzzy = true): Match[] {
  const tokens = normalize(transcript);
  const blocked = blockedTokens(tokens, list);
  const found: Match[] = [];
  const seen = new Set<string>();
  for (const e of list.entries) {
    // Sexual-harassment terms are deliberately strict: every normalized token
    // must occur consecutively and exactly. Sound-alikes and filler-word phrase
    // matching are too risky for the strongest punishment category.
    if (e.category === "sexual") {
      for (let start = 0; start + e.tokens.length <= tokens.length; start++) {
        if (e.tokens.some((target, offset) => blocked[start + offset] || !exactToken(tokens[start + offset]!, target))) continue;
        const key = `${e.category}|${e.word}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ category: e.category, word: e.word, heard: tokens.slice(start, start + e.tokens.length).join(" "), how: "exact" });
        }
        break;
      }
      continue;
    }
    for (let start = 0; start < tokens.length; start++) {
      if (blocked[start]) continue;
      let first = tokenMatch(tokens[start]!, e.tokens[0]!, fuzzy);
      let pos = start;
      // split compounds: "behen chod" should match "behenchod" — exact only, long words only
      if (!first && e.tokens.length === 1 && e.tokens[0]!.length >= 5 && start + 1 < tokens.length && !blocked[start + 1]) {
        const joined = tokens[start]! + tokens[start + 1]!;
        if (joined === e.tokens[0] || squash(joined) === squash(e.tokens[0]!)) { first = "exact"; pos = start + 1; }
      }
      if (!first) continue;
      let how: Match["how"] = first, ok = true;
      for (let k = 1; k < e.tokens.length && ok; k++) {
        ok = false;
        for (let gap = 1; gap <= 3 && pos + gap < tokens.length; gap++) {
          const m = tokenMatch(tokens[pos + gap]!, e.tokens[k]!, fuzzy);
          if (m && !blocked[pos + gap]) {
            if (m !== "exact") how = m;
            pos += gap; ok = true; break;
          }
        }
      }
      if (!ok) continue;
      const key = e.category + "|" + e.word;
      if (seen.has(key)) break;
      seen.add(key);
      found.push({ category: e.category, word: e.word, heard: tokens.slice(start, pos + 1).join(" "), how });
      break;
    }
  }
  return found.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

/** Most serious category in a set of matches, or null. */
export function worst(matches: Match[]): Match | null {
  return matches[0] ?? null;
}
