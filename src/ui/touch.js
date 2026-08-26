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
/** How far above the bottom edge both clusters sit, so neither lands on the
 *  hotbar. The hotbar is about sixty points tall at the smallest type scale. */
const HOTBAR_CLEARANCE = 96
const DEAD = 0.16
const REPEAT = 0.34

/** The pads, in the order they are laid out from the anchor. Exported so the
 *  checks can prove none of them overlap at a phone width. */
/** Offsets from the anchor, one per pad, in unscaled points. */
export const PAD_PLACE = [
  [0, 0], [-86, 4], [-8, -80], [-78, -66], [-150, -14], [-2, -148], [-150, -88],
]

/**
 * How much everything shrinks, given a viewport width.
 *
 * Exported and pure, so the checks can prove the cluster and the stick still fit
 * side by side on the narrowest phone worth supporting rather than taking the
 * word of whoever last looked at one.
 */
export const padScale = (w) => Math.max(0.7, Math.min(1.15, w / 430))

export const PADS = [
  { action: 'use', label: 'USE', r: 38, repeat: true, accent: true },
  { action: 'interact', label: 'E', r: 27, repeat: false },
  { action: 'jump', label: 'JUMP', r: 25, repeat: false },
  { action: 'rotR', label: 'TURN', r: 22, repeat: false },
  { action: 'journal', label: 'LOG', r: 20, repeat: false },
  { action: 'homestead', label: 'REST', r: 20, repeat: false },
  // Without this pad the build panel — stakes, cairns, sheds, the whole
  // registration mechanic the game is named around — had no way to open at all
  // on a device with no keyboard.
  { action: 'build', label: 'MAKE', r: 20, repeat: false },
]

export class TouchControls {
  constructor(input) {
    this.input = input
    this.enabled = false
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'touch'
    this.ctx = this.canvas.getContext('2d')
    document.body.append(this.canvas)

    // `home` is where the ring is CURRENTLY drawn and moves to the thumb; `rest`
    // is where it belongs when nobody is holding it. Without the second one the
    // ring stays wherever it was last grabbed — which in practice means a
    // permanent circle drawn over the middle of the screen, on top of the player.
    this.stick = { home: [0, 0], rest: [0, 0], at: [0, 0], id: -1, vec: [0, 0] }
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

    /**
     * Both clusters sit a thumb's reach in from the bottom corners, ABOVE the
     * hotbar, and everything scales with the screen.
     *
     * The first version placed the six pads at fixed pixel offsets measured on a
     * wide window. On a 412-point phone — which is the only kind of device that
     * ever sees these controls — they overlapped each other, the hotbar, the
     * audio toggles and the hint line, all at once. Offsets in a layout that
     * only exists on small screens must be relative to the small screen.
     */
    // The floor is what makes an iPhone SE work: at 320 points the cluster and
    // the stick together need to fit across the screen, and at 0.82 they did not.
    const s = padScale(innerWidth)
    const lift = HOTBAR_CLEARANCE * s

    this.stick.rest = [STICK_R * s + 24, innerHeight - STICK_R * s - lift]
    if (this.stick.id < 0) {
      this.stick.home = [...this.stick.rest]
      this.stick.at = [...this.stick.rest]
    }

    // Polar-ish placement around one anchor, so the whole cluster moves and
    // scales together and the gaps between pads are guaranteed by arithmetic
    // rather than by having looked at it once.
    const ax = innerWidth - 58 * s
    const ay = innerHeight - lift - 30 * s
    const place = PAD_PLACE
    this.pads.forEach((p, i) => {
      p.cx = ax + place[i][0] * s
      p.cy = ay + place[i][1] * s
      p.r = PADS[i].r * s
    })
    this.stickR = STICK_R * s
    this.knobR = KNOB_R * s
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
      this.stick.home = [...this.stick.rest]
      this.stick.at = [...this.stick.rest]
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
      const k = Math.min(1, len / (this.stickR ?? STICK_R))
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
    ctx.arc(hx, hy, this.stickR ?? STICK_R, 0, Math.PI * 2)
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
    ctx.arc(kx, ky, this.knobR ?? KNOB_R, 0, Math.PI * 2)
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
