create type public.app_role as enum ('admin','moderator','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- first user to sign up becomes admin
create or replace function public.handle_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users
for each row execute function public.handle_first_admin();

create table public.bot_settings (
  id int primary key default 1 check (id = 1),
  voice_channel_ids text[] not null default '{}',
  log_channel_id text not null default '',
  alert_channel_id text not null default '',
  alert_role_id text not null default '',
  ignored_user_ids text[] not null default '{}',
  ignored_role_ids text[] not null default '{}',
  warning_expiry_days int not null default 30,
  sexual_instant_ban boolean not null default true,
  fuzzy_matching boolean not null default true,
  ladder jsonb not null default '[{"from":1,"action":"warn","duration":0},{"from":4,"action":"timeout","duration":600},{"from":6,"action":"timeout","duration":3600},{"from":8,"action":"ban","duration":0}]',
  category_weights jsonb not null default '{"mild":1,"abuse":2,"severe":3}',
  bot_api_key text not null default encode(gen_random_bytes(24),'hex'),
  bot_last_seen timestamptz,
  bot_status jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.bot_settings (id) values (1);
grant select, update on public.bot_settings to authenticated;
grant all on public.bot_settings to service_role;
alter table public.bot_settings enable row level security;
create policy "admins read settings" on public.bot_settings for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins update settings" on public.bot_settings for update to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.slang_words (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('mild','abuse','severe','sexual','provoking','allow')),
  word text not null,
  language text not null default 'hindi',
  created_at timestamptz not null default now(),
  unique (category, word)
);
grant select, insert, update, delete on public.slang_words to authenticated;
grant all on public.slang_words to service_role;
alter table public.slang_words enable row level security;
create policy "admins manage words" on public.slang_words for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.infractions (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null,
  username text not null default '',
  channel_name text not null default '',
  category text not null,
  matched text not null default '',
  transcript text not null default '',
  action text not null,
  duration_seconds int not null default 0,
  points int not null default 0,
  cleared boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.infractions (discord_user_id, created_at desc);
grant select, update, delete on public.infractions to authenticated;
grant all on public.infractions to service_role;
alter table public.infractions enable row level security;
create policy "admins read infractions" on public.infractions for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins update infractions" on public.infractions for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins delete infractions" on public.infractions for delete to authenticated using (public.has_role(auth.uid(),'admin'));

insert into public.slang_words (category, word, language) values
('mild','chutiya','hindi'),('mild','kamina','hindi'),('mild','harami','hindi'),('mild','kutta','hindi'),('mild','gandu','hindi'),('mild','nalayak','hindi'),('mild','idiot','english'),('mild','stupid','english'),
('abuse','madarchod','hindi'),('abuse','mc','hindi'),('abuse','behenchod','hindi'),('abuse','bc','hindi'),('abuse','bhosdike','hindi'),('abuse','bhopadike','hindi'),('abuse','lavde','hindi'),('abuse','lauda','hindi'),('abuse','lund','hindi'),('abuse','fuck','english'),('abuse','motherfucker','english'),('abuse','bitch','english'),('abuse','asshole','english'),
('severe','teri maa ki','hindi'),('severe','teri mummy ki','hindi'),('severe','teri behen ki','hindi'),('severe','teri maa ko','hindi'),('severe','teri mummy ko','hindi'),('severe','maa chod','hindi'),('severe','randi','hindi'),('severe','randi ka','hindi'),
('sexual','nude bhej','hindi'),('sexual','send nudes','english'),('sexual','rape','english'),('sexual','rape kar','hindi'),('sexual','chodunga','hindi'),('sexual','sexy photo','english'),
('provoking','himmat hai to','hindi'),('provoking','aaja bahar','hindi'),('provoking','dekh lunga','hindi'),('provoking','come at me','english'),
('allow','abc','english'),('allow','bcci','english'),('allow','mcdonalds','english'),('allow','mcq','english');