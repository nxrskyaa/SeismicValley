import { CROPS, CROP_ORDER, seedFor } from '../game/crops.js'
import { item } from '../game/items.js'
import { iconFor } from './icons.js'

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

/**
 * THE TWO VERBS, ON SCREEN.
 *
 * This game is about sowing and lifting and the interface never said so. Farming
 * was: know that the hoe is slot 1, know that a seed has to be the held item,
 * know which of eight small dark squares holds it, walk onto the right cell,
 * press F. Every part of that is discoverable only by having been told, and
 * nothing on screen ever showed how many beds were waiting or whether anything
 * had come ripe — the two numbers that decide what you do next.
 *
 * ## What this borrows, and what it does not
 *
 * The shape is borrowed from farming games that get this right: the primary
 * verbs get real buttons, and each button carries its own count so the state of
 * the field is legible without opening anything. That is the part that was
 * missing.
 *
 * The look is NOT borrowed. This project's interface is Seismic's brown and
 * cream with hairline rules and small tracked capitals, and it stays that way —
 * the tokens here are the same ones the rest of the interface uses. Chunky is
 * about hit area and hierarchy, not about saturation.
 *
 * ## Why a button and not just a readout
 *
 * A count with nowhere to go is a scoreboard. These do the one thing the player
 * would otherwise scan the whole valley for: PLANT opens the seed you actually
 * hold and puts it in hand, HARVEST points at the nearest ripe crop. Neither one
 * reaches out and farms for you — you still walk there and you still swing,
 * because that is the game.
 */
export class ActionBar {
  constructor(root, state, opts = {}) {
    this.state = state
    this.opts = opts
    this.node = el('div', 'acts')

    this.plant = this.button('Plant', 'plant')
    this.harvest = this.button('Harvest', 'harvest')

    /** The seed tray, which only exists while it is open. */
    this.tray = el('div', 'tray')
    this.tray.hidden = true

    this.node.append(this.tray, el('div', 'acts-row'))
    this.node.querySelector('.acts-row').append(this.plant.node, this.harvest.node)
    root.append(this.node)

    this.plant.node.addEventListener('click', () => this.toggleTray())
    this.harvest.node.addEventListener('click', () => this.opts.onFind?.('ripe'))

    for (const ev of ['crops', 'bag', 'day', 'hotbar', 'manifest']) state.on(ev, () => this.draw())
    this.draw()
  }

  button(label, kind) {
    const node = el('button', `act act-${kind}`)
    node.type = 'button'
    const text = el('span', 'act-text')
    text.append(el('b', 'act-label', label), el('span', 'act-sub', ''))
    node.append(el('span', 'act-glyph'), text, el('span', 'act-count', '0'))
    return { node, sub: text.querySelector('.act-sub'), count: node.querySelector('.act-count') }
  }

  /**
   * Species the player can sow RIGHT NOW: seed in the bag, and in season.
   *
   * Not `availableSpecies` — that answers a different question, which is what
   * the seed vault is able to supply, and before the vault is repaired it is
   * only what you have already carried through to a harvest. Using it here meant
   * the tray read "no seed" on day one while the player stood there holding
   * fourteen of them, which is the single worst moment to be wrong.
   *
   * What you can sow is what you are holding. That is the whole rule.
   */
  sowable() {
    const s = this.state
    return CROP_ORDER
      .filter((id) => s.has(seedFor(id), 1))
      .filter((id) => CROPS[id].seasons.includes(s.season))
  }

  toggleTray() {
    const open = this.tray.hidden
    this.tray.hidden = !open
    this.plant.node.classList.toggle('is-open', open)
    if (open) this.drawTray()
  }

  close() {
    this.tray.hidden = true
    this.plant.node.classList.remove('is-open')
  }

  drawTray() {
    this.tray.replaceChildren()
    const ids = this.sowable()
    if (!ids.length) {
      // Say WHICH of the two reasons it is. "No seed" and "nothing in season"
      // send the player to completely different places.
      const any = CROP_ORDER.some((id) => this.state.has(seedFor(id), 1))
      this.tray.append(el('p', 'tray-empty', any
        ? 'Nothing you hold is in season. The vault on the street holds the rest.'
        : 'No seed. A harvest returns its own, and the seed vault holds the others.'))
      return
    }
    for (const id of ids) {
      const seed = seedFor(id)
      const b = el('button', 'seed')
      b.type = 'button'
      const img = el('img', 'seed-icon')
      img.src = iconFor(seed)
      img.alt = ''
      b.append(img, el('span', 'seed-name', item(id).name), el('span', 'seed-n', String(this.state.count(seed))))
      b.addEventListener('click', () => {
        if (!this.state.equip(seed)) return
        this.close()
        this.opts.onFind?.('bed')
      })
      this.tray.append(b)
    }
  }

  draw() {
    const { slots, ripe, growing } = this.state.countField()
    this.plant.count.textContent = String(slots)
    this.plant.sub.textContent = slots === 1 ? 'bed open' : 'beds open'
    this.plant.node.classList.toggle('is-idle', slots === 0)

    this.harvest.count.textContent = String(ripe)
    this.harvest.sub.textContent = ripe ? (ripe === 1 ? 'ready' : 'ready') : growing ? `${growing} growing` : 'nothing sown'
    this.harvest.node.classList.toggle('is-idle', ripe === 0)
    this.harvest.node.classList.toggle('is-ready', ripe > 0)

    if (!this.tray.hidden) this.drawTray()
  }
}
