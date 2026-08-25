import { markSvg } from '../core/mark.js'
import { SEASON_DAYS, SEASON_NAMES, SEASON_SHORT, WEATHER } from '../game/crops.js'
import { item } from '../game/items.js'
import { MANIFEST_TOTAL } from '../game/story.js'
import { MAX_STAMINA, MAX_WATER } from '../game/state.js'
import { iconFor } from './icons.js'

/**
 * The heads-up display.
 *
 * **The interface has to be quieter than the world.** The world is washed out
 * and low-contrast; a HUD of bright cards sitting on top of it takes the frame
 * and the valley becomes the background to a dashboard. So: one dark plate,
 * hairline rules, small letter-spaced caps, tabular figures, and exactly one
 * accent colour used for exactly one thing at a time.
 *
 * That rule is Velion's and it is the reason an earlier pass here looked
 * generic — it rebuilt the HUD as a set of light rounded panels, which is what
 * every browser game looks like, and it was the loudest thing on screen.
 *
 * Everything is EVENT DRIVEN. The HUD subscribes to the game state and redraws
 * the one strip that changed; nothing polls. A farming game runs for hours, and
 * a HUD that rebuilds forty nodes a frame is the most expensive thing in a
 * scene otherwise made of two hundred triangles.
 */

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

const two = (n) => String(n).padStart(2, '0')

export class HUD {
  constructor(root, state, opts = {}) {
    this.state = state
    this.opts = opts
    this.node = el('div', 'hud')
    root.append(this.node)

    // A vignette, not a frame. It pulls the eye to the middle of a wide shot
    // and it is the only decoration in the whole interface.
    this.node.append(el('div', 'vig'))

    // --- the field log ------------------------------------------------------
    // One plate, four facts, in the order you look for them.
    this.log = el('div', 'log')
    this.logDate = el('b', 'log-date')
    this.logTime = el('span', 'log-time')
    this.logWeather = el('span', 'log-weather')
    this.logManifest = el('span', 'log-manifest')
    const row1 = el('div', 'log-row')
    row1.append(this.logDate, this.logTime)
    const row2 = el('div', 'log-row log-row-sub')
    row2.append(this.logWeather, this.logManifest)
    this.log.append(row1, row2)

    // --- the relay's forecast ----------------------------------------------
    // One line, and it only says anything when there is something to say.
    this.prune = el('div', 'prune')
    this.log.append(this.prune)

    // --- meters -------------------------------------------------------------
    this.meters = el('div', 'meters')
    this.stamina = this.meter('Stamina')
    this.water = this.meter('Can')
    this.meters.append(this.stamina.node, this.water.node)

    // --- hotbar -------------------------------------------------------------
    this.hotbar = el('div', 'hotbar')
    this.slots = Array.from({ length: 8 }, (_, i) => {
      const s = el('button', 'slot')
      s.type = 'button'
      s.append(el('span', 'slot-key', String(i + 1)), el('img', 'slot-icon'), el('span', 'slot-n'))
      s.addEventListener('click', () => {
        state.select(i)
        opts.onSelect?.(i)
      })
      this.hotbar.append(s)
      return s
    })

    // --- transient ----------------------------------------------------------
    this.hint = el('div', 'hint')
    this.toasts = el('div', 'toasts')
    this.dialogue = el('div', 'dialogue')
    this.dialogue.append(
      (this.dlgName = el('div', 'dlg-name')),
      (this.dlgLine = el('p', 'dlg-line')),
      el('div', 'dlg-hint', 'E — continue · Esc — leave'),
    )

    // The fragment card. Never more than four lines, because Marit's recorder
    // held twelve seconds and the rule is the rule.
    this.fragment = el('div', 'fragment')
    this.fragment.append(
      (this.fragTitle = el('div', 'frag-title')),
      (this.fragBody = el('div', 'frag-body')),
      (this.fragFrom = el('div', 'frag-from')),
    )
    this.fragment.addEventListener('click', () => this.closeFragment())

    this.mark = el('div', 'corner', markSvg({ className: 'corner-mark' }))

    // --- audio ---------------------------------------------------------------
    // Two words, no icons. A speaker glyph at this size is four grey pixels and
    // a guess; the interface is already set in small letter-spaced caps, so the
    // control that turns the music off may as well say so.
    this.sound = el('div', 'sound')
    this.sfxBtn = el('button', 'sound-btn', 'Sound')
    this.musBtn = el('button', 'sound-btn', 'Music')
    this.sfxBtn.type = this.musBtn.type = 'button'
    this.sfxBtn.addEventListener('click', () => this.setSound(!this.sfxOn))
    this.musBtn.addEventListener('click', () => this.setMusic(!this.musOn))
    this.sound.append(this.sfxBtn, this.musBtn)
    this.sfxOn = opts.sound ?? true
    this.musOn = opts.music ?? true
    this.paintAudio()

    this.node.append(this.log, this.meters, this.hotbar, this.hint, this.toasts, this.dialogue, this.fragment, this.sound, this.mark)

    state.on('bag', () => this.drawHotbar())
    state.on('hotbar', () => this.drawHotbar())
    state.on('vitals', () => this.drawMeters())
    state.on('day', () => this.drawAll())
    state.on('manifest', () => this.drawLog())
    state.on('toast', (t) => this.toast(t.text, t.tone))
    state.on('fragment', (f) => this.showFragment(f))
    state.on('pruning', (p) => this.onPruning(p))

    this.drawAll()
  }

