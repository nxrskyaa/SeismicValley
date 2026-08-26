import { markSvg } from '../core/mark.js'
import { svgWordmark } from '../core/wordmark.js'
import { GameState } from '../game/state.js'
import { loadAppearance, saveAppearance } from '../game/appearance.js'
import { buildCustomizer } from './customize.js'
import { isTouch } from './keycaps.js'

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
 *
 * Two columns, and the split is the point. The left is the game — who you are,
 * where you woke up, and the one button that starts it. The right is the person
 * you are about to be, turning slowly on a plate under the same sky the valley
 * gets. A menu whose only content is a Start button is a door with a sign on
 * it; this one has something to look at while you decide.
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
  const left = el('div', 'title-col')
  const right = el('div', 'title-col title-col-side')

  left.append(
    el('div', 'title-mark', markSvg({ className: 'title-mark-svg' })),
    el('h1', 'title-word', svgWordmark('SEISMIC VALLEY', { className: 'title-type' })),
    el('p', 'title-lede', 'You were the only person underground when the world was rolled back. Forty days later a dog stands on your chest and there is a valley outside with four hundred and six species mixed into the soil of it.'),
  )

  // --- who you are ---------------------------------------------------------
  const dresser = buildCustomizer(loadAppearance())
  right.append(el('div', 'title-eyebrow', 'The settler'), dresser.node)

  // --- the actions ---------------------------------------------------------
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
  left.append(actions)

  const seedRow = el('label', 'title-seed')
  seedRow.append(el('span', null, 'Seed'))
  const seedInput = document.createElement('input')
  seedInput.type = 'text'
  seedInput.value = seed ?? 'seismic-valley'
  seedInput.spellcheck = false
  seedRow.append(seedInput)
  left.append(seedRow)

  /**
   * The controls, in the language of whatever is holding the device.
   *
   * A phone has no Shift key, no scroll wheel and no number row, so listing them
   * is not merely unhelpful — it tells a player that controls exist which do
   * not, while the ones that do sit unlabelled at the bottom of the screen.
   */
  left.append(el('div', 'title-keys', isTouch()
    ? `
    <div>drag the <b>stick</b> to walk · further to run</div>
    <div><b>USE</b> the tool in hand · <b>E</b> interact, talk, harvest</div>
    <div>tap the bar to change tool · <b>TURN</b> the camera · pinch to zoom</div>
    <div><b>REST</b> homestead · <b>MAKE</b> build and register · <b>LOG</b> journal</div>
  `
    : `
    <div><kbd>WASD</kbd> walk <kbd>Shift</kbd> run <kbd>Space</kbd> jump</div>
    <div><kbd>F</kbd> use the tool in hand <kbd>E</kbd> interact, talk, harvest</div>
    <div><kbd>1</kbd>–<kbd>8</kbd> hotbar <kbd>Q</kbd> <kbd>R</kbd> turn the camera <kbd>wheel</kbd> zoom</div>
    <div><kbd>Tab</kbd> homestead <kbd>B</kbd> build and register <kbd>J</kbd> journal <kbd>F5</kbd> save</div>
  `))
  left.append(el('div', 'title-credit', 'A procedural Three.js game by <a href="https://x.com/nxrskyaa" target="_blank" rel="noopener">Nxrskyaa</a>. Nothing in it is a downloaded asset.'))

  card.append(left, right)
  node.append(card)
  root.append(node)
  document.body.classList.add('is-title')

  // Focus something, so the very first key press is not swallowed by the body.
  requestAnimationFrame(() => (save ? actions.firstChild : fresh).focus())

  function finish(opts) {
    const appearance = dresser.value
    saveAppearance(appearance)
    node.classList.add('is-out')
    document.body.classList.remove('is-title')
    setTimeout(() => {
      dresser.dispose()
      node.remove()
    }, 420)
    onStart({ ...opts, appearance })
  }

  return {
    node,
    close: () => finish({ load: null }),
  }
}
