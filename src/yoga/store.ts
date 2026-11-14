import type { Baseline } from './checks';
import type { YogaPoseId } from './poses';

const KEY = 'still.v1';

export type PoseResult = {
  id: YogaPoseId;
  name: string;
  seconds: number;
  alignment: number;
  cues: string[];
};

export type Session = {
  date: number;
  alignment: number;
  results: PoseResult[];
};

export type DB = {
  baseline: Baseline | null;
  sessions: Session[];
  best: Partial<Record<YogaPoseId, number>>;
};

const empty = (): DB => ({ baseline: null, sessions: [], best: {} });

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      baseline: parsed.baseline ?? null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
    };
  } catch {
    return empty();
  }
}

function persist(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* a full disk never breaks a practice */
  }
}

export function saveBaseline(baseline: Baseline) {
  const db = loadDB();
  persist({ ...db, baseline });
}

export function saveSession(session: Session) {
  const db = loadDB();
  const best = { ...db.best };
  for (const r of session.results) {
    if (!best[r.id] || r.alignment > (best[r.id] ?? 0)) best[r.id] = r.alignment;
  }
  persist({ ...db, sessions: [session, ...db.sessions].slice(0, 12), best });
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
