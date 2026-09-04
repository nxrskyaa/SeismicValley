import * as THREE from 'three'
import './ui/ui.css'

import { audio } from './core/audio.js'
import { Music } from './core/music.js'
import { Ambience } from './core/ambience.js'
import { Input } from './core/input.js'
import { hashSeed } from './core/rng.js'
import { LEVEL, N, P } from './world/grid.js'
import { GATE, HOME, generate } from './world/worldgen.js'
import { computeShade } from './world/occlusion.js'
import { Terrain } from './world/terrain.js'
import { Props } from './world/props.js'
import { CropView } from './world/cropView.js'
import { Water } from './world/water.js'
import { Water_Life } from './world/fish.js'
import { Weather } from './world/weather.js'
import { Sky } from './world/sky.js'
import { CameraRig } from './world/camera.js'
import { RESTORE, costText } from './game/colony.js'
import { flagpole, placeStructure } from './world/buildings.js'
import { buildSettlement } from './world/settlement.js'
import { PlayerController, buildPlayer } from './actors/player.js'
import { Cast } from './actors/cast.js'
import { GameState } from './game/state.js'
import { PruningSystem } from './game/pruning.js'
import { Fishing } from './game/fishing.js'
import { SEASON_NAMES, stageFor } from './game/crops.js'
import { KIND, item } from './game/items.js'
import { G as GROUND_IDS, UI } from './core/palette.js'
import { HUD } from './ui/hud.js'
import { Panels } from './ui/panels.js'
import { showTitle } from './ui/title.js'
import { prologueSeen, showPrologue } from './ui/prologue.js'
import { CLOSING, Tutorial } from './game/tutorial.js'
import { loadAppearance, lookFrom } from './game/appearance.js'
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

/**
 * How fast the clock runs.
 *
 * Velion's numbers: ten in-game minutes per tick, 6.5 real seconds per tick —
 * so a twenty-hour day (06:00 to 02:00) takes about thirteen real minutes.
 */
const HOURS_PER_SECOND = 10 / 60 / 6.5

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
  rocky: { at: [GATE.x + 0.5, 1.0, GATE.z + 0.5], size: 3.6, hour: 11 },
  sheet: { at: [HOME.x, 1.0, HOME.z], size: 3.6, hour: 12 },
  rig: { at: [HOME.x, 1.0, HOME.z], size: 5, hour: 12 },
  pebble: { at: [HOME.x + 2, -0.86, HOME.z + 2], size: 1.4, hour: 12, pebble: true },
  house: { at: [HOME.x, 1.4, HOME.z - 5], size: 9.5, hour: 11 },
  street: { at: [HOME.x + 2, 1.5, HOME.z - 14], size: 26, hour: 11 },
  relay: { at: [HOME.x + 22, 2.6, HOME.z - 14], size: 9, hour: 11 },
  waymark: { at: [Math.round(HOME.x + (GATE.x - HOME.x) * 0.4), 1.2, Math.round(HOME.z + (GATE.z - HOME.z) * 0.4)], size: 7, hour: 11 },
  field: { at: [HOME.x, 0.4, HOME.z + 1], size: 8, hour: 11, field: true },
  pond: { at: [HOME.x + 13, -1.1, HOME.z + 2], size: 20, hour: 11 },
  angler: { at: [HOME.x + 13, 0.4, HOME.z + 2], size: 4.2, hour: 11, angler: true },
  lake: { at: [N * 0.76, -1.1, N * 0.84], size: 26, hour: 12.5 },
  dawn: { at: [HOME.x, 0, HOME.z], size: 26, hour: 6.2 },
  dusk: { at: [HOME.x, 0, HOME.z], size: 26, hour: 19.4 },
  night: { at: [HOME.x, 0, HOME.z], size: 26, hour: 22.5 },
  pruning: { at: [HOME.x, 0, HOME.z], size: 24, hour: 6.6, prune: true },
}

function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  // NO shadow map. The reference has no cast shadows at all — not soft ones,
  // none: the whole look is flat per-face shading under a bright violet fill,
  // and a directional shadow immediately reads as a different, heavier game.
  // It also buys back the entire shadow pass on a mobile GPU.
  renderer.shadowMap.enabled = false
  // NO tone mapping. ACES is built for photographic HDR: it rolls the highlights
  // off and pulls the mid-tones down, which is precisely the range this world
  // lives in. Under it the pastel palette came out as dusty stone. The grade
  // lives in the sky key-frames; the renderer's job is to not argue with it.
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  return renderer
}

