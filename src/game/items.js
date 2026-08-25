import { C, UI } from '../core/palette.js'

/**
 * The catalogue.
 *
 * Every item is a row here and an icon drawn in code from `glyph` + `tint`, so
 * the game ships without a single image file. Values are in coin; `stack` is
 * how many fit in one slot.
 */

export const KIND = { TOOL: 0, RESOURCE: 1, SEED: 2, CROP: 3, SAPLING: 4, RELIC: 5 }

/** Icon shapes. `src/ui/icons.js` draws one canvas path per glyph. */
export const GLYPH = {
  HOE: 'hoe', CAN: 'can', AXE: 'axe', PICK: 'pick', SCYTHE: 'scythe',
  LOG: 'log', ROCK: 'rock', FIBRE: 'fibre', DROP: 'drop', SHARD: 'shard',
  POUCH: 'pouch', LEAF: 'leaf', BERRY: 'berry', ROOT: 'root', GRAIN: 'grain',
  BULB: 'bulb', CAP: 'cap', MELON: 'melon', SPROUT: 'sprout', GEODE: 'geode',
  BLOCK: 'block', COIN: 'coin', TAG: 'tag', CHIP: 'chip',
}

export const ITEMS = {}

const def = (id, name, kind, glyph, tint, stack, value, desc) => {
  ITEMS[id] = { id, name, kind, glyph, tint, stack, value, desc }
}

// ------------------------------------------------------------------ tools --
def('hoe', 'Hoe', KIND.TOOL, GLYPH.HOE, UI.stonePale, 1, 0,
  'Breaks ground. The blade is stamped with a survey number nobody kept the register for.')
def('can', 'Watering Can', KIND.TOOL, GLYPH.CAN, UI.creamShade, 1, 0,
  'Holds forty. Refill at any standing water, or at the well once you have built one.')
def('axe', 'Axe', KIND.TOOL, GLYPH.AXE, UI.stoneLit, 1, 0,
  'For felling. The head is older than the handle by about seventy years.')
def('pick', 'Pick', KIND.TOOL, GLYPH.PICK, UI.stone, 1, 0,
  'Breaks stone, and opens a geode without spoiling what is inside it.')
def('scythe', 'Scythe', KIND.TOOL, GLYPH.SCYTHE, UI.creamDeep, 1, 0,
  'Clears growth without disturbing the soil under it.')

// -------------------------------------------------------------- resources --
def('wood', 'Wood', KIND.RESOURCE, GLYPH.LOG, C.trunk, 999, 4,
  'Cut, not grown. Everything in this valley has that distinction now.')
def('hardwood', 'Ironbark', KIND.RESOURCE, GLYPH.LOG, C.trunkDark, 999, 22,
  'Grew slowly enough to survive being un-made.')
def('stone', 'Stone', KIND.RESOURCE, GLYPH.ROCK, UI.stone, 999, 3,
  'Native rock. Predates the seeding by four billion years and does not care.')
def('cutstone', 'Cut Stone', KIND.RESOURCE, GLYPH.BLOCK, UI.stoneLit, 999, 11,
  'Squared at the kiln. The Loom recognises the shape, which is most of the point.')
def('fibre', 'Fibre', KIND.RESOURCE, GLYPH.FIBRE, C.grass, 999, 2,
  'Twisted stems. The valley ran on this before it ran on anything else.')
def('resin', 'Bell Resin', KIND.RESOURCE, GLYPH.DROP, UI.creamDeep, 999, 14,
  'Sets hard and clear. Glazing, adhesive, and once a preservative for bodies.')
def('ashglass', 'Ash Glass', KIND.RESOURCE, GLYPH.SHARD, UI.creamWarm, 999, 30,
  'Sand that happened to be standing up when the Bloom went through it.')
def('geode', 'Sealed Geode', KIND.RESOURCE, GLYPH.GEODE, UI.stoneDeep, 99, 0,
  'Heavy, warm on one face, and rattling. Break it with a pick.')
def('shard', 'Loom Shard', KIND.RELIC, GLYPH.SHARD, UI.rose, 999, 0,
  'Warm on one face. Still trying to run something.')
