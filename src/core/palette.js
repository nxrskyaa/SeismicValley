/**
 * The one colourway.
 *
 * Seismic's identity is brown stone and cream paper, and Seismic Valley holds
 * to it everywhere — world, characters, buildings and interface. There is no
 * second palette to fall back on and no "just this one accent" escape hatch,
 * because a farming game is a colour-sorting game: the moment a crop is allowed
 * to be blue to tell it apart from a green one, the valley stops being a quarry
 * and starts being a fruit bowl.
 *
 * So everything below lives in one narrow band of hue — roughly 18 degrees
 * (rust) to 58 degrees (ochre) — and separates by VALUE instead. The single
 * exception is `rose`, and it is not an exception at all: the rose shard is
 * Seismic's own mark, the pink stone set into Rocky's chest, and it appears
 * only where that mark appears.
 *
 * tools/checks.js parses this file and fails if any hex in it falls outside the
 * band, so the rule is enforced rather than remembered.
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

/** Shadow is not "the colour times 0.6" — warm stone loses blue fastest and red
 *  slowest, which is what keeps a shaded facet from going grey. */
export const SHADOW_TRANSFER = [0.66, 0.58, 0.49]
export const shade = (hex, k = 1) => hexOf(rgb(hex).map((v, i) => v * (1 + (SHADOW_TRANSFER[i] - 1) * k)))
export const sunlit = (hex, k = 1) => hexOf(rgb(hex).map((v, i) => v / (1 + (SHADOW_TRANSFER[i] - 1) * k)))

export const C = {
  // ---------------------------------------------------------------- stone --
  // The quarry ramp. Every wall, cliff, cairn and golem plate is cut from it.
  stoneLit: '#c69b72',
  stonePale: '#d9b48b',
  stone: '#a77d5f',
  stoneMid: '#9a7354',
  stoneDeep: '#7a553d',
  stoneDark: '#624a43',
  stoneShadow: '#4a3529',
  ink: '#241a16', // the outline colour, and the darkest thing in the game

  // ---------------------------------------------------------------- cream --
  cream: '#faf4ea',
  creamWarm: '#f2e6d2',
  creamDeep: '#ead4ac',
  creamShade: '#dcc09a',
  parchment: '#e6d5b8',

  // ----------------------------------------------------------------- mark --
  // Seismic's shard. Nothing else in the game is allowed this hue.
  rose: '#df9d9b',
  roseDeep: '#b06d70',
  roseGlow: '#f0c6c0',

  // --------------------------------------------------------------- ground --
  meadowTop: '#9a9161', meadowAccent: '#7f7549', meadowRust: '#8a6a44', meadowBody: '#6b503a',
  ashTop: '#c5b391', ashAccent: '#b0997a', ashRust: '#96775a', ashBody: '#6b543f',
  loamTop: '#7d5c42', loamAccent: '#6b4d38', loamRust: '#86583a', loamBody: '#4e3a2c',
  rockTop: '#a89880', rockAccent: '#91806a', rockRust: '#7d6448', rockBody: '#574a3d',
  shoreTop: '#ded0b2', shoreAccent: '#c9b894', shoreRust: '#b0906a', shoreBody: '#7b6449',
  tilledTop: '#6a4b34', tilledAccent: '#5c412d', tilledRust: '#755032', tilledBody: '#453123',
  wetTop: '#4e3728', wetAccent: '#43301f', wetRust: '#5c4028', wetBody: '#33241a',
  scarTop: '#6d4a3f', scarAccent: '#5a3b33', scarRust: '#8a5147', scarBody: '#40292a',

  // ---------------------------------------------------------------- water --
  waterDeep: '#6b5334', waterShallow: '#a88b56', waterFoam: '#f0e2c4',

  // -------------------------------------------------------------- foliage --
  // Dry warm growth. Nothing here is a leaf-green; a valley that has been shaken
  // for forty years does not have a leaf-green left in it.
  canopyPale: '#c3b184', canopy: '#9c8f5c', canopyDeep: '#79693f', canopyDead: '#a8926d',
  trunk: '#6f5238', trunkDark: '#57402c',
  shrub: '#8c8154', shrubDeep: '#6b6140', grass: '#a39a68', grassDry: '#bfae7d',

  // ----------------------------------------------------------------- fire --
  fireCore: '#ffe3ab', fireMid: '#e79a4d', fireLow: '#b8542c', ember: '#d9793a',

  // ---------------------------------------------------------------- light --
  sun: '#ffe6bd', skyHigh: '#c69a70', skyLow: '#f3e2c8', hemiGround: '#7a553d',
  nightHigh: '#2a1f1c', nightLow: '#4a382c', moon: '#f2e6d2', star: '#faf4ea',
  fog: '#e0c6a2',
}

