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

const ALL = ['valley', 'home', 'gate', 'rocky', 'sheet', 'rig', 'dawn', 'dusk', 'night', 'pruning', 'play']

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
      `--window-size=${width},${height}`,
    ],
  })

  let failures = 0
  for (const pose of shots) {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto(`http://${HOST}:${PORT}/?shot=${pose}`, { waitUntil: 'load', timeout: 40000 })
    let ok = false
    try {
      await page.waitForFunction('window.__shotReady === true', { timeout: 30000 })
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
