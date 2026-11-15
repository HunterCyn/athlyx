# ATHLYX — project brief for an AI assistant

Paste this first, then attach the repo. It describes what is actually built, not what is planned.

## What this is

ATHLYX is a browser app that measures how symmetrically a recovering athlete lands. The athlete answers five safety questions, props a phone at hip height, and lands from a low box three times. A 2D pose model runs in the page; the app measures each knee's inward angle at the moment of landing and reports both legs against the 90 % reference clinicians use, plus a plain-English explanation of the numbers.

It is a movement screen. **It does not diagnose, does not measure healing and is not a return-to-sport clearance.** It also does not measure force: that needs force plates.

One app, one page, one job. An earlier yoga coach and a pose arcade lived in this repo and were deleted; do not restore them.

## Hard rules — do not violate these when changing the code

1. **No AI in the scoring path.** Every number, status and trend comes from pure functions in `src/rtp/metrics.ts`. Gemini may only explain numbers that already exist. It can never produce or edit a score.
2. **Video never leaves the device.** Pose tracking runs in the browser. Only numbers are kept, in `localStorage` under `rtp.v1`. The only network call the app makes for the summary carries numbers, never an image.
3. **Status comes from fixed bands**, never from a model:
   - **Meets target criteria:** ≥ 90 %.
   - **Borderline:** 85 % up to 90 %.
   - **Below target criteria:** < 85 %.
   - **Insufficient data:** fewer than three valid landings, whatever the number says.
4. **Do not call the headline number the Limb Symmetry Index.** The clinical LSI comes from hop distance or jump height. This is a frontal-plane symmetry score built from landing geometry, and the report says so on the same screen.
5. **The safety gate is not a modal and not optional.** Pregnancy, surgery in the last three months without clearance, current pain or instability, heart conditions, or a clinician's advice against impact work route to a low-impact step-down. Consent gates the start button.
6. **Language:** never imply diagnosis, healing progress, readiness or clearance. Never estimate force or shock absorption.
7. **The Gemini key lives in the host's secret store** (`GEMINI_API_KEY` on the edge worker). Never in client code, never in a committed env file, never in the bundle.

## The test that exists

| Test | Athlete does | Camera | Measured |
| --- | --- | --- | --- |
| Bilateral drop landing | steps off a low box, lands on both feet, sinks | front, hip height, 2–3 m | per-leg peak knee valgus, knee separation, trunk lean, pelvic drop, symmetry index |

Three scored trials. A capture window of 3.4 s per trial. The median across trials is used, so one bad rep cannot move the result.

## Not built (the protocol document asks for these)

- Single hop for distance (side view, toe-to-heel, LSI on distance).
- Two-hop crossover hop (side view, total distance).
- Single-leg landing trials per leg, which the landing-quality formula requires.
- The 0.70 valgus / 0.30 trunk landing-quality score, because it compares operated against healthy and the current test measures both legs in one frame with a single trunk value.
- Accounts, SQLite, therapist views, skeleton replay, notes, exercise plans, schedules, export.

Do not describe any of the above as existing.

## Scoring

- **Knee valgus:** perpendicular offset of the knee from the hip→ankle line, converted into the angle it subtends over half the leg. Positive means the knee drifted toward the midline.
- **Symmetry index:** smaller magnitude ÷ larger, as a percentage, on the per-leg knee angle. 100 means identical.
- **Landing detection:** track ankle height below the hip over the capture; the deepest compression is the peak; walk back to the last frame with long legs for contact. Under 7 % compression is not a landing and scores nothing.
- **Trials:** median of three per leg (`combineTrials`).

## Trial validity

A trial counts only when the landing is detected. Standing still, a shuffle, or a capture where the legs never compress is rejected. There is no frame-rate gate yet; that is a gap.

## Architecture

```
index.html, rtp.html        both mount the app (old /rtp links must keep working)
src/rtp/
  main.tsx                  entry
  RtpApp.tsx                gate → setup → three trials → report, plus the AiRead card
  metrics.ts                geometry, landing detection, symmetry, status bands
  Athlete.ts                synthetic drop landing + the planted-angle self-test
  overlay.ts                canvas skeleton (object-fit: cover mapping)
  store.ts                  sessions in localStorage (rtp.v1)
  rtp.css, base.css         styles (r- prefix)
src/lib/
  vision.ts                 MediaPipe Pose Landmarker, camera, GPU → CPU fallback
  body.ts                   33 landmarks → torso-normalised body frame
site/worker.js              serves dist/ and hosts POST /api/summary → Gemini
```

Frontend: Vite 7, React 19, TypeScript, `@mediapipe/tasks-vision`, Canvas2D. No router, no state library.
Backend: one Cloudflare Worker. Static assets plus a single route.

## API

| Method + path | Purpose |
| --- | --- |
| `POST /api/summary` | numbers in, one paragraph out. 503 `not_configured` without a key, 405 on GET, 403 on a foreign `Origin`, 429 past 8 requests/minute per IP |

Model: `gemini-3.5-flash-lite` by default, `gemini-3.8-flash` as fallback, 9 s ceiling per call. The system prompt forbids diagnosis, force claims, clearance language, and jargon.

## Measurement pipeline

- MediaPipe Pose Landmarker, VIDEO mode, one pose. Model served same-origin from `public/models`; the 28 MB WASM runtime comes from jsDelivr in production to stay under the 10 MiB upload cap.
- Hip centre → shoulder centre = 1 torso unit, so height and camera distance drop out of every number.
- The overlay must map through `object-fit: cover`, or the skeleton drifts off the body.

## Current state

Verified: `tsc --noEmit` and the production build; the measurement pipeline against a synthetic athlete (planted 4°, 8°, 12°, 18° recovered within 0.5°); a symmetric landing scores 100; standing is rejected; the median ignores an outlier; the deployed site serves `/` and `/rtp`; `POST /api/summary` returns a real paragraph in about 1 s.

Not verified: **the camera path has never run against a real body.** There is no webcam in the development environment. The UI has not been clicked through end to end in a browser, and no mobile browser has been tested.

## Running it

```
npm ci
npm run dev            # http://localhost:3000 (camera needs localhost or HTTPS)
npm run build          # tsc --noEmit && vite build && rm -rf dist/mediapipe
```

The dev server proxies `/api` to the deployed origin with the `Origin` header rewritten, so the summary card works on localhost. `node_modules` does not survive environment restarts: run `npm ci` first.

Deploy: `deploy.manifest.json` → Worker `site/worker.js`, assets `./dist`, SPA fallback.

## Gaps a future change might address, in order of value

1. Per-leg single-leg landing trials, which unlocks the operated-versus-healthy score.
2. Frame-rate and tracking-quality gates on trial validity.
3. Hop tests with distance measurement (needs a calibrated scale; centimetres are estimates).
4. Accounts and a therapist view, which is where the clinical value actually compounds.
5. Tape-measure validation of any distance estimate, and a real-body camera test before anything else.

## The one thing to keep

The report runs its own pipeline self-test — a synthetic athlete with a known knee angle is measured live, on screen. If a change breaks the maths, that table breaks with it. Keep it.