  paintAudio() {
    this.sfxBtn.classList.toggle('is-off', !this.sfxOn)
    this.musBtn.classList.toggle('is-off', !this.musOn)
  }

  setSound(on) {
    this.sfxOn = on
    this.paintAudio()
    this.opts.onSound?.(on)
  }

  setMusic(on) {
    this.musOn = on
    this.paintAudio()
    this.opts.onMusic?.(on)
  }

  meter(label) {
    const node = el('div', 'meter')
    const track = el('div', 'meter-track')
    const fillEl = el('i')
    track.append(fillEl)
    node.append(el('span', 'meter-label', label), track)
    return { node, fill: fillEl }
  }

  drawAll() {
    this.drawLog()
    this.drawMeters()
    this.drawHotbar()
    this.drawPruning()
  }

  drawLog() {
    const s = this.state
    const dayOfSeason = ((s.day - 1) % SEASON_DAYS) + 1
    this.logDate.textContent = `${SEASON_SHORT[s.season]} ${dayOfSeason} / ${SEASON_DAYS}`
    this.logDate.title = `${SEASON_NAMES[s.season]}, year ${s.year}`
    this.logWeather.textContent = WEATHER[s.weather].label
    this.logManifest.textContent = `Manifest ${s.manifestCount} / ${MANIFEST_TOTAL}`
  }

  drawMeters() {
    const s = this.state
    this.stamina.fill.style.width = `${(s.stamina / MAX_STAMINA) * 100}%`
    this.stamina.node.classList.toggle('is-low', s.stamina < MAX_STAMINA * 0.25)
    this.water.fill.style.width = `${(s.water / MAX_WATER) * 100}%`
    this.water.node.classList.toggle('is-low', s.water < 6)
  }

  drawHotbar() {
    const s = this.state
    this.slots.forEach((node, i) => {
      const id = s.hotbar[i]
      node.classList.toggle('is-active', i === s.slot)
      node.classList.toggle('is-empty', !id)
      const img = node.querySelector('.slot-icon')
      const n = node.querySelector('.slot-n')
      if (!id) {
        img.removeAttribute('src')
        n.textContent = ''
        node.title = ''
        return
      }
      img.src = iconFor(id)
      const count = s.count(id)
      n.textContent = count > 1 ? String(count) : ''
      node.title = `${item(id).name} — ${item(id).desc}`
    })
  }

  /** The relay's line. Silent until a pass is close, because a permanent
   *  countdown is a permanent anxiety and the Loom is not in a hurry. */
  drawPruning() {
    const nights = Math.max(0, this.state.nextPruning - this.state.day)
    const unregistered = this.state.unregistered.length
    if (nights > 2 || !unregistered) {
      this.prune.textContent = ''
      this.prune.classList.remove('is-on')
      return
    }
    this.prune.textContent = nights === 0
      ? `Pass tonight · ${unregistered} unregistered`
      : `Pass in ${nights} ${nights === 1 ? 'night' : 'nights'} · ${unregistered} unregistered`
    this.prune.classList.add('is-on')
  }

  /** The one-line hint: what the key in your hand would do. */
  setHint(text) {
    if (this._hint === text) return
    this._hint = text
    this.hint.innerHTML = text ?? ''
    this.hint.classList.toggle('is-on', !!text)
  }

  toast(text, tone = 'plain') {
    const n = el('div', `toast toast-${tone}`, text)
    this.toasts.append(n)
    // Fade on a timer rather than on animationend: an animationend that never
    // fires (a backgrounded tab) leaves the message on screen forever.
    setTimeout(() => n.classList.add('is-out'), 3400)
    setTimeout(() => n.remove(), 4100)
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove()
  }

  say(who) {
    if (!who) {
      this.dialogue.classList.remove('is-on')
      return
    }
    this.dlgName.textContent = who.name
    this.dlgLine.textContent = who.line
    this.dialogue.classList.add('is-on')
  }

  /** A soil-tag or a log. Four lines maximum, no exceptions — the constraint is
   *  what keeps the story from becoming a wall of text in a corner. */
  showFragment(f) {
    this.fragTitle.textContent = f.title
    this.fragBody.replaceChildren(...f.lines.slice(0, 4).map((l) => el('p', null, l)))
    this.fragFrom.textContent = f.from
    this.fragment.classList.add('is-on')
    clearTimeout(this._fragTimer)
    this._fragTimer = setTimeout(() => this.closeFragment(), 11000)
    this.opts.onFragment?.(f)
  }

  closeFragment() {
    clearTimeout(this._fragTimer)
    this.fragment.classList.remove('is-on')
  }

  onPruning(p) {
    if (p.phase === 'warn') {
      this.node.classList.add('is-pass')
      this.toast('Something went through the valley in the night.', 'warn')
    } else if (p.phase === 'done') {
      this.node.classList.remove('is-pass')
      this.drawPruning()
    }
  }

  /** Called every frame with the clock. Exactly one DOM write per frame, and
   *  only when the displayed minute has actually changed. */
  tick(hour) {
    const h = Math.floor(hour) % 24
    const m = Math.floor((hour % 1) * 6) * 10
    const stamp = `${two(h)}:${two(m)}`
    if (stamp !== this._stamp) {
      this._stamp = stamp
      this.logTime.textContent = stamp
    }
    const night = hour < 6 || hour > 19.6
    if (night !== this._night) {
      this._night = night
      this.node.classList.toggle('is-night', night)
    }
  }
}
