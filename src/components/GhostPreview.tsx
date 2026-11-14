import { useEffect, useRef } from 'react';
import { JOINTS, type Skeleton } from '../lib/body';
import { POSE_LIBRARY, skeletonFor } from '../lib/poses';
import { drawScene } from '../lib/render';
import { ghostAt } from '../lib/store';
import type { Ghost } from '../lib/types';

function idleSkeleton(now: number): Skeleton {
  const base = skeletonFor(POSE_LIBRARY[1]);
  const out = {} as Skeleton;
  const t = now / 1000;
  for (const j of JOINTS) {
    const sway = j === 'lw' || j === 'rw' ? Math.sin(t * 1.4) * 0.045 : j === 'la' || j === 'ra' ? 0 : Math.sin(t * 0.9) * 0.01;
    out[j] = { x: base[j].x + sway, y: base[j].y + Math.cos(t * 1.1) * 0.012 };
  }
  return out;
}

export function GhostPreview({ ghost, className = '' }: { ghost: Ghost | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = performance.now();
    const span = ghost && ghost.frames.length > 1 ? ghost.frames[ghost.frames.length - 1].t : 6;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 320;
      const h = cv.clientHeight || 280;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const aspect = w / Math.max(1, h);
      const t = (((now - start) / 1000) * 2.2) % Math.max(3, span);
      const g = ghost ? ghostAt(ghost, t) : null;
      const skel = g?.skel ?? idleSkeleton(now);
      drawScene(ctx, w, h, {
        pose: { p: skel, hip: { x: aspect * 0.5, y: 0.7 }, torso: 0.155, ok: true, seen: 1 },
        target: null,
        ghost: null,
        hold: 0,
        quality: 1,
        time: now / 1000,
        combo: 0,
        mode: 'flow',
        trails: {},
        particles: [],
        sinceHit: 99,
        sinceMiss: 99,
        showTarget: false,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ghost]);

  return <canvas ref={ref} className={`ghost-preview ${className}`} />;
}
