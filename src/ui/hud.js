import { markSvg } from '../core/mark.js'
import { svgWordmark } from '../core/wordmark.js'
import { SEASON_DAYS, SEASON_NAMES, WEATHER } from '../game/crops.js'
import { item } from '../game/items.js'
import { MAX_ENERGY, MAX_WATER } from '../game/state.js'
import { coinIcon, iconFor } from './icons.js'

/**
 * The heads-up display.
 *
 * Plain DOM over the canvas, and deliberately so: the browser already has the
 * best text layout engine anyone is going to write, and a HUD drawn into WebGL
 * is a HUD that cannot be read by a screen reader, cannot be selected, and needs
 * its own font atlas — which this project has sworn off.
 *
 * Everything here is EVENT DRIVEN. The HUD subscribes to the game state and
 * redraws the one strip that changed; nothing polls. A farming game runs for
 * hours, and a HUD that rebuilds forty nodes a frame is the single most
 * expensive thing in a scene otherwise made of two hundred triangles.
 */

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

export class HUD {
  constructor(root, state, opts = {}) {
    this.state = state
    this.opts = opts
    this.node = el('div', 'hud')
    root.append(this.node)

    // --- top left: when it is ---------------------------------------------
    this.dateCard = el('div', 'card date')
    this.dateCard.append(
      (this.seasonEl = el('span', 'date-season', 'Thaw')),
      (this.dayEl = el('span', 'date-day', 'Day 1')),
      (this.weatherEl = el('span', 'date-weather', 'Clear')),
    )
    this.clockDial = el('div', 'clock')
    this.clockDial.append((this.clockHand = el('i', 'clock-hand')), (this.clockLabel = el('span', 'clock-label', '6:20')))
    this.dateCard.append(this.clockDial)

    // --- top right: what it costs and what is coming -----------------------
    this.purse = el('div', 'card purse')
    this.purse.append(el('img', 'icon-sm'), (this.coinEl = el('span', 'purse-n', '0')))
    this.purse.firstChild.src = coinIcon()

    this.fault = el('div', 'card fault')
    this.fault.append(
      el('span', 'fault-label', 'Fault'),
      (this.faultEl = el('strong', 'fault-n', '—')),
      (this.faultBar = el('div', 'fault-bar')),
    )
    this.faultBar.append((this.faultFill = el('i')))

    // --- left: how much is left in you ------------------------------------
    this.vitals = el('div', 'vitals')
    this.energyBar = this.meter('Energy', 'energy')
    this.waterBar = this.meter('Can', 'water')
    this.vitals.append(this.energyBar.node, this.waterBar.node)

    // --- bottom: the hotbar ------------------------------------------------
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

    // --- transient ---------------------------------------------------------
    this.prompt = el('div', 'prompt')
    this.toasts = el('div', 'toasts')
    this.banner = el('div', 'banner')
    this.dialogue = el('div', 'dialogue')
    this.dialogue.append(
      (this.dlgName = el('div', 'dlg-name')),
      (this.dlgRole = el('div', 'dlg-role')),
      (this.dlgLine = el('p', 'dlg-line')),
      el('div', 'dlg-hint', 'E — continue &nbsp;·&nbsp; Esc — leave'),
    )

    this.corner = el('div', 'corner', markSvg({ className: 'corner-mark' }))
    this.corner.append(el('span', 'corner-word', svgWordmark('SEISMIC VALLEY', { className: 'corner-type' })))

    this.node.append(this.dateCard, this.purse, this.fault, this.vitals, this.hotbar, this.prompt, this.toasts, this.banner, this.dialogue, this.corner)

    // --- wiring -------------------------------------------------------------
    state.on('bag', () => this.drawHotbar())
    state.on('hotbar', () => this.drawHotbar())
    state.on('coin', () => this.drawPurse())
    state.on('vitals', () => this.drawVitals())
    state.on('day', () => this.drawDate())
    state.on('toast', (t) => this.toast(t.text, t.tone))
    state.on('tremor', (t) => this.onTremor(t))

    this.drawAll()
  }

  meter(label, kind) {
    const node = el('div', `meter meter-${kind}`)
    const track = el('div', 'meter-track')
    const fillEl = el('i')
    track.append(fillEl)
    node.append(el('span', 'meter-label', label), track)
    return { node, fill: fillEl }
  }

