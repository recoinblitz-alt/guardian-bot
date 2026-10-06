import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AI_CONTEXT_SYSTEM_PROMPT, knownSafeContext, parseAiVerdict, type AiContextInput } from "@/lib/ai-moderation";
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
  matched: z.string().max(200).transform((s) => s.slice(0, 200)).default(""),
  transcript: z.string().transform((s) => s.slice(0, 1000)).default(""),
});

const reviewOffenseSchema = offenseSchema.extend({
  action: z.enum(["warn", "timeout", "ban"]),
  duration_seconds: z.number().int().min(0).max(2419200),
});

const aiCheckSchema = z.object({
  transcript: z.string().min(1).max(1000),
  matched: z.string().min(1).max(200),
  keyword: z.string().min(1).max(200),
  category: z.enum(["mild", "abuse", "severe", "sexual", "provoking"]),
  source: z.enum(["voice", "text"]),
  discord_user_id: z.string().max(32).default(""),
  username: z.string().max(100).default(""),
  channel_id: z.string().max(32).default(""),
  channel_name: z.string().max(100).default(""),
  test: z.boolean().optional(),
});

function providerUrl(base: string, provider: string) {
  const fallback = provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1";
  const url = new URL((base || fallback).trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid AI base URL");
  const path = url.pathname.replace(/\/$/, "");
  if (provider === "anthropic") {
    if (!path.endsWith("/messages")) url.pathname = `${path.endsWith("/v1") ? path : `${path}/v1`}/messages`;
  } else if (!path.endsWith("/chat/completions")) {
    url.pathname = `${path}/chat/completions`;
  }
  return url.toString();
}

async function judgeContext(settings: any, input: z.infer<typeof aiCheckSchema>) {
  if (!settings.ai_enabled && !input.test) return { verdict: "violation" as const, reason: "AI context check is disabled.", skipped: true };
  const safeContext = knownSafeContext(input as AiContextInput);
  if (safeContext) return safeContext;
  if (!settings.ai_api_key?.trim() || !settings.ai_model?.trim()) return { verdict: "uncertain" as const, reason: "AI provider is not fully configured." };
  const provider = settings.ai_provider === "anthropic" ? "anthropic" : "openai_compatible";
  const prompt = `Source: ${input.source}\nCategory: ${input.category}\nMatched text: ${input.matched}\nConfigured keyword: ${input.keyword}\nFull sentence: ${input.transcript}`;
  try {
    const url = providerUrl(settings.ai_base_url, provider);
    const headers: Record<string, string> = { "content-type": "application/json" };
    let body: Record<string, unknown>;
    if (provider === "anthropic") {
      headers["x-api-key"] = settings.ai_api_key.trim();
      headers["anthropic-version"] = "2023-06-01";
      body = { model: settings.ai_model.trim(), max_tokens: 180, system: AI_CONTEXT_SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] };
    } else {
      headers["authorization"] = `Bearer ${settings.ai_api_key.trim()}`;
      body = { model: settings.ai_model.trim(), messages: [{ role: "system", content: AI_CONTEXT_SYSTEM_PROMPT }, { role: "user", content: prompt }] };
    }
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180).replace(/\s+/g, " ");
      return { verdict: "uncertain" as const, reason: `AI provider error ${response.status}${detail ? `: ${detail}` : ""}` };
    }
    const result = await response.json() as any;
    const text = provider === "anthropic"
      ? result?.content?.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("")
      : Array.isArray(result?.choices?.[0]?.message?.content)
        ? result.choices[0].message.content.map((x: any) => x?.text || "").join("")
        : result?.choices?.[0]?.message?.content;
    return parseAiVerdict(String(text || ""));
  } catch (error) {
    return { verdict: "uncertain" as const, reason: `AI connection failed: ${String((error as Error)?.message || error).slice(0, 180)}` };
  }
}

async function handle(request: Request, action: string) {
  const ctx = await authorize(request);
  if (!ctx) return json({ error: "Invalid bot key" }, 401);
  const { db, settings } = ctx;
  const url = new URL(request.url);

  switch (action) {
    case "config": {
      const { data: words } = await db.from("slang_words").select("category, word");
      const { bot_api_key: _k, discord_token: _t, deepgram_keys: dk, ...rest } = settings as typeof settings & { ai_api_key?: string };
      delete rest.ai_api_key;
      // fingerprint lets the bot notice credential changes without receiving them every minute
      const fp = `${_t.length}:${_t.slice(-6)}|${dk.map((k: string) => k.slice(-6)).join(",")}`;
      return json({ settings: rest, words: words ?? [], credentials_fp: fp });
    }
    case "credentials": {
      return json({
        discord_token: settings.discord_token,
        deepgram_keys: settings.deepgram_keys.filter((k: string) => k.trim()),
      });
    }
    case "heartbeat": {
      const body = await request.json().catch(() => ({}));
      await db
        .from("bot_settings")
        .update({ bot_last_seen: new Date().toISOString(), bot_status: body ?? {} })
        .eq("id", 1);
      return json({ ok: true });
    }
    case "ai-check": {
      const parsed = aiCheckSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const decision = await judgeContext(settings, parsed.data);
      const outcome = parsed.data.test
        ? "connection_test"
        : decision.verdict === "violation"
          ? "punishment_continued"
          : decision.verdict === "safe"
            ? "ignored"
            : "moderator_review";
      const aiSettings = settings as typeof settings & { ai_provider?: string; ai_model?: string };
      const { error: logError } = await db.from("ai_decision_logs").insert({
        transcript: parsed.data.transcript,
        matched: parsed.data.matched,
        keyword: parsed.data.keyword,
        category: parsed.data.category,
        source: parsed.data.source,
        verdict: decision.verdict,
        reason: decision.reason,
        provider: aiSettings.ai_provider === "anthropic" ? "Anthropic Claude" : "OpenAI-compatible",
        model: aiSettings.ai_model?.trim() || "Not configured",
        outcome,
        is_test: parsed.data.test ?? false,
        discord_user_id: parsed.data.discord_user_id,
        username: parsed.data.username,
        channel_id: parsed.data.channel_id,
        channel_name: parsed.data.channel_name,
      });
      if (logError) console.error("Could not save AI decision log:", logError.message);
      return json({ ...decision, outcome });
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
    case "review-offense": {
      const parsed = reviewOffenseSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { action: reviewedAction, duration_seconds, ...o } = parsed.data;
      const prior = await activePoints(db, o.discord_user_id, settings.warning_expiry_days);
      const automatic = decide(o.category, prior, {
        ladder: settings.ladder as unknown as LadderStep[],
        weights: settings.category_weights as Record<string, number>,
        sexualInstantBan: false,
      });
      const d = { ...automatic, action: reviewedAction, duration: reviewedAction === "timeout" ? duration_seconds : 0 };
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
