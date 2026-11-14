import { useEffect, useRef, useState } from 'react';
import { MODE_INFO } from '../lib/game';
import { drawScene } from '../lib/render';
import { formatNumber, type DB } from '../lib/store';
import type { Mode } from '../lib/types';
import type { PoseEngine } from '../lib/vision';
import { Brand, SoundToggle } from './ui';

type Props = {
  engine: PoseEngine;
  db: DB;
  muted: boolean;
  onMute: () => void;
  onStart: (m: Mode) => void;
  onAuto: () => void;
  onBack: () => void;
};

export function Setup({ engine, db, muted, onMute, onStart, onAuto, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState({ status: engine.status, error: engine.error, ok: false, has: false, seen: 0, stream: false });
  const [hint, setHint] = useState('');
  const hintTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    engine.attach(videoRef.current);
    void engine.startCamera();
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const pose = engine.pose;
      const stage = stageRef.current;
      if (stage) {
        const ar = (engine.aspect || 16 / 9).toFixed(4);
        if (stage.dataset.ar !== ar) {
          stage.dataset.ar = ar;
          stage.style.aspectRatio = ar;
        }
      }
      const cv = canvasRef.current;
      const ctx = cv?.getContext('2d');
      if (cv && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = cv.clientWidth || 640;
        const h = cv.clientHeight || 360;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(ctx, w, h, {
          pose,
          target: null,
          ghost: null,
          hold: 0,
          quality: 1,
          time: now / 1000,
          combo: 0,
          mode: 'rush',
          trails: {},
          particles: [],
          sinceHit: 99,
          sinceMiss: 99,
          showTarget: false,
        });
      }
      if (now - lastUi > 140) {
        lastUi = now;
        setUi({
          status: engine.status,
          error: engine.error,
          ok: !!pose?.ok,
          has: !!pose,
          seen: pose?.seen ?? 0,
          stream: !!engine.video?.srcObject,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hintTimer.current);
    };
  }, [engine]);

  const ready = ui.status === 'ready' && ui.ok && ui.stream;
  const failed = ui.status === 'error' || ui.status === 'denied';

  const flashHint = (msg: string) => {
    setHint(msg);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(''), 3200);
  };

  const choose = (m: Mode) => {
    if (!ready) {
      flashHint('STEP BACK UNTIL I CAN SEE YOUR WHOLE BODY');
      return;
    }
    onStart(m);
  };

  return (
    <div className="screen setup-screen">
      <header className="topbar">
        <Brand compact />
        <div className="topbar-right">
          <span className={`live-pill${ready ? ' on' : ''}`}>
            <i /> {ready ? 'BODY LOCKED' : failed ? 'CAMERA OFFLINE' : 'CALIBRATING'}
          </span>
          <SoundToggle muted={muted} onToggle={onMute} />
          <button className="btn ghost small" onClick={onBack}>
            ← EXIT
          </button>
        </div>
      </header>

      <div className="setup-grid">
        <div className="setup-left">
          <div className="stage setup" ref={stageRef}>
            {!failed && <video ref={videoRef} className="cam" muted playsInline autoPlay />}
            <canvas ref={canvasRef} className="scene" />
            <div className="scanlines" />
            <div className="stage-corners" />
            {failed && (
              <div className="cam-error">
                <div className="cam-error-k">CAMERA UNAVAILABLE</div>
                <p>{ui.error || 'Camera could not start.'}</p>
                <div className="cam-error-actions">
                  <button className="btn primary small" onClick={() => { engine.stopCamera(); void engine.startCamera(); }}>
                    RETRY CAMERA
                  </button>
                  <button className="btn ghost small" onClick={onAuto}>
                    WATCH AUTO-DEMO
                  </button>
                </div>
              </div>
            )}
            {!failed && !ready && (
              <div className="stage-hint">
                <b>{ui.has ? 'I CAN SEE YOU — STEP BACK' : 'STEP INTO FRAME'}</b>
                <span>Full body, head to feet, arm’s length from the screen.</span>
              </div>
            )}
            {!failed && ready && (
              <div className="stage-hint ok">
                <b>LOCKED ON</b>
                <span>Pick a run below. The ghost is waiting.</span>
              </div>
            )}
            <div className="stage-tag">LIVE POSE FEED · {Math.round((ui.seen || 0) * 100)}% CONFIDENCE</div>
          </div>

          <div className="checklist">
            <Check on={ui.stream} label="CAMERA" />
            <Check on={ui.ok} label="FULL BODY IN FRAME" />
            <Check on={ui.seen > 0.55} label="POSE TRACKING" />
            <Check on={ui.status === 'ready'} label="AI MODEL" />
          </div>
          {hint && <div className="toast">{hint}</div>}
        </div>

        <div className="setup-right">
          <div className="eyebrow">
            <span>ARENA SETUP</span>
          </div>
          <h2 className="h2">
            PICK YOUR <span className="grad">RUN</span>
          </h2>
          <p className="muted-line">Two ways to be haunted. Both save a ghost.</p>

          <div className="mode-cards">
            {(['rush', 'flow'] as Mode[]).map((m) => {
              const g = db.ghosts[m];
              return (
                <button className={`mode-card${m === 'rush' ? ' hot' : ''}`} key={m} onClick={() => choose(m)}>
                  <span className="mode-kicker">{MODE_INFO[m].kicker}</span>
                  <span className="mode-name">{MODE_INFO[m].name}</span>
                  <span className="mode-blurb">{MODE_INFO[m].blurb}</span>
                  <span className="mode-detail">{MODE_INFO[m].detail}</span>
                  <span className="mode-foot">
                    <span className="mode-time">{MODE_INFO[m].duration}s</span>
                    <span className="ghost-tag">{g ? `GHOST ${g.name} · ${formatNumber(g.score)}` : 'NO GHOST YET'}</span>
                  </span>
                  <span className="mode-arrow">→</span>
                </button>
              );
            })}
          </div>

          <button className="text-link" onClick={onAuto}>
            No camera? Watch the AI play itself →
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`check${on ? ' on' : ''}`}>
      <i>{on ? '✓' : ''}</i>
      <span>{label}</span>
    </div>
  );
}
