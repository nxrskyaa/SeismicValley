import * as THREE from 'three'
import { N } from './grid.js'
import { cropAt, isRipe } from '../game/crops.js'

export class FarmFeedback {
  constructor(scene, state) {
    this.state = state
    this.group = new THREE.Group()
    scene.add(this.group)
    const points = [[-.48, 0, -.48], [.48, 0, -.48], [.48, 0, .48], [-.48, 0, .48]].map(p => new THREE.Vector3(...p))
    this.cursor = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#fff0c9', depthTest: false }))
    this.cursor.renderOrder = 8
    this.group.add(this.cursor)
    const geo = new THREE.CircleGeometry(.065, 6)
    geo.rotateX(-Math.PI / 2)
    this.wet = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#87cce0' }), N * N)
    this.ripe = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.09), new THREE.MeshBasicMaterial({ color: '#ffe5a2' }), N * N)
    this.group.add(this.wet, this.ripe)
    this.tmp = new THREE.Object3D()
    this.sparks = []
    const sg = new THREE.BoxGeometry(.05, .05, .05)
    const sm = new THREE.MeshBasicMaterial({ color: '#efd6a3', transparent: true })
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(sg, sm)
      mesh.visible = false
      this.group.add(mesh)
      this.sparks.push(mesh)
    }
    this.life = 0
    this.dirty = true
    for (const event of ['crops', 'day', 'bag']) state.on(event, () => { this.dirty = true })
    state.on('farm-action', ({ x, z, kind }) => {
      this.dirty = true
      this.life = 1
      sm.color.set(kind === 'water' ? '#94d8e3' : kind === 'harvest' ? '#ffdb83' : '#b99c75')
      this.origin = new THREE.Vector3(x + .5, state.grid.y(x, z) + .1, z + .5)
    })
  }

  refresh() {
    const g = this.state.grid
    let wet = 0, ripe = 0
    for (let i = 0; i < g.crop.length; i++) {
      if (!g.tilled[i]) continue
      const x = i % N, z = Math.floor(i / N)
      const crop = cropAt(g.crop[i])
      if (g.wet[i]) {
        this.tmp.position.set(x + .83, g.y(x, z) + .035, z + .8)
        this.tmp.updateMatrix()
        this.wet.setMatrixAt(wet++, this.tmp.matrix)
      }
      if (crop && isRipe(crop.id, g.grown[i])) {
        this.tmp.position.set(x + .5, g.y(x, z) + .9, z + .5)
        this.tmp.updateMatrix()
        this.ripe.setMatrixAt(ripe++, this.tmp.matrix)
      }
    }
    this.wet.count = wet
    this.ripe.count = ripe
    this.wet.instanceMatrix.needsUpdate = this.ripe.instanceMatrix.needsUpdate = true
    this.wet.computeBoundingSphere()
    this.ripe.computeBoundingSphere()
    this.dirty = false
  }

  update(dt, target, active) {
    if (this.dirty) this.refresh()
    const [x, z] = target, g = this.state.grid
    const c = cropAt(g.get('crop', x, z))
    this.cursor.visible = active && !!g.get('plot', x, z)
    this.cursor.position.set(x + .5, g.y(x, z) + .045, z + .5)
    this.cursor.material.color.set(c && isRipe(c.id, g.get('grown', x, z)) ? '#ffdd78' : this.state.held === 'can' ? '#9ce0e8' : '#fff5d8')
    this.life = Math.max(0, this.life - dt * 1.7)
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i]
      p.visible = this.life > 0
      if (!p.visible) continue
      const t = 1 - this.life, a = i * 2.39996
      p.position.copy(this.origin).add(new THREE.Vector3(Math.cos(a) * t * .8, Math.sin(t * Math.PI) * (.4 + i % 3 * .1), Math.sin(a) * t * .8))
      p.scale.setScalar(this.life)
    }
  }
}
