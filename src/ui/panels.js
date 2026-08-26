import { markSvg } from '../core/mark.js'
import { cropForSeed, SEASON_DAYS, SEASON_NAMES, seasonalSeeds } from '../game/crops.js'
import { KIND, item, valueOf } from '../game/items.js'
import { BUILD_COST, HOME_COST, STAKE_COST } from '../game/state.js'
import { iconFor } from './icons.js'
import { JOBS } from '../actors/jobs.js'

/**
 * The overlays.
 *
 * One panel is open at a time, ever. A farming game with three stacked modal
 * layers is a farming game where the player loses track of which Escape they are
 * pressing — so `open()` closes whatever was there, and every panel is built
 * fresh from state on open rather than kept in sync while hidden.
 *
 * Every panel takes the same shape on purpose: a rule, a title in the game's own
 * letterforms, a body, and a footer that says how to leave. Consistency here is
 * worth more than any individual layout.
 */

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}
const costLine = (cost, state) =>
  Object.entries(cost)
    .map(([k, n]) => {
      const have = k === 'coin' ? state.coin : state.count(k)
      const label = k === 'coin' ? 'coin' : item(k).name
      return `<span class="cost ${have >= n ? 'is-ok' : 'is-short'}">${n} ${label}</span>`
    })
    .join('')

export class Panels {
  constructor(root, state, opts = {}) {
    this.state = state
    this.opts = opts
    this.node = el('div', 'panels')
    this.scrim = el('div', 'scrim')
    this.sheet = el('section', 'sheet')
    this.node.append(this.scrim, this.sheet)
    root.append(this.node)
    this.open_ = null

    this.scrim.addEventListener('click', () => this.close())
    state.on('bag', () => this.refresh())
    state.on('coin', () => this.refresh())
    state.on('build', () => this.refresh())
    state.on('requests', () => this.refresh())
  }

  get isOpen() { return !!this.open_ }

  open(kind, payload) {
    this.open_ = { kind, payload }
    this.node.classList.add('is-on')
    this.render()
    this.opts.onOpen?.(kind)
  }

  close() {
    if (!this.open_) return
    this.open_ = null
    this.node.classList.remove('is-on')
    this.sheet.replaceChildren()
    this.opts.onClose?.()
  }

  toggle(kind, payload) {
    if (this.open_?.kind === kind) this.close()
    else this.open(kind, payload)
  }

  refresh() { if (this.open_) this.render() }

  render() {
    const { kind, payload } = this.open_
    const body = { homestead: 'homestead', build: 'build', journal: 'journal', shop: 'shop', crate: 'crate', pebbles: 'pebbles' }[kind]
    this.sheet.replaceChildren()
    this.sheet.append(this.header(kind))
    const content = el('div', 'sheet-body')
    this.sheet.append(content)
    this[`render_${body}`]?.(content, payload)
    this.sheet.append(el('footer', 'sheet-foot', 'Esc — close'))
  }

  header(kind) {
    const titles = {
      homestead: 'Homestead', build: 'Raise', journal: 'Field Journal',
      shop: 'Seed & Trade', crate: 'Shipping Crate', pebbles: 'Pebbles',
    }
    const h = el('header', 'sheet-head')
    h.append(el('span', 'sheet-mark', markSvg({ className: 'sheet-mark-svg' })), el('h2', null, titles[kind] ?? kind))
    return h
  }

  // ------------------------------------------------------------ homestead --

