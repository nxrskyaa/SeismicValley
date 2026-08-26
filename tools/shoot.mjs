#!/usr/bin/env node
// Deterministic headless captures.
//
//   node tools/shoot.mjs                 -> every pose into shots/
//   node tools/shoot.mjs valley rocky    -> just those poses
//   node tools/shoot.mjs --tag before    -> shots/before-<pose>.png
//
// Poses are declared in src/game/poses.js and driven through the URL, so a
// capture is the real game running the real systems — not a preview harness
// with its own copy of the scene that can quietly drift out of date.
//
// Exits non-zero and prints the page's console errors if a pose fails, so a
// broken build can never pass as "looks fine".

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Its own port: a dev server the user is driving must never be competed for.
const PORT = Number(process.env.SHOT_PORT || 5292)
const HOST = '127.0.0.1'
const OUT = path.join(ROOT, 'shots')
const W = 1440
const H = 900

const ALL = ['valley', 'home', 'gate', 'rocky', 'sheet', 'rig', 'house', 'field', 'pond', 'lake', 'dawn', 'dusk', 'night', 'pruning', 'pebble', 'play', 'menu', 'hud', 'audio', 'prologue', 'drive', 'firstrun', 'reload', 'mobile']

/**
 * Poses that are INTERFACE rather than camera.
 *
 * These load the game the way a player does — no `?shot=`, so the title card is
 * up and the world is live behind it — and wait on a DOM node instead of on the
 * capture harness's ready flag. Screenshotting the menu through the capture
 * path is impossible by construction: that path exists precisely to skip it.
 */
const DOM_POSES = {
  menu: { query: '', wait: '.title-card', settle: 1400 },
  hud: { query: '?nomenu=1', wait: '.hotbar', settle: 2200 },
  // Not a picture — a smoke test. The score builds its whole WebAudio graph and
  // books several phrases of notes; anything wrong in it throws, and the harness
  // already fails on a console error.
  audio: { query: '?nomenu=1&audiotest=1', wait: '.hotbar', settle: 4000 },
  prologue: { query: '?nomenu=1&prologue=1', wait: '.prologue-lines', settle: 1600 },
  /**
   * Not a picture either — the only test that touches the real input path.
   *
   * The soak in `tools/soak.mjs` drives the game logic with a fake input object,
   * which means it proves nothing about keyboard handling, the camera rig, the
   * meshers, the HUD, the panels, or anything that only exists in a browser. This
   * pose opens every panel, walks, runs, jumps, turns the camera, cycles the
   * whole hotbar and swings at things for half a minute, and fails on the first
   * console error — which is where a rendering or interface bug actually lands.
   */
  drive: { query: '?nomenu=1', wait: '.hotbar', settle: 700, drive: true },
  /**
   * The path a new player actually takes, which no other pose touches: title
   * card, a settler chosen, Begin, the cold open, and then the game. Every one
   * of those is a different code path and the handover between them is where a
   * first run breaks.
   */
  firstrun: { query: '', wait: '.title-card', settle: 900, firstRun: true },
  /** Play, save, reload, and assert the valley came back the way it was left. */
  reload: { query: '?nomenu=1', wait: '.hotbar', settle: 400, reload: true },
  /** The same game on a phone: coarse pointer, touch controls, a narrow card. */
  mobile: { query: '?nomenu=1', wait: '.hotbar', settle: 1400, mobile: true },
}

const argv = process.argv.slice(2)
let tag = ''
let width = W
let height = H
const poses = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--tag') tag = argv[++i]
  else if (argv[i] === '--size') { const [w, h] = argv[++i].split('x').map(Number); width = w; height = h }
  else poses.push(argv[i])
}
const shots = poses.length ? poses : ALL
const bad = shots.filter((s) => !ALL.includes(s))
if (bad.length) {
  console.error(`unknown pose(s): ${bad.join(', ')} — known: ${ALL.join(', ')}`)
  process.exit(2)
}

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p))

if (!CHROME) {
  console.error('no Chrome found; set CHROME_PATH')
  process.exit(2)
}

const listening = (port) => new Promise((res) => {
  const s = net.connect(port, HOST)
  s.on('connect', () => (s.destroy(), res(true)))
  s.on('error', () => res(false))
})

