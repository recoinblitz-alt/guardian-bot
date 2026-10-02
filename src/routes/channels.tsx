import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Panel } from "@/components/Shell";
import { useSettings, type Settings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/channels")({
  head: () => ({
    meta: [
      { title: "Channels & roles — VoiceGuard" },
      { name: "description", content: "Choose which voice channels the bot watches and where it reports." },
      { property: "og:title", content: "Channels & roles — VoiceGuard" },
      { property: "og:description", content: "Choose which voice channels the bot watches and where it reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="Channels & roles">
      <Channels />
    </Shell>
  ),
});

const toList = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{5,25}$/.test(x));

function Channels() {
  const { data, save } = useSettings();
  const [f, setF] = useState<Partial<Settings> & { vc: string; tc: string; iu: string; ir: string }>({ vc: "", tc: "", iu: "", ir: "" });
  useEffect(() => {
    if (data) setF({ ...data, vc: data.voice_channel_ids.join("\n"), tc: (data.text_channel_ids ?? []).join("\n"), iu: data.ignored_user_ids.join("\n"), ir: data.ignored_role_ids.join("\n") });
  }, [data]);
  if (!data) return null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({
          voice_channel_ids: toList(f.vc),
          text_channel_ids: toList(f.tc),
          text_all_channels: !!f.text_all_channels,
          ignored_user_ids: toList(f.iu),
          ignored_role_ids: toList(f.ir),
          log_channel_id: (f.log_channel_id ?? "").trim(),
          alert_channel_id: (f.alert_channel_id ?? "").trim(),
          alert_role_id: (f.alert_role_id ?? "").trim(),
        });
      }}
    >
      <p className="mb-6 text-sm text-muted-foreground">
        Tip: in Discord turn on Settings → Advanced → Developer Mode, then right-click a channel or role → “Copy ID”.
      </p>
      <Panel title="Voice channels to watch" desc="The bot joins these automatically and stays. One ID per line.">
        <Textarea rows={4} className="font-mono" value={f.vc} onChange={(e) => setF({ ...f, vc: e.target.value })} />
      </Panel>
      <Panel title="Text channels to watch" desc="Messages with slang are deleted and get the same punishment as voice. One ID per line (e.g. #general).">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.text_all_channels} onChange={(e) => setF({ ...f, text_all_channels: e.target.checked })} />
          Watch every text channel in the server
        </label>
        <Textarea rows={3} className="font-mono" disabled={!!f.text_all_channels} value={f.tc} onChange={(e) => setF({ ...f, tc: e.target.value })} />
      </Panel>
      <Panel title="Reporting">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Log channel ID" hint="Every warn/timeout/ban is posted here" value={f.log_channel_id ?? ""} onChange={(v) => setF({ ...f, log_channel_id: v })} />
          <Field label="Alert channel ID" hint="Provoking alerts go here" value={f.alert_channel_id ?? ""} onChange={(v) => setF({ ...f, alert_channel_id: v })} />
          <Field label="Role to tag" hint="Admin / moderator role ID" value={f.alert_role_id ?? ""} onChange={(v) => setF({ ...f, alert_role_id: v })} />
        </div>
      </Panel>
      <Panel title="Never moderate" desc="User or role IDs the bot should ignore. One per line.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Users</Label>
            <Textarea rows={3} className="font-mono" value={f.iu} onChange={(e) => setF({ ...f, iu: e.target.value })} />
          </div>
          <div>
            <Label>Roles</Label>
            <Textarea rows={3} className="font-mono" value={f.ir} onChange={(e) => setF({ ...f, ir: e.target.value })} />
          </div>
        </div>
      </Panel>
      <Button type="submit">Save</Button>
    </form>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
