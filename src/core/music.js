/**
 * THE SCORE, generated.
 *
 * The same rule as everything else in this project: no audio file loads at
 * runtime, so the music is oscillators or it does not exist. That constraint is
 * the reason this is a *generative* score rather than a loop — a two-minute loop
 * built from sine waves is two minutes of sine waves and then two more, and in a
 * game where a day takes half an hour the player would hear it fourteen times.
 *
 * ## What it is
 *
 * Four layers, all in one mode, all keyed off the clock:
 *
 *   DRONE    Two detuned oscillators a fifth apart under a slow filter sweep.
 *            This is the floor, and it is the only layer that never stops.
 *   PLUCK    A sparse melody. Notes are drawn from the mode by a random walk
 *            with a strong pull back toward the tonic, so a phrase wanders and
 *            comes home rather than jumping around a scale like an arpeggiator.
 *   BASS     One note per phrase, on the phrase's root.
 *   AIR      A breath of filtered noise on the long notes. It is what stops the
 *            pad sounding like a synthesiser and starts it sounding like wind
 *            in a valley you are alone in.
 *
 * ## The clock is the composer
 *
 * The hour picks the mode, the register, the tempo and how often a note is
 * allowed to happen. Dawn is open and slow; midday is the brightest and busiest
 * it ever gets, which is still four notes a phrase; evening drops a third to
 * minor; night moves down an octave, thins to almost nothing, and lets the drone
 * carry it. Nothing announces the change — the mode is swapped on the next
 * phrase boundary, so the score modulates rather than cuts.
 *
 * ## Scheduling
 *
 * Notes are scheduled ahead into WebAudio's own clock in a look-ahead window,
 * never from a rAF callback. `setTimeout` jitter is tens of milliseconds and a
 * melody scheduled off it swings audibly; `AudioContext.currentTime` is sample
 * accurate. The pump runs on a timer, but all it does is *book* notes that the
 * audio thread plays at exactly the right instant.
 */

/** Semitone offsets from the root. Six moods, chosen for colour, not theory. */
const MODES = {
  // Open and unresolved — no third at all, so it commits to nothing.
  quartal: [0, 5, 7, 12, 14, 17, 19, 24],
  // Major with a raised fourth. The brightest thing here, and still not sweet.
  lydian: [0, 2, 4, 6, 7, 9, 11, 12, 14, 16],
  // Plain minor. Evening.
  aeolian: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15],
  // Minor with a raised sixth. Melancholy that is still walking somewhere.
  dorian: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15],
  // Five notes, no semitones, nothing that can clash. Night.
  pentatonic: [0, 3, 5, 7, 10, 12, 15, 17],
}

/**
 * The day, as music. Interpolated? No — switched, on a phrase boundary. A score
 * that crossfades between two modes is a score in neither of them.
 */
const HOURS = [
  { t: 0, mode: 'pentatonic', root: 45, octave: -1, beat: 2.4, density: 0.16, bright: 380, air: 0.5 },
  { t: 5.2, mode: 'quartal', root: 50, octave: 0, beat: 2.1, density: 0.3, bright: 620, air: 0.62 },
  { t: 7.5, mode: 'lydian', root: 52, octave: 0, beat: 1.55, density: 0.46, bright: 1150, air: 0.34 },
  { t: 12, mode: 'lydian', root: 52, octave: 0, beat: 1.4, density: 0.52, bright: 1500, air: 0.26 },
  { t: 16, mode: 'dorian', root: 50, octave: 0, beat: 1.6, density: 0.44, bright: 1050, air: 0.34 },
  { t: 18.6, mode: 'aeolian', root: 48, octave: 0, beat: 2.0, density: 0.3, bright: 640, air: 0.5 },
  { t: 21, mode: 'pentatonic', root: 45, octave: -1, beat: 2.4, density: 0.18, bright: 420, air: 0.56 },
  { t: 24, mode: 'pentatonic', root: 45, octave: -1, beat: 2.4, density: 0.16, bright: 380, air: 0.5 },
]

const BEATS_PER_PHRASE = 8
const LOOKAHEAD = 0.6 // seconds of notes booked at a time
const PUMP = 220 // ms between bookings

const midi = (n) => 440 * 2 ** ((n - 69) / 12)

function gradeAt(hour) {
  const h = ((hour % 24) + 24) % 24
  for (let i = HOURS.length - 1; i >= 0; i--) if (h >= HOURS[i].t) return HOURS[i]
  return HOURS[0]
}

export class Music {
  /** @param audio the Audio instance — the score borrows its context so mute,
   *  volume and the unlock gesture are all handled in exactly one place. */
  constructor(audio) {
    this.audio = audio
    this.on = false
    this.started = false
    this.hour = 8
    this.volume = 0.5
    this.grade = HOURS[2]
    this.step = 0
    this.degree = 0
    this.nextAt = 0
    this.timer = 0
  }

