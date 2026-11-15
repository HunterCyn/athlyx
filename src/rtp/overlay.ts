import { BONES, JOINTS, type BodyPose, type Vec } from '../lib/body';

/**
 * Skeleton overlay for the landing screen.
 *
 * The video is drawn with object-fit: cover, so landmark coordinates need the
 * same crop or the skeleton drifts off the body. The legs are highlighted
 * because they are the only thing this screen measures.
 */

export const C = {
  ink: '#f5f2ea',
  dim: '#8b9690',
  sage: '#a8d5ba',
  mint: '#dff0e4',
  deep: '#6ea889',
  amber: '#e8b96a',
  clay: '#d98f6a',
};

export type LandingScene = {
  pose: BodyPose | null;
  camAspect: number;
  time: number;
};

type Origin = { x: number; y: number; scale: number };

function viewport(W: number, H: number, ar: number) {
  const s = Math.max(W / Math.max(0.1, ar), H);
  return { s, ox: (W - ar * s) / 2, oy: (H - s) / 2 };
}

function originFor(pose: BodyPose | null, W: number, H: number, ar: number): Origin {
  const vp = viewport(W, H, ar);
  if (pose) {
    return { x: vp.ox + pose.hip.x * vp.s, y: vp.oy + pose.hip.y * vp.s, scale: pose.torso * vp.s };
  }
  return { x: W * 0.5, y: H * 0.56, scale: Math.min(W, H) * 0.155 };
}

const project = (o: Origin, p: Vec): Vec => ({ x: o.x + p.x * o.scale, y: o.y + p.y * o.scale });

function screenJoints(pose: BodyPose, o: Origin) {
  const out: Record<string, Vec> = {};
  for (const j of JOINTS) out[j] = project(o, pose.p[j]);
  return out;
}

function pathBones(ctx: CanvasRenderingContext2D, pts: Record<string, Vec>, headR: number, head: Vec) {
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

function legPath(ctx: CanvasRenderingContext2D, pts: Record<string, Vec>, hip: string, knee: string, ankle: string) {
  const h = pts[hip];
  const k = pts[knee];
  const a = pts[ankle];
  if (!h || !k || !a) return;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(k.x, k.y);
  ctx.lineTo(a.x, a.y);
}

export function drawLanding(ctx: CanvasRenderingContext2D, W: number, H: number, s: LandingScene) {
  ctx.clearRect(0, 0, W, H);
  const o = originFor(s.pose, W, H, s.camAspect);

  // ground glow so the frame reads as a landing area rather than a void
  const glow = ctx.createRadialGradient(o.x, o.y + o.scale * 1.6, 0, o.x, o.y + o.scale * 1.6, o.scale * 3.4);
  glow.addColorStop(0, 'rgba(168,213,186,0.14)');
  glow.addColorStop(0.6, 'rgba(110,168,137,0.04)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = 'rgba(168,213,186,0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(W * 0.08, o.y + o.scale * 1.62);
  ctx.lineTo(W * 0.92, o.y + o.scale * 1.62);
  ctx.stroke();
  ctx.restore();

  if (!s.pose) return;

  const pts = screenJoints(s.pose, o);
  const headR = o.scale * 0.19;
  const ok = s.pose.ok;
  const width = Math.max(3, o.scale * 0.07);

  // soft halo behind the body
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = ok ? 0.2 : 0.08;
  ctx.strokeStyle = C.sage;
  ctx.lineWidth = width * 3.2;
  pathBones(ctx, pts, headR, pts.head);
  ctx.stroke();
  ctx.restore();

  // body
  const grad = ctx.createLinearGradient(0, o.y - o.scale * 2.1, 0, o.y + o.scale * 1.9);
  grad.addColorStop(0, C.mint);
  grad.addColorStop(0.55, C.sage);
  grad.addColorStop(1, C.deep);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = ok ? 0.98 : 0.4;
  ctx.strokeStyle = grad;
  ctx.lineWidth = width;
  pathBones(ctx, pts, headR, pts.head);
  ctx.stroke();

  ctx.fillStyle = grad;
  for (const j of JOINTS) {
    if (j === 'head') continue;
    ctx.beginPath();
    ctx.arc(pts[j].x, pts[j].y, width * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // the legs, which are the measurement
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width * 1.25;
  ctx.globalAlpha = ok ? 0.95 : 0.45;
  ctx.strokeStyle = C.amber;
  legPath(ctx, pts, 'rh', 'rk', 'ra');
  ctx.stroke();
  ctx.strokeStyle = C.clay;
  legPath(ctx, pts, 'lh', 'lk', 'la');
  ctx.stroke();
  ctx.restore();

  // knees get a ring: that is where the angle is read
  ctx.save();
  ctx.strokeStyle = 'rgba(245,242,234,0.75)';
  ctx.lineWidth = 1.6;
  for (const knee of ['lk', 'rk'] as const) {
    ctx.beginPath();
    ctx.arc(pts[knee].x, pts[knee].y, width * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