def('soil_tag', 'Soil-tag', KIND.RELIC, GLYPH.TAG, '#d8cfbc', 999, 0,
  'Fired clay. Twelve seconds of somebody complaining about drainage, and the name of what used to be planted here.')
def('manifest_chip', 'Manifest Chip', KIND.RELIC, GLYPH.CHIP, '#e0a06a', 1, 0,
  'The Vault index. It lists four hundred and six species. The Vault holds none.')

// ------------------------------------------------------------------ crops --
// Seeds and their harvest are declared together; crops.js owns the growth data.
const crop = (id, name, glyph, tint, value, seedTint, desc) => {
  def(id, name, KIND.CROP, glyph, tint, 999, value, desc)
  def(`seed_${id}`, `${name} Seed`, KIND.SEED, GLYPH.POUCH, seedTint, 999, Math.max(1, Math.round(value * 0.45)),
    'Sow on tilled soil.')
}

crop('grubwort', 'Grubwort', GLYPH.LEAF, '#9c9264', 3, '#7e7449', 'Grows in anything. Tastes like it.')
crop('palewheat', 'Palewheat', GLYPH.GRAIN, '#ddcb9c', 18, '#c8b98a', 'Four generations off a bread wheat, and it shows.')
crop('cinderroot', 'Cinderroot', GLYPH.ROOT, '#c0704a', 26, '#a86048', 'Sweetens if you leave it in the ground a day past ripe.')
crop('duskflax', 'Duskflax', GLYPH.FIBRE, '#c2a06a', 34, '#a8895a', 'Retted for fibre. Flowers for one hour a day, at dusk.')
crop('emberberry', 'Emberberry', GLYPH.BERRY, '#b8512f', 46, '#93412a', 'Regrows every other day. Stains everything it touches.')
crop('glassmelon', 'Glass Melon', GLYPH.MELON, '#d8c39a', 130, '#bda87f', 'The rind is translucent. You can watch it ripen from inside.')
crop('ravelcorn', 'Ravelcorn', GLYPH.GRAIN, '#dcb35f', 58, '#c19a4c', 'Twists as it grows. Nobody has established why.')
crop('rustbean', 'Rustbean', GLYPH.BERRY, '#a06341', 40, '#82502f', 'Fixes iron into the soil. Plant it where the ash flats meet the loam.')
crop('ashroot', 'Ashroot', GLYPH.ROOT, '#cbbb9e', 72, '#b0a286', 'Only comes up clean out of ash ground.')
crop('nightcap', 'Nightcap', GLYPH.CAP, '#a08769', 88, '#87715a', 'Fruits in the dark, and only in the dark.')
crop('frostpea', 'Frostpea', GLYPH.LEAF, '#c3b48e', 54, '#a89c7c', 'Sweet only after the first cold night of Still.')
crop('glowbulb', 'Glowbulb', GLYPH.BULB, '#e2c375', 160, '#c3a75f', 'Lights a room for a season. Takes most of one to grow.')

// --------------------------------------------------------------- saplings --
def('sap_ridgepine', 'Ridgepine Sapling', KIND.SAPLING, GLYPH.SPROUT, C.canopyC, 99, 40,
  'Twelve days, and it never asks to be watered.')
def('sap_bellwood', 'Bellwood Sapling', KIND.SAPLING, GLYPH.SPROUT, C.canopyA, 99, 90,
  'Tapped for resin or felled for wood. Not both, and not from the same tree.')
def('sap_ironbark', 'Ironbark Sapling', KIND.SAPLING, GLYPH.SPROUT, C.canopyB, 99, 220,
  'Twenty-two days. The first settlers planted these and never saw one mature.')

export const item = (id) => ITEMS[id] ?? { id, name: id, kind: KIND.RESOURCE, glyph: GLYPH.ROCK, tint: UI.stone, stack: 999, value: 0, desc: '' }
export const nameOf = (id) => item(id).name
export const valueOf = (id) => item(id).value
export const isTool = (id) => item(id).kind === KIND.TOOL

/** The starting kit. Deliberately small: the first hour is meant to be about
 *  what the valley gives you, not about what you arrived with. */
export const STARTING_HOTBAR = ['hoe', 'can', 'axe', 'pick', 'seed_grubwort', 'seed_palewheat', null, null]
