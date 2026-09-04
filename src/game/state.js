import { G } from '../core/palette.js'
import { chance, pick, randInt, rng } from '../core/rng.js'
import { Grid, N, P } from '../world/grid.js'
import { RESTORE, availableSpecies, isRestorable, openPlot, plotFor, restoreProgress } from './colony.js'
import { CROPS, SEASON_DAYS, SEASON_NAMES, TREES, TREE_ORDER, WEATHER, WEATHER_ODDS, WEATHER_ORDER, cropForSeed, cropIdAt, cropIndex, isRipe, regrowReset, seasonalSeeds, seedFor } from './crops.js'
import { STARTING_HOTBAR, item, isTool, valueOf } from './items.js'
import { PEBBLE_NAMES, TRAIT_KEYS } from '../actors/pebble.js'
import { LOGS, MANIFEST_TOTAL, TAGS } from './story.js'

/**
 * The game, as data.
 *
 * Everything the player has done lives on one object here, and every rule that
 * changes it is a method on that object. Nothing in this file knows that three.js
 * exists — which is what makes the save file a `JSON.stringify` of eight fields
 * and a base64 of the grid, and what makes the whole day-rollover testable
 * without a renderer.
 *
 * Systems that need to react to a change subscribe with `on()`. The alternative
 * — having the UI poll every field every frame — is what turns a HUD into the
 * most expensive thing in a game about standing in a field.
 */

const SAVE_KEY = 'seismic-valley.save'
export const SAVE_VERSION = 1

export const MAX_WATER = 40
export const MAX_STAMINA = 100

/**
 * A registration stake.
 *
 * Four sticks and some twine, and it is the difference between a shed and a
 * pile of components. The Loom takes apart what it has no record of; a stake
 * driven at the corner is the record. It is deliberately the cheapest thing in
 * the game — the cost is remembering, not the wood.
 */
export const STAKE_COST = { wood: 4, fibre: 3 }

export const BUILD_COST = {
  kiln: { stone: 20, wood: 12 },
  shed: { wood: 24, stone: 8 },
  well: { cutstone: 10, wood: 6 },
  vault: { cutstone: 28, shard: 3, ashglass: 4 },
}

/** Upgrading the homestead. Tier 1 is what you arrive with. */
export const HOME_COST = [null, { wood: 30, stone: 18, coin: 250 }, { wood: 60, cutstone: 24, coin: 900 }, { hardwood: 30, cutstone: 48, shard: 6, coin: 2600 }]

export class GameState {
  constructor(grid, seed) {
    this.grid = grid
    this.seed = seed
    this.rand = rng(seed ^ 0x5eed)

    this.day = 1
    this.season = 0
    this.year = 1
    this.hour = 6.4
    this.weather = 'CLEAR'
    this.tomorrow = 'CLEAR'

    this.coin = 60
    /**
     * Capabilities earned by putting the street back — 'fire', 'water', 'stock',
     * 'seed', 'relay'. Read by name so `colony.js` stays a description of the
     * design instead of a pile of reach-ins. See `game/colony.js`.
     */
    this.unlocked = new Set()
    this.water = MAX_WATER
    this.stamina = MAX_STAMINA
    this.homeTier = 1

    /**
     * A tally of things you have DONE, as opposed to things you have.
     *
     * The tutorial reads it, the journal will, and it costs eight integers. The
     * alternative is a tutorial that subscribes to nine events and has to be
     * right about all of them; a counter it can poll cannot be missed, cannot
     * fire twice, and survives a reload for free.
     */
    this.stats = { tilled: 0, sown: 0, watered: 0, harvested: 0, chopped: 0, mined: 0, caught: 0, slept: 0, walked: 0 }

    /** The cell the body is standing on, pushed in by the game each frame so
     *  nothing can be built on top of the player. Null until the game runs. */
    this.playerCell = null

    /** id -> count. Tools live here too, at count 1. */
    this.bag = new Map()
    this.hotbar = [...STARTING_HOTBAR]
    this.slot = 0

    this.buildings = [] // { kind, level, x, z }
    this.pebbles = [] // { name, trait, x, z, home: [x,z] }
    this.shipped = [] // { id, n } waiting in the crate
    this.journal = []
    this.requests = []
    this.flags = new Set()

    // The Loom's schedule. It works to a schedule, not to a mood.
    this.nextPruning = 5
    this.pruningsSeen = 0
    this.lastPruningDay = 0

    // The Manifest. Every species carried through to a harvest writes one line
    // back onto the chip — this is the progress bar and the whole point.
    this.recovered = new Set()
    // Story fragments already found, so nothing is handed out twice.
    this.tagsFound = 0
    this.logsFound = []

    this._subs = new Map()
    this._pendingRebuild = { props: false, crops: false, structures: false }

    for (const id of STARTING_HOTBAR) if (id) this.give(id, 1)
    this.give('seed_grubwort', 8)
    this.give('seed_palewheat', 6)
    this.give('wood', 12)
    this.give('stone', 8)
  }

