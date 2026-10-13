
import { supabase, supabaseConfigured } from './supabase';
import type { MissionEvent, MissionSession, MissionStatus } from './types';

const STORAGE_KEY = 'mosaic-mission-session-v1';
const ACTIVE_KEY = 'mosaic-active-session-id';

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function readDemo(): MissionSession | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function saveDemo(session: MissionSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(ACTIVE_KEY, session.id);

  window.dispatchEvent(
    new CustomEvent('mission-local-change', {
      detail: session,
    }),
  );
}

function event(
  type: string,
  metadata: Record<string, unknown> = {},
): MissionEvent {
  return {
    id: uid(),
    event_type: type,
    event_timestamp: now(),
    metadata,
  };
}

function demoToken() {
  return `${ uid().replaceAll('-', '') }${ uid().replaceAll('-', '') } `;
}

function checkDemoToken(session: MissionSession, token?: string) {
  if (token && token !== session.station_token) {
    throw new Error(
      'This station link is not valid for the selected mission.',
    );
  }
}

export function getLocalSessionId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export async function createSession(
  teamName: string,
  teamCode: string,
) {
  if (supabaseConfigured && supabase) {
    const token = demoToken();

    const { data, error } = await supabase.rpc(
      'create_mission_session',
      {
        p_team_name: teamName.trim(),
        p_team_code: teamCode.trim().toUpperCase(),
        p_station_token: token,
      },
    );

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const sessionId = result?.session_id ?? result?.id;

    if (!sessionId) {
      throw new Error(
        'Session was created but no session ID was returned. Check the SQL migration.',
      );
    }

    localStorage.setItem(ACTIVE_KEY, sessionId);

    return { id: sessionId, token };
  }

  const session: MissionSession = {
    id: uid(),
    team_name: teamName.trim(),
    team_code: teamCode.trim().toUpperCase(),
    status: 'READY',
    current_stage: 1,
    started_at: null,
    stage_1_completed_at: null,
    stage_2_completed_at: null,
    completed_at: null,
    fragments: [],
    events: [
      event('SESSION_CREATED', {
        team: teamName.trim(),
      }),
    ],
    station_token: demoToken(),
    version: 1,
  };

  saveDemo(session);

  return {
    id: session.id,
    token: session.station_token,
  };
}

export async function getSession(
  sessionId: string,
  token?: string,
): Promise<MissionSession> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc(
      'get_mission_state',
      {
        p_session_id: sessionId,
        p_station_token: token ?? '',
      },
    );

    if (error) throw error;
    if (!data) throw new Error('Mission session not found.');

    return normalize(data);
  }

  const session = readDemo();

  if (!session || session.id !== sessionId) {
    throw new Error(
      'No matching demo session in this browser. Create a session from Mission Setup first.',
    );
  }

  checkDemoToken(session, token);

  return session;
}

function normalize(data: any): MissionSession {
  return {
    id: data.id ?? data.session_id,
    team_name: data.team_name ?? 'UNASSIGNED CREW',
    team_code: data.team_code ?? '—',
    status: data.status as MissionStatus,
    current_stage: Number(data.current_stage ?? 1),
    started_at: data.started_at ?? null,
    stage_1_completed_at: data.stage_1_completed_at ?? null,
    stage_2_completed_at: data.stage_2_completed_at ?? null,
    completed_at: data.completed_at ?? null,
    fragments: (data.fragments ?? []).map((item: any) =>
      Number(
        typeof item === 'object'
          ? item.fragment_number
          : item,
      ),
    ),
    events: data.events ?? [],
    station_token: data.station_token ?? '',
    version: Number(data.version ?? 0),
  };
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase.rpc(name, args);

  if (error) throw error;

  return data;
}

async function demoUpdate(
  id: string,
  token: string | undefined,
  update: (session: MissionSession) => void,
) {
  const session = readDemo();

  if (!session || session.id !== id) {
    throw new Error('Mission not found in this browser.');
  }

  checkDemoToken(session, token);

  update(session);
  session.version++;

  saveDemo(session);

  return session;
}

export async function startMission(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('start_mission', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'READY') {
      throw new Error('Only a ready mission can be started.');
    }

    session.status = 'STAGE_1_ACTIVE';
    session.started_at = now();
    session.events.unshift(event('MISSION_STARTED'));
  });
}

export async function completeStage1(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('complete_stage_1', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'STAGE_1_ACTIVE') {
      throw new Error('Stage 1 is not active.');
    }

    session.status = 'STAGE_2_ACTIVE';
    session.current_stage = 2;
    session.stage_1_completed_at = now();

    session.events.unshift(event('STAGE_1_COMPLETED'));
  });
}

export async function registerFragment(
  id: string,
  token: string,
  fragment: number,
) {
  if (supabaseConfigured) {
    return rpc('register_qr_fragment', {
      p_session_id: id,
      p_station_token: token,
      p_fragment_number: fragment,
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'STAGE_2_ACTIVE') {
      throw new Error('Signal recovery is not active yet.');
    }

    if (fragment < 1 || fragment > 9) {
      throw new Error(
        'Fragment number must be between 1 and 9.',
      );
    }

    if (!session.fragments.includes(fragment)) {
      session.fragments.push(fragment);
      session.fragments.sort((a, b) => a - b);

      session.events.unshift(
        event('FRAGMENT_RECOVERED', { fragment }),
      );
    }
  });
}

