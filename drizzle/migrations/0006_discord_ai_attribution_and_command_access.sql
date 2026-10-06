ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS command_channel_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS command_allowed_user_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS command_allowed_role_ids text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.ai_decision_logs
  ADD COLUMN IF NOT EXISTS discord_user_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS username text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS channel_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS channel_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ai_decision_logs_discord_user_idx
  ON public.ai_decision_logs (discord_user_id, created_at DESC);