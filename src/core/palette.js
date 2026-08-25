/**
 * Colour, in two halves that must never be mixed up.
 *
 * ## The world — Velion's palette
 *
 * EOF-001 is a planet whose colour grading was set by a machine that has
 * stopped maintaining it. Nothing is fully saturated and everything is pulled a
 * long way toward lavender.
 *
 * Sampled off the reference footage rather than invented: meadow tops are a
 * pale khaki-olive (#c8c0a8), every cliff face below the lip is lilac
 * (#c8b8c8), the water is a genuinely saturated blue-violet (#7060b0) going
 * pale at the shallows, and the canopies are lilac and blush pink on plum
 * trunks. The daytime fill light is violet too, and bright — which is the other
 * half of why the reference is pastel rather than dusty.
 *
 * This is deliberately NOT the brand palette. A farming game is a colour-sorting
 * game: the player reads a field by hue from forty units away, and pressing the
 * whole world into one brown band destroys exactly the thing they need. An
 * earlier pass did that and the valley came out as sepia mud.
 *
 * ## The interface — Seismic's colourway
 *
 * Warm stone, cream paper, ink, and the rose mark. It covers the HUD, the
 * panels, the title and the mark — and the two things in the world that belong
 * to Seismic rather than to the valley: Rocky, and the stone the Loom builds
 * with.
 *
 * The interface has to be QUIETER than the world. The world is muted; a HUD of
 * bright cards takes the frame off it. Hairlines, small type, one accent, no
 * rounded cartoon panels.
 *
 * `tools/checks.js` asserts the `UI` block stays inside Seismic's band, and
 * that the world block is exempt from it.
 */

