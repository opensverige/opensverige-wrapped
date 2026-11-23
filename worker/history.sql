create table if not exists public.osw_history_jobs (
 member_id text not null, channel_id text not null, target_id bigint not null,
 completed_id bigint not null default 0, upper_id bigint, cursor_id bigint,
 available_at timestamptz not null default now(), attempts integer not null default 0,
 primary key(member_id,channel_id)
);
create table if not exists public.osw_member_messages (
 member_id text not null, channel_id text not null, message_id bigint not null,
 message jsonb not null, primary key(member_id,channel_id,message_id)
);
create table if not exists public.osw_history_results (
 id bigint generated always as identity primary key, member_id text not null,
 channel_id text not null, stats jsonb not null
);
create index if not exists osw_history_results_member on public.osw_history_results(member_id,id);
create table if not exists public.osw_generated_results (
 member_id text not null, kind text not null, cache_key text not null, result jsonb not null,
 saved_at timestamptz not null default now(), primary key(member_id,kind,cache_key)
);
alter table public.osw_history_jobs enable row level security;
alter table public.osw_member_messages enable row level security;
alter table public.osw_history_results enable row level security;
alter table public.osw_generated_results enable row level security;
revoke all on public.osw_history_jobs,public.osw_member_messages,public.osw_history_results,public.osw_generated_results from public,anon,authenticated;
