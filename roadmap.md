# Roadmap

- [ ] Prevent message deletion when punishment recording fails; surface failures to moderators and test the ordering.
- [ ] Provide a rerunnable SQL upgrade for AI logging, appeals, and punishment recording permissions.

- [x] Add durable punishment appeals, explanation submission, moderator decisions and specific-punishment reversal.
- [x] Support multiple reporting roles while preserving the existing selection.
- [x] Verify appeal safeguards and signed-in reporting controls (4 appeal-policy tests, 12 AI tests; save/reload and unauthorized API rejection).
- [ ] Verify appeals in the user's live Discord server. Blocked: the bot runs on the user's external host; redeploy and a real punishment/appeal are required.

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

- [x] Add Discord user and channel attribution to AI decision logs and Alert-channel posts.
- [x] Add channel-restricted `/add` and `/remove` commands with dashboard-managed user/role access.
- [x] Add signed-in administrator password change controls.
