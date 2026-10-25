# Worldline

Worldline is a relativistic many-body sandbox at a9l.im/worldline: charged, spinning particles
under gravity, electromagnetism, gravitomagnetism, Yukawa and scalar fields, with black
holes, radiation, and photon/pion/lepton pools. Vanilla ES modules; the physics runs as
WebGPU compute shaders and draws with WebGPU instanced rendering, with no CPU fallback.
KaTeX from jsDelivr renders the reference overlay.
It is a submodule of the a9l.im repository (`a9lim.github.io`, at `projects/worldline`); the
root `AGENTS.md` covers the shared layer, design system, build, and deployment.

`docs/ROADMAP.md` is the plan of record: the planar-laboratory thesis, versions 2.1–3.0,
open decisions, and the model's known boundaries. This file describes the code as it is.

## Running and checking

- Preview from the parent build at `http://localhost:8000/worldline/`; `?lang=ja` gives
  Japanese, and `window.sim` is the live `Simulation`.
- Syntax: `for f in main.js colors.js src/*.js src/gpu/*.js i18n/*.js; do node --check "$f"; done`
- WGSL compiles only in the browser, so check the console after shader edits.
  Pipelines are created synchronously, so a compile error shows up as a WebGPU
  validation error rather than a throw; a missing shader file does throw, and the page
  then logs `[worldline] GPU init failed` and shows the WebGPU popup.
- `tests/physics-validation.html` runs analytic oracles against a headless `GPUPhysics`
  (open `http://localhost:8000/worldline/tests/physics-validation.html` and press Run, or call
  `runAll()` from the console; `runAll('Liénard')` runs the cases whose names contain the
  string). Every new feature adds its oracle there (`docs/ROADMAP.md` §1.1).
  The stager skips `tests/`, so it never deploys.
- `?perf` (`src/gpu/gpu-profiler.js`, `sim.perf`) puts GPU timestamps on every compute and
  render pass by wrapping the encoder's `beginComputePass`/`beginRenderPass` while a frame
  is open, so no pass site changes; it also times the loop's CPU phases and counts submits,
  buffer writes and map requests, and shows a digest at the stage's top left. Passes overlap
  on Metal, so their sum (`gpuBusy`) overcounts; `gpuSpan` (first begin to last end) and the
  per-phase `stepSpan` and `renderSpan` are the wall times. Startup marks: device, physics,
  renderer, first frame. Under `?perf` the tree builds take a pass per stage (`tree:…`,
  `bosonTree:…`). A light scene lets the GPU clock down, so its per-pass times read high:
  compare loaded scenes, or the same scene A/B.
