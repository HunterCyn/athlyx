# PIVOT — context for agents

Three apps, one repo, one pose engine:

- `/` and `/rtp` → **PIVOT**, the return-to-play landing screen. `src/rtp/`, entry `src/rtp/main.tsx`. Both `index.html` and `rtp.html` mount it; keep both so old `/rtp` links survive.
- `/yoga` → **STILL**, the camera yoga coach the project pivoted from. `src/yoga/`, entry `src/main.tsx`, page `yoga.html`.
- `/arcade` → **GHOSTMOVE**, the original pose arcade. `src/App.tsx`, entry `src/arcade.tsx`, page `arcade.html`.

Shared engine in `src/lib/`: `vision.ts` (MediaPipe `PoseLandmarker`, local WASM in dev, jsDelivr in prod), `body.ts` (33 landmarks → torso-normalised `Skeleton` / `BodyPose`), `audio.ts`, `render.ts`.

## Commands

- `npm run dev` — Vite on `:3000`, bound to `0.0.0.0`.
- `npm run build` — `tsc --noEmit && vite build && rm -rf dist/mediapipe`. All four HTML entries are built.
- There is no test runner. Two harnesses have been used and must be rebuilt before changing the maths:
  - **PIVOT:** bundle `src/rtp/metrics.ts` + `Athlete.ts` with esbuild and assert planted knee angles come back within 0.5°, a symmetric landing scores 100, standing is rejected, and the median ignores an outlier. The report screen also runs this live.
  - **STILL:** bundle `src/yoga/poses.ts` + `checks.ts` and assert reference sketches score ~100 %, mirrored ~100 %.

## PIVOT — the primary product

- `src/rtp/metrics.ts` — `kneeValgus` (signed frontal-plane angle from the knee's offset to the hip→ankle line), `kneeSeparation`, `trunkLean`, `pelvicDrop`, `legExtension`, `detectLanding`, `symmetry`, `combineTrials`, `verdict`.
- `src/rtp/Athlete.ts` — synthetic drop landing with a **planted** valgus angle per leg (`bodyAt`, `syntheticFrames`, `selfTest`). Demo body and test rig in one.
- `src/rtp/RtpApp.tsx` — gate → setup → three trials → report.

### Rules that have already bitten

- **`legExtension` has no negation.** Ankles are *below* the hip, so `(la.y + ra.y) / 2` is already positive. A minus sign there makes every reading negative and no landing is ever detected.
- **The synthetic neutral knee must sit on the hip→ankle line.** Any lateral offset at fold 0 becomes a systematic bias in every reading. `kneeBase = (0.22 + stance) / 2` is what keeps it exact.
- **Valgus must scale with compression, not with a separate curve.** A synthetic that peaks its angle before maximum fold measures zero at the frame the detector picks.
- **Do not call the symmetry number the Limb Symmetry Index.** The clinical LSI is hop distance or jump height. It is a frontal-plane symmetry index; the 90 % line is a reference, not a pass mark.
- **No force claims.** Landing "shock absorption" is kinematics (knee flexion excursion), never force — that needs plates.
- **The safety gate is not optional and not a modal.** Pregnancy, recent surgery, current pain/instability, heart conditions and clinical advice against impact work route to a low-impact step-down. Consent gates the start button.
- 2D frontal-plane measures are validated for **landing**, not for the single-leg squat. Do not "improve" the screen by swapping the task.

## STILL — the yoga prototype

- Every check is an anatomical measurement, normalised by torso length and a calibrated baseline. **Do not** score yoga by position-matching (`scoreShape` in `lib/body.ts`) — it hides hip tilt and collapsed knees and punishes longer femurs.
- Reference sketches must score ≥ 97 % against their own checks and ≥ 95 % mirrored.
- `sideBend` takes its direction from the front knee's **position**, not the joint name.
- The face-on stance is deliberate: one camera cannot see heel-to-heel depth.
- `src/yoga/render.ts` maps through **object-fit: cover**; the overlay must line up pixel-for-pixel with the video.

## Deploy

`deploy.manifest.json` → Worker serving `env.ASSETS` from `./dist` with SPA fallback. Cloudflare serves `.html` entries at the clean path (`/rtp`, not `/rtp.html`, which 307s).
Site `9f3a6c2e-8b41-4d7a-9e15-6c4b2f8a1d07`, production `https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page`.

- Deploy cap is 10 MiB: `dist/mediapipe` (28 MB of WASM) is deleted after build and prod loads WASM from jsDelivr. `public/` is 35 MB and must not ship.
- `tsconfig` has no `@types/node`, so `vite.config.ts` must not import `node:fs` or `node:path`.
- Nothing secret in the bundle.

## Not verified

There is no webcam in the dev VM. The camera path, calibration from a real body and live tracking are untested for **both** apps; only the synthetic path and the maths are. Do not describe PIVOT as validated with athletes.
