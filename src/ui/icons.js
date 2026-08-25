import { markPath2D, shardPath2D } from '../core/mark.js'
import { C, shade, UI } from '../core/palette.js'
import { GLYPH, item } from '../game/items.js'

/**
 * Item icons, drawn.
 *
 * Twenty-odd little pictures, none of which is a file. Each glyph is a function
 * that strokes and fills a 100x100 box; the item's tint is passed in, so one
 * `ROOT` drawing serves cinderroot and ashroot and they are still told apart
 * instantly by colour.
 *
 * Results are cached by `id` as data URLs, because a hotbar that redraws eight
 * canvases every time the player picks a flower is a hotbar that stutters.
 */

const S = 100
const cache = new Map()

const ink = (ctx, w = 5) => {
  ctx.strokeStyle = UI.ink
  ctx.lineWidth = w
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}
const fill = (ctx, path, colour, outline = true) => {
  ctx.fillStyle = colour
  ctx.fill(path)
  if (outline) ctx.stroke(path)
}
const poly = (pts) => {
  const p = new Path2D()
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}
const round = (x, y, r) => {
  const p = new Path2D()
  p.arc(x, y, r, 0, Math.PI * 2)
  return p
}

/** Every glyph. Signature is (ctx, tint, dark). */
const DRAW = {
  [GLYPH.HOE]: (ctx, t, d) => {
    fill(ctx, poly([[62, 12], [72, 22], [34, 82], [24, 72]]), C.trunk)
    fill(ctx, poly([[18, 62], [42, 62], [42, 78], [26, 90], [12, 78]]), t)
  },
  [GLYPH.CAN]: (ctx, t, d) => {
    fill(ctx, poly([[24, 38], [64, 38], [70, 84], [18, 84]]), t)
    fill(ctx, poly([[64, 46], [92, 26], [96, 34], [70, 56]]), d)
    fill(ctx, poly([[30, 38], [30, 22], [56, 22], [56, 38]]), d)
  },
  [GLYPH.AXE]: (ctx, t, d) => {
    fill(ctx, poly([[46, 14], [56, 14], [56, 88], [46, 88]]), C.trunk)
    fill(ctx, poly([[56, 18], [86, 26], [88, 50], [56, 54]]), t)
  },
  [GLYPH.PICK]: (ctx, t, d) => {
    fill(ctx, poly([[46, 22], [56, 22], [56, 90], [46, 90]]), C.trunk)
    fill(ctx, poly([[10, 34], [50, 18], [92, 34], [50, 32]]), t)
  },
  [GLYPH.SCYTHE]: (ctx, t, d) => {
    fill(ctx, poly([[38, 88], [46, 12], [56, 12], [50, 88]]), C.trunk)
    fill(ctx, poly([[50, 16], [88, 30], [80, 52], [52, 34]]), t)
  },
  [GLYPH.LOG]: (ctx, t, d) => {
    fill(ctx, poly([[14, 34], [86, 34], [86, 70], [14, 70]]), t)
    fill(ctx, round(20, 52, 18), d)
    fill(ctx, round(20, 52, 8), shade(t, 1.4), false)
  },
  [GLYPH.ROCK]: (ctx, t, d) => {
    fill(ctx, poly([[16, 74], [26, 40], [52, 26], [80, 44], [84, 72]]), t)
    fill(ctx, poly([[26, 40], [52, 26], [58, 50], [34, 58]]), shade(t, 0.5), false)
  },
  [GLYPH.BLOCK]: (ctx, t, d) => {
    fill(ctx, poly([[18, 36], [50, 20], [82, 36], [82, 68], [50, 84], [18, 68]]), t)
    fill(ctx, poly([[50, 40], [82, 36], [82, 68], [50, 84]]), d, false)
  },
  [GLYPH.FIBRE]: (ctx, t, d) => {
    ink(ctx, 8)
    ctx.strokeStyle = t
    for (const x of [30, 50, 70]) {
      ctx.beginPath()
      ctx.moveTo(x, 84)
      ctx.quadraticCurveTo(x + (x - 50) * 0.6, 46, x + (x - 50) * 1.2, 16)
      ctx.stroke()
    }
  },
  [GLYPH.DROP]: (ctx, t, d) => {
    const p = new Path2D()
    p.moveTo(50, 14)
    p.bezierCurveTo(76, 46, 84, 58, 84, 66)
    p.arc(50, 66, 34, 0, Math.PI)
    p.bezierCurveTo(16, 58, 24, 46, 50, 14)
    fill(ctx, p, t)
  },
  [GLYPH.SHARD]: (ctx, t) => {
    ctx.save()
    ctx.translate(50, 50)
    fill(ctx, shardPath2D(96), t)
    ctx.restore()
  },
  [GLYPH.GEODE]: (ctx, t, d) => {
    fill(ctx, poly([[16, 72], [22, 40], [50, 24], [80, 42], [84, 74]]), t)
    ctx.save()
    ctx.translate(50, 56)
    fill(ctx, shardPath2D(40), UI.rose)
    ctx.restore()
  },
  [GLYPH.POUCH]: (ctx, t, d) => {
    fill(ctx, poly([[26, 40], [74, 40], [84, 84], [16, 84]]), t)
    fill(ctx, poly([[34, 24], [66, 24], [74, 42], [26, 42]]), d)
  },
  [GLYPH.LEAF]: (ctx, t, d) => {
    const p = new Path2D()
    p.moveTo(20, 82)
    p.quadraticCurveTo(22, 24, 82, 20)
    p.quadraticCurveTo(80, 78, 20, 82)
    fill(ctx, p, t)
    ink(ctx, 4)
    ctx.beginPath()
    ctx.moveTo(24, 80)
    ctx.quadraticCurveTo(50, 56, 78, 24)
    ctx.stroke()
  },
  [GLYPH.BERRY]: (ctx, t, d) => {
    fill(ctx, round(38, 60, 22), t)
    fill(ctx, round(66, 52, 18), d)
    fill(ctx, poly([[40, 34], [56, 22], [62, 32], [46, 42]]), C.shrub)
  },
  [GLYPH.ROOT]: (ctx, t, d) => {
    const p = new Path2D()
    p.moveTo(50, 92)
    p.bezierCurveTo(20, 70, 24, 34, 50, 30)
    p.bezierCurveTo(76, 34, 80, 70, 50, 92)
    fill(ctx, p, t)
    ink(ctx, 5)
    ctx.strokeStyle = C.shrub
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath()
      ctx.moveTo(50, 32)
      ctx.lineTo(50 + Math.sin(a) * 30, 8)
      ctx.stroke()
    }
  },
  [GLYPH.GRAIN]: (ctx, t, d) => {
    ink(ctx, 5)
    ctx.strokeStyle = C.shrub
    ctx.beginPath()
    ctx.moveTo(50, 92)
    ctx.lineTo(50, 30)
    ctx.stroke()
    for (let i = 0; i < 4; i++) {
      const y = 26 + i * 15
      fill(ctx, poly([[50, y], [72, y + 6], [50, y + 16]]), t)
      fill(ctx, poly([[50, y], [28, y + 6], [50, y + 16]]), d)
    }
  },
  [GLYPH.BULB]: (ctx, t, d) => {
    fill(ctx, poly([[50, 26], [76, 60], [64, 88], [36, 88], [24, 60]]), t)
    ink(ctx, 5)
    ctx.strokeStyle = C.shrub
    ctx.beginPath()
    ctx.moveTo(50, 28)
    ctx.lineTo(50, 6)
    ctx.stroke()
  },
  [GLYPH.CAP]: (ctx, t, d) => {
    fill(ctx, poly([[36, 56], [64, 56], [60, 88], [40, 88]]), UI.creamShade)
    const p = new Path2D()
    p.moveTo(14, 56)
    p.quadraticCurveTo(50, 8, 86, 56)
    p.closePath()
    fill(ctx, p, t)
  },
  [GLYPH.MELON]: (ctx, t, d) => {
    fill(ctx, round(50, 56, 34), t)
    ink(ctx, 4)
    for (const dx of [-16, 0, 16]) {
      ctx.beginPath()
      ctx.ellipse(50, 56, Math.abs(dx) || 4, 34, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    fill(ctx, poly([[46, 22], [58, 12], [64, 22], [52, 30]]), C.shrub)
  },
  [GLYPH.SPROUT]: (ctx, t, d) => {
    ink(ctx, 6)
    ctx.strokeStyle = C.shrubDeep
    ctx.beginPath()
    ctx.moveTo(50, 90)
    ctx.lineTo(50, 44)
    ctx.stroke()
    const leaf = (dir) => {
      const p = new Path2D()
      p.moveTo(50, 52)
      p.quadraticCurveTo(50 + dir * 34, 22, 50 + dir * 8, 20)
      p.quadraticCurveTo(50 + dir * 6, 40, 50, 52)
      return p
    }
    fill(ctx, leaf(1), t)
    fill(ctx, leaf(-1), d)
  },
  [GLYPH.TAG]: (ctx, t, d) => {
    // A fired-clay marker: a rounded rectangle with a hole punched at the top
    // and three scratched lines. Marit's handwriting was famously unreadable.
    fill(ctx, poly([[26, 14], [74, 14], [74, 82], [50, 92], [26, 82]]), t)
    fill(ctx, round(50, 28, 7), d, false)
    ink(ctx, 4)
    ctx.strokeStyle = d
    for (const y of [46, 58, 70]) {
      ctx.beginPath()
      ctx.moveTo(34, y)
      ctx.lineTo(66, y)
      ctx.stroke()
    }
  },
  [GLYPH.CHIP]: (ctx, t, d) => {
    fill(ctx, poly([[22, 26], [78, 26], [78, 74], [22, 74]]), t)
    fill(ctx, poly([[34, 38], [66, 38], [66, 62], [34, 62]]), d, false)
    ink(ctx, 4)
    ctx.strokeStyle = t
    for (const y of [36, 50, 64]) {
      for (const x of [22, 78]) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (x < 50 ? -12 : 12), y)
        ctx.stroke()
      }
    }
  },
  [GLYPH.COIN]: (ctx, t, d) => {
    fill(ctx, round(50, 52, 34), t)
    ctx.save()
    ctx.translate(50, 52)
    fill(ctx, markPath2D(52), d, false)
    ctx.restore()
  },
}

/** A data URL for an item's icon, cached. */
export function iconFor(id) {
  if (cache.has(id)) return cache.get(id)
  const it = item(id)
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  ink(ctx)
  const draw = DRAW[it.glyph] ?? DRAW[GLYPH.ROCK]
  draw(ctx, it.tint, shade(it.tint, 0.75))
  const url = cv.toDataURL()
  cache.set(id, url)
  return url
}

/** An `<img>` ready to drop into a slot. */
export function iconImg(id, cls = 'icon') {
  const img = document.createElement('img')
  img.className = cls
  img.src = iconFor(id)
  img.alt = item(id).name
  img.draggable = false
  return img
}

/** The coin glyph on its own, for the purse. */
export function coinIcon() {
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  ink(ctx)
  DRAW[GLYPH.COIN](ctx, UI.creamDeep, UI.stoneDeep)
  return cv.toDataURL()
}
