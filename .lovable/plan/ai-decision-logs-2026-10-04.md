# AI decision logs

## Build
- Add an admin-only AI decision log table storing the checked sentence, matched keyword, verdict, reason, provider/model, source, and resulting outcome.
- Record every AI check, including safe, violation, uncertain, provider errors, and connection tests.
- Add an **AI Logs** dashboard page with verdict filters, search, summary counts, and clear outcome labels.
- Keep `supabase/setup.sql` synchronized for self-hosted deployments.

## Technical details
- Bot API writes logs using its authenticated server-side database access.
- Dashboard reads are protected by the existing admin role policy.
- Existing moderation remains unchanged: violations continue, safe results stop, and uncertain/errors require review.

## Verification
- Check the new page on desktop and mobile, verify navigation, and confirm the app builds without errors.
