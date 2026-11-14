import { MODE_INFO } from '../lib/game';
import { formatNumber, timeAgo, type DB } from '../lib/store';
import { GhostPreview } from './GhostPreview';
import { Brand, SoundToggle } from './ui';

type Props = {
  db: DB;
  muted: boolean;
  onMute: () => void;
  onEnter: () => void;
  onAuto: () => void;
  onHall: () => void;
};

export function Landing({ db, muted, onMute, onEnter, onAuto, onHall }: Props) {
  const champ = db.ghosts.rush ?? db.ghosts.flow ?? null;
  const rows = [...db.rows].sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <div className="screen landing-screen">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="live-pill">
            <i /> ON-DEVICE AI
          </span>
          <SoundToggle muted={muted} onToggle={onMute} />
          <button className="btn ghost small" onClick={onHall}>
            HALL OF GHOSTS
          </button>
        </div>
      </header>

      <main className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>CAMERA AI</span>
            <span className="sep">·</span>
            <span>POSE ARENA</span>
            <span className="sep">·</span>
            <span>NO CONTROLLER</span>
          </div>
          <h1 className="display">
            YOUR BODY
            <br />
            <span className="grad">IS THE CONTROLLER</span>
          </h1>
          <p className="lede">
            GHOSTMOVE turns any webcam into an arcade cabinet. Strike the pose, hold it, chain the combo — then race the
            glowing ghost of whoever is on top. Every run you leave behind haunts the next player.
          </p>
          <div className="cta-row">
            <button className="btn primary big" onClick={onEnter}>
              ENTER THE ARENA <span className="arw">→</span>
            </button>
            <button className="btn ghost" onClick={onAuto}>
              ▶ WATCH AUTO-DEMO
            </button>
          </div>
          <div className="stat-row">
            <div>
              <b>100%</b>
              <span>ON-DEVICE</span>
            </div>
            <div>
              <b>33</b>
              <span>JOINTS / FRAME</span>
            </div>
            <div>
              <b>0</b>
              <span>UPLOADS</span>
            </div>
            <div>
              <b>ANY</b>
              <span>BODY, ANY SIZE</span>
            </div>
          </div>
        </div>

        <aside className="hero-side">
          <div className="champ-card">
            <div className="champ-head">
              <span className="k">HALL OF GHOSTS</span>
              <span className="champ-mode">{champ ? MODE_INFO[champ.mode].name : 'VACANT'}</span>
            </div>
            <GhostPreview ghost={champ} />
            {champ ? (
              <>
                <div className="champ-name">{champ.name}</div>
                <div className="champ-score">
                  {formatNumber(champ.score)}
                  <span>pts</span>
                </div>
                <div className="champ-sub">GHOST RECORDED {timeAgo(champ.date).toUpperCase()} · BEAT IT</div>
              </>
            ) : (
              <>
                <div className="champ-name dim">NO GHOST YET</div>
                <div className="champ-score placeholder">— — —</div>
                <div className="champ-sub">THE FIRST RUN INHABITS THIS SLOT FOREVER</div>
              </>
            )}
          </div>

          {rows.length > 0 && (
            <div className="mini-board">
              {rows.map((r, i) => (
                <div className="mini-row" key={r.id}>
                  <span className="mini-rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mini-name">{r.name}</span>
                  <span className="mini-mode">{r.mode === 'rush' ? 'RUSH' : 'FLOW'}</span>
                  <span className="mini-score">{formatNumber(r.score)}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </main>

      <section className="feature-strip">
        <div className="feat">
          <b>GHOST RACING</b>
          <span>Your best run is replayed as a live skeleton that shadows you in real time.</span>
        </div>
        <div className="feat">
          <b>ANY BODY</b>
          <span>Poses normalise to torso length, so a kid can outscore a bodybuilder.</span>
        </div>
        <div className="feat">
          <b>PRIVATE BY DESIGN</b>
          <span>The model runs inside the tab. No video, no frames, no data leaves the machine.</span>
        </div>
      </section>

      <footer className="foot-note">MEDIAPIPE POSE · WEBGL · WEB AUDIO · ZERO CLOUD</footer>
    </div>
  );
}