- Benchmarks: `docs/second-pass/tools/tour.mjs` (Playwright and the WebGPU Chrome; see its
  header) runs any scenario with `bench: { warm, measure }` under `?perf` and writes p50/p95
  per scenario to `OUTDIR/bench.json`; `bench-scenarios.json` beside it is the standing set
  (every preset in plane and tilted, Fields, an observer, 500 bodies, full boson pools, both
  fields with grid gravity, and 4000 seeded bodies relativistic, tilted, and under Barnes–Hut), and `bench-compare.mjs A B` diffs two runs. Concurrent GPU work
  (another benchmark, another agent's browser) skews the numbers, so compare runs made alone,
  or run `bench-ab.mjs OUT URL_A URL_B`, which alternates the two trees scenario by scenario.
  A frozen tree to compare against is a worktree at the base commit, served with its own
  port (any static server that maps `/worldline/` to it and `/shared/` to the root's).
- Plate screenshots and colour-vision checks (`docs/second-pass/tools/`; same Playwright and
  server as `tour.mjs`): `WL_URL=http://localhost:8000/worldline/ node shots.mjs OUT` freezes each
  preset into a reproducible frame (frames driven by hand, every readback and lazy pipeline
  awaited, `Math.random` seeded, one page per theme) and screenshots preset × light/dark × fitted,
  2× and 0.5× in about 30 s; `node shots-diff.mjs A B OUT` counts the pixels whose channel moved by
  more than 8/255, with their bounding box, a diff image, a contact sheet and the physics hashes;
  `node cvd.mjs IMG OUT` renders protan/deutan/tritan/gray sheets (Machado et al. 2009 at severity
  1.0 in linear RGB) and scores every pair of inks by CIEDE2000. Measured on an unchanged
  tree, every preset reproduces byte for byte with its physics hash, so the 8/255 threshold is
  margin (one 9 px swatch in the key has moved by 5/255). Each theme opens its own page.

## Layout

```
index.html               page shell: colophon, scene and figure bar, margin (Settings / Stats / Particle / Frame), JSON-LD
main.js                  Simulation: state, device lifecycle, fixed-timestep loop
colors.js                freezes the shared tokens (Worldline reads the inks directly)
i18n/strings.js          UI strings (en, ja); merges strings-reference.js (reference overlay)
src/config.js            constants, mode enums, Kerr–Newman and Paczyński–Wiita helpers
src/physics-settings.js  the toggle and parameter store (sim.settings); applyConfig(), for presets and saves
src/physics-contract.js  toggle/parameter keys shared by save/load and the GPU slot map
src/ui.js                colophon, margin, view and boost controls, toggle dependencies, shortcuts, about
src/input.js             spawn, select, delete through GPU hit tests; Alt/Shift-drag orbits the view
src/spacetime.js         the spacetime view: orbit camera over the 2D camera, Lab/Observer boost
src/caption.js           the live figure caption under the scene: Fig. 1, the preset's live values (en, ja)
src/scene-key.js         the key at the stage's bottom right, and the margin's legend swatches (en, ja)
src/overlay.js           the 2D canvas above the GPU canvas: the field atlas, spawn-drag line, scale bar,
                         the spacetime box with its dimension line and presents
src/field-atlas.js       the Fields overlay's contours and field lines, from the heatmap readback
src/presets.js           six curated presets (PRESET_ORDER): data, a spawn, and an optional tick
src/quench.js            the Higgs quench: startQuench(), measureHiggs(), the Stats tab's Quench section
src/cosmology.js         the scale factor a(t): schedules, the Friedmann closure, horizons
src/cosmology-panel.js   the Stats tab's expansion readouts and the overlay's horizons
src/frames.js            the observer the view is drawn for (sim.frames), FrameParams
src/frame-panel.js       the Frame tab: frame choice, parameters, readouts, scrubber
src/lens-panel.js        the Frame tab's Backdrop section: lensing, the microlensing probe
src/save-load.js         quick save (localStorage), JSON download/upload
src/stats-display.js     conservation readouts, selected-particle panel
src/phase-plot.js, effective-potential.js, plot-labels.js   Particle-tab plots
src/i18n.js, reference.js, topology.js (minImage), fft.js (Green's function), vec2.js
src/gpu/gpu-backend.js   GPU runtime: step, events, render, stats, auto-save
src/gpu/gpu-physics.js   GPUPhysics: buffers, dispatch, readbacks, serialize
src/gpu/gpu-fields.js    the scalar fields' half of GPUPhysics (installed on its prototype)
src/gpu/gpu-profiler.js  ?perf: per-pass GPU timestamps and CPU frame timings (sim.perf)
src/gpu/gpu-pipelines.js pipelines, fetchShader, SHADER_VERSION
src/gpu/gpu-buffers.js   allocation and packed struct sizes
src/gpu/gpu-constants.js generated WGSL constants and toggle bits
src/gpu/gpu-renderer.js  instanced rendering, light/dark pipeline pairs
src/gpu/pass-graph.js    per-frame dispatch plan
src/gpu/shaders/         WGSL; shared-*.wgsl are prepended includes, tree-items-*.wgsl the trees' items
tests/physics-validation.html   analytic oracles against a headless GPUPhysics
docs/second-pass/tools/  the headless harness (tour.mjs), benchmarks, serve.mjs
```

## How it works

### State and the frame loop

`Simulation` (`main.js`) owns the domain, camera, modes, selection, and the settings
store `sim.settings` (`physics-settings.js`), which `ui.js` writes and
`GPUBackend.applySettings()` copies into `GPUPhysics.setToggles()`. View flags (trails,
clocks, vectors, `grid` for the rulers and key) live in `sim.view`, the Fields overlay's
state in `sim.heatmap`.

Presets and saves reach that state by one path, `applyConfig(sim, { settings, modes,
speed, view })` (`physics-settings.js`): it writes the store, the modes (by name), the
speed and the view (`sim.view`, the Fields overlay, the lens, and `depth`, the spacetime
view's least depth), then calls `sim.syncControls()` (`ui.js`), which has every control
show the store without firing its handler (the parameter sliders are one table,
`storeSliders`, with each control's transform), runs the dependency cascade and the mode
locks once, which may turn more off in the store, and pushes the result to the GPU. A
preset (`presets.js`) is data: the toggles it turns on (every other is off), the
parameters it sets (the rest default), modes, speed, view (what it doesn't turn on is
off, except the rulers and key) and domain; `presetConfig()` makes its configuration,
and `stateConfig()` in `save-load.js` a save's. Then `spawn(sim, run)` places the bodies,
and a preset with a `tick(sim, run)` (the bremsstrahlung beam) sets `sim.presetTick`,
which runs after each stepped frame until `reset()` clears it; `run` is that load's own
state, so nothing outlives the run.

The domain is state, not the window: `sim.domainW`/`domainH` in world units, square
`DEFAULT_DOMAIN` (64) unless a preset sets `domain: [w, h]` or a save carries one.
`sim.setDomain()` resizes the GPU domain and calls `fitCamera()`, which fits it to the
window; resizing the window moves only the camera. Clear restores the default.

`startGPU()` requests the device; without one the page shows the "Worldline needs WebGPU"
popup and stays empty. `_attachDevice()` builds the `GPUBackend` and registers the
device-loss handler, which recreates the device and restores the backend's auto-save
(every 300 stepped frames; fields and bosons are not saved). `_loopBody` adds the capped
frame time × `speedScale` to `sim.accumulator`, then calls `gpu.step()`, polls the hit
test, and renders when `_dirty`; the loop stops while the tab is hidden.

The GPU buffers are the only particle state. `sim.addParticle()` converts a spawn
velocity to proper velocity and writes a slot; selection is a slot index
(`sim.select(idx)`), and the sidebar reads the selected body, and the heaviest other
body as the plots' reference, from the stats readback. A selection whose particle dies
clears itself; each stats readback carries the selection it was requested for
(`selectedIdx`), so one still in flight when the selection changes is ignored.

### Units and particle state

- c = G = ħ = 1. `WORLD_SCALE` (16) is pixels per world unit at zoom 1; the camera's
  zoom is relative to it.
- Linear and rotational state are proper velocities (`ParticleState.velW`, `angW`);
  `derived.vel` and `angVel` come from them in `cache-derived.wgsl` and equal them with
  relativity off. The spawn spin slider is a surface speed.
- `derived.bodyRSq` = ∛m² is the body radius and the source of moment of inertia,
  magnetic moment, and angular momentum. In black-hole mode `ParticleAux.radius` and
  `derived.radiusSq` hold the Kerr–Newman horizon instead.
- Charges are multiples of `BOSON_CHARGE` (0.1): `addParticle()` rounds, pions and
  leptons carry 0 or ±`BOSON_CHARGE`, and emission, absorption, decay, Schwinger
  discharge and extremal shedding move whole quanta.
- Energy totals include rest mass plus kinetic, spin, potential, field, and radiated
  terms. The potential and field terms are each force's conserved energy
  (`compute-stats.wgsl` `statsPE`): T + V alone without Relativity or 1PN, since the
  magnetic and gravitomagnetic Lorentz forces do no work; with Relativity and Coulomb,
  Darwin's +(q₁q₂/2r)[v₁·v₂ + (n̂·v₁)(n̂·v₂)] and its field momentum, which
  Liénard–Wiechert's field reduces to at O(v²); with 1PN, the EIH, Bažański and scalar
  Breit energies (two-body forms, summed over pairs). Radiated is the boson pools
  (`boson-ledger.wgsl`: photons, pions and leptons), the radiation bodies have lost but
  not yet emitted (the `RadiationState` accumulators), and escaped radiation: the pool
  culls bound memory, so what they remove goes to `GPUPhysics.ledger.escapedE` instead
  of vanishing. Stats readbacks carry the state version, scale factor and ledger as of
  their request, so a readback in flight across a reset, spawn or removal can't set the
  drift baseline.

### Integrator

`GPUPhysics.update()` gets the frame's whole tick count (`n·PHYSICS_DT`) and splits it
into at most 32 substeps from the previous frame's `maxAccel` readback,
`dtSafe = √(softening/a_max)` (no cyclotron limit), and submits each substep as its own
command buffer so that substep's uniforms (`simTime` above all) are the ones its passes
read. With ε = 8 the accelerations rarely ask for more than one substep (every benchmark
scenario ran one), so a frame is one command buffer of physics in practice. It steps with
or without bodies: `_dispatchBodyStep()` (passes 0–14, everything the bodies do up to the
field step) and the later body passes skip when none is alive, while the fields and bosons
go on. `_dispatchSubstep()` lists the order in its pass comments: forces, external and
field forces come before the fused kick–rotate–kick, then spin-orbit and torques,
radiation, drift, clocks, the 1PN velocity-Verlet correction, the field step,
collisions, extremal shedding, bosons, the boundary, and the world lines (a sample whenever
the world-line clock crosses the next `WORLDLINE_DT` mark, else merge breaks and death
snapshots only). After the substeps, once per frame: the expansion (below), the pool
culls, pion decay, boson interaction, dead-slot GC, quadrupole radiation and colors.
The scheme is the staggered Boris pusher:
both half-kicks precede the drift, so velocities sit half a kick from positions, and
spin-orbit kicks change `w` directly rather than through `totalForce`.

GPU times are f32 relative to a rolling epoch on the world-line clock: lab time, or
conformal time η (dη = dt/a) while the universe expands, kept in f64 as
`conformalTime`; `gpuTime = conformalTime − timeEpoch`, and `_maybeRebaseEpoch()`
advances the epoch by `EPOCH_STEP` (256) once GPU time passes `EPOCH_SPAN` (512),
shifting every stored time back (`worldline-rebase.wgsl`). `SimUniforms.simTime` is that
clock: only world-line samples, creation times and `ParticleAux.deathTime` hold
absolute GPU times. Lab time `simTime` stays an f64 in JS.

### Expansion

Expansion requires the torus (decision 3, refined after Codex's review: the toggle
switches the boundary to loop and the topology to torus): the universe is the periodic
domain, a slab of comoving thickness `SHEET_THICKNESS` cut from flat 3D FRW. Klein and RP²
are out because they aren't homogeneous: there the minimum-image pull of a uniform
background doesn't cancel.

- **The scale factor** (`cosmology.js`, `GPUPhysics.cosmology`): `step(dt)` integrates
  `da/dt = a·H(a)` by RK4 for the schedule chosen under the toggle: de Sitter, matter,
  radiation, ΛCDM (Ω_m 0.3), or the Friedmann closure `H² = (8π/3)ρ̄ + H_Λ²`. The slider
  (logarithmic) is H₀ for the imposed schedules and the vacuum H_Λ for the closure, whose
  ρ̄ comes from each stats readback (`_absorbLedger`): rest plus kinetic energy of bodies,
  pions and leptons, photons with pending and escaped radiation, and the fields' slab
  energy, over `a³·W_c·H_c·ℓ`; between readbacks matter and fields scale as a⁻³ and
  radiation as a⁻⁴. a stops at `A_MAX` (1000, single precision) with a toast.
- **Physical coordinates on a growing domain.** `sim.domainW/H` is the comoving domain
  (state, saved); `GPUPhysics.domainW/H` is a times it (`setComovingDomain`). The forces
  never see a. `update()` splits the stretch symmetrically (Strang): `expansion.wgsl`
  scales every position (bodies, retired bodies, photons, pions) by √r about the
  domain's corner and every peculiar momentum and photon energy by 1/√r before the
  substeps and again after them, r = a_new/a_old, and the substeps run in a static
  universe at the midpoint a (`_frameA`, which `scaleA` returns meanwhile). On the torus
  that is the comoving dynamics, `ẋ = Hx + v`, `ẇ = f − Hw`, which at low speed is
  `d̈ = (ä/a)d + f`; the mean density's pull cancels over each body's minimum-image
  cell. `GPUBackend._advance` splits a frame whose H·dt exceeds 0.02. The camera follows the universe (`sim.followExpansion`); the comoving
  view zooms out with it, and the grid's rulers are comoving.
- **World lines are comoving and conformal:** samples hold C = x/a on the cover,
  conformal time and dw/dη = a·(dw/dt − H·w) (the continuous Hubble drag, though the
  frame applies it at the stretches), and boundary decks are comoving.
  `retardedState(…, scaleA)` solves the flat cone in (η, C) and returns `rel·a` and
  `acc/a`, so the flat-space Liénard–Wiechert formula gives E_phys = E_conformal/a²
  (Maxwell is conformally invariant), with radiation fields dimmed by 1/(1 + z): exact
  for the trajectory the samples describe, which is interpolated (Hermite positions,
  linear accelerations) and sees one image of each source.
  The other laws use the same physical retarded position. Non-lab frames are off once a
  ≠ 1 (FRW has no global boosts); the spacetime diagram becomes the conformal diagram.
- **Fields** (below) feel Hubble friction, thin their particle sources by 1/a and count
  a slab energy of a times the grid's.
- **The ledger.** `GPUPhysics.ledger.expansionWork` is the energy the expansion took,
  so `E_total + W` should hold: kinetic and photon redshift summed exactly in
  `expansion.wgsl` (`cosmoAccum[0]`); the fields' share in `field-ledger.wgsl`, the
  Hubble friction metered exactly around its own operator (`hubbleFriction`) and the
  stretch from the state just before it; and in JS the stretched potentials to first
  order (`stats[26]` = Σ d·∂V/∂d) and the escaped background's redshift (culled photons
  arrive comoving, a·E, and convert at the a they're read at; culled leptons split into
  rest mass, which stays matter, and kinetic energy, redshifted as relativistic). The
  capped universe (a = A_MAX) stops its Hubble friction and drag with its stretch.
  Momentum drift compares a·P, which expansion conserves on the torus.
- **Readouts:** the Stats tab's Expansion section (`cosmology-panel.js`): a, H, c/H, the
  event horizon (finite only with a vacuum term), the Friedmann density, and ln a and H
  over the run; the overlay rings the selection (or the view's centre) with c/H and the
  event horizon.

The Boris rotation parameter is `(q/2m)·Bz + 2·Bgz`, scaled by dt/γ, so the stored fields
act as `F = q v × B + 4m v × Bg`. In the force shaders the displacement r is source −
observer, so a positive radial coefficient attracts. The fields, in that convention:
- Moving charge (Biot–Savart, B = q v × R̂/R² with R̂ toward the observer):
  `Bz = −q (v × r)_z/r³`. Parallel currents attract.
- Magnetic dipole: `Bz = −μ/r³` in the plane; aligned dipoles side by side repel,
  `−3μ₁μ₂/r⁴`.
- Moving mass: `Bgz = +m (v × r)_z/r³`. Parallel mass currents repel, and `4m v × Bg` is
  exactly EIH's v₁·v₂ sector, which the 1PN pair force leaves out.
- Spinning mass: `Bgz = +J/(2r³)` in the plane, which slows prograde orbits
  (Ω_pro = Ω_K − J/r³); the gravitomagnetic dipole force `+3L₁L₂/r⁴` attracts.
Those signs were reversed until 2026-10-23 (`2187ef4`, `docs/ROADMAP.md` §10); the oracle page pins
each. 1PN forces are velocity-dependent and break Newton's third law, hence the
velocity-Verlet correction.

### Forces and toggles

Fifteen toggles (`TOGGLE_KEYS`). Their dependency graph is the declarative
`_forms.bindDeps()` list in `ui.js`; `updateAllDeps()` adds the mode locks (Black hole
forces Merge collisions, Expansion forces Loop). Less
obvious couplings: Boson interaction needs the Barnes–Hut toggle (Simulation section);
signal delay runs whenever Relativity is on, and with it charges interact through their
Liénard–Wiechert fields; field gravity follows Gravity; kugelblitz runs under Boson
interaction with Gravity. The 1PN pair forces (`shared-1pn.wgsl`, shared by the force
pass and the velocity-Verlet recompute): EIH with Gravitomagnetic (not Gravity),
Bažański's mixed static term with Gravitomagnetic and Coulomb, scalar Breit with Yukawa.
There is no Darwin term: Liénard–Wiechert carries EM to all orders in v.

Barnes–Hut picks the tree walk over pairwise forces, without Relativity. The walk
(`forces-tree.wgsl`) is a group walk: 32 bodies consecutive in the tree's Morton order walk
it once against their bounding box into a list in workgroup memory, which eight threads a
body then sum a tile at a time. The nodes waiting to be judged sit in a ring: each round
judges a batch from the front, breadth first, sized so its children fit above a reserve, and
at the reserve one node a round from the back, a depth-first descent the reserve always
holds, so no tree overflows it; the list and the ring fill by prefix sums, so the sums are
the same every run.
A far node's tidal torque squares its total coupling where pairwise sums the squares: a
far-field approximation of Barnes–Hut's, large only where softening flattens the distances. A node is taken whole when its size is under θ = 0.5 times
its distance from the box, and on a periodic domain only when its cell and the box lie
within half a domain of each other, so every body sees all of it in one image (without that
rule the torus error against pairwise was 31%). With Relativity every force runs pairwise
from the world lines whatever the toggle: a node's aggregate has no world line. Collisions,
hit tests, boson absorption and the heatmap use the tree either way. Periodic modes put
ghost copies in the tree for seam collisions and photon absorption, but ghosts weigh nothing
in the aggregates (`tree-items-bodies.wgsl`), because every walk takes minimum-image
displacements and a weighted ghost would count its pair twice. So a ghost needs to reach only
as far as a contact: each substep `ghost-gen.wgsl` first reduces the largest body radius
(`maxRadius`, the horizon in black-hole mode, into the `radiusMax` buffer and, by an
in-encoder copy, `SimUniforms.radiusMax`), then ghosts each body within its radius + that
largest radius + `GHOST_SLOP` (2) of an edge, about 140 ghosts for 500 bodies. The host
learns a substep's ghost count only a frame later, so it copies the whole ghost buffer
(`_ghostSlots()`) and `trimGhosts` clears the slots past the substep's own count;
`cacheDerived` runs first, so the reduced radius is this substep's. Collision detection and
absorption prune by each tree node's largest radius (node word 19) instead: a collision pair
is written by its smaller body (the lower slot of two alike), which looks only under nodes
whose largest radius reaches its own, so a small body deep inside a large horizon is found
and a grown body's own walk stays short. The tree is from before the substep's drift, so the
collision search reaches c·dt further and tests the bodies where they are. The largest radius widens the hit test, which
ignores ghosts. With Higgs on, the Yukawa range is `yukawaMu·√(higgsMod_i·higgsMod_j)`,
`higgsMod = max(|φ|, HIGGS_MASS_FLOOR)` cached per particle in `axYukMod.z`.

Signal delay finds each source's retarded state, `retardedState()` in
`shared-worldline.wgsl`: the image nearest the observer now fixes which copy of the world
line it sees; a gallop from a hint brackets the past light cone among the samples plus the
source's current state, and Newton's method finds it on the cubic Hermite segment. The pair
force keeps each pair's bracket as the next call's hint (`wlHints`, source-major, capacity²),
seeded for a new pair from its distance over the line's sample spacing: in a crowded scene
the paths curve too much over a light-crossing time for any guess from now to match it, and
a full bisection cost about half again as much at 4000 bodies. The
result carries position, velocity, acceleration, angw, mass and charge at the retarded
time. Charges act through their Liénard–Wiechert fields, E = q[(n̂ − β)(1 − β²)/(κ³R²) +
n̂ × ((n̂ − β) × β̇)/(κ³R)] and B = n̂ × E, both scaled by σ³ with σ = R/√(R² + ε²) so that
a charge at rest gives the softened Coulomb field, and κ floored at `LW_KAPPA_MIN`
(1/κ³ ≤ 100). Every other law is its static form at the retarded position times the toy
aberration factor (1 − n̂·v)⁻³. The heatmap's electric potential is q/(κR). Removed
particles keep sourcing forces until the light from their world line's end has passed:
retired slots keep their death snapshot. A source's past before its first sample is
extrapolated as uniform motion back to its creation time and is invalid before it, so a
body spawned by hand sources nothing until its light arrives; preset and loaded bodies are
created at `−∞` and act at once.

### Proper time, the spoke, and world lines

- **Clocks** (`clocks.wgsl`, after the drift; one `vec4` per slot in `buffers.clocks`:
  τ, ring phase, θ, lapse). τ advances by `dτ = dt·√max(0, 1 + 2Φ_N − v²)`, with Φ_N
  summed over particles with the force softening (`BH_SOFTENING` in black-hole mode;
  never Paczyński–Wiita, which vanishes at 4M). Field gravity Φ_F is not in the lapse.
  With Relativity off the lapse is 1.
- **Spoke angle θ** is the in-plane transported axis, `θ = θ_FW + ω₀τ`; it never
  touches `angW`. It advances by `ω·dτ` (ω the rest-frame rate, or Ω_H in black-hole
  mode) plus three precessions in lab time: Thomas, `(γ²/(γ+1))·(a × v)` from the
  non-gravitational acceleration only (`totalForce` minus the gravity, gravitomagnetic
  dipole, 1PN and external-gravity parts, plus the Boris magnetic Lorentz force);
  geodetic, `−(3/2)·(g × v)` with g the Newtonian field; and Lense–Thirring,
  `Σ −J_j/r³`, with Gravitomagnetic on. Klein and RP² crossings mirror θ
  (`boundary.wgsl`).
- **The glyph** (`particle.wgsl`): a body is its ink mixed into the ground (52% ground in
  light, 38% in dark) inside a 1.25 px outline of the ink, the ink by the sign of its charge
  (`update-colors.wgsl`: sienna positive, prussian negative, graphite neutral, beyond half a
  `BOSON_CHARGE`). Bodies at least 5 px in radius carry their sign as a + or −; a neutral body's
  spoke runs from the centre, a charged one's (and a hole's) is a rim tick from 0.6R, and
  marks take the ink mixed 45% toward the text. Antimatter is hollow (the ground inside the
  outline). A black hole is a void, the text ink in light and near-black (`COLOR_VOID_DARK`)
  with a faint edge in dark; `ring-render.wgsl` dashes its equatorial ergosphere at
  M + √(M² − Q²), skipped within 1.5 px of the horizon, and rings the selection in the accent
  4.5 px out. Every body is drawn at least 2 px in radius.
- **The spoke** (`particle.wgsl`): each body is its rest-frame disk pushed through the
  Lorentz map of its centre's velocity. The vertex shader contracts the quad by 1/γ
  along v; the fragment shader maps each lab offset to its rest-frame offset
  `Δ + (γ − 1)(Δ·n̂)n̂` and draws the spoke at `θ + ω·(−γvΔ∥)`, the angle it held at
  that point's rest-frame time, so a spinning, moving spoke bends by `2·v·v_rim` across
  the diameter. The spoke is drawn only on bodies at least 4 px in radius.
- **The Clocks overlay** (K, the View section; `clock-render.wgsl`): a faint ring per
  body and an arc in the body's ink that fills once per `CLOCK_PERIOD` (16) of its proper
  time, contracted with the body. The particle panel shows τ and dτ/dt.
- **World lines** (`worldline.wgsl` writes, `shared-worldline.wgsl` reads): a ring of
  `WORLDLINE_LEN` (1024) samples per slot (a substep longer than `WORLDLINE_DT` records one,
  so at the default speed they are about 0.27 apart), one every `WORLDLINE_DT` (1/8) of the
  world-line clock (lab time, or conformal time under expansion: positions are then
  comoving, see Expansion), always recorded. A sample is 12 floats, `t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`
  (`WL_STRIDE`), with a = dw/dt including the Boris magnetic and gravitomagnetic
  rotation. Samples live on the covering plane: each slot's deck maps its wrapped
  position to `C = A·x + b` (A a diagonal of ±1), and `boundary.wgsl` updates the deck
  at every loop crossing so C never jumps; velocities, accelerations, θ and angw are
  mirrored with it. Meta (`WL_META_STRIDE` = 8): `writeIdx, count, creationTime,
  generation, deck flips, bx, by, _pad`; the generation counts the slot's occupants
  (`_slotGeneration`). `addParticle()` writes a birth sample and an identity deck; a
  removal writes a death snapshot with the death mass (`FLAG_DEATH_HIST`); a merge sets
  `FLAG_WL_BREAK` on the kept slot, and the next substep records the old body
  extrapolated to now and the merged body at the same time, so no segment smooths the
  jump. The epoch rebase also maps each line by its inverse deck, back to the identity.
- **Continuity.** An inelastic merge keeps the heavier parent's slot, so its τ and θ
  carry on.

### The spacetime view

The canvas tilts from the plane into the world lines it shows (`spacetime.js`,
`spacetime-render.wgsl`). An orbit camera sits over the 2D camera: elevation `el` (π/2 is
straight down the time axis, the plane view) and azimuth `az`. A point (x, y) on the present
plane at time h before it projects with time and space at one scale, so light keeps to 45°,
and the plane view is the same projection seen from above, so the two never disagree.
`SpacetimeView.writeMatrices()` gives the renderer a view matrix taking (x, y, h) to clip
space (depth always 0) and the plane's inverse, so every existing pass draws on the tilted
plane unchanged; `wrapCamera()` routes the 2D camera's screen mapping (picking, spawning,
panning, zoom about the cursor) through the tilt. Alt- or Shift-drag orbits; W, or the Plane
and Spacetime buttons, ease between the two (`EL_SPACETIME` ≈ 30°).

- **Depth.** The time shown below the plane is `DEPTH_FRACTION` (1.2) of the visible plane's
  height, or a preset's `minDepth` if that is more (the twin asks for the whole reach, so
  its round trip of about 109 shows whole as it ends), capped by the world lines' reach
  (127); the fit `k` shrinks the scene so the plane and its past share the screen.
- **World lines** (`vs_line`): one triangle strip per slot straight from the history ring
  (4 vertices a sample, an incoming and an outgoing pair, so a seam or merge break zeroes a
  segment without bridging it; in the lab's coordinates only the newest depth / `WORLDLINE_DT`
  samples, `SpacetimeParams.lineWindow`, since older ones have faded out), mapped from the cover through the slot's deck and on a
  periodic domain to the image nearest the body (or the observer). The fragment draws a
  hairline and a bead every `beadStep` of the body's proper time (a power of 2 near depth/14),
  fading beads closer than ~8 px. Opacity falls with age; the selected body is the accent.
- **Trails** are the same world lines seen from above: with Trails on, `vs_line` draws in the
  plane view too (`SpacetimeParams.trails`; the flat camera zeroes the matrix's h column so
  the past doesn't clip). There is no separate trail pass or buffer.
- **The selected body's past light cone** (`vs_cone`): four lab-time rings reaching
  `CONE_REACH` (0.3) of the depth, boosted like everything else, with its two generators where
  the projection's null directions graze it (`towardCamera()`) and the back of each ring
  dashed (`fs_cone`). **Bosons** (`vs_boson`): photons on 45° lines back to their emission,
  pions and leptons on timelike lines beaded by their own clocks.
- **Events** (`vs_event`, `fs_event`, tilted): open circles, the ground inside a hairline, where
  a world line begins during the run, ends, merges, or takes a kick (a jump in proper
  velocity above `KICK_DW` (0.15) between samples, at its local maximum). Found by scanning
  every sample in the window each frame, the plate's costliest draw at 500 bodies (0.8 ms on an
  M5 Max); 2.5's event log (`docs/ROADMAP.md` §4.2) would draw logged events instead.
- **The sheet of the present.** In the lab's coordinates, world lines and light that pass
  under the tilted plane's fill are drawn at `SEEN` (0.45) (`underSheet()`).
- **The plane and box.** `grid-render.wgsl` keeps the rulers to the domain and gives it a faint
  fill when tilted (`GridParams.tilt`); a periodic domain's seams give way to the box. The
  overlay draws the box's corner world lines, its floor at the depth, a time axis at the
  corner nearest the left edge, and a dimension line along the present's front edge away
  from it. On a torus with an observer the box (and the sheet, `GridParams.boxX/boxY`) is the
  domain's translate around the observer (`renderOpts.boxOrigin`), since any translate of
  the domain is the domain.

**Lab and Observer coordinates.** The Boost slider sets the boost frame's velocity along x
(`frames.rapidity`, `direction` 0 or π; the Frame tab's speed and direction are the same
setting). Every event is drawn through a boost at rapidity ψ = s·atanh|u| about an anchor A
on the observer's present: s = 0 is the lab's coordinates, s = 1 the observer's, and
`toCoords()` eases between them. The display transform is `SpacetimeView.display()` in JS and
`disp()` in the shader:

    Δ = (x − x_A, t − t_A),  x′∥ = cosh ψ·Δ∥ − sinh ψ·Δt,  t′ = cosh ψ·Δt − sinh ψ·Δ∥
    shown at offset + Δ⊥ + x′∥ n̂,  h = t′ − (1 − s)·lag

with `offset` = (1 − s)·x_A + s·a_now, so s = 0 is the identity and at s = 1 the observer sits at
the camera's centre. In the lab the observer is the inertial one moving at u through the
camera's centre now, with frameAnchor's lag (the visible slice in the computed past); at
s = 1 `stepCoords()` hands over to the boost frame, whose observer is that same world line,
so its picture continues without a jump, and the shader then reads the anchor from the
slicer's `FrameState` buffer. While the lab boosts (0 < s < 1) the bodies and their overlays
are hidden and `vs_pierce` draws each body where its world line crosses the observer's
present (found by bisection: g = (t − t_A) − u·(x − x_A) rises along a timelike line); in lab
coordinates with a boost set, the same points show as rings on the tilted present. World-line
segments beyond the observer's present are faint. The overlay outlines the presents that
aren't the flat plane on top: the observer's (lab coordinates) and the lab's (observer's).
Co-rotating and free-fall frames are not boosts and keep the plane. A boost leans the scene
by tanh ψ of the depth along u, so `SpacetimeView.frame()` refits: it shifts the centre half
the lean and fits the width with it, so the sheared scene stays in frame.

