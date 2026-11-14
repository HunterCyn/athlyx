import { useMemo, useState } from 'react';
import { MODE_INFO } from '../lib/game';
import { formatNumber, timeAgo, type DB } from '../lib/store';
import type { Mode } from '../lib/types';
import { GhostPreview } from './GhostPreview';
import { Brand, SoundToggle } from './ui';

type Props = {
  db: DB;
  muted: boolean;
  onMute: () => void;
  onBack: () => void;
  onPlay: () => void;
  onReset: () => void;
};

type Tab = 'all' | Mode;

export function Hall({ db, muted, onMute, onBack, onPlay, onReset }: Props) {
  const [tab, setTab] = useState<Tab>('all');

  const rows = useMemo(() => {
    return [...db.rows]
      .filter((r) => tab === 'all' || r.mode === tab)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [db, tab]);

  const champ = tab === 'all' ? (db.ghosts.rush ?? db.ghosts.flow ?? null) : (db.ghosts[tab] ?? null);

  const reset = () => {
    if (window.confirm('Wipe every ghost and score on this machine? This cannot be undone.')) onReset();
  };

  return (
    <div className="screen hall-screen">
      <header className="topbar">
        <Brand compact />
        <div className="topbar-right">
          <SoundToggle muted={muted} onToggle={onMute} />
          <button className="btn ghost small" onClick={onBack}>
            ← BACK
          </button>
        </div>
      </header>

      <div className="hall-grid">
        <div className="hall-left">
          <div className="eyebrow">
            <span>THE HAUNTED BOARD</span>
          </div>
          <h2 className="h2">
            HALL OF <span className="grad">GHOSTS</span>
          </h2>
          <p className="muted-line">Every score here left a skeleton behind. The top one plays back in the arena.</p>

          <div className="tabs">
            {(['all', 'rush', 'flow'] as Tab[]).map((t) => (
              <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {t === 'all' ? 'ALL' : MODE_INFO[t].name}
              </button>
            ))}
          </div>

          <div className="hall-list">
            {rows.length === 0 && <div className="empty">NO GHOSTS HERE YET. GO MAKE ONE.</div>}
            {rows.map((r, i) => (
              <div className={`hall-row${i === 0 ? ' top' : ''}`} key={r.id}>
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="name">{r.name}</span>
                <span className="mode">{r.mode === 'rush' ? 'RUSH' : 'FLOW'}</span>
                <span className="grade">{r.grade}</span>
                <span className="score">{formatNumber(r.score)}</span>
                <span className="when">{timeAgo(r.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="hall-right">
          <div className="champ-card hall">
            <div className="champ-head">
              <span className="k">REIGNING GHOST</span>
              <span className="champ-mode">{champ ? MODE_INFO[champ.mode].name : 'VACANT'}</span>
            </div>
            <GhostPreview ghost={champ} className="big" />
            {champ ? (
              <>
                <div className="champ-name">{champ.name}</div>
                <div className="champ-score">
                  {formatNumber(champ.score)}
                  <span>pts</span>
                </div>
                <div className="champ-sub">RECORDED {timeAgo(champ.date).toUpperCase()}</div>
              </>
            ) : (
              <>
                <div className="champ-name dim">VACANT</div>
                <div className="champ-score placeholder">— — —</div>
                <div className="champ-sub">BE THE FIRST GHOST</div>
              </>
            )}
            <button className="btn primary wide" onClick={onPlay}>
              CHALLENGE IT <span className="arw">→</span>
            </button>
            <button className="text-link danger" onClick={reset}>
              reset this booth
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
