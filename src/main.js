import * as THREE from 'three'
import './ui/ui.css'

import { audio } from './core/audio.js'
import { Input } from './core/input.js'
import { hashSeed } from './core/rng.js'
import { LEVEL, N, P } from './world/grid.js'
import { GATE, HOME, generate } from './world/worldgen.js'
import { Terrain } from './world/terrain.js'
import { Props } from './world/props.js'
import { CropView } from './world/cropView.js'
import { Water } from './world/water.js'
import { Sky } from './world/sky.js'
import { CameraRig } from './world/camera.js'
import { flagpole, placeStructure } from './world/buildings.js'
import { PlayerController, buildPlayer } from './actors/player.js'
import { Cast } from './actors/cast.js'
import { GameState } from './game/state.js'
import { PruningSystem } from './game/pruning.js'
import { SEASON_NAMES, stageFor } from './game/crops.js'
import { KIND, item } from './game/items.js'
import { HUD } from './ui/hud.js'
import { Panels } from './ui/panels.js'
import { showTitle } from './ui/title.js'
import { TouchControls } from './ui/touch.js'

/**
 * Bootstrap and the loop.
 *
 * The order things update in is the only interesting thing in this file, and it
 * is load-bearing:
 *
 *   input → player → interaction → cast → tremor → view rebuilds → sky → render
 *
 * Interaction runs AFTER the player has moved, so the tile in front of them is
 * the one they are looking at this frame rather than last. View rebuilds run
 * after the tremor, so a chunk the tremor just rewrote is remeshed in the same
 * frame it changed and never shows a hole. And the sky runs last before the
 * render, because it needs the camera's final position to place the shadow
 * frustum.
 */

const params = new URLSearchParams(location.search)
const app = {}
window.app = app

/**
 * Capture poses. `?shot=valley` freezes the clock, puts the camera somewhere
 * specific and raises `window.__shotReady` once the frame has settled.
 * tools/shoot drives these, so every image in the README is the real game
 * running its real systems.
 */
const POSES = {
  valley: { at: [N / 2, 0, N / 2], size: 62, hour: 9.5 },
  home: { at: [HOME.x, 0, HOME.z], size: 22, hour: 10 },
  gate: { at: [GATE.x, 1, GATE.z], size: 16, hour: 9 },
  rocky: { at: [GATE.x, 1.2, GATE.z], size: 5.2, hour: 9.5 },
  sheet: { at: [HOME.x, 1.0, HOME.z], size: 3.6, hour: 12 },
  rig: { at: [HOME.x, 1.0, HOME.z], size: 5, hour: 12 },
  dawn: { at: [HOME.x, 0, HOME.z], size: 26, hour: 6.2 },
  dusk: { at: [HOME.x, 0, HOME.z], size: 26, hour: 19.4 },
  night: { at: [HOME.x, 0, HOME.z], size: 26, hour: 22.5 },
  pruning: { at: [HOME.x, 0, HOME.z], size: 24, hour: 6.6, prune: true },
}

function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // The grade lives in the sky key-frames now, not here. Exposure stays at 1 so
  // that table means what it says.
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  return renderer
}

/** Everything the generator plants that is not terrain. Rebuilt wholesale
 *  whenever the player builds: a structure list is a dozen entries long, and
 *  rebuilding it is both simpler and cheaper than diffing it. */
function syncStructures() {
  const { scene, grid, state } = app
  if (app.structures) {
    scene.remove(app.structures)
    app.structures.traverse((o) => o.geometry?.dispose?.())
  }
  const group = new THREE.Group()
  group.name = 'structures'
  for (const b of state.buildings) group.add(placeStructure(b.kind, b.level ?? 1, grid, b.x, b.z))
  scene.add(group)
  app.structures = group
}

