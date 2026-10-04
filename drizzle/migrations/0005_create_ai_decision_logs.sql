CREATE TABLE public.ai_decision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript text NOT NULL DEFAULT '',
  matched text NOT NULL DEFAULT '',
  keyword text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'text' CHECK (source IN ('voice', 'text')),
  verdict text NOT NULL CHECK (verdict IN ('violation', 'safe', 'uncertain')),
  reason text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '' CHECK (outcome IN ('punishment_continued', 'ignored', 'moderator_review', 'connection_test')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_decision_logs TO authenticated;
GRANT ALL ON public.ai_decision_logs TO service_role;
ALTER TABLE public.ai_decision_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai decision logs" ON public.ai_decision_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX ai_decision_logs_created_at_idx ON public.ai_decision_logs (created_at DESC);
CREATE INDEX ai_decision_logs_verdict_idx ON public.ai_decision_logs (verdict, created_at DESC);