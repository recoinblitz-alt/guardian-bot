# Stricter AI context moderation

## What will change
- Make AI approve punishment only when the full sentence shows clear abusive intent toward a person or group.
- Treat innocent meanings, quotations, discussion, and common Roman-Hindi homophones as safe.
- Treat incomplete or genuinely ambiguous context as uncertain and send it to moderator review.
- Add explicit examples for `chutiya` abuse versus `chuttiya/chhuttiyan` meaning holidays.
- Keep every verdict and reason visible in AI Logs.

## Technical details
- Strengthen the server-side moderation prompt used by configured OpenAI-compatible and Claude providers.
- Require the AI reason to state the contextual meaning and abuse target/evidence.
- Add deterministic protection for clear holiday phrases so provider mistakes cannot punish those examples.
- Add focused tests for safe, violation, and uncertain verdict parsing/context handling.
- Verify the current build and moderation tests.
