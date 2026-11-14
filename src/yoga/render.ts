import { BONES, JOINTS, type BodyPose, type Skeleton, type Vec } from '../lib/body';
import type { Particle } from '../lib/render';

export const C = {
  sage: '#a8d5ba',
  mint: '#dff0e4',
  deep: '#6ea889',
  amber: '#e8b96a',
  clay: '#d98f6a',
  ink: '#f5f2ea',
  dim: '#8b9690',
};

export type YogaScene = {
  pose: BodyPose | null;
  ref: Skeleton | null;
  camAspect: number;
  score: number;
  hold: number;
  time: number;
  celebrate: number;
  particles: Particle[];
};

/**
 * Video is displayed with object-fit: cover, so landmark coordinates need the
 * same crop. This is the mapping the arcade version got wrong on 4:3 cameras.
 */
function viewport(W: number, H: number, ar: number) {
  const s = Math.max(W / Math.max(0.1, ar), H);
  return { s, ox: (W - ar * s) / 2, oy: (H - s) / 2 };
}

type Origin = { x: number; y: number; scale: number };

function originFor(pose: BodyPose | null, W: number, H: number, ar: number): Origin {
  const vp = viewport(W, H, ar);
  if (pose) {
    return {
      x: vp.ox + pose.hip.x * vp.s,
      y: vp.oy + pose.hip.y * vp.s,
      scale: pose.torso * vp.s,
    };
  }
  return { x: W * 0.5, y: H * 0.56, scale: Math.min(W, H) * 0.155 };
}

const project = (o: Origin, p: Vec): Vec => ({ x: o.x + p.x * o.scale, y: o.y + p.y * o.scale });

function pathRig(ctx: CanvasRenderingContext2D, pts: Record<string, Vec>, headR: number, head: Vec) {
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) continue;
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
  }
  if (headR > 0) {
    ctx.moveTo(head.x + headR, head.y);
    ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
  }
}

function screenJoints(skel: Skeleton, o: Origin) {
  const out: Record<string, Vec> = {};
  for (const j of JOINTS) out[j] = project(o, skel[j]);
  return out;
}

export function drawYoga(ctx: CanvasRenderingContext2D, W: number, H: number, s: YogaScene) {
  ctx.clearRect(0, 0, W, H);
  const o = originFor(s.pose, W, H, s.camAspect);
  const floorY = o.y + o.scale * 1.8;

  // warm pool of light under the practitioner
  const glow = ctx.createRadialGradient(o.x, o.y - o.scale * 0.2, 0, o.x, o.y - o.scale * 0.2, o.scale * 3.2);
  glow.addColorStop(0, 'rgba(168,213,186,0.16)');
  glow.addColorStop(0.55, 'rgba(110,168,137,0.05)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // breath line at the feet
  ctx.save();
  ctx.strokeStyle = 'rgba(168,213,186,0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(o.x, floorY, o.scale * 2.1, o.scale * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // spine guide: the vertical you are asked to find
  if (s.ref) {
    ctx.save();
    ctx.setLineDash([o.scale * 0.12, o.scale * 0.14]);
    ctx.strokeStyle = 'rgba(232,185,106,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - o.scale * 2.4);
    ctx.lineTo(o.x, o.y + o.scale * 1.9);
    ctx.stroke();
    ctx.restore();
  }

  // the silhouette to copy
  if (s.ref) {
    const pts = screenJoints(s.ref, o);
    const headR = o.scale * 0.19;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([o.scale * 0.16, o.scale * 0.14]);
    ctx.lineDashOffset = -s.time * 12;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = C.sage;
    ctx.lineWidth = Math.max(2, o.scale * 0.045);
    pathRig(ctx, pts, headR, pts.head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.sage;
    for (const j of JOINTS) {
      if (j === 'head') continue;
      ctx.beginPath();
      ctx.arc(pts[j].x, pts[j].y, Math.max(1.6, o.scale * 0.028), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // the practitioner
  if (s.pose) {
    const pts = screenJoints(s.pose.p, o);
    const headR = o.scale * 0.19;
    const grad = ctx.createLinearGradient(0, o.y - o.scale * 2.1, 0, o.y + o.scale * 1.9);
    grad.addColorStop(0, C.mint);
    grad.addColorStop(0.55, C.sage);
    grad.addColorStop(1, C.deep);
    const width = Math.max(3, o.scale * 0.07);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.18 + 0.22 * s.score;
    ctx.strokeStyle = C.sage;
    ctx.lineWidth = width * 3.4;
    pathRig(ctx, pts, headR, pts.head);
    ctx.stroke();

    ctx.globalAlpha = s.pose.ok ? 0.98 : 0.35;
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    pathRig(ctx, pts, headR, pts.head);
    ctx.stroke();

    ctx.fillStyle = grad;
    for (const j of JOINTS) {
      if (j === 'head') continue;
      ctx.beginPath();
      ctx.arc(pts[j].x, pts[j].y, width * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // hold ring around the chest
  if (s.ref) {
    const cx = o.x;
    const cy = o.y - o.scale * 0.55;
    const r = o.scale * 0.92;
    const full = s.hold >= 0.999;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, r * 0.055);
    ctx.strokeStyle = 'rgba(245,242,234,0.10)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (s.hold > 0.004) {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * Math.min(1, s.hold);
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = Math.max(8, r * 0.16);
      ctx.strokeStyle = full ? C.sage : C.amber;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(3, r * 0.055);
      ctx.strokeStyle = full ? C.sage : C.amber;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.stroke();
    }
    ctx.restore();
  }

  // completion bloom
  if (s.celebrate > 0.01) {
    const k = 1 - s.celebrate;
    ctx.save();
    ctx.globalAlpha = s.celebrate * 0.5;
    ctx.strokeStyle = C.sage;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(o.x, o.y - o.scale * 0.55, o.scale * (0.9 + k * 2 + i * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const p of s.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a * a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Static sketch for the pose cards on the home screen. */
export function drawThumb(ctx: CanvasRenderingContext2D, W: number, H: number, ref: Skeleton) {
  ctx.clearRect(0, 0, W, H);
  const scale = Math.min(W / 2.6, H / 3.5);
  const o: Origin = { x: W / 2, y: H * 0.56, scale };
  const pts = screenJoints(ref, o);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(168,213,186,0.85)';
  ctx.lineWidth = 2.4;
  pathRig(ctx, pts, scale * 0.19, pts.head);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,185,106,0.9)';
  for (const j of ['lw', 'rw', 'la', 'ra'] as const) {
    ctx.beginPath();
    ctx.arc(pts[j].x, pts[j].y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
