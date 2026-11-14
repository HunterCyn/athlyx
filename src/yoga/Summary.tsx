import { useMemo } from 'react';
import type { PoseResult } from './store';

type Props = {
  results: PoseResult[];
  onAgain: () => void;
  onHome: () => void;
};

export function Summary({ results, onAgain, onHome }: Props) {
  const overall = useMemo(
    () => (results.length ? results.reduce((a, r) => a + r.alignment, 0) / results.length : 0),
    [results],
  );

  const insight = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const r of results) for (const c of r.cues) tally[c] = (tally[c] ?? 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (!top) return 'No corrections logged — that was a clean session.';
    return `Most frequent correction: ${top[0].toLowerCase()}.`;
  }, [results]);

  const weakest = useMemo(() => [...results].sort((a, b) => a.alignment - b.alignment)[0], [results]);

  return (
    <div className="y-screen y-summary">
      <header className="y-top">
        <span className="y-wordmark">ATHLYX</span>
        <span className="y-tag">SESSION COMPLETE</span>
        <span />
      </header>

      <div className="y-sum-card">
        <div className="y-kicker">ALIGNMENT ACROSS THE FLOW</div>
        <div className="y-sum-big">
          {Math.round(overall * 100)}
          <span>%</span>
        </div>
        <p className="y-sum-line">
          {overall > 0.85
            ? 'Steady, stacked and quiet. That is what the shapes are for.'
            : overall > 0.7
              ? 'Strong practice. One or two places to keep working.'
              : 'A real start. Come back tomorrow and the same shapes will feel different.'}
        </p>

        <ul className="y-sum-list">
          {results.map((r) => (
            <li key={r.id}>
              <span className="n">{r.name}</span>
              <span className="t">{Math.round(r.seconds)}s</span>
              <span className="b">
                <i style={{ width: `${Math.round(r.alignment * 100)}%` }} />
              </span>
              <span className="p">{Math.round(r.alignment * 100)}%</span>
            </li>
          ))}
        </ul>

        <div className="y-sum-note">
          <b>COACH NOTES</b>
          <span>{insight}</span>
          {weakest && results.length > 1 && weakest.alignment < 0.9 && (
            <span>
              Focus next time: <strong>{weakest.name}</strong> at {Math.round(weakest.alignment * 100)}%.
            </span>
          )}
        </div>

        <div className="y-actions">
          <button className="y-btn primary" onClick={onAgain}>
            PRACTISE AGAIN
          </button>
          <button className="y-btn ghost" onClick={onHome}>
            HOME
          </button>
        </div>
      </div>
    </div>
  );
}
