import { useEffect, useState } from 'react';

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ArrowRight, Check, Gauge, Globe2, RotateCcw, ShieldAlert, TimerReset } from 'lucide-react';

import { motion } from 'framer-motion';

import SpaceBackdrop from '../components/SpaceBackdrop';

import Topbar from '../components/Topbar';

import Timer from '../components/Timer';

import StageRail from '../components/StageRail';

import EventLog from '../components/EventLog';

import Rocky from '../components/Rocky';
import {
    broadcastMissionUpdate,
    completeStage1,
    completeStage3,
    getSession,
    resetSession,
    startMission,
    subscribeToSession,
} from '../lib/mission';



import type { MissionSession } from '../lib/types';

import { buildResult, clearPenalties, getPenalties, savePenalties, sendResultToSheet, secondsToClock, type StagePenalties } from '../lib/results';



export default function MissionControl() {

    const { id = '' } = useParams(); const [params] = useSearchParams(); const token = params.get('token') || localStorage.getItem(`mosaic-token-${id}`) || ''; const nav = useNavigate();

    const [session, setSession] = useState<MissionSession | null>(null); const [clockNow, setClockNow] = useState(Date.now()); const [error, setError] = useState(''); const [connected, setConnected] = useState(false); const [busy, setBusy] = useState(false); const [confirmStage, setConfirmStage] = useState<number | null>(null); const [penalties, setPenalties] = useState<StagePenalties>({ stage1: 0, stage2: 0, stage3: 0 }); const [sheetNotice, setSheetNotice] = useState('');

    useEffect(() => { const t = window.setInterval(() => setClockNow(Date.now()), 250); return () => window.clearInterval(t); }, []);

    useEffect(() => { let alive = true; getSession(id, token).then(s => { if (alive) { setSession(s); setConnected(true); setPenalties(getPenalties(id)); } }).catch(e => setError(e.message)); const unsub = subscribeToSession(id, token, s => { if (alive) { setSession(s); setConnected(true); setError(''); } }); const onOnline = () => setConnected(true), onOffline = () => setConnected(false); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); return () => { alive = false; unsub(); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); }; }, [id, token]);

    const done = session?.status === 'MISSION_COMPLETE'; const rawSeconds = session?.started_at ? Math.max(0, Math.floor(((session.completed_at ? new Date(session.completed_at).getTime() : clockNow) - new Date(session.started_at).getTime()) / 1000)) : 0; const stage3Elapsed = session?.stage_2_completed_at ? Math.max(0, Math.floor(((session.completed_at ? new Date(session.completed_at).getTime() : clockNow) - new Date(session.stage_2_completed_at).getTime()) / 1000)) : 0; const stage3Overtime = Math.max(0, stage3Elapsed - 180); const stage3Remaining = Math.max(0, 180 - stage3Elapsed); const totalPenaltySeconds = penalties.stage1 * 3 + penalties.stage2 * 15 + penalties.stage3;

    function updatePenalty(stage: keyof StagePenalties, value: number) { const next = { ...penalties, [stage]: value }; setPenalties(next); savePenalties(id, next); }

    useEffect(() => { if (stage3Overtime > 0 && penalties.stage3 === 0 && session?.status === 'STAGE_3_ACTIVE') { const next = { ...penalties, stage3: 15 }; setPenalties(next); savePenalties(id, next); } }, [stage3Overtime, penalties, session?.status, id]);

    async function act(fn: () => Promise<unknown>) { setError(''); setBusy(true); try { await fn(); await broadcastMissionUpdate(id); setSession(await getSession(id, token)); setConfirmStage(null); } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed.'); } finally { setBusy(false); } }

    async function resetCurrent() { if (!window.confirm('Reset this team session? Timer, stage progress and penalties will be cleared. Already submitted spreadsheet results are not deleted.')) return; setBusy(true); setError(''); try { await resetSession(id, token); clearPenalties(id); setPenalties({ stage1: 0, stage2: 0, stage3: 0 }); await broadcastMissionUpdate(id); setSession(await getSession(id, token)); setSheetNotice('Session reset.'); } catch (e) { setError(e instanceof Error ? e.message : 'Reset failed. If this team is already completed, create a new team instead.'); } finally { setBusy(false); } }

    if (error && !session) return <div className="app-shell"><SpaceBackdrop /><Topbar connected={false} /><div className="fatal-state"><ShieldAlert size={30} /><h2>Mission channel unavailable</h2><p>{error}</p><a className="primary-button" href="/">Return to mission setup <ArrowRight size={15} /></a></div></div>;

    if (!session) return <div className="app-shell"><SpaceBackdrop /><Topbar /><div className="loading-state"><div className="loader-ring" /><p>ESTABLISHING MISSION LINK</p></div></div>;

    const stageComplete = (stage: number) => act(async () => {

        if (stage === 1) {

            await completeStage1(id, token);

            return;

        }

        if (stage === 2) {

            const { completeStage2Manually } = await import('../lib/mission');

            await completeStage2Manually(id, token);

            return;

        }

        if (stage === 3) {

            await completeStage3(id, token);

            const updated = await getSession(id, token);

            setSession(updated);

            if (updated.status === 'MISSION_COMPLETE') {

                const result = buildResult(updated, penalties);

                try {

                    const sent = await sendResultToSheet(result);

                    setSheetNotice(sent.configured

                        ? 'Result submission sent to Google Sheets. Check the Mission Results tab; duplicate submissions are de-duplicated.'

                        : 'Mission completed. Google Sheets is not connected yet; configure VITE_GOOGLE_APPS_SCRIPT_URL to enable automatic recording.');

                } catch {

                    setSheetNotice('Mission completed, but the spreadsheet request failed. Check the Google Sheets connection and Apps Script deployment.');

                }

            }

        }

    });

    return <div className={`app-shell control-shell ${done ? 'mission-success' : ''}`}><SpaceBackdrop /><Topbar team={session.team_code} connected={connected} /><main className="control-layout">

        <section className="control-intro"><div><div className="eyebrow eyebrow-line"><span /> MISSION DESIGNATION <b>HM–07 / LAST LIGHT</b></div><h1>{done ? <>MISSION<br /><em>ACCOMPLISHED.</em></> : <>MISSION<br /><em>CONTROL.</em></>}</h1><p>{done ? 'The crew has completed the final systems protocol. Humanity has another chance.' : 'One crew. Three physical challenges. The operator records stage completion and penalties from this central console.'}</p></div><div className="crew-status"><span className="eyebrow">ACTIVE CREW</span><b>{session.team_name}</b><small>TEAM ID · {session.team_code}</small><div className="crew-status-line"><span className="live-dot" /> {done ? 'MISSION ARCHIVED' : session.status.replaceAll('_', ' ')}</div></div></section>

        <section className="hero-console"><div className="hero-console-top"><div className="eyebrow"><Globe2 size={13} /> DEEP SPACE TELEMETRY <span className="tag-divider">/</span> OBSERVATION WINDOW 01</div><div className="telemetry-right"><span>SECTOR 04.82</span><span className="telemetry-bars"><i /><i /><i /><i /><i /></span></div></div><div className="hero-console-main"><div className="hero-caption"><span className="eyebrow">EXTERNAL VIEWPORT</span><b>PLANETARY BODY / 01</b><small>OPTICAL ARRAY · LIVE FEED SIMULATION</small></div><div className="hero-signal"><span className="signal-ring" /><span className="signal-ring ring-two" /><span className="signal-core" /></div><div className="hero-bottom-left"><span>RANGE <b>4.2 AU</b></span><span>COMMS <b className="cyan-text">{connected ? 'LINKED' : 'RECONNECTING'}</b></span></div><div className="hero-bottom-right">FIG 01 <i>·</i> DEEP SPACE OBSERVATION</div></div><div className="hero-console-bottom"><span><span className="live-dot" /> EXTERNAL SENSORS NOMINAL</span><span>LAST SYNC {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} UTC+5:30</span></div></section>

        {done && <section className="success-summary panel"><div className="success-mark"><Check size={24} /></div><div className="success-copy"><span className="eyebrow">MISSION COMPLETE · RESULT RECORDED</span><h2>MISSION ACCOMPLISHED</h2><p>Stage 3 was ended by the operator. The final time and penalties have been submitted for recording.</p></div><div className="success-metadata"><div><span>CREW</span><b>{session.team_name}</b></div><div><span>RAW TIME</span><b>{secondsToClock(rawSeconds)}</b></div><div><span>PENALTY TIME</span><b>{secondsToClock(totalPenaltySeconds)}</b></div><div><span>ADJUSTED TIME</span><b>{secondsToClock(rawSeconds + totalPenaltySeconds)}</b></div><div><span>STAGE 1</span><b>{formatStamp(session.stage_1_completed_at)}</b></div><div><span>STAGE 2</span><b>{formatStamp(session.stage_2_completed_at)}</b></div><div><span>COMPLETED</span><b>{formatStamp(session.completed_at)}</b></div></div><p className="result-equation">{secondsToClock(rawSeconds)} + ({secondsToClock(totalPenaltySeconds)}) = <strong>{secondsToClock(rawSeconds + totalPenaltySeconds)}</strong></p></section>}

        <section className="operations-grid"><div className="operations-main"><div className="timer-panel panel"><Timer startedAt={session.started_at} completedAt={session.completed_at} paused={session.status === 'PAUSED'} /><div className="timer-side"><span className="eyebrow">MISSION STATUS</span><b className={done ? 'success-text' : session.status === 'PAUSED' ? 'warning-text' : 'cyan-text'}>{done ? 'SUCCESS' : session.status.replaceAll('_', ' ')}</b><small><Gauge size={13} /> {session.started_at ? 'CLOCK SYNCHRONIZED' : 'CLOCK NOT STARTED'}</small><div className="timer-actions">{session.status === 'READY' && <button className="primary-button" disabled={busy} onClick={() => act(() => startMission(id, token))}>AUTHORIZE LAUNCH <ArrowRight size={15} /></button>}{session.status === 'STAGE_1_ACTIVE' && <button className="primary-button" disabled={busy} onClick={() => setConfirmStage(1)}>COMPLETE STAGE 1 <Check size={15} /></button>}{session.status === 'STAGE_2_ACTIVE' && <button className="primary-button" disabled={busy} onClick={() => setConfirmStage(2)}>COMPLETE STAGE 2 <Check size={15} /></button>}{session.status === 'STAGE_3_ACTIVE' && <button className="primary-button" disabled={busy} onClick={() => setConfirmStage(3)}>END STAGE 3 <Check size={15} /></button>}{done && <span className="stage-prompt success-text"><Check size={14} /> ALL SYSTEMS RESTORED</span>}</div></div></div>

            <section className="panel stage-panel"><div className="panel-heading"><div><span className="eyebrow">MISSION TIMELINE</span><h3>Operation sequence</h3></div><span className="sequence-label">{done ? 'COMPLETE' : `STAGE 0${session.current_stage} / 03`}</span></div><StageRail session={session} /><div className="stage-panel-foot"><span><TimerReset size={13} /> CLOCK NEVER RESETS BETWEEN STAGES</span><span>VERSION {session.version}</span></div></section>

            <section className="panel penalty-panel"><div className="panel-heading"><div><span className="eyebrow">OPERATOR INPUT</span><h3>Stage penalties</h3></div><span className="panel-icon"><TimerReset size={16} /></span></div><p className="panel-description">Record the number of penalties incurred by this team at each stage. Penalties are saved on this operator browser and included in the final result.</p><div className="penalty-stage-grid"><div className="penalty-stage"><span className="eyebrow">STAGE 01</span><b>Physical Retrieval</b><label className="penalty-select-label">NUMBER OF PENALTIES<select disabled={done} value={penalties.stage1} onChange={e => updatePenalty('stage1', Number(e.target.value))}>{Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label><small>{penalties.stage1} × 3s = <strong>{penalties.stage1 * 3}s</strong></small></div><div className="penalty-stage"><span className="eyebrow">STAGE 02</span><b>Signal Recovery</b><label className="penalty-select-label">NUMBER OF PENALTIES<select disabled={done} value={penalties.stage2} onChange={e => updatePenalty('stage2', Number(e.target.value))}>{Array.from({ length: 5 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label><small>{penalties.stage2} × 15s = <strong>{penalties.stage2 * 15}s</strong></small></div><div className="penalty-stage"><span className="eyebrow">STAGE 03</span><b>Final Protocol</b><label className="penalty-select-label">OVERTIME PENALTY<select disabled={done || stage3Overtime === 0} value={penalties.stage3} onChange={e => updatePenalty('stage3', Number(e.target.value))}>{stage3Overtime === 0 ? <option value={0}>0 sec — no overtime</option> : <><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={45}>45 seconds</option></>}</select></label><small>{stage3Overtime > 0 ? `Overtime: ${secondsToClock(stage3Overtime)}` : 'No overtime penalty yet'} · <strong>+{penalties.stage3}s</strong></small></div></div><div className="penalty-total"><div><span className="eyebrow">FINAL TIME CALCULATION</span><p>Raw completion time + total penalty time</p></div><strong>{secondsToClock(rawSeconds)} <i>+ ({secondsToClock(totalPenaltySeconds)})</i> = {secondsToClock(rawSeconds + totalPenaltySeconds)}</strong></div></section>

            {session.status === 'STAGE_3_ACTIVE' && <section className={`panel stage3-clock-panel ${stage3Remaining === 0 ? 'stage3-overtime' : ''}`}><div><span className="eyebrow">STAGE 03 · THREE-MINUTE LIMIT</span><h3>{stage3Remaining > 0 ? 'Time remaining' : 'TIME LIMIT EXCEEDED'}</h3><p>{stage3Remaining > 0 ? 'The countdown began when Stage 3 started. The main mission clock continues running.' : 'Overtime is counting upward. Choose the applicable 15, 30, or 45-second penalty in Stage penalties.'}</p></div><div className="stage3-clock-readout"><span>{stage3Remaining > 0 ? 'COUNTDOWN' : 'OVERTIME'}</span><strong>{secondsToClock(stage3Remaining > 0 ? stage3Remaining : stage3Overtime)}</strong><small>{stage3Remaining > 0 ? 'UNTIL 03:00 LIMIT' : 'SECONDS ABOVE THE LIMIT'}</small></div></section>}



            <div className="bottom-grid"><EventLog events={session.events} /><section className="panel station-panel"><div className="panel-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h3>Session controls</h3></div><span className="panel-icon"><RotateCcw size={16} /></span></div><p className="panel-description">Reset the current team's progress, or start a fresh session for the next team. Recorded spreadsheet results are kept separately.</p><div className="session-control-buttons"><button className="secondary-button" disabled={busy} onClick={resetCurrent}><RotateCcw size={14} /> RESET CURRENT TEAM</button><button className="primary-button" onClick={() => nav('/')}><ArrowRight size={14} /> NEW TEAM</button></div>{sheetNotice && <p className="inline-success">{sheetNotice}</p>}{error && <p className="inline-error">{error}</p>}</section></div>

        </div><aside className="operations-side"><Rocky status={session.status} fragments={0} /><section className="panel telemetry-panel"><div className="panel-heading"><div><span className="eyebrow">SYSTEM TELEMETRY</span><h3>Ship diagnostics</h3></div><span className="panel-icon"><Gauge size={15} /></span></div><div className="diagnostic-row"><span>Mission clock</span><b className={session.started_at ? 'cyan-text' : ''}>{session.started_at ? 'RUNNING' : 'STANDBY'}</b></div><div className="diagnostic-row"><span>Central uplink</span><b>{connected ? 'CONNECTED' : 'RETRYING'}</b></div><div className="diagnostic-row"><span>Stage 1</span><b>{session.stage_1_completed_at ? 'COMPLETE' : 'PENDING'}</b></div><div className="diagnostic-row"><span>Stage 2</span><b>{session.stage_2_completed_at ? 'COMPLETE' : 'PENDING'}</b></div><div className="diagnostic-row"><span>Penalty time</span><b>{secondsToClock(totalPenaltySeconds)}</b></div><div className="diagnostic-row"><span>Adjusted time</span><b>{secondsToClock(rawSeconds + totalPenaltySeconds)}</b></div><div className="diagnostic-foot"><span><span className="live-dot" /> {connected ? 'LIVE DATA' : 'CACHED DATA'}</span><span>REFRESH 3.5S</span></div></section><section className="mission-directive"><span className="eyebrow">MISSION DIRECTIVE 07</span><p>Recover the signal.<br />Restore the ship.<br /><em>Bring everyone home.</em></p><div className="directive-rule" /><span className="directive-code">MOSAIC / HAIL MARY / 2026</span></section><a href="/admin" className="admin-shortcut"><ShieldAlert size={14} /> OPERATOR CONTROLS <ArrowRight size={13} /></a></aside></section>

        <footer className="control-footer"><span>MISSION ID <b>{session.id.slice(0, 8).toUpperCase()}</b></span><span>RAW + PENALTIES <i>·</i> {connected ? 'SYNCHRONIZED' : 'OFFLINE MODE'}</span><span>MOSAIC 2026 <b>HM–07</b></span></footer></main>

        {confirmStage !== null && <div className="modal-backdrop"><motion.div className="confirm-modal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><span className="eyebrow">OPERATOR CONFIRMATION</span><h2>{confirmStage === 3 ? "End Stage 3 and submit this team’s result?" : `Record Stage ${confirmStage} complete?`}</h2><p>{confirmStage === 3 ? "This stops the main mission timer, records the final time and selected penalties, and submits the result to Google Sheets if configured." : "This records the stage completion timestamp and advances the mission. The main timer will continue running. Current penalties for this stage: " + penalties[`stage${confirmStage}` as keyof StagePenalties] + "."}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirmStage(null)}>CANCEL</button><button className="primary-button" disabled={busy} onClick={() => void stageComplete(confirmStage)}>{busy ? 'RECORDING…' : 'CONFIRM COMPLETION'} <Check size={14} /></button></div></motion.div></div>}

    </div>;

}

function formatStamp(value: string | null) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—'; }