  drawAll() {
    this.drawDate()
    this.drawPurse()
    this.drawVitals()
    this.drawHotbar()
    this.drawFault()
  }

  drawDate() {
    const s = this.state
    this.seasonEl.textContent = SEASON_NAMES[s.season]
    const dayOfSeason = ((s.day - 1) % SEASON_DAYS) + 1
    this.dayEl.textContent = `Day ${dayOfSeason} / ${SEASON_DAYS}`
    this.weatherEl.textContent = WEATHER[s.weather].label
    this.weatherEl.dataset.w = s.weather
  }

  drawPurse() {
    this.coinEl.textContent = this.state.coin.toLocaleString()
  }

  drawVitals() {
    const s = this.state
    this.energyBar.fill.style.width = `${(s.energy / MAX_ENERGY) * 100}%`
    this.energyBar.node.classList.toggle('is-low', s.energy < MAX_ENERGY * 0.25)
    this.waterBar.fill.style.width = `${(s.water / MAX_WATER) * 100}%`
    this.waterBar.node.classList.toggle('is-low', s.water < 6)
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

  drawFault() {
    const s = this.state
    const days = Math.max(0, s.nextTremor - s.day)
    const known = s.forecastDays ?? 1
    if (days > known) {
      this.faultEl.textContent = 'quiet'
      this.faultFill.style.width = '12%'
      this.fault.dataset.level = 'calm'
      return
    }
    this.faultEl.textContent = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days`
    this.faultFill.style.width = `${Math.max(8, 100 - days * 24)}%`
    this.fault.dataset.level = days === 0 ? 'now' : days <= 1 ? 'near' : 'soon'
  }

  /** The clock hand and the tint of the whole HUD follow the hour, so the panel
   *  reads as part of the same afternoon the valley is in. */
  setHour(hour) {
    const turn = ((hour % 24) / 24) * 360
    this.clockHand.style.transform = `rotate(${turn}deg)`
    const h = Math.floor(hour)
    const m = Math.floor((hour - h) * 60)
    this.clockLabel.textContent = `${h}:${String(m).padStart(2, '0')}`
    const night = hour < 6 || hour > 19.5
    this.node.classList.toggle('is-night', night)
  }

  /** The one-line hint under the reticle: what the key in your hand would do. */
  setPrompt(text) {
    if (this._prompt === text) return
    this._prompt = text
    this.prompt.innerHTML = text ?? ''
    this.prompt.classList.toggle('is-on', !!text)
  }

  toast(text, tone = 'plain') {
    const n = el('div', `toast toast-${tone}`, text)
    this.toasts.append(n)
    // Fade on a timer rather than on animationend: an animationend that never
    // fires (a backgrounded tab) leaves the message on screen forever.
    setTimeout(() => n.classList.add('is-out'), 3200)
    setTimeout(() => n.remove(), 3900)
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove()
  }

  say(who) {
    if (!who) {
      this.dialogue.classList.remove('is-on')
      return
    }
    this.dlgName.textContent = who.name
    this.dlgRole.textContent = who.role ?? ''
    this.dlgLine.textContent = who.line
    this.dialogue.classList.add('is-on')
  }

  onTremor(t) {
    if (t.phase === 'warn') {
      this.banner.innerHTML = '<strong>The fault is moving.</strong><span>Get behind a cairn.</span>'
      this.banner.classList.add('is-on')
      this.node.classList.add('is-shaking')
    } else if (t.phase === 'shock') {
      this.banner.innerHTML = t.lost
        ? `<strong>${t.lost} lost</strong><span>${t.saved ? `${t.saved} held by cairns` : 'nothing was behind a cairn'}</span>`
        : '<strong>The ground held</strong><span>nothing was standing where it went</span>'
    } else {
      this.banner.classList.remove('is-on')
      this.node.classList.remove('is-shaking')
      this.drawFault()
    }
  }

  /** Called every frame with cheap, always-changing values. Kept to exactly two
   *  writes so this can run at 144 Hz without touching layout. */
  tick(hour) {
    this.setHour(hour)
  }
}
