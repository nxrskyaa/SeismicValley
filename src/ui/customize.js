import * as THREE from 'three'
import { buildPlayer } from '../actors/player.js'
import { PITCH } from '../world/camera.js'
import { skyAt } from '../core/palette.js'
import {
  BELT, CAP, HAIR, HEADGEAR, PACK, SHIRT, SHAPE_KEYS, SKIN, TROUSER,
  DEFAULT_APPEARANCE, lookFrom, randomAppearance,
} from '../game/appearance.js'

/**
 * The dressing room, which is part of the title card.
 *
 * A swatch grid on its own is a form. What makes this worth building is that
 * the figure next to it is the REAL rig, lit by the REAL sky curve, under the
 * real orthographic camera at the real pitch — so what you pick is exactly what
 * you get, and picking is watching a small person turn around rather than
 * reading hex codes.
 *
 * It runs on its own tiny renderer. That is a second WebGL context for the
 * length of the title screen, which is not free, so it is disposed the moment
 * the game starts.
 */

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

/** The swatch a row shows for one entry — one chip per colour the entry sets,
 *  so a shirt reads as a shirt and a sleeve rather than as an average. */
function chipsFor(entry) {
  const keys = Object.keys(entry).filter((k) => k !== 'id' && k !== 'label')
  // A shape entry carries no colours, so an empty swatch is all it would draw.
  // Those rows name themselves instead.
  if (!keys.length) return `<b class="swatch-word">${entry.label}</b>`
  return keys.map((k) => `<i style="background:${entry[k]}"></i>`).join('')
}

export function buildCustomizer(appearance = { ...DEFAULT_APPEARANCE }) {
  const state = { ...appearance }
  const node = el('div', 'dress')

  // --- the figure ----------------------------------------------------------
  const stage = el('div', 'dress-stage')
  const canvas = document.createElement('canvas')
  stage.append(canvas)
  node.append(stage)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(260, 300, false)
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  // Same pitch as the game, framed close. A preview from a different angle to
  // the one you play at is a preview of a different character.
  const cam = new THREE.OrthographicCamera(-1.06, 1.06, 1.72, -0.52, -20, 40)
  cam.position.set(0, 3, 6)
  cam.rotation.order = 'YXZ'
  cam.rotation.x = PITCH * 0.62
  cam.lookAt(0, 0.82, 0)

  const s = skyAt(11)
  const key = new THREE.DirectionalLight(s.sun, s.keyEnergy * Math.PI)
  key.position.set(-3, 6, 4)
  const hemi = new THREE.HemisphereLight(s.ambient, '#8e5e4c', s.ambientEnergy * Math.PI)
  scene.add(key, hemi)

  const turntable = new THREE.Group()
  scene.add(turntable)
  let rig = buildPlayer(lookFrom(state))
  turntable.add(rig.root)

  // A low plate under the boots. Without it the figure floats, and a floating
  // figure reads as an icon rather than as somebody standing in a valley.
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.09, 20),
    new THREE.MeshLambertMaterial({ color: new THREE.Color().setStyle('#6d7240', THREE.SRGBColorSpace), flatShading: true }),
  )
  plate.position.y = -0.045
  turntable.add(plate)

  /** Repaint in place. Rebuilding the rig on every click drops a whole figure
   *  of geometry on the floor four times a second. */
  function repaint() {
    const look = lookFrom(state)
    for (const [k, hex] of Object.entries(look)) {
      // Shape choices come through the same object and are ids, not hexes.
      if (typeof hex === 'string' && hex.startsWith('#')) rig.materials[k]?.color.setStyle(hex, THREE.SRGBColorSpace)
    }
  }

  /**
   * A shape change needs the figure built again — a hood is not a repainted cap.
   *
   * Rebuilding on every click would drop a whole figure of geometry on the floor
   * four times a second, which is why the colour path repaints in place. This
   * runs only when a `SHAPE_KEYS` row is clicked, so it is a handful of rebuilds
   * in a session, and the old rig is disposed rather than leaked.
   */
  function reshape() {
    turntable.remove(rig.root)
    rig.root.traverse((o) => { o.geometry?.dispose?.() })
    rig = buildPlayer(lookFrom(state))
    turntable.add(rig.root)
  }

  let raf = 0
  let t = 0
  let last = performance.now()
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    t += dt
    // A slow turn with a pause at the front, so the face is on screen most of
    // the time and the back still gets shown.
    turntable.rotation.y = Math.sin(t * 0.42) * 2.3
    rig.anim.speed = 0
    rig.update(dt)
    renderer.render(scene, cam)
  }
  loop()

  // --- the choices ---------------------------------------------------------
  const form = el('div', 'dress-form')
  node.append(form)

  const nameRow = el('label', 'dress-name')
  nameRow.append(el('span', null, 'Name'))
  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.maxLength = 18
  nameInput.spellcheck = false
  nameInput.value = state.name
  nameInput.addEventListener('input', () => { state.name = nameInput.value })
  nameRow.append(nameInput)
  form.append(nameRow)

  const rows = []
  const row = (key, label, table) => {
    const wrap = el('div', 'dress-row')
    wrap.append(el('span', 'dress-label', label))
    const strip = el('div', 'dress-strip')
    const buttons = table.map((entry) => {
      const b = el('button', 'swatch', chipsFor(entry))
      b.type = 'button'
      b.title = entry.label
      b.setAttribute('aria-label', `${label}: ${entry.label}`)
      b.addEventListener('click', () => {
        state[key] = entry.id
        sync()
        if (SHAPE_KEYS.has(key)) reshape()
        else repaint()
      })
      strip.append(b)
      return { entry, b }
    })
    wrap.append(strip)
    form.append(wrap)
    rows.push({ key, buttons })
  }

  row('skin', 'Skin', SKIN)
  row('headgear', 'Head', HEADGEAR)
  row('hair', 'Hair', HAIR)
  row('cap', 'Cap', CAP)
  row('shirt', 'Shirt', SHIRT)
  row('trouser', 'Trousers', TROUSER)
  row('belt', 'Strap', BELT)
  row('pack', 'Pack', PACK)

  function sync() {
    for (const r of rows) {
      for (const { entry, b } of r.buttons) b.classList.toggle('is-on', state[r.key] === entry.id)
    }
  }
  sync()

  const dice = el('button', 'btn btn-sm dress-dice', 'Surprise me')
  dice.type = 'button'
  dice.addEventListener('click', () => {
    Object.assign(state, randomAppearance(state.name))
    sync()
    repaint()
  })
  form.append(dice)

  return {
    node,
    get value() { return { ...state, name: state.name.trim() || DEFAULT_APPEARANCE.name } },
    dispose() {
      cancelAnimationFrame(raf)
      renderer.dispose()
      renderer.forceContextLoss()
      scene.traverse((o) => {
        o.geometry?.dispose()
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose())
        else o.material?.dispose()
      })
    },
  }
}
