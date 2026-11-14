import { clamp01, dist, lerp, type BodyPose, type Skeleton } from './body';
import { POSE_LIBRARY, makeTarget, skeletonFor, type PoseDef, type TargetInstance } from './poses';
import { encodeSkeleton, ghostAt } from './store';
import type { Ghost, GhostFrame, HudState, Mode, RunOutcome } from './types';

export const MODE_INFO: Record<Mode, { name: string; kicker: string; duration: number; blurb: string; detail: string }> = {
  rush: {
    name: 'POSE RUSH',
    kicker: 'THE MAIN EVENT',
    duration: 60,
    blurb: 'Break the targets. Chain the combo. 60 seconds.',
    detail: 'A ghost skeleton appears. Copy it, hold it, watch your multiplier climb.',
  },
  flow: {
    name: 'FLOW STATE',
    kicker: 'THE FREESTYLE',
    duration: 30,
    blurb: 'No targets. Just move. The AI judges your flow.',
    detail: 'Breadth, smoothness and balance. Dance like the camera owes you money.',
  },
};

export type SfxEvent = { type: 'hit' | 'miss' | 'tick' | 'finish' | 'bust' | 'go'; combo?: number };

const LOCK = 0.74;
const REC_HZ = 12;

export class Run {
  readonly mode: Mode;
  readonly duration: number;
  readonly ghost: Ghost | null;

  t = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  hits = 0;
  misses = 0;
  finished = false;

  target: TargetInstance | null = null;
  quality = 0;
  qualitySm = 0;
  hold = 0;
  targetAge = 0;
  spawnDelay = 0;
  private recent: string[] = [];

  events: SfxEvent[] = [];
  frames: GhostFrame[] = [];
  private recAcc = 0;

  busted = false;
  lastGain = 0;
  lastGainAt = -99;
  flashHitAt = -99;
  flashMissAt = -99;

  flow = { breadth: 0, smooth: 1, symmetry: 1, meter: 0, avg: 0, n: 0, sum: 0, pulse: 0 };

  private accSum = 0;
  private accCount = 0;
  private lastPose: BodyPose | null = null;
  private bbox = { minX: 9e9, maxX: -9e9, minY: 9e9, maxY: -9e9 };
  private jerkSum = 0;
  private jerkN = 0;
  private symSum = 0;
  private symN = 0;
  private prevSpeed: Record<string, number> = {};