**The opening.** `Simulation._openScene()` loads the cyclotron preset quietly and, 2.6 s later,
tilts into spacetime once unless the visitor has acted. Under reduced motion it runs 240
frames up front, pauses and opens tilted.

### Frames

`sim.frames` (`frames.js`) names the observer the view is drawn for: the lab (the
simulation's own frame), zero momentum, the selected particle, a boost (rapidity and
direction), co-rotation at a rate Ω about the point the camera was on, or free fall (the
selected particle's frame kept Galilean, so uniform gravity vanishes and tides remain; the
slicer runs it as the particle frame with `lorentz` off). Frames are a
view: spawning, selection, deletion and hover act in the lab, and `input.js` ignores the
canvas while a frame is active.

- **Slicing** (`frame-slice.wgsl`, from `GPUBackend.render()` each rendered frame).
  `frameAnchor` (one thread) finds the observer's lab velocity u and its anchor event
  (t_A, X_A) and writes `FrameState`; `sliceWorldLines` (one thread per slot and image)
  finds where each world line crosses the observer's now, `t − u·x = t_A − u·X_A` with
  Relativity on and `t = t_A` with it off or in co-rotation, and writes the view buffers
  (`viewState`, `viewAux`, `viewDerived`, `viewClocks`) that the body, clock and ring
  pipelines draw in place of the live ones. On the slice a lab offset Δ maps to
  `x′∥ = Δ∥/γ` with velocities by relativistic addition; τ and θ come from the world line at
  the crossing.
