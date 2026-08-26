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

/**
 * The actions a captured input still delivers.
 *
 * `captured` is set while a panel is up, and it drops every action so that
 * walking, swinging and the hotbar all belong to the panel. That is right for
 * all of them except the keys that OPEN and CLOSE panels — which is how the
 * homestead card ended up advertising "ESC — CLOSE" while Escape did nothing at
 * all, and Tab, a toggle, could only ever toggle one way. The only way out was
 * clicking the scrim, which nothing tells you about.
 *
 * A driven playtest found it: thirty seconds of scripted keys, and the panel was
 * still on screen at the end.
 */
const ALWAYS = new Set(['cancel', 'homestead', 'journal', 'build', 'pebbles', 'save'])

const KEY_ACTIONS = {
  KeyF: 'use', KeyE: 'interact', KeyQ: 'rotL', KeyR: 'rotR',
  Tab: 'homestead', KeyJ: 'journal', KeyB: 'build', KeyP: 'pebbles',
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
    /** Set each frame by TouchControls, in screen space. Merged into `move`
     *  below so nothing downstream has to know where a direction came from. */
    this.stick = [0, 0]

    const onKey = (e, down) => {
      if (e.code === 'Tab') e.preventDefault()
      if (e.repeat) return
      if (down) {
        this.keys.add(e.code)
        const a = KEY_ACTIONS[e.code]
        if (a && (!this.captured || ALWAYS.has(a))) {
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
      this.stick = [0, 0]
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
      // Touch does NOT reach here: the touch canvas sits above the world and
      // routes to TouchControls, which writes into the same sets. See ui/touch.js.
      if (e.pointerType === 'touch') return
      if (e.button === 0) {
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
    })
    const release = () => {
      this.pointer.down = false
      this.held.delete('use')
      this.held.delete('interact')
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

    x += this.stick[0]
    z += this.stick[1]

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
