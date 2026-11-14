import type { BodyPose, Skeleton } from '../lib/body';
import type { SourceStatus } from '../lib/vision';
import { detectLanding, measureTrial, type Frame } from './metrics';

/**
 * A synthetic athlete performing a bilateral drop landing.
 *
 * Two jobs:
 *  1. The demo body — the whole screen works on a laptop with no webcam.
 *  2. The test rig — we can plant a known valgus angle and assert the pipeline
 *     reads it back. That is the only honest way to validate a measurement
 *     pipeline without a lab or a patient.
 */

export type AthleteOpts = { valgusLeft: number; valgusRight: number };

const CYCLE = 3.6;
const STAND = 0.8;
const FALL = 1.05;
const BOTTOM = 1.22;
const RECOVER = 1.75;

const TAN = Math.tan;

type Shape = { hipY: number; fold: number };

function shapeAt(t: number): Shape {
  const u = t % CYCLE;
  if (u < STAND) return { hipY: 0.46, fold: 0 };
  if (u < FALL) {
    const k = (u - STAND) / (FALL - STAND);
    return { hipY: 0.46 + 0.12 * k, fold: 0.05 * k };
  }
  if (u < BOTTOM) {
    const k = (u - FALL) / (BOTTOM - FALL);
    return { hipY: 0.58 + 0.05 * k, fold: 0.05 + 0.95 * k };
  }
  if (u < RECOVER) {
    const k = (u - BOTTOM) / (RECOVER - BOTTOM);
    return { hipY: 0.63 - 0.17 * k, fold: 1 - k };
  }
  return { hipY: 0.46, fold: 0 };
}

/**
 * Builds a 33-landmark body in torso units: hip centre at the origin, shoulder
 * line at y = -1, ankles around y = +1.8. `fold` shortens the legs (the landing
 * compression), and `bias` scales how far the knees have collapsed inward.
 */
export function bodyAt(t: number, opts: AthleteOpts): { skel: Skeleton; hipY: number } {
  const { hipY, fold } = shapeAt(t);
  const ankleY = 1.8 - 0.38 * fold;
  const kneeY = 0.9 - 0.19 * fold;
  const stance = 0.26 + 0.04 * fold;

  // The neutral knee sits exactly on the hip->ankle line, so a planted angle is
  // the only thing the measurement can pick up. Any offset here becomes a
  // systematic bias in every reading.
  const kneeBase = (0.22 + stance) / 2;

  // Valgus appears with the compression: at full fold the knee sits at the
  // planted angle, exactly as the measurement reads it back.
  const medial = (deg: number) => TAN((Math.max(0, deg) * Math.PI) / 180) * (ankleY / 2) * fold;

  const lk = { x: -kneeBase + medial(opts.valgusLeft), y: kneeY };
  const rk = { x: kneeBase - medial(opts.valgusRight), y: kneeY };

  const skel: Skeleton = {
    head: { x: 0, y: -1.28 },
    ls: { x: -0.5, y: -1 },
    rs: { x: 0.5, y: -1 },
    le: { x: -0.64, y: -0.34 + fold * 0.08 },
    re: { x: 0.64, y: -0.34 + fold * 0.08 },
    lw: { x: -0.72, y: 0.28 - fold * 0.1 },
    rw: { x: 0.72, y: 0.28 - fold * 0.1 },
    lh: { x: -0.22, y: 0 },
    rh: { x: 0.22, y: 0 },
    lk,
    rk,
    la: { x: -stance, y: ankleY },
    ra: { x: stance, y: ankleY },
  };
  return { skel, hipY };
}

export class Athlete {
  pose: BodyPose | null = null;
  aspect = 16 / 9;
  status: SourceStatus = 'ready';
  error = '';
  private t = 0;
  private opts: AthleteOpts;

  constructor(opts: AthleteOpts = { valgusLeft: 4, valgusRight: 12 }) {
    this.opts = opts;
    this.pose = this.make();
  }

  reset(opts?: Partial<AthleteOpts>) {
    this.t = 0;
    if (opts) this.opts = { ...this.opts, ...opts };
    this.pose = this.make();
  }

  tick(dt: number, aspect: number) {
    this.aspect = aspect;
    this.t += dt;
    this.pose = this.make();
  }

  private make(): BodyPose {
    const { skel, hipY } = bodyAt(this.t, this.opts);
    const wobble = (seed: number) => ({
      x: Math.sin(this.t * 3.1 + seed) * 0.004,
      y: Math.cos(this.t * 2.7 + seed) * 0.003,
    });
    const p = { ...skel };
    for (const k of Object.keys(p) as (keyof Skeleton)[]) {
      const w = wobble(k.length * 1.7);
      p[k] = { x: p[k].x + w.x, y: p[k].y + w.y };
    }
    return {
      p,
      hip: { x: this.aspect * 0.5, y: hipY },
      torso: 0.175,
      ok: true,
      seen: 1,
    };
  }
}

/** Steps the synthetic athlete through one cycle and captures frames at 60 fps. */
export function syntheticFrames(valgusLeft: number, valgusRight: number, seconds = CYCLE): Frame[] {
  const athlete = new Athlete({ valgusLeft, valgusRight });
  const frames: Frame[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    athlete.tick(dt, 16 / 9);
    if (athlete.pose) frames.push({ t: i * dt, pose: athlete.pose });
  }
  return frames;
}

export type SelfTestRow = { planted: number; measured: number; delta: number };

/**
 * Plants a valgus angle on each side and checks the pipeline recovers it.
 * Run on the report screen so the claim on stage is reproducible.
 */
export function selfTest(planted = [4, 8, 12, 18]): SelfTestRow[] {
  return planted.map((deg) => {
    const frames = syntheticFrames(deg, deg);
    const landing = detectLanding(frames);
    if (!landing) return { planted: deg, measured: NaN, delta: NaN };
    const m = measureTrial(frames, landing);
    const measured = (m.leftValgus + m.rightValgus) / 2;
    return { planted: deg, measured, delta: Math.abs(measured - deg) };
  });
}
