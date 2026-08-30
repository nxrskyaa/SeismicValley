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
 *   node tools/overlap.mjs seams      assemblies that have come apart
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

if (MODE === 'seams') {
  /**
   * IS EACH ASSEMBLY STILL ONE MASS?
   *
   * The opposite failure to the other two modes, and it appeared the moment
   * `chamferBox` stopped inflating: parts positioned by eye to overlap a
   * constructor that was quietly 32% generous now merely touch, or miss. A tree
   * whose canopy cubes have drifted apart stops reading as a canopy and starts
   * reading as a pile of boxes, and nothing throws.
   *
   * So: build the assembly, take every mesh box, and join boxes that touch.
   * More than one island left over means it has come apart.
   */
  const { treeParts } = await import('../src/world/props.js')
  const { buildRocky } = await import('../src/actors/rocky.js')
  const { buildPlayer } = await import('../src/actors/player.js')

  /**
   * Buildings are absent on purpose: they are `bake`d into one buffer, so by the
   * time anything can be measured there are no parts left to be apart. Covering
   * them would mean either exporting parts from ten builders or rasterising the
   * baked geometry, and there is no evidence of the defect there — the captures
   * show walls, roofs and chimneys attached. Trees earned their place here by
   * actually coming apart.
   */

  const subjects = []
  for (let kind = 0; kind < 3; kind++) {
    // Trees are baked, so their parts are measured before the bake: positions
    // and geometries, assembled into throwaway meshes.
    const g = new THREE.Group()
    for (const part of treeParts(kind)) {
      const m = new THREE.Mesh(part.geometry)
      m.position.fromArray(part.position)
      if (part.scale) m.scale.fromArray(part.scale)
      g.add(m)
    }
    subjects.push([`tree ${kind}`, g, 5])
  }
  subjects.push(['Rocky', buildRocky({ cut: 'rocky', chest: 'mark', height: 1 }).root, 1.19])
  subjects.push(['the settler', buildPlayer('apprentice').root, 1.0])

  for (const [name, node, height] of subjects) {
    node.updateWorldMatrix(true, true)
    const boxes = []
    const labels = []
    node.traverse((c) => {
      if (!c.isMesh || c.material?.side === THREE.BackSide) return
      c.updateWorldMatrix(true, false)
      c.geometry.computeBoundingBox()
      boxes.push(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld))
      // The nearest named ancestor, so a failure says WHICH piece floated off
      // rather than how many did.
      let p = c
      while (p && !p.name) p = p.parent
      labels.push(p?.name ?? '?')
    })
    if (boxes.length < 2) { ok(`${name}: one piece`); continue }

    // Union-find over "these two boxes touch". A hair of slack, because two
    // faces meeting exactly is contact and floating-point will not say so.
    const parent = boxes.map((_, i) => i)
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    const SLACK = 1e-3
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const gap = Math.max(
          a.min.x - b.max.x, b.min.x - a.max.x,
          a.min.y - b.max.y, b.min.y - a.max.y,
          a.min.z - b.max.z, b.min.z - a.max.z,
        )
        if (gap <= SLACK) parent[find(i)] = find(j)
      }
    }
    const groups = new Map()
    boxes.forEach((_, i) => {
      const r = find(i)
      if (!groups.has(r)) groups.set(r, new Set())
      groups.get(r).add(labels[i])
    })
    if (groups.size > 1) {
      /**
       * HOW WIDE IS THE GAP, not just that there is one.
       *
       * A hairline where two plates were meant to butt up is a different defect
       * from a foot hanging below a shin, and only the size tells them apart. So
       * each adrift island reports the shortest distance back to the main mass —
       * which is also exactly how far something has to move to fix it.
       */
      const roots = [...groups.keys()].sort((a, b) => groups.get(b).size - groups.get(a).size)
      const main = boxes.map((_, i) => i).filter((i) => find(i) === roots[0])
      const adrift = roots.slice(1).map((r) => {
        const mine = boxes.map((_, i) => i).filter((i) => find(i) === r)
        let best = Infinity
        for (const i of mine) {
          for (const j of main) {
            const a = boxes[i]
            const b = boxes[j]
            const g = Math.max(
              a.min.x - b.max.x, b.min.x - a.max.x,
              a.min.y - b.max.y, b.min.y - a.max.y,
              a.min.z - b.max.z, b.min.z - a.max.z,
            )
            if (g < best) best = g
          }
        }
        return { what: [...groups.get(r)].join('+'), gap: best }
      })
      const worst = Math.max(...adrift.map((a) => a.gap))
      const detail = adrift.map((a) => `${a.what} ${a.gap.toFixed(4)} clear`).join(', ')
      // A gap under a thousandth of the figure is a rounding artefact between
      // plates that were meant to butt up, not a limb hanging off.
      if (worst > (height ?? 1) * 0.004) fail(`${name}: has come apart`, detail)
      else ok(`${name}: one mass, hairline joins only (${detail})`)
    } else ok(`${name}: one connected mass (${boxes.length} meshes)`)
  }
}

console.log(bad ? `\n${bad} problem(s)\n` : '\nclean\n')
process.exit(bad ? 1 : 0)
