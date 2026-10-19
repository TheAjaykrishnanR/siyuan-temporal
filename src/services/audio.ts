import { SoundToneId, SoundToneOption } from "@/types/temporal";

export const SOUND_TONE_OPTIONS: SoundToneOption[] = [
  {
    id: "marimba-chime",
    name: "Warm Marimba Chime",
    description: "Melodic wooden marimba arpeggio (Default)",
  },
  {
    id: "classic-beep",
    name: "Classic Quartz Digital",
    description: "Crisp double-beep digital bedside alarm",
  },
  {
    id: "zen-bowl",
    name: "Tibetan Singing Bowl",
    description: "Deep resonant meditation harmonic bell",
  },
  {
    id: "gentle-harp",
    name: "Morning Harp Arpeggio",
    description: "Soft ascending plucked harp strings",
  },
  {
    id: "cosmic-synth",
    name: "Cosmic Horizon Synth",
    description: "Warm ambient polyphonic synth chord",
  },
  {
    id: "urgent-pulse",
    name: "Urgent Dual-Tone Siren",
    description: "High-attention alternating alert pulse",
  },
  {
    id: "custom-url",
    name: "Custom Audio URL / Asset",
    description: "Play an MP3/WAV/OGG file from URL or SiYuan /assets/",
  },
];

class TemporalAudioEngine {
  private ctx: AudioContext | null = null;
  private activeLoops = new Map<string, number>();
  private activeHtmlAudio = new Map<string, HTMLAudioElement>();

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playNote(
    freq: number,
    startTimeOffset: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    attack = 0.015
  ) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime + startTimeOffset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      const safeVol = Math.max(0.01, Math.min(1, volume));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(safeVol * 0.45, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("[TemporalAudio] WebAudio note error:", e);
    }
  }

  public playPatternOnce(
    soundId: SoundToneId,
    volume = 0.8,
    customUrl?: string
  ): number {
    if (soundId === "custom-url" && customUrl?.trim()) {
      try {
        const audio = new Audio(customUrl.trim());
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch(() => {
          // Fallback to marimba if custom URL fails
          this.playPatternOnce("marimba-chime", volume);
        });
        this.activeHtmlAudio.set("preview", audio);
        return 3000;
      } catch {
        // Fallback
      }
    }

    switch (soundId) {
      case "classic-beep": {
        // Beep-beep ... Beep-beep
        this.playNote(880, 0.0, 0.12, volume, "square", 0.005);
        this.playNote(880, 0.16, 0.12, volume, "square", 0.005);
        this.playNote(880, 0.55, 0.12, volume, "square", 0.005);
        this.playNote(880, 0.71, 0.12, volume, "square", 0.005);
        return 1250;
      }
      case "marimba-chime": {
        // C5 - E5 - G5 - B5 - C6
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
        notes.forEach((f, idx) => {
          this.playNote(f, idx * 0.13, 0.45, volume, "triangle", 0.008);
          this.playNote(f * 2, idx * 0.13, 0.18, volume * 0.3, "sine", 0.005);
        });
        return 1600;
      }
      case "zen-bowl": {
        // Rich harmonic singing bowl
        const base = 432;
        this.playNote(base, 0, 2.2, volume, "sine", 0.04);
        this.playNote(base * 2.0, 0.02, 1.6, volume * 0.45, "sine", 0.04);
        this.playNote(base * 2.756, 0.04, 1.1, volume * 0.25, "sine", 0.02);
        return 2400;
      }
      case "gentle-harp": {
        // D5 - F#5 - A5 - D6 - F#6 - A6
        const notes = [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0];
        notes.forEach((f, idx) => {
          this.playNote(f, idx * 0.14, 0.7, volume * 0.85, "sine", 0.01);
          this.playNote(f, idx * 0.14, 0.35, volume * 0.4, "triangle", 0.01);
        });
        return 1850;
      }
      case "cosmic-synth": {
        // Lush major 9th chord
        const chord = [440, 554.37, 659.25, 830.61, 987.77];
        chord.forEach((f, idx) => {
          this.playNote(f, idx * 0.08, 1.3, volume * 0.6, "triangle", 0.05);
          this.playNote(f * 1.003, idx * 0.08, 1.3, volume * 0.4, "sine", 0.05);
        });
        return 1900;
      }
      case "urgent-pulse": {
        // High-priority alternating siren pulse
        for (let i = 0; i < 4; i++) {
          this.playNote(783.99, i * 0.24, 0.11, volume, "sawtooth", 0.005);
          this.playNote(1046.5, i * 0.24 + 0.12, 0.11, volume, "sawtooth", 0.005);
        }
        return 1200;
      }
      default: {
        this.playNote(587.33, 0, 0.3, volume, "triangle");
        this.playNote(880, 0.18, 0.45, volume, "triangle");
        return 1200;
      }
    }
  }

  public startAlertSound(
    alertId: string,
    soundId: SoundToneId,
    volume = 0.8,
    loop = true,
    customUrl?: string
  ) {
    this.stopAlertSound(alertId);

    if (soundId === "custom-url" && customUrl?.trim()) {
      try {
        const audio = new Audio(customUrl.trim());
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.loop = loop;
        audio.play().catch(() => {
          this.startSynthesizedLoop(alertId, "marimba-chime", volume, loop);
        });
        this.activeHtmlAudio.set(alertId, audio);
        return;
      } catch {
        // Fallback to synthesized sound
      }
    }

    this.startSynthesizedLoop(alertId, soundId, volume, loop);
  }

  private startSynthesizedLoop(
    alertId: string,
    soundId: SoundToneId,
    volume: number,
    loop: boolean
  ) {
    const intervalMs = this.playPatternOnce(soundId, volume);
    if (!loop) return;

    const timerId = window.setInterval(() => {
      this.playPatternOnce(soundId, volume);
    }, Math.max(1100, intervalMs));

    this.activeLoops.set(alertId, timerId);
  }

  public stopAlertSound(alertId: string) {
    const timerId = this.activeLoops.get(alertId);
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      this.activeLoops.delete(alertId);
    }
    const audio = this.activeHtmlAudio.get(alertId);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      this.activeHtmlAudio.delete(alertId);
    }
  }

  public stopAllSounds() {
    for (const id of this.activeLoops.keys()) {
      this.stopAlertSound(id);
    }
    for (const id of this.activeHtmlAudio.keys()) {
      this.stopAlertSound(id);
    }
  }
}

export const audioEngine = new TemporalAudioEngine();