/**
 * Recompute the ground's soft shadow and remesh.
 *
 * Called when something starts or stops standing on the valley floor — a tree
 * felled, a ruin put back. The shadow reaches two cells past whatever casts it
 * and the blur carries it further, so the change is never confined to the cell
 * that moved; a full remesh of thirty-six chunks is both simpler and safer than
 * working out which ones the falloff touched, and this runs on a player action,
 * never per frame.
 */
function reshade() {
  const { grid, state, terrain } = app
  if (!grid || !terrain) return
  grid.shade = computeShade(grid, state?.buildings ?? [])
  terrain.rebuildAll()
}

/**
 * WHERE THE OPENING LOOKS.
 *
 * The prologue names a shot; this is the only place that knows where anything
 * in the valley actually is, so the mapping lives here rather than in the UI.
 * Setting `app.cinematic` takes the camera off the player for the duration —
 * see the loop, which feeds the rig this target and withholds the player's
 * input while it is set.
 */
function cinematicShot(name) {
  if (!name) { app.cinematic = null; return }
  const { grid } = app
  const at = (x, z, size, yawIndex) => {
    const [cx, cz] = grid.nearestStandable(Math.round(x), Math.round(z), 20)
    return { pos: new THREE.Vector3(cx + 0.5, grid.y(cx, cz), cz + 0.5), size, yawIndex }
  }
  const spots = {
    // Tight on the homestead door, which is where she is standing.
    door: () => at(HOME.x, HOME.z - 2, 9, 0),
    home: () => at(HOME.x + 2, HOME.z + 3, 15, 1),
    // Down the length of the ruined street, wide enough to see it is a row.
    street: () => at(HOME.x - 2, (app.state?.streetZ ?? HOME.z - 16), 22, 0),
    relay: () => at(HOME.x + 30, (app.state?.streetZ ?? HOME.z - 16), 17, 3),
    water: () => at(HOME.x - 6, HOME.z + 14, 20, 2),
  }
  app.cinematic = (spots[name] ?? spots.home)()
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
  for (const b of state.buildings) {
    const node = placeStructure(b.kind, b.level ?? 1, grid, b.x, b.z, b.derelict)
    // The record itself, so the prompt can ask whether this thing is a ruin
    // without searching `state.buildings` by coordinate every frame.
    node.userData.building = b
    group.add(node)
  }
  scene.add(group)
  app.structures = group
}

/** The fixed cast of buildings a new valley starts with. */
/**
 * Everything the generator places is REGISTERED — it was standing when the
 * rollback ran, so the Loom has a record of it. That is the fiction, and it is
 * also the only sane rule: a first pruning night that eats the shipping crate
 * takes the economy away before the player has learned what a stake is.
 *
 * The layout itself lives in `world/settlement.js` so it can be tested without a
 * renderer. It used to be a loop of hand-picked coordinates here, and the houses
 * went through each other.
 */
function seedStructures(state, grid) {
  buildSettlement(state, grid)
}

