import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Shell, Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [
    { title: "Account security — VoiceGuard" },
    { name: "description", content: "Change the password for your VoiceGuard administrator account." },
    { property: "og:title", content: "Account security — VoiceGuard" },
    { property: "og:description", content: "Change the password for your VoiceGuard administrator account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AccountPage,
});

function AccountPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) { toast.error("Use at least 8 characters."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPassword("");
    setConfirm("");
    toast.success("Password changed successfully.");
  }

  return (
    <Shell title="Account security">
      <Panel title="Change password" desc="This changes the password for your signed-in administrator account.">
        <form onSubmit={submit} className="max-w-md space-y-4">
          <div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
          <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
        </form>
      </Panel>
    </Shell>
  );
}