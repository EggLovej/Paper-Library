alter table papers
add column if not exists rating text,
add column if not exists updated_at timestamptz not null default now(),
add column if not exists processing_model text,
add column if not exists summary_overview_easy text,
add column if not exists summary_overview_caveman text,
add column if not exists summary_contributions_easy text,
add column if not exists summary_contributions_caveman text,
add column if not exists summary_prior_work_delta_easy text,
add column if not exists summary_prior_work_delta_caveman text,
add column if not exists report_email_sent_at timestamptz,
add column if not exists report_email_error text,
add column if not exists source text,
add column if not exists source_paper_id text,
add column if not exists source_message_id text;

create unique index if not exists papers_source_unique
on papers (source, source_paper_id)
where source is not null and source_paper_id is not null;

create table if not exists gmail_ingested_messages (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  thread_id text,
  subject text,
  sender text,
  received_at timestamptz,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  paper_urls text[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gmail_ingested_messages_status_idx
on gmail_ingested_messages (status, received_at);

create table if not exists paper_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  arxiv_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table paper_processing_jobs
alter column max_attempts set default 4;

create index if not exists paper_processing_jobs_ready_idx
on paper_processing_jobs (status, run_after, created_at);

create unique index if not exists paper_processing_jobs_active_paper_unique
on paper_processing_jobs (paper_id)
where status in ('pending', 'processing');

create table if not exists admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_identifier_created_idx
on admin_login_attempts (identifier, created_at desc);

create table if not exists admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
on admin_audit_events (created_at desc);

create index if not exists admin_audit_events_action_created_idx
on admin_audit_events (action, created_at desc);
