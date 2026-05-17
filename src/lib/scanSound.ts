let audioCtx: AudioContext | null = null;

function ctx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function tone(freq: number, duration = 0.08, type: OscillatorType = 'sine', volume = 0.15, delay = 0) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain).connect(c.destination);
  const start = c.currentTime + delay;
  osc.start(start);
  osc.stop(start + duration);
}

export function playSuccess() {
  tone(1200, 0.1, 'sine', 0.18);
}

export function playError() {
  tone(300, 0.12, 'square', 0.18);
  tone(220, 0.15, 'square', 0.18, 0.13);
}

export function playWarn() {
  tone(700, 0.08, 'triangle', 0.15);
}
