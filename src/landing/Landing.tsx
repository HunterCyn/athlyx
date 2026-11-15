/**
 * Public landing page. Leads into the real screen at /rtp.
 *
 * Deliberately makes no claim the app cannot back up: no accounts, no
 * therapist portal, no hop distances, no force measurement.
 */
export default function Landing() {
  return (
    <div className="lx">
      <header className="lx-head">
        <div className="lx-wrap lx-head-in">
          <div className="lx-brand">
            <span className="lx-mark">AX</span>
            <span className="lx-brand-text">
              <b>ATHLYX</b>
              <em>movement symmetry check-ins</em>
            </span>
          </div>
          <nav className="lx-nav">
            <a href="#how">How it works</a>
            <a className="lx-btn lx-btn--mint" href="/rtp">
              Start the check-in
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="lx-hero">
          <div className="lx-wrap">
            <span className="lx-kicker">Camera-based movement symmetry</span>
            <h1>Measure both legs on the same camera. Show the numbers that distance alone hides.</h1>
            <p className="lx-lede">
              ATHLYX runs a landing test in the browser with a live camera, measures how far each knee collapses
              on the same landing, and reports both legs against the 90 % reference clinicians use — plus one
              paragraph of plain English from Gemini. No wearables, no force plates, no stored video.
            </p>
            <div className="lx-actions">
              <a className="lx-btn lx-btn--mint" href="/rtp">
                Start the check-in
              </a>
              <a className="lx-btn lx-btn--ghost" href="#how">
                See how it works
              </a>
            </div>
            <p className="lx-note">
              No account, no install. No camera on this machine? Use the demo athlete on the next screen.
            </p>
          </div>
        </section>

        <section className="lx-wrap lx-section">
          <div className="lx-card">
            <h2>What the app measures</h2>
            <table className="lx-table">
              <thead>
                <tr>
                  <th>Marker</th>
                  <th>View</th>
                  <th>Scored</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Peak knee angle</td>
                  <td>front</td>
                  <td>Symmetry score</td>
                </tr>
                <tr>
                  <td>Knee separation</td>
                  <td>front</td>
                  <td className="lx-mute">shown</td>
                </tr>
                <tr>
                  <td>Trunk lean</td>
                  <td>front</td>
                  <td className="lx-mute">shown</td>
                </tr>
                <tr>
                  <td>Pelvic drop</td>
                  <td>front</td>
                  <td className="lx-mute">shown</td>
                </tr>
              </tbody>
            </table>
            <p className="lx-fine">
              One test: a bilateral drop landing. Three scored landings, and the median is reported so one bad rep
              cannot move the result.
            </p>
          </div>

          <div className="lx-callout">
            <b>Not a diagnosis.</b> Monitoring aid only — not a diagnosis and not a return-to-sport clearance.
            Landing mechanics can look normal while strength does not, so this never replaces strength testing,
            psychological readiness assessment or clinical judgement.
          </div>

          <div className="lx-cards">
            <article className="lx-card lx-step">
              <h3>Safety gate</h3>
              <p>
                Five questions first. Pregnancy, recent surgery, current pain or instability, heart conditions, or a
                clinician's advice against impact work route to a low-impact step-down instead.
              </p>
              <span className="lx-chip">five questions</span>
            </article>
            <article className="lx-card lx-step">
              <h3>Three landings</h3>
              <p>
                Step off a low box and land on both feet. Phone at hip height, two to three metres back. The deepest
                compression is the landing, and each knee is read there.
              </p>
              <span className="lx-chip">front view</span>
            </article>
            <article className="lx-card lx-step">
              <h3>The report</h3>
              <p>
                Both legs, the symmetry score against the 90 % reference, a trend across sessions, a printable page,
                and one plain-English explanation of the numbers.
              </p>
              <span className="lx-chip">gemini explanation</span>
            </article>
          </div>

          <div className="lx-card" id="how">
            <h2>How the score works</h2>
            <p className="lx-body">
              The symmetry index expresses one leg as a percentage of the other, where 100 % means they moved
              identically.
            </p>
            <ul className="lx-rows">
              <li>Symmetry: the smaller knee angle divided by the larger × 100.</li>
              <li>Status: 90 % target, 85–90 % borderline band, fixed rules only — never an AI model.</li>
              <li>Median of three valid landings. Standing still is not counted as a landing.</li>
              <li>Gemini explains the numbers. It never produces one.</li>
            </ul>
          </div>

          <div className="lx-card">
            <h2>What it will not do</h2>
            <ul className="lx-rows lx-rows--plain">
              <li>Diagnose an injury or measure healing.</li>
              <li>Clear anyone to return to sport.</li>
              <li>Measure force or shock absorption — that needs force plates.</li>
              <li>Store or upload video. Only measurements are saved, on your device.</li>
              <li>Decide or prescribe exercises. Your clinician does.</li>
              <li>
                Call itself the Limb Symmetry Index. That score comes from hop distance, which one camera cannot
                measure.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="lx-foot">
        <div className="lx-wrap">
          <b>ATHLYX is a monitoring aid.</b> Not a diagnosis and not a return-to-sport clearance. Video is processed
          in your browser and never uploaded; only measurements are stored, and only on this device.
        </div>
      </footer>
    </div>
  );
}