export async function completeStage2(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('complete_stage_2', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    if (
      session.status !== 'STAGE_2_ACTIVE' ||
      session.fragments.length !== 9
    ) {
      throw new Error(
        'Recover all nine unique fragments before completing Stage 2.',
      );
    }

    session.status = 'STAGE_3_ACTIVE';
    session.current_stage = 3;
    session.stage_2_completed_at = now();

    session.events.unshift(event('STAGE_2_COMPLETED'));
  });
}

export async function completeStage2Manually(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('operator_complete_stage_2', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'STAGE_2_ACTIVE') {
      throw new Error('Stage 2 is not active.');
    }

    session.status = 'STAGE_3_ACTIVE';
    session.current_stage = 3;
    session.stage_2_completed_at = now();

    session.events.unshift(
      event('STAGE_2_COMPLETED', {
        mode: 'operator_manual',
      }),
    );
  });
}

/**
 * Manually end Stage 3.
 * No phrase entry or phrase verification is required.
 */
export async function completeStage3(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('operator_complete_stage_3', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'STAGE_3_ACTIVE') {
      throw new Error('Stage 3 is not active.');
    }

    session.status = 'MISSION_COMPLETE';
    session.completed_at = now();

    session.events.unshift(
      event('MISSION_COMPLETED', {
        mode: 'operator_manual',
      }),
    );
  });
}

/**
 * Retained for compatibility with any other existing code.
 * MissionControl no longer needs to call this function.
 */
export async function verifyFinalPhrase(
  id: string,
  token: string,
  phrase: string,
) {
  if (supabaseConfigured) {
    return rpc('verify_final_phrase', {
      p_session_id: id,
      p_station_token: token,
      p_phrase: phrase,
    });
  }

  return demoUpdate(id, token, (session) => {
    if (session.status !== 'STAGE_3_ACTIVE') {
      throw new Error('Final protocol is not active.');
    }

    const expected =
      localStorage.getItem('mosaic-demo-final-phrase') ??
      'ASTROPHAGE CURE DELIVERED';

    if (
      phrase.trim().toUpperCase() !==
      expected.trim().toUpperCase()
    ) {
      throw new Error(
        'Phrase not accepted. Recheck the recovered protocol.',
      );
    }

    session.status = 'MISSION_COMPLETE';
    session.completed_at = now();

    session.events.unshift(event('MISSION_COMPLETED'));
  });
}

export async function setFinalPhrase(
  id: string,
  token: string,
  phrase: string,
) {
  if (supabaseConfigured) {
    return rpc('set_final_phrase', {
      p_session_id: id,
      p_station_token: token,
      p_phrase: phrase,
    });
  }

  if (!phrase.trim()) {
    throw new Error('Final phrase cannot be empty.');
  }

  localStorage.setItem(
    'mosaic-demo-final-phrase',
    phrase.trim(),
  );

  return true;
}

export async function resetSession(
  id: string,
  token?: string,
) {
  if (supabaseConfigured) {
    return rpc('reset_mission_session', {
      p_session_id: id,
      p_station_token: token ?? '',
    });
  }

  return demoUpdate(id, token, (session) => {
    session.status = 'READY';
    session.current_stage = 1;
    session.started_at = null;
    session.stage_1_completed_at = null;
    session.stage_2_completed_at = null;
    session.completed_at = null;
    session.fragments = [];

    session.events.unshift(event('SESSION_RESET'));
  });
}

export function subscribeToSession(
  sessionId: string,
  token: string,
  onUpdate: (session: MissionSession) => void,
) {
  let stopped = false;
  let channel: any = null;

  const refresh = async () => {
    try {
      const session = await getSession(sessionId, token);

      if (!stopped) {
        onUpdate(session);
      }
    } catch {
      // Polling retries transient failures.
    }
  };

  if (supabaseConfigured && supabase) {
    channel = supabase
      .channel(`mission - ${ sessionId } `, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'mission-update' }, () => {
        void refresh();
      })
      .subscribe();
  }

  const local = (event: Event) => {
    const session = (
      event as CustomEvent<MissionSession>
    ).detail;

    if (session?.id === sessionId) {
      onUpdate(session);
    }
  };

  window.addEventListener('mission-local-change', local);

  const timer = window.setInterval(() => {
    void refresh();
  }, 3500);

  void refresh();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('mission-local-change', local);

    if (channel && supabase) {
      void supabase.removeChannel(channel);
    }
  };
}

export async function broadcastMissionUpdate(
  sessionId: string,
) {
  if (supabaseConfigured && supabase) {
    const channel = supabase.channel(
      `mission - ${ sessionId } `,
      { config: { broadcast: { self: false } } },
    );

    try {
      await new Promise<void>((resolve) => {
        channel.subscribe(() => resolve());
      });

      await channel.send({
        type: 'broadcast',
        event: 'mission-update',
        payload: { at: now() },
      });
    } catch {
      // Polling remains the fallback.
    } finally {
      await supabase.removeChannel(channel);
    }
  }
}

export function getMissionLink(
  id: string,
  token: string,
) {
  return `${ window.location.origin } /stage2/${ id }?token = ${ encodeURIComponent(token) } `;
}
