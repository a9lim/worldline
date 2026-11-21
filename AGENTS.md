# Worldline

Worldline is a relativistic many-body sandbox at a9l.im/worldline: charged, spinning particles
under gravity, electromagnetism, gravitomagnetism, Yukawa and scalar fields, with black holes,
radiation, and photon/pion/lepton pools, drawn on a plate that tilts into spacetime. Vanilla ES
modules; the physics runs as WebGPU compute shaders and draws with WebGPU instanced rendering, with
no CPU fallback. KaTeX from jsDelivr renders the reference overlay. It is a submodule of the a9l.im
repository (`a9lim.github.io`, at `projects/worldline`); the root `AGENTS.md` covers the shared
layer, design system, build and deployment.

`docs/ROADMAP.md` is the plan of record: the planar-laboratory thesis, the list of figures, the
versions ahead and a9's decisions. `docs/MODEL.md` is the physics model: each law as it runs
(**Now**, with its known boundaries) and as 2.5 will make it. `about.md` is the public description
of every law. This file is the code's map, its invariants and the reasons for them.

## Running and checking

- **Preview** from the parent build at `http://localhost:8000/worldline/`, or without a build:
  `node docs/second-pass/tools/serve.mjs PORT` serves this checkout with the parent's `shared/`.
  `?lang=ja` gives Japanese; `window.sim` is the live `Simulation`.
- **Syntax:** `for f in main.js colors.js src/*.js src/gpu/*.js i18n/*.js tests/*.mjs; do node --check "$f"; done`
- **Tests:** `node --test 'tests/*.test.mjs'`, Node 22+ with nothing installed.
  `prescribed.test.mjs` and `radar.test.mjs` run anywhere. `gpu.test.mjs` runs the GPU oracles
  (`tests/physics-validation.html`) in a headless Chrome, one subtest a case, when `CHROME` names
  a Chrome binary, and skips otherwise; `WEBGPU=swiftshader` uses Chrome's software adapter and
  `CHROME_FLAGS` adds flags. It needs the parent's `shared/` two levels up. On an M5 Max the suite
  takes about 5 s on the GPU and 110 s on SwiftShader, 40 s of which is compiling the pipelines
  once. By hand: open `/worldline/tests/physics-validation.html` and press Run, or
  `await window.__run('Liénard')` for the cases whose names contain the string.
- **What earns a test:** a check where a failure would be silent or hard to see by running the sim
  (a conservation law, an analytic oracle, a save round trip, CPU–GPU agreement, a structural
  invariant of a tree or pool), one per mechanism, and never a snapshot of a tuned value. A figure
  is not a test by default (`docs/ROADMAP.md` §1.3). The oracle page shares one `GPUPhysics`,
  `reset()` between cases (pipeline compilation dominates on a software adapter), so a case sets
  everything it relies on and reads the boson pools only up to their counts.
- **WGSL** compiles only in the browser. Pipelines are created synchronously, so a compile error is
  a WebGPU validation error, not a throw (the oracle page fails the case it lands in); a missing
  shader file does throw, and the page logs `[worldline] GPU init failed` and shows the WebGPU popup.
- **`?perf`** (`src/gpu/gpu-profiler.js`, `sim.perf`) times every compute and render pass by
  wrapping the encoder while a frame is open, plus the loop's CPU phases, submits, writes and maps.
  Passes overlap on Metal, so their sum (`gpuBusy`) overcounts: read `gpuSpan`, `stepSpan` and
  `renderSpan`. A light scene lets the GPU clock down; `docs/ROADMAP.md` §13 says how to read the
  numbers.
