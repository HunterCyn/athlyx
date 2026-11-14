# STILL

**Your phone is the yoga instructor.**

Every yoga app is a video. You copy it badly, and nothing tells you that your front knee is over your toes or your back leg has collapsed. STILL uses the camera you already have: prop the phone two metres away, and it reads 33 body joints on-device and tells you the one thing to fix — out loud, because at two metres you cannot read a screen.

**Live:** https://site-2773a397b7f34300a1be984c4e3c13dd.freebuff.page — open on a phone, allow the camera, stand in Mountain while it calibrates.

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 20+. The pose model (~5.6 MB) and the MediaPipe WASM runtime are bundled in `public/`, so `npm run dev` works with the venue wifi switched off. Camera access needs `localhost` or HTTPS.

> The hosted build serves the model from its own origin but pulls the 28 MB WASM runtime from jsDelivr to stay under the static-upload cap. For a fully offline demo, run it locally.

---

## The four poses

| Pose | Hold | What is actually measured |
| --- | --- | --- |
| **Mountain** (Tadasana) | 16 s | Torso vertical, both legs straight, feet hip-width, shoulders level, arms hanging, head over hips |
| **Warrior I** (Virabhadrasana I) | 22 s | Front knee ≈90°, knee stacked over the ankle, back leg straight, wide stance, both hands above the head and over the shoulders, torso upright |
| **Warrior II** (Virabhadrasana II) | 22 s | Same legs, plus arms level with the shoulders and extended wide, hips level |
| **Extended Side Angle** (Utthita Parsvakonasana) | 24 s | Same legs, plus a side bend over the **front** leg, bottom hand toward the floor, top arm reaching long |

---

## How it judges you

Not by matching your joints to a reference skeleton. That hides a hip tilt or a collapsed knee inside the tolerance, and it punishes anyone whose femurs are longer than the reference figure's.

Instead, every check is an **anatomical measurement**: joint angles, knee-over-ankle stacking, stance width, shoulder and hip levelness, torso lean, arm position, side bend. Each one is normalised by torso length (so it is scale invariant) and by a baseline learned from *you*.

- **Calibration.** Before the flow, you stand in Mountain for ~2.5 seconds. It records your shoulder tilt, hip tilt, natural lean, natural stance width and arm drop. A 5′2″ and a 6′4″ practitioner then get judged on the same scale.
- **Scoring.** Each check maps its error through a tolerance window into 0–1. The alignment percentage is a weighted mean; leg and stacking checks weigh more than head position.
- **Cues.** The worst failing check becomes the one spoken line. It only speaks once a correction has been true for a second, and repeats at most every 7 s — it coaches instead of chattering.
- **Hold.** The timer advances only while alignment is ≥ 66 %, so a sloppy shape doesn't earn the pose.

---

## What it deliberately does not measure

One camera cannot see depth. So the lunges are judged **face-on with a wide stance**, and the app does not claim to score a true heel-to-heel Warrior stance, chest rotation, or how far the knee travels forward. It measures angle, stacking, symmetry and levelness — what one lens can honestly see — and stays quiet about the rest.

It is also not a medical device and gives no injury advice.

---

## Any body, any camera

Two things make the same code work for different people and different setups:

1. **The torso-normalised body frame.** Hip centre → shoulder centre is 1 unit, so joint positions are comparable across heights and distances from the camera.
2. **Per-person calibration**, described above. The checks adjust to *your* natural asymmetry rather than assuming a perfectly level person.

The reference silhouette is drawn at your hip position and torso scale, and the canvas uses object-fit **cover** mapping so the overlay lands exactly on your body in the video.

---

## Demo without a camera

`SEE A DEMO BODY` runs a synthetic practitioner. It starts with its arms in a position that is wrong for every pose, waits a beat so the correction is readable, then settles — which shows the coaching working on a laptop with no webcam.

---

## Not verified

There is no webcam in the development VM. The scoring maths, the synthetic demo path and the UI are tested; **the real-camera path — calibration from a live body and per-pose tracking — is not.** That is the first thing to try on a phone.

---

## Project layout

```
src/yoga/checks.ts    anatomical checks, baseline calibration, weighted scoring
src/yoga/poses.ts     reference sketches in torso units + per-pose check lists
src/yoga/Practice.tsx live screen: scoring loop, hold timer, cues, checklist
src/yoga/Setup.tsx    camera framing + 2.5 s calibration
src/yoga/render.ts    canvas overlay: silhouette, spine guide, hold ring, particles
src/yoga/voice.ts     spoken cues via speechSynthesis (no key, no network)
src/yoga/Yogi.ts      synthetic practitioner for camera-less demos
src/yoga/store.ts     baseline, sessions and bests in localStorage
src/lib/vision.ts     MediaPipe Pose Landmarker wrapper (GPU → CPU fallback)
src/lib/body.ts       33 landmarks → torso-normalised body frame
```

`AGENTS.md` holds the decision log and the traps — read it before changing the scoring.

---

## The arcade

`/arcade.html` is **GHOSTMOVE**, the camera pose arcade this grew out of: strike poses against the clock and race the ghost of whoever scored highest. It shares the pose engine and is kept as a second page, not deleted.

---

Built for a camera-AI hackathon. MediaPipe Pose · React · Canvas2D · WebAudio · Vite · zero cloud.