  // ------------------------------------------------------------- events --

  on(event, fn) {
    ;(this._subs.get(event) ?? this._subs.set(event, []).get(event)).push(fn)
    return () => {
      const list = this._subs.get(event)
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    }
  }
  emit(event, payload) {
    const list = this._subs.get(event)
    if (list) for (const fn of list) fn(payload)
  }
  /** A one-line message for the ticker. Anything the player should notice but
   *  not be interrupted by goes here. */
  say(text, tone = 'plain') { this.emit('toast', { text, tone }) }

  // ---------------------------------------------------------- inventory --

  count(id) { return this.bag.get(id) ?? 0 }
  has(id, n = 1) { return this.count(id) >= n }
  canAfford(cost) { return Object.entries(cost).every(([k, n]) => (k === 'coin' ? this.coin >= n : this.has(k, n))) }

  give(id, n = 1) {
    if (!n) return
    this.bag.set(id, this.count(id) + n)
    // A new stackable with a free hotbar slot goes into it. Nothing is more
    // tedious than harvesting a crop and then opening a panel to equip it.
    if (!isTool(id) && !this.hotbar.includes(id)) {
      const free = this.hotbar.indexOf(null)
      if (free >= 0) this.hotbar[free] = id
    }
    this.emit('bag', { id, n })
  }

  take(id, n = 1) {
    const have = this.count(id)
    if (have < n) return false
    if (have === n) {
      this.bag.delete(id)
      const i = this.hotbar.indexOf(id)
      if (i >= 0 && !isTool(id)) this.hotbar[i] = null
    } else {
      this.bag.set(id, have - n)
    }
    this.emit('bag', { id, n: -n })
    return true
  }

  pay(cost) {
    if (!this.canAfford(cost)) return false
    for (const [k, n] of Object.entries(cost)) {
      if (k === 'coin') this.coin -= n
      else this.take(k, n)
    }
    this.emit('coin')
    return true
  }

  get held() { return this.hotbar[this.slot] }
  select(i) {
    if (i >= 0 && i < this.hotbar.length) {
      this.slot = i
      this.emit('hotbar')
    }
  }

  /**
   * Put a specific item in hand, wherever it happens to live.
   *
   * The seed tray offers every species you hold, and most of them are not on the
   * hotbar — there are eight slots and twelve crops. Without this, choosing a
   * seed from the tray would mean telling the player to go and arrange their own
   * hotbar first, which is the interface asking the player to do its job.
   */
  equip(id) {
    if (!id || !this.has(id, 1)) return false
    const at = this.hotbar.indexOf(id)
    if (at >= 0) { this.select(at); return true }
    // Nothing free? Take the last slot — tools live at the front and the player
    // put them there.
    const free = this.hotbar.indexOf(null)
    const slot = free >= 0 ? free : this.hotbar.length - 1
    this.hotbar[slot] = id
    this.slot = slot
    this.emit('hotbar')
    return true
  }

  spend(energy) {
    this.stamina = Math.max(0, this.stamina - energy)
    this.emit('vitals')
    // Exhaustion does not kill you; it sends you home. Waking up at noon having
    // lost the morning is a real cost without being a fail state.
    if (this.stamina <= 0 && !this.flags.has('collapsing')) {
      this.flags.add('collapsing')
      this.emit('collapse')
    }
  }

  // ---------------------------------------------------------- the record --

  /** Which structure covers a cell, if any. The list is a dozen entries long,
   *  so a linear scan beats maintaining a second index. */
  structureAt(x, z) {
    return this.buildings.find((b) => Math.abs(b.x - x) <= 2 && Math.abs(b.z - z) <= 2) ?? null
  }

  get unregistered() {
    return this.buildings.filter((b) => b.kind !== 'homestead' && b.kind !== 'gate' && !b.registered)
  }