- **Tools** (`docs/second-pass/tools/`, Playwright from `~/Work/Exploratory` and Chrome for
  Testing; usage in each header): `tour.mjs` runs scenarios and benchmarks over
  `bench-scenarios.json`, the standing set; `bench-compare.mjs`, `bench-ab.mjs` (two trees
  alternated) and `bench-b2b.mjs` (steps and renders timed back to back, which settles what a live
  A/B can't) compare trees; `tree-vs-pairwise.mjs` measures the force walk; `shots.mjs` freezes
  every preset into a reproducible frame and `shots-diff.mjs` diffs two runs with their physics
  hashes (an unchanged tree reproduces byte for byte); `cvd.mjs` scores the inks under
  colour-vision deficiencies. Concurrent GPU work skews benchmarks.

## Layout

```
index.html               page shell: colophon, scene and figure bar, margin (Figure / Laws / World / Measure), JSON-LD
main.js                  Simulation: state, device lifecycle, fixed-timestep loop
colors.js                freezes the shared tokens (Worldline reads the inks directly)
i18n/strings.js          UI strings (en, ja); merges strings-reference.js (reference overlay)
src/config.js            constants, mode enums, Kerr–Newman and Paczyński–Wiita helpers, the force-summation rule
src/physics-settings.js  the toggle and parameter store (sim.settings); applyConfig(), for presets and saves
src/physics-contract.js  toggle/parameter keys shared by save/load and the GPU slot map
src/ui.js                colophon, figure bar, the margin's tabs over the store, LAWS (prerequisites), shortcuts, about
src/controls.js          the margin's controls: choices (words), knobs (numbers you drag), field pads
src/marks.js             the plate's marks as inline SVG: key swatches, ticks' marks, figure drawings, edge diagrams, glyphs
src/input.js             spawn, select, delete through GPU hit tests; the hand; the sheet's edge; orbiting the view
src/spacetime.js         the spacetime view: orbit camera over the 2D camera, Lab/Observer boost, the display transform
src/caption.js           the live figure caption: Fig. N, the figure's values and knobs (en, ja)
src/scene-key.js         the key at the stage's bottom right (en, ja)
src/overlay.js           the 2D canvas above the GPU canvas: field atlas, spawn line, scale bar, the box and presents
src/field-atlas.js       the Fields overlay's contours and field lines, from the heatmap readback
src/presets.js           the figures in five chapters (CHAPTERS, PRESET_ORDER): data, knobs, spawn, observer, tick
src/prescribed.js        prescribed world lines' curves: evaluation, packing for the GPU (the CPU reference)
src/radar.js             radar time and distance for an observer whose world line is known
src/frames.js            the observer the view is drawn for (sim.frames), FrameParams
src/frame-panel.js       the Figure tab's Observer and the Measure tab's readouts of it
src/streak.js            the streak plate under Seen
src/quench.js            the Higgs quench and its measurements
src/cosmology.js         the scale factor a(t): schedules, the Friedmann closure, horizons
src/cosmology-panel.js   the expansion readouts and the overlay's horizons
src/lens-panel.js        the Backdrop (distance, the microlensing probe) and its light curve
src/save-load.js         quick save (localStorage), JSON download/upload, migration from version 1
src/stats-display.js     the Measure tab's ledger (drift sparklines) and the selected body
src/phase-plot.js, effective-potential.js, plot-labels.js   the selected body's plots
src/i18n.js, reference.js, topology.js (minImage), fft.js (Green's function), vec2.js
src/gpu/gpu-backend.js   GPU runtime: step, events, render, stats, auto-save
src/gpu/gpu-physics.js   GPUPhysics: buffers, dispatch, readbacks, serialize
src/gpu/gpu-fields.js    the scalar fields' half of GPUPhysics (installed on its prototype)
src/gpu/gpu-profiler.js  ?perf
src/gpu/gpu-pipelines.js pipelines, fetchShader, SHADER_VERSION
src/gpu/gpu-buffers.js   allocation and packed struct sizes
src/gpu/gpu-constants.js generated WGSL constants, toggle bits, STATS_LAYOUT
src/gpu/gpu-renderer.js  instanced rendering, light/dark pipeline pairs
src/gpu/pass-graph.js    per-frame dispatch plan
src/gpu/shaders/         WGSL; shared-*.wgsl are prepended includes, tree-items-*.wgsl the trees' items
tests/                   physics-validation.html (GPU oracles), gpu.test.mjs (its driver), *.test.mjs (Node)
docs/                    ROADMAP.md, MODEL.md; second-pass/tools/ (harness, benchmarks, screenshots)
```

## State

- **The GPU buffers are the only particle state.** A slot index names a body only while it lives
  (slots recycle through the free stack; `(slot, generation)` names one across reuse). Selection is
  a slot; a selection whose body dies clears itself, and each stats readback carries the selection
  and state version it was requested for, so one in flight across a change, reset or spawn can't
  set the selection or the drift baseline.
- **One path into the state:** presets and saves go through `applyConfig(sim, { settings, modes,
  speed, view })`, which writes the store, then `sim.syncControls()` shows it without firing
  handlers, then `update()` applies the laws' prerequisites (`LAWS`, in order) and the mode locks
  (black holes force merge collisions; expansion forces the torus), which may turn more off, and
  pushes the result to the GPU. A preset is data: what it doesn't turn on is off (except the
  rulers and key), what it doesn't set is default.
- **A figure** is a preset loaded by `sim.loadFigure(key)`; its per-load state is `sim.figureRun`
  and its `tick` is `sim.presetTick`, both cleared by `reset()`, so nothing outlives the run.
- **The domain is state, not the window** (`sim.domainW/H`, default 64, saved); resizing the window
  moves only the camera.
- **Device loss** recreates the device and restores the backend's auto-save (every 300 stepped
  frames; fields and bosons aren't saved). The loop stops while the tab is hidden.

