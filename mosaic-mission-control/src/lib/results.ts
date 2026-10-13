import type { MissionSession } from './types';

// Stage 1 and 2 store counts. Stage 3 stores the manually selected overtime penalty in seconds.
export type StagePenalties = { stage1: number; stage2: number; stage3: number };
const key = (id: string) => `mosaic-penalties-${id}`;
export function getPenalties(id: string): StagePenalties {
  try { const v = JSON.parse(localStorage.getItem(key(id)) || '{}'); return { stage1: clamp(v.stage1, 10), stage2: clamp(v.stage2, 4), stage3: [0,15,30,45].includes(Number(v.stage3)) ? Number(v.stage3) : 0 }; }
  catch { return { stage1: 0, stage2: 0, stage3: 0 }; }
}
function clamp(v: unknown, max: number) { const n = Number(v ?? 0); return Number.isInteger(n) && n >= 0 && n <= max ? n : 0; }
export function savePenalties(id: string, penalties: StagePenalties) { localStorage.setItem(key(id), JSON.stringify(penalties)); }
export function clearPenalties(id: string) { localStorage.removeItem(key(id)); }
export function secondsToClock(seconds: number) { const n=Math.max(0,Math.floor(seconds)); return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor((n%3600)/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export function elapsedSeconds(session: MissionSession) { if (!session.started_at) return 0; return Math.max(0, Math.floor(((session.completed_at ? new Date(session.completed_at) : new Date()).getTime() - new Date(session.started_at).getTime()) / 1000)); }
export function buildResult(session: MissionSession, penalties: StagePenalties) {
 const raw=elapsedSeconds(session); const s1=penalties.stage1*3; const s2=penalties.stage2*15; const s3=penalties.stage3; const penalty=s1+s2+s3; const stage3Duration=session.stage_2_completed_at&&session.completed_at?Math.max(0,Math.floor((new Date(session.completed_at).getTime()-new Date(session.stage_2_completed_at).getTime())/1000)):0; const stage3Overtime=Math.max(0,stage3Duration-180);
 return { sessionId: session.id, teamName: session.team_name, teamCode: session.team_code, startedAt: session.started_at, stage1CompletedAt: session.stage_1_completed_at, stage2CompletedAt: session.stage_2_completed_at, completedAt: session.completed_at, stage3DurationSeconds:stage3Duration, stage3Duration:secondsToClock(stage3Duration), stage3OvertimeSeconds:stage3Overtime, stage3Overtime:secondsToClock(stage3Overtime), rawSeconds: raw, rawTime: secondsToClock(raw), stage1Penalties: penalties.stage1, stage1PenaltySeconds: s1, stage2Penalties: penalties.stage2, stage2PenaltySeconds: s2, stage3Penalties: s3, stage3PenaltySeconds: s3, totalPenaltyCount: penalties.stage1+penalties.stage2, penaltyTime: secondsToClock(penalty), totalPenaltySeconds: penalty, adjustedSeconds: raw+penalty, adjustedTime: secondsToClock(raw+penalty), displayedResult: `${secondsToClock(raw)} + (${secondsToClock(penalty)}) = ${secondsToClock(raw+penalty)}` };
}
export async function sendResultToSheet(payload: ReturnType<typeof buildResult>) {
 const endpoint = (import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL as string | undefined)?.trim();
 if (!endpoint) return { configured: false as const };
 await fetch(endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
 return { configured: true as const };
}
