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
 *
 * The favicon is the BRAND asset, so it is the full mark — all four facets on
 * the site's own off-white ground — rather than the one-colour stencil the game
 * cuts into stone. Both come out of the same vertex table in mark.js.
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
  <!-- GENERATED from src/core/mark.js by tools/mark.mjs. Do not edit the paths
       by hand: the browser tab and the gate lintel have to be the same shape. -->
  <rect x="-64" y="-64" width="128" height="128" rx="28" fill="#f2f0ed"/>
  <g transform="scale(0.86)">
${facets}
  </g>
</svg>
`

if (process.argv.includes('--check')) {
  const have = readFileSync(OUT, 'utf8')
  if (have !== svg) {
    console.error('public/mark.svg is out of date — run `npm run mark`')
    process.exit(1)
  }
  console.log('ok     public/mark.svg matches')
} else {
  writeFileSync(OUT, svg)
  console.log('wrote  public/mark.svg')
}
