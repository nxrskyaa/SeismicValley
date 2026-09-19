import * as THREE from 'three'
import { buildPlayer } from '../actors/player.js'
import { VILLAGERS } from '../game/village.js'
import { plotFor } from '../game/colony.js'
import { stoneMat, chamferBox } from '../core/kit.js'
import { HOME } from './worldgen.js'
import { P } from './grid.js'

// Small, authored places around the procedural terrain make the first farm legible.
export class Village {
  constructor(scene, grid, state, root) {
    this.grid = grid
    this.state = state
    this.group = new THREE.Group()
    this.group.name = 'village-life'
    scene.add(this.group)
    this.labels = document.createElement('div')
    this.labels.className = 'world-labels'
    root.append(this.labels)
    this.tags = []
    this.projected = new THREE.Vector3()
    const home = state.buildings.find((b) => b.kind === 'homestead')
    const crate = state.buildings.find((b) => b.kind === 'crate')
    this.plot = plotFor(home, state.streetZ)
    const positions = [[crate.x - 1, crate.z + 2], [HOME.x - 5, HOME.z + 1], [HOME.x + 10, HOME.z + 6]]
    this.people = VILLAGERS.map((spec, i) => {
      const [x, z] = grid.nearestStandable(...positions[i])
      const rig = buildPlayer(spec.look)
      rig.root.name = spec.id
      rig.root.scale.setScalar(1.12)
      const pos = new THREE.Vector3(x + 0.5, grid.y(x, z), z + 0.5)
      rig.root.position.copy(pos)
      rig.root.rotation.y = Math.PI / 4
      this.group.add(rig.root)
      const tag = this.tag(`${spec.name} <span>${spec.role}</span>`, pos, 2.1, 'person-tag')
      return { spec, rig, pos, home: pos.clone(), phase: i * 2.7, tag }
    })
    this.tag('HOME <span>Rest & build</span>', new THREE.Vector3(home.x + 0.5, grid.y(home.x, home.z), home.z + 3), 2.8)
    this.tag('MARKET <span>Seeds & shipping</span>', new THREE.Vector3(crate.x + 0.5, grid.y(crate.x, crate.z), crate.z + 0.5), 2.6)
    this.decorate(home, crate)
  }

  tag(html, pos, height, cls = '') {
    const node = document.createElement('div')
    node.className = `world-tag ${cls}`
    node.innerHTML = html
    this.labels.append(node)
    const tag = { node, pos, height }
    this.tags.push(tag)
    return tag
  }

  decorate(home, crate) {
    const mats = Object.fromEntries(Object.entries({ wood: '#907966', cream: '#eddfc8', plum: '#654553', earth: '#83654d', green: '#8b9f71', rose: '#c59091' }).map(([k, v]) => [k, stoneMat(v)]))
    const box = (at, size, mat) => {
      const mesh = new THREE.Mesh(chamferBox(...size, 0.025), mats[mat])
      mesh.position.set(...at)
      this.group.add(mesh)
      return mesh
    }
    const p = this.plot
    const y = this.grid.y(home.x, home.z)
    // Low split rails, with a broad opening toward the player.
    for (const x of [p.x0 - 0.25, p.x1 + 1.25]) {
      for (const z of [p.z0, p.z1 + 1]) box([x, y + 0.39, z], [0.12, 0.78, 0.12], 'wood')
      for (const h of [0.25, 0.55]) box([x, y + h, (p.z0 + p.z1 + 1) / 2], [0.07, 0.09, p.z1 - p.z0 + 1], 'cream')
    }
    // Bed borders and furrows make individual target cells apparent.
    for (let z = p.z0; z <= p.z1 + 1; z++) box([(p.x0 + p.x1 + 1) / 2, y + 0.018, z], [p.x1 - p.x0 + 1, 0.035, 0.028], 'earth')
    for (let x = p.x0; x <= p.x1 + 1; x++) box([x, y + 0.018, (p.z0 + p.z1 + 1) / 2], [0.025, 0.035, p.z1 - p.z0 + 1], 'earth')
    const cy = this.grid.y(crate.x, crate.z)
    // A striped cloth canopy over the existing shipping station.
    for (const side of [-1, 1]) box([crate.x + 0.5 + side * 1.15, cy + 1.15, crate.z - 0.3], [0.09, 2.3, 0.09], 'wood')
    for (let i = 0; i < 7; i++) {
      box([crate.x - 0.7 + i * 0.4, cy + 2.25, crate.z + 0.35], [0.4, 0.08, 1.7], i % 2 ? 'cream' : 'plum')
      box([crate.x - 0.7 + i * 0.4, cy + 2.13, crate.z + 1.16], [0.4, 0.22, 0.06], i % 2 ? 'cream' : 'plum')
    }
    for (const side of [-1, 1]) {
      const x = home.x + side * 2.25
      const z = home.z + 2.9
      box([x, y + 0.18, z], [0.7, 0.36, 0.45], 'earth')
      for (let n = 0; n < 3; n++) {
        box([x - 0.22 + n * 0.22, y + 0.48, z], [0.16, 0.37, 0.16], 'green')
        box([x - 0.22 + n * 0.22, y + 0.68, z], [0.22, 0.16, 0.2], n % 2 ? 'rose' : 'cream')
      }
    }
  }

  nearest(pos) {
    return this.people.reduce((best, p) => p.pos.distanceTo(pos) < 2.5 && (!best || p.pos.distanceTo(pos) < best.pos.distanceTo(pos)) ? p : best, null)
  }

  update(dt, player, camera, active) {
    this.labels.hidden = !active
    for (const p of this.people) {
      p.phase += dt * 0.35
      const nearby = p.pos.distanceTo(player) < 3.3
      const tx = nearby ? p.pos.x : p.home.x + Math.sin(p.phase) * 1.2
      const tz = nearby ? p.pos.z : p.home.z + Math.cos(p.phase) * 0.8
      const dx = tx - p.pos.x, dz = tz - p.pos.z
      const cx = Math.floor(tx), cz = Math.floor(tz)
      const walk = !nearby && this.grid.get('prop', cx, cz) === P.NONE && this.grid.canStand(cx, cz, this.grid.h(Math.floor(p.pos.x), Math.floor(p.pos.z)), 0)
      if (walk) {
        p.pos.x += dx * Math.min(1, dt * 1.2)
        p.pos.z += dz * Math.min(1, dt * 1.2)
        p.pos.y = this.grid.sampleY(p.pos.x, p.pos.z)
        p.rig.root.rotation.y = Math.atan2(dx, dz)
      } else if (nearby) p.rig.root.rotation.y = Math.atan2(player.x - p.pos.x, player.z - p.pos.z)
      p.rig.root.position.copy(p.pos)
      p.rig.anim.speed = walk ? Math.min(0.4, Math.hypot(dx, dz) * 1.2) : 0
      p.rig.update(dt)
      p.tag.node.classList.toggle('is-near', nearby)
    }
    for (const t of this.tags) {
      this.projected.copy(t.pos)
      this.projected.y += t.height
      this.projected.project(camera)
      const v = this.projected
      t.node.hidden = !active || t.pos.distanceTo(player) > 19 || v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.83
      if (!t.node.hidden) t.node.style.transform = `translate(-50%, -100%) translate(${(v.x + 1) * innerWidth / 2}px, ${(1 - v.y) * innerHeight / 2}px)`
    }
  }
}
