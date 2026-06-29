-- Phase-one cloud migration sketch for Supabase/Postgres.
-- This is intentionally explicit so contribution settlement and prize decisions
-- remain separate records.

create type project_phase as enum (
  '准备',
  '开发中',
  '预结算',
  '已冻结',
  '奖金决议'
);

create type task_status as enum (
  '开放领取',
  '已领取',
  '进行中',
  '提交验收',
  '返工',
  '已通过'
);

create type discipline as enum (
  '设计',
  '程序',
  '美术',
  '音频',
  '媒体',
  'QA',
  '制片',
  '本地化',
  '文档'
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_name text not null,
  phase project_phase not null default '准备',
  engine text not null,
  engine_version text not null,
  target_platform text not null,
  repository text,
  rules_version text not null,
  collaboration_markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null
);

create table members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  role text not null,
  primary_discipline discipline not null,
  conflict_reviewer boolean not null default false,
  joined_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  discipline discipline not null,
  module text not null,
  status task_status not null default '开放领取',
  owner_id uuid not null references members(id),
  reviewer_id uuid not null references members(id),
  difficulty_planner numeric not null check (difficulty_planner between 1 and 5),
  difficulty_ai numeric not null check (difficulty_ai between 1 and 5),
  difficulty_member numeric not null check (difficulty_member between 1 and 5),
  completion numeric not null default 0 check (completion between 0 and 100),
  quality numeric not null default 1 check (quality between 0.5 and 1.3),
  timeliness numeric not null default 1 check (timeliness between 0.5 and 1.2),
  evidence_strength numeric not null default 0.3 check (evidence_strength between 0 and 1),
  due_at timestamptz,
  accepted_at timestamptz,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_collaborators (
  task_id uuid not null references tasks(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (task_id, member_id)
);

create table task_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  evidence_type text not null,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table peer_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  rater_id uuid not null references members(id) on delete cascade,
  target_id uuid not null references members(id) on delete cascade,
  reliability integer not null check (reliability between 1 and 5),
  collaboration integer not null check (collaboration between 1 and 5),
  craft integer not null check (craft between 1 and 5),
  quality integer not null check (quality between 1 and 5),
  support integer not null check (support between 1 and 5),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, rater_id, target_id)
);

create table appeals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  member_id uuid not null references members(id),
  task_id uuid not null references tasks(id),
  reason text not null,
  status text not null default '待复核',
  reviewer_id uuid references members(id),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table settlement_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default '预结算',
  created_at timestamptz not null default now(),
  frozen_at timestamptz
);

create table settlement_lines (
  snapshot_id uuid not null references settlement_snapshots(id) on delete cascade,
  member_id uuid not null references members(id),
  task_points numeric not null,
  peer_points numeric not null,
  key_responsibility_points numeric not null,
  final_points numeric not null,
  ratio numeric not null,
  primary key (snapshot_id, member_id)
);

create table prize_decisions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references settlement_snapshots(id) on delete cascade,
  status text not null,
  gross_prize numeric not null default 0,
  deductions numeric not null default 0,
  note text not null default '',
  decided_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_member_id uuid references members(id),
  actor_label text not null,
  action text not null,
  target text not null,
  payload jsonb not null default '{}',
  previous_hash text,
  entry_hash text,
  created_at timestamptz not null default now()
);

create index tasks_project_status_idx on tasks(project_id, status);
create index peer_reviews_project_target_idx on peer_reviews(project_id, target_id);
create index audit_log_project_created_idx on audit_log(project_id, created_at desc);

