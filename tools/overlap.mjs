#!/usr/bin/env node
/**
 * Where does a rig intersect itself, and where do two buildings collide?
 *
 * Both defects shipped, both are geometric, and both are invisible to every
 * other tool here: a screenshot of a construct whose arm is buried in its chest
 * looks like a construct, and a capture of two houses sharing a wall looks like
 * a street until you walk into it.
 *
 * So they get measured. Axis-aligned boxes in world space, pair by pair, with a
 * tolerance — parts that MEET are correct and parts that pass through each other
 * are not, and the difference is how deep the overlap runs.
 *
 *   node tools/overlap.mjs rig        the constructs and the player
 *   node tools/overlap.mjs buildings  every structure the generator places
 */

import * as THREE from 'three'

const MODE = process.argv[2] ?? 'rig'
let bad = 0
const fail = (what, detail) => {
  bad++
  console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`)
}
const ok = (what) => console.log(`  ok    ${what}`)

/** The world-space box of one pivot's own meshes — not its children's, or every
 *  parent trivially contains every child and nothing can ever be measured. */
function ownBox(node) {
  const box = new THREE.Box3()
  let any = false
  for (const child of node.children) {
    if (!child.isMesh) continue
    // Skip the ink hull: it is a deliberately inflated copy of its parent and
    // overlaps everything nearby by construction.
    if (child.material?.side === THREE.BackSide) continue
    child.updateWorldMatrix(true, false)
    // The mesh's OWN geometry only. `setFromObject` walks descendants, and every
    // plate carries its ink hull as a child — a deliberately inflated copy of
    // itself — so including them reported a clearance of 0.11 where the real
    // gap was 0.007.
    child.geometry.computeBoundingBox()
    const b = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld)
    box.union(b)
    any = true
  }
  return any ? box : null
}

/** How deep two boxes interpenetrate, on their least-overlapping axis. A pair
 *  that merely touches reads 0; a pair passing through each other reads the
 *  distance one would have to move to separate. */
function depth(a, b) {
  const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)
  const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)
  const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)
  if (x <= 0 || y <= 0 || z <= 0) return 0
  return Math.min(x, y, z)
}

if (MODE === 'rig') {
  const { buildRocky } = await import('../src/actors/rocky.js')
  const { buildPebble } = await import('../src/actors/pebble.js')
  const { buildPlayer } = await import('../src/actors/player.js')

  /**
   * Pairs that must not pass through each other, and the tolerance for each.
   *
   * An arm is ALLOWED to sit against the torso — that is a shoulder — so the
   * test is not "no contact", it is "no burial". A tenth of a unit on a rig one
   * unit tall is about the depth at which a limb stops reading as attached and
   * starts reading as stuck through.
   */
  const PAIRS = [
    ['armL', 'chest'], ['armR', 'chest'],
    ['foreL', 'chest'], ['foreR', 'chest'],
    ['handL', 'chest'], ['handR', 'chest'],
    ['foreL', 'body'], ['foreR', 'body'],
    ['handL', 'body'], ['handR', 'body'],
    ['thighL', 'thighR'], ['shinL', 'shinR'], ['footL', 'footR'],
    ['handL', 'thighL'], ['handR', 'thighR'],
    ['head', 'armL'], ['head', 'armR'],
  ]
  const TOL = 0.1

  const rigs = [
    ['Rocky', buildRocky({ cut: 'rocky', chest: 'mark', height: 1 })],
    ['pebble', buildPebble({ size: 1 })],
    ['the settler', buildPlayer('apprentice')],
  ]
  for (const [name, rig] of rigs) {
    rig.root.updateWorldMatrix(true, true)
    let worst = 0
    let worstPair = null
    for (const [a, b] of PAIRS) {
      if (!rig[a] || !rig[b]) continue
      const A = ownBox(rig[a])
      const B = ownBox(rig[b])
      if (!A || !B) continue
      const d = depth(A, B) / (rig.height ?? 1)
      if (d > worst) { worst = d; worstPair = `${a} into ${b}` }
    }
    if (worst > TOL) fail(`${name}: a limb passes through the body`, `${worstPair}, ${worst.toFixed(3)} deep`)
    else ok(`${name}: nothing passes through anything (worst ${worst.toFixed(3)} — ${worstPair ?? "none"})`)
  }
}

if (MODE === 'buildings') {
  const { generate } = await import('../src/world/worldgen.js')
  const { planSettlement } = await import('../src/world/settlement.js')
  const { KINDS } = await import('../src/world/buildings.js')

  for (const seed of [1, 77, 4242]) {
    const { grid } = generate(seed)
    const plan = planSettlement(grid)
    if (plan.refused.length) fail(`seed ${seed}: the plan could not place everything`, plan.refused.join(', '))

    /**
     * Every structure claims a rectangle. Two claims that intersect are two
     * buildings sharing a wall — which is what "the houses go through each
     * other" is, measured.
     */
    const claims = plan.placed.map((b) => {
      const built = KINDS[b.kind](b.level)
      const [fw, fd] = built.footprint
      return {
        kind: b.kind,
        x0: b.x - fw / 2, x1: b.x + fw / 2,
        z0: b.z - fd / 2, z1: b.z + fd / 2,
      }
    })
    let clashes = []
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i]
        const c = claims[j]
        const ox = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0)
        const oz = Math.min(a.z1, c.z1) - Math.max(a.z0, c.z0)
        if (ox > 0 && oz > 0) clashes.push(`${a.kind}/${c.kind} by ${Math.min(ox, oz).toFixed(1)}`)
      }
    }
    if (clashes.length) fail(`seed ${seed}: buildings overlap`, clashes.slice(0, 6).join(', '))
    else ok(`seed ${seed}: ${claims.length} structures, none overlapping`)
  }
}

console.log(bad ? `\n${bad} problem(s)\n` : '\nclean\n')
process.exit(bad ? 1 : 0)