  /** Build the graph. Called once, after the context exists. */
  _build() {
    const ctx = this.audio.ctx
    this.bus = ctx.createGain()
    this.bus.gain.value = 0
    this.bus.connect(this.audio.master)

    // One delay, fed back gently. A valley this empty needs a tail on every
    // note or the score sounds like it is being played in a cupboard.
    this.delay = ctx.createDelay(1.2)
    this.delay.delayTime.value = 0.42
    this.fb = ctx.createGain()
    this.fb.gain.value = 0.34
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.3
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 1800
    this.delay.connect(damp).connect(this.fb).connect(this.delay)
    this.delay.connect(this.wet).connect(this.bus)

    // The drone. Two oscillators a fifth apart, each detuned against itself, so
    // the beating between them is the whole texture.
    this.tone = ctx.createBiquadFilter()
    this.tone.type = 'lowpass'
    this.tone.frequency.value = 700
    this.tone.Q.value = 0.7
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.1
    this.tone.connect(this.droneGain).connect(this.bus)
    this.tone.connect(this.delay)

    this.drones = [0, 7, 12].map((interval, i) => {
      const o = ctx.createOscillator()
      o.type = i === 2 ? 'sine' : 'triangle'
      o.frequency.value = midi(this.grade.root + interval)
      o.detune.value = (i - 1) * 6
      const g = ctx.createGain()
      g.gain.value = i === 2 ? 0.1 : 0.26
      o.connect(g).connect(this.tone)
      o.start()
      return { o, g, interval }
    })

    // A very slow LFO on the filter. Twenty-three seconds is prime-ish against
    // the phrase length on purpose: the swell must never line up with the bar.
    this.lfo = ctx.createOscillator()
    this.lfo.frequency.value = 1 / 23
    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = 260
    this.lfo.connect(this.lfoGain).connect(this.tone.frequency)
    this.lfo.start()
  }

  /** Turn it on. Safe to call before the context is unlocked. */
  start() {
    this.on = true
    if (!this.audio.ready) return
    if (!this.started) {
      this._build()
      this.started = true
      this.nextAt = this.audio.ctx.currentTime + 0.2
      this.timer = setInterval(() => this._pump(), PUMP)
    }
    this._fade(this.volume)
  }

  stop() {
    this.on = false
    this._fade(0)
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.on) this._fade(this.volume)
  }

  _fade(to) {
    if (!this.bus) return
    // Four seconds. Music that appears is music the player notices arriving,
    // which is the one thing an ambient score must not do.
    this.bus.gain.setTargetAtTime(to * 0.26, this.audio.ctx.currentTime, 1.4)
  }

  /** The clock, pushed in from the game loop. */
  setHour(hour) { this.hour = hour }

  /** Book everything that falls inside the look-ahead window. */
  _pump() {
    if (!this.started || !this.on || this.audio.muted) return
    const ctx = this.audio.ctx
    if (ctx.state === 'suspended') return
    const until = ctx.currentTime + LOOKAHEAD
    let guard = 0
    while (this.nextAt < until && guard++ < 32) {
      this._beat(this.nextAt, this.step)
      this.nextAt += this.grade.beat
      this.step++
      // The mode changes on the downbeat and nowhere else.
      if (this.step % BEATS_PER_PHRASE === 0) this._turnPhrase()
    }
  }

  _turnPhrase() {
    const g = gradeAt(this.hour)
    if (g === this.grade) return
    this.grade = g
    const t = this.audio.ctx.currentTime
    // Slide the drone rather than jumping it: a drone that steps is a mistake,
    // a drone that slides over three seconds is a modulation.
    for (const d of this.drones) {
      d.o.frequency.setTargetAtTime(midi(g.root + d.interval + g.octave * 12), t, 1.1)
    }
    this.tone.frequency.setTargetAtTime(g.bright, t, 2.0)
    this.wet.gain.setTargetAtTime(0.2 + g.air * 0.34, t, 2.0)
  }

  _beat(at, step) {
    const g = this.grade
    const scale = MODES[g.mode]
    const inPhrase = step % BEATS_PER_PHRASE

    // The bass, once a phrase, on the downbeat.
    if (inPhrase === 0) this._pluck(at, g.root + g.octave * 12 - 12, 2.6, 0.15, 'sine')

    if (Math.random() > g.density) return

    /**
     * The random walk.
     *
     * A step of -2..+2 degrees, biased back toward the tonic by how far out the
     * melody has wandered. Without that pull the line drifts off the top of the
     * scale and stays there; with it, a phrase reliably comes home without ever
     * being written down.
     */
    const pull = -Math.sign(this.degree) * Math.min(2, Math.abs(this.degree) * 0.5)
    this.degree = Math.max(0, Math.min(scale.length - 1, Math.round(this.degree + (Math.random() * 4 - 2) + pull)))
    const note = g.root + g.octave * 12 + scale[this.degree] + 12

    const long = inPhrase === 0 || Math.random() < 0.2
    this._pluck(at, note, long ? 2.2 : 1.1, long ? 0.1 : 0.07)
    // A fifth above, quietly, on a long note. One interval, and it is the
    // difference between a melody and a piece of music.
    if (long && Math.random() < 0.5) this._pluck(at + 0.06, note + 7, 1.6, 0.045)
    if (g.air > 0.4 && long) this._air(at, g.air)
  }

  /** One note. A soft triangle through a fast attack and a long exponential
   *  tail — a plucked string with the pluck taken off it. */
  _pluck(at, note, dur, gain, type = 'triangle') {
    const ctx = this.audio.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = midi(note)
    o.detune.value = (Math.random() - 0.5) * 9
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(2600, at)
    f.frequency.exponentialRampToValueAtTime(520, at + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(f).connect(g)
    g.connect(this.bus)
    g.connect(this.delay)
    o.start(at)
    o.stop(at + dur + 0.05)
  }

  /** A breath. Reuses the engine's noise buffer rather than allocating one. */
  _air(at, amount) {
    const ctx = this.audio.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.audio._noise
    src.loop = true
    src.playbackRate.value = 0.5 + Math.random() * 0.3
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 500 + Math.random() * 700
    f.Q.value = 0.7
    const g = ctx.createGain()
    const dur = 2.4 + Math.random() * 1.6
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(0.03 * amount, at + dur * 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(f).connect(g).connect(this.bus)
    src.start(at)
    src.stop(at + dur + 0.1)
  }

  dispose() {
    clearInterval(this.timer)
    for (const d of this.drones ?? []) d.o.stop()
    this.lfo?.stop()
  }
}