/** The fixed cast of buildings a new valley starts with. */
function seedStructures(state, grid) {
  // Everything the generator places is REGISTERED. It was standing when the
  // rollback ran, so the Loom has a record of it — which is the fiction, and is
  // also the only sane rule: a first pruning night that eats the shipping crate
  // takes away the economy before the player has learned what a stake is.
  const put = (kind, x, z, level = 1) => {
    const [cx, cz] = grid.nearestStandable(x, z)
    state.buildings.push({ kind, level, x: cx, z: cz, registered: true })
    grid.set('prop', cx, cz, P.BUILDING)
  }
  // The homestead and the crate are YOURS. The relay on the ridge is the Loom's
  // — it was standing before the rollback and is one of the few things the
  // checkpoint had a record of. There is no village: you are the only person in
  // the valley, and the setting stops working the moment there is a market
  // square in it.
  put('homestead', HOME.x, HOME.z - 5, 1)
  put('crate', HOME.x + 4, HOME.z + 1)
  put('gate', GATE.x, GATE.z)
}

function boot() {
  const seedText = params.get('seed') || 'seismic-valley'
  const seed = hashSeed(seedText)
  const { grid } = generate(seed)

  app.grid = grid
  app.seedText = seedText
  app.scene = new THREE.Scene()
  app.renderer = makeRenderer()
  document.getElementById('app').append(app.renderer.domElement)

  // Orthographic, and the rig owns the frustum — see world/camera.js for why
  // this is not a style choice.
  app.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 260)
  app.rig = new CameraRig(app.camera)
  app.rig.applyFrustum()

  app.terrain = new Terrain(grid)
  app.terrain.rebuildAll()
  app.props = new Props(grid)
  app.crops = new CropView(grid)
  app.water = new Water(grid)
  app.sky = new Sky(app.scene)
  app.scene.add(app.terrain.group, app.props.group, app.crops.group, app.water.mesh)

  app.state = new GameState(grid, seed)
  seedStructures(app.state, grid)
  syncStructures()

  // The flag on the ridge, from the first reference drawing. It is the one part
  // of the valley that is always moving, which is why it stands where the
  // player's eye lands on the horizon.
  app.flag = flagpole()
  const [fx, fz] = grid.nearestStandable(GATE.x + 5, GATE.z - 4)
  app.flag.group.position.set(fx + 0.5, grid.h(fx, fz) * LEVEL, fz + 0.5)
  app.scene.add(app.flag.group)

  app.player = buildPlayer('settler')
  app.scene.add(app.player.root)
  const [sx, sz] = grid.nearestStandable(HOME.x, HOME.z + 3)
  app.control = new PlayerController(grid, app.player, sx + 0.5, sz + 0.5)

  app.cast = new Cast(app.scene, grid, app.state, [sx + 0.5, sz + 0.5])
  app.props.rebuild()
  app.crops.rebuild(stageFor)

  app.input = new Input().attach(app.renderer.domElement)
  app.pruning = new PruningSystem(app.state, syncStructures, app.rig, audio)

  addEventListener('resize', () => {
    app.rig.applyFrustum()
    app.renderer.setSize(innerWidth, innerHeight)
  })

  const shot = POSES[params.get('shot')]
  if (shot) return runCapture(shot)
  return runGame()

}

// ---------------------------------------------------------------- capture --

function runCapture(shot) {
  const { grid } = app
  const focus = new THREE.Vector3(
    shot.at[0],
    shot.at[1] + grid.y(Math.round(shot.at[0]), Math.round(shot.at[2])),
    shot.at[2],
  )
  // Frame through the real rig at a fixed size, so a capture is the game's own
  // camera at a chosen zoom rather than a second camera that can drift from it.
  app.rig.size = app.rig.targetSize = shot.size
  app.rig.applyFrustum()
  app.rig.smoothed.copy(focus)
  app.rig._first = false

  const clock = new THREE.Clock()
  let frames = 0
  app.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    app.rig.update(dt, focus, null)
    app.terrain.update()
    app.props.update(dt)
    app.crops.update(dt, stageFor)
    // The cast reacts to where the PLAYER is, and in a capture the nearest
    // thing to a player is the camera. Passing the focus point instead makes
    // anyone standing on it turn to face their own feet.
    app.cast.update(dt, app.camera.position, shot.hour)
    app.sky.setSpan(app.rig.size * 0.95)
    const sky = app.sky.update(shot.hour, focus)
    app.sky.follow(app.camera)
    app.water.update(dt, sky)
    animateStructures(dt, sky)
    app.renderer.render(app.scene, app.camera)
    if (++frames > 20 && !app.grid.dirty.size) window.__shotReady = true
  })
}

