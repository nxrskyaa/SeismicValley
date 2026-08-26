import { G } from './palette.js'

/**
 * WHAT THE VALLEY SOUNDS LIKE WHEN NOTHING IS HAPPENING.
 *
 * Two things, and the list is short on purpose.
 *
 * ## No birds. No insects. Nothing alive.
 *
 * The obvious ambient bed for a farming game is dawn chorus and crickets, and it
 * would be wrong here — the premise is that four hundred and six species are in
 * the soil in pieces and the valley is empty. A cricket at dusk would be the
 * single loudest contradiction in the game, and it would be one most players
 * would feel before they could name.
 *
 * So the bed is WIND and WATER, and the silence between them is the setting. The
 * only living sounds in the valley are the dog, the constructs, and you.
 *
 * ## It follows the world
 *
 * The wind bed reads the same gust value the petals and the vertex sway read, so
 * a gust you can hear is a gust you can see bending the trees. The water bed
 * fades up by how much open water is near the player rather than by a trigger
 * volume, so walking along a river is a gradient rather than a switch. Both are
 * one persistent noise source through one filter — a bed that allocates nodes
 * is a bed that garbage-collects while you play.
 */

/**
 * Footsteps, by what you are standing on.
 *
 * `freq`/`q`/`type` shape one noise burst; `dur` and `gain` are the envelope.
 * Nothing here is a sample, so a step on tilled soil is genuinely a different
 * filter from a step on stone rather than a different file.
 */
const STEP_TONES = {
  [G.MEADOW]: { type: 'bandpass', freq: 1700, q: 0.9, dur: 0.085, gain: 0.055 },
  [G.ASH]: { type: 'bandpass', freq: 2100, q: 0.8, dur: 0.075, gain: 0.05 },
  [G.SHORE]: { type: 'lowpass', freq: 950, q: 0.6, dur: 0.12, gain: 0.06 },
  [G.STONE]: { type: 'bandpass', freq: 2600, q: 3.0, dur: 0.06, gain: 0.05 },
  [G.SCAR]: { type: 'bandpass', freq: 2300, q: 2.4, dur: 0.07, gain: 0.05 },
  [G.LOAM]: { type: 'lowpass', freq: 620, q: 0.7, dur: 0.1, gain: 0.06 },
  [G.TILLED]: { type: 'lowpass', freq: 520, q: 0.7, dur: 0.11, gain: 0.065 },
  [G.WET]: { type: 'lowpass', freq: 420, q: 0.9, dur: 0.14, gain: 0.07 },
}
const STEP_DEFAULT = STEP_TONES[G.MEADOW]

export class Ambience {
  /** @param audio the Audio instance — shares its context, its master gain and
   *  its mute, so there is exactly one place that turns sound off. */
  constructor(audio) {
    this.audio = audio
    this.built = false
    this.wind = 0
    this.water = 0
  }

  _build() {
    const ctx = this.audio.ctx
    if (!ctx || !this.audio._noise) return false

    this.bus = ctx.createGain()
    this.bus.gain.value = 1
    this.bus.connect(this.audio.master)

    /** One looping noise source feeds both beds. Two sources of the same noise
     *  is two buffers of the same numbers. */
    this.src = ctx.createBufferSource()
    this.src.buffer = this.audio._noise
    this.src.loop = true
    this.src.playbackRate.value = 0.35

    // Wind: a wide low band that opens up as the gust builds.
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 420
    this.windFilter.Q.value = 0.55
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    this.src.connect(this.windFilter).connect(this.windGain).connect(this.bus)

    // Water: narrower and higher, so it reads as surface rather than as more
    // wind. It is the same noise, and it does not matter that it is.
    this.waterFilter = ctx.createBiquadFilter()
    this.waterFilter.type = 'bandpass'
    this.waterFilter.frequency.value = 1300
    this.waterFilter.Q.value = 1.1
    this.waterGain = ctx.createGain()
    this.waterGain.gain.value = 0
    this.src.connect(this.waterFilter).connect(this.waterGain).connect(this.bus)

    this.src.start()
    this.built = true
    return true
  }

  /**
   * @param gust      0..1, the same number the petals and the sway read
   * @param wetness   0..1, how much open water is near the player
   * @param day       0..1 from the sky, so the bed thins out after dark
   * @param swimming  the player is in the water
   */
  update(dt, { gust = 0, wetness = 0, day = 1, swimming = false } = {}) {
    if (!this.built && !this._build()) return
    if (this.audio.muted) return
    const t = this.audio.ctx.currentTime

    // Wind is quieter at night and never silent. `setTargetAtTime` rather than a
    // ramp per frame: the audio thread interpolates, and sixty scheduled ramps a
    // second is sixty events a second on a value nobody can hear change.
    const windLevel = (0.012 + gust * 0.05) * (0.55 + day * 0.45)
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.35)
    this.windFilter.frequency.setTargetAtTime(340 + gust * 900, t, 0.5)

    const waterLevel = (wetness * 0.045 + (swimming ? 0.06 : 0)) * (0.6 + day * 0.4)
    this.waterGain.gain.setTargetAtTime(waterLevel, t, 0.4)
    this.waterFilter.frequency.setTargetAtTime(swimming ? 900 : 1300, t, 0.5)

    this.wind = windLevel
    this.water = waterLevel
  }

  /**
   * One footfall.
   *
   * @param ground  a `G.*` value — what is under the foot
   * @param running whether they are running, which is louder and shorter
   * @param swimming a stroke rather than a step
   */
  step(ground, running = false, swimming = false) {
    const a = this.audio
    if (!a.ready || a.muted) return
    if (swimming) {
      a._burst({ dur: 0.26, gain: 0.05, type: 'lowpass', freq: 700, sweep: 0.5, q: 0.7 })
      return
    }
    const s = STEP_TONES[ground] ?? STEP_DEFAULT
    // Per-step jitter, so a walk is not a metronome of identical clicks. This is
    // the entire difference between footsteps and a ticking noise.
    const j = 0.86 + Math.random() * 0.28
    a._burst({
      dur: s.dur * j,
      gain: s.gain * (running ? 1.35 : 1) * j,
      type: s.type,
      freq: s.freq * j,
      q: s.q,
      sweep: 0.55,
    })
  }

  dispose() {
    try { this.src?.stop() } catch { /* already stopped */ }
  }
}
