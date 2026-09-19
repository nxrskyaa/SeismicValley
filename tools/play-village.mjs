import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Run against npm run dev or a deployed build. Only the browser's test profile is modified.
const base = process.env.PLAY_URL || 'http://127.0.0.1:5293'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] })
const errors = []
const page = await browser.newPage()
page.on('pageerror', e => errors.push(e.message))
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
await mkdir('shots', { recursive: true })
const pause = (ms = 250) => new Promise(r => setTimeout(r, ms))
const clickText = async (selector, text) => {
  const buttons = await page.$$(selector)
  for (const b of buttons) if ((await b.evaluate(n => n.textContent.trim())).includes(text)) { await b.click(); await pause(); return }
  throw new Error(`No ${selector} with text ${text}`)
}
const aim = async (x, z) => {
  await page.evaluate((x, z) => {
    const a = window.app
    a.control.teleport(x + .5, z + 1.35)
    a.control.renderY = a.control.pos.y
    a.control.facing = Math.PI
  }, x, z)
  await pause(500)
  assert.deepEqual(await page.evaluate(() => window.app.control.target), [x, z])
}
const tap = async key => { await page.keyboard.down(key); await pause(90); await page.keyboard.up(key); await pause(480) }
try {
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${base}/?nomenu=1`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => window.__shotFrames > 30 && window.app?.village)
  // Position fixtures isolate the action being tested; all actions use real keys/buttons.
  const field = await page.evaluate(() => {
    const g = window.app.grid, p = window.app.village.plot
    return { x: p.x0, z: p.z1, starterX: p.x0, starterZ: p.z0, dryI: g.crop.findIndex(c => c > 0) }
  })
  await aim(field.x, field.z)
  await tap('Digit1'); await tap('KeyF')
  assert.ok(await page.evaluate(({ x, z }) => window.app.grid.get('tilled', x, z), field))
  await tap('Digit6'); await tap('KeyF')
  assert.ok(await page.evaluate(({ x, z }) => window.app.grid.get('crop', x, z), field))
  await tap('Digit2'); await tap('KeyF')
  assert.ok(await page.evaluate(({ x, z }) => window.app.grid.get('wet', x, z), field))
  await aim(field.starterX, field.starterZ)
  await tap('KeyF')
  const beforeDay = await page.evaluate(() => window.app.state.day)
  await clickText('.farm-nav-btn', 'Home')
  await clickText('.sheet button', 'Sleep')
  assert.equal(await page.evaluate(() => window.app.state.day), beforeDay + 1)
  assert.ok(await page.$('.morning-stats'))
  await page.screenshot({ path: 'shots/village-morning.png' })
  await clickText('.sheet button', 'Step outside')
  await aim(field.starterX, field.starterZ)
  await tap('KeyE')
  assert.equal(await page.evaluate(() => window.app.state.stats.harvested), 1)
  const cash = await page.evaluate(() => window.app.state.coin)
  await clickText('.farm-nav-btn', 'Market')
  const cropId = await page.evaluate(() => [...window.app.state.bag.keys()].find(id => ['grubwort', 'palewheat'].includes(id)))
  const sell = await page.$$('.sheet .row')
  for (const row of sell) if ((await row.evaluate(n => n.textContent)).toLowerCase().includes(cropId)) {
    const btn = await row.$('button'); await btn.click(); break
  }
  await pause()
  assert.ok(await page.evaluate(c => window.app.state.coin > c, cash))
  const seeds = await page.evaluate(() => window.app.state.count('seed_grubwort'))
  await page.click('.market-item button')
  assert.equal(await page.evaluate(() => window.app.state.count('seed_grubwort')), seeds + 1)
  await page.screenshot({ path: 'shots/village-market.png' })
  await tap('Escape')
  await page.evaluate(() => {
    const p = window.app.village.people[0]
    window.app.control.teleport(p.pos.x, p.pos.z + 1)
  })
  await pause(500); await tap('KeyE')
  assert.ok(await page.$('.npc-intro'))
  assert.equal(await page.evaluate(() => window.app.state.friendships.marn), 5)
  // State fixtures provide request items; the actual redemption is a user click.
  await page.evaluate(() => window.app.state.give('grubwort', 7))
  await clickText('.sheet button', 'Give gift')
  await clickText('.sheet button', 'Deliver')
  assert.equal(await page.evaluate(() => window.app.state.friendships.marn), 27)
  await page.screenshot({ path: 'shots/village-neighbor.png' })
  await tap('Escape'); await tap('KeyE')
  assert.equal(await page.evaluate(() => window.app.state.friendships.marn), 27)
  await tap('Escape')
  await page.evaluate(() => {
    const s = window.app.state
    s.give('wood', 30); s.give('stone', 18); s.coin += 250
  })
  await clickText('.farm-nav-btn', 'Home')
  await clickText('.sheet button', 'Build')
  assert.equal(await page.evaluate(() => window.app.state.homeTier), 2)
  await page.screenshot({ path: 'shots/village-home.png' })
  await tap('Escape')
  await clickText('.farm-nav-btn', 'Save')
  const expected = await page.evaluate(() => ({ coin: window.app.state.coin, day: window.app.state.day, home: window.app.state.homeTier, friends: window.app.state.friendships, sown: window.app.state.stats.sown }))
  await page.goto(base, { waitUntil: 'networkidle0' })
  await clickText('.title-actions button', 'Continue')
  await pause(700)
  const actual = await page.evaluate(() => ({ coin: window.app.state.coin, day: window.app.state.day, home: window.app.state.homeTier, friends: window.app.state.friendships, sown: window.app.state.stats.sown }))
  assert.deepEqual(actual, expected)
  console.log('ok  keyboard till → sow → water → sleep → harvest; market sale and purchase; NPC chat/gift/delivery; home upgrade; Continue round trip')

  for (const [width, height] of [[360, 800], [844, 390]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await page.goto(`${base}/?nomenu=1`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => window.__shotFrames > 25)
    await pause(600)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    // Every menu entry receives the pointer, not the transparent joystick layer.
    for (const name of ['Market', 'Village', 'Bag', 'Guide', 'Home']) {
      await clickText('.farm-nav-btn', name)
      assert.ok(await page.$('.panels.is-on'))
      await page.click('.sheet-close')
    }
    const garden = await page.evaluate(() => window.app.village.plot)
    await aim(garden.x0, garden.z1)
    await page.tap('.slot:first-child')
    const pad = await page.evaluate(() => { const p = window.app.touch.pads.find(p => p.action === 'use'); return { x: p.cx, y: p.cy, surface: document.elementFromPoint(p.cx, p.cy)?.id } })
    assert.equal(pad.surface, 'touch', 'USE pad must not be covered by a menu or action button')
    await page.touchscreen.tap(pad.x, pad.y)
    await pause(600)
    assert.ok(await page.evaluate(p => window.app.grid.get('tilled', p.x0, p.z1), garden), 'touch USE must till soil')
    await page.screenshot({ path: `shots/village-${width}x${height}.png` })
    await clickText('.farm-nav-btn', 'Market')
    assert.equal(await page.evaluate(() => { const n = document.querySelector('.sheet'); return n.scrollWidth > n.clientWidth }), false)
    await page.screenshot({ path: `shots/market-${width}x${height}.png` })
    console.log(`ok  ${width}×${height}: menu hit targets, scrollable panels and no horizontal overflow`)
  }
  assert.deepEqual(errors, [])
  console.log('ok  no browser errors')
} catch (error) {
  console.error('Browser errors:', errors)
  console.error(await page.evaluate(() => ({ target: window.app?.control?.target, held: window.app?.state?.held, captured: window.app?.input?.captured, frames: window.__shotFrames })))
  throw error
} finally { await browser.close() }
