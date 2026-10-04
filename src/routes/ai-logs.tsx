import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, CircleSlash2, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shell } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABEL } from "@/lib/settings";

export const Route = createFileRoute("/ai-logs")({
  head: () => ({
    meta: [
      { title: "AI Logs — VoiceGuard" },
      { name: "description", content: "Review every AI context decision made by VoiceGuard." },
      { property: "og:title", content: "AI Logs — VoiceGuard" },
      { property: "og:description", content: "Review every AI context decision made by VoiceGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="AI decision logs">
      <AiLogsPage />
    </Shell>
  ),
});

const VERDICTS = {
  violation: { label: "Violation", icon: ShieldCheck, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  safe: { label: "Safe", icon: CheckCircle2, className: "border-success/40 bg-success/10 text-success" },
  uncertain: { label: "Needs review", icon: AlertTriangle, className: "border-accent/40 bg-accent/10 text-accent" },
} as const;

const OUTCOMES: Record<string, string> = {
  punishment_continued: "Punishment continued",
  ignored: "Ignored — no points",
  moderator_review: "Sent to moderator review",
  connection_test: "Connection test only",
};

function AiLogsPage() {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["ai-decision-logs"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ai_decision_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return rows;
    },
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => ({
    all: data.length,
    violation: data.filter((row) => row.verdict === "violation").length,
    safe: data.filter((row) => row.verdict === "safe").length,
    uncertain: data.filter((row) => row.verdict === "uncertain").length,
  }), [data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return data.filter((row) => {
      if (verdict !== "all" && row.verdict !== verdict) return false;
      if (!term) return true;
      return [row.transcript, row.matched, row.keyword, row.reason, row.model]
        .some((value) => value.toLocaleLowerCase().includes(term));
    });
  }, [data, query, verdict]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Checks" value={counts.all} icon={Bot} />
        <Summary label="Violations" value={counts.violation} icon={ShieldCheck} />
        <Summary label="Safe" value={counts.safe} icon={CheckCircle2} />
        <Summary label="Needs review" value={counts.uncertain} icon={AlertTriangle} />
      </div>

      <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sentence, keyword, reason or model…"
            className="pl-9"
          />
        </div>
        <Select value={verdict} onValueChange={setVerdict}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by verdict">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verdicts</SelectItem>
            <SelectItem value="violation">Violations</SelectItem>
            <SelectItem value="safe">Safe</SelectItem>
            <SelectItem value="uncertain">Needs review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map((row) => {
          const details = VERDICTS[row.verdict as keyof typeof VERDICTS] ?? VERDICTS.uncertain;
          const VerdictIcon = details.icon;
          return (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={details.className}>
                      <VerdictIcon className="mr-1.5 h-3.5 w-3.5" />{details.label}
                    </Badge>
                    <Badge variant="secondary">{row.source === "voice" ? "Voice" : "Text"}</Badge>
                    {row.is_test && <Badge variant="outline">Test</Badge>}
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-sm font-medium">“{row.transcript}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Heard <span className="font-mono text-foreground">{row.matched}</span> · keyword <span className="font-mono text-foreground">{row.keyword}</span> · {CATEGORY_LABEL[row.category] ?? row.category}
                  </p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <div className="text-xs font-semibold text-foreground">{OUTCOMES[row.outcome] ?? row.outcome}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{row.provider} · {row.model}</div>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">AI reason:</span> {row.reason}
              </div>
            </article>
          );
        })}
        {!isLoading && !filtered.length && (
          <div className="flex min-h-52 flex-col items-center justify-center border-y border-border text-center">
            <CircleSlash2 className="h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No AI decisions found</p>
            <p className="mt-1 text-xs text-muted-foreground">New checks appear here automatically.</p>
          </div>
        )}
        {isLoading && <div className="py-16 text-center font-mono text-sm text-muted-foreground">Loading AI decisions…</div>}
      </div>
    </div>
  );
}

function Summary({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Bot }) {
  return (
    <div className="border-l-2 border-primary bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}