function boot() {
  // The capture harness reads this to drive the real game and to assert on its
  // state afterwards. Nothing in the game itself touches it.
  window.__app = app
  // Frames rendered, so a harness can wait for the world to be up rather than
  // for a guessed number of milliseconds.
  window.__shotFrames = 0

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
  app.life = new Water_Life(grid)
  app.weather = new Weather(grid)
  app.sky = new Sky(app.scene)
  app.scene.add(app.terrain.group, app.props.group, app.crops.group, app.water.mesh, app.life.group, app.weather.group)

  app.state = new GameState(grid, seed)
  seedStructures(app.state, grid)
  // The settlement has to exist before the ground can be shaded by it, and the
  // first mesh happened before either — so the world is reshaded once here
  // rather than being shown a frame with no shadow under anything.
  reshade()
  syncStructures()

  // The flag on the ridge, from the first reference drawing. It is the one part
  // of the valley that is always moving, which is why it stands where the
  // player's eye lands on the horizon.
  app.flag = flagpole()
  const [fx, fz] = grid.nearestStandable(GATE.x + 5, GATE.z - 4)
  app.flag.group.position.set(fx + 0.5, grid.h(fx, fz) * LEVEL, fz + 0.5)
  app.scene.add(app.flag.group)

  // Who you are is chosen on the title card and kept OUT of the save file, so
  // it survives starting a new valley. The rig is one silhouette repainted, not
  // a wardrobe — see game/appearance.js for why that is deliberate.
  app.appearance = loadAppearance()
  app.player = buildPlayer(lookFrom(app.appearance))
  app.scene.add(app.player.root)
  const [sx, sz] = grid.nearestStandable(HOME.x, HOME.z + 3)
  app.control = new PlayerController(grid, app.player, sx + 0.5, sz + 0.5)

  // Fishing owns a rod that lives in the player's hand, so it is built after
  // the rig and before anything asks it for a hint.
  app.fishing = new Fishing(app.state, grid, app.player, app.life, audio)
  app.scene.add(app.fishing.group)

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
  // Some poses need something in front of the camera that the player would
  // normally have to earn.
  if (shot.pebble) app.state.hatchPebble(Math.round(shot.at[0]), Math.round(shot.at[2]))
  if (shot.angler) {
    /**
     * The player at the water with a line out, close enough to see the tackle.
     *
     * There was no capture of the rod at all — every fishing test was headless
     * state-machine work, which proves the loop runs and says nothing whatever
     * about which way the rod is pointing.
     */
    const bank = (() => {
      for (let r = 1; r < 14; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = Math.round(shot.at[0]) + dx
            const z = Math.round(shot.at[2]) + dz
            if (grid.isWater(x, z) || !grid.canStand(x, z, grid.h(x, z))) continue
            for (const [ox, oz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
              if (grid.isWater(x + ox * 2, z + oz * 2)) return [x, z, Math.atan2(ox, oz)]
            }
          }
        }
      }
      return null
    })()
    if (bank) {
      const [bx, bz, face] = bank
      app.control.teleport(bx + 0.5, bz + 0.5)
      app.control.facing = face
      // The capture path never runs the controller, so the rig has to be placed
      // by hand — otherwise the body stays at the origin and the rod, which is
      // parented to its hand, casts a line in from off the edge of the world.
      app.player.root.position.copy(app.control.pos)
      app.player.root.rotation.y = face
      app.state.hotbar[app.state.slot] = 'rod'
      app.player.anim.rod = true
      app.fishing.press(app.control.pos, face, shot.hour)
      shot.at[0] = bx + 0.5
      shot.at[2] = bz + 0.5
      // Frame the BODY, not the cell. `grid.y` rounds, and half a cell away
      // from a bank is the water — so the default focus sat four levels down
      // the pond and pushed the angler off the top of the frame.
      app.captureY = app.control.pos.y + shot.at[1]
    }
  }
  if (shot.field) {
    /**
     * A worked field, at every stage at once.
     *
     * The farming is the game and there was no capture of it — every pose was of
     * scenery. Rows are sown with different crops and grown to different stages
     * so one frame shows seedling, half-grown and ripe side by side, which is
     * the only way to see whether the stages actually read apart.
     */
    const cx = Math.round(shot.at[0])
    const cz = Math.round(shot.at[2])
    const seeds = ['seed_grubwort', 'seed_palewheat', 'seed_grubwort', 'seed_palewheat']
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) {
        const x = cx - 3 + col
        const z = cz - 2 + row
        if (!app.grid.canTill(x, z)) continue
        app.state.give(seeds[row], 1)
        app.state.till(x, z)
        app.state.sow(x, z, seeds[row])
        app.state.waterTile(x, z)
        app.state.water = 4
        // Stage climbs across the row, so one frame carries the whole cycle.
        app.grid.set('grown', x, z, Math.min(6, Math.floor(col * 1.1)))
      }
    }
    app.crops.dirty = true
    app.props.dirty = true
    app.terrain.rebuildAll()
  }
  const focus = new THREE.Vector3(
    shot.at[0],
    app.captureY ?? (shot.at[1] + grid.y(Math.round(shot.at[0]), Math.round(shot.at[2]))),
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
    app.cast.update(dt, shot.pebble ? focus : app.camera.position, shot.hour)
    if (shot.angler) {
      app.player.anim.rod = true
      app.player.update(dt)
      app.fishing.update(dt, app.control.pos, app.control.facing, shot.hour)
    }
    // A capture of a character should be of the character, not of whatever beat
    // of an idle cycle the frame happened to land on.
    app.cast.rocky.rig.anim.pose = 'idle'
    app.cast.rocky.facing = Math.PI * 0.15
    if (shot.pebble && app.cast.pebbles[0]) {
      // Pin it. A pebble with a job walks off to do it within a second.
      const p0 = app.cast.pebbles[0]
      p0.pinned = true
      p0.pos.set(focus.x, focus.z)
      p0.goal.copy(p0.pos)
      p0.facing = Math.PI * 0.25
    }
    app.sky.setSpan(app.rig.size * 0.95)
    const sky = app.sky.update(shot.hour, focus)
    app.sky.follow(app.camera)
    app.water.update(dt, sky)
    app.life.update(dt, sky)
    app.weather.update(dt, focus, SEASON_NAMES[0], sky)
    animateStructures(dt, sky)
    app.renderer.render(app.scene, app.camera)
    window.__shotFrames++
    if (++frames > 20 && !app.grid.dirty.size) window.__shotReady = true
  })
}

