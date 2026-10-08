<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- The Discord bot runs outside Lovable (user's 24/7 host); this app is only the control panel + API. Why: voice listening needs a persistent process.
- Bot talks to the app only via `/api/public/bot/$action` authenticated by `x-bot-key` (stored in `bot_settings.bot_api_key`). Why: no service keys leave the backend.
- Punishment appeals are stored per infraction, submitted only for the Discord interaction user's own case, and claimed atomically before moderator decisions; pardon only that case and reverse Discord restrictions only when their recorded expiry or case-tagged ban reason still matches. Why: survive restarts, block duplicate decisions, and never undo another punishment.
- Alert roles use the array setting with the first role mirrored to the legacy field. Why: keep existing deployments compatible while allowing multiple moderator tags.
- Keyword matches may be context-checked by the configured AI provider before server-side punishment decisions; punishment requires clear abusive intent in the full sentence, every decision is logged, safe results are ignored, and ambiguous/errors require moderator review. Why: prevent homophones and innocent multilingual meanings from causing punishment while keeping an auditable decision trail.
- `src/lib/matcher.ts` is the single slang matcher; the bot's `matcher.js` is generated from it with `bun build --format=cjs`. Why: dashboard test box behaves exactly like the bot.
- Deepgram recognition hints are safe server terms only; adaptive noise filtering runs before transcription, non-exact voice matches require moderator review, and sexual terms match exactly. Why: slang hints, noise, and phonetic matching can cause severe false punishments.
- Single-row `bot_settings` (id=1); first signed-up user becomes admin via trigger; all tables admin-only via `has_role`.
- `supabase/setup.sql` is the full self-host schema + seed (concatenated drizzle migrations + slang seed); keep it in sync when the schema changes. Why: user moves the DB to their own Supabase.
- `netlify.toml` builds with `NITRO_PRESET=netlify` for self-hosting; Lovable hosting ignores it. Why: user deploys to Netlify.