  constructor(mode: Mode, ghost: Ghost | null) {
    this.mode = mode;
    this.duration = MODE_INFO[mode].duration;
    this.ghost = ghost;
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.t);
  }

  get mult() {
    return 1 + Math.min(this.combo, 24) * 0.12;
  }

  private tolerance() {
    return 0.62 - Math.min(0.15, this.hits * 0.011);
  }

  private holdNeed() {
    return 0.4 - Math.min(0.13, this.hits * 0.008);
  }

  private timeLimit() {
    return 5.8 - Math.min(2.4, this.hits * 0.1);
  }

  private pickDef(): PoseDef {
    const pool = POSE_LIBRARY.filter((p) => !this.recent.includes(p.id));
    const list = pool.length ? pool : POSE_LIBRARY;
    return list[Math.floor(Math.random() * list.length)];
  }

  private spawn(pose: BodyPose | null) {
    const def = this.pickDef();
    this.recent = [...this.recent, def.id].slice(-2);
    let best = makeTarget(def, false);
    if (pose) {
      const a = makeTarget(def, false);
      const b = makeTarget(def, true);
      const scoreOf = (t: TargetInstance) => {
        let sum = 0;
        let w = 0;
        for (const j of Object.keys(t.skel) as (keyof Skeleton)[]) {
          sum += dist(pose.p[j], t.skel[j]);
          w += 1;
        }
        return sum / w;
      };
      best = scoreOf(b) < scoreOf(a) ? b : a;
    }
    this.target = best;
    this.targetAge = 0;
    this.hold = 0;
  }

  update(dt: number, pose: BodyPose | null): SfxEvent[] {
    this.events = [];
    if (this.finished) return this.events;
    const step = Math.min(Math.max(dt, 0), 0.06);
    this.t += step;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.finish();
      return this.events;
    }
    if (this.mode === 'rush') this.updateRush(step, pose);
    else this.updateFlow(step, pose);
    this.record(step, pose);
    this.checkBust();
    this.lastPose = pose;
    return this.events;
  }

  private updateRush(dt: number, pose: BodyPose | null) {
    if (!this.target) {
      if (this.spawnDelay > 0) {
        this.spawnDelay -= dt;
        return;
      }
      this.spawn(pose);
    }
    const t = this.target;
    if (!t) return;

    const visible = !!pose?.ok;
    if (visible && pose) {
      this.targetAge += dt;
      const far = this.tolerance();
      const q = Math.max(0, Math.min(1, scoreOf(pose, t.skel, far)));
      this.quality = q;
      this.qualitySm = lerp(this.qualitySm, q, 1 - Math.exp(-dt * 14));
      if (q >= LOCK) {
        this.hold = Math.min(1, this.hold + dt / Math.max(0.1, this.holdNeed()));
        if (this.hold >= 1) this.complete(q);
      } else {
        this.hold = Math.max(0, this.hold - dt * 1.8);
      }
    } else {
      this.qualitySm = lerp(this.qualitySm, 0, 1 - Math.exp(-dt * 10));
      this.hold = Math.max(0, this.hold - dt * 1.8);
    }
    if (this.target && this.targetAge > this.timeLimit()) this.fail();
  }

  private complete(q: number) {
    const mult = this.mult;
    const accBonus = clamp01((q - LOCK) / (1 - LOCK));
    const gained = Math.round((90 + 110 * accBonus) * mult);
    this.score += gained;
    this.lastGain = gained;
    this.lastGainAt = this.t;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.hits += 1;
    this.accSum += q;
    this.accCount += 1;
    this.flashHitAt = this.t;
    this.target = null;
    this.hold = 0;
    this.quality = 0;
    this.targetAge = 0;
    this.spawnDelay = 0.3;
    this.events.push({ type: 'hit', combo: this.combo });
  }

  private fail() {
    this.combo = 0;
    this.misses += 1;
    this.flashMissAt = this.t;
    this.target = null;
    this.hold = 0;
    this.quality = 0;
    this.targetAge = 0;
    this.spawnDelay = 0.25;
    this.events.push({ type: 'miss' });
  }

  private updateFlow(dt: number, pose: BodyPose | null) {
    const f = this.flow;
    const active = !!pose?.ok;
    let motion = 0;

    if (active && pose && this.lastPose) {
      const joints: (keyof Skeleton)[] = ['lw', 'rw', 'la', 'ra', 'le', 're'];
      for (const j of joints) {
        const a = this.lastPose.p[j];
        const b = pose.p[j];
        const inst = dist(a, b) / Math.max(dt, 1 / 240);
        const prev = this.prevSpeed[j] ?? inst;
        const smoothSpeed = lerp(prev, inst, 1 - Math.exp(-dt * 12));
        const accel = Math.abs(smoothSpeed - prev) / Math.max(dt, 1 / 240);
        this.prevSpeed[j] = smoothSpeed;
        if (smoothSpeed < 14) {
          this.jerkSum += Math.min(accel, 120);
          this.jerkN += 1;
        }
        motion += smoothSpeed;
      }
      motion /= joints.length;

      const lw = pose.p.lw;
      const rw = pose.p.rw;
      this.bbox.minX = Math.min(this.bbox.minX, lw.x, rw.x);
      this.bbox.maxX = Math.max(this.bbox.maxX, lw.x, rw.x);
      this.bbox.minY = Math.min(this.bbox.minY, lw.y, rw.y);
      this.bbox.maxY = Math.max(this.bbox.maxY, lw.y, rw.y);

      const sym = 1 - clamp01((Math.abs(Math.abs(lw.x) - Math.abs(rw.x)) + Math.abs(Math.abs(pose.p.la.x) - Math.abs(pose.p.ra.x))) / 2.6);
      this.symSum += sym;
      this.symN += 1;

      const area = Math.max(0, this.bbox.maxX - this.bbox.minX) * Math.max(0, this.bbox.maxY - this.bbox.minY);
      f.breadth = Math.max(f.breadth, clamp01(area / 4.2));
    }

    const k = 1 - Math.exp(-dt * 6);
    f.pulse = lerp(f.pulse, active ? clamp01(motion / 1.4) : 0, k);

    const avgJerk = this.jerkN ? this.jerkSum / this.jerkN : 0;
    f.smooth = lerp(f.smooth, clamp01(1 - avgJerk / 55), k);
    f.symmetry = this.symN ? lerp(f.symmetry, this.symSum / this.symN, k) : f.symmetry;

    const base = Math.pow(f.breadth, 0.55) * (0.45 * f.smooth + 0.25 * f.symmetry + 0.3 * f.pulse);
    f.meter = lerp(f.meter, active ? clamp01(base) : 0, k);
    this.score += dt * 320 * f.meter;
    f.sum += f.meter * dt;
    f.n += dt;
    f.avg = f.n > 0 ? f.sum / f.n : 0;
  }

  private record(dt: number, pose: BodyPose | null) {
    if (!pose?.ok) return;
    this.recAcc += dt;
    if (this.recAcc < 1 / REC_HZ) return;
    this.recAcc = 0;
    if (this.frames.length > 1400) return;
    this.frames.push({ t: Math.round(this.t * 100) / 100, s: Math.round(this.score), p: encodeSkeleton(pose.p) });
  }

  private checkBust() {
    if (this.busted || !this.ghost) return;
    if (this.score > this.ghost.score) {
      this.busted = true;
      this.events.push({ type: 'bust' });
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.lastPose?.ok) {
      this.frames.push({ t: Math.round(this.t * 100) / 100, s: Math.round(this.score), p: encodeSkeleton(this.lastPose.p) });
    }
    this.events.push({ type: 'finish' });
  }

  ghostNow(): { skel: Skeleton | null; score: number } {
    if (!this.ghost) return { skel: null, score: 0 };
    const g = ghostAt(this.ghost, this.t);
    return g ? { skel: g.skel, score: g.score } : { skel: null, score: 0 };
  }

  accuracy(): number {
    if (this.mode === 'flow') return this.flow.avg;
    return this.accCount ? this.accSum / this.accCount : 0;
  }

  grade(): string {
    const perf =
      this.mode === 'flow'
        ? 0.7 * clamp01(this.flow.avg / 0.8) + 0.3 * clamp01(this.score / 6000)
        : 0.5 * this.accuracy() + 0.28 * clamp01(this.score / 6000) + 0.22 * clamp01(this.hits / 16);
    if (perf >= 0.82) return 'S';
    if (perf >= 0.68) return 'A';
    if (perf >= 0.52) return 'B';
    return 'C';
  }

  flowLabel(): string {
    const f = this.flow;
    if (this.mode !== 'flow') return '';
    if (f.meter < 0.08) return 'START MOVING';
    const parts: [number, string][] = [
      [f.breadth, f.breadth < 0.35 ? 'REACH WIDER' : ''],
      [f.smooth, f.smooth < 0.45 ? 'SMOOTHER' : ''],
      [f.symmetry, f.symmetry < 0.5 ? 'BALANCE L / R' : ''],
    ];
    const worst = parts.filter((p) => p[1]).sort((a, b) => a[0] - b[0])[0];
    if (worst) return worst[1];
    return f.meter > 0.66 ? 'IN THE FLOW' : 'KEEP GOING';
  }

  hud(): HudState {
    const g = this.ghostNow();
    return {
      score: Math.round(this.score),
      combo: this.combo,
      mult: this.mult,
      timeLeft: this.timeLeft,
      quality: this.target ? this.qualitySm : 0,
      hold: this.target ? this.hold : 0,
      targetName: this.target?.def.name ?? '',
      targetHint: this.target?.def.hint ?? '',
      hits: this.hits,
      misses: this.misses,
      accuracy: this.accuracy(),
      ghostScore: this.ghost ? Math.round(g.score) : null,
      ghostName: this.ghost?.name ?? null,
      ahead: !!this.ghost && this.score >= g.score,
      busted: this.busted,
      lastGain: this.lastGain,
      flowMeter: this.flow.meter,
      flowLabel: this.flowLabel(),
      visible: !!this.lastPose?.ok,
      phase: 'live',
    };
  }

  outcome(demo: boolean): RunOutcome {
    return {
      mode: this.mode,
      score: Math.round(this.score),
      hits: this.hits,
      misses: this.misses,
      bestCombo: this.bestCombo,
      accuracy: this.accuracy(),
      grade: this.grade(),
      flow: this.flow.avg,
      duration: this.t,
      frames: this.frames,
      busted: this.busted,
      ghostScore: this.ghost?.score ?? null,
      ghostName: this.ghost?.name ?? null,
      demo,
    };
  }
}

function scoreOf(pose: BodyPose, target: Skeleton, far: number): number {
  let sum = 0;
  let wsum = 0;
  for (const j of Object.keys(target) as (keyof Skeleton)[]) {
    const d = dist(pose.p[j], target[j]);
    const s = clamp01(1 - (d - 0.1) / Math.max(0.08, far - 0.1));
    sum += s * (j === 'lw' || j === 'rw' ? 2.3 : j === 'le' || j === 're' ? 1.25 : 0.9);
    wsum += j === 'lw' || j === 'rw' ? 2.3 : j === 'le' || j === 're' ? 1.25 : 0.9;
  }
  return sum / wsum;
}

/** Poses the auto-demo uses, so the booth never shows an empty stage. */
export const DEMO_POSES = POSE_LIBRARY.map((p) => skeletonFor(p));
export { LOCK };