async function waitForPort(port, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await listening(port)) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/**
 * Half a minute of somebody actually playing.
 *
 * Deliberately clumsy: keys held in overlapping combinations, panels opened and
 * closed mid-stride, tools swapped in the middle of a swing. A player does all
 * of that and a scripted happy path does none of it.
 */
async function drivePage(page) {
  // Wait for the GAME, not for a number of milliseconds. `.hotbar` appears as
  // soon as the HUD is built, which on a cold dev server can be a second before
  // the world has meshed and the controller exists — and a scripted key press
  // into that gap does nothing and fails the pose for no reason at all.
  await page.waitForFunction(
    () => !!window.__app?.control && !!window.__app?.panels && window.__shotFrames > 30,
    { timeout: 30000 },
  )

  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k)
    await new Promise((r) => setTimeout(r, ms))
    for (const k of keys) await page.keyboard.up(k)
  }
  const tap = async (k, n = 1) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(k)
      await new Promise((r) => setTimeout(r, 90))
    }
  }

  // Walk out, run, turn the camera under the feet, jump off whatever is there.
  await hold(['KeyW'], 900)
  await hold(['KeyW', 'ShiftLeft'], 900)
  await tap('KeyQ')
  await hold(['KeyA', 'KeyW'], 700)
  await tap('KeyR', 2)
  await hold(['KeyS', 'KeyD'], 700)
  await hold(['Space'], 120)
  await hold(['KeyD', 'ShiftLeft'], 900)

  // Every tool in the bar, swung at whatever is in front.
  for (let i = 1; i <= 8; i++) {
    await tap(`Digit${i}`)
    await tap('KeyF', 2)
    await tap('KeyE')
  }

  /**
   * Every panel, opened and shut with the key the panel itself advertises.
   *
   * Panels capture input, and a captured input used to drop EVERY action —
   * including the one that closes the panel. The homestead card said "ESC —
   * CLOSE" and Escape did nothing; the only way out was clicking a scrim nothing
   * mentions. This loop is what found it, so this loop asserts it.
   */
  for (const k of ['Tab', 'KeyB', 'KeyJ', 'KeyP']) {
    await tap(k)
    await new Promise((r) => setTimeout(r, 300))
    const opened = await page.evaluate(() => !!window.__app?.panels?.isOpen)
    if (!opened) throw new Error(`${k} did not open a panel`)
    await tap('Escape')
    await new Promise((r) => setTimeout(r, 260))
    const shut = await page.evaluate(() => !window.__app?.panels?.isOpen)
    if (!shut) throw new Error(`Escape did not close the panel ${k} opened`)
  }

  /**
   * EVERY panel, rendered at least once.
   *
   * The shop and the pebble roster were both fully written and neither had a
   * door: nothing anywhere called `open('shop')`, so coin had nothing in the
   * game to buy, and three seed lines and every sapling were unreachable. This
   * walks the panel graph by hand and renders each one, so an orphan is a
   * failing capture rather than something nobody notices for a month.
   */
  const opened = await page.evaluate(async () => {
    const panels = window.__app.panels
    const seen = []
    for (const kind of ['homestead', 'build', 'shop', 'crate', 'journal', 'pebbles']) {
      panels.open(kind, { cell: window.__app.control.target })
      seen.push(panels.isOpen ? kind : `${kind} FAILED`)
      await new Promise((r) => requestAnimationFrame(r))
    }
    panels.close()
    return seen
  })
  const broken = opened.filter((k) => k.includes('FAILED'))
  if (broken.length) throw new Error(`panels that would not open: ${broken.join(', ')}`)

  // And walk again afterwards, which is what catches an input capture that was
  // never released: the panel is gone, and the player still cannot move.
  const before = await page.evaluate(() => {
    const c = window.__app.control
    return { x: c.pos.x, z: c.pos.z }
  })
  await hold(['KeyW'], 800)
  const after = await page.evaluate(() => {
    const c = window.__app.control
    return { x: c.pos.x, z: c.pos.z, swimming: !!c.swimming, stuck: !!c.stuck }
  })
  if (!Number.isFinite(after.x) || !Number.isFinite(after.z)) throw new Error('player position is not finite after driving')
  if (Math.hypot(after.x - before.x, after.z - before.z) < 0.5) {
    throw new Error('the player could not move after the panels were closed — input capture was never released')
  }
  if (after.stuck) throw new Error('the player ended the run inside something they cannot leave')
  await new Promise((r) => setTimeout(r, 400))
}