## Units and signs

- c = G = ħ = 1. `WORLD_SCALE` (16) is pixels per world unit at zoom 1. Linear and rotational state
  are proper velocities (`velW`, `angW`); `derived.vel`, `angVel` come from them and equal them with
  Relativity off. The spin slider is a surface speed. The body radius is ∛m (`bodyRSq` = ∛m²), the
  source of moment of inertia, magnetic moment and angular momentum; in black-hole mode `radius`
  holds the Kerr–Newman horizon. The one canonical spin is J = I·angW.
- Charges are multiples of `BOSON_CHARGE` (0.1): `addParticle()` rounds, and every emission,
  absorption, decay, discharge and shedding moves whole quanta.
- **Force signs.** In the force shaders r is source − observer, so a positive radial coefficient
  attracts. The Boris rotation parameter is `(q/2m)·Bz + 2·Bgz` scaled by dt/γ, so the stored fields
  act as `F = q v × B + 4m v × Bg`. Moving charge: `Bz = −q (v × r)_z/r³` (parallel currents
  attract); magnetic dipole: `Bz = −μ/r³` (aligned dipoles side by side repel, −3μ₁μ₂/r⁴); moving
  mass: `Bgz = +m (v × r)_z/r³` (parallel mass currents repel; `4m v × Bg` is exactly EIH's v₁·v₂
  sector, which the 1PN pair force leaves out); spinning mass: `Bgz = +J/(2r³)` (prograde orbits
  slow, Ω = Ω_K − J/r³; the gravitomagnetic dipole force +3L₁L₂/r⁴ attracts). These were reversed
  until 2026-10-23; the oracle page checks the magnetic and gravitomagnetic ones.
- **Energy** is rest plus kinetic, spin, each force's conserved potential (`statsPE`), the fields'
  slab energy and radiated: the pools, the pending accumulators, and escaped radiation, which the
  pool culls hand to `GPUPhysics.ledger.escapedE` instead of destroying. `docs/MODEL.md` §5 says
  what is booked and what isn't.

## Time and the step

- `GPUPhysics.update(dt)` splits a frame into at most 32 substeps from the previous frame's
  `maxAccel` readback, `dtSafe = √(softening/a_max)`; with ε = 8 that is almost always one. Each
  substep is its own command buffer, so its uniforms (`simTime` above all) are the ones its passes
  read. `_dispatchSubstep()`'s pass comments are the order. The step depends on the wall clock;
  `docs/MODEL.md` §4 is its replacement.
- The scheme is the staggered Boris pusher: both half-kicks precede the drift, so velocities sit
  half a kick from positions; spin–orbit kicks change `w` directly. 1PN forces are
  velocity-dependent and break Newton's third law, hence the velocity-Verlet correction. The clocks
  must run before it: Thomas precession subtracts the 1PN force (`allForces.f2`), which the
  correction overwrites.
- **GPU times are f32 on a rolling epoch** of the world-line clock (lab time, or conformal time η
  while the universe expands, kept in f64 as `conformalTime`): past `EPOCH_SPAN` (512) the epoch
  advances by `EPOCH_STEP` (256) and every stored time shifts back (`worldline-rebase.wgsl`), each
  line mapped back to the identity deck. Only world-line samples, creation times and `deathTime`
  hold absolute GPU times. World-line cadence is by that clock, not ticks.
- The world steps with no bodies alive: the body passes skip, the fields and bosons go on.

## Expansion

- **Expansion requires the torus** (the toggle switches the boundary to loop and the topology to
  torus): the universe is the periodic domain, a slab of comoving thickness `SHEET_THICKNESS` cut
  from flat 3D FRW. Klein and RP² aren't homogeneous, and there a uniform background's
  minimum-image pull doesn't cancel.
- **Physical coordinates on a growing domain:** `sim.domainW/H` is comoving; `GPUPhysics.domainW/H`
  is a times it, and the forces never see a. `update()` stretches positions by √r and peculiar
  momenta and photon energies by 1/√r before and after the substeps (Strang), which run static at
  the midpoint a (`_frameA`). `GPUBackend._advance` splits a frame whose H·dt exceeds 0.02. a stops
  at `A_MAX` (1000) with a toast.
- **World lines are comoving and conformal** (C = x/a, η, dw/dη), so `retardedState()` solves the
  flat cone in (η, C) and Liénard–Wiechert's flat formula gives E_phys = E_conformal/a² (Maxwell is
  conformally invariant). Non-lab frames are off once a ≠ 1: FRW has no global boosts.
