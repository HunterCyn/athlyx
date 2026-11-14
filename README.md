# PIVOT

**The landing screen for return to sport.**

Twenty to forty percent of athletes retear an ACL after they have passed the return-to-sport tests. Those tests measure how far you hop, not how you land — so a knee that folds inward on every landing can pass cleanly and then tear again.

PIVOT watches you land. Prop a phone at hip height, drop off a box, and it reads 33 body landmarks on-device and measures how far each knee collapses toward the midline, how close your knees stay, how far your trunk tips and whether one hip drops. Three trials, a symmetry index against the 90% reference, and a report you can take to a physiotherapist.

**Live:** https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 20+. The pose model (~5.6 MB) and the MediaPipe WASM runtime are bundled in `public/`, so `npm run dev` works with the venue wifi off. Camera access needs `localhost` or HTTPS.

> The hosted build serves the model from its own origin but pulls the 28 MB WASM runtime from jsDelivr to stay under the static-upload cap. For a fully offline demo, run it locally.

---

## The screen

**1. Safety gate.** Five conditions — pregnancy or birth within six weeks, knee or hip surgery in the last three months (or no surgeon clearance), current pain/swelling/instability, heart conditions or dizziness on exertion, a clinician's advice against impact work. Tick any one and it will not run an impact test; it routes to a low-impact step-down instead. Consent is required before the start button enables.

**2. Setup.** Phone at hip height, 2–3 m back, head to feet in frame.

**3. Three trials.** A countdown, a 3.4 s capture, a bilateral drop landing. It reports both knees after every trial, so a bad rep is obvious before you commit it.

**4. Report.** Per-leg peak knee angle, knee separation, trunk lean, pelvic drop, the symmetry index against the 90% clinical reference, a trend across sessions, and the pipeline self-test. Printable.

---

## What is measured

| Metric | What it is | Why |
| --- | --- | --- |
| **Peak knee angle** | Per leg: how far the knee sits toward the midline of the hip→ankle line at maximum compression, in degrees | Frontal-plane knee collapse is the visible risk posture |
| **Knee separation** | Knee-to-knee distance ÷ ankle-to-ankle distance | Knees collapsing together reads below ~0.6 |
| **Trunk lean** | Torso away from vertical at peak | Compensation pattern above the knee |
| **Pelvic drop** | One hip lower than the other at peak | Hip control on the landing side |
| **Symmetry index** | Smaller magnitude ÷ larger, as a percentage, on the knee angle | The 90% line clinicians use, on our own measure |

## What it deliberately does not measure

**It is not the Limb Symmetry Index.** The clinical LSI comes from hop distance or jump height; a single camera does not measure either, so the number here is a frontal-plane symmetry index and the report says so.

**It is not a force measurement.** Ground reaction forces need plates. We measure joint geometry and call it geometry.

**It is not a diagnosis.** It is a screen. Pain, instability and a recent reconstruction are a conversation with a clinician.

**Depth.** One camera cannot see the sagittal plane head-on, so sagittal knee flexion needs a second, side-on view — that is the next addition, not a claim.

---

## How the measurement works

- **Torso frame.** Hip centre → shoulder centre = 1 unit, so height and distance from the camera drop out of every number (`src/lib/body.ts`).
- **Landing detection.** Track ankle height below the hip over the capture. The deepest compression is the peak; walking backwards to the last frame with long legs gives contact. Under 7% compression is not a landing and scores nothing (`src/rtp/metrics.ts`).
- **Knee angle.** Perpendicular offset of the knee from the hip→ankle line, converted into the angle it subtends over half the leg. That is the 2D frontal-plane projection computed from landmarks rather than by eye.
- **Trials.** The median of three trials per leg, so one bad rep cannot move the result.

Why landing and not the single-leg squat: 2D frontal-plane angles agree well with 3D motion capture during **landing**, but barely correlate during a single-leg squat. The task was chosen to match the evidence.

## The synthetic athlete

`src/rtp/Athlete.ts` performs a drop landing and can be given a known valgus angle per leg. It does two jobs: it is the demo body when there is no camera, and it is the test rig.

The pipeline is checked by planting a knee angle and asserting the same detection and measurement code recovers it:

```
planted  4°  measured  3.9°   Δ 0.1°
planted  8°  measured  7.8°   Δ 0.2°
planted 12°  measured 11.7°   Δ 0.3°
planted 18°  measured 17.5°   Δ 0.5°
```

A symmetric landing scores exactly 100, standing still is rejected as "not a landing", and the median ignores an outlier trial. The report screen runs this check live, so the claim is reproducible rather than asserted.

---

## Project layout

```
src/rtp/metrics.ts    frontal-plane geometry, landing detection, symmetry, verdicts
src/rtp/Athlete.ts    synthetic drop landing + the planted-angle self-test
src/rtp/RtpApp.tsx    gate → setup → three trials → report
src/rtp/store.ts      sessions in localStorage (key rtp.v1)
src/lib/vision.ts     MediaPipe Pose Landmarker (GPU → CPU fallback)
src/lib/body.ts       33 landmarks → torso-normalised body frame
```

## The rest of the repo

- `/yoga` — **STILL**, the camera yoga coach this pivoted from: four poses, per-person calibration, spoken cues. `src/yoga/`.
- `/arcade` — **GHOSTMOVE**, the original pose arcade. `src/App.tsx`.

## Status

`tsc --noEmit` and the production build pass. The geometry, landing detection and self-test are verified against synthetic landings. **The camera path has not been tested against a real body** — there is no webcam in the development environment — so the first real task is a phone test, then validation against a physiotherapist's goniometer.

---

Built with MediaPipe Pose · React · TypeScript · Vite · Canvas2D. No install, no account, no upload.
