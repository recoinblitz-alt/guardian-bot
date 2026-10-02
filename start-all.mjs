// Render / single-server launcher: runs the web panel and the Discord bot together.
// The bot talks to the panel on localhost and reads its key straight from the database,
// so the only settings needed are the Supabase ones (see DEPLOY.md).
import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3000";
const env = { ...process.env, PORT };

const web = spawn(process.execPath, [".output/server/index.mjs"], { stdio: "inherit", env });
web.on("exit", (code) => {
  console.error(`[web] exited (${code}) — stopping`);
  process.exit(code ?? 1);
});

async function botKey() {
  if (process.env.BOT_KEY) return process.env.BOT_KEY;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/bot_settings?id=eq.1&select=bot_api_key`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  const rows = await res.json();
  if (!res.ok || !rows[0]) throw new Error(`Could not read bot key: ${JSON.stringify(rows)}`);
  return rows[0].bot_api_key;
}

async function startBot() {
  for (;;) {
    try {
      const BOT_KEY = await botKey();
      const PANEL_URL = process.env.PANEL_URL || `http://127.0.0.1:${PORT}/api/public/bot`;
      spawn(process.execPath, ["bot/run.js"], { stdio: "inherit", env: { ...env, BOT_KEY, PANEL_URL } });
      return;
    } catch (e) {
      console.error("[bot] waiting:", e.message);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}
setTimeout(startBot, 3000);

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0));
