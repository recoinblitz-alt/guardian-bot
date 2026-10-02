import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shell, ActionBadge } from "@/components/Shell";
import { CATEGORY_LABEL } from "@/lib/settings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — VoiceGuard" },
      { name: "description", content: "Every warning, timeout and ban the bot has given." },
      { property: "og:title", content: "History — VoiceGuard" },
      { property: "og:description", content: "Every warning, timeout and ban the bot has given." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Shell title="History">
      <HistoryPage />
    </Shell>
  ),
});

function HistoryPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["history", q],
    queryFn: async () => {
      let req = supabase.from("infractions").select("*").order("created_at", { ascending: false }).limit(200);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) req = req.or(`username.ilike.%${term}%,discord_user_id.eq.${term},matched.ilike.%${term}%`);
      return (await req).data ?? [];
    },
  });
  const pardon = async (id: string) => {
    await supabase.from("infractions").update({ cleared: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["history"] });
  };

  return (
    <>
      <Input className="mb-4 max-w-sm" placeholder="Search name, user ID or word…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>What they said</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id} className={r.cleared ? "opacity-50" : ""}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.username}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.discord_user_id}</div>
                </TableCell>
                <TableCell>
                  <ActionBadge action={r.action} />
                  {r.duration_seconds > 0 && <span className="ml-1 text-xs text-muted-foreground">{Math.round(r.duration_seconds / 60)}m</span>}
                </TableCell>
                <TableCell className="text-xs">{CATEGORY_LABEL[r.category]}</TableCell>
                <TableCell className="max-w-xs text-xs">
                  <span className="font-semibold text-primary">{r.matched}</span>
                  <div className="truncate text-muted-foreground" title={r.transcript}>{r.transcript}</div>
                </TableCell>
                <TableCell>
                  {!r.cleared && r.points > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => pardon(r.id)}>Pardon</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.length && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No records</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
