#!/usr/bin/env node
/**
 * Regenerate `public/mark.svg` from `src/core/mark.js`.
 *
 * The favicon is the only place the mark exists twice — the browser needs it as
 * a static file before any module has run — so it is GENERATED rather than
 * drawn, and this script is the reason the two cannot drift. Run it after any
 * change to the mark's geometry:
 *
 *   npm run mark
 *
 * tools/checks.js asserts the committed file still matches what this produces.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARK_FACETS } from '../src/core/mark.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/mark.svg')

const facets = MARK_FACETS.map(({ tone, points }) => {
  const d = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(2)} ${(-y * 100).toFixed(2)}`)
    .join(' ')
  return `    <path fill="${tone}" d="${d}Z"/>`
}).join('\n')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128" width="128" height="128">
  <!-- GENERATED from src/core/mark.js by tools/mark.mjs. Do not edit the path
       by hand: the browser tab and the gate lintel have to be the same shape. -->
  <rect x="-64" y="-64" width="128" height="128" rx="28" fill="#f2f0ed"/>
  <g transform="scale(0.86)">
${facets}
  </g>
</svg>
`

const before = (() => {
  try { return readFileSync(OUT, 'utf8') } catch { return null }
})()

if (process.argv.includes('--check')) {
  if (before !== svg) {
    console.error('public/mark.svg is out of date — run `npm run mark`')
    process.exit(1)
  }
  console.log('public/mark.svg matches src/core/mark.js')
} else {
  writeFileSync(OUT, svg)
  console.log(`${before === svg ? 'unchanged' : 'wrote'}  public/mark.svg`)
}
