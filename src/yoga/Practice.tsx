import { useEffect, useRef, useState } from 'react';
import type { Skeleton } from '../lib/body';
import { sfx } from '../lib/audio';
import { burst, stepParticles, type Particle } from '../lib/render';
import type { PoseEngine } from '../lib/vision';
import { buildCtx, evaluate, type Baseline, type CheckResult } from './checks';
import type { YogaPose } from './poses';
import { drawYoga, C } from './render';
import type { PoseResult } from './store';
import { sloppy, Yogi } from './Yogi';
import { voiceCoach } from './voice';

type Props = {
  engine: PoseEngine;
  poses: YogaPose[];
  baseline: Baseline;
  demo: boolean;
  onDone: (results: PoseResult[]) => void;
  onExit: () => void;
};

type Live = {
  score: number;
  hold: number;
  seconds: number;
  cue: string | null;
  checks: CheckResult[];
  poseIndex: number;
  transitioning: boolean;
  perfect: boolean;
};

const initial: Live = {
  score: 0,
  hold: 0,
  seconds: 0,
  cue: null,
  checks: [],
  poseIndex: 0,
  transitioning: false,
  perfect: false,
};

export function Practice({ engine, poses, baseline, demo, onDone, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const yogiRef = useRef<Yogi | null>(null);
  if (demo && !yogiRef.current) yogiRef.current = new Yogi(sloppy(poses[0].ref), poses[0].ref, 1.1);

  const particles = useRef<Particle[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [live, setLive] = useState<Live>(initial);
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState<PoseResult[] | null>(null);

  const idxRef = useRef(0);
  const holdRef = useRef(0);
  const sumRef = useRef(0);
  const timeRef = useRef(0);
  const cueCount = useRef<Record<string, number>>({});
  const resultsRef = useRef<PoseResult[]>([]);
  const pauseUntil = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const celebrateRef = useRef(0);
  const cueSeen = useRef({ text: '', at: 0 });
  const [voice, setVoice] = useState(() => voiceCoach.isOn());

  useEffect(() => {
    if (!demo) engine.attach(videoRef.current);
    sfx.unlock();
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;

    const startPose = (i: number) => {
      idxRef.current = i;
      holdRef.current = 0;
      sumRef.current = 0;
      timeRef.current = 0;
      cueCount.current = {};
      pauseUntil.current = 0;
      setCurrent(i);
      if (demo && yogiRef.current) {
        yogiRef.current.resetTo(sloppy(poses[i].ref), 1.1);
        yogiRef.current.setGoal(poses[i].ref);
      }
      sfx.soft();
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      const cv = canvasRef.current;
      const W = cv?.clientWidth || 380;
      const H = cv?.clientHeight || 480;
      const camAspect = demo ? W / Math.max(1, H) : engine.aspect || 16 / 9;

      if (demo) yogiRef.current?.tick(dt, camAspect);
      const pose = demo ? (yogiRef.current?.pose ?? null) : engine.pose;
      const p = poses[idxRef.current];

      const stage = stageRef.current;
      if (stage) stage.dataset.ar = camAspect.toFixed(4);

      let score = 0;
      let checks: CheckResult[] = [];
      let cue: string | null = null;
      const paused = now < pauseUntil.current;

      if (pose?.ok && !paused) {
        const ctx = buildCtx(pose.p, baseline);
        const ev = evaluate(pose.p, p.checks, ctx);
        score = ev.score;
        checks = ev.results;
        sumRef.current += score * dt;
        timeRef.current += dt;
        const top = ev.worst[0];
        if (top) {
          cue = top.cue;
          cueCount.current[top.id] = (cueCount.current[top.id] ?? 0) + dt;
        }
        if (score >= 0.66) holdRef.current = Math.min(1, holdRef.current + dt / p.seconds);
        else holdRef.current = Math.max(0, holdRef.current - dt * 0.04);
      } else if (pose && !pose.ok && !paused) {
        checks = p.checks.map((c) => ({ id: c.id, label: c.label, cue: c.cue, score: 0, error: 0, weight: c.weight }));
        cue = 'Step back — I need to see your whole body';
      }

      if (cue && !paused) {
        const seen = cueSeen.current;
        if (seen.text !== cue) cueSeen.current = { text: cue, at: now };
        else if (now - seen.at > 1000) voiceCoach.say(cue);
      }

      if (holdRef.current >= 1 && !paused && pendingRef.current === null) {
        const total = Math.max(0.001, timeRef.current);
        const cues = Object.entries(cueCount.current)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([id]) => p.checks.find((c) => c.id === id)?.cue ?? id);
        resultsRef.current = [
          ...resultsRef.current,
          { id: p.id, name: p.name, seconds: total, alignment: sumRef.current / total, cues },
        ];
        celebrateRef.current = 1;
        voiceCoach.stop();
        sfx.chime();
        burst(particles.current, W / 2, H * 0.44, 44, [C.sage, C.mint, C.amber], 1.1);
        const next = idxRef.current + 1;
        if (next < poses.length) {
          pendingRef.current = next;
          pauseUntil.current = now + 2200;
        } else {
          pauseUntil.current = now + 1e9;
          setFinished(resultsRef.current);
        }
      }

      if (pendingRef.current !== null && now >= pauseUntil.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        startPose(next);
      }

      if (celebrateRef.current > 0) celebrateRef.current = Math.max(0, celebrateRef.current - dt * 0.7);
      particles.current = stepParticles(particles.current, dt);

      const ctx2 = cv?.getContext('2d');
      if (cv && ctx2) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
          cv.width = Math.round(W * dpr);
          cv.height = Math.round(H * dpr);
        }
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawYoga(ctx2, W, H, {
          pose,
          ref: p.ref,
          camAspect,
          score,
          hold: holdRef.current,
          time: now / 1000,
          celebrate: celebrateRef.current,
          particles: particles.current,
        });
      }

      if (now - lastUi > 90) {
        lastUi = now;
        setLive({
          score,
          hold: holdRef.current,
          seconds: Math.max(0, (1 - holdRef.current) * p.seconds),
          cue,
          checks,
          poseIndex: idxRef.current,
          transitioning: paused,
          perfect: score >= 0.9,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      voiceCoach.stop();
    };
  }, [baseline, demo, engine, poses]);

  useEffect(() => {
    if (finished) onDoneRef.current(finished);
  }, [finished]);

  const p = poses[current] ?? poses[0];

  return (
    <div className="y-screen y-practice">
      <header className="y-top">
        <span className="y-wordmark">ATHLYX</span>
        <div className="y-progress">
          {poses.map((it, i) => (
            <i key={it.id} className={i < live.poseIndex ? 'done' : i === live.poseIndex ? 'now' : ''} />
          ))}
        </div>
        <div className="y-top-actions">
          <button
            className={`y-icon${voice ? ' on' : ''}`}
            onClick={() => setVoice(voiceCoach.toggle())}
            aria-label={voice ? 'Mute voice cues' : 'Unmute voice cues'}
            title={voice ? 'Voice cues on' : 'Voice cues off'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {voice ? <path d="M15.5 8.5a5 5 0 0 1 0 7" /> : <path d="m17 9 4 6M21 9l-4 6" />}
            </svg>
          </button>
          <button className="y-icon" onClick={onExit} aria-label="End practice">
            ✕
          </button>
        </div>
      </header>

      <div className="y-grid">
        <div className="y-left">
          <div className="y-stage" ref={stageRef}>
            {!demo && <video ref={videoRef} className="y-cam" muted playsInline autoPlay />}
            <canvas ref={canvasRef} className="y-canvas" />
            <div className="y-vignette" />
            <div className="y-stage-head">
              <div className="y-pose-title">
                <b>{p.name}</b>
                <em>{p.sanskrit}</em>
              </div>
              <div className={`y-timer${live.hold > 0.999 ? ' full' : ''}`}>
                {Math.ceil(live.seconds)}
                <span>s</span>
              </div>
            </div>
          </div>

          <div className="y-cuebar">
            {live.transitioning ? (
              <div className="y-cue ok">
                <span>HELD</span>
                <b>Beautiful. Breathe it in.</b>
              </div>
            ) : live.cue ? (
              <div className="y-cue adjust">
                <span>ADJUST</span>
                <b>{live.cue}</b>
              </div>
            ) : (
              <div className="y-cue ok">
                <span>{live.perfect ? 'ALIGNED' : 'HOLDING'}</span>
                <b>{live.perfect ? 'Perfect. Stay here.' : 'Keep softening your breath.'}</b>
              </div>
            )}
          </div>
        </div>

        <aside className="y-coach">
          <div className="y-align">
            <div className="y-align-num">
              {Math.round(live.score * 100)}
              <span>%</span>
            </div>
            <div className="y-align-label">alignment</div>
            <div className="y-holdbar">
              <i style={{ width: `${Math.round(live.hold * 100)}%` }} />
            </div>
            <div className="y-hold-label">{Math.ceil(live.seconds)}s remaining</div>
          </div>

          <ul className="y-checks">
            {live.checks.map((c) => (
              <li key={c.id} className={c.score > 0.85 ? 'on' : c.score > 0.6 ? 'mid' : 'off'}>
                <i />
                <span>{c.label}</span>
              </li>
            ))}
            {live.checks.length === 0 && <li className="idle">Waiting for your body…</li>}
          </ul>

          <div className="y-pose-steps">
            <div className="y-kicker">HOW IT SHOULD FEEL</div>
            <p>{p.feel}</p>
            <ul>
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
