import { C } from '../core/palette.js'

/**
 * WHO YOU ARE.
 *
 * There is exactly one human look in the game and there is going to stay
 * exactly one — the premise is that you are the only person in the valley, and
 * a wardrobe of silhouettes is the first step back toward a village. So this is
 * not a character creator in the usual sense: the rig, the proportions and the
 * cut of the clothes are fixed, and what you choose is what colour they are.
 *
 * That is also the honest answer at this camera height. The player is a hundred
 * pixels tall. Nobody will ever see a face; what they will see, all day, is a
 * cap colour and a shirt colour against olive grass — so those are the two
 * choices that get the most range, and everything else is a supporting note.
 *
 * Every swatch is drawn from the world palette rather than the brand one. The
 * settler stands in the valley, not on a poster.
 */

/** Skin. Six, spanning the range, and none of them a novelty colour. */
export const SKIN = [
  { id: 'ash', label: 'Ash', skin: '#f0d0b4' },
  { id: 'sand', label: 'Sand', skin: C.skin },
  { id: 'clay', label: 'Clay', skin: '#d9a173' },
  { id: 'umber', label: 'Umber', skin: '#b87a4e' },
  { id: 'bark', label: 'Bark', skin: '#8f5a38' },
  { id: 'peat', label: 'Peat', skin: '#5f3a26' },
]

/** The cap. The single most visible object in the game, seen from above all
 *  day, so it gets the widest range of anything here. */
export const CAP = [
  { id: 'survey', label: 'Survey blue', cap: '#7ba8c4', capDark: '#3d6b74' },
  { id: 'rust', label: 'Rust', cap: '#c4794f', capDark: '#8a4d30' },
  { id: 'moss', label: 'Moss', cap: '#7f8a4a', capDark: '#4e5730' },
  { id: 'plum', label: 'Plum', cap: '#8f6d9e', capDark: '#5a3f6b' },
  { id: 'bone', label: 'Bone', cap: '#e2dac6', capDark: '#a99f8a' },
  { id: 'coal', label: 'Coal', cap: '#4a4756', capDark: '#2a2833' },
  { id: 'rose', label: 'Rose', cap: '#d9738f', capDark: '#9c4560' },
  { id: 'ochre', label: 'Ochre', cap: '#d9a83f', capDark: '#96702a' },
]

/** Shirt front and sleeves, chosen as a pair — a front and a sleeve picked
 *  independently is how you get a clown. */
export const SHIRT = [
  { id: 'issue', label: 'Colony issue', shirt: '#e8e0d0', sleeve: '#5f9ec4' },
  { id: 'field', label: 'Field grey', shirt: '#d5d2c6', sleeve: '#78798a' },
  { id: 'canvas', label: 'Canvas', shirt: '#e0cfae', sleeve: '#a87f52' },
  { id: 'kiln', label: 'Kiln', shirt: '#e6c9b4', sleeve: '#b0644a' },
  { id: 'fern', label: 'Fern', shirt: '#dfe0c4', sleeve: '#6d8a4e' },
  { id: 'dusk', label: 'Dusk', shirt: '#cdc6dc', sleeve: '#6e5f96' },
]

/** Trousers and boots, again as a pair, and all of them dark: the legs are the
 *  bottom third of a small figure and a pale leg reads as a gap. */
export const TROUSER = [
  { id: 'navy', label: 'Navy', trouser: '#3a4468', boot: '#1c1e2a' },
  { id: 'loam', label: 'Loam', trouser: '#5a4436', boot: '#2e2119' },
  { id: 'slate', label: 'Slate', trouser: '#4a4a58', boot: '#242430' },
  { id: 'olive', label: 'Olive', trouser: '#4e5334', boot: '#242712' },
  { id: 'wine', label: 'Wine', trouser: '#5c3345', boot: '#2c1722' },
]

/** The strap. One band, and the only warm accent on the figure. */
export const BELT = [
  { id: 'tan', label: 'Tan', belt: '#d9a05a' },
  { id: 'oxblood', label: 'Oxblood', belt: '#9c4a3c' },
  { id: 'brass', label: 'Brass', belt: '#c8a24a' },
  { id: 'pewter', label: 'Pewter', belt: '#9a97a6' },
]

