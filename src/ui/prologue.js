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

export const CARDS = [
  {
    lines: [
      'The vault door opened on the fortieth day.',
      'Nobody opened it.',
      'It simply stopped being closed.',
    ],
  },
  {
    lines: [
      'You went up the stairs with a survey dog',
      'you had never met, and a chip that listed',
      'four hundred and six species.',
    ],
  },
  {
    lines: [
      'The colony is not out here.',
      'Not ruined. Not buried.',
      'Not here.',
    ],
  },
  {
    lines: [
      'You were underground when it happened.',
      'That is the whole reason there is enough of you',
      'left to be standing in a doorway.',
    ],
  },
  {
    lines: [
      'Forty days of rain have put everything the Vault',
      'held into the soil of this valley, in pieces.',
      'You have a hoe, and the growing season is short.',
    ],
    last: true,
  },
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
export function showPrologue(root, onDone, { hold = 5.2 } = {}) {
  const node = el('div', 'prologue')
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
