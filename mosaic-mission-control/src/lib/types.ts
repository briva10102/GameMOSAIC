export type MissionStatus = 'READY'|'STAGE_1_ACTIVE'|'STAGE_1_COMPLETE'|'STAGE_2_ACTIVE'|'STAGE_2_COMPLETE'|'STAGE_3_ACTIVE'|'MISSION_COMPLETE'|'PAUSED'|'CANCELLED';
export type StageState = 'locked'|'active'|'complete';
export interface MissionEvent { id: string; event_type: string; event_timestamp: string; metadata?: Record<string, unknown>; }
export interface MissionSession {
  id: string; team_name: string; team_code: string; status: MissionStatus; current_stage: number;
  started_at: string|null; stage_1_completed_at: string|null; stage_2_completed_at: string|null; completed_at: string|null;
  fragments: number[]; events: MissionEvent[]; station_token: string; version: number;
}
export const STATUS_LABEL: Record<MissionStatus,string> = {
 READY:'STANDBY', STAGE_1_ACTIVE:'STAGE 01 ACTIVE', STAGE_1_COMPLETE:'STAGE 01 COMPLETE', STAGE_2_ACTIVE:'STAGE 02 ACTIVE', STAGE_2_COMPLETE:'STAGE 02 COMPLETE', STAGE_3_ACTIVE:'STAGE 03 ACTIVE', MISSION_COMPLETE:'MISSION ACCOMPLISHED', PAUSED:'MISSION PAUSED', CANCELLED:'MISSION CANCELLED'
};
