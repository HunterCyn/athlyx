# GHOSTMOVE

**Your body is the controller. Your best run comes back to haunt you.**

A camera-AI arcade that runs entirely in the browser tab. No controller, no cloud, no install. You step in front of a webcam, the AI reads 33 body joints at 30 fps, and you strike poses against the clock. Every run you finish records a glowing **ghost** of your skeleton — and the next player has to outrun it, live, on the same screen.

```bash
npm install
npm run dev      # http://localhost:3000
```

**Live:** https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page — open it on a laptop with a webcam and allow camera access.

Requires Node 20+. The pose model (~5.6 MB) and MediaPipe WASM are bundled in `public/`, so **`npm run dev` works with venue wifi switched off**. Camera access needs `localhost` or HTTPS.

> The hosted build serves the model from its own origin but pulls the 28 MB MediaPipe WASM runtime from jsDelivr to stay under the static-upload cap. For a fully offline booth, run it locally with `npm run dev`.

---

## The 20-second pitch

> Every pose game gives you a list of buttons. GHOSTMOVE gives you a mirror.
>
> We track your body on-device, score how closely you hit a hologram, and when the round ends we *keep you* — your movement becomes a ghost that shadows the next player in real time. Beat it and the ghost shatters. Lose and you become the thing everybody is trying to kill.

---

## Two ways to play

| Mode | Length | What it is |
| --- | --- | --- |
| **POSE RUSH** | 60s | A hologram appears. Copy it, hold it, chain the combo. 12 distinct moves, timing tightens as you go. |
| **FLOW STATE** | 30s | No targets. The AI judges breadth, smoothness and left/right balance while you freestyle. |

Score in RUSH comes from accuracy × combo multiplier. FLOW pays for big, smooth, symmetric movement — and pays **zero** for standing still.

---

## What makes it different

**1. Ghost racing.** The champion's run is stored as 12 Hz skeleton frames and replayed in the arena as a translucent figure that moves exactly when they did. A live race bar shows you versus their score *at this second*, and passing their final score triggers **GHOST BUSTED** mid-run.

**2. Any body, any size.** Every joint is normalised into a torso-length body frame (hip centre → shoulder centre = 1). A tall adult, a short adult and a kid all produce identical numbers for the same pose, so one leaderboard is actually fair. The hologram is drawn at *your* hip position and *your* torso scale, so it always lands on your body.

**3. Adaptive handedness.** Each target is authored once, then mirrored at spawn to whichever side you are already closer to. Left-handed players never have to fight the ghost.

**4. Adaptive difficulty.** Tolerance tightens, hold time shrinks and the clock shortens as your hit count climbs — the first pose is welcoming, the fifteenth is not.

**5. Nothing leaves the machine.** MediaPipe Pose Landmarker runs in the tab via WASM + WebGL. No frames are uploaded, no API keys, no server. You can pull the ethernet cable out mid-round.

---

## Demo script for the booth (~90 seconds)

1. **Landing page up, ghost playing in the hall card.** "This is the ghost of whoever scored highest today. It's not a video — it's their actual skeleton."
2. **ENTER THE ARENA.** Step back until the checklist goes green. Point out the live tracking and that the model is local.
3. **POSE RUSH.** Hit the first two poses slowly and narrate: match %, hold ring, multiplier.
4. **Hand the machine to a judge/visitor.** The ghost of your run is already on screen racing them. This is the moment.
5. **Show the results card** — grade, combo, accuracy, ghost frames — then **HALL OF GHOSTS** so they can see their name on the board.
6. If the camera dies or the room is too dark: **WATCH AUTO-DEMO** runs the whole game without a webcam.

---

## Under the hood

```
src/lib/body.ts     landmark → torso-normalised body frame, weighted pose scoring
src/lib/poses.ts    12-move library authored as wrist/ankle targets, solved with 2-bone IK
src/lib/game.ts     Run engine: POSE RUSH + FLOW STATE, difficulty curve, ghost race
src/lib/vision.ts   MediaPipe Pose Landmarker wrapper (GPU→CPU fallback) + auto-demo performer
src/lib/render.ts   Canvas2D hologram renderer: skeletons, trails, ring, particles, brackets
src/lib/store.ts    leaderboard + ghost recording (12 Hz) in localStorage
src/lib/audio.ts    WebAudio synth — every sound is generated, no audio files
```

- **AI:** MediaPipe Tasks Vision `pose_landmarker_lite`, `numPoses: 1`, video mode, GPU delegate with CPU fallback.
- **Scoring:** per-joint distance in torso units, weighted (hands 2.3×, elbows 1.25×, hips 0.3×), mapped through a soft window into 0–1. Lock threshold 0.74.
- **Storage:** top 24 runs plus one ghost per mode. Ghosts are ~600 frames of 13 joints, rounded to 3 decimals.
- **Rendering:** one transparent canvas over a mirrored `<video>`, sized to the camera's true aspect ratio so the hologram sits exactly on the player.

### Tuning it for your venue

- Add or reorder moves in `POSE_LIBRARY` (`src/lib/poses.ts`). A pose is ten numbers: two wrist positions, two ankle positions, optional torso lean.
- Difficulty lives in `tolerance()`, `holdNeed()` and `timeLimit()` in `src/lib/game.ts`.
- Round lengths live in `MODE_INFO`.
- **Reset the booth** from the Hall of Ghosts before the judges arrive.

---

Built for a camera-AI hackathon. MediaPipe Pose · React · Canvas2D · WebAudio · zero cloud.
