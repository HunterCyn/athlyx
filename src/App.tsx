import { useEffect, useRef, useState } from 'react';
import { Hall } from './components/Hall';
import { Landing } from './components/Landing';
import { Play } from './components/Play';
import { Results } from './components/Results';
import { Setup } from './components/Setup';
import { sfx } from './lib/audio';
import { champion, clearDB, loadDB, type DB } from './lib/store';
import type { Ghost, Mode, RunOutcome } from './lib/types';
import { PoseEngine } from './lib/vision';

type Screen = 'landing' | 'hall' | 'setup' | 'play' | 'results';

export default function App() {
  const engineRef = useRef<PoseEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PoseEngine();
  const engine = engineRef.current;

  const [screen, setScreen] = useState<Screen>('landing');
  const [mode, setMode] = useState<Mode>('rush');
  const [db, setDb] = useState<DB>(() => loadDB());
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [demo, setDemo] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    sfx.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (screen === 'landing' || screen === 'hall' || screen === 'results') engine.stopCamera();
  }, [screen, engine]);

  const enter = () => {
    sfx.unlock();
    setScreen('setup');
  };

  const start = (m: Mode) => {
    sfx.unlock();
    setMode(m);
    setGhost(champion(m));
    setDemo(false);
    setOutcome(null);
    setScreen('play');
  };

  const autoDemo = () => {
    sfx.unlock();
    const m: Mode = 'rush';
    setMode(m);
    setGhost(champion(m));
    setDemo(true);
    setOutcome(null);
    setScreen('play');
  };

  const finish = (o: RunOutcome) => {
    setOutcome(o);
    setDb(loadDB());
    setScreen('results');
  };

  const toggleMute = () => setMuted((m) => !m);

  return (
    <div className="app">
      <div className="bg-layers" aria-hidden="true" />

      {screen === 'landing' && (
        <Landing
          db={db}
          muted={muted}
          onMute={toggleMute}
          onEnter={enter}
          onAuto={autoDemo}
          onHall={() => setScreen('hall')}
        />
      )}

      {screen === 'setup' && (
        <Setup
          engine={engine}
          db={db}
          muted={muted}
          onMute={toggleMute}
          onStart={start}
          onAuto={autoDemo}
          onBack={() => setScreen('landing')}
        />
      )}

      {screen === 'play' && (
        <Play engine={engine} mode={mode} ghost={ghost} demo={demo} onFinish={finish} onQuit={() => setScreen('landing')} />
      )}

      {screen === 'results' && outcome && (
        <Results
          outcome={outcome}
          ghost={ghost}
          onReplay={() => setScreen('setup')}
          onHall={() => setScreen('hall')}
          onLanding={() => setScreen('landing')}
          onSaved={() => setDb(loadDB())}
        />
      )}

      {screen === 'hall' && (
        <Hall
          db={db}
          muted={muted}
          onMute={toggleMute}
          onBack={() => setScreen('landing')}
          onPlay={enter}
          onReset={() => {
            clearDB();
            setDb(loadDB());
          }}
        />
      )}
    </div>
  );
}
