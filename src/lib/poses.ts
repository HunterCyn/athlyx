/**
 * The move library.
 *
 * Poses are authored as WRIST and ANKLE positions in body-frame torso units
 * (hip = 0,0 / shoulder line = -1) and solved with two-bone IK, so every
 * figure is anatomically reachable no matter who is standing in front of the
 * camera. Add a pose here and it joins the game automatically.
 */

import type { Joint, Skeleton, Vec } from './body';

const UPPER = 0.58;
const FORE = 0.5;
const THIGH = 0.92;
const SHIN = 0.86;
const SHOULDER_X = 0.42;
const SHOULDER_Y = -1;
const HIP_X = 0.28;
const HEAD_UP = 0.34;
const ANKLE_Y = 1.78;

type Arm = { w: [number, number]; bend: 1 | -1 };
type Leg = { a: [number, number]; bend: 1 | -1 };

export type PoseDef = {
  id: string;
  name: string;
  hint: string;
  lean?: number;
  arms: { l: Arm; r: Arm };
  legs: { l: Leg; r: Leg };
};

const leg = (x: number, y = ANKLE_Y): Leg => ({ a: [x, y], bend: 1 });

export const UPPERCASE_WARNING = '';

export const POSE_LIBRARY: PoseDef[] = [
  {
    id: 'wings',
    name: 'WINGS OUT',
    hint: 'arms straight out like a plane',
    arms: { l: { w: [-1.42, -1.02], bend: -1 }, r: { w: [1.42, -1.02], bend: 1 } },
    legs: { l: leg(-0.3), r: leg(0.3) },
  },
  {
    id: 'starburst',
    name: 'STARBURST',
    hint: 'arms up and out, feet wide',
    arms: { l: { w: [-1.14, -1.72], bend: -1 }, r: { w: [1.14, -1.72], bend: 1 } },
    legs: { l: leg(-0.78, 1.6), r: leg(0.78, 1.6) },
  },
  {
    id: 'hands-high',
    name: 'HANDS HIGH',
    hint: 'both hands above your head',
    arms: { l: { w: [-0.24, -1.92], bend: -1 }, r: { w: [0.24, -1.92], bend: 1 } },
    legs: { l: leg(-0.26), r: leg(0.26) },
  },
  {
    id: 'dab',
    name: 'THE DAB',
    hint: 'one elbow across your face',
    arms: { l: { w: [-1.38, -0.55], bend: -1 }, r: { w: [-0.02, -1.86], bend: 1 } },
    legs: { l: leg(-0.28), r: leg(0.28) },
  },
  {
    id: 'crossed',
    name: 'ARMS CROSSED',
    hint: 'fold your arms across your chest',
    arms: { l: { w: [0.3, -1.44], bend: -1 }, r: { w: [-0.3, -1.28], bend: 1 } },
    legs: { l: leg(-0.28), r: leg(0.28) },
  },
  {
    id: 'akimbo',
    name: 'HANDS ON HIPS',
    hint: 'elbows out, hands on hips',
    arms: { l: { w: [-0.34, -0.1], bend: -1 }, r: { w: [0.34, -0.1], bend: 1 } },
    legs: { l: leg(-0.32), r: leg(0.32) },
  },
  {
    id: 'flex',
    name: 'DOUBLE FLEX',
    hint: 'bodybuilder arms, elbows wide',
    arms: { l: { w: [-0.82, -1.62], bend: -1 }, r: { w: [0.82, -1.62], bend: 1 } },
    legs: { l: leg(-0.3), r: leg(0.3) },
  },
  {
    id: 'pray',
    name: 'PRAYER',
    hint: 'palms together at your chest',
    arms: { l: { w: [-0.07, -1.46], bend: -1 }, r: { w: [0.07, -1.46], bend: 1 } },
    legs: { l: leg(-0.22), r: leg(0.22) },
  },
  {
    id: 'one-up',
    name: 'ONE TO THE SKY',
    hint: 'one fist up, other hand on hip',
    arms: { l: { w: [-0.34, -0.1], bend: -1 }, r: { w: [0.3, -1.99], bend: 1 } },
    legs: { l: leg(-0.28), r: leg(0.28) },
  },
  {
    id: 'lean',
    name: 'SIDE LEAN',
    hint: 'lean over, one arm reaching high',
    lean: 18,
    arms: { l: { w: [-0.75, -0.55], bend: -1 }, r: { w: [1.18, -1.62], bend: 1 } },
    legs: { l: leg(-0.34), r: leg(0.34) },
  },
  {
    id: 'bigstar',
    name: 'BIG STAR',
    hint: 'widest star you can make',
    arms: { l: { w: [-1.35, -1.3], bend: -1 }, r: { w: [1.35, -1.3], bend: 1 } },
    legs: { l: leg(-1.05, 1.35), r: leg(1.05, 1.35) },
  },
  {
    id: 'hula',
    name: 'HULA WAVE',
    hint: 'both hands off to one side',
    arms: { l: { w: [0.3, -1.7], bend: -1 }, r: { w: [0.95, -1.3], bend: 1 } },
    legs: { l: leg(-0.3), r: leg(0.3) },
  },
];

