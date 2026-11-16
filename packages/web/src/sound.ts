/**
 * Sound (brief §10): quiet tile clicks only — synthesized with WebAudio,
 * so there are no audio assets and no licensing surface. A soft click on
 * discard placement, a slightly firmer one on calls and the win. On by
 * default, one-tap mute on the table and in Settings. No music, no voices.
 */

export type ClickKind = "discard" | "call" | "win" | "draw";

export class ClickSound {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture so the AudioContext is allowed to start. */
  unlock(): void {
    this.ensureCtx();
  }

  click(kind: ClickKind): void {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const firm = kind === "call" || kind === "win";
    const dur = firm ? 0.07 : 0.045;
    const freq = kind === "win" ? 620 : firm ? 880 : 1250;
    const gainPeak = kind === "win" ? 0.16 : firm ? 0.12 : 0.07;

    const t0 = ctx.currentTime;
    // Filtered noise burst: the "clack" body.
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(t0);
    noise.stop(t0 + dur);
  }
}
