import { generate } from '../src/world/worldgen.js'
import { terrainStats } from './terrain-stats.mjs'
import { N } from '../src/world/grid.js'
for (const seed of [1, 77, 4242, 9001]) {
  const { grid } = generate(seed)
  const s = terrainStats(grid, N)
  console.log(`seed ${String(seed).padEnd(5)} ` + Object.entries(s).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`).join('  '))
}
