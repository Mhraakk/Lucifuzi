-- Layer 15/20 — Supabase schema for Arya platform
-- Apply with: supabase db push (when linked)

create extension if not exists vector;

create table if not exists market_ticks (
  id bigserial primary key,
  org_id text not null,
  instrument text not null,
  price numeric not null,
  bid numeric,
  ask numeric,
  source text not null default 'sim',
  seq bigint not null,
  ts timestamptz not null default now()
);

create index if not exists market_ticks_org_instr_ts
  on market_ticks (org_id, instrument, ts desc);

create table if not exists domain_events (
  id text primary key,
  org_id text not null,
  type text not null,
  payload jsonb not null default '{}',
  correlation_id text,
  at timestamptz not null default now()
);

create index if not exists domain_events_org_at
  on domain_events (org_id, at desc);

create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id text primary key,
  org_id text not null,
  kind text not null,
  title text not null,
  body text not null,
  embedding vector(32),
  meta jsonb default '{}'::jsonb
);

-- RLS scaffolding
alter table market_ticks enable row level security;
alter table domain_events enable row level security;
alter table feature_flags enable row level security;
alter table knowledge_chunks enable row level security;

create policy market_ticks_org_isolation on market_ticks
  for all using (org_id = coalesce(auth.jwt() ->> 'org_id', org_id));

create policy domain_events_org_isolation on domain_events
  for all using (org_id = coalesce(auth.jwt() ->> 'org_id', org_id));

create policy knowledge_chunks_org_isolation on knowledge_chunks
  for all using (org_id = coalesce(auth.jwt() ->> 'org_id', org_id));

-- flags readable by authenticated
create policy feature_flags_read on feature_flags
  for select using (true);
