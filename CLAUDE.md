# Seismic Valley — developer notes

Vanilla Three.js + Vite. No React, no physics engine, no asset pipeline. Every
mesh, texture, glyph and sound is generated at runtime from code in `src/`.

This is a Three.js rebuild of **Velion** (`D:\major plan\Velion`, Godot 4). The
setting, palette, camera and Pruning mechanic are Velion's and were ported
deliberately. `Velion/docs/STORY.md` is the story bible and is still the
authority on anything narrative.

## The six rules that keep breaking

Each of these was broken at least once and each is now an assertion in
`tools/checks.js`. Read this list before changing anything that touches look or
feel.

1. **Two palettes.** `core/palette.js` exports `C` + `GROUND` (the world —
   Velion's washed lavender) and `UI` (the interface — Seismic's brown and
   cream). They are not interchangeable. Applying the brand colourway to the
   world is how the valley turned into sepia mud; the check asserts the UI block
   stays in Seismic's hue band **and** that the world block keeps its cool hues.
2. **The camera is orthographic**, pitch −37°, yaws 45/135/225/315, size **13**
   (9–22), measured off the reference. Perspective makes the terraces read as
   generic low-poly.
3. **`LEVEL` is 1.0 and `shadowMap.enabled` is false.** A step is a wall, not a
   kerb, and the reference has no HARD directional shadows. It was written here
   as "no cast shadows anywhere in it", and that reading was too strong — it cost
   the game every shadow it had. Sampled off the footage, ground pixels fall into
   two modes, lit at 188 and shaded at 164: a **0.87 multiplier**, feathered over
   several cells, under every canopy. So the shadow map stays off and the
   occlusion is real — baked into the terrain's vertex colours for anything that
   stands still (`world/occlusion.js`), one quad for the five things that move.
4. **You are alone.** One human look in `actors/player.js`. No villagers, no
   market, no quest-giver — the survivors are scattered and do not know about
   each other. The check counts the entries in `LOOKS`.
5. **Nothing loads over the network at runtime.** No CDN font, no `.glb`, no
   remote texture, no audio file.
6. **The rig rule.** Three composes `T * R * S`, so scale lands before rotation.
   Slabs get a Z-axis prism (`FLAT`/`POINT`) and are never rotated; limbs get a
   Y-axis one (`COLUMN`/`TAPER`) and are never rotated.

## Geometry is measured, not eyeballed

`chamferBox(w, h, d)` spent most of this project returning a box that was
**(w + 2c) x (h + 2c) x d** — `bevelSize` grows an extruded outline OUTWARD, and
the depth was the only axis compensated. `BLOCK`, the unit cube every rig is
plated with, was therefore 1.32 x 1.32 x 1.00. Every part in the game was 32%
too wide and too tall and the right depth, and thin plates had it far worse: a
seam declared 0.065 came back 0.117.

It survived so long because it is **not a uniform scale**. A uniform error would
have cancelled out of every proportion; this one did not, so figures read as
bloated side-on and flat front-on however carefully their bands were measured off
the reference — and the measuring was never the problem. Two consequences to
remember:

- **Numbers at a call site are now real.** If a part is the wrong size, the
  number is wrong; do not add a fudge factor.
- **Anything tuned by eye before the fix was tuned against the inflation.** The
  tree canopy is the example: its cubes were spaced to overlap by 14% of a cube
  and dropped to 6%, so a canopy that had read as one slab came apart into a
  pile of boxes. `props.js` now spaces it 0.86 both ways.

Three tools measure what a screenshot cannot. `npm run verify` runs all of them.

- `tools/overlap.mjs rig` — does a limb pass through the body? An arm is allowed
  to sit AGAINST a torso; it is not allowed to be buried in one.
- `tools/overlap.mjs seams` — has an assembly come apart? The opposite failure,
  and it reports how far each adrift piece is from the main mass, because a
  hairline between two plates meant to butt up is a different defect from a head
  floating above a neck.
- `tools/overlap.mjs buildings` — do two structures share ground? Layout lives in
  `world/settlement.js`, where a building CLAIMS a rectangle and an intersecting
  claim is refused, so a street is correct by construction.
- `tools/proportion.mjs` — is the construct built to the bands scanned off the
  reference sheet? Feet at 0, crown at 1, five bands, and it is the spec.

