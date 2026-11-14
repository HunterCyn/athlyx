/**
 * Spoken coaching.
 *
 * The phone sits two metres away and you are holding a pose — text on screen is
 * the wrong output channel. This speaks the same cue the coach bar shows, using
 * the browser's own speech engine: no key, no network, no audio to download.
 *
 * Everything here degrades quietly: no speechSynthesis (some headless browsers),
 * a muted preference, or a blocked autoplay all just mean silence, never a crash.
 */

const PREF = 'still.voice.on';

let on = true;
try {
  on = localStorage.getItem(PREF) !== 'off';
} catch {
  /* private mode — keep the default */
}

let picked: SpeechSynthesisVoice | null = null;
let pickedAt = 0;
let lastText = '';
let lastAt = 0;
let unlocked = false;

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

function chooseVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (!voices.length) return null;
  // prefer a natural, local, non-novelty voice
  const prefer = [/samantha/i, /karen/i, /daniel/i, /serena/i, /google us english/i, /google uk english female/i];
  for (const p of prefer) {
    const hit = voices.find((v) => p.test(v.name));
    if (hit) return hit;
  }
  return voices.find((v) => v.localService) ?? voices[0];
}

function speak(text: string, gap: number, force: boolean): boolean {
  const s = synth();
  if (!s || !text) return false;
  const now = performance.now();
  if (!force && text === lastText && now - lastAt < gap) return false;
  lastText = text;
  lastAt = now;

  if (!picked || now - pickedAt > 8000) {
    picked = chooseVoice();
    pickedAt = now;
  }

  const u = new SpeechSynthesisUtterance(text);
  if (picked) {
    u.voice = picked;
    u.lang = picked.lang;
  }
  u.rate = 0.95;
  u.pitch = 1.02;
  u.volume = 1;

  // cancelling and speaking in the same tick can drop the utterance in Chrome
  if (s.speaking || s.pending) {
    s.cancel();
    setTimeout(() => s.speak(u), 60);
  } else {
    s.speak(u);
  }
  return true;
}

function setOn(v: boolean) {
  on = v;
  try {
    localStorage.setItem(PREF, v ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (!v) synth()?.cancel();
}

export const voiceCoach = {
  isOn: () => on,
  available: () => !!synth(),
  setOn,
  toggle: () => {
    setOn(!on);
    return on;
  },
  /** iOS only allows speech after a gesture: call this from a click handler. */
  unlock() {
    const s = synth();
    if (!s || unlocked) return;
    unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
  },
  /** speak a cue, repeating the same line at most once per `gap` ms */
  say(text: string, gap = 7000) {
    if (!on) return false;
    return speak(text, gap, false);
  },
  /** interrupt with something that matters */
  force(text: string) {
    if (!on) return false;
    return speak(text, 0, true);
  },
  stop() {
    synth()?.cancel();
  },
};
