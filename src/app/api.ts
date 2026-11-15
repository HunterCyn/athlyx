export type Role = 'athlete' | 'therapist';

export type User = { id: string; role: Role; name: string; email: string; inviteCode?: string | null };

export type Athlete = {
  id: string;
  name: string;
  email: string;
  cadence_days: number | null;
  next_check_in: number | null;
  note: string | null;
  last_idx: number | null;
  last_status: string | null;
  last_at: number | null;
};

export type Checkin = {
  id: string;
  captured_at: number;
  idx: number;
  status: string;
  trials: number;
  left_deg: number;
  right_deg: number;
};

export type Exercise = {
  id: string;
  name: string;
  stage: string;
  instructions: string;
  source: string | null;
  owner_id: string | null;
};

export type PlanItem = {
  id: string;
  name: string;
  stage: string;
  instructions: string;
  source: string | null;
  sets: number;
  reps: number;
  note: string | null;
  done_at: number | null;
};

export type Plan = { id: string; message: string | null; createdAt: number; items: PlanItem[] } | null;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => call<{ user: User | null }>('/api/auth/me').then((d) => d.user).catch(() => null),
  signup: (body: { name: string; email: string; password: string; role: Role }) =>
    call<{ user: User }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.user),
  login: (body: { email: string; password: string }) =>
    call<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }).then((d) => d.user),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  code: () => call<{ code: string }>('/api/athlete/code').then((d) => d.code),
  redeem: (code: string) => call<{ athlete: { id: string; name: string } }>('/api/links/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
  athletes: () => call<{ athletes: Athlete[] }>('/api/athletes').then((d) => d.athletes),
  assign: (body: { athleteId: string; cadenceDays: number; note: string }) =>
    call<{ ok: true }>('/api/assignments', { method: 'POST', body: JSON.stringify(body) }),
  assignment: () =>
    call<{ assignment: { cadenceDays: number; nextCheckIn: number; note: string | null } | null; therapist: string | null }>(
      '/api/me/assignment',
    ),
  checkins: (athleteId?: string) =>
    call<{ checkins: Checkin[] }>(`/api/checkins${athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : ''}`).then(
      (d) => d.checkins,
    ),
  saveCheckin: (body: Record<string, unknown>) =>
    call<{ id: string }>('/api/checkins', { method: 'POST', body: JSON.stringify(body) }),
  exercises: () => call<{ exercises: Exercise[] }>('/api/exercises').then((d) => d.exercises),
  createExercise: (body: { name: string; instructions: string; stage: string }) =>
    call<{ id: string }>('/api/exercises', { method: 'POST', body: JSON.stringify(body) }),
  plan: (athleteId?: string) =>
    call<{ plan: Plan }>(`/api/plans${athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : ''}`).then((d) => d.plan),
  savePlan: (body: { athleteId: string; message: string; items: { exerciseId: string; sets: number; reps: number }[] }) =>
    call<{ id: string }>('/api/plans', { method: 'POST', body: JSON.stringify(body) }),
  complete: (planId: string, itemId: string) =>
    call<{ ok: true }>(`/api/plans/${planId}/items/${itemId}/complete`, { method: 'POST' }),
};

export const fmtDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

export const fmtWhen = (ms: number | null | undefined) => {
  if (!ms) return 'not yet';
  const days = Math.round((ms - Date.now()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  if (days === -1) return 'yesterday';
  return `${Math.abs(days)} days ago`;
};