  // ------------------------------------------------------------ actions --
  // Each returns a short verb string on success (which the UI turns into a toast
  // and the rig turns into an animation) or null if the action was not legal.

  till(x, z) {
    const g = this.grid
    if (!g.canTill(x, z)) return null
    this.spend(2)
    g.set('ground', x, z, G.TILLED)
    g.set('tilled', x, z, 1)
    this.stats.tilled++
    this._pendingRebuild.props = true
    // Found, never given. Marit used soil-tags as a lab notebook because she
    // hated writing, and the colony never bothered to collect them. They are
    // still out there, and you find them by accident, while hoeing.
    if (this.tagsFound < TAGS.length && chance(this.rand, 0.055)) this.findTag(x, z)
    // The action bar counts beds and ripe crops; every verb that moves either
    // number says so, or the two buttons quietly go stale.
    this.emit('crops')
    return 'swing'
  }

  sow(x, z, seedId) {
    const g = this.grid
    if (!g.get('tilled', x, z) || g.get('crop', x, z)) return null
    const cropId = cropForSeed(seedId)
    const c = CROPS[cropId]
    if (!c) return null
    if (!c.seasons.includes(this.season)) {
      this.say(`${item(cropId).name} will not take in ${SEASON_NAMES[this.season]}.`, 'warn')
      return null
    }
    if (!this.take(seedId, 1)) return null
    this.spend(0.8)
    g.set('crop', x, z, cropIndex(cropId))
    g.set('grown', x, z, 0)
    this.stats.sown++
    this._pendingRebuild.crops = true
    this.emit('crops')
    return 'swing'
  }

  waterTile(x, z) {
    const g = this.grid
    if (!g.get('tilled', x, z) || g.get('wet', x, z)) return null
    if (this.water <= 0) {
      this.say('The can is empty. Refill at water.', 'warn')
      return null
    }
    this.water--
    this.spend(0.6)
    g.set('wet', x, z, 1)
    g.set('ground', x, z, G.WET)
    this.stats.watered++
    this.emit('vitals')
    return 'pour'
  }

  refill() {
    this.water = MAX_WATER
    this.emit('vitals')
    this.say('Can filled.')
    return 'pour'
  }

  harvest(x, z) {
    const g = this.grid
    const cv = g.get('crop', x, z)
    if (!cv) return null
    const id = cropIdAt(cv)
    if (!isRipe(id, g.get('grown', x, z))) return null
    const c = CROPS[id]
    this.give(id, c.yield)
    this.stats.harvested++
    // The Manifest. Every species carried through to a harvest writes one line
    // back onto the chip — this is the progress bar, and it is the whole point.
    if (!this.recovered.has(id)) {
      this.recovered.add(id)
      this.emit('manifest', this.recovered.size)
      this.say(`${item(id).name} recovered. ${this.recovered.size} of 406.`, 'good')
      this.addJournal(`${item(id).name} carried through to a harvest. Written back onto the chip.`)
    }
    /**
     * A HARVEST RETURNS ITS OWN SEED.
     *
     * Without this the farming loop was finite and short: the player was handed
     * fourteen seeds of two species, nothing anywhere gave out another, and the
     * other ten crops had no source at all — so ten of twelve could never be
     * planted and the Manifest's true ceiling was two. `tools/economy.mjs` fails
     * if that is ever true again.
     *
     * One seed back per harvest keeps a species alive once you have it and no
     * more than that; two makes it compound and the plots stop mattering. The
     * seed VAULT is what hands out the species you have never grown, and it is
     * on the street waiting to be repaired.
     */
    this.give(seedFor(id), 1)
    this.spend(0.7)
    const reset = regrowReset(id)
    if (reset < 0) {
      g.set('crop', x, z, 0)
      g.set('grown', x, z, 0)
      g.set('tilled', x, z, 1)
      g.set('ground', x, z, g.get('wet', x, z) ? G.WET : G.TILLED)
    } else {
      g.set('grown', x, z, reset)
    }
    this._pendingRebuild.crops = true
    this.emit('crops')
    return 'swing'
  }

