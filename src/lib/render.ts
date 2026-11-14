import { BONES, JOINTS, type BodyPose, type Skeleton, type Vec } from './body';
import type { Mode } from './types';
import type { TargetInstance } from './poses';

export const PAL = {
  mint: '#6dffc0',
  cyan: '#4df0ff',
  violet: '#a78bfa',
  magenta: '#ff54c8',
  amber: '#ffc865',
  red: '#ff5470',
  white: '#eaf2ff',
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

export type TrailMap = Partial<Record<string, Vec[]>>;

export type Scene = {
  pose: BodyPose | null;
  target: TargetInstance | null;
  ghost: Skeleton | null;
  hold: number;
  quality: number;
  time: number;
  combo: number;
  mode: Mode;
  trails: TrailMap;
  particles: Particle[];
  sinceHit: number;
  sinceMiss: number;
  showTarget: boolean;
};

type Frame = { hip: Vec; torso: number };

function frameFor(pose: BodyPose | null, W: number, H: number): Frame {
  if (pose) {
    const torso = Math.max(pose.torso * H, H * 0.075);
    return { hip: { x: pose.hip.x * H, y: pose.hip.y * H }, torso };
  }
  return { hip: { x: W / 2, y: H * 0.7 }, torso: H * 0.185 };
}

function toScreen(skel: Skeleton, f: Frame): Skeleton {
  const out = {} as Skeleton;
  for (const j of JOINTS) {
    out[j] = { x: f.hip.x + skel[j].x * f.torso, y: f.hip.y + skel[j].y * f.torso };
  }
  return out;
}

type RigStyle = {
  color: string | CanvasGradient;
  width: number;
  alpha: number;
  dash?: number[];
  dashOffset?: number;
  joints?: boolean;
  glow?: boolean;
  head?: boolean;
};

function rigPath(ctx: CanvasRenderingContext2D, pts: Skeleton, headR: number) {
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  if (headR > 0) {
    ctx.moveTo(pts.head.x + headR, pts.head.y);
    ctx.arc(pts.head.x, pts.head.y, headR, 0, Math.PI * 2);
  }
}

function drawRig(ctx: CanvasRenderingContext2D, skel: Skeleton, f: Frame, style: RigStyle) {
  const pts = toScreen(skel, f);
  const headR = style.head === false ? 0 : f.torso * 0.19;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.dash) {
    ctx.setLineDash(style.dash);
    ctx.lineDashOffset = style.dashOffset ?? 0;
  }
  if (style.glow) {
    ctx.globalAlpha = style.alpha * 0.16;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * 3.6;
    rigPath(ctx, pts, headR);
    ctx.stroke();
  }
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  rigPath(ctx, pts, headR);
  ctx.stroke();

  if (style.joints) {
    for (const j of JOINTS) {
      if (j === 'head') continue;
      const big = j === 'lw' || j === 'rw' || j === 'la' || j === 'ra';
      ctx.globalAlpha = Math.min(1, style.alpha + 0.2);
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(pts[j].x, pts[j].y, style.width * (big ? 0.85 : 0.6), 0, Math.PI * 2);
      ctx.fill();
      if (big) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = PAL.white;
        ctx.beginPath();
        ctx.arc(pts[j].x, pts[j].y, style.width * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, r * 0.075);
  ctx.strokeStyle = 'rgba(234,242,255,0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  if (p > 0.002) {
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Math.min(1, p);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = p >= 0.999 ? PAL.mint : PAL.cyan;
    ctx.lineWidth = Math.max(8, r * 0.15);
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(4, r * 0.075);
    ctx.strokeStyle = p >= 0.999 ? PAL.mint : PAL.cyan;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBrackets(ctx: CanvasRenderingContext2D, minX: number, minY: number, maxX: number, maxY: number, color: string, alpha: number) {
  const w = maxX - minX;
  const h = maxY - minY;
  const len = Math.min(w, h) * 0.22 + 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  const corners: [number, number, number, number][] = [
    [minX, minY, 1, 1],
    [maxX, minY, -1, 1],
    [minX, maxY, 1, -1],
    [maxX, maxY, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * len);
    ctx.stroke();
  }
  ctx.restore();
}

function bounds(skel: Skeleton, f: Frame) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const j of JOINTS) {
    const p = { x: f.hip.x + skel[j].x * f.torso, y: f.hip.y + skel[j].y * f.torso };
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = f.torso * 0.3;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, s: Scene) {
  ctx.clearRect(0, 0, W, H);
  const f = frameFor(s.pose, W, H);
  const floorY = f.hip.y + f.torso * 1.75;

  // stage glow
  const glow = ctx.createRadialGradient(f.hip.x, floorY, 0, f.hip.x, floorY, f.torso * 3.6);
  glow.addColorStop(0, 'rgba(109,255,192,0.20)');
  glow.addColorStop(0.45, 'rgba(77,240,255,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // horizon plate
  ctx.save();
  ctx.strokeStyle = 'rgba(109,255,192,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(f.hip.x, floorY, f.torso * 2.3, f.torso * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(77,240,255,0.14)';
  ctx.beginPath();
  ctx.ellipse(f.hip.x, floorY, f.torso * 1.35, f.torso * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ghost of the champion
  if (s.ghost) {
    drawRig(ctx, s.ghost, f, {
      color: PAL.violet,
      width: Math.max(2, f.torso * 0.045),
      alpha: 0.38,
      dash: [f.torso * 0.16, f.torso * 0.14],
      dashOffset: -s.time * 26,
      glow: true,
    });
  }

  // target hologram
  if (s.target && s.showTarget) {
    const locked = s.hold > 0.02;
    const b = bounds(s.target.skel, f);
    drawBrackets(ctx, b.minX, b.minY, b.maxX, b.maxY, locked ? PAL.mint : PAL.cyan, locked ? 0.55 : 0.3);
    drawRig(ctx, s.target.skel, f, {
      color: locked ? PAL.mint : PAL.cyan,
      width: Math.max(2.5, f.torso * 0.055),
      alpha: locked ? 0.36 : 0.5 + 0.28 * Math.sin(s.time * 4.2),
      dash: [f.torso * 0.18, f.torso * 0.16],
      dashOffset: -s.time * (locked ? 90 : 34),
      head: true,
    });
  }

  // hold ring sits behind the player so the rig always reads on top
  if (s.target && s.showTarget) {
    drawRing(ctx, f.hip.x, f.hip.y - f.torso * 0.5, f.torso * 0.82, s.hold);
  }

  // trails
  for (const key of Object.keys(s.trails)) {
    const pts = s.trails[key];
    if (!pts || pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = i / pts.length;
      ctx.beginPath();
      ctx.strokeStyle = key.startsWith('l') ? PAL.mint : PAL.magenta;
      ctx.globalAlpha = a * 0.42;
      ctx.lineWidth = Math.max(1, a * f.torso * 0.09);
      ctx.lineCap = 'round';
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // live player
  if (s.pose) {
    const grad = ctx.createLinearGradient(0, f.hip.y - f.torso * 2.1, 0, f.hip.y + f.torso * 2);
    grad.addColorStop(0, PAL.mint);
    grad.addColorStop(0.5, PAL.cyan);
    grad.addColorStop(1, PAL.violet);
    drawRig(ctx, s.pose.p, f, {
      color: grad,
      width: Math.max(3, f.torso * 0.075),
      alpha: s.pose.ok ? 0.98 : 0.4,
      glow: true,
      joints: true,
    });
  }

  // particles
  for (const p of s.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a * a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // hit / miss wash
  if (s.sinceHit < 0.55) {
    const a = (1 - s.sinceHit / 0.55) * 0.22;
    const g = ctx.createRadialGradient(f.hip.x, f.hip.y - f.torso * 0.4, 0, f.hip.x, f.hip.y - f.torso * 0.4, W * 0.7);
    g.addColorStop(0, `rgba(109,255,192,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (s.sinceMiss < 0.45) {
    const a = (1 - s.sinceMiss / 0.45) * 0.35;
    ctx.fillStyle = `rgba(255,84,112,${a})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function stepParticles(list: Particle[], dt: number): Particle[] {
  const out: Particle[] = [];
  for (const p of list) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    p.vx *= 0.985;
    out.push(p);
  }
  return out;
}

export function burst(list: Particle[], x: number, y: number, n: number, colors: string[], power = 1) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (60 + Math.random() * 320) * power;
    const life = 0.45 + Math.random() * 0.55;
    list.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 40,
      life,
      max: life,
      r: 1.5 + Math.random() * 3.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

