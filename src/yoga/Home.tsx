import { useEffect, useRef } from 'react';
import type { Skeleton } from '../lib/body';
import { POSES, type YogaPose } from './poses';
import { drawThumb } from './render';
import type { DB } from './store';

type Props = {
  db: DB;
  onStart: () => void;
  onDemo: () => void;
  onPose: (p: YogaPose) => void;
};

function Thumb({ skel }: { skel: Skeleton }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;
    const paint = () => {
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const w = cv.clientWidth || 140;
      const h = cv.clientHeight || 150;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawThumb(ctx, w, h, skel);
    };
    paint();
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [skel]);
  return <canvas ref={ref} className="y-thumb" />;
}

export function Home({ db, onStart, onDemo, onPose }: Props) {
  return (
    <div className="y-screen y-home">
      <header className="y-top">
        <span className="y-wordmark">STILL</span>
        <span className="y-tag">PHONE YOGA COACH</span>
      </header>

      <section className="y-hero">
        <div>
          <div className="y-kicker">CAMERA-ASSISTED · ON-DEVICE</div>
          <h1 className="y-display">
            Your phone
            <br />
            is the <em>instructor.</em>
          </h1>
          <p className="y-lede">
            Four poses. One camera. It watches your joints and tells you the one thing to fix — knee over ankle, arms
            level, back leg long. Not another video to copy badly.
          </p>
          <div className="y-actions">
            <button className="y-btn primary" onClick={onStart}>
              START THE FLOW
            </button>
            <button className="y-btn ghost" onClick={onDemo}>
              SEE A DEMO BODY
            </button>
          </div>
          <p className="y-fine">33 joints tracked in the browser. No video ever leaves your phone.</p>
        </div>

        <div className="y-pose-grid">
          {POSES.map((p) => (
            <button key={p.id} className="y-pose-card" onClick={() => onPose(p)}>
              <Thumb skel={p.ref} />
              <span className="y-pose-card-name">{p.name}</span>
              <span className="y-pose-card-sub">{p.sanskrit}</span>
              {db.best[p.id] != null && <span className="y-pose-card-best">{Math.round(db.best[p.id]! * 100)}% best</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="y-how">
        <div className="y-how-item">
          <b>1</b>
          <span>Prop your phone two metres back, head to feet in frame</span>
        </div>
        <div className="y-how-item">
          <b>2</b>
          <span>Stand in Mountain for three seconds — it learns your proportions</span>
        </div>
        <div className="y-how-item">
          <b>3</b>
          <span>Hold each pose, watch the alignment climb, fix one cue at a time</span>
        </div>
      </section>

      <footer className="y-foot">
        <span>MEDITATION ON GEOMETRY</span>
        <span>{db.sessions.length ? `${db.sessions.length} sessions on this device` : 'FIRST SESSION TODAY'}</span>
      </footer>
    </div>
  );
}
