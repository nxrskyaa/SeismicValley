/**
 * Input, as one readable state object.
 *
 * The rest of the game asks `input.move`, `input.down('use')` and
 * `input.pressed('interact')` and never touches an event. That separation is
 * what makes the touch controls a fifty-line addition rather than a rewrite:
 * the virtual stick writes into the same three fields the keyboard does.
 *
 * Edge-triggered actions are collected into a set that is cleared at the END of
 * each frame by `endFrame()`. Clearing on read instead means the first system to
 * ask consumes the press and every later system misses it — which shows up as
 * "the hotbar works but only when the build panel is closed".
 */

const KEY_ACTIONS = {
  KeyF: 'use', KeyE: 'interact', KeyQ: 'rotL', KeyR: 'rotR',
  Tab: 'homestead', KeyJ: 'journal', KeyB: 'build', KeyM: 'map',
  Escape: 'cancel', Space: 'jump', F5: 'save', Enter: 'confirm',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4',
  Digit5: 'slot5', Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8',
}

export class Input {
  constructor(target = window) {
    this.keys = new Set()
    this.held = new Set()
    this.edges = new Set()
    this.move = { x: 0, z: 0 }
    this.run = false
    this.zoom = 0
    this.pointer = { x: 0, y: 0, down: false }
    /** Set by the UI while a panel has focus, so WASD in a text field or a
     *  click on a button never also drives the player. */
    this.captured = false
    this.touch = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }

    const onKey = (e, down) => {
      if (e.code === 'Tab') e.preventDefault()
      if (e.repeat) return
      if (down) {
        this.keys.add(e.code)
        const a = KEY_ACTIONS[e.code]
        if (a && !this.captured) {
          this.held.add(a)
          this.edges.add(a)
        }
      } else {
        this.keys.delete(e.code)
        const a = KEY_ACTIONS[e.code]
        if (a) this.held.delete(a)
      }
    }
    this._onDown = (e) => onKey(e, true)
    this._onUp = (e) => onKey(e, false)
    target.addEventListener('keydown', this._onDown)
    target.addEventListener('keyup', this._onUp)
    // A window that loses focus mid-stride otherwise leaves the player walking
    // into a wall forever.
    this._onBlur = () => {
      this.keys.clear()
      this.held.clear()
      this.touch.active = false
    }
    target.addEventListener('blur', this._onBlur)

    this._onWheel = (e) => {
      if (this.captured) return
      this.zoom += Math.sign(e.deltaY)
    }
    target.addEventListener('wheel', this._onWheel, { passive: true })
  }

  /** Attach the pointer and touch handlers to the canvas rather than the window,
   *  so a drag that starts on a HUD panel never reaches the world. */
  attach(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      this.pointer.down = true
      this.pointer.x = e.clientX
      this.pointer.y = e.clientY
      if (e.pointerType === 'touch') {
        // Left half of the screen drives; right half acts. One thumb each, and
        // the split is by SCREEN half rather than by a drawn control, so it
        // works on any aspect without a layout pass.
        if (e.clientX < innerWidth * 0.5) {
          this.touch.active = true
          this.touch.id = e.pointerId
          this.touch.ox = this.touch.x = e.clientX
          this.touch.oy = this.touch.y = e.clientY
        } else {
          this.held.add('use')
          this.edges.add('use')
        }
      } else if (e.button === 0) {
        this.held.add('use')
        this.edges.add('use')
      } else if (e.button === 2) {
        this.held.add('interact')
        this.edges.add('interact')
      }
      canvas.setPointerCapture?.(e.pointerId)
    })
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX
      this.pointer.y = e.clientY
      if (this.touch.active && e.pointerId === this.touch.id) {
        this.touch.x = e.clientX
        this.touch.y = e.clientY
      }
    })
    const release = (e) => {
      this.pointer.down = false
      this.held.delete('use')
      this.held.delete('interact')
      if (this.touch.active && e.pointerId === this.touch.id) this.touch.active = false
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    return this
  }

  /** Rebuild `move` from whatever is currently held. Call once per frame,
   *  before anything reads it. */
  poll() {
    if (this.captured) {
      this.move.x = this.move.z = 0
      this.run = false
      return this
    }
    let x = 0, z = 0
    const k = this.keys
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1

    if (this.touch.active) {
      const dx = this.touch.x - this.touch.ox
      const dy = this.touch.y - this.touch.oy
      const len = Math.hypot(dx, dy)
      // A 12px dead zone: without it a stationary thumb jitters the player.
      if (len > 12) {
        const k2 = Math.min(1, (len - 12) / 60) / len
        x += dx * k2
        z += dy * k2
      }
    }

    const len = Math.hypot(x, z)
    if (len > 1) {
      x /= len
      z /= len
    }
    this.move.x = x
    this.move.z = z
    this.run = k.has('ShiftLeft') || k.has('ShiftRight')
    return this
  }

  down(action) { return this.held.has(action) }
  pressed(action) { return this.edges.has(action) }
  /** Which hotbar slot was pressed this frame, or -1. */
  slotPressed() {
    for (let i = 1; i <= 8; i++) if (this.edges.has(`slot${i}`)) return i - 1
    return -1
  }

  endFrame() {
    this.edges.clear()
    this.zoom = 0
  }
}
