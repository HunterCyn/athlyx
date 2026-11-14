/**
 * Body model: turns raw MediaPipe pose landmarks into a torso-normalised,
 * mirror-corrected "body frame", and scores how closely a live body matches
 * a target skeleton.
 *
 * Everything lives in TORSO UNITS (hip-centre to shoulder-centre = 1) so a
 * tall adult, a short adult and a kid all play the same game on the same
 * leaderboard. That normalisation is the whole trick behind "any body".
 */

export type Vec = { x: number; y: number };
export type RawLm = { x: number; y: number; visibility?: number };

export const JOINT_IDS = {
  head: 0,
  ls: 11,
  rs: 12,
  le: 13,
  re: 14,
  lw: 15,
  rw: 16,
  lh: 23,
  rh: 24,
  lk: 25,
  rk: 26,
  la: 27,
  ra: 28,
} as const;

export type Joint = keyof typeof JOINT_IDS;
export type Skeleton = Record<Joint, Vec>;

export const JOINTS = Object.keys(JOINT_IDS) as Joint[];

/** Bones drawn for the hologram. */
export const BONES: [Joint, Joint][] = [
  ['head', 'ls'],
  ['head', 'rs'],
  ['ls', 'rs'],
  ['ls', 'le'],
  ['le', 'lw'],
  ['rs', 're'],
  ['re', 'rw'],
  ['ls', 'lh'],
  ['rs', 'rh'],
  ['lh', 'rh'],
  ['lh', 'lk'],
  ['lk', 'la'],
  ['rh', 'rk'],
  ['rk', 'ra'],
];

/** How much each joint matters when scoring a pose. Hands rule everything. */
export const WEIGHTS: Record<Joint, number> = {
  head: 0.45,
  ls: 0.7,
  rs: 0.7,
  le: 1.25,
  re: 1.25,
  lw: 2.3,
  rw: 2.3,
  lh: 0.3,
  rh: 0.3,
  lk: 1.0,
  rk: 1.0,
  la: 1.15,
  ra: 1.15,
};

export type BodyPose = {
  /** Joints in body-frame torso units, origin at hip centre, y pointing down. */
  p: Skeleton;
  /** Hip centre in aspect-space units (x scaled by aspect, y in 0..1). */
  hip: Vec;
  /** Torso length in aspect-space units. */
  torso: number;
  /** True when the whole body is confidently inside the frame. */
  ok: boolean;
  /** 0..1 average landmark confidence. */
  seen: number;
};

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function toBody(landmarks: RawLm[] | null, aspect: number, mirror: boolean): BodyPose | null {
  if (!landmarks || landmarks.length < 29) return null;
  const lm = landmarks;
  for (const i of [11, 12, 23, 24]) if (!lm[i]) return null;

  const px = (i: number) => (mirror ? 1 - lm[i].x : lm[i].x) * aspect;
  const py = (i: number) => lm[i].y;

  const sh = { x: (px(11) + px(12)) / 2, y: (py(11) + py(12)) / 2 };
  const hip = { x: (px(23) + px(24)) / 2, y: (py(23) + py(24)) / 2 };
  const torso = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  if (!Number.isFinite(torso) || torso < 0.012) return null;

  const p = {} as Skeleton;
  for (const j of JOINTS) {
    const i = JOINT_IDS[j];
    const l = lm[i];
    if (!l) {
      p[j] = { x: 0, y: j === 'head' ? -1.3 : 0 };
      continue;
    }
    p[j] = { x: (px(i) - hip.x) / torso, y: (py(i) - hip.y) / torso };
  }

  const vis = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => lm[i]?.visibility ?? 1);
  const seen = vis.reduce((a, b) => a + b, 0) / vis.length;
  const anklesLow = py(27) > 0.42 && py(28) > 0.42 && py(27) < 0.992 && py(28) < 0.992;
  const torsoBigEnough = torso > 0.035;
  const ok = seen > 0.42 && anklesLow && torsoBigEnough;

  return { p, hip, torso, ok, seen };
}

/** A synthetic BodyPose from a body-frame skeleton, for the auto-demo. */
export function poseFromSkeleton(skel: Skeleton, hip: Vec, torso: number): BodyPose {
  return { p: { ...skel }, hip, torso, ok: true, seen: 1 };
}

export function mirrorSkeleton(skel: Skeleton): Skeleton {
  const out = {} as Skeleton;
  for (const j of JOINTS) out[j] = { x: -skel[j].x, y: skel[j].y };
  return out;
}

export function restSkeleton(): Skeleton {
  const out = {} as Skeleton;
  for (const j of JOINTS) out[j] = { x: 0, y: 0 };
  return out;
}

/**
 * Similarity of a live pose to a target, 0..1.
 * `far` is the torso-unit distance at which a joint stops scoring entirely;
 * shrinking it is how the game gets harder.
 */
export function scoreShape(live: Skeleton, target: Skeleton, far = 0.6, near = 0.1): number {
  let sum = 0;
  let wsum = 0;
  for (const j of JOINTS) {
    const d = dist(live[j], target[j]);
    const s = clamp01(1 - (d - near) / Math.max(0.05, far - near));
    const w = WEIGHTS[j];
    sum += s * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

/** Per-joint breakdown, handy when tuning a pose. */
export function scoreDetail(live: Skeleton, target: Skeleton, far = 0.6): Record<Joint, number> {
  const out = {} as Record<Joint, number>;
  for (const j of JOINTS) {
    const d = dist(live[j], target[j]);
    out[j] = clamp01(1 - (d - 0.1) / Math.max(0.05, far - 0.1));
  }
  return out;
}

/** 0..1 measure of how still a body is, used for the framing checklist. */
export function stillness(a: BodyPose | null, b: BodyPose | null): number {
  if (!a || !b) return 0;
  const d = dist(a.p.head, b.p.head) + dist(a.p.lw, b.p.lw) + dist(a.p.rw, b.p.rw);
  return clamp01(1 - d / 0.5);
}
