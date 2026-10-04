# AI context check before punishment

## Goal
Add an optional second-stage meaning check after VoiceGuard finds a configured keyword. The AI reads the full sentence and decides whether the matched term is actual abuse in context before any automatic punishment.

## Dashboard
- Add an **AI context check** section to Rules.
- Controls: enabled switch, provider selector, base URL, model, API key, and **Test connection**.
- Support:
  - OpenAI-compatible APIs through a configurable chat-completions base URL.
  - Anthropic Claude through its native Messages API.
- Mask the saved key and keep it out of bot configuration responses.

## Decision flow
```text
Keyword match
  -> AI disabled: current strict rules continue
  -> AI says violation: current punishment ladder continues
  -> AI says safe: ignore and record no points
  -> AI says uncertain or provider fails: send to moderator review
```
- Apply the check to text and voice matches, including sexual-category matches.
- Ask for a strict JSON verdict with `violation`, `safe`, or `uncertain`, plus a short reason.
- Treat malformed output, timeout-like network failures, and provider errors as uncertain; never punish automatically.
- Keep existing speech confidence checks before the AI call, so noise and weak transcription are filtered first.

## Security and cost
- Store the provider key in the protected single-row settings used by the owner dashboard.
- Never include the AI key in the bot's config or credentials response.
- The Discord bot submits only sentences that already matched a keyword, avoiding AI calls for normal conversation.
- The server contacts the configured provider; provider credentials never reach Discord clients.

## Database and self-hosting
- Add settings for enabled state, provider, base URL, model, and API key.
- Add a migration and keep the full self-host setup SQL in sync.
- Update generated database types and deployment documentation.

## Verification
- Test connection handling for both provider formats without exposing credentials.
- Verify violation, safe, uncertain, malformed-response, and provider-failure behavior.
- Confirm the dashboard works on desktop and mobile and the project builds successfully.