/**
 * THE SHAPE OF THE HEAD, which at this camera is the shape of the person.
 *
 * Everything above was a colour, and colour alone left every settler the same
 * silhouette — which is what "hardly any customisation" means on a figure a
 * hundred pixels tall seen from thirty-seven degrees up. Nobody will ever see a
 * face, so a face is not the thing to offer; the outline is.
 *
 * Rule 4 is untouched. There is still exactly one person in the valley. What
 * changes is how much say you have in what she looks like, and none of these
 * are a step toward a village.
 */
export const HEADGEAR = [
  { id: 'cap', label: 'Field cap' },
  { id: 'hood', label: 'Hood' },
  { id: 'brim', label: 'Wide brim' },
  { id: 'band', label: 'Headband' },
  { id: 'bare', label: 'Bare-headed' },
]

/** Hair, which the headband and the bare head actually show. */
export const HAIR = [
  { id: 'soot', label: 'Soot', hair: '#2f2620' },
  { id: 'coffee', label: 'Coffee', hair: '#4a3226' },
  { id: 'chestnut', label: 'Chestnut', hair: '#6d4126' },
  { id: 'copper', label: 'Copper', hair: '#a5552a' },
  { id: 'wheat', label: 'Wheat', hair: '#c2a15e' },
  { id: 'ash', label: 'Ash grey', hair: '#9a948c' },
]

/** What rides on your back. The second most visible thing from overhead, and
 *  the reason two settlers in the same colours still read apart. */
export const PACK = [
  { id: 'satchel', label: 'Satchel' },
  { id: 'roll', label: 'Bedroll' },
  { id: 'basket', label: 'Basket' },
  { id: 'none', label: 'Nothing' },
]

const TABLES = {
  skin: SKIN, cap: CAP, shirt: SHIRT, trouser: TROUSER, belt: BELT,
  headgear: HEADGEAR, hair: HAIR, pack: PACK,
}

/** The choices that change GEOMETRY rather than colour. The dressing room can
 *  repaint a rig in place for everything else; these need it rebuilt. */
export const SHAPE_KEYS = new Set(['headgear', 'pack'])

/** The default is the settler as she has always been drawn. */
export const DEFAULT_APPEARANCE = {
  name: 'Surveyor',
  skin: 'sand', cap: 'survey', shirt: 'issue', trouser: 'navy', belt: 'tan',
  headgear: 'cap', hair: 'coffee', pack: 'satchel',
}

const pickFrom = (table, id) => table.find((e) => e.id === id) ?? table[0]

/** Flatten a choice set into the flat look object `buildPlayer` wants. */
export function lookFrom(a = DEFAULT_APPEARANCE) {
  const s = pickFrom(SKIN, a.skin)
  const c = pickFrom(CAP, a.cap)
  const h = pickFrom(SHIRT, a.shirt)
  const t = pickFrom(TROUSER, a.trouser)
  const b = pickFrom(BELT, a.belt)
  return {
    cap: c.cap, capDark: c.capDark,
    shirt: h.shirt, sleeve: h.sleeve,
    belt: b.belt, skin: s.skin,
    trouser: t.trouser, boot: t.boot,
    hair: pickFrom(HAIR, a.hair).hair,
    // Shape, not colour — `buildPlayer` branches on these.
    headgear: pickFrom(HEADGEAR, a.headgear).id,
    pack: pickFrom(PACK, a.pack).id,
  }
}

/** One of everything, at random. The dice button on the card. */
export function randomAppearance(name) {
  const roll = (table) => table[Math.floor(Math.random() * table.length)].id
  const out = { name: name ?? DEFAULT_APPEARANCE.name }
  for (const [key, table] of Object.entries(TABLES)) out[key] = roll(table)
  return out
}

// --- persistence ------------------------------------------------------------
// Kept OUT of the save file on purpose. Who you are survives starting a new
// valley; what you built does not.

const KEY = 'seismic-valley.appearance'

export function loadAppearance() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const out = { name: String(raw.name ?? DEFAULT_APPEARANCE.name).slice(0, 18) }
    for (const [key, table] of Object.entries(TABLES)) out[key] = pickFrom(table, raw[key]).id
    return out
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function saveAppearance(a) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch { /* private mode; the choice just does not persist */ }
}

export { TABLES }