const clamp = (v) => Math.max(0, Math.min(255, v))
export const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const hexOf = (c) => '#' + c.map((v) => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('')
export const mix = (a, b, t) => {
  const A = rgb(a), B = rgb(b)
  return hexOf(A.map((v, i) => v + (B[i] - v) * t))
}

/** Shadow is not "the colour times 0.6" — under this sky a surface loses red
 *  fastest and blue slowest, which is what keeps a shaded face lavender rather
 *  than grey. */
export const SHADOW_TRANSFER = [0.58, 0.61, 0.78]
export const shade = (hex, k = 1) => hexOf(rgb(hex).map((v, i) => v * (1 + (SHADOW_TRANSFER[i] - 1) * k)))
export const sunlit = (hex, k = 1) => hexOf(rgb(hex).map((v, i) => v / (1 + (SHADOW_TRANSFER[i] - 1) * k)))

// ============================================================== the world ==

export const C = {
  // ---------------------------------------------------------------- water --
  // Sampled off the reference: a genuinely saturated blue-violet in the deep,
  // going pale lilac at the shallows. Not a desaturated slate — the water is the
  // one place the world is allowed to be a colour.
  waterDeep: '#6a58ac', waterShallow: '#a294c4', waterFoam: '#ddd6ee',

  // -------------------------------------------------------------- foliage --
  // Trunks are dark plum, near-aubergine. Against a lilac cliff a brown trunk
  // reads as a mistake; the plum is what ties the trees into the ground.
  trunk: '#5a3550', trunkDark: '#482940',
  canopyA: '#cfc6e0', canopyB: '#e0c8d8', canopyC: '#c6c8e2', canopyDead: '#b3a8b8',
  shrub: '#9aa878', shrubDeep: '#7c8a5e', grass: '#bdb694', grassDry: '#cfc7a8',

  // ---------------------------------------------------------------- props --
  stoneProp: '#c2bcc8', stonePropDark: '#a89eb2',

  // --------------------------------------------------------------- player --
  skin: '#e2b48f', hair: '#3a2b33',
  jacket: '#3e7c8c', jacketDark: '#2f6270',
  trousers: '#2a3352', boots: '#1e2436',
  pack: '#d2603a', packStrap: '#8f4028',

  // -------------------------------------------------------------- the dog --
  dogCoat: '#c9a68e', dogDark: '#a5836c', dogCollar: '#c05a3c',

  // ----------------------------------------------------------------- fire --
  fireCore: '#ffd9a0', fireMid: '#ff9a4d', fireLow: '#e5502a', ember: '#ff8a3d',
}

/**
 * Ground: four colours per material — the flat top, then three strata read
 * top-to-bottom down any exposed cliff. The thin accent and rust bands are the
 * whole reason the terraces read as sedimentary rather than as staircases.
 *
 * **The body is LILAC, not tan.** This is the single colour that decides whether
 * the valley looks like the reference or not: the tops are khaki-olive, there is
 * a sage hairline and then a rust hairline under the lip, and the whole face of
 * every cliff below that is pale mauve. An earlier pass gave the bodies warm tan
 * bodies and the world came out as a beige quarry with purple trees in it.
 * Sampled off the reference footage: top #c8c0a8, body #c8b8c8.
 */
export const GROUND = {
  MEADOW: ['#c6bfa4', '#9aa878', '#b4553c', '#c6b6c6'],
  ASH: ['#e6e2ec', '#d2ccdc', '#a89ab0', '#d8cee0'],
  LOAM: ['#bfa198', '#a88a84', '#8e5e4c', '#b3a0bc'],
  STONE: ['#c2bcc8', '#aca6b6', '#8f8595', '#b6aac0'],
  SHORE: ['#ddd4bc', '#cbc0a6', '#b7a68e', '#cdbfd0'],
  TILLED: ['#8d6a55', '#7a5a48', '#6b4c3c', '#8a6f84'],
  WET: ['#6b4c3e', '#5d4034', '#4f352b', '#6b5468'],
  SCAR: ['#c9bcc8', '#b3a2b2', '#8d6f7e', '#bdaec2'],
}
export const GROUND_KEYS = Object.keys(GROUND)
export const G = Object.fromEntries(GROUND_KEYS.map((k, i) => [k, i]))

// ========================================================== the interface ==

export const UI = {
  stoneLit: '#c69b72',
  stonePale: '#d9b48b',
  stone: '#a77d5f',
  stoneMid: '#9a7354',
  stoneDeep: '#7a553d',
  stoneDark: '#624a43',
  stoneShadow: '#4a3529',
  ink: '#241a16',

  cream: '#faf4ea',
  creamWarm: '#f2e6d2',
  creamDeep: '#ead4ac',
  creamShade: '#dcc09a',
  parchment: '#e6d5b8',

  // Seismic's shard. Nothing else in the game is allowed this hue.
  rose: '#df9d9b',
  roseDeep: '#b06d70',
  roseGlow: '#f0c6c0',
}

/** Material constants, so two things cut from the same stone cannot drift. */
export const M = {
  ground: { roughness: 0.95, metalness: 0 },
  stone: { roughness: 0.84, metalness: 0 },
  polished: { roughness: 0.46, metalness: 0.06 },
  wood: { roughness: 0.7, metalness: 0 },
  foliage: { roughness: 0.9, metalness: 0 },
  cloth: { roughness: 0.9, metalness: 0 },
  metal: { roughness: 0.3, metalness: 0.62 },
  shard: { roughness: 0.16, metalness: 0.04 },
}

// ================================================================ daylight ==

/**
 * A key-framed 24-hour grade, ported from Velion.
 *
 * Key-framed and not computed. A cosine curve gives a sky that is technically
 * correct and reads as a lamp on a dimmer: dawn arrives at the wrong rate, dusk
 * has no colour in it, and the two look identical. These ten frames were placed
 * by eye — the horizon goes apricot at 06:00 while the zenith is still blue,
 * noon is faintly lilac rather than white, and 19:36 has a rose band that lasts
 * about twenty minutes and is the best-looking part of the day.
 *
 * The daytime AMBIENT is violet and strong. That is the second half of why the
 * reference looks the way it does: it is not just that the surfaces are lilac,
 * it is that the fill light is too, and it is bright enough to keep the whole
 * frame low-contrast and pastel. A warm-grey fill at half this energy turns the
 * same surfaces into dusty stone.
 */
const SKY = [
  { t: 0.0, top: '#1d2733', hor: '#2b3540', fog: '#2c3742', sun: '#5d6f8f', energy: 0.16, amb: '#46566e', ambE: 0.62 },
  { t: 4.4, top: '#243046', hor: '#3d4356', fog: '#3a3f52', sun: '#6a7396', energy: 0.22, amb: '#4d5a78', ambE: 0.64 },
  { t: 6.0, top: '#6d7ba0', hor: '#e0a583', fog: '#c8a496', sun: '#ffb887', energy: 0.72, amb: '#8c8298', ambE: 0.62 },
  { t: 8.0, top: '#b9c2dc', hor: '#e8d9c4', fog: '#d9d2e0', sun: '#ffe6c8', energy: 0.96, amb: '#bcb6d2', ambE: 0.9 },
  { t: 12.0, top: '#c7c6e2', hor: '#e9e2ea', fog: '#d6cfe4', sun: '#fff4e2', energy: 1.06, amb: '#c4bcda', ambE: 0.98 },
  { t: 16.0, top: '#c2c0dd', hor: '#ecdfd6', fog: '#d3cade', sun: '#ffeeda', energy: 1.0, amb: '#c2b8d4', ambE: 0.94 },
  { t: 18.2, top: '#8e88b4', hor: '#e9ab84', fog: '#c9a091', sun: '#ffb073', energy: 0.78, amb: '#9a8ba0', ambE: 0.64 },
  { t: 19.6, top: '#4d4a70', hor: '#a3708b', fog: '#7d6a86', sun: '#c98a8c', energy: 0.4, amb: '#6d6a8a', ambE: 0.62 },
  { t: 21.0, top: '#22303a', hor: '#33414a', fog: '#33404a', sun: '#66788f', energy: 0.18, amb: '#495a6e', ambE: 0.62 },
  { t: 24.0, top: '#1d2733', hor: '#2b3540', fog: '#2c3742', sun: '#5d6f8f', energy: 0.16, amb: '#46566e', ambE: 0.62 },
]

const smoothstep01 = (k) => k * k * (3 - 2 * k)

/**
 * Sample the grade at `hour`. Everything the renderer needs to light a frame
 * comes out of here, so the dome, the fog, both lights and the water cannot
 * disagree about what time it is.
 */
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24
  let a = SKY[0]
  let b = SKY[SKY.length - 1]
  for (let i = 0; i < SKY.length - 1; i++) {
    if (h >= SKY[i].t && h <= SKY[i + 1].t) {
      a = SKY[i]
      b = SKY[i + 1]
      break
    }
  }
  const span = b.t - a.t
  // Smoothstepped, or dawn arrives as a hard cut at exactly 06:00.
  const k = span <= 0 ? 0 : smoothstep01(Math.max(0, Math.min(1, (h - a.t) / span)))
  const keyEnergy = a.energy + (b.energy - a.energy) * k
  const day = Math.max(0, Math.min(1, (keyEnergy - 0.16) / 1.02))
  return {
    day,
    high: mix(a.top, b.top, k),
    low: mix(a.hor, b.hor, k),
    fog: mix(a.fog, b.fog, k),
    key: mix(a.sun, b.sun, k),
    ambient: mix(a.amb, b.amb, k),
    keyEnergy,
    ambientEnergy: a.ambE + (b.ambE - a.ambE) * k,
    starAlpha: Math.max(0, 1 - day * 3.2),
    // The haze range. Wide by day, close after dark — the cheapest way to make
    // a valley feel small at night without touching a single light.
    fogNear: 16 + day * 30,
    fogFar: 54 + day * 118,
  }
}

/** Where the sun stands at a given hour, in world space. Clamped above the
 *  horizon so shadows never invert and shoot up out of the ground at dusk. */
export function sunDirAt(hour) {
  const t = ((hour - 6) / 12) * Math.PI // 0 at dawn, PI at dusk
  return [Math.cos(t) * 0.72, Math.max(0.12, Math.sin(t)) * 0.92, 0.42 + Math.cos(t) * 0.2]
}

/** Deterministic per-cell colour jitter, so a large flat never reads as dead
 *  paint. Blue is nudged slightly harder than red — the lavender pull the whole
 *  world is graded with, applied at cell scale. */
export function jitter(hex, x, z, amount = 0.022) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263)
  h = Math.imul(h ^ (h >> 13), 1274126177)
  h ^= h >> 16
  const n = ((h & 0xffff) / 65535 - 0.5) * amount * 255
  const [r, g, b] = rgb(hex)
  return hexOf([r + n, g + n, b + n * 1.15])
}
