-- MOSAIC 2026 · Hail Mary Mission Control
-- Run this migration in the Supabase SQL editor before using live mode.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_code text not null unique,
  team_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  station_token text not null,
  status text not null default 'READY' check (status in ('READY','STAGE_1_ACTIVE','STAGE_1_COMPLETE','STAGE_2_ACTIVE','STAGE_2_COMPLETE','STAGE_3_ACTIVE','MISSION_COMPLETE','PAUSED','CANCELLED')),
  current_stage integer not null default 1 check (current_stage between 1 and 3),
  started_at timestamptz,
  stage_1_completed_at timestamptz,
  stage_2_completed_at timestamptz,
  completed_at timestamptz,
  final_phrase_hash bytea,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qr_fragments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  fragment_number integer not null check (fragment_number between 1 and 9),
  scanned_at timestamptz not null default now(),
  registered_by text not null default 'station-token',
  unique(session_id, fragment_number)
);

create table if not exists public.mission_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  event_type text not null,
  event_timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists mission_events_session_time_idx on public.mission_events(session_id, event_timestamp desc);
create index if not exists qr_fragments_session_idx on public.qr_fragments(session_id);

create or replace function public.is_mission_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;

alter table public.admin_users enable row level security;
alter table public.teams enable row level security;
alter table public.game_sessions enable row level security;
alter table public.qr_fragments enable row level security;
alter table public.mission_events enable row level security;

-- All sensitive writes and reads go through the RPCs below. No direct anon table access is granted.
revoke all on public.admin_users, public.teams, public.game_sessions, public.qr_fragments, public.mission_events from anon, authenticated;
grant select on public.admin_users to authenticated;
create policy "admins can inspect admin list" on public.admin_users for select to authenticated using (public.is_mission_admin());

grant execute on function public.is_mission_admin() to anon, authenticated;

create or replace function public.create_mission_session(p_team_name text, p_team_code text, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth
as $$
declare v_team_id uuid; v_session public.game_sessions%rowtype;
begin
  if not public.is_mission_admin() then raise exception 'Operator authorization required.'; end if;
  if length(trim(coalesce(p_team_name,''))) < 1 or length(trim(coalesce(p_team_code,''))) < 1 then raise exception 'Team name and mission code are required.'; end if;
  if length(coalesce(p_station_token,'')) < 40 then raise exception 'Invalid station token.'; end if;
  insert into public.teams(team_code, team_name) values (upper(trim(p_team_code)), trim(p_team_name)) returning id into v_team_id;
  insert into public.game_sessions(team_id, station_token) values(v_team_id,p_station_token) returning * into v_session;
  insert into public.mission_events(session_id,event_type,metadata) values(v_session.id,'SESSION_CREATED',jsonb_build_object('team',trim(p_team_name),'team_code',upper(trim(p_team_code))));
  return jsonb_build_object('session_id',v_session.id,'status',v_session.status,'current_stage',v_session.current_stage,'version',v_session.version);
exception when unique_violation then raise exception 'That mission code is already in use. Choose a unique code.';
end $$;

create or replace function public.get_mission_state(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare v_session public.game_sessions%rowtype; v_team public.teams%rowtype; v_fragments jsonb; v_events jsonb;
begin
  select * into v_session from public.game_sessions where id=p_session_id;
  if not found then raise exception 'Mission session not found.'; end if;
  if not public.is_mission_admin() and v_session.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission station token.'; end if;
  select * into v_team from public.teams where id=v_session.team_id;
  select coalesce(jsonb_agg(fragment_number order by fragment_number),'[]'::jsonb) into v_fragments from public.qr_fragments where session_id=p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'event_timestamp',event_timestamp,'metadata',metadata) order by event_timestamp desc),'[]'::jsonb) into v_events from (select * from public.mission_events where session_id=p_session_id order by event_timestamp desc limit 50) e;
  return jsonb_build_object('id',v_session.id,'team_name',v_team.team_name,'team_code',v_team.team_code,'status',v_session.status,'current_stage',v_session.current_stage,'started_at',v_session.started_at,'stage_1_completed_at',v_session.stage_1_completed_at,'stage_2_completed_at',v_session.stage_2_completed_at,'completed_at',v_session.completed_at,'fragments',v_fragments,'events',v_events,'version',v_session.version);
end $$;

