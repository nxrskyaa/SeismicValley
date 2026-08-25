import * as THREE from 'three'
import { skyAt, sunDirAt } from '../core/palette.js'
import { N } from './grid.js'

/**
 * Sky, sun, and the grade.
 *
 * One object owns the dome, both lights, the stars and the fog, and all four are
 * driven from the single `skyAt(hour)` table. That is the point: a sky system
 * split across four files is a sky system that will eventually light the valley
 * at noon under a midnight dome, and nobody will be able to say which of the
 * four was wrong.
 */

const DOME = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    // Kill translation so the dome is pinned to the camera and can never be
    // walked out of, and force w=z so it draws at the far plane behind
    // everything without needing depth writes off AND a render order.
    vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`

const DOME_FRAG = /* glsl */ `
  uniform vec3 uHigh;
  uniform vec3 uLow;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uDay;
  varying vec3 vDir;
  void main() {
    float t = clamp(vDir.y * 1.35 + 0.18, 0.0, 1.0);
    vec3 col = mix(uLow, uHigh, pow(t, 0.85));
    // The glow around the sun. Wide and weak: a tight hot disc in a cel-shaded
    // valley reads as a bug in the sky texture.
    float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
    col += uSun * pow(d, 5.0) * 0.42 * uDay;
    col += uSun * pow(d, 42.0) * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class Sky {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()

    this.uniforms = {
      uHigh: { value: new THREE.Color('#c7c6e2') },
      uLow: { value: new THREE.Color('#e9e2ea') },
      uSun: { value: new THREE.Color('#ffe6c8') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.4) },
      uDay: { value: 1 },
    }
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: DOME,
        fragmentShader: DOME_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    )
    this.dome.frustumCulled = false
    this.dome.renderOrder = -1000
    this.group.add(this.dome)

    // Stars, as one Points cloud on the upper hemisphere only. Drawing the lower
    // half is 800 vertices spent under the ground.
    const count = 420
    const pts = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2
      const v = Math.random() * 0.86 + 0.08
      const r = Math.sqrt(1 - v * v)
      pts[i * 3] = Math.cos(u) * r
      pts[i * 3 + 1] = v
      pts[i * 3 + 2] = Math.sin(u) * r
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    this.starMat = new THREE.PointsMaterial({
      color: '#e9e4ef', size: 0.006, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false,
    })
    this.stars = new THREE.Points(starGeo, this.starMat)
    this.stars.frustumCulled = false
    this.stars.renderOrder = -999
    this.group.add(this.stars)

    // --- lights -----------------------------------------------------------
    this.key = new THREE.DirectionalLight('#ffe6c8', 1.6)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    // The shadow camera follows the player rather than covering the map. The
    // size is a real trade and it is easy to get wrong in the tight direction:
    // anything OUTSIDE the frustum samples the shadow map's border texel and
    // comes back shadowed, so a frustum sized to the player's immediate
    // surroundings paints the entire far half of the valley black. 46 covers
    // everything inside the fog and still leaves 22 shadow texels per world
    // unit at 2048.
    const s = 46
    this.key.shadow.camera.left = -s
    this.key.shadow.camera.right = s
    this.key.shadow.camera.top = s
    this.key.shadow.camera.bottom = -s
    this.key.shadow.camera.near = 1
    this.key.shadow.camera.far = 130
    this.key.shadow.bias = -0.0012
    this.key.shadow.normalBias = 0.035
    this.key.target.position.set(0, 0, 0)
    scene.add(this.key, this.key.target)

    this.hemi = new THREE.HemisphereLight('#e9e2ea', '#8e5e4c', 0.7)
    scene.add(this.hemi)

    scene.fog = new THREE.Fog('#cfc6dc', 34, 128)
    scene.add(this.group)

    this._sun = new THREE.Vector3()
    this._focus = new THREE.Vector3()
    this._span = 0
    this.setSpan(30)
  }

  /**
   * Size the shadow frustum to what the camera can actually see.
   *
   * This is the single easiest thing to get wrong in the tight direction:
   * anything OUTSIDE the frustum samples the shadow map's border texel and
   * comes back FULLY SHADOWED. At a wide zoom that paints the entire valley
   * solid black — which does not look like a shadow bug, it looks like the
   * lights are off, and there is no error anywhere.
   */
  setSpan(span) {
    const s = Math.max(26, span)
    if (Math.abs(s - this._span) < 0.5) return
    this._span = s
    const cam = this.key.shadow.camera
    cam.left = -s
    cam.right = s
    cam.top = s
    cam.bottom = -s
    cam.far = s * 3 + 90
    cam.updateProjectionMatrix()
  }

  /** Called every frame with the clock's hour and the point the camera is
   *  looking at, so the shadow frustum tracks the player instead of the origin. */
  update(hour, focus) {
    const s = skyAt(hour)
    const [dx, dy, dz] = sunDirAt(hour)
    this._sun.set(dx, dy, dz).normalize()

    this.uniforms.uHigh.value.setStyle(s.high, THREE.SRGBColorSpace)
    this.uniforms.uLow.value.setStyle(s.low, THREE.SRGBColorSpace)
    this.uniforms.uSun.value.setStyle(s.key, THREE.SRGBColorSpace)
    this.uniforms.uSunDir.value.copy(this._sun)
    this.uniforms.uDay.value = s.day

    this.starMat.opacity = s.starAlpha * 0.85

    this.key.color.setStyle(s.key, THREE.SRGBColorSpace)
    this.key.intensity = s.keyEnergy
    // `ambient` is a COLOUR and `ambientEnergy` is the number. Assigning the
    // colour to `intensity` sets it to NaN, every light goes dark, and the frame
    // comes out solid black with no error anywhere.
    this.hemi.intensity = s.ambientEnergy
    this.hemi.color.setStyle(s.ambient, THREE.SRGBColorSpace)
    this.hemi.groundColor.setStyle(s.fog, THREE.SRGBColorSpace)

    this._focus.copy(focus)
    this.key.target.position.copy(this._focus)
    this.key.position.copy(this._focus).addScaledVector(this._sun, this._span + 24)

    this.scene.fog.color.setStyle(s.fog, THREE.SRGBColorSpace)
    this.scene.fog.near = s.fogNear
    this.scene.fog.far = s.fogFar
    return s
  }

  /** Where the dome should sit. Called by the camera rig each frame. */
  follow(camera) {
    this.group.position.copy(camera.position)
    this.group.scale.setScalar(Math.max(N, 200))
  }
}