- **The lagged view.** t_A = now − lag with `lag = |u|γ·max(x′·û)` over the visible
  rectangle plus the scrubber's look-back, capped at the ring's reach (127), so everything
  drawn has already been computed. The HUD names the lag (`lab − 23`) and says when part
  of the slice falls outside the recorded history, where `wlOnSlice` extrapolates at
  constant velocity.
- **Images.** Each world line is mapped from its covering plane through the image nearest
  the frame's reference point (the anchor's wrapped position now). On a torus every body
  is drawn as its 3×3 nearest images (`frames.images`), `γL` apart along u with clocks
  `γvL` apart, because the torus identification holds at equal lab time; Klein and RP²
  draw the primary image only. Instances are `alive × images`, and `particle.wgsl` reads
  each body's colour at `instance / images`.
- **Bosons** (`boson-render.wgsl`) are drawn where their straight paths cross the slice,
  no earlier than their emission; photons take the Doppler factor `γ(1 − u·v̂)` in hue.
- **What frames skip:** trails, force and velocity arrows, torque arcs, the heatmap and
  the field overlays stay lab-only and are hidden in a frame.
- **The camera** in a frame is in observer coordinates with the observer at the origin;
  leaving the lab saves the lab camera and returning restores it. Resizing keeps the
  observer centred.
