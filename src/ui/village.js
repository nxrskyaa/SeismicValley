import { VILLAGERS, HOME_NAMES, portrait, villager, marketStock, buyPrice, canSell } from '../game/village.js'
import { item, valueOf, KIND } from '../game/items.js'
import { CROPS, cropForSeed, CROP_ORDER, SEASON_NAMES, SEASON_DAYS } from '../game/crops.js'
import { iconFor } from './icons.js'
import { HOME_COST } from '../game/state.js'
import { RESTORE } from '../game/colony.js'
import { emblem } from './emblems.js'

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  n.className = cls ?? ''
  if (html != null) n.innerHTML = html
  return n
}
const button = (label, fn, disabled = false, cls = 'btn') => {
  const b = el('button', cls, label)
  b.type = 'button'
  b.disabled = disabled
  b.addEventListener('click', fn)
  return b
}
const cost = (s, c) => Object.entries(c).map(([id, n]) => `<span class="cost ${s.canAfford({ [id]: n }) ? 'is-ok' : 'is-short'}">${id === 'coin' ? s.coin : s.count(id)} / ${n} ${id === 'coin' ? 'coin' : item(id).name}</span>`).join('')

export function renderVillagePanel(panels, body, kind, payload) {
  const s = panels.state
  if (kind === 'menu') {
    const field = s.countField()
    body.append(el('div', 'journal-opening', `<span>SEISMIC VALLEY / FIELD NOTES</span><h3>${SEASON_NAMES[s.season]}, day ${(s.day - 1) % SEASON_DAYS + 1}.</h3><p>${field.growing} growing · ${field.ripe} ready to harvest</p>`))
    const nav = el('nav', 'journal-nav')
    nav.setAttribute('aria-label', 'Farm menu')
    const entries = [
      ['homestead', 'Home', 'Rest & make a home', 'Tab'], ['market', 'Market', 'Seeds & your harvest', 'M'],
      ['village', 'Village', 'People & places', 'V'], ['bag', 'Bag', 'Everything you carry', 'I'],
      ['build', 'Build', 'Craft & place structures', 'B'], ['journal', 'Field log', 'Your valley, recorded', 'J'],
      ['guide', 'Guide', 'Find your feet', '?'],
    ]
    for (const [target, title, subtitle, key] of entries) {
      nav.append(button(`${emblem(target)}<span><strong>${title}</strong><small>${subtitle}</small></span><kbd>${key}</kbd><i>↗</i>`, () => panels.open(target, target === 'build' ? { cell: panels.opts.targetCell() } : undefined), false, 'farm-nav-btn'))
    }
    nav.append(button(`${emblem('save')}<span><strong>Save</strong><small>Keep this little life</small></span><i>↗</i>`, () => { s.save(); panels.close() }, false, 'farm-nav-btn save-button'))
    body.append(nav)
    body.append(el('h3', '', 'In the garden'))
    if (panels.opts.actionNode) body.append(panels.opts.actionNode)
    if (panels.opts.soundNode) body.append(panels.opts.soundNode)
    body.append(el('p', 'journal-save-note', 'Saved on this device · autosaves as you play'))
    body.append(button('Save & return to main menu ↗', () => {
      if (s.save(true)) location.assign(location.pathname)
    }, false, 'btn return-to-menu'))
  }
  if (kind === 'npc') {
    const v = villager(payload.id)
    const friendship = s.friendships[v.id] ?? 0
    const hero = el('div', 'npc-intro')
    hero.append(el('div', 'npc-portrait', portrait(v)), el('div', '', `<span class="eyebrow">${v.role}</span><h3>${v.name}</h3><div class="friend-hearts" aria-label="${friendship} of 100 friendship">${Array.from({ length: 5 }, (_, i) => `<span class="${friendship >= (i + 1) * 20 ? 'filled' : ''}">♥</span>`).join('')}</div>`))
    body.append(hero, el('p', 'npc-quote', payload.line))
    const gift = el('div', 'row')
    gift.append(el('div', 'row-main', `<strong>A little something</strong><span class="muted">Favorite: ${item(v.gift).name} · one gift per day</span>`), button(s.lastGift[v.id] === s.day ? 'Gift given' : 'Give gift', () => { s.gift(v.id); panels.refresh() }, s.lastGift[v.id] === s.day || !s.has(v.gift)))
    body.append(gift)
    const req = el('div', 'row')
    req.append(el('div', 'row-main', `<strong>Today’s request</strong><span class="muted">${v.amount} ${item(v.request).name} → ${v.reward} coin + friendship</span>`), button(s.lastDelivery[v.id] === s.day ? 'Delivered' : 'Deliver', () => { s.deliver(v.id); panels.refresh() }, s.lastDelivery[v.id] === s.day || !s.has(v.request, v.amount)))
    body.append(req)
    if (v.id === 'marn') body.append(button('Browse seeds & sell produce →', () => panels.open('market'), false, 'btn btn-solid wide-button'))
    if (v.id === 'tace') body.append(button('Plan my home →', () => panels.open('homestead'), false, 'btn btn-solid wide-button'))
    if (v.id === 'odile') body.append(button('Show me the pond →', () => { panels.close(); panels.opts.onLocate?.('pond') }, false, 'btn btn-solid wide-button'))
  }
  if (kind === 'village') {
    body.append(el('p', 'lede', 'A small place, coming back to life. Talk every day, bring a favorite gift, or fill a request to grow your friendships.'))
    for (const v of VILLAGERS) {
      const row = el('div', 'neighbor-row')
      row.append(el('div', 'neighbor-avatar', portrait(v)), el('div', 'row-main', `<strong>${v.name}</strong><span>${v.role}</span><small>${s.friendships[v.id] ?? 0} / 100 friendship</small>`), button('Find', () => { panels.close(); panels.opts.onLocate?.(v.id) }))
      body.append(row)
    }
    body.append(el('h3', '', 'Around the valley'))
    const places = el('div', 'place-buttons')
    for (const [id, title] of [['farm', 'Your garden'], ['home', 'Home'], ['market', 'Market'], ['pond', 'Fishing pond'], ['kiln', 'Old kiln']]) places.append(button(title, () => { panels.close(); panels.opts.onLocate?.(id) }))
    body.append(places)
  }
  if (kind === 'market') {
    body.append(el('div', 'market-heading', `<span>THE VALLEY EXCHANGE</span><strong>${s.coin.toLocaleString()} <small>coin</small></strong>`))
    body.append(el('p', 'lede', 'Fresh seeds for this season. Sell your crops here for coin now, or put them in the shipping crate for payment at dawn.'))
    body.append(el('h3', '', 'Seeds & saplings'))
    const list = el('div', 'market-grid')
    for (const id of marketStock(s.season)) {
      const crop = CROPS[cropForSeed(id)]
      const price = buyPrice(id)
      const card = el('div', 'market-item')
      card.append(el('img', 'market-icon'))
      card.firstChild.src = iconFor(id)
      card.firstChild.alt = ''
      card.append(el('div', 'row-main', `<strong>${item(id).name}</strong><small>${crop ? `${crop.total} days · sells for ${valueOf(crop.id) * crop.yield} coin` : 'Grows into a harvestable tree'}</small><small>In bag: ${s.count(id)}</small>`))
      card.append(button(`${price} ◇`, () => { s.buy(id); panels.opts.onBuy?.(); panels.refresh() }, s.coin < price))
      list.append(card)
    }
    body.append(list, el('h3', '', 'Sell from your bag'))
    const sellable = [...s.bag].filter(([id]) => canSell(id))
    if (!sellable.length) body.append(el('p', 'lede', 'Your next harvest belongs here. Keep watering and come back with a basketful.'))
    for (const [id, n] of sellable) {
      const row = el('div', 'row')
      row.append(el('img', 'inventory-icon'))
      row.firstChild.src = iconFor(id)
      row.firstChild.alt = ''
      row.append(el('div', 'row-main', `<strong>${item(id).name} × ${n}</strong><span class="muted">${valueOf(id)} coin each</span>`), button('Sell 1', () => { s.sell(id); panels.opts.onBuy?.(); panels.refresh() }), button(`All · ${valueOf(id) * n}`, () => { s.sell(id, n); panels.opts.onBuy?.(); panels.refresh() }))
      body.append(row)
    }
  }
  if (kind === 'bag') {
    body.append(el('p', 'lede', 'Choose a tool or seed to put it in your hand. Wood, stone and fibre are kept here for building.'))
    const list = el('div', 'inventory-grid')
    for (const [id, n] of s.bag) {
      const b = button(`<img src="${iconFor(id)}" alt=""><strong>${item(id).name}</strong><span>× ${n}</span>`, () => { s.equip(id); panels.close() }, false, 'inventory-item')
      b.title = item(id).desc
      list.append(b)
    }
    body.append(list)
  }
  if (kind === 'guide') {
    const steps = [['01', 'Make a little room', 'WASD to walk. Hold Shift to run. Use Q / R to turn the camera. Scroll to zoom. On a phone, use the stick and the labeled pads.'], ['02', 'From soil to supper', 'Use the hoe (1) on your fenced garden with F. Choose a seed (6 or Plant), then F to sow. Water with the can (2). Blue soil means watered.'], ['03', 'Let a day pass', 'Home → Sleep advances the day. Crops grow one stage each watered night. Your first row is almost ripe: water it, sleep, then harvest with E. Rain waters for you.'], ['04', 'Make it a living', 'Market buys crops instantly and sells seasonal seeds. The shipping crate pays at dawn. Every harvest gives a seed back. Keep some wood and stone for your house.'], ['05', 'Make it a home', 'Talk to Tace or open Home. Upgrade with materials and coin. Rebuild ruined cottages for more farmland. Repair the kiln to make cut stone for later upgrades.'], ['06', 'Get to know the neighbors', 'Walk close and press E to chat. Daily chats, favorite gifts and requests earn friendship. Village → Find points you toward them.']]
    for (const [n, title, text] of steps) body.append(el('div', 'guide-step', `<b>${n}</b><div><strong>${title}</strong><p>${text}</p></div>`))
    body.append(el('p', 'lede', 'Progress saves when you sleep and every 45 seconds while playing. Use Save for a manual save. Progress stays in this browser.'))
  }
  if (kind === 'morning') {
    body.append(el('div', 'morning-title', `<span>ANOTHER DAY IN THE VALLEY</span><h3>Good morning.</h3><p>Day ${s.day} · ${HOME_NAMES[s.homeTier]}</p>`))
    body.append(el('div', 'morning-stats', `<div><b>${payload.grew}</b><span>crops grew</span></div><div><b>+${payload.earned}</b><span>shipping income</span></div><div><b>${s.countField().ripe}</b><span>ready to harvest</span></div>`))
    body.append(el('p', 'lede', s.countField().ripe ? 'There is something ready in the garden. Take a basket, then drop by the market.' : 'A fresh can of water, a little work in the garden, and a whole day ahead.'))
    body.append(button('Step outside →', () => panels.close(), false, 'btn btn-solid wide-button'))
  }
}

