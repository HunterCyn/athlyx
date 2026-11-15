# ATHLYX — context for agents

One app, one page, one point: measure how a recovering athlete lands.

- `/` and `/rtp` → **ATHLYX**, the landing screen. `src/rtp/`, entry `src/rtp/main.tsx`. Both `index.html` and `rtp.html` mount it so old `/rtp` links keep working.
- `site/worker.js` → serves `dist/` and hosts `POST /api/summary`, the only route that talks to Gemini.

The yoga coach and the pose arcade that this project grew out of have been removed. Do not reintroduce them.

## Commands

- `npm run dev` — Vite on `:3000`, bound to `0.0.0.0`.
- `npm run build` — `tsc --noEmit && vite build && rm -rf dist/mediapipe`.
- No test runner. The measurement pipeline is verified by bundling `src/rtp/metrics.ts` + `Athlete.ts` with esbuild and asserting that planted knee angles come back within 0.5°, that a symmetric landing scores 100, that standing is rejected, and that the median ignores an outlier. The report screen also runs this live. Rebuild the harness before touching `metrics.ts` or `Athlete.ts`.

## Where the product logic lives

- `src/rtp/metrics.ts` — `kneeValgus`, `kneeSeparation`, `trunkLean`, `pelvicDrop`, `legExtension`, `detectLanding`, `symmetry`, `median`, `measureTrial`, `symmetryIndex`, `verdict`, `combineTrials`.
- `src/rtp/Athlete.ts` — synthetic drop landing with a **planted** valgus angle per leg; demo body and test rig in one.
- `src/rtp/RtpApp.tsx` — gate → setup → three trials → report, plus the `AiRead` card.
- `src/rtp/overlay.ts` — skeleton drawing. Must map through **object-fit: cover**, or the skeleton drifts off the body.

## Rules that have already bitten

- **`legExtension` has no negation.** Ankles are below the hip, so `(la.y + ra.y) / 2` is already positive. A minus sign makes every reading negative and no landing is ever detected.
- **The synthetic neutral knee must sit on the hip→ankle line** (`kneeBase = (0.22 + stance) / 2`). Any lateral offset at fold 0 becomes a systematic bias.
- **Valgus must scale with compression**, not with its own curve, or the angle peaks before the frame the detector picks.
- **Do not call the symmetry number the Limb Symmetry Index.** LSI requires hop distance or jump height. The report says this on the same screen.
- **No force claims.** Landing "shock absorption" is kinematics; force needs plates.
- **Status bands are fixed**: ≥90 meets, 85–90 borderline, <85 below, and fewer than three valid trials is insufficient data. Never let a model produce or alter a status.
- **The safety gate is not a modal and not optional.** Pregnancy, recent surgery, pain, heart conditions and clinical advice against impact work route to a low-impact step-down; consent gates the start.
- 2D frontal-plane measures are validated for **landing**, not for the single-leg squat. Do not swap the task to look more clinical.
- The Gemini key lives in the host's secret store. Never put it in the bundle, an env file committed to the repo, or client code.

## Deploy

`deploy.manifest.json` → Worker serving `env.ASSETS` from `./dist` with SPA fallback, plus `./site/worker.js`.
Site `9f3a6c2e-8b41-4d7a-9e15-6c4b2f8a1d07`, production `https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page`.

- Deploy cap is 10 MiB: `dist/mediapipe` (28 MB of WASM) is deleted after build and prod loads WASM from jsDelivr. `public/` is 35 MB and must not ship.
- `tsconfig` has no `@types/node`, so `vite.config.ts` must not import `node:fs` or `node:path`.
- `node_modules` does not survive environment restarts: run `npm ci` before `tsc` or `build`.

## Not verified

There is no webcam in the dev VM. The camera path, calibration from a real body and live tracking are untested; only the synthetic path and the maths are. Do not describe ATHLYX as validated with athletes.