// ------------------------------------------------------------------- game --

function runGame() {
  const root = document.getElementById('app')
  const { state, input, control } = app

  app.hud = new HUD(root, state, { onSelect: () => audio.ui() })
  app.panels = new Panels(root, state, {
    onOpen: () => { input.captured = true },
    onClose: () => { input.captured = false },
    onSleep: () => doSleep(),
    onBuilt: () => { audio.build(); syncStructures() },
    onBuy: () => audio.coin(),
    onShip: () => audio.pickup(),
  })
  state.on('build', () => syncStructures())

  // A coarse pointer is the only reliable signal. A narrow window on a desktop
  // is still a desktop and should not get a joystick drawn over it.
  app.touch = new TouchControls(input)
  app.touch.setEnabled(matchMedia('(pointer: coarse)').matches)

  // `?shot=play` is the one capture that goes through the real game rather than
  // through runCapture, because it is the only way to photograph the HUD.
  const playShot = params.get('shot') === 'play'
  let started = params.has('nomenu') || playShot
  if (!started) {
    showTitle(root, {
      seed: app.seedText,
      onStart: ({ load, seed }) => {
        audio.unlock()
        if (seed && seed !== app.seedText) {
          // A different seed is a different valley, and regenerating in place is
          // more code than reloading, for a case that happens once a session.
          location.search = `?seed=${encodeURIComponent(seed)}&nomenu=1`
          return
        }
        if (load) restore(load)
        started = true
        audio.chime()
      },
    })
  } else {
    audio.unlock()
  }
  addEventListener('pointerdown', () => audio.unlock(), { once: true })
  addEventListener('keydown', () => audio.unlock(), { once: true })

  const clock = new THREE.Clock()
  const focus = new THREE.Vector3()
  const idleTarget = new THREE.Vector3()
  let talking = null
  let playFrames = 0

  app.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.06)

    if (started) {
      app.touch.update(dt)
      input.stick = app.touch.move
      input.poll()
      // Time only moves while the game is being played. A player who opened the
      // journal and went to lunch should not come back to a lost season.
      if (!app.panels.isOpen && !app.pruning.active) {
        state.hour += dt * 0.28
        if (state.hour >= 26) doSleep(true)
      }
      control.update(dt, input, app.rig.inputYaw)
      talking = handleInteraction(talking)
      focus.copy(app.rig.update(dt, control.pos, app.panels.isOpen ? null : input))
    } else {
      // Title: a slow drift over the homestead, so the first thing anyone sees
      // is the valley and not a menu on a flat colour.
      // A slow turn over the homestead through the real rig, so the first thing
      // anyone sees is the game's own camera on the valley.
      app.rig.yawIndex = performance.now() * 0.00004
      idleTarget.set(HOME.x, app.grid.y(HOME.x, HOME.z), HOME.z)
      focus.copy(app.rig.update(dt, idleTarget, null))
    }

    app.cast.update(dt, control.pos, state.hour)
    app.pruning.update(dt)
    app.flag.update(dt)

    const rebuild = state.drainRebuilds()
    if (rebuild.props) app.props.dirty = true
    if (rebuild.crops) app.crops.dirty = true
    if (rebuild.structures) syncStructures()
    app.terrain.update()
    app.props.update(dt)
    app.crops.update(dt, stageFor)

    app.sky.setSpan(app.rig.size * 0.95)
    const sky = app.sky.update(state.hour, focus)
    app.sky.follow(app.camera)
    app.water.update(dt, sky)
    animateStructures(dt, sky)

    if (started) app.hud.tick(state.hour)
    app.renderer.render(app.scene, app.camera)
    input.endFrame()
    if (playShot && ++playFrames > 90 && !app.grid.dirty.size) window.__shotReady = true
  })

  if (!playShot) window.__shotReady = true
}

