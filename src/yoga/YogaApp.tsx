import { useEffect, useRef, useState } from 'react';
import { PoseEngine } from '../lib/vision';
import type { Baseline } from './checks';
import { Home } from './Home';
import { POSES, type YogaPose } from './poses';
import { Practice } from './Practice';
import { Setup } from './Setup';
import { emptyBaseline } from './checks';
import { loadDB, saveBaseline, saveSession, type DB, type PoseResult } from './store';
import { Summary } from './Summary';
import { voiceCoach } from './voice';

type Phase = 'home' | 'setup' | 'practice' | 'summary';

export default function YogaApp() {
  const engineRef = useRef<PoseEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PoseEngine();
  const engine = engineRef.current;

  const [phase, setPhase] = useState<Phase>('home');
  const [queue, setQueue] = useState<YogaPose[]>(POSES);
  const [baseline, setBaseline] = useState<Baseline>(() => loadDB().baseline ?? emptyBaseline());
  const [db, setDb] = useState<DB>(() => loadDB());
  const [results, setResults] = useState<PoseResult[]>([]);
  const [demo, setDemo] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (phase === 'home') engine.stopCamera();
  }, [phase, engine]);

  const start = (poses: YogaPose[]) => {
    voiceCoach.unlock();
    setQueue(poses);
    setResults([]);
    setDemo(false);
    setRunId((n) => n + 1);
    setPhase('setup');
  };

  const startDemo = (poses: YogaPose[] = POSES) => {
    voiceCoach.unlock();
    setQueue(poses);
    setResults([]);
    setDemo(true);
    setRunId((n) => n + 1);
    setPhase('practice');
  };

  const onReady = (b: Baseline) => {
    setBaseline(b);
    saveBaseline(b);
    setDb(loadDB());
    setPhase('practice');
  };

  const onDone = (r: PoseResult[]) => {
    setResults(r);
    const alignment = r.length ? r.reduce((a, x) => a + x.alignment, 0) / r.length : 0;
    saveSession({ date: Date.now(), alignment, results: r });
    setDb(loadDB());
    setPhase('summary');
  };

  return (
    <div className="y-app">
      <div className="y-bg" aria-hidden="true" />
      {phase === 'home' && (
        <Home
          db={db}
          onStart={() => start(POSES)}
          onDemo={() => startDemo()}
          onPose={(p) => start([p])}
        />
      )}

      {phase === 'setup' && (
        <Setup
          key={runId}
          engine={engine}
          baseline={null}
          onReady={onReady}
          onDemo={() => startDemo(queue)}
          onBack={() => {
            setPhase('home');
            setDb(loadDB());
          }}
        />
      )}

      {phase === 'practice' && (
        <Practice
          key={runId}
          engine={engine}
          poses={queue}
          baseline={baseline}
          demo={demo}
          onDone={onDone}
          onExit={() => setPhase('home')}
        />
      )}

      {phase === 'summary' && (
        <Summary
          results={results}
          onAgain={() => {
            setResults([]);
            setRunId((n) => n + 1);
            setPhase('practice');
          }}
          onHome={() => {
            setPhase('home');
            setDb(loadDB());
          }}
        />
      )}
    </div>
  );
}
