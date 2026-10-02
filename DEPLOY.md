# Moving VoiceGuard to your own Supabase + Netlify

## 1. Database (your Supabase project)
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste all of `supabase/setup.sql`, click **Run**.
   This creates every table, security rule, the "first sign-up = admin" rule,
   and ~670 slang words in 11 languages.
3. **Authentication > Providers**: make sure Email is on.
4. **Project Settings > API**: copy the Project URL, the publishable (anon) key and the service_role key.

## 2. Website (Netlify)
1. Push this project to GitHub (Lovable: GitHub button, top right).
2. Netlify > Add new site > Import from GitHub > pick the repo. `netlify.toml` fills in the build settings.
3. Site settings > Environment variables, add:
   | Name | Value |
   |---|---|
   | VITE_SUPABASE_URL | Project URL |
   | VITE_SUPABASE_PUBLISHABLE_KEY | publishable / anon key |
   | VITE_SUPABASE_PROJECT_ID | project ref (the part before .supabase.co) |
   | SUPABASE_URL | Project URL |
   | SUPABASE_PUBLISHABLE_KEY | publishable / anon key |
   | SUPABASE_SERVICE_ROLE_KEY | service_role key (keep secret) |
4. Deploy. Open the site, sign up first — that account becomes the admin.
   (If Supabase asks you to confirm email, click the link in your inbox.)

## 3. Point the bot at the new site
In the bot's `.env`:
```
PANEL_URL=https://YOUR-SITE.netlify.app/api/public/bot
BOT_KEY=<copy from the new site's Overview page>
```
