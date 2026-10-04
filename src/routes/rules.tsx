import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Panel } from "@/components/Shell";
import { useSettings } from "@/lib/settings";
import type { LadderStep } from "@/lib/punish";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  const [conf, setConf] = useState(85);
  const [confShort, setConfShort] = useState(92);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<"openai_compatible" | "anthropic">("openai_compatible");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLadder(data.ladder as unknown as LadderStep[]);
    setWeights(data.category_weights as Record<string, number>);
    setExpiry(data.warning_expiry_days);
    setInstantBan(data.sexual_instant_ban);
    setFuzzy(data.fuzzy_matching);
    setConf(Math.round((data.min_confidence ?? 0.85) * 100));
    setConfShort(Math.round((data.min_confidence_short ?? 0.92) * 100));
    setAiEnabled(data.ai_enabled ?? false);
    setAiProvider(data.ai_provider ?? "openai_compatible");
    setAiBaseUrl(data.ai_base_url ?? "");
    setAiModel(data.ai_model ?? "");
    setAiKey(data.ai_api_key ?? "");
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

      <Panel
        title="Voice: how sure before punishing"
        desc="Speech-to-text gives every word a 'how sure' score. The bot only punishes voice when it is at least this sure about the bad word. Higher = fewer wrong punishments, but mumbled slang may be missed."
      >
        <div className="space-y-5">
          <ConfRow label="Normal words" value={conf} onChange={setConf} />
          <ConfRow label="Short words (bc, mc, bsdk…)" value={confShort} onChange={setConfShort} />
        </div>
      </Panel>

      <Panel
        title="AI context check"
        desc="After a keyword matches, the AI reads the full sentence before any punishment. Safe context is ignored; uncertain results go to moderator review."
      >
        <div className="space-y-5">
          <Row label="Check meaning before punishment" desc="Only matched sentences are sent to the selected AI provider." checked={aiEnabled} onChange={setAiEnabled} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Provider format</Label>
              <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as typeof aiProvider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compatible">OpenAI-compatible</SelectItem>
                  <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ai-model">Model</Label>
              <Input id="ai-model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder={aiProvider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini"} />
            </div>
          </div>
          <div>
            <Label htmlFor="ai-base-url">Base URL</Label>
            <Input
              id="ai-base-url"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder={aiProvider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
              autoComplete="url"
            />
            <p className="mt-1 text-xs text-muted-foreground">OpenAI, OpenRouter, Groq, Together, local compatible servers, and native Claude are supported.</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="ai-key">API key</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAiKey(!showAiKey)}>
                {showAiKey ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}{showAiKey ? "Hide" : "Show"}
              </Button>
            </div>
            <Input id="ai-key" type={showAiKey ? "text" : "password"} value={aiKey} onChange={(e) => setAiKey(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={testingAi || !aiKey.trim() || !aiModel.trim()}
              onClick={async () => {
                setTestingAi(true);
                await save({ ai_enabled: aiEnabled, ai_provider: aiProvider, ai_base_url: aiBaseUrl.trim(), ai_model: aiModel.trim(), ai_api_key: aiKey.trim() });
                try {
                  const response = await fetch("/api/public/bot/ai-check", {
                    method: "POST",
                    headers: { "content-type": "application/json", "x-bot-key": data.bot_api_key },
                    body: JSON.stringify({ transcript: "This is a connection test, not abuse.", matched: "test", keyword: "test", category: "mild", source: "text", test: true }),
                  });
                  const result = await response.json();
                  if (!response.ok || String(result.reason || "").startsWith("AI provider error") || String(result.reason || "").startsWith("AI connection failed")) throw new Error(result.reason || result.error || "Connection failed");
                  toast.success(`AI connected — test verdict: ${result.verdict}`);
                } catch (error) {
                  toast.error(String((error as Error)?.message || error));
                } finally {
                  setTestingAi(false);
                }
              }}
            >
              {testingAi ? "Testing…" : "Save & test connection"}
            </Button>
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
            min_confidence: conf / 100,
            min_confidence_short: confShort / 100,
            ai_enabled: aiEnabled,
            ai_provider: aiProvider,
            ai_base_url: aiBaseUrl.trim(),
            ai_model: aiModel.trim(),
            ai_api_key: aiKey.trim(),
          })
        }
      >
        Save rules
      </Button>
    </>
  );
}

function ConfRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-primary">{value}%</span>
      </div>
      <Slider min={50} max={99} step={1} value={[value]} onValueChange={(v) => onChange(v[0] ?? value)} />
    </div>
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