/** The kiln glows and the shards turn. Two loops over a handful of nodes. */
function animateStructures(dt, sky) {
  const night = 1 - sky.day
  for (const node of app.structures.children) {
    if (node.userData.shard) node.userData.shard.rotation.y += dt * 0.6
    if (node.userData.glow) {
      node.userData.glow.intensity = 1.6 + night * 3.4 + Math.sin(performance.now() * 0.004) * 0.4
    }
  }
}

// ---------------------------------------------------------- what keys do --

/** Returns whoever the player is now talking to, or null. */
function handleInteraction(talking) {
  const { state, input, control, grid, hud, panels, cast } = app

  // Panels first: while one is open every other key belongs to it.
  if (input.pressed('cancel')) {
    if (talking) {
      talking = null
      hud.say(null)
    } else if (panels.isOpen) panels.close()
  }
  if (input.pressed('journal')) panels.toggle('journal')
  if (input.pressed('homestead')) panels.toggle('homestead')
  if (input.pressed('build')) panels.toggle('build', { cell: control.target })
  if (input.pressed('save')) state.save()
  if (panels.isOpen) return talking

  const slot = input.slotPressed()
  if (slot >= 0) {
    state.select(slot)
    audio.ui()
  }

  const [tx, tz] = control.target
  const near = cast.nearest(control.pos)
  const held = state.held
  const heldItem = held ? item(held) : null

  // --- the prompt ----------------------------------------------------------
  let prompt = null
  const prop = grid.get('prop', tx, tz)
  const crop = grid.get('crop', tx, tz)
  const struct = structureAt(tx, tz)
  if (near) prompt = `<b>E</b> — speak to ${near.spec.name}`
  else if (struct?.userData.kind === 'crate') prompt = '<b>E</b> — the shipping crate'
  else if (struct?.userData.kind === 'homestead') prompt = '<b>E</b> — go inside'
  else if (struct?.userData.kind === 'well') prompt = '<b>E</b> — fill the can'
  else if (crop) prompt = '<b>E</b> — harvest'
  else if (prop === P.GEODE) prompt = '<b>F</b> — break the geode'
  else if (prop === P.TREE || prop === P.STUMP) prompt = '<b>F</b> — fell'
  else if (prop === P.ROCK) prompt = '<b>F</b> — break'
  else if (held === 'can' && grid.nearWater(tx, tz, 1)) prompt = '<b>E</b> — fill the can'
  else if (held === 'hoe' && grid.canTill(tx, tz)) prompt = '<b>F</b> — break ground'
  else if (heldItem?.kind === KIND.SEED && grid.get('tilled', tx, tz) && !crop) prompt = `<b>F</b> — sow ${item(held.replace('seed_', '')).name}`
  else if (held === 'can' && grid.get('tilled', tx, tz)) prompt = '<b>F</b> — water'
  else if (prop === P.NONE && !grid.isWater(tx, tz)) prompt = '<b>B</b> — raise a cairn here'
  hud.setHint(prompt)

  // --- E: interact ---------------------------------------------------------
  if (input.pressed('interact')) {
    if (near) {
      // Rocky's first line is always the forecast, because that is what the
      // relay is for; after that he cycles what he has to say.
      hud.say(near.line === 0
        ? { name: near.spec.name, role: near.spec.role, line: cast.forecast(app.pruning.nightsUntil()) }
        : near.speak())
      near.line++
      audio.golem(1)
      return near
    }
    if (talking) {
      talking = null
      hud.say(null)
    }
    if (struct?.userData.kind === 'crate') {
      panels.open('crate')
      return talking
    }
    if (struct?.userData.kind === 'homestead') {
      panels.open('homestead')
      return talking
    }
    if (struct?.userData.kind === 'well') {
      state.refill()
      audio.water()
      return talking
    }
    if (state.harvest(tx, tz)) {
      app.player.play('swing')
      audio.harvest()
      return talking
    }
    if (held === 'can' && grid.nearWater(tx, tz, 1)) {
      state.refill()
      audio.water()
      return talking
    }
  }

  // --- F: use the tool -----------------------------------------------------
  if (input.down('use') && app.player.anim.use <= 0.25) {
    const done = useHeld(tx, tz)
    if (done) app.player.play(done)
    else if (input.pressed('use')) audio.deny()
  }
  return talking
}

