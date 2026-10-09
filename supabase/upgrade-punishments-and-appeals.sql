-- VoiceGuard upgrade: existing installations only. Safe to run again.
-- Preserves existing configuration, words, warnings, and punishment history.
BEGIN;
ALTER TABLE public.bot_settings
 ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'openai_compatible' CHECK (ai_provider IN ('openai_compatible','anthropic')),
 ADD COLUMN IF NOT EXISTS ai_base_url text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS ai_api_key text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS command_channel_id text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS command_allowed_user_ids text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS command_allowed_role_ids text[] NOT NULL DEFAULT '{}';
create table if not exists public.ai_decision_logs (
  id uuid primary key default gen_random_uuid(),
  transcript text not null default '',
  matched text not null default '',
  keyword text not null default '',
  category text not null default '',
  source text not null default 'text' check (source in ('voice','text')),
  verdict text not null check (verdict in ('violation','safe','uncertain')),
  reason text not null default '',
  provider text not null default '',
  model text not null default '',
  outcome text not null default '' check (outcome in ('punishment_continued','ignored','moderator_review','connection_test')),
  is_test boolean not null default false,
  discord_user_id text not null default '',
  username text not null default '',
  channel_id text not null default '',
  channel_name text not null default '',
  created_at timestamptz not null default now()
);
grant select on public.ai_decision_logs to authenticated;
grant all on public.ai_decision_logs to service_role;
alter table public.ai_decision_logs enable row level security;
drop policy if exists "admins read ai decision logs" on public.ai_decision_logs;
create policy "admins read ai decision logs" on public.ai_decision_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create index if not exists ai_decision_logs_created_at_idx on public.ai_decision_logs (created_at desc);
create index if not exists ai_decision_logs_verdict_idx on public.ai_decision_logs (verdict, created_at desc);
ALTER TABLE public.ai_decision_logs
 ADD COLUMN IF NOT EXISTS discord_user_id text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS username text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS channel_id text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS channel_name text NOT NULL DEFAULT '';
create index if not exists ai_decision_logs_discord_user_idx on public.ai_decision_logs (discord_user_id, created_at desc);


ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS alert_role_ids text[] NOT NULL DEFAULT '{}';
UPDATE public.bot_settings SET alert_role_ids = ARRAY[alert_role_id] WHERE cardinality(alert_role_ids) = 0 AND alert_role_id <> '';
ALTER TABLE public.infractions ADD COLUMN IF NOT EXISTS guild_id text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS ai_verdict text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS ai_reason text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS public.punishment_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 infraction_id uuid NOT NULL UNIQUE REFERENCES public.infractions(id),
 discord_user_id text NOT NULL,
 explanation text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','rejected')),
 moderator_id text NOT NULL DEFAULT '', moderator_name text NOT NULL DEFAULT '',
 resolution text NOT NULL DEFAULT '', review_message_id text NOT NULL DEFAULT '', review_channel_id text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
GRANT SELECT ON public.punishment_appeals TO authenticated;
GRANT ALL ON public.punishment_appeals TO service_role;
ALTER TABLE public.punishment_appeals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read appeals" ON public.punishment_appeals;
CREATE POLICY "admins read appeals" ON public.punishment_appeals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS punishment_appeals_pending_idx ON public.punishment_appeals(status, created_at DESC);
CREATE OR REPLACE FUNCTION public.finish_punishment_appeal(_id uuid, _moderator_id text, _approved boolean, _resolution text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 UPDATE public.punishment_appeals SET status = CASE WHEN _approved THEN 'approved' ELSE 'rejected' END, resolution = _resolution, resolved_at = now() WHERE id = _id AND status = 'processing' AND moderator_id = _moderator_id RETURNING infraction_id INTO target;
 IF target IS NULL THEN RAISE EXCEPTION 'Appeal is not claimed by this moderator'; END IF;
 IF _approved THEN UPDATE public.infractions SET cleared = true WHERE id = target; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_punishment_appeal(uuid,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_punishment_appeal(uuid,text,boolean,text) TO service_role;
NOTIFY pgrst, 'reload schema';
ALTER TABLE public.infractions ADD COLUMN IF NOT EXISTS punishment_expires_at timestamptz;
ALTER TABLE public.punishment_appeals ADD COLUMN IF NOT EXISTS claim_token uuid, ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE OR REPLACE FUNCTION public.finish_punishment_appeal(_id uuid, _moderator_id text, _approved boolean, _resolution text, _claim_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 UPDATE public.punishment_appeals SET status = CASE WHEN _approved THEN 'approved' ELSE 'rejected' END, resolution = _resolution, resolved_at = now() WHERE id = _id AND status = 'processing' AND moderator_id = _moderator_id AND claim_token = _claim_token RETURNING infraction_id INTO target;
 IF target IS NULL THEN RAISE EXCEPTION 'Appeal claim is no longer valid'; END IF;
 IF _approved THEN UPDATE public.infractions SET cleared = true WHERE id = target; END IF;
END $$;
REVOKE ALL ON FUNCTION public.finish_punishment_appeal(uuid,text,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_punishment_appeal(uuid,text,boolean,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.finish_punishment_appeal(uuid,text,boolean,text) FROM service_role;
NOTIFY pgrst, 'reload schema';
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.bot_settings, public.infractions, public.ai_decision_logs, public.punishment_appeals, public.slang_words TO service_role;
GRANT SELECT, UPDATE ON public.bot_settings TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.infractions TO authenticated;
GRANT SELECT ON public.ai_decision_logs, public.punishment_appeals TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