- **The scrubber** (Look back) adds lag while paused, so a paused run can be re-sliced
  further into its past.
- **The spacetime view** replaced the Frame tab's side diagram: the canvas itself tilts
  (above). `readSlotsSnapshot` and `readWorldLines` remain for the tests.
- **Shortcuts:** B cycles frames (skipping the particle frame without a selection),
  L returns to the lab, G toggles the rulers and key, W tilts between plane and spacetime, O boosts
  between Lab and Observer coordinates.

### Lensing

The Frame tab's Backdrop section (`lens-panel.js`, `sim.lens`) turns the grid into a
backdrop seen through the bodies as a thin lens, viewed along z, in the lab frame only.

- **The map** (`lens-deflection.wgsl`, `GPUPhysics.dispatchLens`, from
  `GPUBackend.render()` each rendered frame): one thread per cell of a `LENS_RES`² (512)
  grid over the view, 10% oversized, writes α(x) = Σ 4M𝒟(x − xᵢ)/(|x − xᵢ|² + 10⁻⁴·4M𝒟)
  in physical lens-plane coordinates, the gradient of the 2D log potential, with
  𝒟 = D_L·D_LS/D_S on a log slider (R_E = √(4M𝒟); the core shifts the ring by 5·10⁻⁵ R_E).
  On a periodic domain each lens sits at its image nearest the view's centre, for the map
  and the probe alike (a per-pixel minimum image would tear the backdrop at the seam,
  since α falls only as 1/x); one image per lens is a finite-patch approximation. Black
  holes flag an imposed 3√3·M disk, the Schwarzschild capture impact parameter (no spin
  or charge), since the weak thin lens has no shadow. The lens is instantaneous: no
  moving-lens corrections, time delays or strong-field images, and lab frame only.
- **Drawing** (`grid-render.wgsl`): each pixel samples the map bilinearly and draws the
  rulers at β = θ − α; the domain edge is in the slab and stays unlensed; capture disks
  take the ground's ink.
