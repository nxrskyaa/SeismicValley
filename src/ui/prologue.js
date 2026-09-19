import { svgWordmark } from '../core/wordmark.js'

/**
 * THE COLD OPEN.
 *
 * The story bible has five delivery rules and four of them are about restraint:
 * never more than four lines at once, found not given, out of order, and the
 * mundane before the cosmic. A prologue is the one place those rules are hard to
 * keep, because a prologue is by definition given rather than found.
 *
 * So this one is not lore. It is the ninety seconds you personally lived through
 * before the game starts, told in the order you lived them, and it deliberately
 * does not explain the Loom, the Manifest, the rollback or the colony. All of
 * that is still out there under a hoe. What this does is put you in a doorway
 * with a dog and a chip and a valley, which is the minimum a player needs to
 * know why they are holding a hoe at all.
 *
 * Every card is four lines or fewer — the same rule the soil-tags obey, applied
 * to the one piece of writing in the game that could have gotten away with
 * breaking it.
 *
 * It runs OVER the live valley: the world is already meshed and the camera is
 * already drifting behind the text. Skippable on the first key, remembered
 * afterwards, and never shown when a save is being loaded — nobody wants the
 * opening of a film every time they come back to a farm.
 */

/**
 * Each card names a SHOT, and the camera actually goes there.
 *
 * The prologue used to be text fading over whatever the camera happened to be
 * pointing at, which is a title card, not an opening. The valley is already
 * meshed and lit behind it, so the cheapest cinematic thing available is to use
 * it: the shot names are resolved to real coordinates by `main.js`, which is the
 * only place that knows where anything is.
 */
export const CARDS = [
  { shot: 'door', lines: ['The vault door opened on the fortieth day.', 'A dog was waiting on the other side.', 'She seemed to think you were late.'] },
  { shot: 'home', lines: ['A small house. A borrowed hoe.', 'Marn left a row of seedlings by the door.', '“Water these tonight,” the note said.'] },
  { shot: 'street', lines: ['Not everyone made it back at once.', 'But there is a carpenter, a pond keeper,', 'and somebody who still believes in this soil.'] },
  { shot: 'water', lines: ['Start with one seed.', 'Make a little room for tomorrow.'], last: true },
]

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

const KEY = 'seismic-valley.prologue'

/** Has the player already sat through it? */
export const prologueSeen = () => {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
const markSeen = () => {
  try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
}

/**
 * @param root   where to mount
 * @param onDone called once, whether it was watched or skipped
 * @param opts.hold seconds a card stays up before it advances itself
 */
export function showPrologue(root, onDone, { hold = 5.2, onShot } = {}) {
  const node = el('div', 'prologue')
  // Letterbox. Two bars that slide in over the live valley and out again at the
  // end — the cheapest signal there is that what you are watching is staged and
  // that control is coming back afterwards.
  node.append(el('div', 'prologue-bar is-top'), el('div', 'prologue-bar is-bot'))
  const card = el('div', 'prologue-card')
  const text = el('p', 'prologue-lines')
  card.append(text)

  const foot = el('div', 'prologue-foot')
  const dots = el('div', 'prologue-dots')
  const pips = CARDS.map(() => {
    const d = el('i')
    dots.append(d)
    return d
  })
  const skip = el('button', 'btn btn-sm', 'Skip')
  skip.type = 'button'
  foot.append(dots, skip)
  card.append(foot)
  node.append(card)
  root.append(node)
  document.body.classList.add('is-title')

  let i = -1
  let timer = 0
  let done = false

  function show(n) {
    if (n >= CARDS.length) return finish()
    i = n
    const c = CARDS[n]
    // Fade the whole block, not each line. Lines that arrive one at a time read
    // as a chat window, and this is meant to read as a title sequence.
    text.classList.remove('is-in')
    setTimeout(() => {
      text.innerHTML = c.lines.map((l) => `<span>${l}</span>`).join('')
      if (c.last) {
        const w = el('div', 'prologue-word', svgWordmark('SEISMIC VALLEY', { className: 'prologue-type' }))
        text.append(w)
      }
      text.classList.add('is-in')
    }, 340)
    // The camera starts moving with the fade, not after it, so the cut and the
    // move are one gesture rather than two.
    onShot?.(c.shot ?? null, n)
    pips.forEach((d, k) => d.classList.toggle('is-on', k <= n))
    clearTimeout(timer)
    timer = setTimeout(() => show(n + 1), hold * 1000)
  }

  function finish() {
    if (done) return
    done = true
    clearTimeout(timer)
    markSeen()
    removeEventListener('keydown', onKey)
    node.classList.add('is-out')
    document.body.classList.remove('is-title')
    // Hand the camera back before the bars have finished retracting, so the
    // player's first frame of control is already theirs.
    onShot?.(null, -1)
    setTimeout(() => node.remove(), 600)
    onDone?.()
  }

  function onKey(e) {
    if (e.key === 'Escape') return finish()
    // Any other key is "next", including the one the player is about to try to
    // walk with. Trapping WASD here and doing nothing is how a prologue becomes
    // a thing people resent.
    if (e.key === ' ' || e.key === 'Enter' || e.key.length === 1) {
      e.preventDefault()
      show(i + 1)
    }
  }

  addEventListener('keydown', onKey)
  skip.addEventListener('click', finish)
  node.addEventListener('click', (e) => { if (e.target !== skip) show(i + 1) })

  show(0)
  return { node, close: finish }
}
