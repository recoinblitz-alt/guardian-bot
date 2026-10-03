var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/lib/matcher.ts
var exports_matcher = {};
__export(exports_matcher, {
  worst: () => worst,
  phonetic: () => phonetic,
  normalize: () => normalize,
  findMatches: () => findMatches,
  compile: () => compile,
  CATEGORY_ORDER: () => CATEGORY_ORDER
});
module.exports = __toCommonJS(exports_matcher);
var CATEGORY_ORDER = ["sexual", "severe", "abuse", "mild", "provoking"];
var DEVA = {
  "अ": "a",
  "आ": "aa",
  "इ": "i",
  "ई": "ee",
  "उ": "u",
  "ऊ": "oo",
  "ए": "e",
  "ऐ": "ai",
  "ओ": "o",
  "औ": "au",
  "ऋ": "ri",
  "ा": "a",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "u",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ृ": "ri",
  "ं": "n",
  "ँ": "n",
  "ः": "h",
  "्": "",
  "़": "",
  "क": "k",
  "ख": "kh",
  "ग": "g",
  "घ": "gh",
  "ङ": "n",
  "च": "ch",
  "छ": "chh",
  "ज": "j",
  "झ": "jh",
  "ञ": "n",
  "ट": "t",
  "ठ": "th",
  "ड": "d",
  "ढ": "dh",
  "ण": "n",
  "त": "t",
  "थ": "th",
  "द": "d",
  "ध": "dh",
  "न": "n",
  "प": "p",
  "फ": "ph",
  "ब": "b",
  "भ": "bh",
  "म": "m",
  "य": "y",
  "र": "r",
  "ल": "l",
  "व": "v",
  "श": "sh",
  "ष": "sh",
  "स": "s",
  "ह": "h",
  "क़": "k",
  "ख़": "kh",
  "ग़": "g",
  "ज़": "z",
  "ड़": "d",
  "ढ़": "dh",
  "फ़": "f"
};
var DEVA_CONSONANT = /[\u0915-\u0939\u0958-\u095F]/;
var DEVA_MATRA = /[\u0900-\u0903\u093C-\u094D]/;
function transliterate(text) {
  let out = "";
  const chars = [...text];
  for (let i = 0;i < chars.length; i++) {
    const c = chars[i];
    const t = DEVA[c];
    if (t === undefined) {
      out += c;
      continue;
    }
    out += t;
    const next = chars[i + 1];
    if (DEVA_CONSONANT.test(c) && next && DEVA_CONSONANT.test(next))
      out += "a";
    else if (DEVA_CONSONANT.test(c) && next && !DEVA_MATRA.test(next) && !/\s/.test(next) && !DEVA_CONSONANT.test(next))
      out += "a";
  }
  return out;
}
var LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };
var SPOKEN_LETTERS = {
  bee: "b",
  be: "b",
  bi: "b",
  b: "b",
  see: "c",
  sea: "c",
  si: "c",
  c: "c",
  ce: "c",
  em: "m",
  m: "m",
  am: "m",
  ef: "f",
  f: "f",
  ess: "s",
  es: "s",
  tee: "t",
  tea: "t",
  kay: "k",
  k: "k",
  el: "l",
  l: "l"
};
function normalize(text) {
  let t = transliterate(String(text || "").normalize("NFKD")).toLowerCase();
  t = t.replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[0-9@$!]/g, (c) => LEET[c] ?? c);
  t = t.replace(/\*/g, "");
  t = t.replace(/[^a-z\s]/g, " ");
  const raw = t.split(/\s+/).filter(Boolean);
  const tokens = [];
  let letters = "";
  let originals = [];
  const flush = () => {
    if (letters.length >= 2)
      tokens.push(letters);
    else
      tokens.push(...originals);
    letters = "";
    originals = [];
  };
  for (const w of raw) {
    const letter = SPOKEN_LETTERS[w];
    if (letter) {
      letters += letter;
      originals.push(w);
      continue;
    }
    flush();
    tokens.push(w);
  }
  flush();
  return tokens;
}
function squash(w) {
  return w.replace(/(.)\1+/g, "$1");
}
function phonetic(w, foldEnding = true) {
  let s = squash(w);
  s = s.replace(/ph/g, "f").replace(/ck/g, "k").replace(/q/g, "k").replace(/z/g, "j").replace(/w/g, "v");
  s = s.replace(/c(?!h)/g, "k");
  s = s.replace(/ee/g, "i").replace(/oo/g, "u").replace(/y/g, "i");
  s = s.replace(/([bcdgjkpt])h/g, "$1");
  s = s.replace(/sh/g, "s");
  if (foldEnding)
    s = s.replace(/[aeiou]+$/g, "a");
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max)
    return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1;i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1;j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max)
      return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function tokenMatch(heard, target, fuzzy) {
  if (heard === target)
    return "exact";
  if (target.length <= 3)
    return null;
  if (heard.startsWith("chh") !== target.startsWith("chh") && (heard.startsWith("ch") || target.startsWith("ch")))
    return null;
  const ph = phonetic(heard), pt = phonetic(target);
  const short = pt.length <= 4;
  if (short ? phonetic(heard, false) === phonetic(target, false) : ph === pt)
    return "sound-alike";
  if (!fuzzy)
    return null;
  if (pt.length >= 8 && ph.slice(0, 3) === pt.slice(0, 3) && lev(ph, pt, 1) <= 1)
    return "fuzzy";
  return null;
}
function exactToken(heard, target) {
  return heard === target;
}
function compile(words, serverWords = []) {
  const entries = [];
  const allow = new Set;
  const phrases = [];
  const addSafe = (text) => {
    const tokens = normalize(text).map(squash);
    if (tokens.length === 1)
      allow.add(tokens[0]);
    else if (tokens.length > 1)
      phrases.push(tokens);
  };
  for (const w of words) {
    if (w.category === "allow") {
      addSafe(w.word);
      continue;
    }
    const tokens = normalize(w.word);
    if (!tokens.length)
      continue;
    entries.push({ category: w.category, word: w.word, tokens });
  }
  serverWords.forEach(addSafe);
  return { entries, allow, phrases };
}
var VC_CONTEXT = new Set([
  "join",
  "joined",
  "joining",
  "aa",
  "aaja",
  "aajao",
  "aao",
  "ao",
  "mein",
  "me",
  "mai",
  "main",
  "in",
  "chal",
  "chalo",
  "leave",
  "left",
  "wale",
  "wala",
  "wali",
  "se",
  "pe",
  "par",
  "on",
  "off",
  "call",
  "voice",
  "channel",
  "chat",
  "server",
  "gangster",
  "gangstar",
  "gangsters"
]);
var VC_LIKE = new Set(["bc", "mc", "vc", "bsi", "vsi"]);
function blockedTokens(tokens, list) {
  const sq = tokens.map(squash);
  const blocked = sq.map((t) => list.allow.has(t));
  for (const p of list.phrases) {
    for (let i = 0;i + p.length <= sq.length; i++) {
      if (p.every((t, k) => sq[i + k] === t))
        for (let k = 0;k < p.length; k++)
          blocked[i + k] = true;
    }
  }
  for (let i = 0;i < tokens.length; i++) {
    if (!VC_LIKE.has(tokens[i]))
      continue;
    if (VC_CONTEXT.has(tokens[i - 1] ?? "") || VC_CONTEXT.has(tokens[i + 1] ?? ""))
      blocked[i] = true;
  }
  return blocked;
}
function findMatches(transcript, list, fuzzy = true) {
  const tokens = normalize(transcript);
  const blocked = blockedTokens(tokens, list);
  const found = [];
  const seen = new Set;
  for (const e of list.entries) {
    if (e.category === "sexual") {
      for (let start = 0;start + e.tokens.length <= tokens.length; start++) {
        if (e.tokens.some((target, offset) => blocked[start + offset] || !exactToken(tokens[start + offset], target)))
          continue;
        const key = `${e.category}|${e.word}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ category: e.category, word: e.word, heard: tokens.slice(start, start + e.tokens.length).join(" "), how: "exact" });
        }
        break;
      }
      continue;
    }
    for (let start = 0;start < tokens.length; start++) {
      if (blocked[start])
        continue;
      let first = tokenMatch(tokens[start], e.tokens[0], fuzzy);
      let pos = start;
      if (!first && e.tokens.length === 1 && e.tokens[0].length >= 5 && start + 1 < tokens.length && !blocked[start + 1]) {
        const joined = tokens[start] + tokens[start + 1];
        if (joined === e.tokens[0] || squash(joined) === squash(e.tokens[0])) {
          first = "exact";
          pos = start + 1;
        }
      }
      if (!first)
        continue;
      let how = first, ok = true;
      for (let k = 1;k < e.tokens.length && ok; k++) {
        ok = false;
        for (let gap = 1;gap <= 3 && pos + gap < tokens.length; gap++) {
          const m = tokenMatch(tokens[pos + gap], e.tokens[k], fuzzy);
          if (m && !blocked[pos + gap]) {
            if (m !== "exact")
              how = m;
            pos += gap;
            ok = true;
            break;
          }
        }
      }
      if (!ok)
        continue;
      const key = e.category + "|" + e.word;
      if (seen.has(key))
        break;
      seen.add(key);
      found.push({ category: e.category, word: e.word, heard: tokens.slice(start, pos + 1).join(" "), how });
      break;
    }
  }
  return found.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}
function worst(matches) {
  return matches[0] ?? null;
}
