# Worldline

A relativistic many-body sandbox at a9l.im/worldline: charged, spinning bodies under gravity,
electromagnetism, gravitomagnetism, Yukawa and two scalar fields, with black holes and boson
pools, on a plate that tilts into spacetime. Vanilla ES modules on WebGPU (compute and instanced
rendering, no CPU fallback). A submodule of a9l.im; the root `AGENTS.md` covers the shared layer,
design system, build and deployment. `docs/MODEL.md` is the physics and its known faults,
`docs/ROADMAP.md` what's next, `about.md` the visitor's account.

## Running and checking

- Preview: from the site root, `node tools/sims/serve.mjs`, then `http://localhost:8790/worldline/`
  (`?lang=ja`; `window.sim` is the live `Simulation`).
- Syntax: `for f in main.js colors.js src/*.js src/gpu/*.js i18n/*.js tests/*.mjs tools/*.mjs; do node --check "$f"; done`
- Tests: `node --test 'tests/*.test.mjs'` (Node 22+, nothing to install). The GPU oracles
  (`tests/physics-validation.html`, driven by `tests/gpu.test.mjs`) run when `CHROME` names a Chrome
  binary and skip otherwise; `WEBGPU=swiftshader` uses the software adapter (about 110 s, 40 of it
  compiling pipelines; 3 s on a real GPU). By hand: open the page and press Run, or
  `await window.__run('Liénard')`.
- A test earns its place only where a failure would be silent (a conservation law, an analytic
  oracle, a round trip, CPU–GPU agreement, a structural invariant), one per mechanism, never a
  snapshot of a tuned value. The oracle page shares one `GPUPhysics`, `reset()` between cases, so a
  case sets everything it relies on and reads the boson pools only up to their counts.
- WGSL compiles only in the browser, and a compile error is a validation error, not a throw (the
  oracle page fails the case it lands in).
- `?perf` times every pass (`src/gpu/gpu-profiler.js`). Metal overlaps passes, so read the spans,
  not the sum; a light scene clocks the GPU down, so settle differences back to back.
- `tools/` (Playwright from `~/Work/Exploratory` and Chrome for Testing; usage in each header):
  `tour.mjs` scenarios and benchmarks over `bench-scenarios.json`, `bench-ab/b2b/compare.mjs` A/B
  between trees, `tree-vs-pairwise.mjs` the force walk, `shots.mjs`/`shots-diff.mjs` reproducible
  plate screenshots with physics hashes (an unchanged tree reproduces byte for byte), `cvd.mjs`
  the inks under colour-vision deficiencies, `serve.mjs` a chosen checkout (a frozen base).

## Layout

```
main.js                  Simulation: state, device lifecycle, fixed-timestep loop
src/config.js            constants, modes, Kerr–Newman and Paczyński–Wiita helpers, the force-summation rule
src/physics-settings.js  the store (sim.settings) and applyConfig(), the one path presets and saves take
src/physics-contract.js  toggle and parameter keys shared by saves and the GPU slot map
src/ui.js                colophon, figure bar, the margin's tabs, LAWS (prerequisites), shortcuts
src/controls.js, marks.js   the margin's controls; the plate's marks as inline SVG
src/input.js             spawn, select, delete by GPU hit tests; the hand; the sheet's edge
src/spacetime.js         the tilted view: orbit camera, the Lab/Observer boost display
src/caption.js, scene-key.js   the figure caption and the key
src/overlay.js, field-atlas.js the 2D canvas: field contours and lines, scale bar, box
src/presets.js           the figures: data, knobs, spawn, observer, tick
src/prescribed.js        prescribed world lines (the CPU reference shared-prescribed.wgsl must match)
src/frames.js, frame-panel.js, streak.js, radar.js   observers, Seen's streak plate, radar
src/cosmology.js, quench.js, lens-panel.js           a(t); the Higgs quench; the backdrop and probe
src/save-load.js, stats-display.js                   saves; the Measure tab's ledger
src/gpu/gpu-physics.js   GPUPhysics: buffers, dispatch, readbacks, serialize (gpu-fields.js: the fields)
src/gpu/gpu-backend.js   step, events, render, stats, auto-save
src/gpu/gpu-pipelines.js pipelines, fetchShader, SHADER_VERSION
src/gpu/gpu-constants.js generated WGSL constants, toggle bits, STATS_LAYOUT
src/gpu/gpu-renderer.js  instanced rendering, light/dark pipeline pairs
src/gpu/shaders/         WGSL; shared-*.wgsl are prepended includes, tree-items-*.wgsl the trees' items
tests/                   the GPU oracle page and its driver; Node tests of the curves and radar
tools/                   benchmarks, screenshots, colour-vision checks
```

## Invariants

- **The GPU buffers are the only particle state.** A slot names a body only while it lives
  (`(slot, generation)` across reuse), and every readback carries the selection and state version
  it was requested for, so one in flight across a change can't set the selection or the drift
  baseline.
- **One path into the state:** presets and saves go through `applyConfig()`, then `update()` applies
  `LAWS` and the mode locks (black holes force merge, expansion the torus), which may turn more off.
  A preset is data; what it doesn't set is off or default. A figure's per-load state is
  `sim.figureRun`, cleared by `reset()`, so nothing outlives the run.
- **The domain is state** (`sim.domainW/H`, saved); the window is only the camera.
- **Signs:** in the force shaders r is source − observer, so a positive radial coefficient
  attracts; the Boris parameter `(q/2m)·Bz + 2·Bgz` makes the stored fields act as
  `q v × B + 4m v × Bg`. The field conventions are in `docs/MODEL.md`; they were once reversed, and
  the oracle page checks the magnetic and gravitomagnetic ones.
