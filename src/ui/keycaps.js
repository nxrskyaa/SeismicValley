/**
 * The same instruction, in the language of the device holding it.
 *
 * Every hint and every line of the first morning is written with keyboard caps
 * in it, because that is what most people are playing on. On a phone there is no
 * keyboard and there never will be, so a card that says "Shift to run" and
 * "press F" is worse than a card that says nothing — it names controls that do
 * not exist while the ones that do sit unlabelled in the corner.
 *
 * The pads carry words rather than icons (USE, E, JUMP, TURN, LOG, REST, MAKE),
 * so the translation is a straight substitution: whatever the keyboard cap says,
 * put the pad's own label there instead. What the player reads on the card is
 * then exactly what is printed on the thing they are about to press.
 *
 * Ordered longest-pattern-first, because `<kbd>W</kbd><kbd>A</kbd>…` has to be
 * matched as a phrase before the single caps inside it are.
 */

const RULES = [
  // The whole walk phrase, which has no per-key equivalent at all.
  [/<kbd>W<\/kbd><kbd>A<\/kbd><kbd>S<\/kbd><kbd>D<\/kbd>\s*walk\s*·\s*<kbd>Shift<\/kbd>\s*run/gi, 'drag the <b>stick</b> to walk'],
  [/<kbd>W<\/kbd><kbd>A<\/kbd><kbd>S<\/kbd><kbd>D<\/kbd>/gi, 'the <b>stick</b>'],
  [/<kbd>Shift<\/kbd>\s*run/gi, 'push it further to run'],
  [/<(kbd|b)>F<\/\1>/g, '<b>USE</b>'],
  [/<(kbd|b)>E<\/\1>/g, '<b>E</b>'],
  [/<(kbd|b)>B<\/\1>/g, '<b>MAKE</b>'],
  [/<(kbd|b)>J<\/\1>/g, '<b>LOG</b>'],
  [/<(kbd|b)>Tab<\/\1>/gi, '<b>REST</b>'],
  [/<(kbd|b)>Space<\/\1>/gi, '<b>JUMP</b>'],
  [/<(kbd|b)>Q<\/\1>\s*<(kbd|b)>R<\/\2>/g, '<b>TURN</b>'],
  [/<(kbd|b)>R<\/\1>/g, '<b>TURN</b>'],
  // A hotbar slot is a thing you tap, not a number you press.
  [/<(kbd|b)>([1-8])<\/\1>\s*take/g, 'tap slot $2 for'],
  [/<(kbd|b)>([1-8])<\/\1>/g, 'slot $2'],
]

/** True when the touch controls are the ones on screen. */
export const isTouch = () => document.body.classList.contains('is-touch')

/**
 * The substitution itself, with no DOM in it.
 *
 * Split out from `keycaps` so the checks can prove that every cap the game
 * writes has a rule — a translation table that silently passes `<kbd>5</kbd>`
 * through is worse than none, because it looks like it worked.
 */
export function translate(html) {
  if (!html) return html
  let out = html
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  return out
}

/**
 * Rewrite keyboard caps into pad labels. A no-op on anything with a keyboard,
 * so callers can pass every string through it unconditionally.
 */
export function keycaps(html) {
  if (!html || !isTouch()) return html
  return translate(html)
}
