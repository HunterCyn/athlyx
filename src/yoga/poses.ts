import type { Joint, Skeleton } from '../lib/body';
import {
  armsLevel,
  armsRelaxed,
  armsWide,
  bottomHandLow,
  feetUnderHips,
  handsAboveHead,
  handsOverShoulders,
  headOverHips,
  hipLevel,
  kneeAt,
  legsStraight,
  shouldersLevel,
  sideBend,
  stacked,
  topArmExtended,
  torsoTall,
  village,
  type YogaCheck,
} from './checks';

export type YogaPoseId = 'mountain' | 'warrior1' | 'warrior2' | 'sideangle';

export type YogaPose = {
  id: YogaPoseId;
  name: string;
  sanskrit: string;
  feel: string;
  seconds: number;
  steps: string[];
  ref: Skeleton;
  checks: YogaCheck[];
  /** true for the lunge poses, which need a wide face-on stance */
  lunge: boolean;
};

/**
 * Sketches are authored in torso units (hip centre = 0,0 / shoulder line = -1)
 * and drawn at the player's own hip position and torso scale, so the ghost
 * lands on any body.
 */
const BASE: Record<Joint, [number, number]> = {
  head: [0, -1.34],
  ls: [-0.42, -1],
  rs: [0.42, -1],
  le: [-0.46, -0.52],
  re: [0.46, -0.52],
  lw: [-0.48, 0.08],
  rw: [0.48, 0.08],
  lh: [-0.28, 0],
  rh: [0.28, 0],
  lk: [-0.3, 0.88],
  rk: [0.3, 0.88],
  la: [-0.31, 1.74],
  ra: [0.31, 1.74],
};

const sk = (o: Partial<Record<Joint, [number, number]>>): Skeleton => {
  const out = {} as Skeleton;
  for (const j of Object.keys(BASE) as Joint[]) {
    const v = o[j] ?? BASE[j];
    out[j] = { x: v[0], y: v[1] };
  }
  return out;
};

/** right leg is the bent/front leg in every sketch; the app mirrors as needed */
const LUNGE = {
  rh: [0.28, 0],
  rk: [1.2, 0.05],
  ra: [1.2, 0.9],
  lh: [-0.28, 0],
  lk: [-1.0, 0.42],
  la: [-1.82, 0.9],
} satisfies Partial<Record<Joint, [number, number]>>;

export const POSES: YogaPose[] = [
  {
    id: 'mountain',
    name: 'Mountain',
    sanskrit: 'Tadasana',
    feel: 'Stand tall. This is the pose you return to.',
    seconds: 16,
    steps: ['Feet hip-width, weight even', 'Arms heavy by your sides', 'Crown lifting, ribs soft'],
    ref: sk({}),
    lunge: false,
    checks: [torsoTall(4, 16), legsStraight(), feetUnderHips(), shouldersLevel(), armsRelaxed(), headOverHips()],
  },
  {
    id: 'warrior1',
    name: 'Warrior I',
    sanskrit: 'Virabhadrasana I',
    feel: 'Step wide, bend the front knee, reach up.',
    seconds: 22,
    steps: ['Step your right foot wide', 'Front knee over the ankle', 'Both arms up, chest open'],
    ref: sk({ ...LUNGE, le: [-0.3, -1.58], re: [0.3, -1.58], lw: [-0.24, -1.98], rw: [0.24, -1.98], head: [0, -1.36] }),
    lunge: true,
    checks: [
      kneeAt('front', 90, 12, 42, 'Bend your front knee closer to 90°'),
      stacked('front'),
      kneeAt('back', 180, 12, 38, 'Straighten your back leg'),
      village(),
      handsAboveHead(),
      handsOverShoulders(),
      torsoTall(8, 24),
    ],
  },
  {
    id: 'warrior2',
    name: 'Warrior II',
    sanskrit: 'Virabhadrasana II',
    feel: 'Wide, level, and steady. Your arms are the horizon.',
    seconds: 22,
    steps: ['Step your right foot wide', 'Front knee bent, back leg long', 'Arms out level with the shoulders'],
    ref: sk({ ...LUNGE, le: [-1.0, -1.0], re: [1.0, -1.0], lw: [-1.56, -1.0], rw: [1.56, -1.0] }),
    lunge: true,
    checks: [
      kneeAt('front', 90, 12, 42, 'Bend your front knee closer to 90°'),
      stacked('front'),
      kneeAt('back', 180, 12, 38, 'Straighten your back leg'),
      village(),
      armsLevel(),
      armsWide(),
      torsoTall(8, 24),
      hipLevel(),
    ],
  },
  {
    id: 'sideangle',
    name: 'Extended Side Angle',
    sanskrit: 'Utthita Parsvakonasana',
    feel: 'One long line from your back heel to your top fingertips.',
    seconds: 24,
    steps: ['Front knee bent, back leg long', 'Bottom hand toward the floor', 'Top arm reaches over your head'],
    ref: sk({
      ...LUNGE,
      ls: [0.02, -0.98],
      rs: [0.74, -0.72],
      le: [0.42, -1.38],
      lw: [0.8, -1.75],
      re: [1.0, -0.25],
      rw: [1.05, 0.26],
      head: [0.46, -1.2],
    }),
    lunge: true,
    checks: [
      kneeAt('front', 90, 12, 42, 'Bend your front knee closer to 90°'),
      stacked('front'),
      kneeAt('back', 180, 12, 38, 'Straighten your back leg'),
      village(),
      sideBend(),
      bottomHandLow(),
      topArmExtended(),
    ],
  },
];

export const poseById = (id: YogaPoseId) => POSES.find((p) => p.id === id)!;

/** Mirrors a sketch so left-handed / left-footed players get a matching ghost. */
export function mirrorPose(skel: Skeleton): Skeleton {
  const out = {} as Skeleton;
  for (const j of Object.keys(skel) as Joint[]) out[j] = { x: -skel[j].x, y: skel[j].y };
  return out;
}