export function homeOverview(body, s) {
  body.append(el('div', 'home-illustration', `<svg viewBox="0 0 260 130" aria-hidden="true"><path d="M15 117L133 70L248 111L133 130Z" fill="#b9c0a4"/><path d="M64 63H183V110H64Z" fill="#e8d2b1"/><path d="M183 63L220 45V93L183 110Z" fill="#c3ab96"/><path d="M47 67L92 17H181L228 49L184 71L135 37L92 67Z" fill="#725160"/><path d="M92 17L135 37L184 71L220 51L181 17Z" fill="#4d3545"/><path d="M111 78Q126 52 140 78V110H111Z" fill="#594550"/><rect x="77" y="77" width="17" height="19" fill="#b29973"/><rect x="154" y="77" width="17" height="19" fill="#b29973"/><path d="M158 28V4H174V35Z" fill="#b7a38f"/></svg><div><span class="eyebrow">YOUR PLACE IN THE VALLEY</span><h3>${HOME_NAMES[s.homeTier]}</h3><span>Level ${s.homeTier} / 4 · protected from pruning</span></div>`))
  const next = HOME_COST[s.homeTier]
  if (next) body.append(el('div', 'home-materials', `<span class="eyebrow">NEXT: ${HOME_NAMES[s.homeTier + 1]}</span><div class="costs">${cost(s, next)}</div>`))
}

