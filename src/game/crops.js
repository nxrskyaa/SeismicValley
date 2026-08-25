import { C } from '../core/palette.js'

/**
 * What grows, and how long it takes.
 *
 * Five stages — 0 sown, 1 sprout, 2 young, 3 grown, 4 ripe — and `days` holds
 * the four gaps between them, so time to first harvest is `days.sum()`. A day
 * only counts if the tile was watered, which is what makes the watering can a
 * verb rather than a chore with no consequence.
 *
 * `form` decides the mesh, not the colour: a player picks out a field of
 * ravelcorn by its silhouette from thirty units away, and by its colour never.
 */

/**
 * The four seasons on EOF-001 are not astronomical. They are *scheduled* — the
 * Loom sets their length — which is why they are named after entries in an
 * operations calendar rather than after weather.
 */
export const SEASON = { THAW: 0, LONGLIGHT: 1, RUST: 2, STILL: 3 }
export const SEASON_NAMES = ['Thaw', 'Longlight', 'Rust', 'Still']
export const SEASON_SHORT = ['THW', 'LGL', 'RST', 'STL']
export const SEASON_DAYS = 21

export const FORM = { LEAFY: 0, GRAIN: 1, VINE: 2, ROOT: 3, FUNGUS: 4, BULB: 5 }

export const CROPS = {}
export const CROP_ORDER = []

const crop = (id, seasons, days, regrow, amount, form, stem, leaf, fruit, height) => {
  CROPS[id] = {
    id, seasons, days, regrow, yield: amount, form,
    stem, leaf, fruit, height,
    total: days.reduce((a, b) => a + b, 0),
  }
  CROP_ORDER.push(id)
}

// id, seasons, days per stage, regrow (0 = one-shot), yield, form, stem, leaf, fruit, height
crop('grubwort', [0, 1, 2, 3], [1, 1, 1, 1], 0, 1, FORM.LEAFY, '#7c7a52', '#93925e', '#a7a274', 0.34)
crop('palewheat', [0], [1, 1, 1, 1], 0, 2, FORM.GRAIN, '#b8ab84', '#cabc93', '#ddcb9c', 0.66)
crop('cinderroot', [0], [1, 1, 2, 1], 0, 1, FORM.ROOT, '#8a8a5e', '#9c9a70', '#c0704a', 0.3)
crop('duskflax', [0, 1], [2, 2, 2, 1], 3, 1, FORM.LEAFY, '#8d7d54', '#a89468', '#c2a06a', 0.54)
crop('emberberry', [1], [2, 2, 2, 2], 2, 1, FORM.VINE, '#6f6c46', '#8a865a', '#b8512f', 0.5)
crop('glassmelon', [1], [3, 3, 3, 2], 0, 1, FORM.VINE, '#7d7a52', '#93906a', '#d8c39a', 0.4)
crop('ravelcorn', [1, 2], [2, 3, 2, 2], 4, 1, FORM.GRAIN, '#89895a', '#a09c6c', '#dcb35f', 0.94)
crop('rustbean', [2], [1, 2, 2, 1], 0, 2, FORM.VINE, '#7a6a4e', '#96866a', '#a06341', 0.46)
crop('ashroot', [2], [2, 2, 3, 2], 0, 1, FORM.ROOT, '#9a9384', '#b3ab99', '#cbbb9e', 0.34)
crop('nightcap', [2, 3], [2, 2, 2, 1], 0, 2, FORM.FUNGUS, '#b3a288', '#a2907a', '#a08769', 0.26)
crop('frostpea', [3], [2, 2, 2, 2], 3, 2, FORM.LEAFY, '#93916e', '#aaa886', '#c3b48e', 0.48)
crop('glowbulb', [3], [3, 3, 3, 3], 0, 1, FORM.BULB, '#9aa08a', '#b0b59c', '#e2c375', 0.44)

/** Cell values store crop index + 1, so 0 can mean "bare". */
export const cropIndex = (id) => CROP_ORDER.indexOf(id) + 1
export const cropAt = (v) => (v > 0 ? CROPS[CROP_ORDER[v - 1]] : null)
export const cropIdAt = (v) => (v > 0 ? CROP_ORDER[v - 1] : null)
export const seedFor = (id) => `seed_${id}`
export const cropForSeed = (seedId) => seedId.replace(/^seed_/, '')

export const growsIn = (id, season) => !!CROPS[id]?.seasons.includes(season)

/** Which stage (0-4) a crop is at after `grown` watered days. */
export function stageFor(id, grown) {
  const c = CROPS[id]
  if (!c) return 0
  let acc = 0
  for (let i = 0; i < 4; i++) {
    acc += c.days[i]
    if (grown < acc) return i
  }
  return 4
}

export const isRipe = (id, grown) => stageFor(id, grown) >= 4

/** How many watered days a regrowing crop loses when it is picked. Returns -1
 *  for a one-shot crop, which is the signal to clear the tile instead. */
export function regrowReset(id) {
  const c = CROPS[id]
  if (!c || c.regrow <= 0) return -1
  return c.total - c.regrow
}

export const seasonalSeeds = (season) =>
  CROP_ORDER.filter((id) => CROPS[id].seasons.includes(season)).map(seedFor)

// ------------------------------------------------------------------ trees --

export const TREES = {
  ridgepine: { id: 'ridgepine', kind: 0, days: 12, drops: { wood: 8, fibre: 2 }, sapling: 'sap_ridgepine' },
  bellwood: { id: 'bellwood', kind: 1, days: 16, drops: { wood: 6, resin: 2 }, sapling: 'sap_bellwood' },
  ironbark: { id: 'ironbark', kind: 2, days: 22, drops: { wood: 4, hardwood: 3 }, sapling: 'sap_ironbark' },
}
export const TREE_ORDER = Object.keys(TREES)

/** Weather, per day. Rain waters every tilled tile for free, which is the one
 *  thing that can make a player glad to lose a day of sunshine. */
export const WEATHER = {
  CLEAR: { id: 'clear', label: 'Clear', rain: false },
  HAZE: { id: 'haze', label: 'Ash haze', rain: false },
  RAIN: { id: 'rain', label: 'Rain', rain: true },
  STORM: { id: 'storm', label: 'Storm', rain: true },
}
export const WEATHER_ORDER = ['CLEAR', 'HAZE', 'RAIN', 'STORM']

/** Odds per season. Longlight is dry on purpose — it is the season the watering
 *  can is supposed to hurt, and it is the season the rollback happened in. */
export const WEATHER_ODDS = [
  [0.5, 0.14, 0.3, 0.06], // Thaw
  [0.66, 0.2, 0.12, 0.02], // Longlight
  [0.44, 0.22, 0.26, 0.08], // Rust
  [0.5, 0.3, 0.16, 0.04], // Still
]

export const CROP_TINT = { stem: C.shrubDeep, leaf: C.shrub }
