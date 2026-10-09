ALTER TABLE public.bot_settings
 ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'openai_compatible' CHECK (ai_provider IN ('openai_compatible','anthropic')),
 ADD COLUMN IF NOT EXISTS ai_base_url text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS ai_api_key text NOT NULL DEFAULT '';
GRANT ALL ON public.bot_settings, public.infractions, public.ai_decision_logs, public.punishment_appeals TO service_role;
NOTIFY pgrst, 'reload schema';