/**
 * Alignment scoring for yoga.
 *
 * The arcade scorer in lib/body.ts asks "are your joints near these points?".
 * That is the wrong question for a coach: it lets a hip-tilt or a collapsed
 * knee hide inside the tolerance, and it punishes people whose femurs are
 * longer than the reference figure's.
 *
 * Here every check is an anatomical measurement — joint angles, knee-over-ankle
 * stacking, stance width, shoulder levelness, torso lean — normalised by torso
 * length so it is scale invariant. A check returns an ERROR (0 = perfect);
 * the store maps that through a tolerance window into 0..1.
 */

import { clamp01, type Skeleton, type Vec } from '../lib/body';

export type Side = 'l' | 'r';

export type Baseline = {
  /** signed shoulder height difference (left minus right), torso units */
  shoulderDx: number;
  /** signed hip height difference */
  hipDx: number;
  /** natural torso lean, degrees */
  lean: number;
  /** natural stance width between ankles */
  stance: number;
  /** natural arm drop: wrist height below the hip */
  armDrop: number;
  calibrated: boolean;
};

export const emptyBaseline = (): Baseline => ({
  shoulderDx: 0,
  hipDx: 0,
  lean: 0,
  stance: 0.58,
  armDrop: 0.1,
  calibrated: false,
});

export type Ctx = { front: Side; back: Side; baseline: Baseline };

export type YogaCheck = {
  id: string;
  label: string;
  cue: string;
  weight: number;
  /** error in degrees or torso units; 0 = perfect, null = not measurable */
  measure: (p: Skeleton, ctx: Ctx) => number | null;
  ok: number;
  bad: number;
};

export type CheckResult = { id: string; label: string; cue: string; score: number; error: number; weight: number };

export type Evaluation = {
  score: number;
  results: CheckResult[];
  /** failing checks, worst first — these become the spoken cues */
  worst: CheckResult[];
};

/* ---------- geometry ---------- */

const sub = (a: Vec, b: Vec): Vec => ({ x: b.x - a.x, y: b.y - a.y });
const norm = (v: Vec) => Math.hypot(v.x, v.y) || 1e-6;