/**
 * The first run, end to end.
 *
 * A fresh browser profile, so there is no save and no remembered prologue: the
 * title comes up, a settler is dressed, Begin is pressed, the cold open plays
 * and is skipped, and the game has to be running and drivable on the far side.
 */
async function firstRunPage(page) {
  // Nothing remembered — otherwise the prologue is skipped and the whole point
  // of this pose is skipped with it.
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.title-card', { timeout: 20000 })

  // Dress somebody, because the swatches repaint a live rig and that is a code
  // path a screenshot of the card does not exercise.
  const swatches = await page.$$('.swatch')
  for (const i of [1, 9, 15, 20]) await swatches[i % swatches.length]?.click()
  await page.click('.dress-dice')
  await new Promise((r) => setTimeout(r, 300))

  const [begin] = await page.$$('.title-actions .btn')
  if (!begin) throw new Error('the title card has no button to press')
  await begin.click()

  await page.waitForSelector('.prologue-lines', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 1200))
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 900))

  const gone = await page.evaluate(() => !document.querySelector('.prologue') && !document.body.classList.contains('is-title'))
  if (!gone) throw new Error('the cold open never handed the game back')

  // And it has to be playable, not merely visible.
  const before = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  await page.keyboard.down('KeyW')
  await new Promise((r) => setTimeout(r, 900))
  await page.keyboard.up('KeyW')
  const after = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  if (Math.hypot(after.x - before.x, after.z - before.z) < 0.5) {
    throw new Error('the player cannot move after a first run')
  }

  // The tutorial should be up and on its first job.
  const task = await page.evaluate(() => document.querySelector('.task-count')?.textContent ?? '')
  if (!/1 of/.test(task)) throw new Error(`the first morning did not start (card says "${task}")`)
  await new Promise((r) => setTimeout(r, 400))
}

/**
 * Save, reload, and check the valley came back.
 *
 * A save that silently drops a field is the worst class of bug in a game like
 * this: nothing throws, the world just quietly forgets that you tilled anything.
 * `checks.js` round-trips the state object; this round-trips the real thing
 * through localStorage and a page load.
 */
async function reloadPage(page) {
  // Change the world in ways that all have to survive: dig, take the day
  // forward, move somewhere specific.
  await page.evaluate(() => {
    const { state, control, grid } = window.__app
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(control.pos.x) + i - 3
      const z = Math.floor(control.pos.z) + 2
      if (grid.canTill(x, z)) state.till(x, z)
    }
    state.give('wood', 17)
    state.coin = 123
    state.addJournal('a line to look for after the reload')
  })
  const before = await page.evaluate(() => {
    const { state } = window.__app
    let tilled = 0
    for (let i = 0; i < state.grid.tilled.length; i++) tilled += state.grid.tilled[i] ? 1 : 0
    return { tilled, wood: state.count('wood'), coin: state.coin, day: state.day, journal: state.journal.length }
  })
  await page.keyboard.press('F5')
  await new Promise((r) => setTimeout(r, 500))

  await page.goto(page.url(), { waitUntil: 'load' })
  await page.waitForSelector('.hotbar', { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 700))
  // `?nomenu=1` starts a fresh valley; load the save the way Continue does.
  const after = await page.evaluate(() => {
    const { state } = window.__app
    const blob = JSON.parse(localStorage.getItem('seismic-valley.save') ?? 'null')
    if (!blob) return null
    if (!state.load(blob)) return 'load returned false'
    let tilled = 0
    for (let i = 0; i < state.grid.tilled.length; i++) tilled += state.grid.tilled[i] ? 1 : 0
    return { tilled, wood: state.count('wood'), coin: state.coin, day: state.day, journal: state.journal.length }
  })
  if (!after) throw new Error('F5 wrote no save')
  if (typeof after === 'string') throw new Error(after)
  for (const k of Object.keys(before)) {
    if (after[k] !== before[k]) throw new Error(`the save lost ${k}: ${before[k]} -> ${after[k]}`)
  }
}

/**
 * The same game on a phone.
 *
 * The touch controls only exist when the pointer is coarse, so they are invisible
 * to every other pose here — which is exactly how a control scheme ships broken.
 */
