-- Transitional sync table for the current MVP.
-- It stores the whole ProjectState JSON so the app can move from browser-only
-- localStorage to shared cloud state before the full relational schema is wired.

create table if not exists mvp_project_states (
  project_key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table mvp_project_states enable row level security;

-- The app reads and writes this table through /api/state with the service role key.
-- Do not add public anon policies for this table unless you are intentionally
-- running an open demo.

