# Seismic Valley — developer notes

Vanilla Three.js + Vite. No React, no physics engine, no asset pipeline. Every
mesh, texture, glyph and sound is generated at runtime from code in `src/`.

## Key modules

- `core/palette.js` — **the one colourway**, and the day's lighting. Everything
  that decides a colour reads this. `skyAt(hour)` is the single authority for the
  sky, the fog, both lights and the water grade; splitting those across files is
  how a valley ends up lit at noon under a midnight sky.
- `core/mark.js` — the Seismic mark, solved rather than eyeballed: two circles
  through the same pair of horns. The arcs are FLATTENED to explicit points on
  purpose — an arc-direction flag is the easiest thing in this shape to get
  wrong, and getting it wrong does not fail, it just draws the wrong logo.
- `core/wordmark.js` — the game's own letterforms. Orthogonal contours on a
  140-unit cap height; `chamfer()` does all the styling. There is no font file
  anywhere in the project and no link to one.
- `core/kit.js` — the primitive vocabulary every solid thing is cut from. Read
  the header before adding a mesh anywhere.
- `world/mesher.js` — chunk meshing. Winding and vertex colour space are both
  load-bearing; the header says why.
- `actors/rocky.js` — the mascot, rebuilt from the reference sheet. The header
  records what the reference actually says, which is the spec.
- `game/state.js` — the whole game as data. Nothing in it knows three.js exists,
  which is what makes `tools/checks.js` able to drive a full day loop headless.
- `game/tremor.js` — the mechanic the game is about.

## House rules

- **One colourway.** Brown stone, cream paper, ink, and the rose mark. No second
  palette, no "just this one accent". `npm run check` parses `palette.js` and
  fails on any hue outside 352°–64° that is not the rose.
- **Nothing loads over the network at runtime.** No CDN font, no `.glb`, no
  remote texture, no audio file. `npm run check` greps for `fetch`,
  `XMLHttpRequest`, any three.js loader, any http URL and any binary asset.
- **The rig rule.** Three composes `T * R * S`, so scale lands before rotation.
  Slabs get a Z-axis prism (`FLAT`/`POINT`) and are never rotated; limbs get a
  Y-axis one (`COLUMN`/`TAPER`) and are never rotated. `npm run check` fails the
  build if a rig mesh in `src/actors` takes both.
- **`public/mark.svg` is generated**, not drawn. Run `npm run mark` after
  changing the mark's geometry; `npm run check` asserts the committed file still
  matches.
- **Saved data is namespaced `seismic-valley.*`.**
- Rocky's family is Seismic's own mascot. The chest mark and the rose shard are
  the brand; do not put either on anything that is not carrying it.

## Before finishing a change

```bash
npm run lint
```

```bash
npm run check
```

Then, if anything visual moved:

```bash
npm run shoot
```

`shoot` drives the real game through `?shot=<pose>` and fails non-zero on any
console error, so a broken build cannot pass as "looks fine". `--tag before`
writes `shots/before-*.png` for a side-by-side. The handful of captures the
README uses live in `docs/` and are committed; `shots/` is not.

## Deploying

Vercel builds it (`npm run build` → `dist/`). Nothing is committed pre-built.