  render_homestead(body) {
    const s = this.state
    body.append(el('p', 'lede', `Tier ${s.homeTier} of 4. A better roof means you wake with more in you.`))
    const cost = HOME_COST[s.homeTier]
    if (cost) {
      const row = el('div', 'row')
      row.append(el('div', 'row-main', `<strong>Upgrade to tier ${s.homeTier + 1}</strong><div class="costs">${costLine(cost, s)}</div>`))
      const btn = el('button', 'btn', 'Build')
      btn.disabled = !s.canAfford(cost)
      btn.addEventListener('click', () => s.upgradeHome())
      row.append(btn)
      body.append(row)
    } else {
      body.append(el('p', 'muted', 'There is nothing left to add to it.'))
    }

    const sleep = el('div', 'row row-hero')
    sleep.append(el('div', 'row-main', '<strong>Sleep until dawn</strong><span class="muted">Crops drink what you gave them. The crate goes out.</span>'))
    const sb = el('button', 'btn btn-solid', 'Sleep')
    sb.addEventListener('click', () => {
      this.close()
      this.opts.onSleep?.()
    })
    sleep.append(sb)
    body.append(sleep)

    /**
     * What the pebbles did today.
     *
     * This is here rather than on the pebble panel because it is what makes the
     * house a PLACE. A homestead you only visit to press Sleep is a menu with a
     * roof on it; a homestead where you find out that one of them spent six
     * hours tapping a rock is somewhere you come back to.
     */
    const out = s.pebbles.filter((p) => p.job)
    if (out.length) {
      body.append(el('h3', null, 'While you were out'))
      for (const p of out) {
        const job = JOBS.find((j) => j.id === p.job)
        if (!job) continue
        body.append(el('div', 'row row-quiet',
          `<div class="row-main"><strong>${p.name}</strong><span class="muted">${job.say}</span></div>`))
      }
    }

    body.append(el('h3', null, 'Requests'))
    if (!s.requests.length) body.append(el('p', 'muted', 'Nobody needs anything today.'))
    for (const r of s.requests) {
      const row = el('div', `row${r.done ? ' is-done' : ''}`)
      row.append(el('div', 'row-main', `<strong>${r.who}</strong> wants ${r.n} × ${item(r.id).name}<div class="costs"><span class="cost is-ok">${r.reward} coin</span></div>`))
      const btn = el('button', 'btn', r.done ? 'Filled' : 'Hand over')
      btn.disabled = r.done || !s.has(r.id, r.n)
      btn.addEventListener('click', () => s.fillRequest(r))
      row.append(btn)
      body.append(row)
    }
  }

  // ---------------------------------------------------------------- build --

  render_build(body, payload) {
    const s = this.state
    const [x, z] = payload?.cell ?? [0, 0]
    body.append(el('p', 'lede', `Raising on the ground in front of you (${x}, ${z}). Nothing you build is registered until you drive a stake at its corner.`))

    const blurbs = {
      kiln: 'Squares stone into cut stone, and burns sand into ash glass.',
      shed: 'Somewhere to keep the stone that is not in a wall yet.',
      well: 'Refill the can without walking to the river.',
      vault: 'Cold store, cut into bedrock. What you put in it is below registered depth.',
    }
    for (const [kind, cost] of Object.entries(BUILD_COST)) {
      const r = el('div', 'row')
      r.append(el('div', 'row-main', `<strong>${kind[0].toUpperCase()}${kind.slice(1)}</strong><span class="muted">${blurbs[kind]}</span><div class="costs">${costLine(cost, s)}</div>`))
      const b = el('button', 'btn', s.buildings.some((x2) => x2.kind === kind) ? 'Built' : 'Raise')
      b.disabled = !s.canAfford(cost) || s.buildings.some((x2) => x2.kind === kind)
      b.addEventListener('click', () => {
        if (s.build(kind, x, z)) {
          this.close()
          this.opts.onBuilt?.(kind)
        }
      })
      r.append(b)
      body.append(r)
    }

    // Everything you own, and whether the Loom has a record of it. This list is
    // the actual game: a structure without a stake is a structure you are
    // renting from a machine that is still finishing a job.
    const mine = s.buildings.filter((b) => b.kind !== 'gate')
    if (mine.length) {
      body.append(el('h3', null, 'The record'))
      for (const b of mine) {
        const fixed = b.kind === 'homestead'
        const r = el('div', `row${b.registered || fixed ? '' : ' is-unregistered'}`)
        r.append(el('div', 'row-main', `<strong>${b.kind[0].toUpperCase()}${b.kind.slice(1)} at ${b.x}, ${b.z}</strong><span class="muted">${
          fixed ? 'Registered when it was built. It is where you sleep.'
            : b.registered ? 'Registered. A pass will go around it.'
              : 'NOT registered. The next pass takes it apart.'
        }</span>${b.registered || fixed ? '' : `<div class="costs">${costLine(STAKE_COST, s)}</div>`}`))
        if (!b.registered && !fixed) {
          const btn = el('button', 'btn btn-solid', 'Drive a stake')
          btn.disabled = !s.canAfford(STAKE_COST)
          btn.addEventListener('click', () => {
            s.stake(b)
            this.opts.onBuilt?.('stake')
          })
          r.append(btn)
        }
        body.append(r)
      }
    }
  }

  // ----------------------------------------------------------------- shop --

