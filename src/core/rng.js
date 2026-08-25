/**
 * Determinism, in one file.
 *
 * Every random number in Seismic Valley comes from a seed the player can read
 * off the title card, because a farming game whose valley cannot be reproduced
 * is a farming game whose bugs cannot be reproduced either. Nothing here calls
 * Math.random — the only place that does is the seed picker itself.
 */

/** mulberry32: 32 bits of state, good enough for terrain, cheap enough for a
 *  per-frame particle. Returns a function, not a class, so a system can hold its
 *  own stream and stay independent of draw order. */
export function rng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A stable integer hash of a string, for turning a name into a seed. */
export function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
export const randRange = (r, lo, hi) => lo + r() * (hi - lo)
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length]
export const chance = (r, p) => r() < p

/** Shuffle in place, Fisher-Yates, off a seeded stream. */
export function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ------------------------------------------------------------------ noise --

const smooth = (t) => t * t * (3 - 2 * t)

/**
 * Seeded 2D value noise. Value rather than gradient noise on purpose: the
 * terrain is quantised to half-unit levels anyway, so Perlin's extra smoothness
 * is thrown away by the quantiser, and value noise is a third of the cost.
 * Range is 0..1.
 */
export function noise2(seed) {
  const s = seed >>> 0
  const at = (ix, iy) => {
    let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ s) >>> 0
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = smooth(x - ix), fy = smooth(y - iy)
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
  }
}

/** Octaves of `noise2`, normalised back to 0..1. */
export function fbm(seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  const layers = Array.from({ length: octaves }, (_, i) => noise2(seed + i * 7919))
  return (x, y) => {
    let sum = 0, amp = 1, freq = 1, norm = 0
    for (let i = 0; i < octaves; i++) {
      sum += layers[i](x * freq, y * freq) * amp
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

/** Ridged noise — the fold that gives a valley wall its crease. */
export function ridged(seed, octaves = 4) {
  const base = fbm(seed, octaves)
  return (x, y) => 1 - Math.abs(base(x, y) * 2 - 1)
}

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v) => clamp(v, 0, 1)
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1))
  return t * t * (3 - 2 * t)
}
/** Frame-rate independent approach. Never write `a += (b - a) * 0.1` in a loop
 *  that can run at 30 or 144 Hz; the two run at visibly different speeds. */
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
