-- Optional account-based authorization for /api/state.
-- Run this after docs/supabase-mvp-sync.sql if you want Supabase Auth users
-- to access cloud sync without the shared sync token.

create table if not exists mvp_project_members (
  project_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  display_name text,
  access_level text not null default 'member' check (
    access_level in ('owner', 'planner', 'reviewer', 'member', 'viewer')
  ),
  approval_status text not null default 'approved' check (
    approval_status in ('approved', 'pending')
  ),
  created_at timestamptz not null default now(),
  primary key (project_key, user_id)
);

alter table mvp_project_members
add column if not exists email text;

alter table mvp_project_members
add column if not exists approval_status text not null default 'approved';

alter table mvp_project_members enable row level security;

drop policy if exists "Members can read their own project memberships" on mvp_project_members;
create policy "Members can read their own project memberships"
on mvp_project_members
for select
to authenticated
using (auth.uid() = user_id);

-- Insert members from the Supabase SQL Editor after users sign up.
-- Find user ids in Authentication -> Users.
--
-- Example:
-- insert into mvp_project_members (project_key, user_id, display_name, access_level)
-- values (
--   'ciga-jam-2026',
--   '00000000-0000-0000-0000-000000000000',
--   'Lin Yao',
--   'owner'
-- );

create table if not exists mvp_project_invites (
  id uuid primary key default gen_random_uuid(),
  project_key text not null,
  invite_code text not null unique,
  label text not null default '项目邀请',
  default_access_level text not null default 'member' check (
    default_access_level in ('owner', 'planner', 'reviewer', 'member', 'viewer')
  ),
  require_approval boolean not null default false,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table mvp_project_invites enable row level security;

drop policy if exists "Authenticated users can read no invites directly" on mvp_project_invites;
create policy "Authenticated users can read no invites directly"
on mvp_project_invites
for select
to authenticated
using (false);

create index if not exists mvp_project_invites_project_idx
on mvp_project_invites(project_key, created_at desc);

create index if not exists mvp_project_invites_code_idx
on mvp_project_invites(invite_code);
