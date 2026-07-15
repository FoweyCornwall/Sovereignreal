// Tiny sound-effects layer. Web Audio synthesis so we don't ship any
// asset files. Two effects: a brief click on success, a lower-pitched
// dissonant tone on error. Both no-op if the user has muted audio (via
// AudioToggle, backed by localStorage) or if we're outside a browser.
//
// Ambient music is deliberately not shipped this round - it would need
// a hosted mp3, and this project's "no external runtime deps" posture
// makes a CDN link a poor fit. If the user drops an .mp3 into
// public/sounds/ambient.mp3 in a follow-up round, wire an <audio loop>
// element in app/(game)/layout.tsx and a volume slider here.

const AUDIO_ENABLED_KEY = "sound.enabled";

// A single lazy-initialized AudioContext shared across all sounds. Created
// on first user gesture (any click on a button that plays a sound is a
// gesture, so this satisfies the browser autoplay policy naturally).
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) return null;
  try {
    ctx = new AudioCtor();
    return ctx;
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUDIO_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_ENABLED_KEY, enabled ? "true" : "false");
    window.dispatchEvent(new Event("sound-enabled-changed"));
  } catch {
    // localStorage blocked (private mode etc.) - can't persist, ignore.
  }
}

function playTone(opts: {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  peakGain?: number;
}) {
  if (!isSoundEnabled()) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const durationSec = opts.durationMs / 1000;
  const peak = opts.peakGain ?? 0.08;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = opts.type ?? "triangle";
  osc.frequency.setValueAtTime(opts.frequency, now);

  // Quick attack, linear decay - avoids the "click" pop from an
  // instantaneous gain change at start/end.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.linearRampToValueAtTime(0, now + durationSec);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

// Short bright click when a policy successfully enacts.
export function playClick() {
  playTone({ frequency: 880, durationMs: 80, type: "triangle", peakGain: 0.06 });
}

// Lower, dissonant tone when an enact is rejected (insufficient funds,
// queue full). Two quick pulses so it's distinguishable from the click.
export function playError() {
  playTone({ frequency: 220, durationMs: 100, type: "square", peakGain: 0.05 });
  setTimeout(() => {
    playTone({ frequency: 165, durationMs: 120, type: "square", peakGain: 0.05 });
  }, 90);
}
