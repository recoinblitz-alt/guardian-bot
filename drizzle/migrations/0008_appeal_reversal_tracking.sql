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