  chop(x, z) {
    const g = this.grid
    const prop = g.get('prop', x, z)
    if (prop === P.TREE) {
      const tree = TREES[TREE_ORDER[g.get('propData', x, z) % TREE_ORDER.length]]
      for (const [id, n] of Object.entries(tree.drops)) this.give(id, n)
      if (chance(this.rand, 0.35)) this.give(tree.sapling, 1)
      g.set('prop', x, z, P.STUMP)
      this.spend(4)
      this.stats.chopped++
      this._pendingRebuild.props = true
      this.say(`Felled a ${tree.id}.`)
      return 'swing'
    }
    if (prop === P.STUMP) {
      this.give('wood', 2)
      g.set('prop', x, z, P.NONE)
      this.spend(2.5)
      this._pendingRebuild.props = true
      return 'swing'
    }
    return null
  }

  mine(x, z) {
    const g = this.grid
    const prop = g.get('prop', x, z)
    if (prop === P.ROCK) {
      this.give('stone', 2 + randInt(this.rand, 0, 2))
      if (chance(this.rand, 0.12)) this.give('ashglass', 1)
      g.set('prop', x, z, P.NONE)
      this.spend(3.5)
      this.stats.mined++
      this._pendingRebuild.props = true
      return 'swing'
    }
    if (prop === P.GEODE) {
      // What a geode holds is decided when it is opened, not when it spawns, so
      // a Surveyor's forecast cannot be used to farm the good ones.
      const roll = this.rand()
      if (roll < 0.42) {
        this.give('shard', 1)
        this.say('The geode held a shard.', 'good')
      } else if (roll < 0.7) {
        this.give('ashglass', 2)
        this.say('Ash glass, and a lot of dust.')
      } else if (roll < 0.9) {
        this.give('stone', 4)
        this.give('resin', 1)
        this.say('Mostly stone.')
      } else {
        this.hatchPebble(x, z)
      }
      g.set('prop', x, z, P.NONE)
      this.spend(4)
      this._pendingRebuild.props = true
      return 'swing'
    }
    return null
  }

  clear(x, z) {
    const g = this.grid
    if (g.get('prop', x, z) !== P.GRASS) return null
    if (chance(this.rand, 0.6)) this.give('fibre', 1)
    g.set('prop', x, z, P.NONE)
    this.spend(0.5)
    this._pendingRebuild.props = true
    return 'swing'
  }

  plantSapling(x, z, saplingId) {
    const g = this.grid
    if (g.get('prop', x, z) !== P.NONE || g.isWater(x, z)) return null
    if (!this.take(saplingId, 1)) return null
    const kind = ['sap_ridgepine', 'sap_bellwood', 'sap_ironbark'].indexOf(saplingId)
    g.set('prop', x, z, P.SAPLING)
    g.set('propData', x, z, Math.max(0, kind))
    this.spend(1)
    this._pendingRebuild.props = true
    return 'swing'
  }

  /** A pebble hatches where the geode was, and immediately follows you home. */
  hatchPebble(x, z) {
    const used = new Set(this.pebbles.map((p) => p.name))
    const name = PEBBLE_NAMES.find((n) => !used.has(n)) ?? `Pebble ${this.pebbles.length + 1}`
    const trait = pick(this.rand, TRAIT_KEYS)
    this.pebbles.push({ name, trait, x: x + 0.5, z: z + 0.5, home: [x, z] })
    this.say(`${name} climbed out. A ${trait}.`, 'good')
    this.emit('pebble', this.pebbles.at(-1))
    this.addJournal(`${name} hatched on day ${this.day} of ${SEASON_NAMES[this.season]}.`)
  }

  // ---------------------------------------------------------- structures --

  /**
   * Where the body is, so nothing gets built on top of it.
   *
   * The state layer knows nothing about three.js and is not about to start, so
   * the game pushes one cell in per frame. Two integers is a much smaller price
   * than a player sealed inside their own shed.
   */
  occupied(x, z) {
    return this.playerCell ? this.playerCell[0] === x && this.playerCell[1] === z : false
  }

  build(kind, x, z, level = 1) {
    if (this.occupied(x, z)) {
      this.say('You are standing there.', 'warn')
      return null
    }
    const cost = BUILD_COST[kind]
    if (!cost) return null
    if (!this.canAfford(cost)) {
      this.say('Not enough for that yet.', 'warn')
      return null
    }
    this.pay(cost)
    // Built, and NOT registered. That is the trap, and it is the correct trap:
    // the player learns what pruning is by losing something to it once.
    this.buildings.push({ kind, level, x, z, registered: false })
    this.grid.set('prop', x, z, P.BUILDING)
    this._pendingRebuild.structures = true
    this._pendingRebuild.props = true
    this.emit('build', { kind, x, z })
    this.say('Built. It is not registered.', 'warn')
    return 'swing'
  }

