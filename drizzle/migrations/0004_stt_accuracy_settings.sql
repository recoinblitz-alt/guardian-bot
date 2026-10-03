ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS server_words text[] NOT NULL DEFAULT '{VC,Gangster MC}'::text[],
  ADD COLUMN IF NOT EXISTS min_confidence real NOT NULL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS min_confidence_short real NOT NULL DEFAULT 0.92;