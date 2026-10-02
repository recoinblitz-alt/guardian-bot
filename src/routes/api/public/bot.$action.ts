import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { decide, type LadderStep } from "@/lib/punish";

// Endpoints used by the Discord bot (runs on the user's own server).
// Every call must send header `x-bot-key` matching the key shown in the dashboard.

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function authorize(request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const key = request.headers.get("x-bot-key") || "";
  const { data: settings } = await supabaseAdmin.from("bot_settings").select("*").eq("id", 1).single();
  if (!settings || !key || key.length !== settings.bot_api_key.length || key !== settings.bot_api_key) return null;
  return { db: supabaseAdmin, settings };
}

async function activePoints(db: any, userId: string, expiryDays: number) {
  const since = new Date(Date.now() - expiryDays * 86400_000).toISOString();
  const { data } = await db
    .from("infractions")
    .select("points")
    .eq("discord_user_id", userId)
    .eq("cleared", false)
    .gte("created_at", since);
  return (data ?? []).reduce((s: number, r: { points: number }) => s + r.points, 0);
}

const offenseSchema = z.object({
  discord_user_id: z.string().min(1).max(32),
  username: z.string().max(100).default(""),
  channel_name: z.string().max(100).default(""),
  category: z.enum(["mild", "abuse", "severe", "sexual", "provoking"]),
  matched: z.string().max(200).default(""),
  transcript: z.string().max(1000).default(""),
});

async function handle(request: Request, action: string) {
  const ctx = await authorize(request);
  if (!ctx) return json({ error: "Invalid bot key" }, 401);
  const { db, settings } = ctx;
  const url = new URL(request.url);

  switch (action) {
    case "config": {
      const { data: words } = await db.from("slang_words").select("category, word");
      const { bot_api_key: _k, ...rest } = settings;
      return json({ settings: rest, words: words ?? [] });
    }
    case "heartbeat": {
      const body = await request.json().catch(() => ({}));
      await db
        .from("bot_settings")
        .update({ bot_last_seen: new Date().toISOString(), bot_status: body ?? {} })
        .eq("id", 1);
      return json({ ok: true });
    }
    case "offense": {
      const parsed = offenseSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const o = parsed.data;
      const prior = await activePoints(db, o.discord_user_id, settings.warning_expiry_days);
      const d = decide(o.category, prior, {
        ladder: settings.ladder as unknown as LadderStep[],
        weights: settings.category_weights as Record<string, number>,
        sexualInstantBan: settings.sexual_instant_ban,
      });
      await db.from("infractions").insert({ ...o, action: d.action, duration_seconds: d.duration, points: d.points });
      return json(d);
    }
    case "warnings": {
      const user = z.string().min(1).max(32).parse(url.searchParams.get("user"));
      const { data } = await db
        .from("infractions")
        .select("*")
        .eq("discord_user_id", user)
        .order("created_at", { ascending: false })
        .limit(10);
      return json({ points: await activePoints(db, user, settings.warning_expiry_days), recent: data ?? [] });
    }
    case "clear": {
      const { discord_user_id } = z.object({ discord_user_id: z.string().min(1).max(32) }).parse(await request.json());
      await db.from("infractions").update({ cleared: true }).eq("discord_user_id", discord_user_id);
      return json({ ok: true });
    }
    case "word": {
      const b = z
        .object({
          category: z.enum(["mild", "abuse", "severe", "sexual", "provoking", "allow"]),
          word: z.string().trim().min(1).max(80),
          remove: z.boolean().optional(),
        })
        .parse(await request.json());
      if (b.remove) await db.from("slang_words").delete().eq("category", b.category).eq("word", b.word.toLowerCase());
      else await db.from("slang_words").upsert({ category: b.category, word: b.word.toLowerCase() }, { onConflict: "category,word" });
      return json({ ok: true });
    }
  }
  return json({ error: "Unknown action" }, 404);
}

export const Route = createFileRoute("/api/public/bot/$action")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.action),
      POST: ({ request, params }) => handle(request, params.action).catch((e) => json({ error: String(e?.message ?? e) }, 400)),
    },
  },
});
