ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS alert_role_ids text[] NOT NULL DEFAULT '{}';
UPDATE public.bot_settings SET alert_role_ids = ARRAY[alert_role_id] WHERE cardinality(alert_role_ids) = 0 AND alert_role_id <> '';
ALTER TABLE public.infractions ADD COLUMN IF NOT EXISTS guild_id text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS ai_verdict text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS ai_reason text NOT NULL DEFAULT '';
CREATE TABLE public.punishment_appeals (
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
CREATE POLICY "admins read appeals" ON public.punishment_appeals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX punishment_appeals_pending_idx ON public.punishment_appeals(status, created_at DESC);
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