  /** Drive a stake at the corner. The structure is now in the Loom's record and
   *  survives a pass. */
  stake(building) {
    if (!building || building.registered) return false
    if (!this.canAfford(STAKE_COST)) {
      this.say('A stake needs four wood and three fibre.', 'warn')
      return false
    }
    this.pay(STAKE_COST)
    building.registered = true
    this._pendingRebuild.structures = true
    this.emit('build', { kind: building.kind, registered: true })
    this.say('Stake driven. It is in the record now.', 'good')
    return true
  }

  /**
   * PUT ONE OF THE COLONY'S BUILDINGS BACK.
   *
   * The whole direction of the game runs through this one method: a cottage
   * gives back a plot you may hoe, the works buildings give back a capability,
   * and the relay is last because it needs what the kiln makes. Nothing here is
   * a quest — the costs do the sequencing on their own.
   */
  restore(building) {
    if (!building || !isRestorable(building.kind) || !building.derelict) return false
    const spec = RESTORE[building.kind]
    if (!this.canAfford(spec.cost)) {
      this.say(`Not enough to put ${spec.label} back yet.`, 'warn')
      return false
    }
    this.pay(spec.cost)
    building.derelict = false
    building.registered = true

    if (spec.opens) {
      const opened = openPlot(this.grid, plotFor(building, this.streetZ))
      this.say(`${opened} squares of plot open again.`, 'good')
    }
    if (spec.unlocks) this.unlocked.add(spec.unlocks)

    // The seed vault is the reason ten species were unreachable, and opening it
    // is the moment the farming half of the game actually starts.
    if (spec.unlocks === 'seed') {
      for (const id of availableSpecies(this)) if (!this.has(seedFor(id), 1)) this.give(seedFor(id), 2)
      this.say('The vault is open. Everything that is left of the four hundred and six.', 'good')
    }

    this.stats.restored = (this.stats.restored ?? 0) + 1
    this._pendingRebuild.structures = true
    this.addJournal(`Put ${spec.label} back on day ${this.day}.`)
    this.emit('build', { kind: building.kind, restored: true })
    this.emit('colony', restoreProgress(this))

    const { done, total } = restoreProgress(this)
    if (done >= total) this.finish()
    return true
  }

  /**
   * Fire stone down to cut stone.
   *
   * `cutstone` had NO producer anywhere in the game, and three cost tables asked
   * for it: the well, the vault, and both homestead upgrades. Two of the four
   * buildable structures and the entire home progression were unreachable, and
   * nothing failed — the game simply advertised a route it did not have.
   */
  fire(n = 1) {
    if (!this.unlocked.has('fire')) {
      this.say('The kiln is a heap of stone. It fires nothing.', 'warn')
      return false
    }
    const cost = { stone: 3 * n }
    if (!this.canAfford(cost)) {
      this.say('Three stone to a cut stone.', 'warn')
      return false
    }
    this.pay(cost)
    this.give('cutstone', n)
    this.spend(1.2)
    return 'swing'
  }

  /** The street is whole. This is the only ending the game has, and until the
   *  colony existed there was none at all — nothing in the code checked for a
   *  finish, so the player could do everything and be told nothing. */
  finish() {
    if (this.flags.has('finished')) return
    this.flags.add('finished')
    this.addJournal('The relay has power. The street is whole, and empty, and it will stay empty.')
    this.emit('finish', { day: this.day, year: this.year, recovered: this.recovered.size })
  }

  upgradeHome() {
    const cost = HOME_COST[this.homeTier]
    if (!cost) return false
    if (!this.canAfford(cost)) {
      this.say('The builders want more than that.', 'warn')
      return false
    }
    this.pay(cost)
    this.homeTier++
    const b = this.buildings.find((s) => s.kind === 'homestead')
    if (b) b.level = this.homeTier
    this._pendingRebuild.structures = true
    this.emit('build', { kind: 'homestead' })
    this.say('The homestead has grown.', 'good')
    return true
  }

  // ------------------------------------------------------------ shipping --

  ship(id, n = 1) {
    if (!this.take(id, n)) return false
    const existing = this.shipped.find((s) => s.id === id)
    if (existing) existing.n += n
    else this.shipped.push({ id, n })
    this.emit('shipped')
    return true
  }