export function restorationRows(panels, body) {
  const s = panels.state
  body.append(el('h3', '', 'Rebuild the neighborhood'))
  for (const b of s.buildings.filter((b) => b.derelict)) {
    const spec = RESTORE[b.kind]
    if (!spec) continue
    const row = el('div', 'row')
    row.append(el('div', 'row-main', `<strong>${b.kind === 'cottage' ? 'Garden cottage' : spec.label}</strong><span class="muted">${spec.note}</span><div class="costs">${cost(s, spec.cost)}</div>`), button('Rebuild', () => { if (s.restore(b)) panels.opts.onBuilt?.(b.kind) }, !s.canAfford(spec.cost)))
    body.append(row)
  }
}

export class FarmBar {
  constructor(root, state, panels, opts) {
    this.node = el('nav', 'farm-nav')
    this.node.setAttribute('aria-label', 'Farm menu')
    const bag = button(emblem('bag'), () => panels.toggle('bag'), false, 'bag-toggle')
    bag.setAttribute('aria-label', 'Open bag')
    const journal = button(`${emblem('journal')}<span>Journal</span>`, () => panels.toggle('menu'), false, 'journal-toggle')
    journal.setAttribute('aria-label', 'Open valley journal')
    this.node.append(bag, journal)
    root.append(this.node)
    this.wallet = el('div', 'wallet')
    root.append(this.wallet)
    this.held = el('div', 'held-label')
    root.append(this.held)
    const update = () => {
      this.wallet.innerHTML = `<span class="wallet-glyph">◇</span><b>${state.coin.toLocaleString()}</b><span>coin</span>`
      this.held.innerHTML = state.held ? `<span>${item(state.held).name}</span><kbd>F</kbd><small>${item(state.held).kind === KIND.TOOL ? 'use tool' : 'plant / use'}</small>` : 'Choose a tool'
    }
    for (const e of ['coin', 'bag', 'hotbar', 'day']) state.on(e, update)
    update()
    this.route = el('button', 'route-indicator')
    this.route.type = 'button'
    this.route.hidden = true
    this.route.addEventListener('click', () => { opts.cancelRoute(); this.route.hidden = true })
    root.append(this.route)
    this.collection = CROP_ORDER.length
  }
}