- **Each substep is its own command buffer**, so its uniforms (`simTime` above all) are the ones
  its passes read: `queue.writeBuffer()` lands before any of an encoder's passes. Anything that
  must differ between passes of one substep goes through a copy, `clearBuffer()` or a dynamic
  offset into a static table (the FFT's stages: a write per stage once left Φ ≡ 0).
- **GPU times are f32 on a rolling epoch** of the world-line clock (lab time, or conformal time
  while the universe expands), rebased past 512 so stored times keep their precision.
  Only world-line samples, creation times and `deathTime` hold absolute GPU times.
- **World lines live on the covering plane:** each slot's deck maps its wrapped position so C never
  jumps at a seam; a merge writes a break so no segment smooths the jump; the rings and light-cone
  hints grow in tiers with the bodies, and every bind group that reads them is rebuilt
  (`onStoreGrown`).
- **A source acts only once its light arrives:** before its first sample its past is uniform motion
  back to its creation, so a hand-spawned body acts late, while preset and loaded bodies are born at
  −∞. A removed body keeps sourcing from its death snapshot until its last light passes.
- **Trees are built from sorted Morton keys**, so the same positions give the same tree; the
  CAS-built trees they replaced lost items and summed empty roots, so test a tree by its root. Each
  node sums its own leaf range, since WGSL's relaxed atomics don't order a climb's reads after its
  children's writes. Ghosts weigh nothing (every walk takes minimum images, so a weighted ghost
  counts its pair twice) and exist only for seam contacts.
- **Force summation is automatic** (`config.js`): pairwise below 1536 bodies, Barnes–Hut above with θ
  from 0.1 to 0.5 at the 4096 cap, held to 1152. 1536 is the open-domain crossover at θ = 0.1, where
  the walk is 0.01% from pairwise. Periodic domains stay pairwise (the walk gains at most a third
  and near 4000 uniform bodies sometimes takes 5–6 ms against 0.75, cause not isolated), and so does
  everything under Relativity, since a node's aggregate has no world line.
- **Prescribed curves are evaluated twice**, in `src/prescribed.js` and `shared-prescribed.wgsl`,
  which must agree (the oracle page compares them; `tests/prescribed.test.mjs` checks the JS is
  kinematics). The pass puts each body back on its curve after everything that moves it and before
  the world lines record it, and the agent's account takes what the substep did. The hand caps its
  pursuit at 0.75c, under the ~0.78c where `LW_KAPPA_MIN` suppresses the forward field. The GPU sets
  and clears `FLAG_PRESCRIBED`; the host never writes a body's flags.
- **Frames are views:** spawning, selection and hover act in the lab. The observer's slice is
  lagged into the computed past (the HUD names the lag), and Seen cuts by the past cone and never
  extrapolates, so nothing drawn is invented.
- **Determinism where it's cheap:** absorption claims in parallel and each body sums its claims in a
  fixed order (CAS float accumulators were 40× slower and order-dependent); the lens list and the
  stats partials are prefix sums in slot order. Bitwise reproducibility of the whole step isn't
  pursued.
- **The pools pack every frame** and every boson pass is sized by live counts; a pool full of live
  bosons still drops a multi-product event's products.
- **One render pass a frame:** on a tiled GPU each pass loads and stores the whole canvas, which
  cost more than the layers did. Light and dark are pipeline pairs over the shared inks; the accent
  marks only the selected body, its world line and cone, and the lens probe's star.
- **Fields don't modulate the pair laws**, and the quadrupole sink and the bodies' pull from bosons
  are off, until each has an action (`docs/MODEL.md`): a wiring fix that switches on a defective
  coupling makes things worse.

## Conventions

- Bump `SHADER_VERSION` after any WGSL edit: the query string is the only cache key.
- The toggle bits are written twice in `gpu-constants.js` (WGSL and JS), tree node layouts are
  repeated in `boson-tree` and `kugelblitz.wgsl`, and `serialize()` maps the toggle bits back by
  hand. A new toggle or parameter touches `physics-contract.js`, `physics-settings.js`, `ui.js` (and
  its markup), `i18n/strings.js` (en, ja), `setToggles()` and `serialize()`.
- JS uniform writers follow WGSL member order; event records are mirrored between shaders and the
  readback parsers (`MergeResult` also in `MERGE_RESULT_SIZE`, `collision`, `merge-photons` and the
  field-excitation upload); the stats layout is at the top of `compute-stats.wgsl`.
- A force-law change touches `pair-force`, `forces-tree`, `compute-stats` (its energy) and
  `heatmap.wgsl`, and `effective-potential.js`; a 1PN change only `shared-1pn.wgsl`.
- WGSL: merges guard with `mass <= EPSILON` because pairs race; NaN guards precede global writes;
  premultiplied alpha; one buffer never fills two writable bindings of a dispatch; a dispatch can't
  read its indirect size from a buffer it writes.
- Saves are `version: 2` (bodies with τ, θ and any curve; no fields, bosons or world lines). The
  storage keys `geon-lang`, `geon-theme`, `nohair-quicksave` and `nohair-state.json` keep the sim's
  old names, because renaming them orphans visitors' state.
- Say "signal delay" or "finite-speed propagation", never "retarded potential" (a9's rule).
- Margin rows show and hide with the `hidden` attribute alone (`styles.css` makes it win).
  Worldline's own files load by relative URL, which needs `/worldline/` with its trailing slash.
