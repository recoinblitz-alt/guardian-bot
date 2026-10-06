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
- [x] Store every AI verdict and show searchable, filterable AI logs in the dashboard.
- [x] Require clear abusive intent from the full sentence and send ambiguous AI decisions to moderator review.
- [x] Protect Roman-Hindi holiday spellings such as chuttiya/chhuttiyan from false punishment.

- [ ] Add Discord user and channel attribution to AI decision logs and Alert-channel posts.
- [ ] Add channel-restricted `/add` and `/remove` commands with dashboard-managed user/role access.
- [ ] Add signed-in administrator password change controls.
