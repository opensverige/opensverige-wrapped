create table if not exists public.osw_music_tracks (
 id text primary key, name text not null, frames integer not null check(frames>0),
 asset text, audio bytea, check ((asset is null) <> (audio is null))
);
create table if not exists public.osw_film_themes (
 id text primary key, name text not null, layout text not null check(layout in ('editorial','pulse')),
 colors jsonb not null, revision integer not null default 1, track_id text references public.osw_music_tracks(id)
);
create table if not exists public.osw_film_settings (
 singleton boolean primary key check(singleton), active_theme text not null references public.osw_film_themes(id)
);
insert into public.osw_music_tracks(id,name,frames,asset) values
 ('original','Byggaråret · ElevenLabs',3420,'/static/year-music.m4a?v=elevenlabs-2026'),
 ('pulse','Puls · Demons instrumentalspår',1440,'/static/pulse.m4a') on conflict do nothing;
insert into public.osw_film_themes(id,name,layout,colors,track_id) values
 ('original','OpenSverige Original','editorial','{"green":"#215641","lime":"#dcff80","rust":"#ac3917","paper":"#fbfaf7"}','original'),
 ('pulse','OpenSverige Puls','pulse','{"green":"#2d492d","lime":"#d9f36c","rust":"#a74730","paper":"#f9f2e3"}','pulse') on conflict do nothing;
insert into public.osw_film_settings values(true,'original') on conflict do nothing;
alter table public.osw_music_tracks enable row level security;
alter table public.osw_film_themes enable row level security;
alter table public.osw_film_settings enable row level security;
revoke all on public.osw_music_tracks,public.osw_film_themes,public.osw_film_settings from public,anon,authenticated;
