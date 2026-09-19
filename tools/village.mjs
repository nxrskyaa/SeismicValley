import assert from 'node:assert/strict'
import { GameState, HOME_COST } from '../src/game/state.js'
import { generate } from '../src/world/worldgen.js'
import { buildSettlement } from '../src/world/settlement.js'
import { N } from '../src/world/grid.js'
import { CROPS, cropIndex, isRipe } from '../src/game/crops.js'
import { VILLAGERS, buyPrice } from '../src/game/village.js'
import { valueOf } from '../src/game/items.js'
import { plotFor } from '../src/game/colony.js'

const make = (seed = 77) => {
  const { grid } = generate(seed)
  const s = new GameState(grid, seed)
  buildSettlement(s, grid)
  return s
}
let checks = 0
const check = (label, fn) => { fn(); checks++; console.log(`ok  ${label}`) }

check('first garden contains usable empty soil and almost-ripe starter crops for three seeds', () => {
  for (const seed of [77, 1, 4242]) {
    const s = make(seed), g = s.grid
    const p = plotFor(s.buildings.find(b => b.kind === 'homestead'), s.streetZ)
    let empty = 0, starter = 0
    for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
      if (g.canTill(x, z)) empty++
      if (g.get('grown', x, z) === 3) starter++
    }
    assert.ok(empty >= 5)
    assert.ok(starter >= 3)
  }
})
check('dry nights pause growth; watered nights unlock harvest, returned seed and immediate sale', () => {
  const s = make(), g = s.grid
  const i = g.plot.findIndex((_, i) => g.canTill(i % N, Math.floor(i / N)))
  const x = i % N, z = Math.floor(i / N)
  assert.ok(s.till(x, z))
  assert.ok(s.sow(x, z, 'seed_grubwort'))
  s.weather = 'CLEAR'; s.sleep()
  assert.equal(g.get('grown', x, z), 0)
  for (let day = 0; day < CROPS.grubwort.total; day++) {
    s.weather = 'CLEAR'
    assert.ok(s.waterTile(x, z))
    s.sleep()
  }
  assert.ok(isRipe('grubwort', g.get('grown', x, z)))
  const seeds = s.count('seed_grubwort')
  assert.ok(s.harvest(x, z))
  assert.equal(s.count('seed_grubwort'), seeds + 1)
  const coin = s.coin
  assert.ok(s.sell('grubwort'))
  assert.equal(s.coin, coin + valueOf('grubwort'))
  assert.equal(s.stats.sold, 1)
  assert.equal(g.get('crop', x, z), 0)
})
check('seed purchase charges exactly once and invalid transactions leave inventory intact', () => {
  const s = make(), coin = s.coin, seeds = s.count('seed_grubwort')
  assert.ok(s.buy('seed_grubwort', 2))
  assert.equal(s.coin, coin - buyPrice('seed_grubwort') * 2)
  assert.equal(s.count('seed_grubwort'), seeds + 2)
  const before = JSON.stringify(s.toJSON())
  for (const n of [-1, 0, 1.5, NaN, Infinity]) {
    assert.equal(s.buy('seed_grubwort', n), false)
    assert.equal(s.sell('wood', n), false)
    assert.equal(s.ship('wood', n), false)
  }
  assert.equal(s.buy('seed_glowbulb'), false)
  assert.equal(s.buy('unknown'), false)
  assert.equal(s.sell('hoe'), false)
  assert.equal(s.ship('seed_grubwort'), false)
  assert.equal(JSON.stringify(s.toJSON()), before)
})
check('shipping pays at dawn once and cannot sell the same stack twice', () => {
  const s = make(), coin = s.coin
  s.give('palewheat', 3)
  assert.ok(s.ship('palewheat', 3))
  assert.equal(s.coin, coin)
  assert.equal(s.sell('palewheat', 3), false)
  assert.equal(s.sleep().earned, 3 * valueOf('palewheat'))
  assert.equal(s.sleep().earned, 0)
})
check('daily chat, gift and requests cannot duplicate their rewards, including after reload', () => {
  const s = make()
  for (const v of VILLAGERS) {
    s.give(v.gift, 5); s.give(v.request, v.amount * 3)
    assert.ok(s.chat(v.id))
    s.chat(v.id)
    assert.equal(s.friendships[v.id], 5)
    assert.ok(s.gift(v.id))
    assert.equal(s.gift(v.id), false)
    const coin = s.coin
    assert.ok(s.deliver(v.id))
    assert.equal(s.deliver(v.id), false)
    assert.equal(s.coin, coin + v.reward)
    assert.equal(s.friendships[v.id], 27)
  }
  const loaded = make()
  assert.ok(loaded.load(JSON.parse(JSON.stringify(s.toJSON()))))
  assert.deepEqual(loaded.friendships, s.friendships)
  for (const v of VILLAGERS) {
    loaded.chat(v.id)
    assert.equal(loaded.friendships[v.id], 27)
    assert.equal(loaded.gift(v.id), false)
    assert.equal(loaded.deliver(v.id), false)
  }
  loaded.sleep()
  loaded.chat('marn')
  assert.equal(loaded.friendships.marn, 32)
})
check('home upgrades spend the listed materials and survive saving', () => {
  const s = make()
  assert.equal(s.upgradeHome(), false)
  const cost = HOME_COST[1]
  for (const [id, n] of Object.entries(cost)) id === 'coin' ? s.coin = n : s.give(id, n - s.count(id))
  assert.ok(s.upgradeHome())
  assert.equal(s.homeTier, 2)
  assert.equal(s.coin, 0)
  assert.equal(s.count('wood'), 0)
  const loaded = make()
  assert.ok(loaded.load(JSON.parse(JSON.stringify(s.toJSON()))))
  assert.equal(loaded.homeTier, 2)
  assert.equal(loaded.buildings.find(b => b.kind === 'homestead').level, 2)
})
check('old saves keep their crops and resources and initialize social progress safely', () => {
  const s = make(), data = JSON.parse(JSON.stringify(s.toJSON()))
  delete data.friendships; delete data.lastChat; delete data.lastGift; delete data.lastDelivery
  const t = make()
  assert.ok(t.load(data))
  assert.deepEqual([...t.bag], data.bag)
  assert.ok(t.grid.crop.includes(cropIndex('grubwort')))
  assert.equal(t.chat('marn'), VILLAGERS[0].lines[0])
})
console.log(`\n${checks} village scenarios passed`)
