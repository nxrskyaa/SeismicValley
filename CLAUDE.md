# Seismic Valley — developer notes

Vanilla Three.js + Vite. No React, no physics engine, no asset pipeline. Every
mesh, texture, glyph and sound is generated at runtime from code in `src/`.

This is a Three.js rebuild of **Velion** (`D:\major plan\Velion`, Godot 4). The
setting, palette, camera and Pruning mechanic are Velion's and were ported
deliberately. `Velion/docs/STORY.md` is the story bible and is still the
authority on anything narrative.

## The five rules that keep breaking

Each of these was broken at least once and each is now an assertion in
`tools/checks.js`. Read this list before changing anything that touches look or
feel.

1. **Two palettes.** `core/palette.js` exports `C` + `GROUND` (the world —
   Velion's washed lavender) and `UI` (the interface — Seismic's brown and
   cream). They are not interchangeable. Applying the brand colourway to the
   world is how the valley turned into sepia mud; the check asserts the UI block
   stays in Seismic's hue band **and** that the world block keeps its cool hues.
2. **The camera is orthographic**, pitch −37°, yaws 45/135/225/315, size 17.5
   (11–26). Perspective makes the terraces read as generic low-poly. The check
   greps for `PerspectiveCamera` in main and fails on it.
3. **You are alone.** One human look in `actors/player.js`. No villagers, no
   market, no quest-giver — the survivors are scattered and do not know about
   each other. The check counts the entries in `LOOKS`.
4. **Nothing loads over the network at runtime.** No CDN font, no `.glb`, no
   remote texture, no audio file.
5. **The rig rule.** Three composes `T * R * S`, so scale lands before rotation.
   Slabs get a Z-axis prism (`FLAT`/`POINT`) and are never rotated; limbs get a
   Y-axis one (`COLUMN`/`TAPER`) and are never rotated.

## Key modules

- `core/palette.js` — both palettes, and `skyAt(hour)`: a ten-key-frame 24-hour
  grade ported from Velion. Key-framed and **not** computed — a cosine curve
  gives a sky that is technically correct and reads as a lamp on a dimmer.
- `core/mark.js` — the Seismic mark, solved rather than eyeballed: two circles
  through the same pair of horns. The arcs are flattened to explicit points on
  purpose; an arc-direction flag is the easiest thing here to get wrong, and
  getting it wrong does not fail, it draws the wrong logo.
- `core/wordmark.js` — the game's own letterforms. No font file anywhere.
- `core/kit.js` — the primitive vocabulary. Read its header before adding a mesh.
- `world/camera.js` — the orthographic rig. Its header says why every number is
  what it is.
- `world/mesher.js` — chunk meshing. Winding and vertex colour space are both
  load-bearing.
- `actors/rocky.js` — the construct, rebuilt from the reference sheet. The header
  records what the reference actually says, which is the spec.
- `game/state.js` — the whole game as data; knows nothing about three.js, which
  is what lets `checks.js` drive a full day headless.
- `game/pruning.js` — the mechanic. **Not** an earthquake: it takes apart
  unregistered structures and never touches the height grid.
- `game/story.js` — soil-tags and logs, plus the delivery rules.

## Story delivery rules

From the bible, and they are not suggestions:

1. Never more than four lines on screen at once.
2. Found, not given — no quest-giver explains the setting.
3. Out of order, always — logs are numbered and shuffled.
4. The mundane before the cosmic — the first six tags are about drainage.
5. Nobody monologues.

## House rules

- **`public/mark.svg` is generated**, not drawn. `npm run mark` after changing
  the mark; the check asserts the committed file still matches.
- Saved data is namespaced `seismic-valley.*`.
- The mark and the rose shard are Seismic's. Do not put either on anything that
  is not carrying the brand.

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
console error. `--tag before` writes `shots/before-*.png` for a side-by-side.
The captures the README uses live in `docs/` and are committed; `shots/` is not.

## Deploying

Vercel builds it (`npm run build` → `dist/`) and is Git-linked, so a push to
`main` deploys. Nothing is committed pre-built.
