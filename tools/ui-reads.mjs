/**
 * Every field the interface reads off the game state has to EXIST on it.
 *
 * That sounds too obvious to be worth a test until you find that the journal
 * panel had been reading `s.tremorsSurvived` and `s.cairns` ever since the
 * tremor mechanic was cut and cairns became ordinary buildings — so pressing J
 * threw a TypeError, every single time, for as long as the panel had been in the
 * game. It is not a syntax error, it is not a lint error, and no capture had
 * ever opened the journal, because the key that closes a panel was broken too.
 *
 * ## How it reads the source
 *
 * Comments are stripped first — the comment explaining that bug names both dead
 * fields in prose, and a scanner that cannot tell code from prose reports its
 * own fix as a failure.
 *
 * Then three shapes are collected: `this.state.X`, `state.X`, and `s.X`. The
 * last one only counts while `s` is actually bound to the state: `panels.js`
 * opens nearly every method with `const s = this.state`, which is where the bug
 * lived, but `customize.js` binds `const s = skyAt(11)` and `hud.js` uses `s`
 * for a slot element. So the scan walks line by line and tracks what the most
 * recent binding pointed at.
 *
 * It is a regex over JavaScript, which is not a parser and cannot be. It is
 * allowed to miss things. It is not allowed to be wrong about the things it
 * reports, which is what the two rules above buy.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const FILES = ['ui/panels.js', 'ui/hud.js', 'ui/title.js', 'ui/customize.js', 'main.js']

/** `state.js` inside an import path is not a field read. */
const IGNORE = new Set(['js'])

export const stripJsComments = (src) => src
  // CRLF first, and it is not cosmetic. `.` in a JavaScript regex does not match
  // a carriage return, so `(.+)$` never matches a line that ends in one — every
  // binding in every file went undetected, silently, and the scan reported
  // `customize.js`'s own local form object as if it were the game state.
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')

/**
 * @param srcDir  the `src` directory
 * @param live    a constructed GameState to test membership against
 * @returns array of `"file: state.field"` strings, one per unknown read
 */
export function unknownStateReads(srcDir, live) {
  const unknown = []
  for (const file of FILES) {
    const src = stripJsComments(readFileSync(path.join(srcDir, file), 'utf8'))
    // `s` and `state` are both rebindable, and both are rebound in this
    // codebase: `customize.js` opens with `const state = { ...appearance }`,
    // which is a form and not a valley. Track what each currently points at.
    const alias = { s: null, state: 'state' }
    for (const line of src.split('\n')) {
      const bind = /\b(?:const|let)\s+(s|state)\s*=\s*(.+)$/.exec(line)
      if (bind) {
        alias[bind[1]] = /^(this\.state|state|app\.state)\b/.test(bind[2].trim()) ? 'state' : 'other'
      }

      const hits = [...line.matchAll(/\bthis\.state\.([A-Za-z_]\w*)/g)]
      if (alias.state === 'state') hits.push(...line.matchAll(/(?<![.\w])state\.([A-Za-z_]\w*)/g))
      if (alias.s === 'state') hits.push(...line.matchAll(/(?<![.\w])s\.([A-Za-z_]\w*)/g))

      for (const m of hits) {
        const key = m[1]
        if (IGNORE.has(key)) continue
        if (!(key in live)) unknown.push(`${file}: state.${key}`)
      }
    }
  }
  return [...new Set(unknown)]
}
