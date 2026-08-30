#!/usr/bin/env node
/**
 * Is the construct built to the proportions scanned off the reference sheet?
 *
 * `overlap.mjs` answers "does anything pass through anything", which is a
 * different question from "is it the right shape". He was reported clean by
 * overlap while still reading as top-heavy, because moving an arm outward until
 * it stops intersecting the chest is exactly how a figure gets wide.
 *
 * The bands below came out of a row-median scan of the one drawing on the sheet
 * that has him alone on a plain background. Feet at 0, crown at 1. They are the
 * spec; this asserts the rig still meets it.
 *
 *   node tools/proportion.mjs
 */

import * as THREE from 'three'
import { buildRocky } from '../src/actors/rocky.js'

/**
 * A node's OWN meshes, not its descendants'.
 *
 * `traverse` reported the thigh as running from the floor to the hip, because
 * the shin and the foot hang off it — and the chest as the whole figure, since
 * the head and both arms are its children. Every band came out wrong in the
 * same direction, which is the signature of a measuring bug rather than a
 * modelling one.
 */
function ownBox(node) {
  const box = new THREE.Box3()
  let any = false
  for (const child of node.children) {
    if (!child.isMesh) continue
    if (child.material?.side === THREE.BackSide) continue  // the ink hull
    child.updateWorldMatrix(true, false)
    child.geometry.computeBoundingBox()
    box.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld))
    any = true
  }
  return any ? box : null
}

function fullBox(node) {
  const box = new THREE.Box3()
  node.traverse((c) => {
    if (!c.isMesh || c.material?.side === THREE.BackSide) return
    c.updateWorldMatrix(true, false)
    c.geometry.computeBoundingBox()
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld))
  })
  return box
}

const rig = buildRocky({ cut: 'rocky', chest: 'mark', height: 1 })
rig.root.updateWorldMatrix(true, true)

const all = fullBox(rig.root)
const H = all.max.y - all.min.y
const W = all.max.x - all.min.x
const base = all.min.y

/**
 * The rig is stretched in Y to compensate for the camera's 37-degree pitch, so
 * its raw width-to-height is not the drawing's. Bands expressed as a FRACTION of
 * total height divide the stretch out, since it is applied above everything; the
 * silhouette ratio has to have it removed by hand.
 */
const STRETCH = 1 / Math.cos((37 * Math.PI) / 180)

/** bottom, top — as a fraction of the whole figure. From the scan. */
const WANT = {
  foot:  [0.000, 0.125],
  shin:  [0.125, 0.285],
  thigh: [0.285, 0.440],
  chest: [0.545, 0.885],
  head:  [0.885, 1.000],
}
const TOL = 0.035

let bad = 0
console.log('\n  band      got            want           dev     width')
for (const [name, [lo, hi]] of Object.entries(WANT)) {
  const key = rig[name] ? name : `${name}L`
  const b = ownBox(rig[key])
  if (!b) { console.log(`  ${name}: no meshes`); bad++; continue }
  const g0 = (b.min.y - base) / H
  const g1 = (b.max.y - base) / H
  const d = Math.max(Math.abs(g0 - lo), Math.abs(g1 - hi))
  if (d > TOL) bad++
  console.log(
    `  ${name.padEnd(8)} ${g0.toFixed(3)}-${g1.toFixed(3)}  ${lo.toFixed(3)}-${hi.toFixed(3)}` +
    `  ${d > TOL ? `${(d * 100).toFixed(1)}% !` : '  ok  '}  ${((b.max.x - b.min.x) / H).toFixed(3)}`
  )
}

const silhouette = (W / (H / STRETCH))
console.log(`\n  silhouette W/H  ${silhouette.toFixed(3)}   drawing 0.83`)
if (Math.abs(silhouette - 0.83) > 0.09) { bad++; console.log('  FAIL  too far from the drawing') }

const chest = ownBox(rig.chest)
const cw = (chest.max.x - chest.min.x) / H
const ch = (chest.max.y - chest.min.y) / H
console.log(`  torso           ${cw.toFixed(3)} across x ${ch.toFixed(3)} tall`)

console.log(bad ? `\n  ${bad} out of spec\n` : '\n  in proportion\n')
process.exit(bad ? 1 : 0)
