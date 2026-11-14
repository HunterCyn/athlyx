import { useMemo, useState } from 'react';
import { MODE_INFO } from '../lib/game';
import { formatNumber, saveRun } from '../lib/store';
import type { Ghost, RunOutcome } from '../lib/types';
import { useCountUp } from './ui';

type Props = {
  outcome: RunOutcome;
  ghost: Ghost | null;
  onReplay: () => void;
  onHall: () => void;
  onLanding: () => void;
  onSaved: () => void;
};

export function Results({ outcome, ghost, onReplay, onHall, onLanding, onSaved }: Props) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<{ rank: number; isChampion: boolean } | null>(null);
  const score = useCountUp(outcome.score, 1100);

  const banner = useMemo(() => {
    if (outcome.demo) return { text: 'AUTO-DEMO COMPLETE', tone: 'demo' };
    if (outcome.busted) return { text: 'GHOST BUSTED', tone: 'win' };
    if (outcome.ghostScore == null) return { text: 'FIRST RUN — YOU SET THE PACE', tone: 'win' };
    return { text: `THE GHOST SURVIVED BY ${formatNumber(outcome.ghostScore - outcome.score)}`, tone: 'loss' };
  }, [outcome]);

  const delta = outcome.ghostScore != null ? outcome.score - outcome.ghostScore : null;

  const save = () => {
    if (saved) return;
    const res = saveRun(outcome, name);
    setSaved(res);
    onSaved();
  };

  return (
    <div className="screen results-screen">
      <div className={`result-banner ${banner.tone}`}>{banner.text}</div>

      <div className="result-hero">
        <div className={`grade-badge g${outcome.grade}`}>
          <span>{outcome.grade}</span>
          <small>GRADE</small>
        </div>
        <div className="result-main">
          <div className="eyebrow">
            <span>{MODE_INFO[outcome.mode].name}</span>
            <span className="sep">·</span>
            <span>{Math.round(outcome.duration)}s RUN</span>
            {outcome.demo && (
              <>
                <span className="sep">·</span>
                <span>NOT RANKED</span>
              </>
            )}
          </div>
          <div className="result-score">{formatNumber(score)}</div>
          <div className="result-sub">
            {outcome.demo ? (
              <span className="dim">Simulated run · no ghost saved</span>
            ) : delta != null ? (
              <span className={delta >= 0 ? 'good' : 'bad'}>
                {delta >= 0 ? '+' : ''}
                {formatNumber(delta)} vs the ghost
              </span>
            ) : (
              <span className="good">A new ghost has been recorded</span>
            )}
          </div>
        </div>
        <div className="ghost-compare">
          <div className="k">GHOST HELD</div>
          <b>{ghost ? formatNumber(ghost.score) : '—'}</b>
          <span>{ghost ? ghost.name : 'nobody yet'}</span>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="POSES HIT" value={String(outcome.hits)} />
        <Stat label={outcome.mode === 'flow' ? 'FLOW AVERAGE' : 'ACCURACY'} value={`${Math.round((outcome.mode === 'flow' ? outcome.flow : outcome.accuracy) * 100)}%`} />
        <Stat label="BEST COMBO" value={`×${outcome.bestCombo}`} />
        <Stat label="MISSES" value={String(outcome.misses)} />
        <Stat label="GHOST FRAMES" value={String(outcome.frames.length)} />
      </div>

      {!outcome.demo ? (
        <div className="save-block">
          {saved ? (
            <div className="saved-note">
              <b>GHOST SAVED</b>
              <span>
                Rank #{saved.rank}
                {saved.isChampion ? ' · you are the new champion' : ''}. The next player has to beat it.
              </span>
            </div>
          ) : (
            <>
              <label className="save-label" htmlFor="pname">
                NAME YOUR GHOST
              </label>
              <div className="save-form">
                <input
                  id="pname"
                  className="input"
                  value={name}
                  maxLength={14}
                  placeholder="PLAYER ONE"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                  }}
                />
                <button className="btn primary" onClick={save}>
                  SAVE MY GHOST
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="save-block">
          <div className="saved-note demo">
            <b>AUTO-DEMO</b>
            <span>The AI played that one. Step in front of the camera to claim the leaderboard.</span>
          </div>
        </div>
      )}

      <div className="result-actions">
        <button className="btn primary big" onClick={onReplay}>
          RUN IT BACK <span className="arw">↻</span>
        </button>
        <button className="btn ghost" onClick={onHall}>
          HALL OF GHOSTS
        </button>
        <button className="btn ghost" onClick={onLanding}>
          HOME
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
