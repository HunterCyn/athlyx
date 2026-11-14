import type { BodyPose, Joint, Skeleton } from '../lib/body';

/**
 * Frontal-plane metrics for a bilateral drop landing.
 *
 * The camera looks at the athlete head-on, so the plane we can honestly measure
 * is x (lateral) by y (vertical). Everything here is in torso units, which
 * makes it independent of how tall the athlete is and how far the phone is.
 *
 * What this is NOT: a force measurement. Ground reaction forces need plates.
 * We measure joint geometry and call it geometry.
 */

export type Side = 'left' | 'right';
export type Frame = { t: number; pose: BodyPose };
export type Landing = { contact: number; peak: number };

const LEG: Record<Side, { hip: Joint; knee: Joint; ankle: Joint }> = {
  left: { hip: 'lh', knee: 'lk', ankle: 'la' },
  right: { hip: 'rh', knee: 'rk', ankle: 'ra' },
};

const DEG = 180 / Math.PI;

/**
 * Signed frontal-plane knee angle in degrees. Positive means the knee has
 * drifted toward the midline (valgus / "knee collapsing in"), negative means
 * it sits outside the hip-ankle line.
 *
 * The reference line runs hip -> ankle; we take the knee's perpendicular
 * offset from it and convert that offset into the angle it subtends over half
 * the leg. That is the standard 2D frontal-plane projection idea, computed
 * straight from landmarks rather than by eye.
 */
export function kneeValgus(p: Skeleton, side: Side): number {
  const { hip, knee, ankle } = LEG[side];
  const h = p[hip];
  const k = p[knee];
  const a = p[ankle];
  const lx = a.x - h.x;
  const ly = a.y - h.y;
  const l2 = lx * lx + ly * ly;
  if (l2 < 1e-9) return 0;
  const t = ((k.x - h.x) * lx + (k.y - h.y) * ly) / l2;
  const px = h.x + lx * t;
  const medial = side === 'left' ? 1 : -1; // toward x = 0 (body midline)
  const offset = (k.x - px) * medial;
  const half = Math.sqrt(l2) / 2;
  return Math.atan2(offset, half) * DEG;
}

/** Knee-to-knee distance over ankle-to-ankle distance. Collapsing knees < 0.6. */
export function kneeSeparation(p: Skeleton): number {
  const knees = Math.hypot(p.lk.x - p.rk.x, p.lk.y - p.rk.y);
  const ankles = Math.hypot(p.la.x - p.ra.x, p.la.y - p.ra.y);
  return ankles < 1e-6 ? 0 : knees / ankles;
}

/** Trunk lean away from vertical, in degrees. */
export function trunkLean(p: Skeleton): number {
  const hx = (p.lh.x + p.rh.x) / 2;
  const hy = (p.lh.y + p.rh.y) / 2;
  const sx = (p.ls.x + p.rs.x) / 2;
  const sy = (p.ls.y + p.rs.y) / 2;
  return Math.abs(Math.atan2(sx - hx, -(sy - hy))) * DEG;
}

/** Pelvic obliquity: one hip lower than the other, in degrees. */
export function pelvicDrop(p: Skeleton): number {
  return Math.abs(Math.atan2(p.rh.y - p.lh.y, p.rh.x - p.lh.x)) * DEG;
}

/** Ankle height below the hip in torso units. Shrinks as the legs fold. */
export function legExtension(p: Skeleton): number {
  return (p.la.y + p.ra.y) / 2;
}

function smooth(values: number[], radius = 2): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) {
      sum += values[k];
      n++;
    }
    return sum / n;
  });
}

/**
 * Finds the landing inside a captured window: the frame of deepest leg
 * compression, and the last frame before it where the legs were still long
 * (contact). Returns null when nothing compressed enough to be a landing, so a
 * half-hearted step never produces a score.
 */
export function detectLanding(frames: Frame[]): Landing | null {
  if (frames.length < 12) return null;
  const ext = smooth(frames.map((f) => legExtension(f.pose.p)));
  let peak = 0;
  for (let i = 1; i < ext.length; i++) if (ext[i] < ext[peak]) peak = i;

  const before = ext.slice(0, Math.max(1, peak));
  const ref = Math.max(...before);
  if (!Number.isFinite(ref) || ref < 0.6) return null;
  if (ref - ext[peak] < 0.07 * ref) return null;

  let contact = peak;
  for (let i = peak - 1; i >= 0; i--) {
    if (ext[i] >= ref * 0.97) {
      contact = i;
      break;
    }
  }
  return { contact, peak };
}

/** Symmetry of two magnitudes, as a percentage. 100 = identical. */
export function symmetry(a: number, b: number): number {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (hi < 1e-6) return 100;
  return (lo / hi) * 100;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type TrialMetrics = {
  leftValgus: number;
  rightValgus: number;
  kneeSep: number;
  trunk: number;
  pelvic: number;
  /** ms from the capture start to the landing peak */
  peakAt: number;
};

export function measureTrial(frames: Frame[], landing: Landing): TrialMetrics {
  const f = frames[landing.peak];
  const p = f.pose.p;
  return {
    leftValgus: kneeValgus(p, 'left'),
    rightValgus: kneeValgus(p, 'right'),
    kneeSep: kneeSeparation(p),
    trunk: trunkLean(p),
    pelvic: pelvicDrop(p),
    peakAt: f.t - frames[0].t,
  };
}

export type ScreenResult = {
  date: number;
  leftValgus: number;
  rightValgus: number;
  kneeSep: number;
  trunk: number;
  pelvic: number;
  index: number;
  trials: number;
};

/**
 * The headline number. Deliberately NOT called the Limb Symmetry Index: the
 * clinical LSI comes from hop distance or jump height, and we do not measure
 * either. This is a frontal-plane symmetry index built from landing geometry.
 */
export function symmetryIndex(m: TrialMetrics): number {
  const valgus = symmetry(m.leftValgus, m.rightValgus);
  return Math.round(valgus * 10) / 10;
}

export function verdict(index: number): { label: string; tone: 'good' | 'watch' | 'flag'; body: string } {
  if (index >= 90) {
    return {
      label: 'SYMMETRIC',
      tone: 'good',
      body: 'Both knees landed within 10% of each other. That is the range clinicians look for before progressive loading.',
    };
  }
  if (index >= 80) {
    return {
      label: 'WATCH',
      tone: 'watch',
      body: 'A visible side-to-side difference. Worth retesting after a warm-up, and worth showing a physio if it repeats.',
    };
  }
  return {
    label: 'ASYMMETRIC',
    tone: 'flag',
    body: 'One knee is collapsing markedly more than the other. Do not progress impact work on this until a clinician has seen it.',
  };
}

/** Aggregate several trials per leg by the median, which ignores one bad rep. */
export function combineTrials(trials: TrialMetrics[]): TrialMetrics {
  return {
    leftValgus: median(trials.map((t) => t.leftValgus)),
    rightValgus: median(trials.map((t) => t.rightValgus)),
    kneeSep: median(trials.map((t) => t.kneeSep)),
    trunk: median(trials.map((t) => t.trunk)),
    pelvic: median(trials.map((t) => t.pelvic)),
    peakAt: median(trials.map((t) => t.peakAt)),
  };
}
