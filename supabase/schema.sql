-- AI Creative Engine: run storage.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists public.ace_runs (
  id            text primary key,                 -- short job id created by the app
  url           text        not null,             -- website that was processed
  business_name text        not null default '',
  options       jsonb       not null default '{}'::jsonb,  -- { dryRun, maxImages, maxVideos }
  execution_id  text,                              -- n8n execution id
  status        text        not null default 'running'
                check (status in ('queued', 'running', 'success', 'error')),
  stages        jsonb,                             -- final progress steps
  result        jsonb,                             -- the finished ad pack (brief, hooks, statics, videos, report)
  error         text,
  failed_node   text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists ace_runs_created_at_idx on public.ace_runs (created_at desc);
create index if not exists ace_runs_status_idx     on public.ace_runs (status) where status in ('queued', 'running');

-- Lock the table down. The app talks to it only through its backend with the service-role key,
-- which bypasses RLS. With RLS on and no policies, the public anon/publishable key can read nothing.
alter table public.ace_runs enable row level security;

-- ---------------------------------------------------------------------------
-- Authentication: owners and approval (safe to run more than once)
-- ---------------------------------------------------------------------------
alter table public.ace_runs
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists ace_runs_user_idx on public.ace_runs (user_id);

-- One row per person who has signed in. New people start unapproved; an admin approves them in the app.
create table if not exists public.ace_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text        not null,
  approved   boolean     not null default false,
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now()
);
alter table public.ace_profiles enable row level security;  -- no policies: only the backend's secret key can touch it

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Usage and cost report: one row per billable action (safe to run more than once)
-- ---------------------------------------------------------------------------
create table if not exists public.ace_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  run_id     text,
  kind       text        not null,            -- 'claude' | 'image' | 'video'
  units      numeric     not null default 0,  -- tokens (claude), images, videos
  unit_label text,
  quality    text,
  est_cost   numeric     not null default 0,  -- estimated US dollars at list prices
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ace_usage_user_idx on public.ace_usage (user_id, created_at desc);
create index if not exists ace_usage_run_idx  on public.ace_usage (run_id);
alter table public.ace_usage enable row level security;  -- no policies: only the backend's secret key can touch it

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Connected accounts (Meta): one row per person and provider; the tokens are stored encrypted (safe to run more than once)
-- ---------------------------------------------------------------------------
create table if not exists public.ace_connections (
  user_id      uuid not null references auth.users (id) on delete cascade,
  provider     text not null,                 -- 'meta'
  display_name text,
  data_enc     text not null,                 -- AES-GCM encrypted JSON (tokens, pages, ad accounts)
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.ace_connections enable row level security;  -- no policies: only the backend's secret key can touch it

notify pgrst, 'reload schema';
