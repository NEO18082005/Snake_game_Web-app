
class AudioService {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playEat() {
    this.playTone(600, 'square', 0.1);
    this.playTone(800, 'square', 0.05, 0.05);
  }

  playDeath() {
    this.playTone(150, 'sawtooth', 0.5, 0.2);
    this.playTone(100, 'sine', 0.5, 0.3);
  }

  playTick() {
    this.playTone(1000, 'sine', 0.02, 0.05);
  }

  playGo() {
    this.playTone(1200, 'square', 0.3, 0.1);
  }

  playMenuSelect() {
    this.playTone(400, 'sine', 0.1, 0.05);
  }
}

export const audioService = new AudioService();
