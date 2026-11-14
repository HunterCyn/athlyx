import { useEffect, useRef, useState } from 'react';
import type { Skeleton } from '../lib/body';
import { sfx } from '../lib/audio';
import type { PoseEngine } from '../lib/vision';
import { calibrate, emptyBaseline, type Baseline } from './checks';
import { POSES } from './poses';
import { drawYoga } from './render';

type Props = {
  engine: PoseEngine;
  baseline: Baseline | null;
  onReady: (b: Baseline) => void;
  onDemo: () => void;
  onBack: () => void;
};

const NEED = 28;

export function Setup({ engine, baseline, onReady, onDemo, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<Skeleton[]>([]);
  const [progress, setProgress] = useState(0);
  const [cal, setCal] = useState<Baseline | null>(baseline);
  const [ui, setUi] = useState({ status: engine.status, error: engine.error, ok: false, has: false, seen: 0 });
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    engine.attach(videoRef.current);
    void engine.startCamera();
    sfx.unlock();
    let raf = 0;
    let lastUi = 0;
    let acc = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const pose = engine.pose;
      const cv = canvasRef.current;
      const W = cv?.clientWidth || 380;
      const H = cv?.clientHeight || 480;
      const aspect = engine.aspect || 16 / 9;

      if (pose?.ok && framesRef.current.length < NEED) {
        acc += 1 / 60;
        if (acc > 0.09) {
          acc = 0;
          framesRef.current.push(pose.p);
          const pct = Math.min(100, Math.round((framesRef.current.length / NEED) * 100));
          setProgress(pct);
          if (framesRef.current.length >= NEED) {
            const b = calibrate(framesRef.current);
            setCal(b);
            sfx.chime();
          }
        }
      }

      const ctx = cv?.getContext('2d');
      if (cv && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
          cv.width = Math.round(W * dpr);
          cv.height = Math.round(H * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawYoga(ctx, W, H, {
          pose,
          ref: POSES[0].ref,
          camAspect: aspect,
          score: pose?.ok ? 0.9 : 0,
          hold: framesRef.current.length / NEED,
          time: now / 1000,
          celebrate: 0,
          particles: [],
        });
      }

      if (now - lastUi > 120) {
        lastUi = now;
        setUi({ status: engine.status, error: engine.error, ok: !!pose?.ok, has: !!pose, seen: pose?.seen ?? 0 });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const failed = ui.status === 'error' || ui.status === 'denied';
  const ready = !!cal && progress >= 100;

  return (
    <div className="y-screen y-setup">
      <header className="y-top">
        <span className="y-wordmark">STILL</span>
        <span className="y-tag">{ready ? 'BODY CALIBRATED' : 'SET UP YOUR MAT'}</span>
        <button className="y-icon" onClick={onBack} aria-label="Back">
          ✕
        </button>
      </header>

      <div className="y-grid">
        <div className="y-stage">
          {!failed && <video ref={videoRef} className="y-cam" muted playsInline autoPlay />}
          <canvas ref={canvasRef} className="y-canvas" />
          <div className="y-vignette" />
          <div className="y-stage-head">
            <div className="y-pose-title">
              <b>Mountain</b>
              <em>Tadasana · calibration</em>
            </div>
            <div className="y-timer">
              {progress}
              <span>%</span>
            </div>
          </div>

          {failed ? (
            <div className="y-error">
              <b>CAMERA UNAVAILABLE</b>
              <p>{ui.error || 'The camera could not start.'}</p>
              <div className="y-row">
                <button
                  className="y-btn small"
                  onClick={() => {
                    engine.stopCamera();
                    void engine.startCamera();
                  }}
                >
                  RETRY
                </button>
                <button className="y-btn ghost small" onClick={onDemo}>
                  USE A DEMO BODY
                </button>
              </div>
            </div>
          ) : (
            <div className="y-stage-foot">
              <span>STAND TALL · ARMS BY YOUR SIDES · FULL BODY IN FRAME</span>
            </div>
          )}
        </div>

        <aside className="y-coach">
          <div className="y-kicker">STEP 1 OF 2</div>
          <h2 className="y-h2">
            Prop your phone <em>against something.</em>
          </h2>
          <p className="y-body">
            Two metres back, mat in view, head to feet. Then stand in Mountain while I learn the shape of your body — that
            part is why this works for a 5′2″ and a 6′4″ practitioner on the same mat.
          </p>

          <ul className="y-setup-checks">
            <li className={ui.has ? 'on' : ''}>
              <i /> Camera live
            </li>
            <li className={ui.ok ? 'on' : ''}>
              <i /> Full body in frame
            </li>
            <li className={ui.seen > 0.55 ? 'on' : ''}>
              <i /> Pose tracking
            </li>
            <li className={ready ? 'on' : ''}>
              <i /> Body calibrated
            </li>
          </ul>

          <div className="y-cal">
            <div className="y-cal-bar">
              <i style={{ width: `${progress}%` }} />
            </div>
            <span>
              {ready
                ? 'Calibrated. Your own proportions are the reference now.'
                : ui.ok
                  ? 'Hold still — learning your body…'
                  : waited && ui.status !== 'ready'
                    ? 'No camera yet? Allow access, or watch the demo body below.'
                    : 'Step into frame to calibrate.'}
            </span>
          </div>

          <div className="y-actions">
            <button className="y-btn primary" disabled={!ui.ok} onClick={() => onReady(cal ?? emptyBaseline())}>
              {ready ? 'BEGIN THE FLOW' : 'CONTINUE'}
            </button>
            <button
              className="y-btn ghost"
              onClick={() => {
                framesRef.current = [];
                setProgress(0);
                setCal(null);
              }}
            >
              RECALIBRATE
            </button>
            <button className="y-btn ghost" onClick={onDemo}>
              USE A DEMO BODY
            </button>
          </div>

          <p className="y-fine">Video never leaves this device. The model runs in the tab.</p>
        </aside>
      </div>
    </div>
  );
}
