-- Manual Stage 2 completion (scanner station removed) and reusable session reset.
create or replace function public.operator_complete_stage_2(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; begin
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if not public.is_mission_admin() and v.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission session token.'; end if;
 if v.status <> 'STAGE_2_ACTIVE' then raise exception 'Stage 2 is not active.'; end if;
 update public.game_sessions set status='STAGE_3_ACTIVE',current_stage=3,stage_2_completed_at=now(),updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type,metadata) values(p_session_id,'STAGE_2_COMPLETED',jsonb_build_object('mode','operator_manual'));
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.reset_mission_session(p_session_id uuid, p_station_token text)
returns jsonb language plpgsql security definer set search_path = public, auth
as $$ declare v public.game_sessions%rowtype; begin
 select * into v from public.game_sessions where id=p_session_id for update;
 if not found then raise exception 'Mission session not found.'; end if;
 if not public.is_mission_admin() and v.station_token <> coalesce(p_station_token,'') then raise exception 'Invalid mission session token.'; end if;
 delete from public.qr_fragments where session_id=p_session_id;
 update public.game_sessions set status='READY',current_stage=1,started_at=null,stage_1_completed_at=null,stage_2_completed_at=null,completed_at=null,final_phrase_hash=null,updated_at=now(),version=version+1 where id=p_session_id;
 insert into public.mission_events(session_id,event_type) values(p_session_id,'SESSION_RESET');
 return jsonb_build_object('ok',true);
end $$;
grant execute on function public.operator_complete_stage_2(uuid,text) to anon, authenticated;
grant execute on function public.reset_mission_session(uuid,text) to anon, authenticated;
