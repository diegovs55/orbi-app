/**
 * Minimal Web Audio API notification helper.
 * No external dependencies. Respects browser autoplay policy.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

/** Returns true if AudioContext is running (user has interacted). */
export function isAudioReady(): boolean {
  return !!audioCtx && audioCtx.state === "running";
}

/**
 * Resumes AudioContext. Must be called from within a user gesture
 * (click, touchstart, keydown) to satisfy browser autoplay policy.
 */
export async function unlockAudio(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

// ── Auto-unlock on first gesture ─────────────────────────────────────────────

let autoUnlockRegistered = false;
const postUnlockCallbacks: Array<() => void> = [];

/**
 * Registers a one-time listener on click / touchstart / keydown (capture phase)
 * that silently resumes the AudioContext on the user's first interaction.
 * Safe to call multiple times — registers only once per page load.
 * Optional `onReady` callback fires immediately after unlock succeeds.
 */
export function enableAutoUnlock(onReady?: () => void): void {
  if (onReady) postUnlockCallbacks.push(onReady);
  if (autoUnlockRegistered) return;
  autoUnlockRegistered = true;

  const gestures = ["click", "touchstart", "keydown"] as const;

  const handler = () => {
    void unlockAudio().then(() => {
      gestures.forEach((e) => window.removeEventListener(e, handler, true));
      const cbs = postUnlockCallbacks.splice(0);
      cbs.forEach((cb) => cb());
    });
  };

  gestures.forEach((e) => window.addEventListener(e, handler, { capture: true, once: false }));
}

function playTone(freq: number, duration: number, vol = 0.22): void {
  if (!isAudioReady()) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/** Two ascending tones — "nuevo pedido de negocio". */
export function playBusinessAlert(): void {
  playTone(784, 0.12);          // G5
  setTimeout(() => playTone(1047, 0.18), 190); // C6
}

/** Three-note pattern — "misión disponible para agente". */
export function playAgentAlert(): void {
  playTone(659, 0.10);          // E5
  setTimeout(() => playTone(784, 0.10), 165); // G5
  setTimeout(() => playTone(659, 0.10), 330); // E5
}

// ── Repeating alerts ──────────────────────────────────────────────────────────

const repeating = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Starts a repeating alert identified by `key`.
 * Plays immediately, then every `intervalMs` milliseconds.
 * No-op if the key is already running.
 */
export function startRepeatingAlert(
  key: string,
  playFn: () => void,
  intervalMs: number
): void {
  if (repeating.has(key)) return;
  playFn();
  repeating.set(key, setInterval(playFn, intervalMs));
}

/** Stops and clears the repeating alert for `key`. */
export function stopRepeatingAlert(key: string): void {
  const id = repeating.get(key);
  if (id !== undefined) {
    clearInterval(id);
    repeating.delete(key);
  }
}