  settleShipping() {
    let total = 0
    for (const { id, n } of this.shipped) total += valueOf(id) * n
    this.shipped.length = 0
    if (total) {
      this.coin += total
      this.emit('coin')
    }
    return total
  }

  /**
   * WHAT THE FIELD IS DOING RIGHT NOW: beds free to sow, and crops ready to lift.
   *
   * The interface had no way to say either. Farming was "hold the right hotbar
   * slot and press F on the right square", with nothing on screen telling you
   * how many squares were waiting or whether anything had come ripe — so the
   * two verbs the whole game is built on were invisible until you walked onto
   * them. These are the numbers the action bar puts on its buttons.
   *
   * Ninety-six squared is nine thousand cells; counting them costs nothing next
   * to a frame, and doing it on demand means it can never go stale the way a
   * cached tally does when some other system writes to the grid.
   */
  countField() {
    const g = this.grid
    let slots = 0
    let ripe = 0
    let growing = 0
    for (let i = 0; i < g.crop.length; i++) {
      if (!g.tilled[i]) continue
      const c = g.crop[i]
      if (!c) { slots++; continue }
      if (isRipe(cropIdAt(c), g.grown[i])) ripe++
      else growing++
    }
    return { slots, ripe, growing }
  }

  /**
   * The nearest cell that wants the given verb, so a button can point at it.
   *
   * A count with nowhere to go is a scoreboard. The player still walks there and
   * still swings — this only answers "where", which is the part the interface
   * was making them scan the whole valley for.
   */
  nearestField(kind, fromX, fromZ) {
    const g = this.grid
    let best = null
    let bestD = Infinity
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x
        if (!g.tilled[i]) continue
        const c = g.crop[i]
        const want = kind === 'ripe' ? c && isRipe(cropIdAt(c), g.grown[i]) : !c
        if (!want) continue
        const d = (x - fromX) ** 2 + (z - fromZ) ** 2
        if (d < bestD) { bestD = d; best = [x, z] }
      }
    }
    return best
  }

  // ------------------------------------------------------------ requests --

  /** One villager asks for something each morning. Small numbers on purpose:
   *  a request you cannot fill today is a request you forget about. */
  rollRequests() {
    this.requests = this.requests.filter((r) => r.day > this.day - 3 && !r.done)
    if (this.requests.length >= 3) return
    const who = pick(this.rand, ['Marn', 'Odile', 'Tace'])
    if (this.requests.some((r) => r.who === who)) return
    const pool = [...seasonalSeeds(this.season).map(cropForSeed), 'wood', 'stone', 'fibre', 'resin']
    const id = pick(this.rand, pool)
    const n = randInt(this.rand, 2, 6)
    this.requests.push({ who, id, n, day: this.day, reward: Math.max(20, valueOf(id) * n * 2 + 25), done: false })
    this.emit('requests')
  }

  fillRequest(req) {
    if (req.done || !this.has(req.id, req.n)) return false
    this.take(req.id, req.n)
    this.coin += req.reward
    req.done = true
    this.emit('coin')
    this.emit('requests')
    this.say(`${req.who} paid ${req.reward} coin.`, 'good')
    this.addJournal(`Filled ${req.who}'s request for ${req.n} ${item(req.id).name}.`)
    return true
  }

  /**
   * Sixteen dug something up.
   *
   * She is a survey dog, so what she finds is what a survey dog finds: fibre,
   * stone, the odd seed, and — rarely — a soil-tag, which is the game's whole
   * story delivery mechanism. Found, never given.
   */
  /**
   * A soil-tag comes up.
   *
   * Handed out IN ORDER regardless of where it was dug, which is what enforces
   * the mundane-before-cosmic rule: the first six are complaints about
   * drainage, and the scale is earned by starting at ankle height.
   */
  findTag(x, z) {
    if (this.tagsFound >= TAGS.length) return null
    const tag = TAGS[this.tagsFound++]
    this.give('soil_tag', 1)
    this.emit('fragment', { kind: 'tag', title: `Soil-tag · ${tag.at}`, lines: tag.lines, from: 'Marit Flavyn' })
    this.addJournal(`Turned up a soil-tag at ${x}, ${z}. Twelve seconds of somebody complaining about clay.`)
    return tag
  }

  /**
   * An Odenne log, off the relay. Out of order, always — she numbered them and
   * the player will find 31 before 6, and that is correct.
   */
  findLog() {
    const left = LOGS.filter((l) => !this.logsFound.includes(l.id))
    if (!left.length) return null
    const log = pick(this.rand, left)
    this.logsFound.push(log.id)
    this.emit('fragment', { kind: 'log', title: `Log ${log.id}`, lines: log.lines, from: 'Odenne Var' })
    this.addJournal(`Recovered log ${log.id} from the relay.`)
    return log
  }

  get manifestCount() { return this.recovered.size }
  get manifestTotal() { return MANIFEST_TOTAL }

  dogFound(x, z) {
    const roll = this.rand()
    if (roll < 0.08) {
      this.findTag(x, z)
      return
    }
    const drop = roll < 0.4 ? 'fibre' : roll < 0.68 ? 'stone' : roll < 0.86 ? 'resin' : 'wood'
    const n = 1 + randInt(this.rand, 0, 1)
    this.give(drop, n)
    this.say(`Sixteen dropped ${n} ${item(drop).name} at your feet.`)
  }

  addJournal(line) {
    this.journal.unshift({ day: this.day, season: this.season, year: this.year, line })
    if (this.journal.length > 60) this.journal.length = 60
    this.emit('journal')
  }

  // -------------------------------------------------------------- the day --

  /** Advance to the next morning. Every rule that only fires once a day lives
   *  here, in the order it has to fire in: growth reads yesterday's water, so
   *  water is cleared AFTER growth and not before. */
  sleep() {
    const g = this.grid
    const rained = WEATHER[this.weather].rain
    this.stats.slept++

    let grew = 0
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x
        const cv = g.crop[i]
        if (cv) {
          const id = cropIdAt(cv)
          const watered = g.wet[i] || rained
          if (watered && !isRipe(id, g.grown[i])) {
            g.grown[i] += 1
            grew++
          }
        }
        // Water evaporates unless it rained.
        if (g.wet[i] && !rained) {
          g.wet[i] = 0
          if (g.ground[i] === G.WET) g.ground[i] = G.TILLED
        } else if (rained && g.tilled[i]) {
          g.wet[i] = 1
          g.ground[i] = G.WET
        }
        // Saplings.
        if (g.prop[i] === P.SAPLING) {
          g.propData[i] = (g.propData[i] + 16) & 0xff
          if (g.propData[i] >= 0xf0) {
            g.prop[i] = P.TREE
            g.propData[i] = g.propData[i] % TREE_ORDER.length
          }
        }
      }
    }
    g.touchAll()

    const earned = this.settleShipping()

    this.day++
    if ((this.day - 1) % SEASON_DAYS === 0) {
      this.season = (this.season + 1) % 4
      if (this.season === 0) this.year++
      this.say(`${SEASON_NAMES[this.season]} has come.`, 'good')
      this.addJournal(`${SEASON_NAMES[this.season]}, year ${this.year}.`)
    }
    this.hour = 6.4
    this.stamina = Math.min(MAX_STAMINA, this.stamina + 62 + this.homeTier * 8)
    this.water = MAX_WATER
    this.flags.delete('collapsing')

    this.weather = this.tomorrow
    this.tomorrow = this.rollWeather()

    this.workPebbles()
    this.rollRequests()

    this._pendingRebuild.crops = true
    this._pendingRebuild.props = true
    this.emit('vitals')
    this.emit('day', { earned, grew })

    if (earned) this.say(`The crate went out. ${earned} coin.`, 'good')
    return { earned, grew }
  }

  rollWeather() {
    const odds = WEATHER_ODDS[this.season]
    let r = this.rand()
    for (let i = 0; i < odds.length; i++) {
      if (r < odds[i]) return WEATHER_ORDER[i]
      r -= odds[i]
    }
    return 'CLEAR'
  }

  /** Every pebble does its one job at dawn. Deliberately small effects: a
   *  pebble is a companion that helps, not a machine that plays for you. */
  workPebbles() {
    const g = this.grid
    for (const p of this.pebbles) {
      const [hx, hz] = p.home
      const done = []
      const scan = (fn, limit) => {
        let n = 0
        for (let dz = -6; dz <= 6 && n < limit; dz++) {
          for (let dx = -6; dx <= 6 && n < limit; dx++) {
            const x = hx + dx, z = hz + dz
            if (!Grid.inBounds(x, z)) continue
            if (fn(x, z, z * N + x)) n++
          }
        }
        return n
      }
      if (p.trait === 'waterer') {
        const n = scan((x, z, i) => {
          if (!g.tilled[i] || g.wet[i]) return false
          g.wet[i] = 1
          g.ground[i] = G.WET
          return true
        }, 4)
        if (n) done.push(`${p.name} watered ${n}`)
      } else if (p.trait === 'harvester') {
        const n = scan((x, z, i) => {
          const cv = g.crop[i]
          if (!cv) return false
          const id = cropIdAt(cv)
          if (!isRipe(id, g.grown[i])) return false
          this.give(id, CROPS[id].yield)
          const reset = regrowReset(id)
          if (reset < 0) {
            g.crop[i] = 0
            g.grown[i] = 0
            g.ground[i] = g.wet[i] ? G.WET : G.TILLED
          } else g.grown[i] = reset
          return true
        }, 1)
        if (n) done.push(`${p.name} lifted one`)
      } else if (p.trait === 'forager') {
        const drop = pick(this.rand, ['fibre', 'stone', 'wood', 'resin'])
        this.give(drop, 1 + randInt(this.rand, 0, 1))
        done.push(`${p.name} brought ${item(drop).name}`)
      }
      if (done.length) this.say(done[0])
    }
    // A Surveyor extends how far ahead the forecast reads. Nothing else does.
    this.forecastDays = this.pebbles.some((p) => p.trait === 'surveyor') ? 3 : 1
  }

  // ---------------------------------------------------------------- save --

  toJSON() {
    return {
      v: SAVE_VERSION,
      seed: this.seed,
      day: this.day, season: this.season, year: this.year, hour: this.hour,
      weather: this.weather, tomorrow: this.tomorrow,
      coin: this.coin, water: this.water, stamina: this.stamina, homeTier: this.homeTier,
      bag: [...this.bag], hotbar: this.hotbar, slot: this.slot,
      buildings: this.buildings, pebbles: this.pebbles,
      shipped: this.shipped, journal: this.journal, requests: this.requests,
      flags: [...this.flags],
      nextPruning: this.nextPruning, pruningsSeen: this.pruningsSeen,
      lastPruningDay: this.lastPruningDay,
      recovered: [...this.recovered], tagsFound: this.tagsFound, logsFound: this.logsFound,
      unlocked: [...this.unlocked],
      stats: this.stats,
      grid: this.grid.serialize(),
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON()))
      this.say('Saved.')
      return true
    } catch {
      this.say('Could not save — storage is full or blocked.', 'warn')
      return false
    }
  }

  static peek() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      return data.v === SAVE_VERSION ? data : null
    } catch {
      return null
    }
  }

  static clear() {
    try { localStorage.removeItem(SAVE_KEY) } catch { /* private mode */ }
  }

  /** Rehydrate onto an already-generated grid of the same seed. The grid bytes
   *  in the save are authoritative — the generator only has to have produced a
   *  grid of the right SIZE for them to land in. */
  load(data) {
    if (!this.grid.deserialize(data.grid)) return false
    Object.assign(this, {
      day: data.day, season: data.season, year: data.year, hour: data.hour,
      weather: data.weather, tomorrow: data.tomorrow,
      coin: data.coin, water: data.water, stamina: data.stamina ?? MAX_STAMINA, homeTier: data.homeTier,
      hotbar: data.hotbar, slot: data.slot,
      buildings: data.buildings, pebbles: data.pebbles,
      shipped: data.shipped, journal: data.journal, requests: data.requests ?? [],
      nextPruning: data.nextPruning ?? 5, pruningsSeen: data.pruningsSeen ?? 0,
      lastPruningDay: data.lastPruningDay ?? 0,
      tagsFound: data.tagsFound ?? 0, logsFound: data.logsFound ?? [],
      stats: { ...this.stats, ...(data.stats ?? {}) },
    })
    this.bag = new Map(data.bag)
    this.recovered = new Set(data.recovered ?? [])
    this.flags = new Set(data.flags ?? [])
    this.unlocked = new Set(data.unlocked ?? [])
    this._pendingRebuild.props = true
    this._pendingRebuild.crops = true
    this._pendingRebuild.structures = true
    this.emit('vitals')
    this.emit('bag')
    return true
  }

  /** What the view layer should rebuild this frame, then reset. */
  drainRebuilds() {
    const r = { ...this._pendingRebuild }
    this._pendingRebuild.props = false
    this._pendingRebuild.crops = false
    this._pendingRebuild.structures = false
    return r
  }
}

export { SAVE_KEY }