- **The ledger:** `ledger.expansionWork` is the energy expansion took, metered at each operator
  (the stretch in `expansion.wgsl`, the fields' Hubble friction in `field-ledger.wgsl`, potentials
  to first order in JS), so E + W holds. Momentum drift compares a·P, which expansion conserves on
  the torus. The Friedmann closure's ρ̄ comes from each stats readback; between readbacks matter
  and fields scale as a⁻³ and radiation as a⁻⁴.

## Forces and trees

- **Fourteen toggles** (`TOGGLE_KEYS`). Less obvious couplings: signal delay runs whenever
  Relativity is on, and with it charges interact through their Liénard–Wiechert fields; field
  gravity follows Gravity; lensing follows Gravity; Boson interaction acts through Gravity or
  Coulomb and builds its own tree; kugelblitz runs under Boson interaction with Gravity. The 1PN
  pair forces (`shared-1pn.wgsl`, shared by the force pass and the recompute): EIH with
  Gravitomagnetic, Bažański's mixed term with Gravitomagnetic and Coulomb, scalar Breit with
  Yukawa. There is no Darwin term: Liénard–Wiechert carries EM to all orders in v.
- **The fields don't modulate the pair laws:** the Higgs-modulated Yukawa range, the axion's EM
  scaling and the Peccei–Quinn factor are removed until they have an action (`docs/MODEL.md` §2).
