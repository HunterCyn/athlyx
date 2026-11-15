# ATHLYX

**The landing screen for return to sport.**

Twenty to forty percent of athletes retear an ACL after passing their return-to-sport tests. Those tests measure how far you hop, not how you land — so a knee that folds inward on every landing can pass cleanly and tear again.

ATHLYX watches the landing. Prop a phone at hip height, drop off a box, land on both feet. It reads 33 landmarks on-device, measures how far each knee collapses toward the midline, and reports both legs against the 90 % reference clinicians use.

**Live:** https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 20+. The pose model is bundled in `public/`, so `npm run dev` works with the wifi off. Camera access needs `localhost` or HTTPS.

> The hosted build serves the model from its own origin but pulls the 28 MB WASM runtime from jsDelivr to stay under the static-upload cap.

---

## The flow

**1. Safety gate.** Five conditions — pregnancy or birth within six weeks, knee or hip surgery in the last three months without clearance, current pain/swelling/instability, heart conditions or dizziness on exertion, a clinician's advice against impact work. Tick any one and it runs a low-impact step-down instead of a jump. Consent is required before the screen starts.

**2. Setup.** Phone at hip height, 2–3 m back, head to feet in frame, operated leg selected.

**3. Three trials.** A countdown, a 3.4 s capture, a bilateral drop landing. Both knees are reported after every trial.

**4. Report.** Per-leg knee angle, knee separation, trunk lean, pelvic drop, the symmetry score against the 90 % reference, a trend across sessions, the pipeline self-test, and a printable layout.

## Accounts

`/app` is the account page. Two roles sign in at the same place:

- **Athletes** run the check-in, see the next date their physiotherapist set, work through the plan that was sent to them, tick exercises off, and keep a history of saved scores.
- **Physiotherapists** link an athlete with the six-character code from the athlete's home screen, set how often the next check-in should happen and leave a note, build a plan from the shared exercise library (or add their own exercise), and read the saved check-ins — score, both knee angles, status and date.

Demo accounts, already linked and holding two check-ins and a three-exercise plan:

```
athlete@athlyx.demo      athlyx-demo
therapist@athlyx.demo    athlyx-demo
```

Passwords are PBKDF2-SHA256 with a per-user salt; sessions are an HttpOnly cookie, stored server-side, good for thirty days. Everything lives in D1 (`users`, `links`, `assignments`, `checkins`, `exercises`, `plans`, `plan_items`) behind `/api`. A physiotherapist can only read an athlete they are linked to.

A saved check-in sends **numbers only** — score, per-leg knee angle, trunk lean, pelvic drop, knee separation, status and trial count. Video never leaves the browser, with or without an account.

## Scoring

| Band | Rule |
| --- | --- |
| Meets target criteria | Symmetry at or above 90 % |
| Borderline | 85 % up to 90 % — inside the noise of one camera, retest |
| Below target criteria | Under 85 % |
| Insufficient data | Fewer than three valid landings |

Fixed thresholds, evaluated in code. No model contributes to a score or a status.

## What this does not do

- **Not the Limb Symmetry Index.** The clinical LSI comes from hop distance or jump height. A single camera measures neither, so this is a frontal-plane symmetry score and the report says so.
- **Not a force measurement.** Ground reaction forces need plates.
- **Not a diagnosis or a clearance.** It is a screen, and the report says to show it to a clinician.
- **Not the full three-test protocol.** The design document specifies a single hop for distance, a two-hop crossover and a single-leg landing. Only the frontal-plane landing measurement is built; hop distance and per-leg landing trials are the next build.

## How the measurement works

- **Torso frame.** Hip centre → shoulder centre = 1 unit, so height and camera distance drop out of every number (`src/lib/body.ts`).
- **Landing detection.** Track ankle height below the hip. The deepest compression is the peak; walking back to the last frame with long legs gives contact. Under 7 % compression is not a landing (`src/rtp/metrics.ts`).
- **Knee angle.** Perpendicular offset of the knee from the hip→ankle line, turned into the angle it subtends over half the leg.
- **Trials.** Median of three, so one bad rep cannot move the result.

## The synthetic athlete

`src/rtp/Athlete.ts` performs a drop landing with a planted knee angle per leg. It is the demo body when there is no camera, and the test rig.

```
planted  4°  measured  3.9°   Δ 0.1°
planted  8°  measured  7.8°   Δ 0.2°
planted 12°  measured 11.7°   Δ 0.3°
planted 18°  measured 17.5°   Δ 0.5°
```

A symmetric landing scores 100, standing still is rejected as "not a landing", and the median ignores an outlier. The report runs this check live.

## The written summary

The report can turn the numbers into one plain-language paragraph. The browser posts only the numbers to `/api/summary`; the edge worker (`site/worker.js`) calls Gemini 3.5 Flash-Lite with the key held server-side, and returns text. The prompt bars diagnosis, force claims and any suggestion of clearance. If the key is missing or the call fails, the numbers still show.

## Layout

```
src/rtp/metrics.ts    geometry, landing detection, symmetry, criteria status
src/rtp/Athlete.ts    synthetic landing + the planted-angle self-test
src/rtp/RtpApp.tsx    gate → setup → trials → report, plus save-to-record
src/rtp/overlay.ts    skeleton overlay (object-fit: cover mapping)
src/rtp/store.ts      sessions in localStorage (rtp.v1)
src/lib/vision.ts     MediaPipe Pose Landmarker (GPU → CPU fallback)
src/lib/body.ts       33 landmarks → torso-normalised body
src/landing/          the public landing page
src/app/              accounts: sign-in, athlete home, physiotherapist home
site/worker.js        static assets, auth + plans + check-ins API, Gemini route
```

## Status

`tsc --noEmit` and the production build pass. The geometry, landing detection and self-test are verified against synthetic landings. **The camera path has not been tested with a real body** — there is no webcam in the development environment — so the first real task is a phone test, then comparison against a physiotherapist's goniometer.