- **The probe:** a backdrop star of radius r at β_s, placed where the view's centre was.
  Cells whose rays land on it light up in the accent (its images, arcs, Einstein rings)
  and are counted (`lensBuffers.hits`) on a second, `countOnly` pass over a 1024² window
  around the star (±4 R_E for the total mass, at least 20 star radii: a heuristic that
  holds a single lens's images to u ≈ 3.7), so μ = hits·cellArea/(πr²) by inverse ray
  shooting, the magnification of a uniform disk, for any lens configuration; captured rays
  see no star. Results carry `sim.lens.gen`, bumped by every change, so a readback from
  before one is dropped; the panel plots the rest as a light curve.

### Black holes

- **Horizon.** `kerrNewmanRadius()` (`config.js`): `r₊ = M + √(M² − a² − Q²)`,
  `a = INERTIA_K·bodyRadiusSq·|ω|`. Super-extremal inputs clamp to `r₊ = M`, an
  effective radius for stable evolution, not a naked-singularity model. WGSL repeats
  the clamp in many shaders (grep `disc >= 0.0`).
- **Gravity.** Paczyński–Wiita, `Φ = −M / max(r − r₊, BH_PW_MIN_GAP)`, with
  `BH_SOFTENING`: `bhSourceRadius()` copies in `pair-force`, `forces-tree`,
  `compute-stats`, and `heatmap.wgsl` (the heatmap's ignores spin);
  `blackHoleRadialTerms()` in `config.js` for the effective-potential plot.
  Phenomenological, not a geodesic solve.
- **Capture.** In Merge mode a particle whose centre is inside another's horizon is
  swallowed with merge bookkeeping in `resolveCollisions`, whose broadphase reaches each
  body's radius plus the largest radius (a horizon), so a small body deep inside a large
  horizon is found.
- **Extremal censorship.** An over-bound hole sheds same-sign leptons one quantum at a
  time, emitted in its rest frame at 1/√3 and boosted, with recoil, until the lightened hole
  (each lepton takes `ELECTRON_MASS`) is under its Kerr–Newman limit, in black-hole mode
  (`extremal.wgsl`). A clamp to the nearest allowed charge is the backstop when the pool is
  full, and then charge isn't conserved. The leptons' kinetic energy is unpaid, as with
  Schwinger.
- **Hawking** (Black hole + Radiation): Kerr–Newman temperature, Stefan–Boltzmann
  power, none at extremality, on the hole's clock (`dM = P·dt/γ`). Mass leaves at fixed
  proper velocity; each photon is drawn isotropically in the rest frame, boosted, and the
  hole takes the recoil. Below `MIN_MASS` a hole sheds leftover charge as leptons and
  ends in two back-to-back rest-frame photons carrying its four-momentum.
- **Schwinger** (Black hole + Coulomb + Radiation; `schwingerDischarge` in
  `radiation.wgsl`): the rate runs on the hole's clock, and each event emits one
  same-sign lepton in the hole's rest frame, boosted, with exact momentum recoil. It
  costs the hole one charge quantum and `ELECTRON_MASS` but not the lepton's kinetic
  energy; subtracting that too makes the discharge run away.
- **Superradiance** (Black hole + Axion): the rate scales as α² instead of the real
  α⁸, which is too steep to see. Accepted dE enters axion `fieldDot` as an
  energy-normalized impulse and the hole loses `dM = dE`, `dJ = dE/μ_a`, so it
  saturates at `Ω_H ≤ μ_a`. The rate uses `dt/γ`, valid for slow holes (`Ω_H > μ` is
  frame-dependent for a hole crossing the lab grid). `depositSuperradiance`
  (`field-deposit.wgsl`) reads φ² from `axYukMod[pid].w`, written earlier in the substep
  by `applyAxionForces`, and has its own three-group layout.

### Bosons

- Pool caps live in `config.js`: 4096 bodies, 16384 photons, 4096 pions + 4096
  leptons. Leptons share the pion buffer, told apart by `Pion.kind` (0 pion, 1 lepton).
  Every boson pass, the boson tree and its sort are sized by the live counts.
- A body's Larmor and quadrupole radiation accumulates until it reaches `PHOTON_QUANTUM`
  (0.02) and leaves as one photon (`MIN_MASS`, 0.05, stays the Hawking threshold and the
  evaporation floor); quadrupole gravitational radiation leaves as gravitational quanta
  (`FLAG_GRAV`), drawn in madder. A photon is drawn as a wave packet in ochre (`boson-render.wgsl`
  `fragmentPhoton`): a sinusoid 2.6 px high under a Gaussian envelope 22 px long, its
  wavelength `clamp(6·√(0.05/E′), 3.5, 12)` px reading the energy E′ it has in the frame
  drawn (Doppler-shifted in a non-lab frame, with the Doppler hue).
- Absorption (`boson-absorb.wgsl`) adds the boson's full four-momentum, so the target's
  invariant mass changes with its proper velocity; charged pions move charge. `emitterId`
  blocks self-absorption, and nothing is absorbed before `BOSON_MIN_AGE`. Each boson claims
  its absorber in parallel, read-only on the bodies: the nearest body whose radius it is
  inside and that can take it (ties to the lower slot). Then one workgroup per claimed body
  sums its claims in a fixed order and takes them at once, which is exact because
  four-momenta add, and a claim valid alone stays valid in a sum (adding future-directed
  vectors only raises the mass). Bosons never wrap, so on a periodic boundary the search
  folds each into the domain and measures by minimum image; the tree walk resolves ghost
  copies to their originals. The search prunes by each tree node's largest radius + 2, so a
  grown hole widens it near itself only.
- Pion decay runs on the pion's clock: once per frame, `P = 1 − exp(−ln2·Δτ/T½)` with
  `Δτ = dt/γ` (`PION_HALF_LIFE` 32, `CHARGED_PION_HALF_LIFE` 64; pions always dilate,
  since they always carry true proper velocity). `restFrameDt()` and `boostToLab()`
  live in `shared-relativity.wgsl`.
- `PHOTON_CULL_AGE` and `LEPTON_CULL_AGE` are pool culls in lab time, not lifetimes.
- Boson lensing (photons 2× Newtonian, pions `1 + v²`) follows the Gravity toggle.
- Leptons come from Schwinger discharge, extremal shedding, evaporation remnants, and
  charged-pion decay. Photon → pair conversion is deliberately absent.
- **Pion annihilation** (Boson interaction): an opposite-charge pair of the same kind within
  2 annihilates into two photons. It pairs in two passes (`boson-tree.wgsl`): each pion
  proposes to its partner, the lowest-index one above it in reach (found through the
  bosons' tree), and records it; each keeps its lowest proposer; and a pion nobody proposed
  to annihilates with its partner if its proposal was kept, so no pion is in two pairs and
  only a pair's proposer touches either pion.
- **Annihilation** (Merge mode, matter meets antimatter) emits two photons conserving
  lab-frame energy and momentum: the 32-byte `MergeResult`
  (`p0 = x, y, energy, type`, `p1 = px, py, _, _`) → `merge-photons.wgsl` on-device.
  An inelastic merge's lost kinetic energy excites the scalar fields instead (Scalar fields).
- **Kugelblitz**: a boson-tree node of at least `MIN_KUGELBLITZ_COUNT` (4) bosons whose
  energy exceeds half its extent (hoop conjecture) collapses into a particle of mass
  `√(E² − |P|²)` and proper velocity `P/m`, at most one a frame; near-null clusters are
  rejected, and only consumed bosons that were counted as radiated leave the radiated totals.
  The bosons' tree (`tree-build.wgsl` over `tree-items-bosons.wgsl`) is the bodies' layout;
  a leaf names a pion by its pool index with `BOSON_PION_TAG`. Until 2026-10-25 that tree was
  CAS-built and never summed above its deepest level, so boson gravity, pion Coulomb and
  kugelblitz saw an empty tree; with Hawking radiation and Boson interaction on, dense photon
  gas now collapses at that one-a-frame limit.

### Scalar fields

The Higgs and axion fields live on 128² grids with PQS (cubic B-spline, 4×4 stencil)
deposition and interpolation, values clamped to `±SCALAR_FIELD_MAX`. Both fields step by
one joint Störmer–Verlet KDK per substep (`_dispatchFieldStep`), so the Higgs–axion
portal and the shared metric are evaluated at matching times.

**Couplings** (`field-forces.wgsl`, `field-deposit.wgsl`). Higgs: particle mass is
`baseMass·max(|φ|, HIGGS_MASS_FLOOR)`, and particles source the field with
`HIGGS_COUPLING·baseMass`. Axion: `axMod = 1 + g·a` scales EM couplings and charges
source it with `g·q²`; a Peccei–Quinn `yukMod` scales Yukawa and flips sign for
antimatter. Scalar sources couple through proper time (`× 1/γ`). An inelastic merge's lost
kinetic energy enters `fieldDot` as impulses solved against the existing `fieldDot` cross
term, so field kinetic energy rises by exactly the event energy, shared among the active
fields (`field-excitation.wgsl`); annihilation energy is all in its photons. Each event is
consumed once.

**Damping and the bath.** The fields' ether damping (Higgs `2m_H`, axion `g·m_a`) is the
`fieldDamping` setting, on by default. `setHiggsQuench(τ_Q, T)` (the Kibble–Zurek preset)
ramps the Higgs mass term as `ε·μ²`, ε = −1 + t/τ_Q clamped to [−1, 1], and adds a
Langevin bath on the Higgs damping, its own pass (`higgsLangevin`) once per substep with
`⟨ξ²⟩ = 2γT·dt/cellArea` and counter-based draws keyed by cell and substep. The quench and
the bath do work the ledger doesn't book. The Higgs overlay measures
from the current vacuum √ε and colours φ < 0 with the enhanced hue.

**The quench's readouts** (`quench.js`). `startQuench()` sets φ ≈ 0 and starts the quench
at the store's `quenchTime` (the Higgs section's Quench time slider, logarithmic from 10 to
1000, shown while a quench runs; changing it re-runs the quench; saves leave it out with
the field). `QuenchPanel` reads the 128² Higgs grid back about four times a second while a
quench runs (`GPUPhysics.readHiggsField()`) and `measureHiggs()` measures it: the ordered
fraction, the cells within v/2 of ±v (v = √ε), and the walls by the Kibble–Zurek oracle's
count, sign changes between neighbouring cells per unit length of grid line, shown as wall
length per area (π/2 times the count, Cauchy–Crofton for walls at every angle), as formed
(the first readback that passes the oracle's ordering test: mean |φ| at least v/2 and 0.2)
and now. The Stats tab's Quench section shows them, and the caption calls the field frozen
into domains only once at least half the plane is ordered and the walls are counted.

**Under expansion** the grid is comoving (its cells grow with a, so the Laplacian is
physical), `hubbleFriction` applies `φ̇ ← φ̇·e^{−3H dt/2}` before and after each substep's
KDK (Strang; each half metered by the ledger), particle sources
thin by 1/a, and the slab's field energy and momentum are a times the grid's (stats,
Friedmann density, excitation and superradiance impulses scaled by 1/a). The
convention: the grid holds the dimensionally reduced field ψ = √ℓ·φ_3D, uniform through
the slab, so the slab's energy is a·ℓ·Σ(…)dA in φ terms and the ℓ is absorbed into ψ and
the couplings.

**Grid gravity.** With Gravity on, the fields evolve in the metric
`ds² = −e^{2Φ}dt² + e^{−2Φ}d𝐱²`, where the Klein–Gordon equation is exactly
`φ̈ = e^{4Φ}∇²φ − e^{2Φ}V′ + 4Φ̇φ̇` (the 3+1 weak-field form at small Φ, with no
gradient-coupling term). Particle sources carry `e^{5Φ}` in the kick (the e^{Φ} of
proper time on top of the kinetic normalization), and damping is a proper-time rate
(`× e^{Φ}`). `field-gravity.wgsl` builds Φ on one shared grid
(`createGravityGridBuffers`): Φ_F from both fields' energy (also the field → particle
force) and Φ_P from the particles' rest mass, each an FFT convolution with
`−1/√(r² + ℓ²)`, `ℓ = SHEET_THICKNESS` (8, independent of the particle softening ε).
ℓ is comoving: Ĝ is built on the comoving grid and the unpacks scale by 1/a, the fields'
source is their slab energy, and while the universe expands Ĝ drops k = 0.
`metricPhi = Φ_F + Φ_P` is solved before the first half-kick and after the drift; Φ̇ is
the backward difference between consecutive post-drift solves. The FFT stage
parameters are a static uniform table picked by dynamic offset: a `queue.writeBuffer`
per stage would land before the whole encoder ran (that bug left Φ ≡ 0 until
2026-10-23). The circular convolution treats every boundary mode as periodic.

### GPU backend

- **Shaders.** `fetchShader()` loads `src/gpu/shaders/<file>?v=${SHADER_VERSION}`;
  `getSharedPrefix()` prepends `buildWGSLConstants()` (generated from `config.js` and
  the palette), `shared-structs`, `shared-topology`, `shared-rng`, and
  `shared-relativity.wgsl`. Tree walkers add `shared-tree-nodes.wgsl`; many shaders
  also prepend `common.wgsl`.
- **Buffers.** Packed structs (`shared-structs.wgsl`, sizes in `gpu-buffers.js`) keep
  each stage within the 10 storage buffers `requestDevice()` asks for. Every per-slot buffer
  is allocated for the cap (`GPU_MAX_PARTICLES`, 4096) except the world-line store: the rings
  (48 KB a slot) and the light-cone hints (capacity²) grow through `STORE_TIERS` (512, 1024,
  2048, 4096 slots) as `addParticle()` or a load needs them (`_growStore`), each ring copied
  to the same offset and every bind group that reads either rebuilt (the renderer's through
  `onStoreGrown`), and `reset()` gives the memory back. `SimUniforms.maxParticles` is the
  store's capacity: the hints' stride and the ghost slots follow it.
- **Pass plan.** `pass-graph.js` derives dispatch booleans from toggles only, not alive
  counts. Boson passes are not in it: bosons outlive the switches that emit them, so they
  step every substep, sized by their pools' counts through indirect dispatch from
  `dispatch-args.wgsl` (with a max-capacity fallback). Absorption is a claim pass per
  pool and a gather over the bodies, through `absorbClaims` (per-body counts, then each
  boson's absorber as slot + 1). Per-body CAS float accumulators measured the same at low
  contention but 40× slower with 4096 bosons on one body, and their sums depend on order.
- **Trees** (`tree-build.wgsl`, one build for the bodies every substep, twice with 1PN's
  velocity-Verlet correction under Barnes–Hut, and one for the bosons with Boson interaction;
  the items come from `tree-items-bodies.wgsl` or `tree-items-bosons.wgsl`): the bounds, the
  padded root box, a key per active item (a 30-bit Morton code and the slot) packed to the
  front (about a square root box, so every cell is square), `treePlan` (one thread: the sort's
  size from the live count and every sort step's
  workgroups, for indirect dispatch from its own buffer, since a dispatch can't read its size
  from a buffer it writes), a bitonic sort (blocks of 1024 in workgroup memory, then the wider
  steps by dynamic offset into a step table), the binary radix tree (Karras 2012), and a
  compressed quadtree in the 20-word node layout: a cell exists where its items split among
  two or more quadrants, its two to four children fill the first slots, and a leaf is a node
  whose first slot is NONE. Every cell a CAS-built tree would add holds the same items as a
  cell this one has, so Barnes–Hut sees the same aggregates. A node covers a contiguous range
  of sorted items, so one workgroup per node sums its range of leaves (`reduceNodes`, after
  the dispatch that writes the leaves): no node reads another's sums, since WGSL's relaxed
  atomics would not order a climb's reads after its children's writes. Internal nodes carry
  their cell's bounds, leaves their item's position; word 17 counts the items under a node,
  word 19 holds their largest radius.
  The same positions give the same tree every run. The CAS-built tree this replaced lost
  bodies when a subdivision raced a claim, so at a few hundred bodies its root was often never
  summed and Barnes–Hut applied no force.
- **Events.** The frame's readback (`_encodeFrameReadback`) copies the largest
  acceleration, the ghost count, merge and kugelblitz events and the free-slot stack at the
  end of the frame's last encoder into a slot of a three-deep ring, clears the GPU free stack
  in that same encoder (so each freed slot reaches the host once), and maps once; events
  append until consumed, and a readback from before a `reset()` is dropped (which also clears
  the GPU event counters). Merge events are read only while a field can take their energy
  (`_dispatchFieldExcitations`, 64 a substep) and come from a frame's last substep only, since
  each substep's collision pass resets the counter; a kugelblitz collapse waits for a frame with
  a free readback slot, since its bosons are consumed on the GPU and its body is spawned by
  `GPUBackend` from `consumeKugelblitzEvents()`. Hit tests, stats, the scene snapshot, the heatmap, the lens probe and the frame
  state have their own on-demand channels.
- `_phase5Ready` holds field dispatches until the async field pipelines exist.

### The Fields overlay

The View section's Fields toggle (with All, Gravity, Electric, Magnetic and Yukawa) draws the
heatmap grid (`heatmap.wgsl`, over the view, or the visible plane's box when tilted) the way
a survey sheet or a physics text prints a field, keeping to the domain:

- **The atlas** (`src/field-atlas.js`, on the overlay canvas). `heatmap.wgsl` also stores the
  charges' electric field (`elecField`, a vec2 per cell: Liénard–Wiechert with signal delay,
  else softened Coulomb, the tree path pairwise); `GPUPhysics` copies the grids, E and the
  bodies' state into `_heatmapStaging` at the end of `dispatchHeatmap` and maps it after the
  frame's submit (`heatmapReadback`, a frame or two late). From each readback the atlas
  draws gravity's potential as umber contours at nice levels (1, 1.5, 2, 3, 5, 7 × 10^k over
  `LEVEL_SPAN`), the 1s and 3s heavier and labelled, ticked downhill like depression contours;
  the electric field as prussian field lines traced (RK2, 0.6 cell) from the sign carrying
  more charge, about 10·√(|q|/0.4) per charge (thinned evenly past 600 lines in all), each
  ending on the other sign (found through a grid of the charges), at the view's
  edge, or where it meets another line (a 1.2-cell separation grid), with a chevron at 45%
  of its length; in the Electric view, equipotentials one a decade, solid sienna where
  positive and dashed prussian where negative; and Yukawa's potential as dotted viridian
  contours. A uniform external E has no structure and would swamp the softened charges'
  fields (~0.002 against 0.12 in the cyclotron), so it stays out and the key names it.
- **Bz as ⊙ and ⊗** (`heatmap-render.wgsl`, on the GPU): the field is out of the plane, so it
  has no line to draw. The grid computes Bz (`magField`) as `pair-force.wgsl` has it:
  Biot–Savart from moving charges, or with signal delay B = n̂ × E of the Liénard–Wiechert
  field; the spin dipoles' −μ/r³; and the external Bz. Symbols sit on lattices fixed to the
  plane, the spacing halving per decade: every site of a coarse lattice (a power of 2 in
  world units near 64 px) once |Bz| passes B0 = 0.1, the sites halfway between once it passes
  10·B0, and halfway again past 100·B0, so a uniform field is an even lattice whose spacing
  reads its strength. World y runs down the screen, so the right-handed z axis points into
  it: Bz > 0 is ⊗.
- **The scalar fields** (`field-render.wgsl`, whenever Higgs or axion is on): no wash. Each
  side of zero is hatched its own way, 6 px apart (the Higgs +v in sap `/`, −v in violet `\`;
  the axion indigo and ochre, its sign from a smoothed sample), once the field has left the
  noise (`smoothstep(0.01, 0.06, |φ|)`); the zero contour is drawn heavier in the text ink
  (the Higgs's domain walls, the axion's nodes) where the field two cells away has left zero
  too, and the Higgs takes thin contours every v/4, faded at the vacuum.

### Chrome

Worldline was the overhaul's pilot (`../../docs/sim-overhaul/PLAN.md`) and loads neither
`shared/hud.css` nor `toolbar.js`. The page is a grid: the scene (a stage for the canvases
over a hairline figure bar) and the margin. The shared colophon (`_colophon.mount`, with
translated labels) carries play, step, theme and help; the figure bar carries the caption
(`caption.js`: "Fig. 1.", the preset's name, then what it shows with its live values, or the
view, the observer and the selected body, rebuilt a few times a second; tilted, the twin
and Kibble–Zurek keep their own text, the twin's read off the beads, and the other presets
give way to the plate's) and the
Plane/Spacetime, Lab/Observer and Boost controls; the stage's top right has speed, language,
the touch-only antimatter mode and the Controls toggle (at 600 px and below `ui.js` moves
speed and language to the sheet's foot and antimatter into the figure bar, so the top keeps
to one row). The margin holds the old sidebar's tabs on the same paper, ruled off by a
hairline, with the gear menu's view toggles moved into Settings and Reset/Save/Load at its
foot; on a narrow window it rises as a sheet. `styles.css` styles every control here
(hairline switches that take a wash of the force's ink when on, sliders in the force's ink,
ruled dropdowns), since `hud.css` no longer applies. `resize()` sizes the canvases to the
stage (a ResizeObserver), so opening the margin narrows the scene.

The plate's furniture, all hidden with the rulers by G ("Rulers and key"):

- **The key** (`scene-key.js`, `#scene-key`, the stage's bottom right; not on a stage under
  700 × 420): a double hairline box titled Reference with a row for each mark the scene is
  drawing now, from `sim.scene` (a slow snapshot of the bodies, `GPUBackend._readScene`), the
  settings and the view: bodies by kind, the selection, world lines and their bead step,
  clocks, light (photons in the pool), the cone and events when tilted, the Fields layers, the
  scalar hatching, a uniform external field with its value, the lensed backdrop and its star.
  Swatches are inline SVG with the scene's own marks in `var(--ink-*)`; the DOM is rebuilt
  only when the rows change. `decorateMargin()` gives each Forces and Physics row the same
  swatch for its force, so those sections read as the scene's legend; one ink per force,
  margin and scene alike (1PN mulberry, Relativity and boson interaction graphite as modes).
- **The scale bar** (`Overlay._drawScaleBar`): bottom left seen from above, a 1, 2 or 5 × 10^k
  length up to 120 px, "length, c = 1". Tilted, `_drawDimension` sets a dimension line along
  the box's front edge instead.

One red: the accent marks only the selected body, its world line and cone, and the lens
probe's star. Force arrows are px hairlines, the total in the text ink and components in
their force's ink; velocity arrows are graphite; clock arcs take the body's ink.

### Rendering

`GPURenderer` draws on `#gpuCanvas`, behind the 2D `#simCanvas` that `Overlay` uses for
the field atlas, the spawn-drag line and the plate's lines. Every layer draws in order into
one render pass and one submit (`render()` → `_drawLayers()`): on a tiled GPU each pass loads
and stores the whole canvas, which cost more than the layers did. Uniforms are written per
layer, and per slot for the rings, arrows and torques, so each draw reads its own. The pass
clears and starts with the background grid (`grid-render.wgsl`), a full-screen triangle
that draws the lab rulers and the domain edge: hairlines at
spacings 2^k, each level faded in between 12 and 24 px on screen, and the edge (or, in loop
mode, the seams) in the `--border` mix. The grid is a sheet at rest in the lab, so in a
non-lab frame each pixel maps back through the observer's slice and the rulers contract by
1/γ along u and turn with co-rotation; `sim.view.grid` (G) hides the rulers, the key and
the scale but not the edge. Bodies, their clock rings, and their ring overlays share the
camera uniforms' `relativityOn`, `blackHoleOn`, `showClocks`, `frameOn` and `frameImages`
flags. It clears to `_PALETTE.{light,dark}.canvas`, with light/dark
pipeline pairs that `setTheme()` swaps; both blend alpha-over (the dark theme's additive
blend and the bosons' glow halos are gone: they read no quantity). Colours are the shared
inks, theme-paired: WGSL gets `INK_<NAME>_L`/`_D` constants (graphite is `textMuted`), and
the force and torque tables are built per theme. `syncRendererTheme()` in `ui.js` sets both;
`GPUBackend.create()` adopts `sim.overlay.isLight` after `renderer.init()` because it is
created after the first sync. WGSL theme colors are light/dark constant pairs picked by
the `isDarkMode` uniform. The sidebar plots redraw with every stats readback, so their
canvas text needs no font-load redraw.

## Conventions

- **Naming.** Code, comments, and UI text say "signal delay" or "finite-speed force
  propagation", never "retarded potential(s)" (a9's rule; `docs/ROADMAP.md` §11 adds
  "light-cone" and "Liénard–Wiechert").
- **Force laws.** A force-law change touches `pair-force`, `forces-tree`,
  `compute-stats` (PE), and `heatmap.wgsl`, and `effective-potential.js` for the plot;
  a 1PN change touches `shared-1pn.wgsl` alone. Spin-orbit (`spin-orbit.wgsl`) applies
  `F = μ∇Bz` and `F = +2L∇Bgz` (a spinning body's gravitomagnetic moment is 2L), from the
  moving-source field gradients only: dipole fields add no gradient, since the direct
  dipole-dipole terms already carry spin-spin.
- **Constants.** WGSL constants are generated from `config.js`, but the toggle bits are
  written twice in `gpu-constants.js` (WGSL string and JS exports), and tree node
  layouts are repeated in `boson-tree` and `kugelblitz.wgsl`. JS uniform writers follow
  WGSL struct member order; the post-substep `dt` is a raw write at byte 0 of
  `SimUniforms`. Event records are mirrored between shaders and the readback parsers in
  `gpu-physics.js`: a 32-byte `MergeResult` change also touches `MERGE_RESULT_SIZE`,
  `collision.wgsl`, `merge-photons.wgsl`, and the field-excitation upload. The stats
  readback layout is listed at the top of `compute-stats.wgsl`: 128 words of results, then
  each stats pass's per-workgroup partials (`STATS_LAYOUT` in `gpu-constants.js`, generated
  into WGSL), which one `statsReduce` workgroup adds in a fixed order, so the same state
  reads back the same sums.
- **Shader cache.** Bump `SHADER_VERSION` after any WGSL edit; the query string is the
  only cache key.
- **New toggle or parameter.** Update `physics-contract.js` (`TOGGLE_KEYS`, or
  `PARAMETER_KEYS` and `GPU_PARAMETER_SLOTS`), the default in `physics-settings.js`,
  `ui.js` (`toggleDefs` and deps, or `storeSliders`), and `GPUPhysics.setToggles()` with
  its bit, then check that saves round-trip it. Presets and saves need nothing more:
  `applyConfig()` carries every store key.
- **Saves.** `version: 2` holds the domain, particles with τ and θ, toggles,
  parameters, modes, speed, friction, and camera; fields, bosons, and world lines are
  not saved. `migrateState()` lifts a version 1 save (domain = this window / 16, clocks
  at 0). The quick-save key `nohair-quicksave` and download name `nohair-state.json`
  are stored names; renaming them orphans saves.
- **GPU slots.** `GPUPhysics.addParticle()` initializes every per-particle buffer.
  `axYukMod` starts at `(1, 1, 1, 0)` because its components are multiplicative
  modulations (EM coupling, Yukawa coupling, Higgs range factor) that zeros would switch
  off. The alive sentinel for `deathTime` is `FLT_MAX` (3.4028235e38), not `Infinity`.
  Slots are recycled through the free stack, so a slot index names a particle only
  while it lives.
- **Command ordering.** `queue.writeBuffer()` lands at submit, before any of the
  encoder's passes. Substeps submit separately, so uniforms may differ between them;
  anything that must differ between passes of one substep goes through
  `encoder.copyBufferToBuffer()`, `clearBuffer()`, or a dynamic offset into a static
  table (the FFT). Each readback channel's pending flag skips new copies while its
  staging buffer is mapped and clears in `finally`, so a lost device cannot wedge it.
- **Bind groups.** One buffer may not fill two writable bindings of a dispatch; dummy
  placeholders come in distinct buffers.
- **WGSL.** Merge resolution guards with `mass <= EPSILON`, not `== 0`, because pairs
  race; NaN guards come before global-memory writes; render pipelines use premultiplied
  alpha with `srcFactor: 'one'`; entry points sharing a module declare shared bindings
  `read_write`.
- **World-line cadence** is by lab time, not ticks: `_nextWorldLineTime` steps to the
  next multiple of `WORLDLINE_DT`, so a sample lands at the end of the substep that
  crosses it.
- **Topology.** Klein and RP² crossings flip velocity and spin and mirror θ; periodic
  modes add ghost copies so tree forces cross the boundary, and world-line
  interpolation wraps through `minImage()`.
- **Input.** The antimatter mode (X, a touch-only button) drives touch only; mouse users spawn
  antimatter with right-click. Click resolution is `InputHandler._resolveClickHit()`:
  a click of the particle's own kind selects, the other kind deletes; black-hole mode
  never spawns antimatter.
- **CSS.** The shared `.mode-toggles` sets `display: flex`, which beats the `hidden`
  attribute, so those rows are shown and hidden with `style.display`. `base.css` does the
  same for `.panel-section`; `styles.css` restores `.panel-section[hidden]`.
- **URLs.** Worldline's own files load by relative URL (`styles.css`, `colors.js`, `main.js`,
  the shaders), which resolves only under `/worldline/` with its trailing slash.
- **Storage keys keep earlier names.** Worldline was Geon until 2026-10-23
  (`/geon` now redirects here), and No-Hair before that. `geon-lang`,
  `geon-theme`, and `nohair-quicksave` stay as they are so saved settings and
  quick saves survive; renaming them orphans user state.

## Open work

`docs/ROADMAP.md` holds the plan. Its §3 lists 2.1's fixes (performance, structure, what
2.0 shipped) and §7.3 the model's known boundaries, which hold through 2.5. The presets cut
in 2.0 showed several of those boundaries: the inspiral gained energy under gravity's signal
delay, the precession preset's planet escaped at once with 1PN on inside the softening
length, and the nucleus preset's Yukawa well drove bodies to about 3c. Preset facts that
follow from them:

- The bremsstrahlung beam's electrons have m 0.3 because radiation reaction is strong at
  these charges: Larmor's τ = 2q²/3m is 6.7 for m 0.1 and q −1, comparable to a pass, so
  such an electron radiates more than its kinetic energy and is captured.
- The cyclotron's synchrotron light is weak at 0.5c: a few photons a run.