/** Resolve the held item against the tile in front. Returns the animation to
 *  play, or null if nothing was legal — which is what the deny sound reads. */
function useHeld(tx, tz) {
  const { state, grid } = app
  const held = state.held
  if (!held) return null
  const it = item(held)

  if (held === 'hoe') {
    const r = state.till(tx, tz)
    if (r) audio.till()
    return r
  }
  if (held === 'can') {
    if (grid.nearWater(tx, tz, 1) && state.water < 4) return state.refill()
    const r = state.waterTile(tx, tz)
    if (r) audio.water()
    return r
  }
  if (held === 'axe') {
    const r = state.chop(tx, tz)
    if (r) audio.chop()
    return r
  }
  if (held === 'pick') {
    const wasGeode = grid.get('prop', tx, tz) === P.GEODE
    const r = state.mine(tx, tz)
    if (r) audio[wasGeode ? 'chime' : 'mine']()
    return r
  }
  if (held === 'scythe') {
    const r = state.clear(tx, tz)
    if (r) audio.till()
    return r
  }
  if (it.kind === KIND.SEED) {
    const r = state.sow(tx, tz, held)
    if (r) audio.sow()
    return r
  }
  if (it.kind === KIND.SAPLING) {
    const r = state.plantSapling(tx, tz, held)
    if (r) audio.sow()
    return r
  }
  return null
}

/** Which placed structure covers a cell, if any. Footprints are small and the
 *  list is short, so a linear scan beats maintaining a second index. */
function structureAt(x, z) {
  if (!app.structures) return null
  for (const node of app.structures.children) {
    const [cx, cz] = node.userData.cell
    const [w, d] = node.userData.footprint
    if (Math.abs(x - cx) <= w / 2 && Math.abs(z - cz) <= d / 2) return node
  }
  return null
}

// ------------------------------------------------------------------ sleep --

function doSleep(collapsed = false) {
  const { state, hud } = app
  const result = state.sleep()
  app.props.dirty = true
  app.crops.dirty = true
  hud.drawAll()
  state.save()

  if (collapsed) hud.toast('You did not make it to bed. The morning is half gone.', 'warn')
  hud.toast(`Day ${state.day} — ${SEASON_NAMES[state.season]}. ${result.grew} plants grew.`)

  if (app.pruning.checkDay()) {
    // A pass happened in the night. It resolves a beat after you wake, so the
    // first thing you see is the valley and the second is what is missing.
    setTimeout(() => app.pruning.start(), 1800)
  }
  hud.drawPruning()
}

/** Put a save back. The grid bytes are authoritative; the structures and the
 *  cast are rebuilt from them. */
function restore(data) {
  if (!app.state.load(data)) {
    app.hud.toast('That save could not be read. Starting fresh.', 'warn')
    return
  }
  app.terrain.rebuildAll()
  app.props.rebuild()
  app.crops.rebuild(stageFor)
  app.water.refresh()
  syncStructures()
  app.cast.syncPebbles()
  const [sx, sz] = app.grid.nearestStandable(HOME.x, HOME.z + 3)
  app.control.teleport(sx + 0.5, sz + 0.5)
  app.hud.drawAll()
}

boot()
