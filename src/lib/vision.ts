import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { toBody, type BodyPose, type RawLm } from './body';

const BASE = import.meta.env.BASE_URL || '/';

/**
 * The MediaPipe runtime is 28 MB of WASM. Locally that ships from /public so
 * the booth runs with the wifi off; hosted builds pull it from jsDelivr to stay
 * inside the static-upload size cap. The pose model itself is always same-origin.
 */
const WASM_BASE = import.meta.env.DEV
  ? `${BASE}mediapipe/wasm`
  : 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';

export type SourceStatus = 'idle' | 'loading' | 'ready' | 'error' | 'denied';

export interface PoseSource {
  pose: BodyPose | null;
  aspect: number;
  status: SourceStatus;
  error: string;
}

export class PoseEngine implements PoseSource {
  pose: BodyPose | null = null;
  aspect = 16 / 9;
  status: SourceStatus = 'idle';
  error = '';
  mirror = true;
  video: HTMLVideoElement | null = null;
  onFrame?: (pose: BodyPose | null, now: number) => void;

  private landmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private loading: Promise<void> | null = null;
  private pending: Promise<void> | null = null;
  private running = false;

  async loadModel(): Promise<void> {
    if (this.landmarker) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.status = 'loading';
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        const make = (delegate: 'GPU' | 'CPU') =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_lite.task`, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        try {
          this.landmarker = await make('GPU');
        } catch {
          this.landmarker = await make('CPU');
        }
        this.status = 'ready';
      } catch (err) {
        this.status = 'error';
        this.error = err instanceof Error ? err.message : 'Pose model failed to load';
      }
    })();
    return this.loading;
  }

  async startCamera(): Promise<void> {
    if (this.stream) {
      this.attach(this.video);
      return;
    }
    if (this.pending) return this.pending;
    this.pending = this.openCamera().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'error';
      this.error = 'This browser has no camera API. Camera needs HTTPS or localhost.';
      return;
    }
    this.status = 'loading';
    void this.loadModel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      this.stream = stream;
      this.attach(this.video);
      await this.loadModel();
      if (!this.landmarker) return;
      this.running = true;
      this.loop();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      this.status = 'error';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.status = 'denied';
        this.error = 'Camera blocked. Allow camera access for this site, then retry.';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.error = 'No camera found. Plug one in and retry.';
      } else if (name === 'NotReadableError') {
        this.error = 'Camera is busy in another app (Zoom, Meet, OBS). Close it and retry.';
      } else {
        this.error = err instanceof Error ? err.message : 'Camera failed to start.';
      }
    }
  }

  attach(video: HTMLVideoElement | null) {
    this.video = video;
    if (!video) return;
    if (this.stream && video.srcObject !== this.stream) {
      video.srcObject = this.stream;
      video.muted = true;
      video.playsInline = true;
      void video.play().catch(() => undefined);
    }
  }

  stopCamera() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.pose = null;
    if (this.video) this.video.srcObject = null;
    if (this.status === 'ready') this.status = 'idle';
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (!v || v.readyState < 2 || !this.landmarker) return;
    if (v.videoWidth && v.videoHeight) this.aspect = v.videoWidth / v.videoHeight;
    const now = performance.now();
    if (v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      try {
        const res = this.landmarker.detectForVideo(v, now);
        const lms = res.landmarks?.[0];
        const raw: RawLm[] | null = lms
          ? lms.map((l) => ({ x: l.x, y: l.y, visibility: l.visibility ?? 1 }))
          : null;
        this.pose = toBody(raw, this.aspect, this.mirror);
      } catch {
        this.pose = null;
      }
    }
    this.onFrame?.(this.pose, now);
  };
}