async function mobilePage(page) {
  const stick = await page.$('#touch')
  if (!stick) throw new Error('no touch controls on a coarse pointer')
  const box = await stick.boundingBox()
  if (!box || box.width < 10) throw new Error('the touch controls have no size')

  const before = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  // Drag the stick and hold it, which is what a thumb does.
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.touchscreen.touchStart(cx, cy)
  await page.touchscreen.touchMove(cx + box.width * 0.4, cy - box.height * 0.4)
  await new Promise((r) => setTimeout(r, 1200))
  await page.touchscreen.touchEnd()
  const after = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  if (Math.hypot(after.x - before.x, after.z - before.z) < 0.4) {
    throw new Error('dragging the touch stick did not move the player')
  }
  // And it has to STOP when the thumb lifts.
  await new Promise((r) => setTimeout(r, 500))
  const a = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  await new Promise((r) => setTimeout(r, 500))
  const b = await page.evaluate(() => ({ x: window.__app.control.pos.x, z: window.__app.control.pos.z }))
  if (Math.hypot(b.x - a.x, b.z - a.z) > 0.15) throw new Error('the player keeps walking after the thumb lifts')
}

async function main() {
  await mkdir(OUT, { recursive: true })

  let server = null
  if (!(await listening(PORT))) {
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', HOST], {
      cwd: ROOT, stdio: 'ignore', detached: false, shell: process.platform === 'win32',
    })
    if (!(await waitForPort(PORT, 40000))) {
      console.error('dev server never came up')
      process.exit(1)
    }
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: [
      '--no-sandbox',
      // Headless needs an explicit GL backend or WebGL silently falls back to a
      // software path that renders a black canvas and reports no error at all.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      // Without this the AudioContext stays suspended and the score smoke test
      // books nothing at all.
      '--autoplay-policy=no-user-gesture-required',
      /**
       * Every pose is its own tab, and Chrome throttles requestAnimationFrame in
       * a tab that is not in front — down to a frame a second, or to nothing.
       * The driven poses wait on a frame count to know the world is up, so a
       * throttled tab meant `drive` timed out about one full run in three. A
       * flaky check is worse than no check, so this is the mechanism, not a
       * longer timeout.
       */
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      `--window-size=${width},${height}`,
    ],
  })

  let failures = 0
  for (const pose of shots) {
    const page = await browser.newPage()
    // And front it, so the throttling heuristics have nothing to act on either.
    await page.bringToFront()
    const mob = DOM_POSES[pose]?.mobile
    await page.setViewport(mob
      ? { width: 412, height: 892, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width, height, deviceScaleFactor: 1 })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e && e.stack ? e.stack.split(String.fromCharCode(10)).slice(0, 6).join(' | ') : String(e)))

    const dom = DOM_POSES[pose]
    await page.goto(`http://${HOST}:${PORT}/${dom ? dom.query : `?shot=${pose}`}`, { waitUntil: 'load', timeout: 40000 })
    let ok = false
    try {
      if (dom) {
        await page.waitForSelector(dom.wait, { timeout: 30000 })
        // The valley behind the card is still meshing and the preview rig is
        // mid-turn; a frame taken the instant the node exists is a photograph
        // of a loading state.
        await new Promise((r) => setTimeout(r, dom.settle ?? 900))
      } else {
        await page.waitForFunction('window.__shotReady === true', { timeout: 30000 })
      }
      if (dom?.drive) await drivePage(page)
      if (dom?.firstRun) await firstRunPage(page)
      if (dom?.reload) await reloadPage(page)
      if (dom?.mobile) await mobilePage(page)
      ok = true
    } catch {
      /* fall through to the error dump below */
    }

    const name = `${tag ? `${tag}-` : ''}${pose}.png`
    const buf = await page.screenshot({ type: 'png' })
    await writeFile(path.join(OUT, name), buf)

    if (!ok || errors.length) {
      failures++
      console.error(`FAIL ${pose}${ok ? '' : ' (never signalled ready)'}`)
      for (const e of errors.slice(0, 8)) console.error(`   ${e}`)
    } else {
      console.log(`ok   shots/${name}`)
    }
    await page.close()
  }

  await browser.close()
  if (server) server.kill()
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
