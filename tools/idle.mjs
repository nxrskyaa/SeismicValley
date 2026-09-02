#!/usr/bin/env node
/**
 * Do the constructs move like five different things, or like one thing copied?
 *
 * "NPC gerakannya aneh dan sama semua" — they all move identically, and they
 * did: every rig started its clock at zero, so the breath cycle, the walk phase
 * and the pose timer were all in lockstep across the whole cast. Five stone
 * figures standing in one valley inhaling on exactly the same frame.
 *
 * Nothing caught it because each one is correct ON ITS OWN. The defect only
 * exists BETWEEN them, and a screenshot of a single construct — which is what
 * every capture of them was — cannot show it.
 *
 *   node tools/idle.mjs
 */

import * as THREE from 'three'
import { generate } from '../src/world/worldgen.js'
import { HOME } from '../src/world/worldgen.js'
import { Cast } from '../src/actors/cast.js'
import { GameState } from '../src/game/state.js'

let bad = 0
const fail = (what, detail) => { bad++; console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`) }
const ok = (what) => console.log(`  ok    ${what}`)

const DT = 1 / 60
const { grid } = generate(1)
const scene = new THREE.Group()
const state = new GameState(grid, 1)
const cast = new Cast(scene, grid, state, [HOME.x + 0.5, HOME.z + 0.5])
const away = new THREE.Vector3(4, 4, 4) // far from everyone, so nobody is reacting to the player

/** The joints that carry an idle: what the body is doing when it is doing nothing. */
const JOINTS = ['chest', 'armL', 'armR', 'head', 'body']

function poseOf(c) {
  const out = []
  for (const j of JOINTS) {
    const n = c.rig[j]
    if (!n) continue
    out.push(n.rotation.x, n.rotation.y, n.rotation.z, n.position.y, n.scale.y)
  }
  return out
}

/**
 * Sampled over twenty seconds, not one instant.
 *
 * Two constructs can share a pose for a moment without anything being wrong —
 * they are both standing. What must not happen is that they share EVERY pose,
 * for the whole run, which is what a common clock produces.
 */
const trails = cast.constructs.map(() => [])
for (let f = 0; f < 20 * 60; f++) {
  cast.update(DT, away, 12)
  if (f % 12 === 0) cast.constructs.forEach((c, i) => trails[i].push(poseOf(c)))
}

const names = cast.constructs.map((c) => c.spec.name)
let identical = []
let worstPair = null
let leastDiff = Infinity

for (let i = 0; i < trails.length; i++) {
  for (let j = i + 1; j < trails.length; j++) {
    // Mean absolute difference across the whole trail, per channel.
    let sum = 0
    let n = 0
    for (let f = 0; f < trails[i].length; f++) {
      for (let k = 0; k < trails[i][f].length; k++) {
        sum += Math.abs(trails[i][f][k] - trails[j][f][k])
        n++
      }
    }
    const diff = sum / n
    if (diff < leastDiff) { leastDiff = diff; worstPair = `${names[i]} and ${names[j]}` }
    if (diff < 1e-4) identical.push(`${names[i]} = ${names[j]}`)
  }
}

console.log(`\n  ${cast.constructs.length} constructs: ${names.join(', ')}\n`)

if (identical.length) {
  fail('constructs are animating in lockstep', identical.join(', '))
} else if (leastDiff < 0.004) {
  fail('constructs move too nearly alike',
    `closest pair ${worstPair}, mean difference ${leastDiff.toFixed(5)}`)
} else {
  ok(`every construct moves differently (closest pair ${worstPair}, ${leastDiff.toFixed(4)})`)
}

console.log(bad ? `\n  ${bad} problem(s)\n` : '\n  a cast, not a copy\n')
process.exit(bad ? 1 : 0)