- **Force summation is automatic** (`config.js` "Force summation", `GPUPhysics._chooseForceSum()`
  on every `update()` and `setToggles()`, so a frame's substeps agree): pairwise below `TREE_ON`
  (1536), Barnes–Hut above until the count falls under `TREE_OFF` (1152), θ ramping log-linearly
  from 0.1 at `TREE_ON` to 0.5 at the 4096 cap. 1536 is the open-domain crossover at θ = 0.1 (M5
  Max, the force pass's own timestamps), where the walk is 0.01% rms from the pairwise sum; at the
  cap it is 0.7% and a quarter of the pairwise cost. On a periodic domain the walk gains at most a
  third and near 4000 uniform bodies sometimes takes 5–6 ms against 0.75 (cause not isolated: the
  half-domain criterion opening every node near a plane, or group boxes Morton jumps make large),
  so periodic domains stay pairwise (`TREE_ON_PERIODIC` 8192). With Relativity every force is
  pairwise from the world lines, since a node's aggregate has no world line. `forceSum` is the
  readout; `treeOverride` and `thetaOverride` pin it for oracles and benchmarks. The boson tree's
  walks have no pairwise alternative and keep θ = 0.5.
- **Trees are built from sorted keys** (`tree-build.wgsl` over `tree-items-*.wgsl`: Morton codes, a
  bitonic sort sized on the GPU by `treePlan`, Karras's radix tree, a compressed quadtree), so the
  same positions give the same tree. The CAS-built trees they replaced lost items when a
  subdivision raced a claim, and their roots were often never summed, so every walk quietly
  returned nothing: test a tree by its root. Each node sums its own range of sorted leaves
  (`reduceNodes`) because WGSL's relaxed atomics don't order a bottom-up climb's reads after its
  children's writes. Word 17 counts a node's items, word 19 their largest radius.
- **The walk** (`forces-tree.wgsl`) is a group walk: 32 Morton-adjacent bodies share one traversal
  into workgroup memory, from a ring with a depth-first reserve so no tree overflows it (a
  breadth-first frontier did, and took nodes whole: a body met its own mass). On a periodic domain
  a node is taken whole only when it and the group's box lie within half a domain, so each body
  sees it in one image (without that, 31% off pairwise). A far node's tidal torque squares its
  total coupling where pairwise sums the squares, a far-field approximation.
- **Ghosts weigh nothing** in the aggregates: every walk takes minimum-image displacements, and a
  weighted ghost would count its pair twice. They exist for seam collisions and absorption, so a
  ghost reaches only a contact (its radius + the largest radius + `GHOST_SLOP`); the host copies as
  many ghost slots as the bodies could fill and `trimGhosts` clears the rest, because it learns the
  count a frame late.
- **Collisions and absorption prune by each node's largest radius**; a collision pair is written by
  its smaller body (the lower slot of two alike), so a small body deep in a large horizon is found
  and a large body's walk stays short. The tree is from before the drift, so the search reaches c·dt
  further.
- **A force-law change** touches `pair-force`, `forces-tree`, `compute-stats` (PE) and `heatmap.wgsl`,
  and `effective-potential.js` for the plot; a 1PN change touches `shared-1pn.wgsl` alone.
  Spin–orbit applies `F = μ∇Bz` and `F = +2L∇Bgz` from the moving sources' gradients only: the
  direct dipole–dipole terms already carry spin–spin.

## Signal delay and world lines

- **`retardedState()`** (`shared-worldline.wgsl`) finds a source's retarded state: the image nearest
  the observer now fixes which copy of the line it sees, a gallop from a hint brackets the past
  cone among the samples, and Newton's method finds it on the cubic Hermite segment. The pair force
  keeps each pair's bracket as the next call's hint (`wlHints`, capacity²), seeded from the
  distance: in a crowded scene paths curve too much over a light-crossing time for a guess from
  now, and a full bisection cost half again as much at 4000 bodies.
- **Which laws read it:** charges act through their Liénard–Wiechert fields, softened by σ³ of the
  retarded distance so a charge at rest gives softened Coulomb, κ floored at `LW_KAPPA_MIN`. Gravity
  (Paczyński–Wiita included), Yukawa and the two dipole forces are static forms at the retarded
  position times the toy aberration factor (1 − n̂·v)⁻³; the Bg fields, frame drag, tidal torque,
  spin–orbit gradients and 1PN take the retarded state without it (`docs/MODEL.md` §3.2, §3.5).
- **Causality at the ends:** a removed body keeps sourcing from its death snapshot until its last
  light has passed. A source's past before its first sample is uniform motion back to its creation
  time and invalid before it, so a body spawned by hand acts once its light arrives; preset and
  loaded bodies are created at −∞ and act at once.
- **The store:** a ring of `WORLDLINE_LEN` (1024) samples a slot, one every `WORLDLINE_DT` (1/8)
  of the world-line clock, 12 floats each (`t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`; a = dw/dt
  with the Boris rotations), on the covering plane through a per-slot deck that every loop crossing
  updates, so C never jumps. A merge writes a break (`FLAG_WL_BREAK`) so no segment smooths the
  jump, and keeps the heavier parent's slot, so its τ and θ carry on. The rings and hints grow
  through `STORE_TIERS` (512 … 4096 slots), every bind group that reads them rebuilt
  (`onStoreGrown`); `reset()` gives the memory back.

## Clocks and spin

- τ advances by `dτ = dt·√max(0, 1 + 2Φ_N − v²)`, Φ_N softened like the force (never
  Paczyński–Wiita, which vanishes at 4M); field gravity isn't in the lapse; with Relativity off the
  lapse is 1 (a9's additive lapse, `docs/ROADMAP.md` §0).
- The spoke angle θ is the in-plane transported axis and never touches `angW`: it turns at ω·dτ (or
  Ω_H for a hole) plus Thomas precession from the **non-gravitational** acceleration only, geodetic
  `−(3/2)(g × v)`, and Lense–Thirring with Gravitomagnetic. Klein and RP² crossings mirror it.
- A body is drawn as its rest-frame disk through the Lorentz map of its centre's velocity, every
  point of its spoke and clock face at the body's own time there (`particle.wgsl`).

## Prescribed bodies

- A prescribed body's world line is given (`docs/ROADMAP.md` §6.2): it sources every law and
  responds to nothing. Its curves are evaluated in `src/prescribed.js` and again in
  `shared-prescribed.wgsl`, **which must agree**; the oracle page checks every kind's samples
  against the JS, and `tests/prescribed.test.mjs` checks the JS is kinematics.
- `prescribed.wgsl` runs after everything that moves a body and before the world lines record it,
  putting each back on its curve: position through its deck, proper velocity, `totalForce` as the
  curve's m·dw/dt (so the recorded acceleration, and with it the Liénard–Wiechert field, is the
  motion drawn), and the curve's exact proper time (`clocks.wgsl` skips these bodies).
- `FLAG_PRESCRIBED` bodies don't radiate energy away, absorb, shed charge, collide, merge or get
  captured; bodies pass through them. Their mass still follows the Higgs.
- **The agent pays:** what a substep did to the body the pass undoes, so the agent's account adds
  the curve's four-momentum minus the substep's (`agentAccum`, read with the stats into
  `ledger.agentE/Px/Py/L`), W = Δ(γm) − ∫F_other·v dt; the drifts subtract it.
- A figure's prescribed bodies are born at −∞ with their curve's past written into the ring
  (`_writePast`), so they act at once. Saves keep a curve with t0 relative to the save's time.
- **The hand** writes a prescribed line live (kind `held`): the body pursues the pointer, capped at
  0.75c and an acceleration of 0.6, so its samples stay timelike and under the ~0.78c where
  `LW_KAPPA_MIN` starts to suppress the forward field. The GPU sets and clears `FLAG_PRESCRIBED`,
  so the host never writes a body's flags.

## The spacetime view and frames

- **One projection for both views:** a point on the present at time h before it projects with time
  and space at one scale, so light keeps to 45°, and the plane view is the same projection from
  above. `SpacetimeView.writeMatrices()` hands every pass a view matrix and the plane's inverse, so
  every pass draws on the tilted plane unchanged and picking goes through `wrapCamera()`.
- **The boost display** (`SpacetimeView.display()`, `disp()` in WGSL) eases every event from the
  lab's coordinates to the observer's, then hands over to the boost frame of the same world line,
  so the picture continues without a jump.
- **Decimation** (`lineKeep`, `lineScan`, `lineWrite`) keeps only the world-line points the drawing
  needs, in slot order (blending makes draw order pixel order), within 8/255 of the undecimated
  strips. Trails are the same world lines seen from above.
- **Frames are views** (`frames.js`, `frame-slice.wgsl`): spawning, selection and hover act in the
  lab. The slicer cuts every world line on the observer's now and writes view buffers the body
  pipelines draw instead of the live ones. **The lagged view:** the observer's now sits far enough
  in the lab's past that everything on the visible slice has been computed, capped at the ring's
  reach (127); the HUD names the lag. On a torus each body is drawn as its 3×3 nearest images, γL
  apart with clocks γvL apart, because the identification holds at equal lab time; Klein and RP²
  draw the primary image only. Arrows, torques, the heatmap and field overlays stay lab-only.
- **The accelerated observer** (`FRAME_ACCEL`): its slices all pass its corner 1/α behind it, and
  the anchor's lag is settled on the hyperbola by bisection (the velocity now would overshoot).
  Bodies fade with the lapse αξ toward the horizon.
- **Seen** cuts every world line by the observer's past cone at its anchor (`wlOnCone`), all
  computed past, so no lag; sight doesn't extrapolate, so a source with no history there isn't
  drawn. Lorentz observers only. Under Seen each point of a body is drawn at its own retarded time,
  the body taken in uniform motion over its light-crossing time.
- **Radar** (`radar.js`) needs the observer's future, so only observers whose world line is known
  have it: the lab's eye, the moving and accelerated observers, a prescribed red body.

## Lensing

- With Gravity on the rulers are a backdrop seen through the bodies as a thin lens along z, lab
  frame only, instantaneous (no time delays, moving-lens corrections or strong-field images);
  black holes flag an imposed 3√3·M capture disk. The pass runs only while something is there to
  bend.
- `lensCompact` lists the live, massive slots in slot order by a prefix sum, so every sum over the
  list is the same each run; each lens sits at its image nearest the view's centre (a per-pixel
  minimum image would tear the backdrop at the seam). Past `LENS_WORK` the map is computed coarser
  and refilled to 512². Probe results carry `sim.lens.gen`, so a stale readback is dropped.

## Black holes

- The horizon is Kerr–Newman, `r₊ = M + √(M² − a² − Q²)`, a = J/M; super-extremal inputs clamp to
  r₊ = M, an effective radius for stable evolution, and WGSL repeats the clamp in many shaders (grep
  `disc >= 0.0`). Gravity among holes is Paczyński–Wiita, unsoftened (`bhSourceRadius` is copied in
  `pair-force`, `forces-tree`, `compute-stats` and `heatmap.wgsl`). Capture is a merge in Merge
  mode. `docs/MODEL.md` §3.6 is the model's account and its faults.
- **Extremal censorship** sheds same-sign leptons one quantum at a time, with recoil, until the
  hole is under its limit; when the pool is full a clamp is the backstop, and charge isn't
  conserved then. **Schwinger** pays one charge quantum and `ELECTRON_MASS` but not the lepton's
  kinetic energy: subtracting that too made the discharge run away. **Superradiance** runs at α²,
  not the real α⁸, which is too steep to see, and saturates at Ω_H ≤ μ_a; a hole's mass is its whole
  energy, so the stats book no separate spin energy for holes. Hawking ends below `MIN_MASS` in two
  back-to-back photons.

## Bosons

- Caps: 4096 bodies, 16384 photons, 4096 pions and 4096 leptons (leptons share the pion buffer,
  `Pion.kind`). Emitters append; once a frame `boson-compact.wgsl` packs each pool in order and
  sets its count live, so every boson pass is sized by live counts. A pool full of live bosons still
  drops a multi-product event's products (`docs/MODEL.md` §2, bug 1). Boson passes aren't in the
  pass plan: bosons outlive the switches that emit them, so they step every substep by indirect
  dispatch.
- Larmor radiation leaves in quanta of `PHOTON_QUANTUM`; pion emission takes its energy as it
  accrues; a body that dies with radiation pending emits it the next frame. The quadrupole sink is
  removed until a radiation reaction replaces it.
- **Absorption** adds the boson's whole four-momentum. Each boson claims its absorber in parallel,
  read-only on the bodies, and one workgroup per claimed body sums its claims in a fixed order:
  per-body CAS float accumulators were 40× slower with 4096 bosons on one body, and their sums
  depended on order. Bosons never wrap, so on a periodic boundary the search folds each one in.
- Pion decay runs on the pion's clock; the cull ages are pool limits, not lifetimes. Photon → pair
  conversion is deliberately absent. **Pion annihilation** pairs by proposals through the bosons'
  tree, so no pion is in two pairs. **Kugelblitz** collapses a boson-tree node of at least 4 bosons
  whose energy exceeds half its extent (hoop conjecture), at most one a frame.

## Scalar fields

- The Higgs and axion live on 128² grids with PQS (cubic B-spline) deposition and interpolation,
  stepped by one joint Störmer–Verlet KDK a substep so the portal and the metric are evaluated at
  matching times. Couplings and their faults: `docs/MODEL.md` §3.7–§3.9.
- **The fields' energy** sums ½(Δφ)²/h² over every cell edge, so its derivative is the evolution's
  5-point Laplacian and it sees every mode (centred differences missed the checkerboard).
- The ether damping (`fieldDamping`), the quench's ramp and its Langevin bath (counter-based draws
  keyed by cell and substep) do work the ledger doesn't book.
- **Grid gravity:** the fields evolve in `ds² = −e^{2Φ}dt² + e^{−2Φ}d𝐱²`, `φ̈ = e^{4Φ}∇²φ −
  e^{2Φ}V′ + 4Φ̇φ̇` (a9's decision, `docs/ROADMAP.md` §0), Φ from both fields' energy and the
  particles' rest mass, each an FFT convolution with −1/√(r² + ℓ²), ℓ = `SHEET_THICKNESS`
  (independent of the particle softening ε). The FFT's per-stage parameters are a static uniform
  table picked by dynamic offset: a `writeBuffer` per stage lands before the whole encoder runs,
  and that bug left Φ ≡ 0 until 2026-10-23. The convolution is circular, so every boundary mode is
  periodic. Under expansion the grid is comoving and Ĝ drops k = 0.

## GPU backend

- `fetchShader()` loads `src/gpu/shaders/<file>?v=${SHADER_VERSION}`; **bump `SHADER_VERSION` after
  any WGSL edit**, the query string being the only cache key. `getSharedPrefix()` prepends the
  WGSL constants generated from `config.js` and the palette, then `shared-structs`,
  `shared-topology`, `shared-rng` and `shared-relativity`.
- Packed structs keep each stage within the 10 storage buffers `requestDevice()` asks for. Every
  per-slot buffer is allocated for the cap except the world-line store (§ Signal delay).
- `pass-graph.js` derives dispatch booleans from toggles only, not alive counts.
- **Readbacks:** the frame's (largest acceleration, ghost count, merge and kugelblitz events, free
  slots) goes into a three-deep ring mapped once, and one from before a `reset()` is dropped. Merge
  events come from a frame's last substep only (each collision pass resets the counter). Every
  other readback has its own channel with a pending flag cleared in `finally`, so a lost device
  can't wedge it. `_phase5Ready` holds field dispatches until the async field pipelines exist.

## Rendering and chrome

- Every layer draws into one render pass and one submit (`render()` → `_drawLayers()`): on a tiled
  GPU each pass loads and stores the whole canvas, which cost more than the layers did. The world
  lines' compute passes go in the same encoder ahead of it.
- Light and dark are pipeline pairs that `setTheme()` swaps, both alpha-over (the additive dark
  blend and the bosons' glow read no quantity, so they're gone). Colours are the shared inks,
  theme-paired as `INK_<NAME>_L/_D` WGSL constants; `syncRendererTheme()` sets both sides, and
  `GPUBackend.create()` adopts the theme after `renderer.init()` because it is created after the
  first sync. Bodies' ink is their charge's sign (sienna positive, prussian negative, graphite
  neutral); **one red**: the accent marks only the selected body, its world line and cone, and the
  lens probe's star.
- Worldline was the sim overhaul's pilot (`../../docs/sim-overhaul/PLAN.md`) and loads neither
  `shared/hud.css` nor `toolbar.js`. **The caption** (`caption.js`) is "Fig. N." and one line of
  names and live values; it reads out and never explains (root `AGENTS.md`, Show, don't tell).
  Its writer keeps one `Knob` element per knob across rewrites, so a drag survives the rebuilds.
  **The key** (`scene-key.js`) rows each mark the scene is drawing now, in the scene's own marks
  (`marks.js`), which the margin's ticks share: one ink per force in both.

## Conventions

- **Naming.** Code, comments and UI text say "signal delay" or "finite-speed force propagation",
  never "retarded potential(s)" (a9's rule); "light-cone" and "Liénard–Wiechert" are fine.
- **Constants.** WGSL constants are generated from `config.js`, but the toggle bits are written
  twice in `gpu-constants.js` (WGSL string and JS exports), tree node layouts are repeated in
  `boson-tree` and `kugelblitz.wgsl`, and `serialize()` maps the toggle bits back to
  `TOGGLE_KEYS` by hand (the oracle page's save case checks it). JS uniform writers follow WGSL
  struct member order; the post-substep `dt` is a raw write at byte 0 of `SimUniforms`. Event
  records are mirrored between shaders and the readback parsers: a `MergeResult` change also
  touches `MERGE_RESULT_SIZE`, `collision.wgsl`, `merge-photons.wgsl` and the field-excitation
  upload. The stats readback layout is at the top of `compute-stats.wgsl` (128 words, then each
  pass's per-workgroup partials, `STATS_LAYOUT`), which one `statsReduce` workgroup adds in a fixed
  order, so the same state reads back the same sums.
- **A new toggle or parameter** updates `physics-contract.js` (`TOGGLE_KEYS`, or `PARAMETER_KEYS`
  and `GPU_PARAMETER_SLOTS`), the default in `physics-settings.js`, `ui.js` (a tick in `TICKS` with
  its markup in `index.html` and its prerequisite in `LAWS`, or a scale in `storeScales`; a mark in
  `marks.js` if the scene draws one), the strings in `i18n/strings.js` (en and ja),
  `GPUPhysics.setToggles()` with its bit, and `serialize()`'s map. Presets and saves need nothing
  more: `applyConfig()` carries every store key.
- **Saves:** `version: 2` holds the domain, bodies with τ, θ and any curve, toggles, parameters,
  modes, speed, friction and camera; fields, bosons and world lines aren't saved. `migrateState()`
  lifts version 1 (domain = this window / 16, clocks at 0).
- **Storage keys keep earlier names:** Worldline was Geon until 2026-10-23 (`/geon` redirects
  here) and No-Hair before that, so `geon-lang`, `geon-theme`, `nohair-quicksave` and the download
  name `nohair-state.json` stay; renaming them orphans saved settings and saves.
- **GPU slots.** `addParticle()` initializes every per-slot buffer; `axYukMod` starts at
  `(1, 1, 1, 0)` and only `.w` (φ_a² at a hole, for superradiance) is read. The alive sentinel for
  `deathTime` is `FLT_MAX`, not `Infinity`.
- **Command ordering.** `queue.writeBuffer()` lands at submit, before any of the encoder's passes;
  anything that must differ between passes of one substep goes through `copyBufferToBuffer()`,
  `clearBuffer()` or a dynamic offset into a static table. A dispatch can't read its indirect size
  from a buffer it writes. One buffer may not fill two writable bindings of a dispatch, so dummy
  placeholders are distinct buffers.
- **WGSL.** Merge resolution guards with `mass <= EPSILON`, not `== 0`, because pairs race; NaN
  guards come before global-memory writes; render pipelines use premultiplied alpha with
  `srcFactor: 'one'`; entry points sharing a module declare shared bindings `read_write`.
- **Topology.** Klein and RP² crossings flip velocity and spin and mirror θ; periodic modes add
  ghosts so tree searches cross the boundary; world-line interpolation wraps through `minImage()`.
- **Input.** Antimatter mode (X) drives touch only; mouse users spawn antimatter with right-click.
  A click of a body's own kind selects it, the other kind deletes it; black-hole mode never spawns
  antimatter. A press on a body that drags past `DRAG_THRESHOLD` takes hold of it (the hand);
  hover hit tests pause while pressed, so the press's result is the one that returns. Tilted, in
  the lab's coordinates, an edge of the sheet of the present (within 7 px) drags the moving
  observer's velocity along its normal, capped at 0.95c.
- **CSS.** `styles.css` makes `[hidden]` win over every display rule, so margin rows and sections
  are shown and hidden with the `hidden` attribute alone, never `style.display`. A mark's own svg may
  overflow its frame, but only the direct child (`> svg`): a hatch's nested svg must keep clipping.
- **URLs.** Worldline's own files load by relative URL, which resolves only under `/worldline/`
  with its trailing slash.

## Open work

`docs/ROADMAP.md` holds the plan: the model pass (2.5, `docs/MODEL.md`), then the causal sandbox
(3.0) and other spacetimes (3.x), ordered by the list of figures. Preset facts that follow from the
model's boundaries: the bremsstrahlung beam's electrons have m 0.3 because Larmor's τ = 2q²/3m is
6.7 for m 0.1 and q −1, comparable to a pass, so such an electron radiates more than its kinetic
energy and is captured; the cyclotron's synchrotron light is weak at 0.5c, a few photons a run.