export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function angleAt(a: Vec, b: Vec, c: Vec): number {
  const u = sub(b, a);
  const w = sub(b, c);
  const d = (u.x * w.x + u.y * w.y) / (norm(u) * norm(w));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

/** degrees away from straight up (0 = perfectly vertical) */
export function leanDegrees(from: Vec, to: Vec): number {
  const v = sub(from, to);
  return Math.abs((Math.atan2(v.x, -v.y) * 180) / Math.PI);
}

export function signedLean(from: Vec, to: Vec): number {
  const v = sub(from, to);
  return (Math.atan2(v.x, -v.y) * 180) / Math.PI;
}

export const kneeAngle = (p: Skeleton, s: Side) =>
  angleAt(s === 'l' ? p.lh : p.rh, s === 'l' ? p.lk : p.rk, s === 'l' ? p.la : p.ra);

export const other = (s: Side): Side => (s === 'l' ? 'r' : 'l');

export function buildCtx(p: Skeleton, baseline: Baseline, preferFront?: Side): Ctx {
  const lk = kneeAngle(p, 'l');
  const rk = kneeAngle(p, 'r');
  let front: Side;
  if (preferFront) front = preferFront;
  else front = lk <= rk ? 'l' : 'r';
  return { front, back: other(front), baseline };
}

export function evaluate(p: Skeleton, checks: YogaCheck[], ctx: Ctx): Evaluation {
  let sum = 0;
  let wsum = 0;
  const results: CheckResult[] = [];
  for (const c of checks) {
    const err = c.measure(p, ctx);
    if (err === null || !Number.isFinite(err)) continue;
    const span = Math.max(1e-4, c.bad - c.ok);
    const score = clamp01(1 - (err - c.ok) / span);
    results.push({ id: c.id, label: c.label, cue: c.cue, score, error: err, weight: c.weight });
    sum += score * c.weight;
    wsum += c.weight;
  }
  const score = wsum > 0 ? sum / wsum : 0;
  const worst = results
    .filter((r) => r.score < 0.72)
    .sort((a, b) => a.score - b.score || b.weight - a.weight)
    .slice(0, 2);
  return { score, results, worst };
}

/* ---------- check factories ---------- */

const W = {
  leg: 1.3,
  stack: 1.25,
  stance: 0.85,
  arm: 1.0,
  torso: 1.1,
  head: 0.7,
};

export const kneeAt = (side: 'front' | 'back', target: number, ok: number, bad: number, cue: string, weight = W.leg): YogaCheck => ({
  id: `${side}-knee`,
  label: side === 'front' ? `Front knee ${target}°` : 'Back leg straight',
  cue,
  weight,
  ok,
  bad,
  measure: (p, ctx) => Math.abs(kneeAngle(p, ctx[side]) - target),
});

export const village = (): YogaCheck => ({
  id: 'stance',
  label: 'Wide stance',
  cue: 'Step your feet wider apart',
  weight: W.stance,
  ok: 0,
  bad: 0.85,
  measure: (p) => Math.max(0, 1.85 - Math.abs(p.la.x - p.ra.x)),
});

export const stacked = (side: 'front' | 'back', cue = 'Stack your front knee over your ankle'): YogaCheck => ({
  id: `${side}-stack`,
  label: 'Knee over ankle',
  cue,
  weight: W.stack,
  ok: 0.12,
  bad: 0.4,
  measure: (p, ctx) => {
    const s = ctx[side];
    const knee = s === 'l' ? p.lk : p.rk;
    const ankle = s === 'l' ? p.la : p.ra;
    return Math.abs(knee.x - ankle.x);
  },
});

export const torsoTall = (ok = 4, bad = 18): YogaCheck => ({
  id: 'torso',
  label: 'Torso tall',
  cue: 'Stand taller — you are leaning',
  weight: W.torso,
  ok,
  bad,
  measure: (p, ctx) => Math.abs(leanDegrees(mid(p.lh, p.rh), mid(p.ls, p.rs)) - Math.abs(ctx.baseline.lean)),
});

export const shouldersLevel = (): YogaCheck => ({
  id: 'shoulders',
  label: 'Shoulders level',
  cue: 'Even out your shoulders',
  weight: W.arm,
  ok: 0.05,
  bad: 0.2,
  measure: (p, ctx) => Math.abs(p.ls.y - p.rs.y - ctx.baseline.shoulderDx),
});

export const feetUnderHips = (): YogaCheck => ({
  id: 'feet',
  label: 'Feet under hips',
  cue: 'Bring your feet hip-width apart',
  weight: W.stance,
  ok: 0.14,
  bad: 0.45,
  measure: (p, ctx) => Math.abs(Math.abs(p.la.x - p.ra.x) - ctx.baseline.stance),
});

export const legsStraight = (): YogaCheck => ({
  id: 'legs',
  label: 'Legs straight',
  cue: 'Straighten your legs, lift your kneecaps',
  weight: W.leg,
  ok: 7,
  bad: 26,
  measure: (p) => Math.max(180 - kneeAngle(p, 'l'), 180 - kneeAngle(p, 'r')),
});

export const headOverHips = (): YogaCheck => ({
  id: 'head',
  label: 'Head over hips',
  cue: 'Bring your head back over your hips',
  weight: W.head,
  ok: 0.07,
  bad: 0.26,
  measure: (p) => {
    const hipMid = mid(p.lh, p.rh);
    return Math.abs(p.head.x - hipMid.x);
  },
});

export const armsRelaxed = (): YogaCheck => ({
  id: 'arms',
  label: 'Arms by your sides',
  cue: 'Let your arms hang by your sides',
  weight: W.arm,
  ok: 0.25,
  bad: 0.75,
  measure: (p, ctx) => {
    const hipY = mid(p.lh, p.rh).y;
    const dl = Math.abs(p.lw.y - hipY - ctx.baseline.armDrop);
    const dr = Math.abs(p.rw.y - hipY - ctx.baseline.armDrop);
    const wide = Math.max(0, Math.abs(p.lw.x) - 0.9) + Math.max(0, Math.abs(p.rw.x) - 0.9);
    return Math.max(dl, dr) + wide;
  },
});

export const handsAboveHead = (): YogaCheck => ({
  id: 'hands-up',
  label: 'Arms overhead',
  cue: 'Reach both arms up over your head',
  weight: W.arm,
  ok: 0,
  bad: 0.55,
  measure: (p) => Math.max(0, Math.max(p.lw.y, p.rw.y) - (p.head.y - 0.05)),
});

export const handsOverShoulders = (): YogaCheck => ({
  id: 'arms-up',
  label: 'Arms stacked over shoulders',
  cue: 'Bring your arms parallel, over your shoulders',
  weight: W.arm,
  ok: 0.22,
  bad: 0.65,
  measure: (p) => (Math.abs(p.lw.x - p.ls.x) + Math.abs(p.rw.x - p.rs.x)) / 2,
});

export const armsLevel = (): YogaCheck => ({
  id: 'arms-level',
  label: 'Arms level',
  cue: 'Lift your arms level with your shoulders',
  weight: W.arm,
  ok: 0.15,
  bad: 0.45,
  measure: (p) => Math.abs(mid(p.lw, p.rw).y - mid(p.ls, p.rs).y),
});

export const armsWide = (): YogaCheck => ({
  id: 'arms-wide',
  label: 'Arms extended',
  cue: 'Stretch both arms out wide',
  weight: W.arm,
  ok: 0,
  bad: 0.95,
  measure: (p) => Math.max(0, 2.15 - Math.abs(p.lw.x - p.rw.x)),
});

export const sideBend = (): YogaCheck => ({
  id: 'bend',
  label: 'Side bend over front leg',
  cue: 'Bend sideways over your front leg',
  weight: W.torso,
  ok: 0,
  bad: 22,
  measure: (p, ctx) => {
    const hipMid = mid(p.lh, p.rh);
    const shoulderMid = mid(p.ls, p.rs);
    const deg = leanDegrees(hipMid, shoulderMid);
    const dir = Math.sign(shoulderMid.x - hipMid.x) || 1;
    // bend toward the bent knee, whichever side of the frame it lands on
    const knee = ctx.front === 'l' ? p.lk : p.rk;
    const want = Math.sign(knee.x - hipMid.x) || 1;
    const wrong = dir === want ? 0 : 40;
    const outside = deg < 15 ? 15 - deg : deg > 42 ? deg - 42 : 0;
    return wrong + outside;
  },
});

export const bottomHandLow = (): YogaCheck => ({
  id: 'bottom-hand',
  label: 'Bottom hand toward the floor',
  cue: 'Take your bottom hand down toward the floor',
  weight: W.arm,
  ok: 0,
  bad: 0.6,
  measure: (p, ctx) => {
    const wrist = ctx.front === 'l' ? p.lw : p.rw;
    const hipY = mid(p.lh, p.rh).y;
    return Math.max(0, hipY - 0.15 - wrist.y);
  },
});

export const topArmExtended = (): YogaCheck => ({
  id: 'top-arm',
  label: 'Top arm reaching long',
  cue: 'Reach your top arm long over your head',
  weight: W.arm,
  ok: 0,
  bad: 0.6,
  measure: (p, ctx) => {
    const wrist = ctx.back === 'l' ? p.lw : p.rw;
    const hipMid = mid(p.lh, p.rh);
    const high = Math.max(0, wrist.y - hipMid.y + 1.05);
    const far = Math.max(0, 0.65 - Math.abs(wrist.x - hipMid.x));
    return high + far;
  },
});

export const hipLevel = (): YogaCheck => ({
  id: 'hips',
  label: 'Hips level',
  cue: 'Level out your hips',
  weight: W.stance,
  ok: 0.05,
  bad: 0.2,
  measure: (p, ctx) => Math.abs(p.lh.y - p.rh.y - ctx.baseline.hipDx),
});

/** Baseline from a standing Mountain pose — learns this body, not an average one. */
export function calibrate(frames: Skeleton[]): Baseline {
  if (!frames.length) return emptyBaseline();
  const pick = (f: (p: Skeleton) => number) => frames.reduce((a, b) => a + f(b), 0) / frames.length;
  return {
    shoulderDx: pick((p) => p.ls.y - p.rs.y),
    hipDx: pick((p) => p.lh.y - p.rh.y),
    lean: pick((p) => signedLean(mid(p.lh, p.rh), mid(p.ls, p.rs))),
    stance: pick((p) => Math.abs(p.la.x - p.ra.x)),
    armDrop: pick((p) => (p.lw.y + p.rw.y) / 2 - mid(p.lh, p.rh).y),
    calibrated: true,
  };
}
