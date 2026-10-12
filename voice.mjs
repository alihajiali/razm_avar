import { DIALOGUES } from './dialogues.mjs';

// One voice at a time: urgent reactions can replace chatter, never build a queue.
export class BattleVoice {
  constructor(subtitle, { AudioClass = globalThis.Audio, now = () => performance.now() } = {}) {
    this.subtitle = subtitle;
    this.AudioClass = AudioClass;
    this.now = now;
    this.enabled = true;
    this.muted = false;
    this.volume = 0.8;
    this.lastAt = -Infinity;
    this.lastPriority = 0;
    this.current = null;
    this.timer = null;
    this.lastLine = new Map();
  }
  play(event, speaker = 'تو', { priority = 0, variant = null, pitch = 1 } = {}) {
    const lines = DIALOGUES.filter((line) => line.event === event),
      at = this.now();
    if (!lines.length) return false;
    if (at - this.lastAt < 3500 && priority < 2 && priority <= this.lastPriority) return false;
    let choices = lines.filter((line) => line.id !== this.lastLine.get(event));
    if (variant !== null) choices = lines.filter((line) => line.text === variant);
    if (!choices.length) choices = lines;
    const line = choices[Math.floor(Math.random() * choices.length)];
    this.stop();
    this.lastAt = at;
    this.lastPriority = priority;
    this.lastLine.set(event, line.id);
    this.subtitle.textContent = `${speaker}: ${line.text}`;
    this.subtitle.hidden = false;
    this.timer = setTimeout(() => {
      this.subtitle.hidden = true;
    }, 4500);
    if (this.enabled && !this.muted && this.AudioClass) {
      const clip = new this.AudioClass(
        new URL(`./assets/voices/${line.id}.mp3`, import.meta.url).href,
      );
      this.current = clip;
      clip.volume = this.volume;
      clip.playbackRate = Math.max(0.9, Math.min(1.1, pitch));
      clip.play().catch(() => {});
    }
    return true;
  }
  stop() {
    this.current?.pause();
    this.current = null;
    clearTimeout(this.timer);
    this.subtitle.hidden = true;
  }
  setMuted(value) {
    this.muted = value;
    if (value) this.current?.pause();
  }
  setEnabled(value) {
    this.enabled = value;
    if (!value) this.current?.pause();
  }
}
