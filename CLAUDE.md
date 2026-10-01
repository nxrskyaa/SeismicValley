1|# Seismic Valley — developer notes
2|
3|Vanilla Three.js + Vite. No React, no physics engine, no asset pipeline. Every
4|mesh, texture, glyph and sound is generated at runtime from code in `src/`.
5|
6|This is a Three.js rebuild of **Velion** (`D:\major plan\Velion`, Godot 4). The
7|setting, palette, camera and Pruning mechanic are Velion's and were ported
8|deliberately. `Velion/docs/STORY.md` is the story bible and is still the
9|authority on anything narrative.
10|
11|## Current direction — September 2026
12|
13|The owner explicitly requested a Harvest Moon-inspired village farming game.
14|NPCs, commerce, friendship and house progression now take precedence over the
15|old solitude premise below. Keep the procedural art and isometric terrain.
16|Seismic's current interface reference is white/cream, plum ink and thin rules.
17|`game/village.js`, `world/village.js`, and `ui/village.js` own the new village loop.
18|Existing version-1 saves must remain readable; new social fields default empty.
19|Never commit credentials, local deployment settings or generated test captures.
20|
21|## The six rules that keep breaking
22|
23|Each of these was broken at least once and each is now an assertion in
24|`tools/checks.js`. Read this list before changing anything that touches look or
25|feel.
26|
27|1. **Two palettes.** `core/palette.js` exports `C` + `GROUND` (the world —
28|   Velion's washed lavender) and `UI` (the interface — Seismic's brown and
29|   cream). They are not interchangeable. Applying the brand colourway to the
30|   world is how the valley turned into sepia mud; the check asserts the UI block
31|   stays in Seismic's hue band **and** that the world block keeps its cool hues.
32|2. **The camera is orthographic**, pitch −37°, yaws 45/135/225/315, size **13**
33|   (9–22), measured off the reference. Perspective makes the terraces read as
34|   generic low-poly.
35|3. **`LEVEL` is 1.0 and `shadowMap.enabled` is false.** A step is a wall, not a
36|   kerb, and the reference has no HARD directional shadows. It was written here
37|   as "no cast shadows anywhere in it", and that reading was too strong — it cost
38|   the game every shadow it had. Sampled off the footage, ground pixels fall into
39|   two modes, lit at 188 and shaded at 164: a **0.87 multiplier**, feathered over
40|   several cells, under every canopy. So the shadow map stays off and the
41|   occlusion is real — baked into the terrain's vertex colours for anything that
42|   stands still (`world/occlusion.js`), one quad for the five things that move.
43|4. **A living village.** The player rig in `actors/player.js` is shared by three
44|   distinct villagers in `game/village.js`. NPC chat, gifts and deliveries persist
45|   in the save. Only one reward of each kind is allowed per NPC per day.
46|5. **Nothing loads over the network at runtime.** No CDN font, no `.glb`, no
47|   remote texture, no audio file.
48|6. **The rig rule.** Three composes `T * R * S`, so scale lands before rotation.
49|   Slabs get a Z-axis prism (`FLAT`/`POINT`) and are never rotated; limbs get a
50|   Y-axis one (`COLUMN`/`TAPER`) and are never rotated.
51|
52|## Geometry is measured, not eyeballed
53|
54|`chamferBox(w, h, d)` spent most of this project returning a box that was
55|**(w + 2c) x (h + 2c) x d** — `bevelSize` grows an extruded outline OUTWARD, and
56|the depth was the only axis compensated. `BLOCK`, the unit cube every rig is
57|plated with, was therefore 1.32 x 1.32 x 1.00. Every part in the game was 32%
58|too wide and too tall and the right depth, and thin plates had it far worse: a
59|seam declared 0.065 came back 0.117.
60|
61|It survived so long because it is **not a uniform scale**. A uniform error would
62|have cancelled out of every proportion; this one did not, so figures read as
63|bloated side-on and flat front-on however carefully their bands were measured off
64|the reference — and the measuring was never the problem. Two consequences to
65|remember:
66|
67|- **Numbers at a call site are now real.** If a part is the wrong size, the
68|  number is wrong; do not add a fudge factor.
69|- **Anything tuned by eye before the fix was tuned against the inflation.** The
70|  tree canopy is the example: its cubes were spaced to overlap by 14% of a cube
71|  and dropped to 6%, so a canopy that had read as one slab came apart into a
72|  pile of boxes. `props.js` now spaces it 0.86 both ways.
73|
74|Three tools measure what a screenshot cannot. `npm run verify` runs all of them.
75|
76|- `tools/overlap.mjs rig` — does a limb pass through the body? An arm is allowed
77|  to sit AGAINST a torso; it is not allowed to be buried in one.
78|- `tools/overlap.mjs seams` — has an assembly come apart? The opposite failure,
79|  and it reports how far each adrift piece is from the main mass, because a
80|  hairline between two plates meant to butt up is a different defect from a head
81|  floating above a neck.
82|- `tools/overlap.mjs buildings` — do two structures share ground? Layout lives in
83|  `world/settlement.js`, where a building CLAIMS a rectangle and an intersecting
84|  claim is refused, so a street is correct by construction.
85|- `tools/proportion.mjs` — is the construct built to the bands scanned off the
86|  reference sheet? Feet at 0, crown at 1, five bands, and it is the spec.
87|
88|**Prove a new check fails on the broken code before keeping it.** Every one of
89|these was written against a defect that was live, watched to fail with a real
90|number, and only then fixed. An assertion that encodes a mistake is worse than
91|no assertion, because it makes the mistake load-bearing — which is how the mark
92|stayed wrong for months behind two checks that required the wrong shape.
93|
94|## The visual target is the reference video
95|
96|`C:\Users\user\Downloads\sssx.io_1787567672903.mp4` — the footage the user gave
97|for Velion and still judges against. Velion's own `Palette.gd` is close but not
98|the same thing. Sample it, do not remember it:
99|
100|```bash
101|ffmpeg -ss 20 -i <mp4> -frames:v 1 frame.png
102|```
103|
104|What it shows: sand tops over pale grey-lilac walls with a sage lip and a rust
105|band under it; thin plum trunks under flat cube-cluster canopies; tiny pale
106|pebble specks, not grass tufts; deep blue-violet water; flat per-face shading
107|with no cast shadows at all.
108|
109|**Sample it numerically, do not judge it by eye.** Quantised, the footage's open
110|ground sits at `#c8c0a9` — R:G:B of 1 : 0.96 : 0.85. That is much less yellow
111|than it looks, because most of the warmth in the frame is the sun and not the
112|field. Reading the sage as the ground colour is how the meadow once ended up
113|dark olive; reading the sun's warmth as the ground colour is how it once ended
114|up orange sand. `Image.quantize` on a reference frame and on a capture, then
115|compare the two ratios, settles it in one step.
116|
117|## The other reference is Velion itself
118|
119|`D:\major plan\Velion` is the Godot build, and the user judges against it. Three
120|things were ported back out of it after a long drift:
121|
122|- **`Palette.gd`'s ground table**, verbatim — four colours per material: top,
123|  sage accent, rust band, body.
124|- **The per-face tints** in `VoxelMesh.gd`: top 1.0, across X 0.93, across Z
125|  0.855. The ASYMMETRY between the two wall directions is the point — at a
126|  45-degree camera you see both at once, and with one shared tint they merge and
127|  the terraces stop reading as steps.
128|- **`SUN_SCALE` 0.72 and `AMBIENT_SCALE` 0.56.** The ratio between them is the
129|  modelling of the whole world. This project had drifted to a fill almost as
130|  strong as the key, which flattens every terrace face onto the value of the top
131|  above it. The palette looked like the problem and it was not; the ratio was.
132|- **Wrapped Lambert at 0.42** (`applyWrappedLight` in `core/kit.js`), so a face
133|  turned away from the sun is still a face rather than one dark mass.
134|
135|## The systems added after the rebuild
136|
137|- `world/weather.js` — one wind field, read by everything. The sway on every
138|  prop is a vertex shader patched in with `applyWindSway`, not an animation; the
139|  drift in the air is seasonal. Anything new that stands in the valley should be
140|  patched too, and the patch is idempotent by design.
141|- `world/fish.js` + `game/fishing.js` — the lake. The school is stocked pool by
142|  pool after a flood fill, so a small pond is worth standing at. The whole
143|  fishing state machine is driven headless in `checks.js`; if you change it,
144|  that test is the one that will tell you.
145|- `core/music.js` — a generative score. The hour picks mode, register and tempo
146|  and the mode swaps on a phrase boundary. Notes are booked into
147|  `AudioContext.currentTime`, never scheduled from a rAF callback.
148|- `game/appearance.js` — colour choices, not a wardrobe. There is still exactly
149|  one human look and rule 4 still holds.
150|- `game/tutorial.js` — polls `state.stats`, a tally of things you have done. If
151|  you add a step, `checks.js` asserts its named hotbar key is the slot the tool
152|  is really in.
153|- `actors/jobs.js` — what a pebble does all day. `checks.js` asserts every job
154|  has somewhere in a generated valley to be done, which is what caught the
155|  missing-rock bug.
156|
157|## Key modules
158|
159|- `core/palette.js` — both palettes, and `skyAt(hour)`: a ten-key-frame 24-hour
160|  grade ported from Velion. Key-framed and **not** computed — a cosine curve
161|  gives a sky that is technically correct and reads as a lamp on a dimmer.
162|- `core/mark.js` — the Seismic mark: a rough-cut **crystal**, seven vertices in
163|  four facets, MEASURED off the 128px favicon at seismic.systems rather than
164|  drawn. It was two mirrored lunes for most of this project's life — a shape
165|  that is on the site nowhere, on the character sheet nowhere, and on nothing
166|  the brand has ever put its name to. Two checks required the wrong logo, which
167|  is worse than having none: it made the mistake load-bearing. If the mark is
168|  ever in doubt again, fetch the favicon and mask it; do not draw from memory.
169|- `core/wordmark.js` — the game's own letterforms. No font file anywhere.
170|- `core/kit.js` — the primitive vocabulary. Read its header before adding a mesh.
171|- `world/camera.js` — the orthographic rig. Its header says why every number is
172|  what it is.
173|- `world/mesher.js` — chunk meshing. Winding and vertex colour space are both
174|  load-bearing.
175|- `actors/rocky.js` — the construct, rebuilt from the reference sheet. The header
176|  records what the reference actually says, which is the spec.
177|- `game/state.js` — the whole game as data; knows nothing about three.js, which
178|  is what lets `checks.js` drive a full day headless.
179|- `game/pruning.js` — the mechanic. **Not** an earthquake: it takes apart
180|  unregistered structures and never touches the height grid.
181|- `game/story.js` — soil-tags and logs, plus the delivery rules.
182|
183|## Story delivery rules
184|
185|From the bible, and they are not suggestions:
186|
187|1. Never more than four lines on screen at once.
188|2. Found, not given — no quest-giver explains the setting.
189|3. Out of order, always — logs are numbered and shuffled.
190|4. The mundane before the cosmic — the first six tags are about drainage.
191|5. Nobody monologues.
192|
193|## House rules
194|
195|- **`public/mark.svg` is generated**, not drawn. `npm run mark` after changing
196|  the mark; the check asserts the committed file still matches.
197|- Saved data is namespaced `seismic-valley.*`.
198|- The mark and the rose shard are Seismic's. Do not put either on anything that
199|  is not carrying the brand.
200|
201|## Before finishing a change
202|
203|```bash
204|npm run lint
205|```
206|
207|```bash
208|npm run check
209|```
210|
211|Then, if anything visual moved:
212|
213|```bash
214|npm run shoot
215|```
216|
217|`shoot` drives the real game through `?shot=<pose>` and fails non-zero on any
218|console error. `--tag before` writes `shots/before-*.png` for a side-by-side.
219|The captures the README uses live in `docs/` and are committed; `shots/` is not.
220|
221|## Deploying
222|
223|Vercel builds it (`npm run build` → `dist/`) and is Git-linked, so a push to
224|`main` deploys. Nothing is committed pre-built.
225|