# Fix wrong voice catches, wrong text catches, and clearer warnings

## What is going wrong (found in the code)

1. **The bot is telling Deepgram to listen for slang.** Right now ~50 slang words (chutiya, bc, lund, ...) are sent to Deepgram as "words to expect". Deepgram then leans toward hearing those words, so normal speech like "VC" becomes "BC". This is the main cause of the wrong voice catches.
2. **Low-confidence words are still acted on.** Deepgram gives a confidence score for each word, but the bot ignores it. Mumbled or noisy words count the same as clear ones.
3. **"cutie" matched "chutiye".** The sound-alike rule treats "c" and "ch" as the same sound.
4. **"to tt" matched "thot".** The bot joins two short words together and then does a sound-alike check on the result.
5. **Warning messages to the user are vague.** The private warning only says "please don't use abusive language".

## The fix

### Voice listening (Deepgram)
- Stop sending slang words to Deepgram. Instead send **your server's own words** so it hears them correctly: VC, Gangster MC, and any names you add.
- New box on **Channels & roles**: "Server words" (one per line, e.g. `VC`, `Gangster MC`, nicknames). These are sent to Deepgram and also treated as always safe.
- Only punish a voice catch when Deepgram is **confident about that exact word** (default 85%). Short words like bc / mc / bsdk need **92%**. Both are adjustable on **Punishment rules**.
- Context rule for "bc" / "mc": not punished when it appears next to things like `join`, `aa`, `aaja`, `mein`, `me`, `in`, `chal`, `leave`, `wale`, or right after `gangster`/`gangstar` (so "VC join karo" and "Gangster MC" are safe even if Deepgram writes them wrong).
- Small noise improvements: ignore 1-word voice clips under 0.4 seconds, and a slightly higher noise gate, so background sounds stop turning into made-up words.

### Matching (voice and text)
- "c" and "ch" are treated as different sounds, so cutie / cute / cutting no longer match chutiya.
- Joining two words together (like "behen chod" → behenchod) only counts on an **exact** match and only for words of 5+ letters, so "to tt" no longer matches "thot".
- Allow-list can now contain **phrases** (e.g. `gangster mc`). A phrase only protects that whole phrase, it never makes "mc" safe on its own (this prevents the earlier `chut-putiya` problem).
- Add common safe words to the allow-list: cutie, cute, vc, gangster mc, gangstar mc, to, toh, tt.

### Clearer warnings
- Private message to the user now says exactly:
  - what they said (the full sentence, with the bad word highlighted)
  - which word it was caught as, and the type
  - where (voice channel or text channel)
  - their points now, and what happens next (e.g. "2 more points = 10 min timeout")
- In text channels, a short notice is also posted in the channel ("@user, your message was removed for saying **X**"), which deletes itself after 10 seconds.
- Same details added to timeout and ban messages (sent before the timeout/ban happens).
- Log channel embed gets a "Confidence" line for voice catches, so you can see how sure Deepgram was.

## About "99% accuracy"
No speech-to-text service can promise 99% on Discord voice with mixed Hindi/English and background noise. These changes target the real problem — **wrong punishments** — so the bot only acts when it is very sure. Some real slang that is mumbled may be missed; you can lower the confidence setting if you want stricter catching.

## After this
- Download the updated bot files (or redeploy on Render) and restart the bot.
- I will test the examples from your screenshot ("cutie", "to tt", "VC join karo", "Gangster MC") in the panel test box to confirm none are flagged, while real slang still is.

## Technical details
- `bot/deepgram-manager.js`: remove hard-coded slang `keyterms`; pass `server_words` as `keyterm`; forward `alternative.words` (word, confidence, start, end) in `onTranscript`.
- `bot/index.js`: stop passing `compiled.entries` as keyterms; pass word confidences to `moderate`; drop matches whose matched words fall below `min_confidence` / `min_confidence_short` (short = target ≤ 4 letters); drop single-word clips < 400 ms; default `VAD_THRESHOLD` 900; new DM/notice text built from transcript + `m.heard` + `m.word` + next ladder step (returned by the offense API).
- `src/lib/matcher.ts`: in `phonetic`, map lone `c` → `k` before `ch` → `c`; compound join requires `exact` and target length ≥ 5; allow-list split into `allowTokens` (single word) and `allowPhrases` (multi-word, blocks only the covered token span); built-in bc/mc context guard. Regenerate `bot/matcher.js` with `bun build --format=cjs`.
- `src/lib/punish.ts` / `bot.$action.ts`: offense response also returns `next` (points to next step + its action/duration) for the DM text.
- Migration: `bot_settings` add `server_words text[] default '{VC,Gangster MC}'`, `min_confidence real default 0.85`, `min_confidence_short real default 0.92`; insert the new allow-list words. Mirror in `supabase/setup.sql`.
- UI: Server words textarea on Channels & roles; two confidence sliders on Punishment rules; Word lists test box shows phrase allow-list.
