import { useEffect, useMemo, useRef, useState } from 'react';
import type { BodyPose } from '../lib/body';
import { PoseEngine } from '../lib/vision';
import { drawLanding } from './overlay';
import { Athlete, selfTest } from './Athlete';
import {
  combineTrials,
  detectLanding,
  measureTrial,
  symmetryIndex,
  verdict,
  type Frame,
  type ScreenResult,
  type TrialMetrics,
} from './metrics';
import { loadSessions, saveSession } from './store';

/**
 * Return-to-play landing screen.
 *
 * Gate -> setup -> three trials -> report. The only measurement is frontal-plane
 * landing geometry: how far each knee collapses toward the midline, how close
 * the knees stay, how much the trunk and pelvis tip. No force claims, no video
 * leaving the device, and a block screen for anyone the impact test is not for.
 */

type Phase = 'gate' | 'setup' | 'trial' | 'report';
type Involved = 'left' | 'right' | 'unsure';

const TRIALS = 3;
const CAPTURE_SECONDS = 3.4;

const CONDITIONS = [
  { id: 'pregnant', text: 'I am pregnant, or gave birth within the last six weeks.' },
  {
    id: 'surgery',
    text: 'I had knee or hip surgery in the last three months, or my surgeon has not cleared me for landing and jumping.',
  },
  { id: 'pain', text: 'I have pain, swelling, or a knee that has felt like it gives way, right now.' },
  { id: 'heart', text: 'I have a heart condition, uncontrolled blood pressure, or I get dizzy or faint on exertion.' },
  { id: 'told', text: 'A clinician has told me not to do impact or balance testing.' },
];

function paint(cv: HTMLCanvasElement | null, pose: BodyPose | null, aspect: number, time: number) {
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  const W = cv.clientWidth || 360;
  const H = cv.clientHeight || 470;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLanding(ctx, W, H, { pose, camAspect: aspect, time });
}

/* ---------------------------------- gate ---------------------------------- */