**Prove a new check fails on the broken code before keeping it.** Every one of
these was written against a defect that was live, watched to fail with a real
number, and only then fixed. An assertion that encodes a mistake is worse than
no assertion, because it makes the mistake load-bearing — which is how the mark
stayed wrong for months behind two checks that required the wrong shape.

## The visual target is the reference video

`C:\Users\xywal\Downloads\sssx.io_1787567672903.mp4` — the footage the user gave
for Velion and still judges against. Velion's own `Palette.gd` is close but not
the same thing. Sample it, do not remember it:

```bash
ffmpeg -ss 20 -i <mp4> -frames:v 1 frame.png
```

What it shows: sand tops over pale grey-lilac walls with a sage lip and a rust
band under it; thin plum trunks under flat cube-cluster canopies; tiny pale
pebble specks, not grass tufts; deep blue-violet water; flat per-face shading
with no cast shadows at all.

**Sample it numerically, do not judge it by eye.** Quantised, the footage's open
ground sits at `#c8c0a9` — R:G:B of 1 : 0.96 : 0.85. That is much less yellow
than it looks, because most of the warmth in the frame is the sun and not the
field. Reading the sage as the ground colour is how the meadow once ended up
dark olive; reading the sun's warmth as the ground colour is how it once ended
up orange sand. `Image.quantize` on a reference frame and on a capture, then
compare the two ratios, settles it in one step.

## The other reference is Velion itself

`D:\major plan\Velion` is the Godot build, and the user judges against it. Three
things were ported back out of it after a long drift:

- **`Palette.gd`'s ground table**, verbatim — four colours per material: top,
  sage accent, rust band, body.
- **The per-face tints** in `VoxelMesh.gd`: top 1.0, across X 0.93, across Z
  0.855. The ASYMMETRY between the two wall directions is the point — at a
  45-degree camera you see both at once, and with one shared tint they merge and
  the terraces stop reading as steps.
- **`SUN_SCALE` 0.72 and `AMBIENT_SCALE` 0.56.** The ratio between them is the
  modelling of the whole world. This project had drifted to a fill almost as
  strong as the key, which flattens every terrace face onto the value of the top
  above it. The palette looked like the problem and it was not; the ratio was.
- **Wrapped Lambert at 0.42** (`applyWrappedLight` in `core/kit.js`), so a face
  turned away from the sun is still a face rather than one dark mass.

## The systems added after the rebuild

- `world/weather.js` — one wind field, read by everything. The sway on every
  prop is a vertex shader patched in with `applyWindSway`, not an animation; the
  drift in the air is seasonal. Anything new that stands in the valley should be
  patched too, and the patch is idempotent by design.
- `world/fish.js` + `game/fishing.js` — the lake. The school is stocked pool by
  pool after a flood fill, so a small pond is worth standing at. The whole
  fishing state machine is driven headless in `checks.js`; if you change it,
  that test is the one that will tell you.
- `core/music.js` — a generative score. The hour picks mode, register and tempo
  and the mode swaps on a phrase boundary. Notes are booked into
  `AudioContext.currentTime`, never scheduled from a rAF callback.
- `game/appearance.js` — colour choices, not a wardrobe. There is still exactly
  one human look and rule 4 still holds.
- `game/tutorial.js` — polls `state.stats`, a tally of things you have done. If
  you add a step, `checks.js` asserts its named hotbar key is the slot the tool
  is really in.
- `actors/jobs.js` — what a pebble does all day. `checks.js` asserts every job
  has somewhere in a generated valley to be done, which is what caught the
  missing-rock bug.

## Key modules

- `core/palette.js` — both palettes, and `skyAt(hour)`: a ten-key-frame 24-hour
  grade ported from Velion. Key-framed and **not** computed — a cosine curve
  gives a sky that is technically correct and reads as a lamp on a dimmer.
- `core/mark.js` — the Seismic mark: a rough-cut **crystal**, seven vertices in
  four facets, MEASURED off the 128px favicon at seismic.systems rather than
  drawn. It was two mirrored lunes for most of this project's life — a shape
  that is on the site nowhere, on the character sheet nowhere, and on nothing
  the brand has ever put its name to. Two checks required the wrong logo, which
  is worse than having none: it made the mistake load-bearing. If the mark is
  ever in doubt again, fetch the favicon and mask it; do not draw from memory.
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
