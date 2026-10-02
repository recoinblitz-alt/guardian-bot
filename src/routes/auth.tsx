import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — VoiceGuard" },
      { name: "description", content: "Sign in to manage your Discord voice moderation bot." },
      { property: "og:title", content: "Sign in — VoiceGuard" },
      { property: "og:description", content: "Sign in to manage your Discord voice moderation bot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && navigate({ to: "/" }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => s && navigate({ to: "/" }));
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-sm font-semibold tracking-widest">VOICEGUARD</span>
        </div>
        <h1 className="text-2xl font-bold">{mode === "in" ? "Sign in" : "Create owner account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The first account created becomes the owner of this panel.
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
          </Button>
        </div>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
          {mode === "in" ? "No account yet? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
