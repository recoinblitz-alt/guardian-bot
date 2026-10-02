import { useEffect, useState } from "react";
import { Panel } from "@/components/Shell";
import type { Settings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

const SLOTS = 10;

/** Discord token + Deepgram keys, stored in the panel so the bot needs no .env secrets. */
export function CredentialsPanel({ s, save }: { s: Settings; save: (p: Partial<Settings>) => Promise<void> }) {
  const [token, setToken] = useState("");
  const [keys, setKeys] = useState<string[]>(Array(SLOTS).fill(""));
  const [show, setShow] = useState(false);

  useEffect(() => {
    setToken(s.discord_token ?? "");
    const k = [...(s.deepgram_keys ?? [])];
    setKeys(Array.from({ length: SLOTS }, (_, i) => k[i] ?? ""));
  }, [s.discord_token, s.deepgram_keys]);

  const type = show ? "text" : "password";
  const filled = keys.filter((k) => k.trim()).length;

  return (
    <Panel
      title="Bot token & Deepgram keys"
      desc="Saved here, so the bot doesn't need them in its .env file. After saving, the bot restarts itself within a minute to use them."
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">Discord bot token</label>
            <button onClick={() => setShow(!show)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Hide" : "Show"}
            </button>
          </div>
          <Input type={type} autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="MTE..." className="font-mono text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Deepgram keys ({filled}/{SLOTS})</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {keys.map((k, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <Input
                  type={type}
                  autoComplete="off"
                  value={k}
                  onChange={(e) => setKeys(keys.map((v, j) => (j === i ? e.target.value : v)))}
                  className="font-mono text-xs"
                />
              </div>
            ))}
          </div>
        </div>
        <Button onClick={() => save({ discord_token: token.trim(), deepgram_keys: keys.map((k) => k.trim()).filter(Boolean) })}>Save</Button>
      </div>
    </Panel>
  );
}
