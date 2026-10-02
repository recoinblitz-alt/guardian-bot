import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Activity, Hash, BookText, Scale, History, LogOut, ShieldAlert } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/channels", label: "Channels & roles", icon: Hash },
  { to: "/words", label: "Word lists", icon: BookText },
  { to: "/rules", label: "Punishment rules", icon: Scale },
  { to: "/history", label: "History", icon: History },
] as const;

export function useAdmin() {
  const [state, setState] = useState<{ loading: boolean; session: Session | null; admin: boolean }>({
    loading: true,
    session: null,
    admin: false,
  });
  useEffect(() => {
    const check = async (session: Session | null) => {
      if (!session) return setState({ loading: false, session: null, admin: false });
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin");
      setState({ loading: false, session, admin: !!data?.length });
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => check(s), 0);
    });
    supabase.auth.getSession().then(({ data }) => check(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { loading, session, admin } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center font-mono text-sm text-muted-foreground">loading…</div>;
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">No access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only the server owner account can use this panel. Ask the owner to give you access.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-sm font-semibold tracking-widest">VOICEGUARD</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              activeProps={{ className: "bg-sidebar-accent !text-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="flex gap-2 overflow-x-auto border-b border-border p-3 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground" activeProps={{ className: "bg-secondary !text-foreground" }} activeOptions={{ exact: true }}>
              {n.label}
            </Link>
          ))}
        </div>
        <div className="mx-auto max-w-5xl p-6 md:p-10">
          <h1 className="mb-8 text-3xl font-bold tracking-tight">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Panel({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ActionBadge({ action }: { action: string }) {
  const cls =
    action === "ban"
      ? "bg-destructive text-destructive-foreground"
      : action === "timeout"
        ? "bg-primary text-primary-foreground"
        : action === "alert"
          ? "bg-chart-4 text-primary-foreground"
          : "bg-accent text-accent-foreground";
  return <span className={`rounded px-2 py-0.5 font-mono text-xs uppercase ${cls}`}>{action}</span>;
}