create or replace function public.start_mission(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; begin
 if not public.is_mission_admin() then raise exception 'Operator authorization required to start a mission.'; end if;
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if v.status <> 'READY' then raise exception 'Only a ready mission can be started.'; end if;
 update public.game_sessions set status='STAGE_1_ACTIVE',current_stage=1,started_at=now(),updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'MISSION_STARTED');
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.complete_stage_1(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; begin
 if not public.is_mission_admin() then raise exception 'Operator authorization required to complete Stage 1.'; end if;
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if v.status <> 'STAGE_1_ACTIVE' then raise exception 'Stage 1 is not active.'; end if;
 update public.game_sessions set status='STAGE_2_ACTIVE',current_stage=2,stage_1_completed_at=now(),updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'STAGE_1_COMPLETED');
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.register_qr_fragment(p_session_id uuid, p_station_token text, p_fragment_number integer)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; v_added boolean := false; begin
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if v.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission station token.'; end if;
 if v.status <> 'STAGE_2_ACTIVE' then raise exception 'Signal recovery is not active.'; end if;
 if p_fragment_number < 1 or p_fragment_number > 9 then raise exception 'Invalid fragment number.'; end if;
 insert into public.qr_fragments(session_id,fragment_number) values(p_session_id,p_fragment_number) on conflict(session_id,fragment_number) do nothing;
 v_added := found;
 if v_added then
   update public.game_sessions set updated_at=now(),version=version+1 where id=p_session_id;
   insert into public.mission_events(session_id,event_type,metadata) values(p_session_id,'FRAGMENT_RECOVERED',jsonb_build_object('fragment',p_fragment_number));
 end if;
 return jsonb_build_object('ok',true,'added',v_added);
end $$;

create or replace function public.complete_stage_2(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; v_count integer; begin
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if not public.is_mission_admin() and v.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission station token.'; end if;
 if v.status <> 'STAGE_2_ACTIVE' then raise exception 'Stage 2 is not active.'; end if;
 select count(*) into v_count from public.qr_fragments where session_id=p_session_id;
 if v_count <> 9 then raise exception 'All nine unique fragments must be recovered before Stage 2 can complete.'; end if;
 update public.game_sessions set status='STAGE_3_ACTIVE',current_stage=3,stage_2_completed_at=now(),updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'STAGE_2_COMPLETED');
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.set_final_phrase(p_session_id uuid, p_station_token text, p_phrase text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth
as $$ declare v public.game_sessions%rowtype; v_hash bytea; begin
 if not public.is_mission_admin() then raise exception 'Operator authorization required to configure the final phrase.'; end if;
 if length(trim(coalesce(p_phrase,''))) < 3 then raise exception 'Final phrase must contain at least three characters.'; end if;
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 v_hash := extensions.digest(convert_to(lower(regexp_replace(trim(p_phrase), '\s+', ' ', 'g')),'UTF8'),'sha256');
 update public.game_sessions set final_phrase_hash=v_hash,updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'FINAL_PHRASE_CONFIGURED');
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.verify_final_phrase(p_session_id uuid, p_station_token text, p_phrase text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth
as $$ declare v public.game_sessions%rowtype; v_hash bytea; begin
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if v.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission station token.'; end if;
 if v.status <> 'STAGE_3_ACTIVE' then raise exception 'Final protocol is not active.'; end if;
 if v.final_phrase_hash is null then raise exception 'The operator has not configured the final phrase.'; end if;
 v_hash := extensions.digest(convert_to(lower(regexp_replace(trim(coalesce(p_phrase,'')), '\s+', ' ', 'g')),'UTF8'),'sha256');
 if v_hash <> v.final_phrase_hash then
   raise exception 'Phrase not accepted. Recheck the recovered protocol.';
 end if;
 update public.game_sessions set status='MISSION_COMPLETE',completed_at=now(),updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'MISSION_COMPLETED');
 return jsonb_build_object('ok',true,'completed_at',now());
end $$;

create or replace function public.reset_mission_session(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; begin
 if not public.is_mission_admin() then raise exception 'Operator authorization required to reset a session.'; end if;
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if v.status='MISSION_COMPLETE' then raise exception 'Completed sessions cannot be reset. Create a new session.'; end if;
 delete from public.qr_fragments where session_id=p_session_id;
 update public.game_sessions set status='READY',current_stage=1,started_at=null,stage_1_completed_at=null,stage_2_completed_at=null,completed_at=null,final_phrase_hash=null,updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'SESSION_RESET');
 return jsonb_build_object('ok',true);
end $$;

-- RPCs are the only allowed access path; SECURITY DEFINER functions validate the caller/token.
grant execute on function public.create_mission_session(text,text,text) to authenticated;
grant execute on function public.get_mission_state(uuid,text) to anon, authenticated;
grant execute on function public.start_mission(uuid,text) to authenticated;
grant execute on function public.complete_stage_1(uuid,text) to authenticated;
grant execute on function public.register_qr_fragment(uuid,text,integer) to anon, authenticated;
grant execute on function public.complete_stage_2(uuid,text) to anon, authenticated;
grant execute on function public.set_final_phrase(uuid,text,text) to authenticated;
grant execute on function public.verify_final_phrase(uuid,text,text) to anon, authenticated;
grant execute on function public.reset_mission_session(uuid,text) to authenticated;
