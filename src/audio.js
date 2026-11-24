const NOTES = {
  attack: [[136, 72, 0.13, 'triangle', 0.14]],
  art: [[132, 55, 0.3, 'sawtooth', 0.10], [470, 205, 0.17, 'triangle', 0.11]],
  hit: [[95, 33, 0.12, 'triangle', 0.19]],
  hurt: [[75, 41, 0.26, 'sawtooth', 0.14]],
  dodge: [[230, 88, 0.17, 'triangle', 0.09]],
  heal: [[290, 566, 0.3, 'sine', 0.12], [429, 786, 0.43, 'sine', 0.07]],
  loot: [[520, 970, 0.25, 'sine', 0.10]],
  quest: [[196, 196, 0.55, 'sine', 0.13], [293, 293, 0.72, 'sine', 0.08], [392, 392, 0.92, 'triangle', 0.04]],
  gate: [[84, 44, 0.63, 'triangle', 0.14], [223, 171, 0.73, 'sine', 0.05]],
  select: [[385, 450, 0.11, 'triangle', 0.08]],
};

export class Audio {
  constructor(storage) {
    this.storage = storage;
    try { this.enabled = storage.getItem('ash-and-iron.audio') !== 'off'; }
    catch { this.enabled = true; }
  }

  start() {
    if (!this.enabled) return;
    if (!this.ctx) {
      if (!window.AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.37;
      this.master.connect(this.ctx.destination);
      this.drone = this.ctx.createGain();
      this.drone.gain.value = 0;
      this.drone.connect(this.master);
      for (const [frequency, shape] of [[55, 'sine'], [82.6, 'sine'], [110.28, 'triangle']]) {
        const wave = this.ctx.createOscillator();
        wave.type = shape;
        wave.frequency.value = frequency;
        wave.connect(this.drone);
        wave.start();
      }
      this.ambience('title');
    }
    this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.enabled = !this.enabled;
    try { this.storage.setItem('ash-and-iron.audio', this.enabled ? 'on' : 'off'); } catch { /* Preferences stay in memory. */ }
    if (this.enabled) this.start();
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.37 : 0, this.ctx.currentTime, 0.06);
  }

  ambience(zone) {
    if (!this.drone) return;
    const levels = { title: 0.017, watch: 0.019, wood: 0.029, crypt: 0.042, belfry: 0.052 };
    this.drone.gain.setTargetAtTime(levels[zone], this.ctx.currentTime, 0.5);
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    for (const [base, end, duration, type, volume] of NOTES[name] ?? []) {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(end, now + duration);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.022);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(now + duration + 0.01);
    }
  }
}
