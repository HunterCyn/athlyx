import type { ScreenResult } from './metrics';

const KEY = 'rtp.v1';

export function loadSessions(): ScreenResult[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScreenResult[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(result: ScreenResult) {
  try {
    const all = [result, ...loadSessions()].slice(0, 24);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a full disk never breaks a screen */
  }
}
