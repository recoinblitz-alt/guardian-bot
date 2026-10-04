# Roadmap

- [x] Send uncertain voice matches to moderator review.
- [x] Add Warn, 10-minute Timeout, Ban, and Ignore controls.
- [x] Keep exact and high-confidence matches automatic.
- [x] Verify button handling and package the updated bot.

- [x] Require exact matching for sexual words and phrases.
- [x] Ignore Discord emoji, mention, link, and channel markup in text moderation.
- [x] Send every non-exact voice match to moderator review.
- [x] Filter background noise before transcription and punishment.
- [ ] Clear the two reported false infractions. Blocked: they are in the user's external deployment, not the connected app database.
- [x] Verify matcher and bot syntax. Existing unrelated route-render tests still fail.

- [x] Add optional AI context checking after keyword matches and before punishment.
- [x] Support custom OpenAI-compatible endpoints and native Anthropic Claude.
- [x] Keep AI credentials server-side and add dashboard save/test controls.
- [x] Route safe verdicts to ignore and uncertain/API failures to moderator review.
- [x] Apply AI context checks to both voice and text moderation.
