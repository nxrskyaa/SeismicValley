import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
const base = process.env.PLAY_URL || 'http://127.0.0.1:5293'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const pause = ms => new Promise(r => setTimeout(r, ms))
const inspect = () => page.evaluate(() => {
  const selectors = ['.hud .log', '.wallet', '.farm-nav', '.task:not(.is-off)', '.hotbar', '.meters', '.hint.is-on', '.held-label', '.route-indicator:not([hidden])']
  const boxes = selectors.flatMap(s => [...document.querySelectorAll(s)].filter(n => getComputedStyle(n).visibility !== 'hidden').map(n => {
    const r = n.getBoundingClientRect(); return { name: s, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  }))
  const failures = []
  for (const a of boxes) {
    if (a.left < -1 || a.right > innerWidth + 1 || a.top < -1 || a.bottom > innerHeight + 1) failures.push(`out of viewport: ${a.name}`)
    for (const b of boxes.slice(boxes.indexOf(a) + 1)) if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) failures.push(`${a.name} overlaps ${b.name}`)
  }
  if (window.app.touch.enabled) {
    const t = window.app.touch
    for (const p of [...t.pads, { cx: t.stick.rest[0], cy: t.stick.rest[1], r: t.stickR, action: 'stick' }]) {
      for (const b of boxes) {
        const x = Math.max(b.left, Math.min(p.cx, b.right)), y = Math.max(b.top, Math.min(p.cy, b.bottom))
        if (Math.hypot(p.cx - x, p.cy - y) < p.r + 2) failures.push(`${p.action} overlaps ${b.name}`)
      }
      if (document.elementFromPoint(p.cx, p.cy)?.id !== 'touch') failures.push(`${p.action} not touchable`)
    }
  }
  return { failures, overflow: document.documentElement.scrollWidth > innerWidth }
})
try {
 for (const [width, height, touch] of [[320,568,true],[360,800,true],[390,844,true],[768,1024,true],[844,390,true],[1024,600,false],[1440,900,false]]) {
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 })
  await page.goto(`${base}/?nomenu=1`, {waitUntil:'networkidle0'})
  await page.waitForFunction(() => window.__shotFrames > 25)
  await pause(300)
  assert.deepEqual(await inspect(), { failures: [], overflow: false }, `${width}x${height} HUD`)
  await page.click('.task-toggle')
  assert.equal(await page.$eval('.task-toggle', n => n.getAttribute('aria-expanded')), 'true')
  assert.deepEqual(await inspect(), { failures: [], overflow: false }, `${width}x${height} expanded objective`)
  await page.click('.task-toggle')
  if (touch && width < 700) {
    const b = await page.$eval('.hotbar', n => { const r = n.getBoundingClientRect(); return { x: r.right - 30, y: r.top + 24 } })
    await page.touchscreen.touchStart(b.x, b.y)
    for(let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(b.x - i * 18, b.y); await pause(30) }
    await page.touchscreen.touchEnd()
    await pause(400)
    assert.ok(await page.$eval('.hotbar', n => n.scrollLeft > 0), 'tool roll swipes')
    await page.tap('.slot:last-child')
    assert.equal(await page.evaluate(() => window.app.state.slot), 7)
    assert.equal(await page.evaluate(() => window.app.touch.stick.id), -1)
  }
  await page.screenshot({path:`shots/ui-${width}x${height}.png`})
  // Held-input fixture models opening a menu while a thumb is still down.
  if(touch) await page.evaluate(() => {
    window.app.touch.pads[0].down = true
    window.app.input.held.add('use')
  })
  await page.click('.journal-toggle')
  assert.equal(await page.evaluate(() => window.app.input.held.has('use')), false)
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#touch')).visibility), 'hidden')
  const hour = await page.evaluate(() => window.app.state.hour)
  await pause(400)
  assert.equal(await page.evaluate(() => window.app.state.hour), hour)
  for (const name of ['Home','Market','Village','Bag','Build','Field log','Guide']) {
    if(!(await page.$('.journal-nav'))) await page.click('.journal-toggle')
    const nav = await page.$$('.farm-nav-btn')
    for(const b of nav) if(await b.$eval('strong', n=>n.textContent) === name) { await b.click(); break }
    assert.equal(await page.$eval('.sheet', n => n.scrollWidth > n.clientWidth), false, `${name} panel overflow`)
    if(name==='Market') await page.screenshot({path:`shots/ui-market-${width}.png`})
    if(name==='Village') {
      await page.click('.neighbor-row button')
      await pause(300)
      assert.deepEqual(await inspect(), { failures: [], overflow: false }, `${width}x${height} navigation`)
      await page.click('.route-indicator')
    } else {
      await page.click('.sheet-back')
      assert.ok(await page.$('.journal-nav'))
      await page.click('.sheet-close')
    }
  }
  await page.click('.journal-toggle')
  await page.$eval('.sound', n=>n.scrollIntoView({block:'center'}))
  const before = await page.evaluate(()=>window.app.hud.musOn)
  await page.click('.sound-btn:last-child')
  assert.equal(await page.evaluate(()=>window.app.hud.musOn), !before)
  await page.click('.sheet-close')
  assert.equal(await page.$eval('.journal-toggle', n=>document.activeElement === n), true)
  await page.click('.journal-toggle')
  await page.click('.act-plant')
  assert.equal(await page.$eval('.tray', n=>n.hidden), false)
  await page.click('.seed')
  assert.equal(await page.evaluate(()=>window.app.panels.isOpen), false)
  assert.ok(await page.evaluate(()=>window.app.state.held.startsWith('seed_')))
  console.log(`ok ${width}x${height}: separated HUD, objective, pads, journal destinations, audio, pause and focus${touch && width<700 ? ', real tool swipe' : ''}`)
 }
 assert.deepEqual(errors, [])
} catch(error) { await page.screenshot({path:'shots/ui-failure.png'}); throw error } finally { await browser.close() }