/** Four bands per ground material: the flat top, then three strata read
 *  top-to-bottom down any exposed cliff. The thin accent and rust bands are the
 *  whole reason the terraces read as sedimentary rather than as staircases. */
export const GROUND = {
  MEADOW: [C.meadowTop, C.meadowAccent, C.meadowRust, C.meadowBody],
  ASH: [C.ashTop, C.ashAccent, C.ashRust, C.ashBody],
  LOAM: [C.loamTop, C.loamAccent, C.loamRust, C.loamBody],
  ROCK: [C.rockTop, C.rockAccent, C.rockRust, C.rockBody],
  SHORE: [C.shoreTop, C.shoreAccent, C.shoreRust, C.shoreBody],
  TILLED: [C.tilledTop, C.tilledAccent, C.tilledRust, C.tilledBody],
  WET: [C.wetTop, C.wetAccent, C.wetRust, C.wetBody],
  SCAR: [C.scarTop, C.scarAccent, C.scarRust, C.scarBody],
}
export const GROUND_KEYS = Object.keys(GROUND)
export const G = Object.fromEntries(GROUND_KEYS.map((k, i) => [k, i]))

/** Material constants, so a wall and a cairn cannot drift apart. */
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

/**
 * Sky and key light through one day, sampled at `hour`.
 *
 * Everything the renderer needs to grade a frame comes out of this one function
 * so the sky dome, the fog and the sun can never disagree about what time it
 * is — which is exactly how a game ends up with a lit valley under a night sky.
 */
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24
  // 0 at solar midnight, 1 at noon, with dawn and dusk squeezed either side of 6/18.
  const day = Math.max(0, Math.min(1, (Math.cos(((h - 12) / 24) * Math.PI * 2) + 0.35) / 1.15))
  const golden = Math.max(0, 1 - Math.abs(h - 7.2) / 2.6) + Math.max(0, 1 - Math.abs(h - 17.6) / 2.6)
  const g = Math.min(1, golden)
  return {
    day,
    high: mix(C.nightHigh, mix(C.skyHigh, '#d98d5c', g * 0.55), day),
    low: mix(C.nightLow, mix(C.skyLow, '#f0c08a', g * 0.6), day),
    fog: mix(C.nightLow, mix(C.fog, '#e8b184', g * 0.5), day),
    key: mix(C.moon, mix(C.sun, '#ffb46d', g * 0.7), day),
    keyEnergy: 0.16 + day * 1.55,
    ambient: 0.3 + day * 0.58,
    starAlpha: Math.max(0, 1 - day * 3.2),
    // Night pulls the fog in hard — the cheapest way to make a valley feel small
    // and close after dark without touching a single light. Both the scene fog
    // and the water shader read these, so they cannot disagree about the ramp.
    fogNear: 20 + day * 36,
    fogFar: 62 + day * 130,
  }
}

/** Where the sun stands at a given hour, in world space. Clamped above the
 *  horizon so shadows never invert and shoot up out of the ground at dusk. */
export function sunDirAt(hour) {
  const t = ((hour - 6) / 12) * Math.PI // 0 at dawn, PI at dusk
  return [Math.cos(t) * 0.72, Math.max(0.09, Math.sin(t)) * 0.92, 0.42 + Math.cos(t) * 0.2]
}
