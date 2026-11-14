import { JOINTS, lerp, type Skeleton } from './body';
import type { Ghost, GhostFrame, Mode, RunOutcome, ScoreRow } from './types';

const KEY = 'ghostmove.v1';
const MAX_ROWS = 24;

export type DB = {
  rows: ScoreRow[];
  ghosts: Partial<Record<Mode, Ghost>>;
};

const empty = (): DB => ({ rows: [], ghosts: {} });

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows.filter(isRow) : [],
      ghosts: parsed.ghosts && typeof parsed.ghosts === 'object' ? parsed.ghosts : {},
    };
  } catch {
    return empty();
  }
}

function isRow(r: unknown): r is ScoreRow {
  const row = r as ScoreRow;
  return !!row && typeof row.score === 'number' && typeof row.name === 'string' && (row.mode === 'rush' || row.mode === 'flow');
}

function persist(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Storage full: drop ghosts, keep the score table. A demo never dies on quota.
    try {
      localStorage.setItem(KEY, JSON.stringify({ rows: db.rows, ghosts: {} }));
    } catch {
      /* ignore */
    }
  }
}

export function encodeSkeleton(s: Skeleton): number[] {
  const out: number[] = [];
  for (const j of JOINTS) {
    out.push(Math.round(s[j].x * 1000) / 1000, Math.round(s[j].y * 1000) / 1000);
  }
  return out;
}

export function decodeFrame(f: GhostFrame): Skeleton {
  const s = {} as Skeleton;
  JOINTS.forEach((j, i) => {
    s[j] = { x: f.p[i * 2] ?? 0, y: f.p[i * 2 + 1] ?? 0 };
  });
  return s;
}

export function ghostAt(g: Ghost | null, t: number): { skel: Skeleton; score: number } | null {
  if (!g || !g.frames.length) return null;
  const fr = g.frames;
  if (t <= fr[0].t) return { skel: decodeFrame(fr[0]), score: fr[0].s };
  const last = fr[fr.length - 1];
  if (t >= last.t) return { skel: decodeFrame(last), score: last.s };
  let lo = 0;
  let hi = fr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fr[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = fr[lo];
  const b = fr[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const sa = decodeFrame(a);
  const sb = decodeFrame(b);
  const out = {} as Skeleton;
  for (const j of JOINTS) out[j] = { x: lerp(sa[j].x, sb[j].x, k), y: lerp(sa[j].y, sb[j].y, k) };
  return { skel: out, score: lerp(a.s, b.s, k) };
}

export function champion(mode: Mode): Ghost | null {
  return loadDB().ghosts[mode] ?? null;
}

export function leaderboard(mode?: Mode): ScoreRow[] {
  const db = loadDB();
  return db.rows
    .filter((r) => !mode || r.mode === mode)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS);
}

export function saveRun(outcome: RunOutcome, name: string): { rank: number; isChampion: boolean; row: ScoreRow } {
  const db = loadDB();
  const row: ScoreRow = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName(name),
    mode: outcome.mode,
    score: Math.round(outcome.score),
    hits: outcome.hits,
    bestCombo: outcome.bestCombo,
    accuracy: outcome.accuracy,
    grade: outcome.grade,
    date: Date.now(),
  };
  db.rows = [...db.rows, row].sort((a, b) => b.score - a.score).slice(0, MAX_ROWS);

  const prev = db.ghosts[outcome.mode];
  const isChampion = !prev || row.score > prev.score;
  if (isChampion && outcome.frames.length > 2) {
    db.ghosts[outcome.mode] = {
      mode: outcome.mode,
      name: row.name,
      score: row.score,
      date: row.date,
      frames: outcome.frames,
    };
  }
  persist(db);
  const rank = db.rows.filter((r) => r.score > row.score).length + 1;
  return { rank, isChampion, row };
}

export function clearDB() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function cleanName(name: string): string {
  const n = name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);
  return n || 'PLAYER';
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
