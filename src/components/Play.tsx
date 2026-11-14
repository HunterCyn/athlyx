import { useEffect, useRef, useState } from 'react';
import { sfx } from '../lib/audio';
import { MODE_INFO, Run } from '../lib/game';
import { burst, PAL, stepParticles, drawScene, type Particle, type TrailMap } from '../lib/render';
import { formatNumber } from '../lib/store';
import type { Ghost, HudState, Joint, Mode, RunOutcome } from '../lib/types';
import { Performer, type PoseEngine } from '../lib/vision';

type Props = {
  engine: PoseEngine;
  mode: Mode;
  ghost: Ghost | null;
  demo: boolean;
  onFinish: (o: RunOutcome) => void;
  onQuit: () => void;
};

const TRAIL_JOINTS: Joint[] = ['lw', 'rw', 'la', 'ra'];

export function Play({ engine, mode, ghost, demo, onFinish, onQuit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<Run | null>(null);
  if (!runRef.current) runRef.current = new Run(mode, ghost);
  const run = runRef.current;
  const performerRef = useRef<Performer | null>(null);
  if (demo && !performerRef.current) performerRef.current = new Performer(run);

  const particles = useRef<Particle[]>([]);
  const trails = useRef<TrailMap>({});
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const [phase, setPhase] = useState<'countdown' | 'live'>('countdown');
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<HudState>({
    score: 0,
    combo: 0,
    mult: 1,
    timeLeft: MODE_INFO[mode].duration,
    quality: 0,
    hold: 0,
    targetName: '',
    targetHint: '',
    hits: 0,
    misses: 0,
    accuracy: 0,
    ghostScore: null,
    ghostName: null,
    ahead: false,
    busted: false,
    lastGain: 0,
    flowMeter: 0,
    flowLabel: '',
    visible: true,
    phase: 'countdown',
  });

  useEffect(() => {
    if (!demo) engine.attach(videoRef.current);
    sfx.unlock();
    const startAt = performance.now() + (demo ? 1800 : 3200);
    let raf = 0;
    let last = performance.now();
    let live = false;
    let done = false;
    let lastUi = 0;
    let lastCount = -1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      if (demo) performerRef.current?.tick(dt, now);
      const pose = demo ? (performerRef.current?.pose ?? null) : engine.pose;

      const cv = canvasRef.current;
      const stage = stageRef.current;
      if (stage) {
        // match the camera's true aspect so holograms land exactly on the body
        const ar = (demo ? 16 / 9 : engine.aspect || 16 / 9).toFixed(4);
        if (stage.dataset.ar !== ar) {
          stage.dataset.ar = ar;
          stage.style.aspectRatio = ar;
          stage.parentElement?.style.setProperty('--ar', ar);
        }
      }
      const w = cv?.clientWidth || 960;
      const h = cv?.clientHeight || 540;

      if (!live) {
        const left = Math.max(0, Math.ceil((startAt - now) / 1000));
        if (left !== lastCount) {
          lastCount = left;
          setCount(left);
          if (left > 0) sfx.tick();
        }
        if (now >= startAt) {
          live = true;
          sfx.go();
          setPhase('live');
        }
      } else if (!done) {
        const events = run.update(dt, pose);
        for (const e of events) {
          if (e.type === 'hit') {
            sfx.hit(e.combo ?? 0);
            const cx = pose ? pose.hip.x * h : w / 2;
            const cy = pose ? (pose.hip.y - pose.torso * 0.6) * h : h * 0.42;
            burst(particles.current, cx, cy, 30, [PAL.mint, PAL.cyan, PAL.white, PAL.violet], 1);
          } else if (e.type === 'miss') {
            sfx.miss();
          } else if (e.type === 'bust') {
            sfx.bust();
          } else if (e.type === 'finish') {
            sfx.finish();
          }
        }
        if (run.finished) {
          done = true;
          onFinishRef.current(run.outcome(demo));
          return;
        }
      }

      if (pose?.ok) {
        const hipX = pose.hip.x * h;
        const hipY = pose.hip.y * h;
        const torso = pose.torso * h;
        for (const k of TRAIL_JOINTS) {
          const arr = trails.current[k] ?? (trails.current[k] = []);
          const j = pose.p[k];
          arr.push({ x: hipX + j.x * torso, y: hipY + j.y * torso });
          if (arr.length > 16) arr.shift();
        }
      } else if (!pose) {
        trails.current = {};
      }

      particles.current = stepParticles(particles.current, dt);

      const ctx = cv?.getContext('2d');
      if (cv && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
          cv.width = Math.round(w * dpr);
          cv.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const ghostNow = run.ghostNow();
        drawScene(ctx, w, h, {
          pose,
          target: run.target,
          ghost: run.busted ? null : ghostNow.skel,
          hold: run.hold,
          quality: run.quality,
          time: now / 1000,
          combo: run.combo,
          mode,
          trails: trails.current,
          particles: particles.current,
          sinceHit: run.t - run.flashHitAt,
          sinceMiss: run.t - run.flashMissAt,
          showTarget: live,
        });
      }

      if (now - lastUi > 90) {
        lastUi = now;
        setHud({ ...run.hud(), phase: live ? 'live' : 'countdown' });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demo, engine, mode, run]);

  const ghostFinal = ghost?.score ?? null;
  const raceMax = Math.max(1, hud.score, ghostFinal ?? 0);
  const pct = (v: number) => `${Math.min(100, (v / raceMax) * 100)}%`;

  return (
    <div className="screen play-screen">
      <div className="stage play" ref={stageRef}>
        {!demo && <video ref={videoRef} className="cam" muted playsInline autoPlay />}
        <canvas ref={canvasRef} className="scene" />
        <div className="scanlines" />
        <div className="stage-corners" />

        <div className="hud">
          <div className="hud-topwrap">
            <div className="timebar">
              <i style={{ transform: `scaleX(${Math.max(0, hud.timeLeft) / MODE_INFO[mode].duration})` }} />
            </div>
            <div className="hud-top">
              <div className="hud-col left">
                <div className="hud-mode">
                  <i className={`dot${phase === 'live' ? ' on' : ''}`} />
                  <b>{MODE_INFO[mode].name}</b>
                  <span className="hud-tag">{demo ? 'AUTO-DEMO' : 'LIVE'}</span>
                </div>
                <div className="card target-card">
                  {mode === 'rush' ? (
                    <>
                      <div className="k">STRIKE THE POSE</div>
                      <div className="v">{hud.targetName || 'STAND BY'}</div>
                      <div className="hint">{hud.targetHint}</div>
                      <div className="meter">
                        <span>MATCH</span>
                        <div className="meter-bar">
                          <i style={{ width: `${Math.round(hud.quality * 100)}%` }} />
                        </div>
                        <span className="meter-num">{Math.round(hud.quality * 100)}%</span>
                      </div>
                      <div className="meter hold">
                        <span>HOLD</span>
                        <div className="meter-bar">
                          <i style={{ width: `${Math.round(hud.hold * 100)}%` }} />
                        </div>
                        <span className="meter-num">{Math.round(hud.hold * 100)}%</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="k">FLOW JUDGE</div>
                      <div className="v">{hud.flowLabel || 'START MOVING'}</div>
                      <div className="hint">breadth · smoothness · balance</div>
                      <div className="meter">
                        <span>FLOW</span>
                        <div className="meter-bar">
                          <i style={{ width: `${Math.round(hud.flowMeter * 100)}%` }} />
                        </div>
                        <span className="meter-num">{Math.round(hud.flowMeter * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="hud-col right">
                <div className="hud-score">
                  <b>{formatNumber(hud.score)}</b>
                  <span>SCORE</span>
                </div>
                <div className="card ghost-card">
                  <div className="k">{ghost ? 'GHOST RACE' : 'NO GHOST'}</div>
                  {ghost && ghostFinal !== null ? (
                    <>
                      <div className="race-row">
                        <span className="you">YOU</span>
                        <b>{formatNumber(hud.score)}</b>
                      </div>
                      <div className="race-row">
                        <span className="ghost">{ghost.name}</span>
                        <b>{formatNumber(hud.ghostScore ?? 0)}</b>
                      </div>
                      <div className="race-bar">
                        <i className="you" style={{ width: pct(hud.score) }} />
                        <span className="race-tick" style={{ left: pct(ghostFinal) }} />
                      </div>
                      <div className={`race-delta${hud.ahead ? ' ahead' : ''}`}>
                        {hud.busted
                          ? 'GHOST BUSTED'
                          : hud.ahead
                            ? 'AHEAD OF THE GHOST'
                            : `${formatNumber((hud.ghostScore ?? 0) - hud.score)} BEHIND`}
                      </div>
                    </>
                  ) : (
                    <div className="race-empty">SET THE PACE — YOUR RUN BECOMES THE GHOST</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="hud-bottom">
            <div className="combo-card">
              <span className="combo-mult" key={hud.combo}>
                ×{hud.mult.toFixed(1)}
              </span>
              <span className="combo-label">COMBO {hud.combo}</span>
            </div>
          </div>

          <button className="quit" onClick={onQuit} aria-label="Quit run">
            ✕
          </button>

          {phase === 'countdown' && (
            <div className="countdown">
              <div className="count-num">{count > 0 ? count : 'GO'}</div>
              <div className="count-label">{demo ? 'AUTO-DEMO STARTING' : 'GET IN POSITION · FULL BODY IN FRAME'}</div>
            </div>
          )}

          {hud.busted && <div className="busted-banner">GHOST BUSTED</div>}

          {phase === 'live' && !hud.visible && (
            <div className="lost">
              <b>I CAN’T SEE YOU</b>
              <span>step back so your feet are in frame</span>
            </div>
          )}
        </div>
      </div>

      <div className="play-foot">
        <span>{mode === 'rush' ? 'HIT THE POSE · HOLD IT · COMBO UP' : 'MOVE BIG · SMOOTH · SYMMETRIC'}</span>
        <span className="dim">GHOSTMOVE · ON-DEVICE POSE AI</span>
      </div>
    </div>
  );
}
