create table public.osw_voice_segments (
  id uuid primary key,
  member_id text not null,
  channel_id text not null,
  started_at timestamptz not null,
  observed_until timestamptz not null check (observed_until >= started_at),
  streaming boolean not null,
  arrival boolean not null
);
alter table public.osw_voice_segments enable row level security;
revoke all on public.osw_voice_segments from public, anon, authenticated;
create index osw_voice_member_time on public.osw_voice_segments(member_id, observed_until);

-- Only the caller's verified Discord identity can contribute rows to this result.
create function public.osw_my_voice(p_year integer)
returns table(channel_id text, voice_seconds bigint, stream_seconds bigint, visits bigint)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select make_timestamptz(p_year,1,1,0,0,0,'Europe/Stockholm') as lo,
           make_timestamptz(p_year+1,1,1,0,0,0,'Europe/Stockholm') as hi
  ), spans as (
    select s.channel_id, s.streaming, s.arrival and s.started_at >= b.lo as visit,
           extract(epoch from least(s.observed_until,b.hi)-greatest(s.started_at,b.lo)) as seconds
    from public.osw_voice_segments s cross join bounds b
    where s.observed_until >= b.lo and s.started_at < b.hi
      and exists (select 1 from auth.identities i where i.user_id=auth.uid()
                  and i.provider='discord' and i.provider_id=s.member_id)
  )
  select channel_id, floor(sum(seconds))::bigint,
         floor(coalesce(sum(seconds) filter(where streaming),0))::bigint,
         count(*) filter(where visit)
  from spans group by channel_id;
$$;
revoke all on function public.osw_my_voice(integer) from public, anon;
grant execute on function public.osw_my_voice(integer) to authenticated;