function Gate(props: {
  flagged: string[];
  onToggle: (id: string) => void;
  involved: Involved;
  onInvolved: (v: Involved) => void;
  ack: boolean;
  onAck: (v: boolean) => void;
  onStart: () => void;
}) {
  const { flagged, onToggle, involved, onInvolved, ack, onStart, onAck } = props;
  return (
    <section className="r-screen">
      <header className="r-top">
        <span className="r-mark">ATHLYX</span>
        <span className="r-tag">RETURN-TO-PLAY · LANDING SCREEN</span>
      </header>

      <div className="r-gate">
        <div className="r-kicker">STEP 0 · SAFETY</div>
        <h1 className="r-h1">
          Before you jump, <em>five questions.</em>
        </h1>
        <p className="r-lede">
          This screen measures how your knees behave when you land. Booking a landing test is not the same as a
          diagnosis, and it is not for everyone on every day — so tick anything that applies to you.
        </p>

        <div className="r-conds">
          {CONDITIONS.map((c) => {
            const on = flagged.includes(c.id);
            return (
              <label key={c.id} className={on ? 'r-cond on' : 'r-cond'}>
                <input type="checkbox" checked={on} onChange={() => onToggle(c.id)} />
                <span>{c.text}</span>
              </label>
            );
          })}
        </div>

        {flagged.length > 0 ? (
          <div className="r-warn">
            <b>Don’t run the impact version.</b>
            <p>
              You can still measure the same thing with a <b>low-impact step-down</b>: step off a low step instead of
              jumping, and the camera reads the same knee and trunk geometry. If any of the above describes you right
              now, check with a clinician before loading the knee at all.
            </p>
          </div>
        ) : null}

        <div className="r-involved">
          <span>Which leg had the injury?</span>
          <div className="r-pills">
            {(['left', 'right', 'unsure'] as const).map((v) => (
              <button
                key={v}
                className={involved === v ? 'r-pill on' : 'r-pill'}
                onClick={() => onInvolved(v)}
                type="button"
              >
                {v === 'unsure' ? 'NOT SURE' : v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <label className="r-consent">
          <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} />
          <span>
            I understand this is a movement screen, not a medical diagnosis, and that I take part at my own risk. No video
            leaves this device.
          </span>
        </label>

        <button className="r-btn primary" disabled={!ack} onClick={onStart}>
          {flagged.length > 0 ? 'START THE LOW-IMPACT SCREEN' : 'START THE SCREEN'}
        </button>

        <p className="r-fine">
          Not a diagnostic device. If you have pain, instability or a recent reconstruction, this is a conversation with
          your clinician — not a number on a screen.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------- setup ---------------------------------- */

function Setup(props: { engine: PoseEngine; onBegin: () => void; onDemo: () => void; onBack: () => void }) {
  const { engine, onBegin, onDemo, onBack } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ui, setUi] = useState({ status: engine.status, error: engine.error, ok: false, has: false });

  useEffect(() => {
    engine.attach(videoRef.current);
    void engine.startCamera();
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      paint(canvasRef.current, engine.pose, engine.aspect || 16 / 9, now / 1000);
      if (now - lastUi > 140) {
        lastUi = now;
        setUi({ status: engine.status, error: engine.error, ok: !!engine.pose?.ok, has: !!engine.pose });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const failed = ui.status === 'error' || ui.status === 'denied';

  return (
    <section className="r-screen">
      <header className="r-top">
        <span className="r-mark">ATHLYX</span>
        <span className="r-tag">SET UP THE FLOOR</span>
        <button className="r-icon" onClick={onBack} aria-label="Back">
          ✕
        </button>
      </header>

      <div className="r-grid">
        <div className="r-stage">
          {!failed ? <video ref={videoRef} className="r-cam" muted playsInline autoPlay /> : null}
          <canvas ref={canvasRef} className="r-canvas" />
          <div className="r-vignette" />
          <div className="r-stage-head">
            <b>FULL BODY, HEAD TO FEET</b>
            <span>phone at hip height · 2–3 m back</span>
          </div>
          {failed ? (
            <div className="r-error">
              <b>CAMERA UNAVAILABLE</b>
              <p>{ui.error || 'The camera could not start.'}</p>
              <div className="r-row">
                <button
                  className="r-btn small"
                  onClick={() => {
                    engine.stopCamera();
                    void engine.startCamera();
                  }}
                >
                  RETRY
                </button>
                <button className="r-btn ghost small" onClick={onDemo}>
                  USE A DEMO ATHLETE
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="r-panel">
          <div className="r-kicker">STEP 1 OF 2</div>
          <h2 className="r-h2">
            Prop it up, <em>stand back.</em>
          </h2>
          <p className="r-body">
            The camera has to see your knees and your hips at the same time — that is the whole measurement. Put the
            phone at hip height, 2–3 metres away, and check that your feet are still in frame.
          </p>

          <ul className="r-checks">
            <li className={ui.has ? 'on' : ''}>
              <i /> Camera live
            </li>
            <li className={ui.ok ? 'on' : ''}>
              <i /> Whole body tracked
            </li>
            <li className={ui.ok ? 'on' : ''}>
              <i /> Knees and hips visible
            </li>
          </ul>

          <div className="r-actions">
            <button className="r-btn primary" disabled={!ui.ok} onClick={onBegin}>
              BEGIN THE LANDINGS
            </button>
            <button className="r-btn ghost" onClick={onDemo}>
              USE A DEMO ATHLETE
            </button>
          </div>

          <p className="r-fine">Nothing is uploaded. The pose model runs in this tab.</p>
        </aside>
      </div>
    </section>
  );
}

/* ---------------------------------- trial --------------------------------- */

function Trial(props: {
  engine: PoseEngine;
  athlete: Athlete;
  demo: boolean;
  lowImpact: boolean;
  trialNo: number;
  onDone: (m: TrialMetrics) => void;
  onRetry: () => void;
  onQuit: () => void;
}) {
  const { engine, athlete, demo, lowImpact, trialNo, onDone, onRetry, onQuit } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(3);
  const [cap, setCap] = useState(0);
  const [result, setResult] = useState<TrialMetrics | null>(null);
  const [missed, setMissed] = useState(false);

  useEffect(() => {
    if (demo) athlete.reset();
    else {
      engine.attach(videoRef.current);
      void engine.startCamera();
    }

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let capT = 0;
    let stage: 'count' | 'cap' | 'done' = 'count';
    let shown = 3;
    let lastPct = -1;
    const frames: Frame[] = [];

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (demo) athlete.tick(dt, engine.aspect || 16 / 9);
      const pose = (demo ? athlete : engine).pose;

      if (stage === 'count') {
        elapsed += dt;
        const n = Math.max(1, 3 - Math.floor(elapsed));
        if (n !== shown) {
          shown = n;
          setCount(n);
        }
        if (elapsed >= 3) {
          stage = 'cap';
          setCount(0);
        }
      } else if (stage === 'cap') {
        capT += dt;
        if (pose?.ok) frames.push({ t: capT, pose });
        const pct = Math.min(100, Math.round((capT / CAPTURE_SECONDS) * 100));
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          setCap(pct);
        }
        if (capT >= CAPTURE_SECONDS) {
          stage = 'done';
          setCap(100);
          const land = detectLanding(frames);
          if (land) setResult(measureTrial(frames, land));
          else setMissed(true);
        }
      }

      paint(canvasRef.current, pose, engine.aspect || 16 / 9, now / 1000);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [athlete, demo, engine]);

  const counting = count > 0 && !result && !missed;

  return (
    <section className="r-screen">
      <header className="r-top">
        <span className="r-mark">ATHLYX</span>
        <span className="r-tag">
          TRIAL {trialNo + 1} OF {TRIALS}
        </span>
        <button className="r-icon" onClick={onQuit} aria-label="Quit">
          ✕
        </button>
      </header>

      <div className="r-grid">
        <div className="r-stage">
          {!demo ? <video ref={videoRef} className="r-cam" muted playsInline autoPlay /> : null}
          <canvas ref={canvasRef} className="r-canvas" />
          <div className="r-vignette" />

          {counting ? (
            <div className="r-count">{count}</div>
          ) : (
            <div className="r-stage-head">
              <b>{cap >= 100 ? 'CAPTURED' : 'LAND NOW'}</b>
              <span>{cap >= 100 ? 'reading the landing' : `${Math.round(cap)}%`}</span>
            </div>
          )}
        </div>

        <aside className="r-panel">
          <div className="r-kicker">
            {lowImpact ? 'LOW-IMPACT STEP-DOWN' : 'BILATERAL DROP LANDING'}
          </div>
          <h2 className="r-h2">
            {counting ? (
              <>
                Get on the <em>step.</em>
              </>
            ) : (
              <>
                Land <em>softly.</em>
              </>
            )}
          </h2>

          <ol className="r-steps">
            <li>Stand tall, feet hip-width, hands on hips.</li>
            <li>{lowImpact ? 'Step off a low step.' : 'Step off the box and drop.'}</li>
            <li>Land on both feet and sink for two seconds.</li>
            <li>Stay in frame, then stand up.</li>
          </ol>

          <div className="r-capline">
            <i style={{ width: `${cap}%` }} />
          </div>

          {result ? (
            <div className="r-result">
              <div className="r-result-row">
                <span>LEFT KNEE</span>
                <b>{result.leftValgus.toFixed(1)}°</b>
              </div>
              <div className="r-result-row">
                <span>RIGHT KNEE</span>
                <b>{result.rightValgus.toFixed(1)}°</b>
              </div>
              <button className="r-btn primary" onClick={() => onDone(result)}>
                {trialNo + 1 >= TRIALS ? 'SEE THE REPORT' : 'NEXT TRIAL'}
              </button>
            </div>
          ) : null}

          {missed ? (
            <div className="r-result">
              <p className="r-body">
                No landing detected in that window. Drop, land on both feet, and sink — the camera has to see the
                compression.
              </p>
              <button className="r-btn primary" onClick={onRetry}>
                TRY AGAIN
              </button>
            </div>
          ) : null}

          {!result && !missed ? <p className="r-fine">Keep your whole body in frame until the trial ends.</p> : null}
        </aside>
      </div>
    </section>
  );
}

/* ------------------------------- coach read ------------------------------- */

/** One paragraph from the measured numbers. The key stays on the server; this
 *  only ever posts the numbers, never video or an image. */
function AiRead(props: {
  index: number;
  left: number;
  right: number;
  kneeSep: number;
  trunk: number;
  pelvic: number;
  lowImpact: boolean;
  involved: Involved;
}) {
  const [ai, setAi] = useState<{ state: 'idle' | 'loading' | 'ok' | 'off'; text: string }>({
    state: 'idle',
    text: '',
  });

  const ask = async () => {
    setAi({ state: 'loading', text: '' });
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(props),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!data?.summary) throw new Error('empty');
      setAi({ state: 'ok', text: String(data.summary) });
    } catch {
      setAi({ state: 'off', text: '' });
    }
  };

  return (
    <div className="r-ai">
      <div className="r-kicker">COACH READ · GEMINI</div>
      {ai.state === 'idle' ? (
        <>
          <p className="r-body">One paragraph in plain English, written from the numbers above.</p>
          <button className="r-btn ghost" onClick={ask}>
            EXPLAIN THIS TO ME
          </button>
        </>
      ) : null}
      {ai.state === 'loading' ? <p className="r-body">Reading your numbers…</p> : null}
      {ai.state === 'ok' ? <p className="r-body">{ai.text}</p> : null}
      {ai.state === 'off' ? (
        <p className="r-body">
          The written summary isn’t available right now. The numbers above are the whole result, and they’re what a
          physiotherapist will want to see.
        </p>
      ) : null}
      <p className="r-fine">
        Only the numbers above are sent — never video, never a photo. Gemini writes the paragraph; it does not change a
        single measurement.
      </p>
    </div>
  );
}

/* --------------------------------- report --------------------------------- */

function Report(props: {
  trials: TrialMetrics[];
  involved: Involved;
  sessions: ScreenResult[];
  lowImpact: boolean;
  onAgain: () => void;
}) {
  const { trials, involved, sessions, lowImpact, onAgain } = props;
  const agg = useMemo(() => combineTrials(trials), [trials]);
  const index = symmetryIndex(agg);
  const v = verdict(index, trials.length);
  const checks = useMemo(() => selfTest(), []);
  const trend = sessions.slice(0, 8).reverse();

  const legs = [
    { side: 'left' as const, deg: agg.leftValgus },
    { side: 'right' as const, deg: agg.rightValgus },
  ];

  const role = (side: 'left' | 'right') => {
    if (involved === 'unsure') return '';
    return side === involved ? 'INVOLVED' : 'OTHER LEG';
  };

  return (
    <section className="r-screen">
      <header className="r-top">
        <span className="r-mark">ATHLYX</span>
        <span className="r-tag">LANDING REPORT · {lowImpact ? 'LOW IMPACT' : 'DROP LANDING'}</span>
      </header>

      <div className="r-report">
        <div className={`r-verdict ${v.tone}`}>
          <div className="r-big">
            {index.toFixed(0)}
            <span>%</span>
          </div>
          <div>
            <b>{v.label}</b>
            <p>{v.body}</p>
          </div>
        </div>

        <div className="r-bar">
          <i style={{ width: `${index}%` }} />
          <u style={{ left: '90%' }} />
        </div>
        <div className="r-scale">
          <span>0</span>
          <span>90% clinical reference</span>
          <span>100</span>
        </div>

        <div className="r-cards">
          {legs.map((l) => (
            <div key={l.side} className="r-card">
              <div className="r-legname">
                {l.side.toUpperCase()} {role(l.side) ? <em>{role(l.side)}</em> : null}
              </div>
              <div className="r-legdeg">
                {l.deg.toFixed(1)}
                <span>°</span>
              </div>
              <div className="r-legcap">peak inward knee angle at landing</div>
            </div>
          ))}
        </div>

        <div className="r-metrics">
          <div className="r-metric">
            <span>Knee separation</span>
            <b>{agg.kneeSep.toFixed(2)}</b>
            <em>{agg.kneeSep < 0.6 ? 'knees collapsing together' : 'knees tracking apart'}</em>
          </div>
          <div className="r-metric">
            <span>Trunk lean</span>
            <b>{agg.trunk.toFixed(1)}°</b>
            <em>torso away from vertical at peak</em>
          </div>
          <div className="r-metric">
            <span>Pelvic drop</span>
            <b>{agg.pelvic.toFixed(1)}°</b>
            <em>one hip lower than the other</em>
          </div>
          <div className="r-metric">
            <span>Trials kept</span>
            <b>{trials.length}</b>
            <em>median of {trials.length} landing{trials.length === 1 ? '' : 's'}</em>
          </div>
        </div>

        {trend.length > 1 ? (
          <div className="r-trend-box">
            <div className="r-kicker">SYMMETRY OVER SESSIONS</div>
            <div className="r-trend">
              {trend.map((s, i) => (
                <div key={s.date} className="r-trend-col">
                  <i style={{ height: `${Math.max(4, s.index)}%` }} />
                  <span>{i === trend.length - 1 ? 'now' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="r-selftest">
          <div className="r-kicker">PIPELINE CHECK · RUN JUST NOW</div>
          <p className="r-body">
            The synthetic athlete plants a known knee angle; the same detection and measurement code that read your
            landing has to recover it. This is what “the maths works” means here.
          </p>
          <div className="r-table">
            {checks.map((c) => (
              <div key={c.planted} className="r-row">
                <span>planted {c.planted.toFixed(0)}°</span>
                <span>measured {Number.isFinite(c.measured) ? c.measured.toFixed(1) : '—'}°</span>
                <b className={c.delta < 1.5 ? 'ok' : 'bad'}>
                  Δ {Number.isFinite(c.delta) ? c.delta.toFixed(1) : '—'}°
                </b>
              </div>
            ))}
          </div>
        </div>

        <AiRead
          index={index}
          left={agg.leftValgus}
          right={agg.rightValgus}
          kneeSep={agg.kneeSep}
          trunk={agg.trunk}
          pelvic={agg.pelvic}
          lowImpact={lowImpact}
          involved={involved}
        />

        <div className="r-actions wide">
          <button className="r-btn primary" onClick={onAgain}>
            RUN IT AGAIN
          </button>
          <button className="r-btn ghost" onClick={() => window.print()}>
            PRINT / SAVE PDF
          </button>
        </div>

        <p className="r-fine">
          Frontal-plane screen only. This is not the Limb Symmetry Index — the clinical LSI comes from hop distance or
          jump height, which a single camera does not measure — and it is not a diagnosis. Show it to a physiotherapist,
          don’t replace one with it.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------- app ----------------------------------- */

export default function RtpApp() {
  const engineRef = useRef<PoseEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PoseEngine();
  const engine = engineRef.current;

  const athleteRef = useRef<Athlete | null>(null);
  if (!athleteRef.current) athleteRef.current = new Athlete({ valgusLeft: 4, valgusRight: 12 });
  const athlete = athleteRef.current;

  const [phase, setPhase] = useState<Phase>('gate');
  const [flagged, setFlagged] = useState<string[]>([]);
  const [involved, setInvolved] = useState<Involved>('unsure');
  const [ack, setAck] = useState(false);
  const [demo, setDemo] = useState(false);
  const [trials, setTrials] = useState<TrialMetrics[]>([]);
  const [trialNo, setTrialNo] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [sessions, setSessions] = useState<ScreenResult[]>(() => loadSessions());

  useEffect(() => {
    if (phase === 'gate' || phase === 'report') engine.stopCamera();
  }, [phase, engine]);

  const lowImpact = flagged.length > 0;

  const reset = () => {
    setTrials([]);
    setTrialNo(0);
    setAttempt((n) => n + 1);
    setDemo(false);
  };

  const start = () => {
    reset();
    setPhase('setup');
  };

  const begin = (useDemo: boolean) => {
    setDemo(useDemo);
    setAttempt((n) => n + 1);
    setPhase('trial');
  };

  const finish = (m: TrialMetrics) => {
    const next = [...trials, m];
    setTrials(next);
    if (next.length >= TRIALS) {
      const agg = combineTrials(next);
      const rec: ScreenResult = {
        date: Date.now(),
        leftValgus: agg.leftValgus,
        rightValgus: agg.rightValgus,
        kneeSep: agg.kneeSep,
        trunk: agg.trunk,
        pelvic: agg.pelvic,
        index: symmetryIndex(agg),
        trials: next.length,
      };
      saveSession(rec);
      setSessions(loadSessions());
      setPhase('report');
      return;
    }
    setTrialNo((n) => n + 1);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="r-app">
      <div className="r-bg" aria-hidden="true" />

      {phase === 'gate' ? (
        <Gate
          flagged={flagged}
          onToggle={(id) =>
            setFlagged((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          involved={involved}
          onInvolved={setInvolved}
          ack={ack}
          onAck={setAck}
          onStart={start}
        />
      ) : null}

      {phase === 'setup' ? (
        <Setup engine={engine} onBegin={() => begin(false)} onDemo={() => begin(true)} onBack={() => setPhase('gate')} />
      ) : null}

      {phase === 'trial' ? (
        <Trial
          key={`${trialNo}-${attempt}`}
          engine={engine}
          athlete={athlete}
          demo={demo}
          lowImpact={lowImpact}
          trialNo={trialNo}
          onDone={finish}
          onRetry={() => setAttempt((n) => n + 1)}
          onQuit={() => setPhase('gate')}
        />
      ) : null}

      {phase === 'report' ? (
        <Report
          trials={trials}
          involved={involved}
          sessions={sessions}
          lowImpact={lowImpact}
          onAgain={start}
        />
      ) : null}
    </div>
  );
}