const rot = (p: Vec, a: number): Vec => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});

/** Two-bone IK. Returns elbow/knee plus the reachable wrist/ankle. */
function ik(from: Vec, to: Vec, l1: number, l2: number, bend: number): { mid: Vec; end: Vec } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const raw = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(Math.max(raw, Math.abs(l1 - l2) + 0.02), l1 + l2 - 0.02);
  const nx = dx / raw;
  const ny = dy / raw;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mid = { x: from.x + nx * a - ny * h * bend, y: from.y + ny * a + nx * h * bend };
  const end = { x: from.x + nx * d, y: from.y + ny * d };
  return { mid, end };
}

export function buildSkeleton(def: PoseDef): Skeleton {
  const a = ((def.lean ?? 0) * Math.PI) / 180;
  const shL = rot({ x: -SHOULDER_X, y: SHOULDER_Y }, a);
  const shR = rot({ x: SHOULDER_X, y: SHOULDER_Y }, a);
  const hipL = { x: -HIP_X, y: 0 };
  const hipR = { x: HIP_X, y: 0 };
  const head = rot({ x: 0, y: SHOULDER_Y - HEAD_UP }, a);

  const armL = ik(shL, { x: def.arms.l.w[0], y: def.arms.l.w[1] }, UPPER, FORE, def.arms.l.bend);
  const armR = ik(shR, { x: def.arms.r.w[0], y: def.arms.r.w[1] }, UPPER, FORE, def.arms.r.bend);
  const legL = ik(hipL, { x: def.legs.l.a[0], y: def.legs.l.a[1] }, THIGH, SHIN, def.legs.l.bend);
  const legR = ik(hipR, { x: def.legs.r.a[0], y: def.legs.r.a[1] }, THIGH, SHIN, def.legs.r.bend);

  const skel: Skeleton = {
    head,
    ls: shL,
    rs: shR,
    le: armL.mid,
    re: armR.mid,
    lw: armL.end,
    rw: armR.end,
    lh: hipL,
    rh: hipR,
    lk: legL.mid,
    rk: legR.mid,
    la: legL.end,
    ra: legR.end,
  };
  return skel;
}

export type TargetInstance = {
  def: PoseDef;
  skel: Skeleton;
  mirrored: boolean;
};

const compiled = new Map<string, Skeleton>();

export function skeletonFor(def: PoseDef): Skeleton {
  let s = compiled.get(def.id);
  if (!s) {
    s = buildSkeleton(def);
    compiled.set(def.id, s);
  }
  return s;
}

export function makeTarget(def: PoseDef, mirrored: boolean): TargetInstance {
  const base = skeletonFor(def);
  const skel: Skeleton = {} as Skeleton;
  for (const j of Object.keys(base) as Joint[]) {
    skel[j] = mirrored ? { x: -base[j].x, y: base[j].y } : { ...base[j] };
  }
  return { def, skel, mirrored };
}

/** Rest pose used by the auto-demo between targets. */
export function restPose(): Skeleton {
  return makeTarget(POSE_LIBRARY[0], false).skel;
}
