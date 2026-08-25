import { markSvg } from '../core/mark.js'
import { svgWordmark } from '../core/wordmark.js'
import { GameState } from '../game/state.js'

/**
 * The title card.
 *
 * Set entirely in the game's own letterforms — the same chamfered contours the
 * gate lintel and Rocky's chest plate are cut from — so the first thing on
 * screen is already the identity rather than a stand-in for it.
 *
 * It sits OVER a live valley rather than over a still. The world is already
 * generating and rendering behind this card; pressing a button fades the card
 * and hands the camera over. That is why there is no loading screen anywhere in
 * the game: the load is the title.
 */

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

export function showTitle(root, { onStart, seed }) {
  const node = el('div', 'title')

  const card = el('div', 'title-card')
  card.append(
    el('div', 'title-mark', markSvg({ className: 'title-mark-svg' })),
    el('h1', 'title-word', svgWordmark('SEISMIC VALLEY', { className: 'title-type' })),
    el('p', 'title-lede', 'Farm a valley that will not hold still. The fault moves every few days and takes back whatever was not standing behind a stone.'),
  )

  const save = GameState.peek()
  const actions = el('div', 'title-actions')

  if (save) {
    const cont = el('button', 'btn btn-solid btn-lg', `Continue — day ${save.day}`)
    cont.addEventListener('click', () => finish({ load: save }))
    actions.append(cont)
  }

  const fresh = el('button', `btn btn-lg${save ? '' : ' btn-solid'}`, save ? 'New valley' : 'Begin')
  fresh.addEventListener('click', () => {
    if (save && !confirm('Start a new valley? The saved one is overwritten when you next sleep.')) return
    finish({ load: null, seed: seedInput.value.trim() || undefined })
  })
  actions.append(fresh)
  card.append(actions)

  const seedRow = el('label', 'title-seed')
  seedRow.append(el('span', null, 'Seed'))
  const seedInput = el('input')
  seedInput.type = 'text'
  seedInput.value = seed ?? 'seismic-valley'
  seedInput.spellcheck = false
  seedRow.append(seedInput)
  card.append(seedRow)

  card.append(el('div', 'title-keys', `
    <div><kbd>WASD</kbd> walk <kbd>Shift</kbd> run <kbd>Space</kbd> jump</div>
    <div><kbd>F</kbd> use the tool in hand <kbd>E</kbd> interact, talk, harvest</div>
    <div><kbd>1</kbd>–<kbd>8</kbd> hotbar <kbd>Q</kbd> <kbd>R</kbd> turn the camera <kbd>wheel</kbd> zoom</div>
    <div><kbd>Tab</kbd> homestead <kbd>B</kbd> raise <kbd>J</kbd> journal <kbd>F5</kbd> save</div>
  `))
  card.append(el('div', 'title-credit', 'A procedural Three.js game by <a href="https://x.com/nxrskyaa" target="_blank" rel="noopener">Nxrskyaa</a>. Nothing in it is a downloaded asset.'))

  node.append(card)
  root.append(node)

  // Focus something, so the very first key press is not swallowed by the body.
  requestAnimationFrame(() => (save ? actions.firstChild : fresh).focus())

  function finish(opts) {
    node.classList.add('is-out')
    setTimeout(() => node.remove(), 420)
    onStart(opts)
  }

  return {
    node,
    close: () => finish({ load: null }),
  }
}
