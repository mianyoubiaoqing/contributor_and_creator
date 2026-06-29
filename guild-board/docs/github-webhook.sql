-- GitHub webhook evidence intake.
-- Run this in Supabase SQL Editor before enabling GitHub webhooks.

create table if not exists github_events (
  id uuid primary key default gen_random_uuid(),
  project_key text not null,
  delivery_id text not null,
  event_name text not null,
  action text,
  repository_full_name text,
  sender_login text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_key, delivery_id)
);

create index if not exists github_events_project_created_idx
on github_events(project_key, created_at desc);

create index if not exists github_events_repo_idx
on github_events(repository_full_name);

alter table github_events enable row level security;

-- The app writes this table through /api/github/webhook with the service role key.
-- Do not expose direct anon policies for raw webhook payloads.

