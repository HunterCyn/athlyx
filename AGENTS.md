# STILL — context for agents

Two apps, one repo, one pose engine:

- `/` → **STILL**, the camera yoga coach. `src/yoga/`, entry `src/main.tsx`.
- `/arcade.html` → **GHOSTMOVE**, the original pose arcade. `src/App.tsx`, entry `src/arcade.tsx`.

Shared engine in `src/lib/`: `vision.ts` (MediaPipe `PoseLandmarker`, local WASM in dev, jsDelivr in prod), `body.ts` (33 landmarks → torso-normalised `Skeleton` / `BodyPose`), `audio.ts` (synthesised tones), `render.ts` (particles).

## Commands

- `npm run dev` — Vite on `:3000`, bound to `0.0.0.0`.
- `npm run build` — `tsc --noEmit && vite build && rm -rf dist/mediapipe`. Both HTML entries are built.
- There is no test runner. The scoring is verified by bundling `src/yoga/poses.ts` plus `checks.ts` with esbuild and asserting the reference sketches score ~100 %. Rebuild that harness before touching `checks.ts` or `poses.ts`.

## Where the product logic lives

- `src/yoga/checks.ts` — every check is an **anatomical measurement** (joint angle, knee-over-ankle stack, stance width, shoulder/hip levelness, torso lean, side bend), normalised by torso length and by the calibrated baseline.
- `src/yoga/poses.ts` — reference sketches in torso units (hip centre `0,0`, shoulder line `-1`) and the per-pose check lists.
- `src/yoga/Yogi.ts` — synthetic practitioner for camera-less demos. `sloppy()` is a start that is wrong for every pose (arms out at waist height); it waits 1.1 s before settling, so a correction is visible before the coach goes quiet.
- `src/yoga/render.ts` — canvas drawing with **object-fit: cover** mapping. The overlay must line up pixel-for-pixel with the video: never inset, letterbox or scale the canvas differently from the `<video>`.
- `src/yoga/voice.ts` — spoken cues via `speechSynthesis` (no key, no network). `unlock()` must be called from a click handler for iOS.
- `src/yoga/store.ts` — `localStorage` key `still.v1`: baseline, sessions, bests.

## Rules that have already bitten

- **Do not** score yoga by position-matching (`scoreShape` in `lib/body.ts`). It hides hip tilt and collapsed knees and punishes longer femurs. That function belongs to the arcade only.
- Every pose's reference sketch must score ≥ 97 % against its own checks and ≥ 95 % mirrored. If a change breaks that, the check is wrong, not the sketch.
- `sideBend` derives its direction from the front knee's **position**, not the joint name — name-based direction scores a mirrored pose as 0.
- The face-on stance is deliberate. Warrior I/II and Side Angle are judged with a wide, front-facing stance because a single camera cannot see heel-to-heel depth. Do not "fix" it by pretending to measure depth; say what is measured.
- `tsconfig` has no `@types/node`, so `vite.config.ts` must not import `node:fs` or `node:path`.
- Deploy cap is 10 MiB: `dist/mediapipe` (28 MB of WASM) is deleted after build and prod loads WASM from jsDelivr. `public/` is 35 MB and must not ship.
- Nothing secret in the bundle. If an LLM is added, it goes through a Worker route with the key in the host's secret store, and the built-in cue strings stay as the offline fallback.

## Deploy

`deploy.manifest.json` → Worker serving `env.ASSETS` from `./dist` with SPA fallback.
Site `9f3a6c2e-8b41-4d7a-9e15-6c4b2f8a1d07`, production `https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page`; arcade at `/arcade`.

## Not verified

There is no webcam in the dev VM. The camera path, calibration from a real body and live per-pose tracking are untested. Only the synthetic path and the scoring maths are.
