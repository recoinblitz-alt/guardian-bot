# Discord moderation controls and account security

## Build
- Add Discord user ID, username, and channel details to every AI decision record and display them in AI Logs.
- Post every AI decision to the configured Alert channel, clearly showing the user, sentence, matched keyword, verdict, reason, and outcome.
- Add dashboard settings for one command channel plus allowed Discord user IDs and role IDs.
- Replace the current word commands with structured `/add` and `/remove` commands. Restrict execution to the configured channel and configured users/roles, while retaining Discord administrators as a safe fallback. Replies remain private.
- Add an Account page where the signed-in administrator can change their own password with confirmation and validation.
- Update the complete self-hosted database setup, generated schema types, deployment documentation, and tests.

## Safety and behavior
- The AI API key remains server-only and is never included in bot configuration or logs.
- Test AI checks remain visible in the web log but are not posted to Discord alerts.
- A failed Alert-channel post does not block moderation; a failed AI check still goes to moderator review.
- Word commands never run outside the selected channel or for an unapproved member.

## Technical details
- Add nullable/defaulted columns to `bot_settings` for command channel, allowed users, and allowed roles.
- Add user/channel attribution columns to `ai_decision_logs`.
- Extend the bot AI request with Discord identity and channel information, and use the existing bot process to post the resulting verdict to Discord.
- Use the existing signed-in account session to update the password; no shared password is introduced.
