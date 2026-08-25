/**
 * Sound, synthesised.
 *
 * Not one audio file. Every sound in the game is a few oscillators and a noise
 * buffer, which keeps the promise the rest of the project makes — nothing loads
 * over the network at runtime — and has the side effect that a hoe stroke can be
 * pitched by how hard the ground was, which a sample never could.
 *
 * The context starts suspended in every browser until a real gesture resumes it,
 * so `unlock()` is wired to the first pointer or key event and everything before
 * that is silently dropped rather than queued. Queueing produces the worst
 * possible outcome: forty stacked sounds the instant the player first clicks.
 */

export class Audio {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.ready = false
    this._noise = null
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    // One second of pink-ish noise, reused by every percussive sound. Building a
    // fresh buffer per hit allocates 44100 floats forty times a minute.
    const len = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.0990460
      b1 = 0.96300 * b1 + white * 0.2965164
      b2 = 0.57000 * b2 + white * 1.0526913
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22
    }
    this._noise = buf
    this.ready = true
  }

  setMuted(v) {
    this.muted = v
    if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 0.5, this.ctx.currentTime, 0.05)
  }

  _now() { return this.ctx.currentTime }

  /** A shaped noise burst — everything that hits something. */
  _burst({ dur = 0.2, gain = 0.3, type = 'bandpass', freq = 900, q = 1.2, sweep = 0 }) {
    if (!this.ready || this.muted) return
    const t = this._now()
    const src = this.ctx.createBufferSource()
    src.buffer = this._noise
    src.loop = true
    src.playbackRate.value = 0.7 + Math.random() * 0.6
    const filt = this.ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.setValueAtTime(freq, t)
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur)
    filt.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filt).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  /** A pitched blip — everything that is information rather than impact. */
  _tone({ freq = 440, dur = 0.12, gain = 0.14, type = 'triangle', to = null }) {
    if (!this.ready || this.muted) return
    const t = this._now()
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  // --- the game's vocabulary ------------------------------------------------

  till() { this._burst({ dur: 0.26, gain: 0.3, freq: 520, sweep: 0.35, q: 0.9 }) }
  sow() { this._burst({ dur: 0.14, gain: 0.16, freq: 2600, q: 0.7 }) }
  water() { this._burst({ dur: 0.55, gain: 0.16, type: 'lowpass', freq: 1400, sweep: 0.5, q: 0.4 }) }
  chop() {
    this._burst({ dur: 0.22, gain: 0.36, freq: 380, sweep: 0.3, q: 1.6 })
    this._tone({ freq: 180, to: 90, dur: 0.18, gain: 0.1, type: 'sine' })
  }
  mine() {
    this._burst({ dur: 0.18, gain: 0.4, freq: 1800, sweep: 0.2, q: 2.4 })
    this._tone({ freq: 260, to: 120, dur: 0.14, gain: 0.09, type: 'square' })
  }
  harvest() { this._tone({ freq: 620, to: 930, dur: 0.16, gain: 0.13 }) }
  pickup() { this._tone({ freq: 880, to: 1320, dur: 0.1, gain: 0.1 }) }
  coin() {
    this._tone({ freq: 1050, dur: 0.09, gain: 0.11 })
    setTimeout(() => this._tone({ freq: 1570, dur: 0.14, gain: 0.09 }), 60)
  }
  build() {
    this._burst({ dur: 0.34, gain: 0.34, freq: 260, sweep: 0.5, q: 1.1 })
    this._tone({ freq: 130, to: 78, dur: 0.4, gain: 0.12, type: 'sine' })
  }
  deny() { this._tone({ freq: 220, to: 150, dur: 0.14, gain: 0.1, type: 'sawtooth' }) }
  ui() { this._tone({ freq: 720, dur: 0.05, gain: 0.06 }) }

  /** The shard note. Used for anything the mark is on. */
  chime() {
    this._tone({ freq: 784, dur: 0.6, gain: 0.08, type: 'sine' })
    this._tone({ freq: 1176, dur: 0.5, gain: 0.05, type: 'sine' })
  }

  /** The long low build before a tremor. One filtered noise source held open;
   *  its filter opens as it goes, which is what makes it read as approaching
   *  rather than as a volume fade. */
  rumble(dur = 4, gain = 0.3) {
    if (!this.ready || this.muted) return
    const t = this._now()
    const src = this.ctx.createBufferSource()
    src.buffer = this._noise
    src.loop = true
    src.playbackRate.value = 0.35
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.setValueAtTime(90, t)
    filt.frequency.exponentialRampToValueAtTime(520, t + dur * 0.72)
    filt.frequency.exponentialRampToValueAtTime(70, t + dur)
    filt.Q.value = 0.7
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filt).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.1)
  }

  /** The shock itself. */
  quake(mag = 1) {
    this._burst({ dur: 1.6, gain: 0.42 + mag * 0.06, type: 'lowpass', freq: 320, sweep: 0.18, q: 0.6 })
    this._tone({ freq: 62, to: 34, dur: 1.5, gain: 0.2, type: 'sine' })
    this._tone({ freq: 46, to: 28, dur: 2.0, gain: 0.14, type: 'triangle' })
  }

  /** Rocky's voice: a stone note, not a word. Pitched by how big he is. */
  golem(pitch = 1) {
    this._tone({ freq: 150 * pitch, to: 110 * pitch, dur: 0.22, gain: 0.14, type: 'triangle' })
    this._burst({ dur: 0.18, gain: 0.1, freq: 700 * pitch, sweep: 0.4, q: 1.4 })
  }

  /** A pebble's. Same shape, an octave and a half up, which is all a child
   *  voice is. */
  pebble() { this.golem(2.6) }
}

export const audio = new Audio()