// ------------------------------------------------------------------- game --

function runGame() {
  const root = document.getElementById('app')
  const { state, input, control, grid } = app

  // Audio preferences live outside the save: they are about the room the player
  // is in, not about the valley.
  const PREF = 'seismic-valley.audio'
  const prefs = (() => {
    try { return { sound: true, music: true, ...JSON.parse(localStorage.getItem(PREF) ?? '{}') } } catch { return { sound: true, music: true } }
  })()
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)) } catch { /* private mode */ } }

  app.music = new Music(audio)
  app.ambience = new Ambience(audio)
  audio.setMuted(!prefs.sound)

  app.hud = new HUD(root, state, {
    onSelect: () => audio.ui(),
    /**
     * Point at the nearest square that wants the verb.
     *
     * Not "do the verb": the player still walks there and still swings, because
     * that is the game. What the interface owes them is WHERE, which they were
     * otherwise scanning a ninety-six-cell valley for.
     */
    onFind: (kind) => {
      audio.ui()
      const near = state.nearestField(kind, Math.round(control.pos.x), Math.round(control.pos.z))
      if (!near) {
        state.say(kind === 'ripe' ? 'Nothing is ready yet.' : 'No bed is empty. Break ground with the hoe.', 'warn')
        return
      }
      pingCell(near[0], near[1])
    },
    onSkipTutorial: () => app.tutorial?.skip(),
    sound: prefs.sound,
    music: prefs.music,
    onSound: (on) => { prefs.sound = on; audio.setMuted(!on); savePrefs(); if (on) audio.ui() },
    onMusic: (on) => { prefs.music = on; savePrefs(); on ? app.music.start() : app.music.stop() },
  })
  app.audioPrefs = prefs
  // The first morning. It reads state.stats, so a loaded save that is already
  // past a step starts past it.
  app.tutorial = new Tutorial(state, {
    onStep: (step) => {
      if (step) {
        app.hud.setTask(step, app.tutorial.index + 1, app.tutorial.total)
        audio.ui()
      } else {
        app.hud.setTask({ ...CLOSING, closing: true })
        audio.chime()
      }
    },
    onDone: () => app.hud.setTask(null),
  })

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
  // `is-touch` is set by the line above and every hint is rewritten off it, so
  // the tutorial card has to be drawn AFTER it rather than before.
  app.hud.setTask(null)

  // `?shot=play` is the one capture that goes through the real game rather than
  // through runCapture, because it is the only way to photograph the HUD.
  const playShot = params.get('shot') === 'play'
  let started = params.has('nomenu') || playShot
  const showTask = () => {
    const t = app.tutorial
    if (t.step) app.hud.setTask(t.step, t.index + 1, t.total)
  }
  if (!started) {
    showTitle(root, {
      seed: app.seedText,
      onStart: ({ load, seed, appearance }) => {
        audio.unlock()
        if (app.audioPrefs.music) app.music.start()
        if (appearance) {
          app.appearance = appearance
          const look = lookFrom(appearance)
          for (const [k, hex] of Object.entries(look)) {
            app.player.materials[k]?.color.setStyle(hex, THREE.SRGBColorSpace)
          }
        }
        if (seed && seed !== app.seedText) {
          // A different seed is a different valley, and regenerating in place is
          // more code than reloading, for a case that happens once a session.
          location.search = `?seed=${encodeURIComponent(seed)}&nomenu=1`
          return
        }
        if (load) restore(load)

        /**
         * The cold open, on a fresh valley only.
         *
         * The world is already meshed and the camera is already drifting behind
         * the text — that is why there is no loading screen anywhere in this
         * game. `started` stays false through it so the player cannot walk off
         * during their own prologue, and it is never shown when a save is being
         * loaded: nobody wants the opening of a film every time they come back
         * to a farm.
         */
        const begin = () => {
          started = true
          audio.chime()
          showTask()
        }
        if (!load && !prologueSeen()) showPrologue(root, begin, { onShot: cinematicShot })
        else begin()
      },
    })
  } else {
    audio.unlock()
    if (app.audioPrefs.music) app.music.start()
    showTask()
    // `?prologue=1` puts the cold open back up on a nomenu load, which is the
    // only way to photograph it — it is otherwise behind a click and a flag.
    if (params.get('prologue')) showPrologue(root, () => {})
  }
  if (params.get('audiotest')) {
    // Every sound in the game, fired once, plus the score. `npm run shoot audio`
    // turns a typo in the audio graph into a failing capture.
    audio.unlock()
    app.music.start()
    for (const k of ['till', 'sow', 'water', 'chop', 'mine', 'harvest', 'pickup', 'coin', 'build',
      'deny', 'ui', 'chime', 'prune', 'golem', 'pebble', 'cast', 'splash', 'nibble', 'bite', 'reel', 'landed']) {
      audio[k]()
    }
    // A footstep on every surface in the game, plus the ambient bed driven
    // across its whole range. A filter type this engine does not accept throws;
    // a gain that never opens does not, so both are checked.
    for (const ground of Object.values(GROUND_IDS)) {
      app.ambience.step(ground, false, false)
      app.ambience.step(ground, true, false)
    }
    app.ambience.step(0, false, true)
    for (const k of [0, 0.5, 1]) {
      app.ambience.update(0.5, { gust: k, wetness: k, day: k, swimming: k > 0.5 })
    }

    // A score that throws is caught by the console listener; a score that
    // quietly books nothing is not, and that is the more likely failure.
    setTimeout(() => {
      if (app.music.step < 3) console.error(`the score booked ${app.music.step} beats in three seconds`)
      if (!app.ambience.built) console.error('the ambient bed never built its graph')
      else if (!(app.ambience.wind > 0)) console.error(`the wind bed is silent (${app.ambience.wind})`)
    }, 3000)
  }
  // The context is suspended until a real gesture, so the score has to be told
  // to start again on whichever of these actually lands first.
  const kick = () => {
    audio.unlock()
    if (app.audioPrefs.music) app.music.start()
  }
  addEventListener('pointerdown', kick, { once: true })
  addEventListener('keydown', kick, { once: true })

  const clock = new THREE.Clock()
  const focus = new THREE.Vector3()
  const idleTarget = new THREE.Vector3()
  let talking = null
  let playFrames = 0

  app.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.06)

    if (started) {
      tickPing(dt)
      app.touch.update(dt)
      input.stick = app.touch.move
      input.poll()
      // Time only moves while the game is being played. A player who opened the
      // journal and went to lunch should not come back to a lost season.
      if (!app.panels.isOpen && !app.pruning.active) {
        // A full 06:00 -> 02:00 day in about thirteen real minutes, matching
        // Velion's clock. At 0.28 an hour went by every three and a half
        // seconds: the sun raced, nothing had time to read as morning or
        // evening, and the day/night cycle turned into a strobe.
        state.hour += dt * HOURS_PER_SECOND
        if (state.hour >= 26) doSleep(true)
      }
      // While the opening is running the camera is on rails and the body is
      // not taking orders — a settler who wanders off during her own prologue
      // is the fastest way to make a staged shot look like a bug.
      if (!app.cinematic) control.update(dt, input, app.rig.inputYaw)
      talking = handleInteraction(talking)
      if (app.cinematic) {
        /**
         * On rails. The rig's own damping does the move, so a cut between cards
         * is a slow drift rather than a jump — the same trailing that makes the
         * camera feel weighted in play is exactly what a staged move wants.
         */
        app.rig.targetSize = app.cinematic.size
        app.rig.yawIndex = app.cinematic.yawIndex
        focus.copy(app.rig.update(dt, app.cinematic.pos, null))
      } else {
        focus.copy(app.rig.update(dt, control.pos, app.panels.isOpen ? null : input))
      }
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
    app.player.anim.rod = state.held === 'rod'
    // So nothing can be built on the tile the player is standing on.
    state.playerCell = control.cell
    app.fishing.update(dt, control.pos, control.facing, state.hour)
    app.pruning.update(dt)
    app.flag.update(dt)
    app.music.setHour(state.hour)
    app.tutorial.update(dt, control.pos)

    const rebuild = state.drainRebuilds()
    if (rebuild.props) app.props.dirty = true
    if (rebuild.crops) app.crops.dirty = true
    if (rebuild.structures) syncStructures()
    // Anything that stands on the ground changes what the ground is shaded by.
    if (rebuild.props || rebuild.structures) reshade()
    app.terrain.update()
    app.props.update(dt)
    app.crops.update(dt, stageFor)

    app.sky.setSpan(app.rig.size * 0.95)
    const sky = app.sky.update(state.hour, focus)
    app.sky.follow(app.camera)
    app.water.update(dt, sky)
    app.life.update(dt, sky)
    app.weather.update(dt, focus, SEASON_NAMES[state.season], sky)

    /**
     * The bed, and the feet.
     *
     * `wetness` is how much of a small neighbourhood is open water rather than a
     * trigger radius, so walking a riverbank fades rather than switches. The
     * gust is the SAME number the petals and the vertex sway read, so a gust you
     * hear is a gust you can see bending the trees.
     */
    {
      const [cx, cz] = control.cell
      let wet = 0
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) if (grid.isWater(cx + dx, cz + dz)) wet++
      }
      app.ambience.update(dt, {
        gust: app.weather.gust,
        wetness: Math.min(1, wet / 24),
        day: sky.day,
        swimming: control.swimming,
      })
      if (app.player.anim.footfall) {
        app.ambience.step(grid.get('ground', cx, cz), input.run, control.swimming)
      }
    }
    animateStructures(dt, sky)

    if (started) app.hud.tick(state.hour)
    app.renderer.render(app.scene, app.camera)
    window.__shotFrames++
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
    // Windows come on at dusk and go off at dawn, on a curve steep enough that
    // the change reads as somebody lighting a lamp rather than as a dimmer.
    if (node.userData.panes) {
      const lit = Math.max(0, Math.min(1, (night - 0.28) / 0.34))
      node.userData.panes.opacity = lit * 0.92
      node.userData.panes.visible = lit > 0.01
    }
    if (node.userData.lamp) {
      const lit = Math.max(0, Math.min(1, (night - 0.28) / 0.34))
      // Physical units: a Lambert surface divides by PI, so this is about six.
      node.userData.lamp.intensity = lit * 2.0 * Math.PI * (0.94 + Math.sin(performance.now() * 0.0016) * 0.06)
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
  if (input.pressed('pebbles')) panels.toggle('pebbles')
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
  const ruined = struct?.userData.building?.derelict ? struct.userData.building : null
  if (near) prompt = `<b>E</b> — speak to ${near.spec.name}`
  else if (ruined) {
    // The whole direction of the game is on this line, so it says the price
    // rather than making the player open a panel to find out.
    const spec = RESTORE[ruined.kind]
    prompt = `<b>E</b> — put ${spec.label} back · ${costText(spec.cost)}`
  } else if (struct?.userData.kind === 'kiln' && state.unlocked.has('fire')) {
    prompt = '<b>E</b> — fire cut stone · 3 stone'
  }
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
  // A line in the water owns the hint line outright — nothing else the player
  // could be standing next to matters while a fish is deciding.
  if (held === 'rod') {
    prompt = app.fishing.hint()
      ?? (app.fishing.aim(control.pos, control.facing) ? '<b>F</b> — cast' : 'face open water to cast')
  } else if (grid.nearWater(tx, tz, 2) && !control.swimming) {
    // Standing at water without the rod out. Whatever else is under the cursor,
    // say this — a fishing system nobody is told about is a fishing system
    // nobody finds, and the rod is already in the pack.
    const slot = state.hotbar.indexOf('rod')
    if (slot >= 0) prompt = `<b>${slot + 1}</b> — take the rod and fish here`
  }
  if (control.swimming) prompt = 'swimming · walk at a low bank to climb out'
  hud.setHint(prompt)

  // --- E: interact ---------------------------------------------------------
  if (input.pressed('interact')) {
    // A rod in the water claims E first. Every other use of the key needs
    // something to be standing in front of you; this one does not, and losing
    // the cast to a well you happen to be next to is the worse outcome.
    if (held === 'rod' && app.fishing.active) {
      const r = app.fishing.toggle()
      state.say(r === 'set' ? 'Set the rod down. It will fish while you do something else.' : 'Picked the rod back up.')
      return talking
    }
    if (near) {
      // Rocky's first line is always the forecast, because that is what the
      // relay is for; after that he cycles what he has to say.
      hud.say(near.line === 0
        ? { name: near.spec.name, role: near.spec.role, line: cast.forecast(app.pruning.nightsUntil()) }
        : near.speak())
      near.line++
      audio.golem(1)
      // Specifically Rocky, and specifically at the relay. There are five
      // constructs now and the ridge step has to mean the ridge — meeting Cairn
      // on the home terrace would otherwise tick it off without a walk.
      if (near.spec.id === 'rocky' && !state.flags.has('met-rocky')) {
        state.flags.add('met-rocky')
        state.addJournal('Met the construct at the relay. It calls itself Rocky and it does not leave the ridge.')
      }
      if (!state.flags.has(`met-${near.spec.id}`)) {
        state.flags.add(`met-${near.spec.id}`)
        state.addJournal(`Met ${near.spec.name}. ${near.spec.role}`)
      }
      return near
    }
    if (talking) {
      talking = null
      hud.say(null)
    }
    if (ruined) {
      if (state.restore(ruined)) {
        app.player.play('swing')
        audio.build?.()
        syncStructures()
      }
      return talking
    }
    if (struct?.userData.kind === 'kiln' && state.unlocked.has('fire')) {
      if (state.fire(1)) {
        app.player.play('swing')
        audio.build?.()
      }
      return talking
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

  // --- F: the rod takes the key outright ------------------------------------
  // One key for cast, strike and reel-in. A fishing minigame with its own
  // control scheme is a fishing minigame nobody finishes.
  if (held === 'rod') {
    if (input.pressed('use')) {
      const r = app.fishing.press(control.pos, control.facing, state.hour)
      if (r === 'cast') app.player.play('swing')
      else if (r === 'strike') app.player.play('swing')
      else if (!r || r === 'nowater') audio.deny()
    }
    return talking
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
/**
 * A RING ON THE GROUND, for a second and a half.
 *
 * The two action buttons answer "where", and the honest way to answer that in a
 * game with a walking body is to mark the spot rather than to teleport, snap the
 * camera, or farm it remotely. It sits a hair above the cell's own surface so it
 * terraces correctly, and it is unlit — a marker that dims at dusk is a marker
 * you cannot find at dusk.
 */
let pingMesh = null
let pingLeft = 0

function pingCell(x, z) {
  const { scene, grid } = app
  if (!pingMesh) {
    const geo = new THREE.RingGeometry(0.34, 0.46, 24)
    geo.rotateX(-Math.PI / 2)
    pingMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(UI.rose), transparent: true, opacity: 0.9, depthWrite: false,
    }))
    pingMesh.renderOrder = 3
    scene.add(pingMesh)
  }
  pingMesh.position.set(x + 0.5, grid.h(x, z) * LEVEL + 0.03, z + 0.5)
  pingMesh.visible = true
  pingLeft = 1.6
}

function tickPing(dt) {
  if (!pingMesh || pingLeft <= 0) return
  pingLeft -= dt
  if (pingLeft <= 0) { pingMesh.visible = false; return }
  // Two pulses over its life, fading out — enough to catch the eye across a
  // wide shot without becoming another thing blinking on screen.
  const t = 1.6 - pingLeft
  pingMesh.scale.setScalar(1 + Math.sin(t * 7) * 0.12)
  pingMesh.material.opacity = 0.9 * Math.min(1, pingLeft / 0.6)
}

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
