import { markSvg } from '../core/mark.js'
import { svgWordmark } from '../core/wordmark.js'
import { GameState } from '../game/state.js'
import { loadAppearance, saveAppearance } from '../game/appearance.js'
import { buildCustomizer } from './customize.js'
import { isTouch } from './keycaps.js'

const el = (tag, cls, html) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (html != null) node.innerHTML = html
  return node
}
const button = (label, cls, fn) => {
  const node = el('button', cls, label)
  node.type = 'button'
  node.addEventListener('click', fn)
  return node
}

/** The front door: main menu first, wardrobe only after New Game. */
export function showTitle(root, { onStart, seed, sound, music, onSound, onMusic, onMotion }) {
  const node = el('div', 'title front-door')
  const frame = el('div', 'title-card front-frame')
  const save = GameState.peek()
  let dresser = null
  let draft = loadAppearance()
  let finished = false
  let frozen = matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    const preference = localStorage.getItem('sv.front-motion')
    if (preference != null) frozen = preference === 'off'
  } catch { /* Storage can be unavailable in private sessions. */ }
  const setMotion = on => {
    frozen = !on
    onMotion(frozen)
    try { localStorage.setItem('sv.front-motion', on ? 'on' : 'off') } catch { /* optional preference */ }
  }
  node.dataset.page = 'home'
  node.hidden = true
  node.append(frame)
  root.append(node)
  document.body.classList.add('is-title')
  onMotion(frozen)

  const footer = () => el('footer', 'front-footer', '<a href="https://x.com/nxrskyaa" target="_blank" rel="noopener noreferrer">Built by <b>Nxrskyaa</b> ↗</a><a href="https://x.com/nxrlabs" target="_blank" rel="noopener noreferrer">NxrLabs ↗</a><span>An independent Seismic-inspired game</span>')
  const back = () => button('← Main menu', 'front-back', () => page('home'))
  const heading = (eyebrow, title) => el('header', 'front-heading', `<span>${eyebrow}</span><h2>${title}</h2>`)
  function clear() {
    if (dresser) { draft = dresser.value; dresser.dispose(); dresser = null }
    frame.replaceChildren()
  }
  function page(kind) {
    clear()
    node.dataset.page = kind
    if (kind === 'home') home()
    if (kind === 'create') create()
    if (kind === 'about') about()
    if (kind === 'settings') settings()
    if (!node.hidden) frame.querySelector('button')?.focus({ preventScroll: true })
  }
  function home() {
    const top = el('div', 'front-top', `<a href="https://x.com/nxrlabs" target="_blank" rel="noopener noreferrer">${markSvg({ className: 'front-mark' })}<span>NXR LABS PRESENTS</span></a><span>A LIFE IN THE VALLEY</span>`)
    const hero = el('main', 'front-home')
    hero.append(el('div', 'front-edition', 'FARMING / FRIENDSHIP / A PLACE TO CALL HOME'))
    hero.append(el('h1', 'front-wordmark', `${svgWordmark('SEISMIC', { className: 'front-word seismic-word' })}${svgWordmark('VALLEY', { className: 'front-word valley-word' })}`))
    const actions = el('nav', 'title-actions front-actions')
    actions.setAttribute('aria-label', 'Main menu')
    if (save) actions.append(button(`<span class="front-option"><strong>Continue</strong><small>Day ${Number(save.day)} · your saved valley</small></span><i>↗</i>`, 'front-action front-primary continue-game', () => finish({ load: save })))
    actions.append(button(`<span class="front-option"><strong>New Game</strong><small>${save ? 'Begin another story' : 'Make yourself at home'}</small></span><i>↗</i>`, `front-action new-game ${save ? '' : 'front-primary'}`, () => page('create')))
    actions.append(button('<span>Settings</span><i>02</i>', 'front-action front-secondary', () => page('settings')))
    actions.append(button('<span>About the builder</span><i>03</i>', 'front-action front-secondary', () => page('about')))
    hero.append(actions)
    const scene = el('aside', 'front-scene-note', '<span class="scene-rule"></span><span>THE HOMESTEAD</span><small>A morning in Seismic Valley</small>')
    const motion = button(frozen ? 'Play scenery' : 'Pause scenery', 'front-motion', () => {
      setMotion(frozen); motion.textContent = frozen ? 'Play scenery' : 'Pause scenery'
      motion.setAttribute('aria-pressed', String(frozen))
    })
    motion.setAttribute('aria-pressed', String(frozen))
    scene.append(motion)
    frame.append(top, hero, scene, footer())
  }
  function create() {
    const sheet = el('section', 'front-sheet front-create')
    sheet.append(back(), heading('NEW GAME / YOUR FARMER', 'Who’s coming to the valley?'))
    dresser = buildCustomizer(draft)
    sheet.append(dresser.node)
    const bottom = el('div', 'front-create-bottom')
    bottom.append(el('p', '', save ? 'Starting a new farm replaces this browser’s save when you next save.' : 'Your farm saves on this device. No account needed.'))
    bottom.append(button('Begin your story <span>→</span>', 'front-begin', () => {
      if (save && !confirm('Start a new valley? The saved one is overwritten when you next save.')) return
      finish({ load: null, seed, appearance: dresser.value })
    }))
    sheet.append(bottom)
    frame.append(sheet)
  }
  function about() {
    const sheet = el('section', 'front-sheet front-about')
    sheet.append(back(), heading('BEHIND THE VALLEY', 'Built by Nxrskyaa.'))
    sheet.append(el('div', 'builder-signature', '<span>Design & development</span><strong>Nxrskyaa<span>↗</span></strong><p>Seismic Valley is an independent farming game from Nxrskyaa and NxrLabs, inspired by Seismic.</p>'))
    const credits = el('dl', 'builder-credits', '<div><dt>Studio</dt><dd>NxrLabs</dd></div><div><dt>Play on</dt><dd>PC & mobile</dd></div><div><dt>The world</dt><dd>Made in Three.js</dd></div>')
    const links = el('nav', 'builder-links')
    links.setAttribute('aria-label', 'Builder profiles')
    for (const [name, detail, url] of [['Nxrskyaa', 'Builder / X', 'https://x.com/nxrskyaa'], ['NxrLabs', 'Studio / X', 'https://x.com/nxrlabs'], ['NxrLabs web', 'x.com/nxrlabs', 'https://x.com/nxrlabs']]) {
      const a = el('a', '', `<span><strong>${name}</strong><small>${detail}</small></span><i>↗</i>`)
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a)
    }
    sheet.append(credits, links, el('p', 'front-colophon', 'An independent project. Not an official Seismic game.'))
    frame.append(sheet)
  }
  function settings() {
    const sheet = el('section', 'front-sheet front-settings')
    sheet.append(back(), heading('SETTLE IN', 'Make it comfortable.'))
    const switches = el('div', 'front-switches')
    for (const [label, detail, get, set] of [
      ['Sound effects', 'Footsteps, tools & the valley around you', sound, onSound],
      ['Music', 'The Seismic Valley score', music, onMusic],
      ['Moving scenery', 'Slow camera movement in the main menu', () => !frozen, setMotion],
    ]) {
      const row = el('div', 'front-setting')
      const toggle = button(get() ? 'On' : 'Off', 'front-switch', () => { set(!get()); toggle.textContent = get() ? 'On' : 'Off'; toggle.setAttribute('aria-pressed', String(get())) })
      toggle.setAttribute('aria-label', label); toggle.setAttribute('aria-pressed', String(get()))
      row.append(el('div', '', `<strong>${label}</strong><small>${detail}</small>`), toggle)
      switches.append(row)
    }
    sheet.append(switches, el('h3', 'front-controls-title', isTouch() ? 'Under your thumbs' : 'At your fingertips'))
    sheet.append(el('div', 'front-controls', isTouch()
      ? '<p><b>Left stick</b><span>Walk · push further to run</span></p><p><b>USE / ACT</b><span>Use a tool / talk & harvest</span></p><p><b>JUMP / TURN</b><span>Jump / rotate the view</span></p><p><b>Tool roll</b><span>Swipe, then tap to equip</span></p>'
      : '<p><b>W A S D</b><span>Walk · Shift to run</span></p><p><b>F / E</b><span>Use a tool / talk & harvest</span></p><p><b>Q / R</b><span>Rotate · scroll to zoom</span></p><p><b>1 — 8</b><span>Choose your tool</span></p>'))
    frame.append(sheet)
  }
  function finish(options) {
    if (finished) return
    finished = true
    if (options.appearance) saveAppearance(options.appearance)
    clear()
    removeEventListener('keydown', onKey)
    node.classList.add('is-out')
    document.body.classList.remove('is-title')
    setTimeout(() => node.remove(), 450)
    onStart(options)
  }
  function onKey(event) {
    if (event.key === 'Escape' && node.dataset.page !== 'home') {
      event.preventDefault(); page('home')
    }
  }
  addEventListener('keydown', onKey)
  page('home')
  return {
    node,
    reveal() { node.hidden = false; frame.querySelector('button')?.focus({ preventScroll: true }) },
  }
}
