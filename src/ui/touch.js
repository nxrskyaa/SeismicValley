import { UI } from '../core/palette.js'

/**
 * Virtual joystick and action pads.
 *
 * **Every touch is hit-tested by hand against regions we draw ourselves, rather
 * than using buttons.** That is the whole reason this file exists: a browser
 * only delivers `click` from a completed tap, and a pad built out of `<button>`
 * elements stops responding the moment the other thumb is holding the stick —
 * which is exactly when you need it. Two thumbs at once is not a nice-to-have
 * on a farming game; it is the difference between walking while you work and
 * standing still while you work.
 *
 * The stick writes into the same `input.move` the keyboard writes into, and the
 * pads write into the same held/edge sets, so nothing downstream — the player
 * controller, the camera rig, the interaction code — knows any of this exists.
 *
 * An earlier pass split the screen in half: left half steers, right half acts.
 * It needed no drawing and no hit-testing, and it was unusable — there was no
 * indication of where anything was, a tap meant to act moved you, and the
 * hotbar sat under the acting half.
 */

const STICK_R = 62
const KNOB_R = 26
const DEAD = 0.16
const REPEAT = 0.34

/** The pads, in the order they are laid out from the bottom-right corner. */
const PADS = [
  { action: 'use', label: 'USE', r: 38, repeat: true, accent: true },
  { action: 'interact', label: 'E', r: 27, repeat: false },
  { action: 'jump', label: 'JUMP', r: 25, repeat: false },
  { action: 'rotR', label: 'TURN', r: 22, repeat: false },
  { action: 'journal', label: 'LOG', r: 20, repeat: false },
  { action: 'homestead', label: 'REST', r: 20, repeat: false },
]

