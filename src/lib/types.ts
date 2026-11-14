import type { Joint } from './body';

export type Mode = 'rush' | 'flow';

export type GhostFrame = {
  /** seconds into the run */
  t: number;
  /** score at that moment */
  s: number;
  /** flat [x0,y0,x1,y1,...] body-frame joints, in JOINTS order */
  p: number[];
};

export type Ghost = {
  mode: Mode;
  name: string;
  score: number;
  date: number;
  frames: GhostFrame[];
};

export type ScoreRow = {
  id: string;
  name: string;
  mode: Mode;
  score: number;
  hits: number;
  bestCombo: number;
  accuracy: number;
  grade: string;
  date: number;
};

export type RunOutcome = {
  mode: Mode;
  score: number;
  hits: number;
  misses: number;
  bestCombo: number;
  accuracy: number;
  grade: string;
  flow: number;
  duration: number;
  frames: GhostFrame[];
  busted: boolean;
  ghostScore: number | null;
  ghostName: string | null;
  demo: boolean;
};

export type HudState = {
  score: number;
  combo: number;
  mult: number;
  timeLeft: number;
  quality: number;
  hold: number;
  targetName: string;
  targetHint: string;
  hits: number;
  misses: number;
  accuracy: number;
  ghostScore: number | null;
  ghostName: string | null;
  ahead: boolean;
  busted: boolean;
  lastGain: number;
  flowMeter: number;
  flowLabel: string;
  visible: boolean;
  phase: 'countdown' | 'live' | 'done';
};

export type { Joint };
