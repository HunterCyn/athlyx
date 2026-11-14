import { lerp, JOINTS, type BodyPose, type Skeleton } from '../lib/body';
import type { PoseSource } from '../lib/vision';

/**
 * Where the demo body starts: arms half-raised out to the sides, which is wrong
 * for every pose in the flow. It gives the coach something honest to correct
 * before the synthetic body settles into the shape.
 */
export function sloppy(skel: Skeleton): Skeleton {
  const out = {} as Skeleton;
  for (const j of JOINTS) out[j] = { ...skel[j] };
  const hipY = (skel.lh.y + skel.rh.y) / 2;
  const y = hipY - 0.32;
  out.lw = { x: -1.05, y };
  out.rw = { x: 1.05, y };
  out.le = { x: -0.86, y: y + 0.06 };
  out.re = { x: 0.86, y: y + 0.06 };
  return out;
}

/**
 * A synthetic practitioner. It starts slightly wrong, waits a beat so the
 * correction is readable, then settles into the pose — which is exactly the
 * demo you want on a laptop with no webcam.
 */
export class Yogi implements PoseSource {
  pose: BodyPose | null = null;
  status = 'ready' as const;
  error = '';
  aspect = 16 / 9;
  private cur: Skeleton;
  private goal: Skeleton;
  private t = 0;
  private wait = 0;

  constructor(start: Skeleton, goal?: Skeleton, wait = 0) {
    this.cur = { ...start };
    this.goal = { ...(goal ?? start) };
    this.wait = wait;
    this.pose = { p: { ...start }, hip: { x: 8 / 9, y: 0.6 }, torso: 0.16, ok: true, seen: 1 };
  }

  setGoal(skel: Skeleton) {
    this.goal = skel;
  }

  /** drops the body back into a sloppy start, then corrects after `wait` seconds */
  resetTo(skel: Skeleton, wait = 0) {
    this.cur = { ...skel };
    this.goal = skel;
    this.wait = wait;
  }

  tick(dt: number, aspect: number) {
    this.t += dt;
    if (this.wait > 0) {
      this.wait -= dt;
    } else {
      const speed = 0.9;
      for (const j of JOINTS) {
        const c = this.cur[j];
        const g = this.goal[j];
        const d = Math.hypot(g.x - c.x, g.y - c.y);
        const k = Math.min(1, (speed * dt) / Math.max(d, 1e-4));
        this.cur[j] = { x: lerp(c.x, g.x, k), y: lerp(c.y, g.y, k) };
      }
    }
    const breath = Math.sin(this.t * 1.7);
    const p = {} as Skeleton;
    for (const j of JOINTS) {
      const arm = j === 'lw' || j === 'rw' || j === 'le' || j === 're';
      p[j] = {
        x: this.cur[j].x + (arm ? breath * 0.008 : 0),
        y: this.cur[j].y + (arm ? 0 : breath * 0.006),
      };
    }
    this.aspect = aspect;
    this.pose = { p, hip: { x: aspect * 0.5, y: 0.6 }, torso: 0.18, ok: true, seen: 1 };
  }
}
