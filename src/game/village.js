import { seasonalSeeds } from './crops.js'
import { KIND, item, valueOf } from './items.js'

// Shared by the simulation, villagers and their portraits. No renderer state.
export const VILLAGERS = [
  { id: 'marn', name: 'Marn', role: 'Seeds & produce', color: '#77977e',
    look: { cap: '#c5ad78', capDark: '#776443', shirt: '#f2e8cd', sleeve: '#719882', belt: '#b78556', skin: '#d9a173', trouser: '#405a55', boot: '#302b32', hair: '#543b2e', headgear: 'brim', pack: 'basket' },
    gift: 'grubwort', request: 'grubwort', amount: 3, reward: 90,
    lines: ['I saved you a few seedlings. The little fenced patch by your doorstep is yours. Water it, then get some sleep.', 'Four watered nights for grubwort. Dry soil pauses growth, so check the blue drops before you turn in.', 'I buy your harvest here, or you can leave it in the shipping crate for tomorrow. Keep the seeds; you will want them.'],
    friendly: 'Your vegetables are getting a reputation. Mine took three seasons to stop tasting like the watering can.' },
  { id: 'tace', name: 'Tace', role: 'Carpenter', color: '#bb7e60',
    look: { cap: '#ad6c50', capDark: '#653f36', shirt: '#e8d3b1', sleeve: '#a5664b', belt: '#715342', skin: '#b87a4e', trouser: '#493d4b', boot: '#30242d', hair: '#32282b', headgear: 'band', pack: 'roll' },
    gift: 'wood', request: 'wood', amount: 8, reward: 70,
    lines: ['A cabin first. Then a proper farmhouse. Bring wood, stone and 250 coin, and we can make that roof worth coming home to.', 'The ruined cottages come with their own growing plots. Rebuild one and the ground behind it is yours to farm.', 'The old kiln makes cut stone: three rough stones for one clean block. Repair it before planning a bigger house.'],
    friendly: 'I made your door a little wider. For the baskets of vegetables, obviously. Not for the dog.' },
  { id: 'odile', name: 'Odile', role: 'Pond keeper', color: '#9290b8',
    look: { cap: '#9c89b9', capDark: '#615470', shirt: '#e6ddee', sleeve: '#8e82a7', belt: '#ca9d70', skin: '#f0d0b4', trouser: '#514a70', boot: '#302c45', hair: '#67402c', headgear: 'bare', pack: 'satchel' },
    gift: 'silverfin', request: 'silverfin', amount: 2, reward: 85,
    lines: ['The pond is just east of your farm. Bring your rod. Fish sell well while you wait for the first crop.', 'Wait for the float to go under. One patient cast beats six impatient ones.', 'Rain does the watering for you. On rainy days I leave my boots by the door and pretend that was the plan.'],
    friendly: 'I kept the quiet spot by the reeds for you. Sixteen can come too, if she promises not to help.' },
]

export const villager = (id) => VILLAGERS.find((v) => v.id === id)
export const HOME_NAMES = ['','Field cabin', 'Farmhouse', 'Garden house', 'Valley homestead']
export const marketStock = (season) => [...seasonalSeeds(season), 'sap_ridgepine', 'sap_bellwood', 'sap_ironbark']
export const buyPrice = (id) => Math.max(2, Math.round(valueOf(id) * (item(id).kind === KIND.SEED ? 1.6 : 1.5)))
export const canSell = (id) => [KIND.CROP, KIND.RESOURCE].includes(item(id).kind) && valueOf(id) > 0

export function portrait(v) {
  const l = v.look
  return `<svg viewBox="0 0 80 88" role="img" aria-label="${v.name}"><rect width="80" height="88" rx="3" fill="${v.color}" opacity=".18"/><path d="M12 88V64L27 54H53L68 64V88" fill="${l.sleeve}"/><path d="M29 57H51V88H29" fill="${l.shirt}"/><path d="M33 53H47V64H33" fill="${l.skin}"/><rect x="21" y="18" width="38" height="39" rx="10" fill="${l.skin}"/><path d="M19 33V18L28 10H52L62 21V35L54 28V22H29V30Z" fill="${l.hair}"/><path d="M20 22L27 10H53L60 22Z" fill="${l.cap}"/><path d="M${l.headgear === 'brim' ? '10' : '22'} 22H${l.headgear === 'brim' ? '70' : '58'}V27H${l.headgear === 'brim' ? '10' : '22'}Z" fill="${l.capDark}"/><rect x="30" y="35" width="4" height="5" rx="1" fill="#30242d"/><rect x="47" y="35" width="4" height="5" rx="1" fill="#30242d"/><path d="M36 47Q40 50 45 46" fill="none" stroke="#85594b" stroke-width="2"/><path d="M29 72H51V77H29" fill="${l.belt}"/></svg>`
}
