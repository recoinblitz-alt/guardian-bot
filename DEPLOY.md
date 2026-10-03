# Deploy VoiceGuard website + Discord bot together on Render

## 1. Database (your Supabase project)
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste all of `supabase/setup.sql`, click **Run**.
   This creates every table, security rule, the "first sign-up = admin" rule,
   and ~670 slang words in 11 languages.
3. **Authentication > Providers**: make sure Email is on.
4. **Project Settings > API**: copy the Project URL, the publishable (anon) key and the service_role key.

## 2. One Render Web Service
1. Push this project to GitHub and create a Render Web Service from the repository.
2. Choose the Starter plan or higher so the voice bot stays connected 24/7.
3. Use these commands:
   - Build: `bun install && bun install --cwd bot && NITRO_PRESET=node_server bun run build`
   - Start: `node start-all.mjs`
   - Health check: `/auth`
4. Add these environment variables:
   | Name | Value |
   |---|---|
   | VITE_SUPABASE_URL | Project URL |
   | VITE_SUPABASE_PUBLISHABLE_KEY | publishable / anon key |
   | VITE_SUPABASE_PROJECT_ID | project ref (the part before .supabase.co) |
   | SUPABASE_URL | Project URL |
   | SUPABASE_PUBLISHABLE_KEY | publishable / anon key |
   | SUPABASE_SERVICE_ROLE_KEY | service_role key (keep secret) |
5. Deploy. Open the site, sign up first — that account becomes the admin.
   (If Supabase asks you to confirm email, click the link in your inbox.)

## 3. Add bot credentials
Open the deployed panel and add the Discord bot token and all Deepgram keys on Overview. The combined service reads them from the panel and starts both the website and bot.
