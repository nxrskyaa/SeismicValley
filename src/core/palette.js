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
  waterDeep: '#6f66a8', waterShallow: '#9c95cf', waterFoam: '#d9d4ee',

  // -------------------------------------------------------------- foliage --
  // Trunks are dark plum, near-aubergine. Against a lilac cliff a brown trunk
  // reads as a mistake; the plum is what ties the trees into the ground.
  trunk: '#7d5578', trunkDark: '#6a4566',
  // Sampled off the footage at #b194a6 and #c0a9ae under daylight: the wood is
  // pink, with lilac in it rather than the other way round. Velion's third tone
  // was a blue-grey and it was the one that read as the odd tree out.
  canopyA: '#e0c6d8', canopyB: '#e8cbd6', canopyC: '#d3c4dd', canopyDead: '#bdb0b6',
  shrub: '#8f9c62', shrubDeep: '#71804a', grass: '#9fb083', grassDry: '#c2b98f',

  // ---------------------------------------------------------------- props --
  stoneProp: '#c3bccb', stonePropDark: '#a49dae',

  // --------------------------------------------------------------- player --
  skin: '#e2b48f', hair: '#3a2b33',
  jacket: '#3e7c8c', jacketDark: '#2f6270',
  trousers: '#2a3352', boots: '#1e2436',
  pack: '#d2603a', packStrap: '#8f4028',

  // ----------------------------------------------------------------- fish --
  // Read through translucent violet water, so they are authored a step warmer
  // than they should be — under the plane they come out the right colour.
  fishA: '#aab6dc', fishB: '#c99b76', fishC: '#8fc4c8', fishBelly: '#efe8d6',

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
/**
 * THE GROUND, back to Velion's table.
 *
 * Each material is four colours: the flat top, then three strata read
 * top-to-bottom on any exposed cliff. The thin sage accent and the rust band
 * under it are what give the terraces their sedimentary look, and they are most
 * of what makes a step read as a step.
 *
 * These are Velion's Godot values verbatim, and they replace a much darker set
 * this project had drifted into. Sampling the reference footage again settles
 * it: the ground is PALE SAND, with a sage-green lip and a rust line under it —
 * the sage is the accent band on the cliff edge, not the colour of the field.
 * Reading that band as the ground colour is how the meadow ended up dark olive,
 * and with a dark top the sage lip had nothing to contrast against, so the whole
 * sedimentary read was lost and the valley went heavy.
 */
export const GROUND = {
  // Sand meadow, and the one material with the full four-band read: pale sand
  // top, sage lip, rust band, warm pale body.
  // Quantising the reference footage puts its lit ground at #c8c0a9 to #c4bb9e —
  // greyer and a shade greener than Velion's raw sand, which reads a touch too
  // yellow next to it. Divided back out of the daylight, that is about this.
  // Solved rather than eyeballed. Quantised, the footage's open ground sits at
  // #c8c0a9 — R:G:B of 1 : 0.96 : 0.85. Dividing the daylight back out of that
  // gives a ground that is far LESS yellow than it looks: the warmth in the
  // frame is the sun, not the field. Authored at 1 : 0.98 : 0.90.
  MEADOW: ['#d3d0be', '#9fb083', '#b4553c', '#c6c1ab'],
  // Snow. Near-white, and almost no banding — the reference's snow plateaus are
  // one white top over one faintly cooler face, and adding strata to them is
  // what makes a snowfield look like striped rock.
  ASH: ['#e9e4ef', '#cfc9dc', '#a08c9c', '#cdc6d4'],
  // Clay. A darker version of its own top, no sage, no rust.
  LOAM: ['#c49a86', '#a87f6d', '#8e5e4c', '#b08a78'],
  STONE: ['#cdc6d2', '#b3aabb', '#8f8595', '#a89fb0'],
  SHORE: ['#e6dcc2', '#d4c8ae', '#b7a68e', '#cbbda2'],
  TILLED: ['#8d6a55', '#7a5a48', '#6b4c3c', '#7f5f4c'],
  WET: ['#6b4c3e', '#5d4034', '#4f352b', '#5e4238'],
  SCAR: ['#d8cdd6', '#b9a7b4', '#8d6f7e', '#bfb1bb'],
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

  // Seismic's crystal. Vivid magenta, not dusty rose — sampled off the
  // reference sheet, where it is the single most saturated thing in any frame
  // and is doing the whole job of saying "Seismic". Nothing else in the game is
  // allowed this hue.
  rose: '#e0479b',
  roseDeep: '#b02f7a',
  roseGlow: '#f487c4',
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
 * ## The two scales, and why the fill is not strong
 *
 * `energy` and `ambE` are Velion's raw numbers; `SUN_SCALE` and `AMBIENT_SCALE`
 * are what turn them into daylight, and the RATIO between them is the whole
 * modelling of the world. At 0.72 and 0.56 a surface square-on to the sun lands
 * near its authored colour and a surface turned away lands near half of it.
 *
 * This project had drifted to a fill almost as strong as the key, which flattens
 * every terrace face into the same value as the top it sits under — pale sand
 * over pale sand — and the terracing stops being visible at all. The palette was
 * the obvious suspect and it was not the problem; the ratio was.
 */
const SKY = [
  { t: 0.0, top: '#1d2733', hor: '#2b3540', fog: '#2c3742', sun: '#5d6f8f', energy: 0.16, amb: '#46566e', ambE: 0.62 },
  { t: 4.4, top: '#243046', hor: '#3d4356', fog: '#3a3f52', sun: '#6a7396', energy: 0.22, amb: '#4d5a78', ambE: 0.64 },
  { t: 6.0, top: '#6d7ba0', hor: '#e0a583', fog: '#c8a496', sun: '#ffb887', energy: 0.72, amb: '#8c8298', ambE: 0.62 },
  { t: 8.0, top: '#b9c2dc', hor: '#e8d9c4', fog: '#dcd0cc', sun: '#ffeed9', energy: 1.02, amb: '#c9c0b4', ambE: 0.74 },
  { t: 12.0, top: '#c7c6e2', hor: '#e9e2ea', fog: '#cfc6dc', sun: '#fff8ec', energy: 1.18, amb: '#ccc2b8', ambE: 0.80 },
  { t: 16.0, top: '#c2c0dd', hor: '#ecdfd6', fog: '#d3c8d6', sun: '#fff2e4', energy: 1.10, amb: '#cabfb6', ambE: 0.78 },
  { t: 18.2, top: '#8e88b4', hor: '#e9ab84', fog: '#c9a091', sun: '#ffb073', energy: 0.78, amb: '#9a8ba0', ambE: 0.64 },
  { t: 19.6, top: '#4d4a70', hor: '#a3708b', fog: '#7d6a86', sun: '#c98a8c', energy: 0.40, amb: '#6d6a8a', ambE: 0.62 },
  { t: 21.0, top: '#22303a', hor: '#33414a', fog: '#33404a', sun: '#66788f', energy: 0.18, amb: '#495a6e', ambE: 0.62 },
  { t: 24.0, top: '#1d2733', hor: '#2b3540', fog: '#2c3742', sun: '#5d6f8f', energy: 0.16, amb: '#46566e', ambE: 0.62 },
]

/**
 * Daylight units. A surface square-on to the sun displays at roughly
 * `SUN_SCALE * energy + AMBIENT_SCALE * ambE` times its authored colour, so at
 * midday those two sum to about 1.3 and the world sits a little above its own
 * hex values in full sun. Velion's numbers, and the ratio is the load-bearing
 * part — see the note above the table.
 */
export const SUN_SCALE = 0.72
export const AMBIENT_SCALE = 0.56

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
