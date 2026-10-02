import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Panel } from "@/components/Shell";
import { useSettings } from "@/lib/settings";
import type { LadderStep } from "@/lib/punish";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "Punishment rules — VoiceGuard" },
      { name: "description", content: "Set when users get warned, timed out or banned." },
      { property: "og:title", content: "Punishment rules — VoiceGuard" },
      { property: "og:description", content: "Set when users get warned, timed out or banned." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="Punishment rules">
      <Rules />
    </Shell>
  ),
});

function Rules() {
  const { data, save } = useSettings();
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [expiry, setExpiry] = useState(30);
  const [instantBan, setInstantBan] = useState(true);
  const [fuzzy, setFuzzy] = useState(true);

  useEffect(() => {
    if (!data) return;
    setLadder(data.ladder as unknown as LadderStep[]);
    setWeights(data.category_weights as Record<string, number>);
    setExpiry(data.warning_expiry_days);
    setInstantBan(data.sexual_instant_ban);
    setFuzzy(data.fuzzy_matching);
  }, [data]);
  if (!data) return null;

  const upd = (i: number, p: Partial<LadderStep>) => setLadder(ladder.map((s, j) => (j === i ? { ...s, ...p } : s)));

  return (
    <>
      <Panel title="How many points each slang is worth" desc="Every offence adds points. Points decide the punishment below.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(["mild", "abuse", "severe"] as const).map((c) => (
            <div key={c}>
              <Label className="capitalize">{c}</Label>
              <Input type="number" min={0} max={20} value={weights[c] ?? 1} onChange={(e) => setWeights({ ...weights, [c]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Punishment ladder" desc="When a user's total points reach a level, this happens. Default: 3 warnings, then timeout, then longer timeout, then ban.">
        <div className="space-y-2">
          {[...ladder].map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-background p-2">
              <span className="text-sm text-muted-foreground">At</span>
              <Input type="number" min={1} className="w-20" value={s.from} onChange={(e) => upd(i, { from: Number(e.target.value) })} />
              <span className="text-sm text-muted-foreground">points →</span>
              <Select value={s.action} onValueChange={(v) => upd(i, { action: v as LadderStep["action"] })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                  <SelectItem value="ban">Ban</SelectItem>
                </SelectContent>
              </Select>
              {s.action === "timeout" && (
                <>
                  <Input type="number" min={1} max={40320} className="w-24" value={Math.round(s.duration / 60)} onChange={(e) => upd(i, { duration: Number(e.target.value) * 60 })} />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </>
              )}
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setLadder(ladder.filter((_, j) => j !== i))} aria-label="Remove step">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLadder([...ladder, { from: (ladder.at(-1)?.from ?? 0) + 1, action: "timeout", duration: 600 }])}>
          <Plus className="mr-1 h-4 w-4" /> Add step
        </Button>
      </Panel>

      <Panel title="Other rules">
        <div className="space-y-5">
          <Row label="Sexual harassment = instant ban" desc="Skip the ladder and ban right away." checked={instantBan} onChange={setInstantBan} />
          <Row label="Catch near-misses" desc="Also catch slightly mis-heard words. Turn off if you get wrong punishments." checked={fuzzy} onChange={setFuzzy} />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Points expire after</div>
              <div className="text-xs text-muted-foreground">Old offences stop counting after this many days.</div>
            </div>
            <Input type="number" min={1} max={365} className="w-24" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} />
          </div>
        </div>
      </Panel>

      <Button
        onClick={() =>
          save({
            ladder: [...ladder].sort((a, b) => a.from - b.from) as never,
            category_weights: weights,
            warning_expiry_days: Math.max(1, expiry),
            sexual_instant_ban: instantBan,
            fuzzy_matching: fuzzy,
          })
        }
      >
        Save rules
      </Button>
    </>
  );
}

function Row({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