export class TouchControls {
  constructor(input) {
    this.input = input
    this.enabled = false
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'touch'
    this.ctx = this.canvas.getContext('2d')
    document.body.append(this.canvas)

    this.stick = { home: [0, 0], at: [0, 0], id: -1, vec: [0, 0] }
    this.pads = PADS.map((p) => ({ ...p, cx: 0, cy: 0, down: false, timer: 0, id: -1 }))

    this._onResize = () => this.layout()
    addEventListener('resize', this._onResize)

    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      this.canvas.addEventListener(type, (e) => this.onPointer(e), { passive: false })
    }
    this.layout()
  }

  setEnabled(on) {
    this.enabled = on
    document.body.classList.toggle('is-touch', on)
    if (on) this.layout()
  }

  layout() {
    const dpr = Math.min(devicePixelRatio, 2)
    this.canvas.width = innerWidth * dpr
    this.canvas.height = innerHeight * dpr
    this.canvas.style.width = `${innerWidth}px`
    this.canvas.style.height = `${innerHeight}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Both clusters sit a thumb's reach in from the bottom corners. The stick's
    // home is where it RESTS; it re-homes to wherever the thumb lands, which is
    // what stops a mis-grab from being a mis-step.
    this.stick.home = [STICK_R + 26, innerHeight - STICK_R - 26]
    if (this.stick.id < 0) this.stick.at = [...this.stick.home]

    const bx = innerWidth - 66
    const by = innerHeight - 66
    const place = [
      [bx, by], [bx - 82, by + 6], [bx - 14, by - 78],
      [bx - 78, by - 66], [bx - 118, by - 6], [bx - 6, by - 128],
    ]
    this.pads.forEach((p, i) => {
      p.cx = place[i][0]
      p.cy = place[i][1]
    })
    this.draw()
  }

  onPointer(e) {
    if (!this.enabled) return
    const x = e.clientX
    const y = e.clientY

    if (e.type === 'pointerdown') {
      const pad = this.hitPad(x, y)
      if (pad) {
        e.preventDefault()
        pad.down = true
        pad.id = e.pointerId
        pad.timer = REPEAT
        this.input.held.add(pad.action)
        this.input.edges.add(pad.action)
        this.canvas.setPointerCapture(e.pointerId)
        this.draw()
        return
      }
      // Anything in the left half that is not a pad grabs the stick, and the
      // stick re-homes under the thumb.
      if (x < innerWidth * 0.55 && this.stick.id < 0) {
        e.preventDefault()
        this.stick.id = e.pointerId
        this.stick.home = [x, y]
        this.stick.at = [x, y]
        this.canvas.setPointerCapture(e.pointerId)
        this.draw()
      }
      return
    }

    if (e.type === 'pointermove') {
      if (e.pointerId === this.stick.id) {
        e.preventDefault()
        this.stick.at = [x, y]
        this.draw()
      }
      return
    }

    // up / cancel
    if (e.pointerId === this.stick.id) {
      this.stick.id = -1
      this.stick.vec = [0, 0]
      this.stick.at = [...this.stick.home]
    }
    for (const p of this.pads) {
      if (p.id === e.pointerId) {
        p.down = false
        p.id = -1
        this.input.held.delete(p.action)
      }
    }
    this.draw()
  }

  hitPad(x, y) {
    for (const p of this.pads) {
      // A generous 8px past the drawn edge. A pad that is exactly as big as it
      // looks is a pad you miss.
      if (Math.hypot(x - p.cx, y - p.cy) <= p.r + 8) return p
    }
    return null
  }

  /** Called once a frame, before anything reads the input. */
  update(dt) {
    if (!this.enabled) return
    if (this.stick.id >= 0) {
      const dx = this.stick.at[0] - this.stick.home[0]
      const dy = this.stick.at[1] - this.stick.home[1]
      const len = Math.hypot(dx, dy)
      const k = Math.min(1, len / STICK_R)
      if (k > DEAD) {
        this.stick.vec = [(dx / (len || 1)) * k, (dy / (len || 1)) * k]
      } else {
        this.stick.vec = [0, 0]
      }
    }
    // Held pads re-fire on a timer, so holding USE keeps hoeing — matching the
    // way holding the key does on a keyboard.
    for (const p of this.pads) {
      if (!p.down || !p.repeat) continue
      p.timer -= dt
      if (p.timer <= 0) {
        p.timer = REPEAT
        this.input.edges.add(p.action)
      }
    }
  }

  /** The stick's contribution to movement, in screen space. */
  get move() { return this.stick.vec }

  draw() {
    if (!this.enabled) return
    const ctx = this.ctx
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    ctx.lineWidth = 1.5

    // The stick: a ring where the thumb went down, and a knob where it is now.
    const [hx, hy] = this.stick.home
    const live = this.stick.id >= 0
    ctx.globalAlpha = live ? 0.85 : 0.4
    ctx.strokeStyle = UI.cream
    ctx.beginPath()
    ctx.arc(hx, hy, STICK_R, 0, Math.PI * 2)
    ctx.stroke()

    let kx = hx
    let ky = hy
    if (live) {
      const dx = this.stick.at[0] - hx
      const dy = this.stick.at[1] - hy
      const len = Math.hypot(dx, dy) || 1
      const clampLen = Math.min(len, STICK_R)
      kx = hx + (dx / len) * clampLen
      ky = hy + (dy / len) * clampLen
    }
    ctx.fillStyle = 'rgba(28, 20, 17, 0.72)'
    ctx.beginPath()
    ctx.arc(kx, ky, KNOB_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // The pads.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of this.pads) {
      ctx.globalAlpha = p.down ? 0.95 : 0.5
      ctx.fillStyle = p.down ? UI.stoneDeep : 'rgba(28, 20, 17, 0.72)'
      ctx.strokeStyle = p.accent ? UI.creamDeep : UI.cream
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = UI.cream
      ctx.font = `600 ${Math.round(p.r * 0.42)}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillText(p.label, p.cx, p.cy + 1)
    }
    ctx.globalAlpha = 1
  }

  dispose() {
    removeEventListener('resize', this._onResize)
    this.canvas.remove()
  }
}
