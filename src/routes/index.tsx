import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Panel, ActionBadge } from "@/components/Shell";
import { useSettings, CATEGORY_LABEL } from "@/lib/settings";
import { CredentialsPanel } from "@/components/CredentialsPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — VoiceGuard" },
      { name: "description", content: "Live status of your Discord voice moderation bot." },
      { property: "og:title", content: "VoiceGuard — Discord voice moderation" },
      { property: "og:description", content: "Live status of your Discord voice moderation bot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="Overview">
      <Overview />
    </Shell>
  ),
});

type Status = {
  voice_channels?: string[];
  active_key?: number;
  keys?: { id: number; usedMinutes: number; limitMinutes: number; exhausted: boolean; reason?: string }[];
  guilds?: string[];
};

function Overview() {
  const { data: s, save } = useSettings();
  const [show, setShow] = useState(false);
  const recent = useQuery({
    queryKey: ["recent"],
    queryFn: async () => (await supabase.from("infractions").select("*").order("created_at", { ascending: false }).limit(8)).data ?? [],
    refetchInterval: 15000,
  });
  if (!s) return null;
  const online = s.bot_last_seen && Date.now() - new Date(s.bot_last_seen).getTime() < 3 * 60_000;
  const st = (s.bot_status ?? {}) as Status;
  const apiBase = typeof window !== "undefined" ? `${window.location.origin}/api/public/bot` : "";

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Bot" value={online ? "Online" : "Offline"} tone={online ? "text-success" : "text-destructive"} />
        <Stat label="Listening in" value={`${st.voice_channels?.length ?? 0} voice channels`} />
        <Stat label="Deepgram key in use" value={st.active_key ? `#${st.active_key}` : "—"} />
      </div>

      <Panel title="Connect your bot" desc="Put these two lines in your bot's .env file. Keep the key private.">
        <div className="space-y-2 rounded-md bg-background p-4 font-mono text-xs">
          <div className="break-all">PANEL_URL={apiBase}</div>
          <div className="flex items-center gap-2 break-all">
            BOT_KEY={show ? s.bot_api_key : "•".repeat(24)}
            <button onClick={() => setShow(!show)} className="text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            navigator.clipboard.writeText(`PANEL_URL=${apiBase}\nBOT_KEY=${s.bot_api_key}`);
            toast.success("Copied");
          }}
        >
          <Copy className="mr-2 h-3.5 w-3.5" /> Copy both
        </Button>
      </Panel>

      <CredentialsPanel s={s} save={save} />

      <Panel title="Deepgram keys" desc="Reported by the bot. When a key runs out it switches to the next one automatically.">
        {st.keys?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {st.keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-mono">Key #{k.id}</span>
                <span className="text-muted-foreground">
                  {k.usedMinutes.toFixed(1)} / {k.limitMinutes} min
                </span>
                {k.exhausted ? <Badge variant="destructive">used up</Badge> : k.id === st.active_key ? <Badge>active</Badge> : <Badge variant="secondary">ready</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Start the bot to see key usage here.</p>
        )}
      </Panel>

      <Panel title="Latest actions">
        {recent.data?.length ? (
          <ul className="divide-y divide-border">
            {recent.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <ActionBadge action={r.action} />
                <span className="font-semibold">{r.username || r.discord_user_id}</span>
                <span className="text-muted-foreground">said “{r.matched}”</span>
                <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet — the voice channels are clean.</p>
        )}
      </Panel>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