  render_shop(body) {
    const s = this.state
    body.append(el('p', 'lede', `Odile stocks what will take in ${SEASON_NAMES[s.season]}, and nothing that will not.`))
    const grid = el('div', 'grid')
    for (const seedId of seasonalSeeds(s.season)) {
      const price = Math.max(2, Math.round(valueOf(seedId) * 1.6))
      const card = el('button', 'card-buy')
      card.type = 'button'
      card.innerHTML = `<img src="${iconFor(seedId)}" alt=""><span class="buy-name">${item(cropForSeed(seedId)).name}</span><span class="buy-price">${price}</span>`
      card.disabled = s.coin < price
      card.addEventListener('click', () => {
        if (s.coin < price) return
        s.coin -= price
        s.give(seedId, 1)
        s.emit('coin')
        this.opts.onBuy?.()
      })
      grid.append(card)
    }
    body.append(grid)

    body.append(el('h3', null, 'Saplings'))
    const grid2 = el('div', 'grid')
    for (const id of ['sap_ridgepine', 'sap_bellwood', 'sap_ironbark']) {
      const price = Math.round(valueOf(id) * 1.5)
      const card = el('button', 'card-buy')
      card.type = 'button'
      card.innerHTML = `<img src="${iconFor(id)}" alt=""><span class="buy-name">${item(id).name.replace(' Sapling', '')}</span><span class="buy-price">${price}</span>`
      card.disabled = s.coin < price
      card.addEventListener('click', () => {
        if (s.coin < price) return
        s.coin -= price
        s.give(id, 1)
        s.emit('coin')
        this.opts.onBuy?.()
      })
      grid2.append(card)
    }
    body.append(grid2)
  }

  // ---------------------------------------------------------------- crate --

  render_crate(body) {
    const s = this.state
    body.append(el('p', 'lede', 'Anything left here is sold overnight. Marn takes no cut, which nobody believes.'))
    const sellable = [...s.bag.keys()].filter((id) => {
      const k = item(id).kind
      return k !== KIND.TOOL && valueOf(id) > 0
    })
    if (!sellable.length) body.append(el('p', 'muted', 'Nothing in the pack worth selling.'))
    const grid = el('div', 'grid')
    for (const id of sellable) {
      const n = s.count(id)
      const card = el('button', 'card-buy')
      card.type = 'button'
      card.innerHTML = `<img src="${iconFor(id)}" alt=""><span class="buy-name">${item(id).name}</span><span class="buy-price">${valueOf(id)} × ${n}</span>`
      card.addEventListener('click', (e) => {
        s.ship(id, e.shiftKey ? n : 1)
        this.opts.onShip?.()
      })
      grid.append(card)
    }
    body.append(grid)
    body.append(el('p', 'muted', 'Click to add one. Shift-click to add the stack.'))

    if (s.shipped.length) {
      body.append(el('h3', null, 'In the crate'))
      let total = 0
      const list = el('ul', 'plain-list')
      for (const { id, n } of s.shipped) {
        total += valueOf(id) * n
        list.append(el('li', null, `${n} × ${item(id).name} <span class="muted">${valueOf(id) * n}</span>`))
      }
      body.append(list, el('p', 'total', `${total} coin at dawn`))
    }
  }

  // -------------------------------------------------------------- journal --

  render_journal(body) {
    const s = this.state
    /**
     * This line used to read `s.tremorsSurvived` and `s.cairns.length`. Neither
     * has existed since the tremor mechanic was cut and cairns became ordinary
     * buildings — so opening the journal threw, every time, for as long as the
     * panel has been in the game. Nothing caught it because Escape could not
     * close a panel, so no test ever got as far as pressing J.
     */
    const cairns = s.buildings.filter((b) => b.kind === 'cairn').length
    const passes = s.pruningsSeen === 1 ? 'One pass' : `${s.pruningsSeen} passes`
    body.append(el('p', 'lede', `Year ${s.year}. ${passes} behind you. ${cairns} ${cairns === 1 ? 'cairn' : 'cairns'} standing.`))
    if (!s.journal.length) body.append(el('p', 'muted', 'Nothing written down yet.'))
    const list = el('ul', 'journal-list')
    for (const entry of s.journal) {
      list.append(el('li', null, `<time>${SEASON_NAMES[entry.season]} ${((entry.day - 1) % SEASON_DAYS) + 1}</time><span>${entry.line}</span>`))
    }
    body.append(list)
  }

  // -------------------------------------------------------------- pebbles --

  render_pebbles(body) {
    const s = this.state
    body.append(el('p', 'lede', 'They hatch out of geodes. Each one picks something to do at dawn and goes off and does it, and none of them will tell you why.'))
    if (!s.pebbles.length) body.append(el('p', 'muted', 'None yet. Break geodes along the scar.'))
    for (const p of s.pebbles) {
      const row = el('div', 'row')
      const job = JOBS.find((j) => j.id === p.job)
      row.append(el('div', 'row-main',
        `<strong>${p.name}</strong><span class="muted">${p.trait} · ${job ? job.label : 'asleep'}</span>`))
      body.append(row)
    }
  }
}
