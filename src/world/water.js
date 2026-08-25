import * as THREE from 'three'
import { C } from '../core/palette.js'
import { LEVEL, N, WATER_LEVEL } from './grid.js'

/**
 * The river and the lake.
 *
 * One plane at the water level covering the whole map, and a shader that reads
 * the terrain's own height field out of a data texture to decide how deep it is
 * standing. That is what buys the shoreline: the plane fades out where the bed
 * comes up to meet it, so a beach is a gradient rather than a hard rectangle
 * edge cutting across the sand.
 *
 * The water in Seismic Valley is silt — warm, opaque, cream-crested. A blue
 * river would be the one cool object in a warm world and would pull the eye
 * straight off whatever the player was meant to be looking at.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D uBed;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  uniform float uSurface;
  uniform float uLight;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // The bed texture stores height in levels / 40, so one texel is one cell.
    float bed = texture2D(uBed, vUv).r * 40.0 * ${LEVEL.toFixed(3)};
    float depth = uSurface - bed;
    if (depth <= 0.02) discard;

    float d = clamp(depth / 2.6, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, d);

    // Two crossing wave sets, deliberately at odd frequencies so the pattern
    // never lines up into a visible tiling period.
    float w = sin(vWorld.x * 1.7 + uTime * 1.15) * 0.5 + sin(vWorld.z * 2.3 - uTime * 0.86) * 0.5;
    col += w * 0.035;

    // Foam where the bed nearly breaks the surface. Kept to a narrow strip and a
    // banded crest: a wide soft shore term does not read as foam, it reads as
    // the water having been left out in the sun.
    float shore = 1.0 - smoothstep(0.0, 0.3, depth);
    float band = smoothstep(0.45, 0.85, fract(depth * 4.5 - uTime * 0.3 + w * 0.1));
    col = mix(col, uFoam, shore * (0.2 + band * 0.4));

    col *= uLight;

    float alpha = mix(0.55, 0.93, clamp(depth / 1.1, 0.0, 1.0));
    float fog = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, alpha);
  }
`

export class Water {
  constructor(grid) {
    this.grid = grid
    this.surface = WATER_LEVEL * LEVEL + LEVEL * 0.5

    // The bed, as a one-channel texture. Rebuilt only when the terrain under the
    // water actually changes, which in practice is once per tremor.
    this.data = new Uint8Array(N * N)
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RedFormat, THREE.UnsignedByteType)
    this.tex.minFilter = THREE.LinearFilter
    this.tex.magFilter = THREE.LinearFilter
    this.tex.needsUpdate = true
    this.refresh()

    this.uniforms = {
      uBed: { value: this.tex },
      uDeep: { value: new THREE.Color().setStyle(C.waterDeep, THREE.SRGBColorSpace) },
      uShallow: { value: new THREE.Color().setStyle(C.waterShallow, THREE.SRGBColorSpace) },
      uFoam: { value: new THREE.Color().setStyle(C.waterFoam, THREE.SRGBColorSpace) },
      uFogColor: { value: new THREE.Color('#cfc6dc') },
      uFogNear: { value: 34 },
      uFogFar: { value: 128 },
      uTime: { value: 0 },
      uSurface: { value: this.surface },
      uLight: { value: 1 },
    }

    const geo = new THREE.PlaneGeometry(N, N, 1, 1)
    geo.rotateX(-Math.PI / 2)
    geo.translate(N / 2, this.surface, N / 2)
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.mesh.name = 'water'
    this.mesh.renderOrder = 4
  }

  /** Re-upload the bed. Cheap (9 KB) but not free, so it is called on a tremor
   *  and on load, never per frame. */
  refresh() {
    for (let i = 0; i < N * N; i++) this.data[i] = Math.min(255, Math.max(0, this.grid.height[i]) * 6.375)
    this.tex.needsUpdate = true
  }

  update(dt, sky) {
    this.uniforms.uTime.value += dt
    this.uniforms.uLight.value = 0.42 + sky.day * 0.72
    this.uniforms.uFogColor.value.setStyle(sky.fog, THREE.SRGBColorSpace)
    this.uniforms.uFogNear.value = sky.fogNear
    this.uniforms.uFogFar.value = sky.fogFar
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.tex.dispose()
  }
}
