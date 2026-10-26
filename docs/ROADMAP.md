# Worldline Roadmap

The one authoritative plan for Worldline. `AGENTS.md` describes Worldline as it is; this
file describes where it is going. When an item lands, move it to §10 with its commit and
update `AGENTS.md`.

Rewritten on 2026-10-24 (round 2.5) by Claude with a9, after an audit of the build that
2.0 left. Codex (astra) gave an independent read of the direction and then reviewed the
gravity, resolution and history designs. Corrections that changed a design are marked
"(Codex)". Earlier versions of this file, including the June audit and the 2.0 scouting
plan, are in git history.

This file lives in `docs/` so the parent build's stager never deploys it
(`tools/stage-assets.mjs` skips `docs/`). Keep planning documents here.

Tags: **[standard]** textbook physics with a known answer · **[synthesis]** our own
derivation or design applying standard physics · **[speculative]** needs prototyping
before it's trusted. Sizes **S / M / L** are relative, not session counts: a9's
calibration (2026-10-24) is that a milestone like 3.0's gravity work is one to three
serial sessions, and parallel lanes (subagents, worktrees) fit a whole version in one.

## 0. Decisions

### Decided

| Date | Decision |
|---|---|
| 2026-10-26 | **The margin in the plate's notation** (2.3, §10): a9 approved the proposal (artifact `JtvJnPLrtReyoxuNG4YQ1G`). Four tabs, Figure · Laws · World · Measure; what the plate always means is not a switch (world lines always drawn, lensing follows Gravity, every body's outline is its clock); one question, one control; each figure's knobs in its caption. Barnes–Hut is not a user choice: the count picks it, seamlessly. |
| 2026-10-25 | **The caps are 4096 bodies, 16384 photons and 4096 each of pions and leptons** (2.2, §3.3): a9 asked for a second performance pass to raise them. The world-line store grows with the bodies in use, so a small scene costs what it did. |
| 2026-10-24 | **Worldline is a planar spacetime laboratory** (§1). No volumetric 3D physics, no gas, no quantum layer. |
| 2026-10-24 | **The versions:** 2.1 is performance and receipts (§3); 2.5 is the record, then sight, then the instrument (§4–§6); 3.0 is the model, honest gravity and curved spacetime, after a decision point (§7). |
| 2026-10-24 | **The model is held through 2.5.** 2.1 and 2.5 build on the physics as it is: bug fixes only, no new force laws or regimes. Apparatus (pinned bodies, light pulses) are instruments, not physics. |
| 2026-10-24 | **Delete the hidden Disintegration toggle** (tidal breakup and Roche transfer); black-hole extremal censorship stays. |
| 2026-10-24 | **Canvas labels arrive with the instrument** (§6.1), attached to picked events and named bodies. |
| 2026-10-24 | **Six curated presets** (2.0); the eighteen cut presets stay cut. A preset earns its place as an experiment (§6.5), not as coverage. |
| 2026-10-23 | **WebGPU only.** No CPU physics or Canvas renderer. |
| 2026-10-23 | **The planar convention:** the scene is a symmetry plane of a 3+1 world, with named reductions (§1.2). |
| 2026-10-23 | **Lengths: two knobs.** ℓ, the sheet thickness (physical, comoving under expansion) for fields and grid gravity; ε, numerical softening, for particle forces only. ℓ = 8 for grid gravity. |
| 2026-10-23 | **Photons stay planar,** a labelled surrogate for 3D emission with consistent recoil. |
| 2026-10-23 | **KG in the exponential metric:** `φ̈ = e^{4Φ}∇²φ − e^{2Φ}V′ + 4Φ̇φ̇`, Φ from fields and particles. |
| 2026-10-23 | **Clocks:** the additive lapse `√max(0, 1 + 2Φ_N − v²)`; a sweep ring per body; Thomas precession from non-gravitational acceleration only, gravity through the geodetic term. |
| 2026-10-23 | **World-line samples are 12 floats** (`t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`); the event log's schema is fixed (§9.2). |
| 2026-10-23 | **The domain is state;** the window is a camera. |
| 2026-10-23 | **Frames use the lagged view:** the observer's slice is all computed past, and the HUD names the lag. |
| 2026-10-23 | **Expansion requires the torus,** with physical coordinates on a growing domain and comoving, conformal world lines. |
| 2026-10-24 | **2.0's grammar:** trails are world lines seen from above; field lines replace the comb; one red for the selection. |

Superseded rows (the 1.5–3.0 version plan, parked 3D views, hidden Disintegration kept,
no labels in 2.0, the 1+1 Minkowski panel, 2.1's caps of 512 bodies) are in git history.

### Open

1. **3.0's model** (§7): which of honest gravity, fixed-metric curved spacetime and a
   resolution overhaul, in what order. Decided at a decision point after 2.5, informed by
   what the instrument measures.
2. **Where Seen lives:** a third choice beside Lab and Observer (recommended), or an inset.
3. **Replay fidelity:** checkpoints are exact on one machine, recipes reproduce
   statistically; deterministic GPU stepping is not pursued (recommended) (§4.4).

## 1. Thesis

### 1.1 A planar spacetime laboratory

**Build an experiment, follow its events, and measure one history through different
observers' clocks and light.**

Worldline already has the core of this: one recorded history serves the dynamics (signal
delay, Liénard–Wiechert), simultaneity (frames), proper time (beads, clocks) and the
picture, and the tilted plate makes that legible. Its notation (beads for proper time, the
sheet of the present, the light cone, events) is real notation a visitor can manipulate.

What it lacks is the laboratory: a visitor can flip switches but can't ask a question and
get a number back. 2.5 supplies that, in three layers:

1. **The record** keeps whole experiments, not the last 128 time units: an archive, an
   event log, checkpoints, replay, and links that reproduce a run.
2. **Sight** adds what an observer *sees* beside what it *measures*: the past light cone
   as a slice, light signals, radar coordinates and the Doppler-shifted sky. Contraction is
   measured and never seen; Worldline can show both from one history.
3. **The instrument** lets a visitor pick events, measure intervals and proper times, place
   clocks, beacons, detectors and mirrors, compose bodies, and compare a prediction with a
   measurement in every preset.

**Why planar.** A 2D world's whole block universe fits on a screen: that is what the tilted
plate is. A 3D world's doesn't, and the plate would have to become slices or projections. So
2+1 is the identity, not a waystation. What it gives up (unrestricted orbital planes,
magnetic bottles, vector spin dynamics) is real but smaller than the drawability.
Both gravitational-wave polarizations stay reachable through an off-plane detector's response
to a planar source (Codex).

Three commitments carry over from 1.5:

1. **World lines are first-class state.** Every entity records a history; the history
   serves physics and picture alike.
2. **A view is a hypersurface.** Lab simultaneity, an observer's simultaneity, an observer's
   past light cone and radar time are all choices of slice and coordinate map. The slicer
   bisects a monotone function along each world line; sight adds the cone (§5.1).
3. **Internal processes run on proper time.**

**Every phenomenon ships with its analytic number,** and from 2.5 the visitor sees it: each
experiment states a predicted number beside the measured one (§6.5). `tests/physics-validation.html`
holds the same numbers as oracles.

### 1.2 The planar convention

The scene is a slice of a 3+1 world, and Worldline says which reduction each model uses
(Codex):

| Reduction | Applies to | Exact part | Approximate part |
|---|---|---|---|
| **Symmetry plane** | point particles with z-spins and their mutual 3D forces, Kerr–Newman equatorial motion | planar orbits are an invariant sector of 3D dynamics under z → −z | softening; anything breaking the reflection symmetry |
| **Confined slab** | the Higgs and axion fields, grid gravity | project the 3D action onto a transverse profile `φ = ψ(x,y,t)·χ(z)` | one transverse mode; profile integrals rescale couplings; gravity carries a finite-thickness factor F(kℓ) |
| **FRW background** | cosmology | the slab is a slice of homogeneous 3D FRW | perturbations live only in the slab |

Three lengths are never silently identified: the slab's physical thickness, the comoving
thickness of the cosmological slice, and the numerical softening ε. The two-knob scheme
(decision table) ties the first two by mode and keeps ε for particles alone. Radiation uses
3D rate formulas with the planar photon surrogate; gravitational waves, when 3.0 adds them,
use the 3D quadrupole and TT projection.

## 2. Versions

| Version | Theme | Contents | Size |
|---|---|---|---|
| **1.5** | WebGPU only; relativity you can see; frames; cosmology; lensing | done 2026-10-23 (§10) | — |
| **2.0** | The visual overhaul | done 2026-10-24 (§10) | — |
| **2.1** | Performance and receipts | done 2026-10-24 (§3, §10) | — |
| **2.2** | Performance at scale: the caps raised eightfold | done 2026-10-25 (§3.3, §10) | — |
| **2.3** | The margin in the plate's notation; force summation automatic | done 2026-10-26 (§10) | — |
| **2.5** | The laboratory | the record (§4), then sight (§5), then the instrument (§6) | L |
| **3.0** | The model | a decision point, then honest gravity and/or curved spacetime (§7) | L |

Branches outside the spine are admitted only by an experiment they uniquely enable (§8).

## 3. 2.1: performance and receipts (done)

Done 2026-10-24 in one session, with parallel lanes in worktrees. Landed work is in §10; this
section keeps what measurement found, so 2.5 starts from numbers.

### 3.1 What measurement found

The tools: `?perf` (`src/gpu/gpu-profiler.js`) puts a timestamp on every pass and counts
submits, writes and maps per frame; `docs/second-pass/tools/` runs the standing scenarios
(`bench-scenarios.json`, each preset in plane and tilted, Fields, an observer, 500 bodies three
ways, full boson pools, both fields with grid gravity) and compares two trees scenario by
scenario (`bench-ab.mjs`). Numbers are on an M5 Max (40-core GPU) at 1440 × 900 × 2; a base
M-series GPU is taken as about 4× slower, which sets the presets' budgets (§11 has the
caveats about reading these numbers).

GPU time per frame, p50 in ms, before (`b27b83c`, the profiler's first commit, which already
had `statsPE`'s fix) → after (`319d2a9`), each pair run alternately on frozen trees. The span
runs from a frame's first pass to its last, gaps between submits included, so in the small
presets it barely moves while the work inside it halves; the step span is the physics alone.

| Scenario | Span | Step |
|---|---|---|
| Cyclotron | 1.12 → 1.03 | 0.94 → 0.49 |
| Bremsstrahlung | 1.50 → 0.99 | 1.13 → 0.47 |
| Kibble–Zurek, tilted | 1.69 → 1.45 | 0.38 → 0.19 |
| Cyclotron with Fields | 1.50 → 1.44 | 0.89 → 0.55 |
| Microlensing | 1.46 → 1.53 | 0.26 → 0.37 |
| 500 bodies, Gravity, Coulomb, Relativity | 8.58 → 2.99 | 7.15 → 1.01 |
| The same with Barnes–Hut, tilted | 6.30 → 3.44 | 5.14 → 1.06 |
| Full boson pools (200 black holes) | 6.80 → 2.56 | 6.30 → 1.53 |
| Both fields with grid gravity | 3.79 → 3.79 | 2.13 → 2.36 |

Every preset is within its budget in plane and tilted. The tilted 500-body row includes the
depth window (`f9c975d`). The smallest scenes pay about 0.1 ms more physics than before, for
the wider per-body workgroups and the boson passes that now always run; the black-hole row's
scene degenerates into one runaway hole (§7.3), so read it as full pools, not as 200 holes.
Before `statsPE`'s fix, the 500-body scenes also spiked by 27 ms every eighth frame.

Found, and fixed:
- **One render pass per layer.** On a tiled GPU each pass loads and stores the canvas, so the
  grid, bodies, overlays, bosons, clocks, rings, arrows and torques as separate passes cost
  more than their draws: a pass with no photons in it took 1.3 ms. One pass for the scene.
- **Occupancy.** The O(N²) per-body passes (Liénard–Wiechert pair forces, the clocks' Φ_N,
  the 1PN recompute) ran one thread per body, so 500 bodies used eight workgroups and the GPU
  sat idle while each thread waited on its own world-line reads. Eight bodies a workgroup,
  32 threads each, cut `pairForce` about tenfold; a per-pair bracket hint (`wlHints`) for the
  light-cone search saves another 10–20% and leaves forces bit-identical.
- **`statsPE`** summed every pair on one GPU thread: 27 ms every eighth frame at 500 bodies.
  A 256-thread workgroup.
- **Ghosts** reached half the domain, so a torus gave nearly every body three ghosts and the
  512-slot buffer overflowed at about 170 bodies. They now reach a contact (a body's radius
  plus the largest radius, reduced on the GPU each substep): about 140 for 500 bodies.
- **Boson absorption** was one GPU thread looping over the pool, serial against races on the
  bodies: 2.6 ms with full pools and 65 ms with 4096 photons spread over 200 bodies. Each
  boson now claims its absorber in parallel and each body gathers its claims (0.16 and 0.28
  ms). It also works across a torus seam: the tree path wrote absorbed four-momentum into
  ghost slots, so the energy vanished, and the pairwise path never looked across.

Cleared by measurement:
- **Substep submits.** With ε = 8, accelerations almost never ask for more than one substep:
  every scenario ran one. A per-substep uniform ring would buy nothing; not done.
- **Startup** is about 270 ms to the first frame, the device most of it.
- **The lens map** costs about 0.1 ms; **the field atlas** under 1 ms of CPU at p95.
- **World-line strips** are cheap; at 500 bodies tilted the plate's cost is the event scan,
  which tests every sample of every line each frame for a birth, death, merge or kick. Drawing
  only the samples within the shown depth took it from 1.2 to 0.8 ms (the whole render span
  is 2.4 ms there); 2.5's event log (§4.2) lets the plate draw logged events instead.

Carried forward:
- **Merge events** reach the fields from a frame's last substep only, since each substep's
  collision pass resets the counter; frames almost never take two. The event log (§4.2) is
  the place to keep them all.
- **The tree build** (`insertParticles`, a lock-free CAS insertion that spins while another
  thread subdivides) costs about 0.65 ms at 500 bodies, as much as the pair forces now. A
  Morton-ordered build (an LBVH) would be faster and deterministic, which open decision 4
  (replay) cares about. (2.2 built it, and found the CAS tree had been losing bodies, §3.3.)
- **Fixed costs in small scenes** (`quadrupoleApply`, `updateColors` near 0.15 ms with eight
  bodies) may be clock ramp-up rather than work; unexamined.

**Caps** (decided by these numbers then, and superseded by 2.2, §0): 512 bodies and the
pools were to stay through 2.5, since relativistic pairwise cost grows as N². 2.2 measured
that 500 bodies had left most of the GPU idle: the pair force grew sixfold, not 64-fold, from
500 to 4000.

### 3.2 Receipts

- **Extremal censorship** has its oracles, and they found a bug: the shedding count was
  fixed up front, so a hole between quanta shed one too many and a light hole overshot past
  zero, after which the clamp created charge. It now stops at the first whole-quantum charge
  the lightened hole can hold.
- **The twin** runs on [40, 32] with the full 127 of history shown, so the tilted plate holds a
  whole round trip (about 95) for a third of each one.
- **Captions follow the state.** The twin keeps its clock comparison when tilted;
  Kibble–Zurek's caption waits for the measured ordered fraction, and the preset has a
  quench-time slider and its wall density as formed and now.
- **`about.md`** says what the model is; the info tips stopped calling the field exact.
- **A new social card** for the 2.0 plate.
- **Presets are data,** applied with saves through one path (`applyConfig`), and fields and
  bosons step without bodies, so Kibble–Zurek has no tracer and photons outlive their source's
  switch.
- **Checks for 2.5's UI work:** `shots.mjs` freezes every preset into a byte-reproducible
  frame in both themes at three zooms, `shots-diff.mjs` compares two runs, and `cvd.mjs`
  simulates protan, deutan, tritan and grayscale vision (Machado et al. 2009). The inks are
  near-isoluminant, so grayscale collapses every pair (ΔE₀₀ < 3.3) and pattern carries
  everything; indigo, prussian and violet, and ochre, sienna and sap, collapse for protans and
  deutans, verdigris and viridian for tritans; and in dark deuteranopia the accent falls to
  ΔE₀₀ 2.1–2.9 against sap and sienna, so the instrument's red marks (§6.1) need their pattern
  too. Reproducibility found a race in the field kicks (§10).

### 3.3 2.2: scale (done)

Done 2026-10-25 in one session, at a9's ask for a second performance pass that raises the caps
substantially. Two lanes ran in worktrees (the stats readback; world-line drawing), the rest in
the main tree. The caps went from 512 bodies, 4096 photons and 2048 pions and leptons to 4096,
16384 and 8192.

What measurement found first, with the 2.1 tree's cap raised to 4096 (4000 random bodies on a
torus, M5 Max, as in §3.1):
- **World lines** took 5.5 ms of a 6.2 ms render, in the plane view too (trails are world
  lines): every sample of every line drawn, each of its four vertices redoing the line's setup.
- **`statsPE`** took about 10 ms every eighth frame; **the tree build** 1–4 ms, contended.
- **The relativistic pair force** took 3.1 ms, six times its 500-body cost rather than 64:
  500 bodies had left most of the GPU idle. From here it grows as N².
- **The Fields overlay** took 4.95 s of CPU a frame: every step of every field line tested
  every charge.

Bugs the new oracles found, all older than 2.2:
- **Barnes–Hut applied no force** at a few hundred bodies. The CAS-built tree lost a body when
  a subdivision raced a claim, so a node's expected count never arrived and the root was never
  summed; 2.1 measured that empty walk as cheap.
- **The bosons' tree never summed above its deepest level** (a leaf's count wasn't reset when it
  split): boson gravity, pion Coulomb and kugelblitz saw an empty tree. Kugelblitz now runs; in
  dense Hawking gas with Boson interaction it collapses at its one-a-frame limit.
- **π⁺π⁻ pairs never annihilated:** each pion claimed itself before claiming a partner, so both
  halves of a pair in lockstep claimed themselves.
- **Barnes–Hut on a torus** took nodes straddling the half-domain at one image: 31% rms error
  against pairwise on a uniform torus, now 0.3% (the group walk's box criterion counts too).
- The tree walk's stack bound read 128 against an array of 48.

Codex (astra) reviewed the trees, the walk, the store and annihilation and found five more,
in 2.2's own code, fixed in `f89688c`: collision searches read the pre-drift tree as now (a
pair closing during the drift was missed); the walk's breadth-first frontier could overflow
and took nodes whole, a body meeting its own mass (205% off on spins, 4000 bodies at a
point); the bosons' root, no longer the domain, could be a strip that width-only opening tests
misread; ghosts were capped at the store's tier; annihilation read pions others were clearing.
The frontier's overflow turned out to fire in ordinary scenes too: at 4000 random bodies its
walk was 9.4% rms off pairwise, the ring that replaced it 2.1%, at about 1.5 times the cost
(0.3 → 0.45 ms). And Codex's suggestion replaced the trees' bottom-up climb, whose relaxed
atomics WGSL doesn't order across locations, with an independent sum over each node's range
of sorted leaves, at the climb's cost.

What changed (§10 has the commits):
- **Trees from sorted keys** (`tree-build.wgsl`): Morton codes, a bitonic sort sized on the GPU
  by the live count, the radix tree (Karras 2012), and a compressed quadtree in the old node
  layout, for the bodies and, over the pools, the bosons. The same positions give the same tree.
  Each node keeps its largest radius, which collisions and absorption prune by, and a collision
  pair is found by its smaller body.
- **Barnes–Hut as a group walk** (32 Morton-adjacent bodies, one traversal, a shared list, eight
  threads a body), and only without Relativity: with it every force acts pairwise from the
  world lines, which a node's aggregate lacks (EM already did).
- **A world-line store that grows** through 512, 1024, 2048 and 4096 slots, keeping every ring,
  with the per-pair light-cone hints; the search guesses its first bracket from the distance.
- **The stats readback over workgroups** with fixed-order partials (lane), and the zero-momentum
  frame's anchor likewise.
- **World lines decimated before they are drawn** (lane): three compute passes ahead of the
  scene's render pass keep only the points the drawing needs (a chord until it would miss a
  skipped sample by 0.03 device px; every sample where the ribbon folds) and list them in slot
  order, so one strip draws them all and every screenshot matches the undecimated drawing
  within 8/255. Timed back to back (§11), the world lines at 4000 bodies cost 6.5 → 3.8 ms
  tilted and 3.7 → 2.7 in the plane, at 500 tilted 0.59 → 0.37; the presets pay about 0.07 ms
  more, a serial chain of 32 points a thread. The lists follow the store's tier.
- **Pion annihilation** by proposals through the bosons' tree; **pools** sized by live counts;
  **field lines** binned and budgeted.

Cleared by measurement:
- **Fusing a substep's compute passes** into one serialized them: Metal overlaps separate passes,
  so small presets got slower (cyclotron's step 0.55 → 1.9 ms). Only the field step, a chain of
  dependent passes, gained (3.7 → 1.7 ms). Not done.
- **Hints from the current distance alone**, without the N² table: in a crowded scene the paths
  curve too much over a light-crossing time, and the pair force took 4.9 ms against 3.3. The
  table stays, the distance seeding new pairs.
- **Observers in Morton order** for the pair force: slower (3.7 → 4.2 ms). The relativistic pair
  force is bound by arithmetic, not by world-line reads.

What it costs now (§3.1's M5 Max, 1440×900 at 2×), timed back to back (`bench-b2b.mjs`, §11:
steps or renders one after another, wall time each, the GPU's clocks up), the lower of two
runs. 2.1 is `ab45a58` at its 512 cap, and for 4000 bodies the same tree with the cap raised
to 4096.

| Scenario | Step, 2.1 → 2.2 (ms) | Render (ms) | |
|---|---|---|---|
| Cyclotron | 0.135 → 0.163 | 0.120 → 0.19 | the trees' dozen dispatches; the decimation's serial chain |
| Cyclotron, tilted | 0.135 → 0.165 | 0.127 → 0.21 | |
| Wheel | 0.123 → 0.150 | 0.087 → 0.097 | |
| Both fields, grid gravity, 64 bodies | 0.375 → 0.383 | 0.30 → 0.375 | |
| Black holes and pools, 200 bodies | 0.35 → 0.51 | 0.215 → 0.193 | boson gravity, lensing and absorption through trees that hold their items |
| 500 relativistic, pairwise | 0.313 → 0.252 | 0.313 → 0.315 | |
| 500 relativistic, Barnes–Hut, tilted | 0.305 → 0.245 | 0.475 → 0.358 | |
| 500 gravity, Barnes–Hut | 0.21 → 0.233 | 0.28 → 0.425 | 2.1 applied no force; the bodies now clump |
| 4000 relativistic, pairwise | 2.60 → 2.43–2.55 | 2.00 → 1.29 | |
| 4000 relativistic, tilted | 2.60 → 2.42 | 4.11 → 1.30 | |
| 4000 gravity, Barnes–Hut | 0.315 → 0.605 | 1.85 → 1.74 | 2.1's walk did nothing |

Besides: `statsPE` at 4000 bodies, every eighth frame, 1.3 → 0.03 ms; the field atlas's CPU
4.95 s → 0.9 ms a frame (p95 6); the bodies' tree at 4000, about 0.14 ms. Live under `?perf` the
presets' GPU span reads 1.0 → 1.4 ms, a twelfth of a frame, at the low clocks a light scene runs
at. The last A/B found one regression the clocks didn't explain: on a torus every pass over the
ghost slots scanned the whole ghost buffer, 4096 slots for an eight-body preset (`7b3275f`
bounds them by eight a body; the cyclotron's step was 0.20).

Open:
- **The heatmap with Relativity** solves 128² cells × N light cones every fourth frame: about
  9 ms at 4000 bodies, the overlay's one remaining hitch.
- **The relativistic pair force** is O(N²) and arithmetic-bound: at 4000 bodies here it is most
  of a 2.4 ms step back to back (3.7 ms of pass time live), so 4096 relativistic bodies run
  near 10–15 ms on a base M-series GPU. Past it lies a retarded far
  field: fixed cells keep moment histories, read at each cell's light-crossing time [speculative].
- **World lines at 4000 bodies tilted** still keep 1.6M of 4.1M points (beads kept exact under
  a varying screen speed, and cusps) and cost about 3.8 ms, 134K events among them. A seam's or
  merge's ends keep the stray pixels the old ribbon left there, reproduced for exactness; a
  direction taken from one side would remove them, as a visible change.
- **Ledger accumulators** add f32 by compare-and-swap across workgroups (`cullBosons`,
  `expansion.wgsl`), so those readback words aren't bitwise reproducible.
- **Kugelblitz's rate in Hawking gas** (one a frame, the limit) is the model's, untested until
  now: whether it is the experiment or a tuning question is open.
- **Barnes–Hut's tidal torque** from a far node squares the node's total coupling where the
  pairwise sum adds squares, an approximation that grows with the bodies a node holds and
  matters where softening flattens distances (r ≪ ε).
- **The torus walk.** Force summation became automatic (`config.js` "Force summation": pairwise
  below 1536 bodies, the tree above with θ from 0.1 to 0.5 by 4096). On a periodic domain the
  walk gains at most a third over the pairwise loop to the cap and on a uniform torus of about
  4000 bodies sometimes takes 5–6 ms against 0.75 (`docs/second-pass/bh-notes.md`), so the tree
  is held out there (`TREE_ON_PERIODIC`). Finding the cause (the half-domain criterion opening
  every node near a plane, or a group box that Morton order's jumps make large) would let the
  torus use the tree too.

## 4. 2.5, first: the record

A run becomes a durable object: drawable whole, replayable, branchable and shareable.

### 4.1 The archive [synthesis]

The fine ring (1024 samples, one per 1/8, 128 time units) stays as it is: signal delay and
the near plate read it. Behind it, coarser levels keep whole experiments drawable at bounded
memory, for example 512 knots at 1 time unit and 512 at 8 (4,096 units of history).

- **Streaming, error-bounded decimation**, one thread per slot: when a sample leaves the
  fine ring, it becomes a knot of the next level only if interpolating across it from the
  last knot would miss the skipped samples by more than a tolerance.
- **The contract** (Codex):
  - never interpolate across a break: births, deaths, merges, kicks above `KICK_DW` and
    charge changes keep both sides as knots;
  - decimate on the covering plane; deck flips and epoch rebases transform every level;
  - keep τ exact at knots (endpoint ageing is exact, intermediate readings are not);
  - keep segments timelike and monotone: Hermite can overshoot or go superluminal, so add
    knots where it would;
  - forces never read the coarse levels.
- A coarse knot needs `t, x, y, wx, wy, τ, θ, m, q` (36 B), not the fine sample's 48.
- **Consumers:** the plate (the whole twin), the instrument's measurements on old events,
  the scrubber.
- **Oracles:** the full twin drawn and its proper times read from the archive within
  tolerance of `√(1 − v²)`; the decimation error stays under its bound; τ at knots equals
  the fine ring's; no segment crosses a break.

### 4.2 Identity and the event log

The log's schema has been fixed since M1 (§9.2) and waited for a consumer. 2.5 has three:
the plate's events (now inferred from creation times, death snapshots, breaks and kicks),
sight's emission events, and the instrument's picking.

- Bodies are named by (slot, generation), which survives slot reuse; the archive keeps
  lifecycle records as long as any of its segments.
- Emission and absorption log the boson's four-momentum, so a photon is drawn from its true
  emission event and ends where it was absorbed. Pions and leptons get short rings if
  sight or the instrument needs their bends.

### 4.3 Checkpoints, replay and branching

- **A checkpoint is the complete state:** particle buffers and clocks, the fine ring and the
  archive, boson pools, both fields with their time derivatives and the gravity grid, the
  cosmology and ledger, RNG counters and the frame count, epoch and times, the preset's
  tick state, settings, toggles and view. GPU-side copies make a few in-memory checkpoints
  cheap.
- **Replay** scrubs a paused run through its archive: the Frame tab's look-back grows into
  a block-universe scrubber over the whole experiment.
- **Branching** resumes from a checkpoint. The past is inspectable from history but
  resumable only from checkpoints (Codex).
- **Interventions** (spawns, deletes, edits, toggles, parameter changes) are recorded as
  timed records, so a run is also a recipe: a preset, its overrides, the interventions and
  a seed. The instrument's undo reads the same log.
- **Time reversal** (Loschmidt) [standard]: from a checkpoint, flip w, spin and external B
  and run; the run retraces until chaos or something irreversible intervenes. A shadow
  twin started from a perturbed copy shows the Lyapunov divergence.

### 4.4 Sharing

- **Recipes by URL:** `#r=` holds the recipe and the view (tilt, boost, frame, camera),
  gzipped with `CompressionStream` and base64url-encoded; `?preset=` alone names a preset.
- **Captured runs as files:** saves become `version: 3` with fields, bosons and the archive,
  migrating version 2 one way, as v1 → v2 did.
- **Embedding:** `?embed` shows the plate and its caption with play and pause only, so a
  blog post can carry a live plate through the markdown `iframe` directive, which emits
  same-origin frames that the root's `frame-ancestors 'self'` already allows.
- **Fidelity** (open decision 4): atomics in the tree build, collisions and boson appends
  make GPU stepping nondeterministic. A checkpoint continues exactly from where it was
  taken on the same machine until the first race matters; a recipe reproduces the
  experiment, not the bits.
- **Oracles:** a checkpoint continued reproduces an uninterrupted analytic trajectory (a
  cyclotron gyration, a Kepler orbit) within tolerance; a recipe URL round-trips; merges,
  deaths, slot reuse and epoch rebases keep event identity.

### 4.5 Field history

A snapshot ring of the scalar fields (for example 64 snapshots at 64², about 1 MB a field)
puts fields into spacetime:
- in the tilted plate the Higgs's zero contour sweeps out world-sheets, so Kibble–Zurek
  coarsening shows walls pinching off in time [synthesis];
- φ is a Lorentz scalar, so sampling the ring on an observer's slice is exact up to
  interpolation, and the scalar fields can be drawn in a frame (they're hidden in frames
  now). Potentials aren't scalars and stay lab-only.

## 5. 2.5, second: sight

Beside the simultaneity view, what an observer measures, comes the view of what it sees,
from the same history. `retardedState()` already solves each source's past light cone for
signal delay, so point sources are cheap.

### 5.1 The cone as a slice

- **An observer** is a world line: the selected body, the boost observer, or an eye pinned
  at a point (§6.3).
- At each moment of its proper time, its past light cone meets every world line once (for
  subluminal sources, `g(t) = (t_O − t) − |x(t) − x_O|` is monotone). That intersection
  is the event the observer sees. The slicer gains the cone beside its planes.
- **Tilted:** the selected body's past cone is already drawn. Under Seen it becomes a slice:
  world lines pierce it (`vs_pierce`'s job, for the cone), and the light in flight runs
  faint along the cone's generators from each pierce point to the apex.
- **In the plane:** each body is drawn at the emission event's position in the observer's
  coordinates, which puts it in its aberrated direction at the distance its light travelled.
  A fast body shows where it was, at its seen speed.
- **The sky:** around the eye, a ring shows each source's apparent direction, its Doppler
  hue and its flux: the one-dimensional image an eye in the plane records.
- Seen is a third choice beside Lab and Observer (open decision 2).
- **Model boundary:** sight uses straight null lines. With gravity on, light bends
  (lensing, boson deflection) and sight doesn't; label it.

### 5.2 Light signals

- **Pulses** are light signals that interact with nothing: a beacon on a body sends one
  every T of its proper time, and they are drawn as null lines in the plate and arrive on
  receivers' clocks. They are apparatus, not physics, so the model stays held.
- **The k-calculus** [standard] (Bondi): pulses sent every T by a source receding at v
  arrive every kT, `k = √((1 + v)/(1 − v))`. The twin by pulses: count what each twin
  receives, and the age difference falls out with no simultaneity at all.
- **Radar coordinates** [standard] (Bondi; Dolby and Gull 2001): an observer that sends a
  pulse at τ₁ and gets its echo at τ₂ assigns the reflecting event time (τ₁ + τ₂)/2 and
  distance (τ₂ − τ₁)/2. For an inertial observer these are its Lorentz coordinates. For the
  travelling twin they give simultaneity surfaces that stay continuous through the turn,
  where the instantaneous rest frame's jump by 2vd. Both slicings, side by side on the twin,
  are the clearest picture of what "simultaneous" means.

### 5.3 The seen sky

- **Doppler** [standard]: `ν_o/ν_s = (k·u_o)/(k·u_s)`, for any source and observer.
- **Aberration** [standard]: a source at angle θ from the observer's velocity is seen at
  `cos θ′ = (cos θ + β)/(1 + β cos θ)`.
- **Beaming** [standard]: a source isotropic in its rest frame delivers bolometric flux
  ∝ D⁴. On the plate, flux is the mark's weight: depicted, not decorated.
- **Apparent superluminal motion** [standard] (Rees 1966): a blob at v, at angle θ to the
  line of sight, crosses the sky at `v sin θ/(1 − v cos θ)`, up to γv.
- **Real light:** photons in the pool that reach the eye register on the sky ring as
  arrivals, so the sky shows both virtual sight and the light the simulation emitted.

### 5.4 Extended bodies (a second stage)

Each point of a body is seen at its own retarded time, so a fast body's seen outline is
neither its lab shape nor its contracted shape (Terrell 1959, Penrose 1959) [standard].
In the plane, sample the body's rest-frame disk along its world tube per sky direction
[synthesis]. Delaying the centre alone isn't this effect (Codex); label point-source sight
as point-source until this stage lands.

### 5.5 Oracles

- the cone slice of a uniformly moving body equals its analytic retarded position and
  `retardedState()`;
- aberration of a ring of static sources seen by a moving observer;
- the Doppler ratio for moving source and observer pairs;
- a pulse reaches its receiver on the cone, with an arrival-time residual under tolerance;
- radar coordinates of an inertial observer equal its Lorentz coordinates; a static body's
  radar distance is its distance;
- the k-calculus interval kT, and the twin's pulse counts against its clocks;
- apparent transverse speed `v sin θ/(1 − v cos θ)`.

## 6. 2.5, third: the instrument

A visitor can construct an experiment, ask a question and get a number, without developer
tools.

### 6.1 Picking and labels

- **Pick events** in the tilted plate: a marked event, a bead, or any point on a world line.
  An id pass renders world-line strips and events into an integer target with
  (slot, sample, fraction); a click reads one texel.
- **Labels,** deferred since 2.0, arrive here: picked events take letters (A, B, …) and bodies
  take names their preset gives them ("home", "traveller", "nucleus"), set in italic
  Newsreader and collision-checked.
- **Selection works in frames:** a click maps through the display transform back to the lab
  event and the world line nearest it.

### 6.2 Measurements

For a picked pair:
- **the interval** s² with its kind (timelike, null, spacelike), and Δt and Δx in the lab
  and in the observer's coordinates; as the boost changes, the coordinates change and s²
  doesn't, live;
- **each world line's own proper time** between its two picked events (the twin: home's
  10 against the traveller's 6);
- **light cones of any picked event,** future and past, not only the selected body's now;
- **simultaneity through an event:** the observer's surface, and radar's (§5.2).

The Measure tab (2.3) holds the picked events and their numbers beside the ledger and the
selected body, which 2.3 already redrew with drift sparklines and force bars; the phase and
potential plots are still to be redrawn in the plate's language (2.0's pillar 6).

### 6.3 Apparatus

Each is drawn as a hairline mark in an ink, held quiet until selected:
- **a clock** (a massless, chargeless test body), and **a pinned body** exempt from every
  force: an inertial home for a slingshot twin, a fixed eye for sight;
- **a beacon** sending pulses every T of its proper time;
- **a detector** recording arrivals of pulses and pool photons on its own clock;
- **a mirror** reflecting pulses, at rest or riding a body.

### 6.4 Composing

- **Orbit:** place a body on a circular orbit about the selection, its speed from the
  measured radial acceleration at that point, so it holds under whatever forces are on.
- **Binary,** **ring** and **cloud** (a thermal cloud at a chosen temperature for the
  Maxwell–Jüttner histogram below).
- **Edit the selection:** mass, charge, spin and velocity typed in, applied at the next
  frame and recorded as an intervention.
- **Undo** from the intervention log (§4.3).

### 6.5 Every preset an experiment

One knob, one predicted number, one measured number, and the comparison. The knobs landed in
2.3, as numbers dragged in each figure's caption (the cyclotron's B and E, the twin's and the
wheel's speeds, the beam's speed, the quench time, the lens's mass); the predicted and
measured numbers are still to come:

| Preset | Knob | Predicted | Measured |
|---|---|---|---|
| Cyclotron drift | B | drift E/B; gyroradius γmv/(qB) | the selected body's centre drift and radius |
| Twin paradox | v | `Δτ_traveller/Δτ_home = √(1 − v²)`; pulse counts by k | both clocks at reunion; received pulses |
| Relativistic wheel | v | twist `2·v·v_rim`; clock 1/γ | the drawn spoke's angle across the disk; τ |
| Bremsstrahlung | impact parameter | Liénard's power integrated along the recorded trajectory | photon energy the log attributes to that electron |
| Kibble–Zurek walls | quench time τ_Q | wall density falling as a power of τ_Q | wall length per area once ordered |
| Microlensing | closest approach u | `(u² + 2)/(u√(u² + 4))`, disk-averaged | the probe's ray-shot μ |

New experiments built from the instrument, inside the held model:
- **Bell's spaceship** [standard]: two bodies under the same uniform external gravity accelerate
  identically in the lab (`external-fields.wgsl` kicks w at the constant rate g, which is
  hyperbolic motion); their proper separation in their own frame grows as γ, so a string
  between them would snap.
- **The slingshot twin:** a pinned home, a traveller turned by a mass.
- **Maxwell–Jüttner** [standard]: a box of bodies thermalizes to the Jüttner speed
  distribution, histogrammed against the formula.

### 6.6 Comparing runs

A second universe with one knob changed runs beside the first (two `GPUPhysics` on one
device; the headless instance already exists for the tests), drawn as an inset or as faint
world lines over the first. Kibble–Zurek's slow and fast quenches, the twin at two speeds,
and time reversal's shadow twin (§4.3) all use it.

### 6.7 Oracles

- s² for a picked pair is invariant under the boost, to f32 tolerance;
- proper time between picked events on a free body and on a circular orbit matches Δt/γ and
  the lapse `√(1 − 3M/r)`;
- a pulse's round trip to a static mirror at distance d takes 2d;
- Bell's proper separation grows as γ;
- a composed orbit stays circular over an orbit (eccentricity under 10⁻³ where ε ≪ r);
- **UI acceptance:** the harness reproduces each preset's comparison by clicking alone.

## 7. 3.0: the model, after a decision point

a9's call (2026-10-24): the model is held through 2.5, and 3.0 starts by deciding where to
take it. 2.5 makes that decision better informed: the instrument measures what the model
does, and the covariance meter (§7.2) measures how far each force family is from being
frame-independent.

### 7.1 Candidate moves

**Honest gravity** [standard physics; synthesis to combine it here]. The non-EM signal-delay
toy unbinds comparable-mass binaries (§7.3). The path collisional N-body codes take:
instantaneous near-zone post-Newtonian forces (EIH, then conservative 2PN), 2.5PN radiation
reaction, and signal delay kept only for births and deaths. Codex's conditions:
- certify an isolated binary first; summed pairwise corrections aren't full N-body EIH, and
  cross terms matter in hierarchical triples over secular times (Will 2014);
- without conservative 2PN the model isn't accurate through 2.5PN, only a staged
  approximation; audit the conversion between harmonic-coordinate accelerations and the
  stored proper velocities so relativistic kinetics and the GEM terms don't double-count;
- causal birth and death fronts are a source-editing convention outside PN; keep them out of
  conservation oracles;
- radiation reaction replaces the current quadrupole sink, never adds to it, with its own
  ledger; averaged balance first, instantaneous accounting after (Blanchet's review);
- require `r_peri ≫ ε`, weak compactness and slow inspiral. The flagship is a
  comparable-mass inspiral against Peters–Mathews da/dt and Peters' e-evolution
  (orbit-averaged, leading order);
- gravitational waves are read at a remote ring of test masses: their wavelength is about
  π/(2v) separations, and a tensor strain is not a picture of a spiral. Chirp audio at
  2·f_orb.

**Resolution** (Codex): per-experiment softening; global adaptive steps that resolve
encounters, orbital phase, gyrophase and field CFL limits, and that advance less simulated
time (visibly slowing) when the 32-substep budget runs out instead of losing accuracy; a
convergence control that refines step, softening and history cadence independently. Block
steps and regularization only for a measured close-binary bottleneck. Today ε = 8 in a
64-wide domain, so most orbit experiments are experiments on Plummer spheres.

**Curved spacetime laboratories** [standard]:
- **Black holes:** a fixed Schwarzschild, then equatorial Kerr, metric for test bodies, light
  and clocks: capture, the photon sphere at 3M, the ISCO at 6M (1M to 9M for Kerr), zoom-whirl
  orbits, Shapiro delay, a real Penrose process, the exact lapse, and signals across a
  horizon. The embedding diagram as a view: Flamm's paraboloid, and for Kerr's equatorial
  slice `R(r) = √(r² + a² + 2Ma²/r)`, `Z′² = r²/Δ − R′²` (Codex). Seamless blending of a
  fixed metric with many-body forces has no automatic justification; make them distinct
  regimes.
- **FRW:** emitted against received wavelength `1 + z = a_receive/a_emit`, conformal
  distances, particle and event horizons, bound against expanding systems, all as
  measurements; imposed backgrounds kept apart from the Friedmann closure.

**Fields carrying energy** [synthesis]: a controlled acceleration pulse on a prescribed
charge, its field change propagating, received power measured through a closed surface and
balanced against the source's work. Point-charge self-energy needs a stated regularization,
and planar field pictures can't recover 3D flux by themselves (Codex).

### 7.2 The covariance meter [synthesis]

By the Currie–Jordan–Sudarshan no-interaction theorem, instantaneous forces make the lab
Worldline's ether. The meter evolves a system and, independently, the same system boosted
(its initial history transformed, not its display), then compares them in one frame, per
force family. Expect Newtonian forces to miss at O(v²), 1PN to agree through its order at
small v, and Liénard–Wiechert to agree for EM. It needs seeded histories, which the record
(§4) makes possible, and the second universe (§6.6).

### 7.3 The model as held: known boundaries

The input to the decision. Each is current behaviour, documented so experiments can name it.

- **Gravity's signal delay is a toy and unbinds orbits.** Gravity, Yukawa and the dipole
  forces act from the retarded position with the factor `1/(1 − n·v)³`, capped at 100. At
  O(v) the pull points where the source was, so a pair gains about 4πv of its binding energy
  per orbit (Laplace's argument; in GR velocity-dependent terms cancel it, Carlip 2000).
  Measured 2026-10-23: an equal-mass binary at v = 0.16 loses 80% of its binding energy in
  one orbit. Barnes–Hut aggregates use present positions, so tree and pairwise paths
  disagree here.
- **Several gravities coexist** without defining one spacetime: the particle lapse, the
  fields' exponential metric, Paczyński–Wiita holes, the thin lens and FRW. Each supports
  an experiment; their combinations aren't certified.
- **Liénard–Wiechert's boundaries:** σ³ softening and a κ floor (sources faster than about
  0.785c have suppressed forward fields); β̇ is linearly interpolated while positions are
  cubic Hermite, so they aren't one trajectory; spin-orbit kicks are missing from β̇;
  dipoles keep static fields; no energy or momentum in transit, so particle momentum isn't
  conserved and the EM drift includes field energy on its way.
- **The stats' energies are two-body and unsoftened:** pairwise EIH misses three-body terms;
  σ³ softening isn't a conservative softening of Darwin; LW's mutual radiation
  `−(4/3)q₁q₂a₁·a₂` leaves without photons or a ledger entry; tidal torque dissipates spin
  energy unbooked.
- **The integrator** is the staggered Boris pusher (velocities half a kick from positions);
  the 1PN velocity-Verlet step is an endpoint correction; `vvKick1PN` doesn't refresh
  `derived.vel`, and the clocks run before it.
- **Resolution:** ε = 8 against a 64-wide default domain; `dtSafe = √(ε/a_max)` from the
  previous frame's maximum, capped at 32 substeps.
- **Black holes:** Paczyński–Wiita, phenomenological; the lapse near a hole uses Newtonian Φ
  with `BH_SOFTENING`; the capture disk on the lens is imposed.
- **Radiation:** reaction is strong at these charges (an electron of m 0.1, q −1 has
  τ = 2q²/3m = 6.7, comparable to a pass); Schwinger and extremal-shedding leptons carry
  kinetic energy the hole never pays; superradiance runs at α².
- **Fields:** damping is ether-like (a preferred frame) and kills self-bound lumps; the
  Higgs Z₂ is biased (reset to +1, exterior cells +1, a positive linear source); the slab's
  projection corrections and the self-gravity source's thickness normalization are absent;
  the fields' energy is booked flat-space, with no field–particle gravitational energy; the
  quench and bath do unbooked work.
- **Cosmology:** the expansion is a Strang split at frame cadence (H·dt ≤ 0.02); the other
  laws act from the physical retarded position without FRW corrections; particle softening
  stays physical while ℓ is comoving; the grid kernel is Plummer, not a slab's; the ledger's
  potential term is first order and lags a readback; pending radiation isn't redshifted;
  Friedmann densities assume a⁻³ and a⁻⁴ between readbacks; the bath's temperature isn't
  rescaled.
- **Spin:** the spoke ignores the 1PN two-body precession's companion term
  `(2 + 3m₂/2m₁)·L_N/r³`; the lapse ignores field gravity Φ_F.
- **Pools:** photon and lepton culls are lab-time ages and destroy bound structures. Bosons
  never wrap: they drift past a periodic domain's edge until culled, are drawn there, and
  lens off plain displacements (absorption folds them back and takes minimum images, §10).
- **Black-hole captures make energy.** A capture makes the hole the invariant mass of the
  pair's four-momentum, keeping the kinetic energy the infall gained without the
  Paczyński–Wiita potential that paid for it, and the PW force isn't the gradient of the
  potential the stats book: it ignores `BH_SOFTENING`, stays non-zero on the capped plateau
  inside the gap, and uses each source's own horizon where the stats average the pair's, so
  unequal holes don't pull equally and oppositely. Measured 2026-10-24: bodies of mass 1 and
  8 at rest 10 apart, Black hole switched on (the 1 is at once inside the 8's horizon of 16),
  become one hole of mass 25.1; 200 small charged holes run away by t ≈ 30 into one of
  2×10⁵ to 4×10¹⁴. Booking the pair potential at capture is no fix (Codex): it gives
  negative energy for an engulfed body (−7.5 here) and still misses the third-body and spin
  terms. Make the force and potential agree and resolve engulfed bodies before forces first;
  honest gravity (§7.1) replaces PW anyway.
- **1PN** is far outside its range inside the softening length; a Yukawa well of coupling 14
  drives bodies past 3c with Relativity off.
- **Frames on Klein and RP²** draw the primary image only.

## 8. Branches and what's retired

### 8.1 Branches

Not scheduled. Each is admitted when an experiment needs it and nothing in the spine
provides it.

- **Dust** (collisionless particle-mesh tracers): structure formation on the expanding torus
  seen through the lens; thin-disk dynamics. Gas is not coming, so the Bullet Cluster isn't
  either.
- **Media** for light: Fizeau's drag in moving water, a classic test of relativistic velocity
  addition, and Cherenkov cones at `cos θ = 1/(nβ)`; weak gravity as an index
  `n = 1 − 2Φ`. Not prisms or spectroscopy.

### 8.2 Retired

- **Volumetric 3D physics** and the inclined, ray-traced view of the slab.
- **Gas** (SPH or Eulerian), its sinks, accretion and cooling.
- **The quantum layer**: Schrödinger, Dirac, Gross–Pitaevskii, Schrödinger–Poisson.
- **The brush as a general layer system.** Its parts that serve experiments live in the
  instrument (detectors, mirrors, pinned bodies).
- **"Make a geon"** as a success criterion: a long-lived numerical lump wouldn't establish it.
- **The ER=EPR framing** for annihilation photons: they share an origin, which the event log
  shows; that isn't entanglement.
- **Hidden Disintegration**, deleted 2026-10-24 (`ef6576f`).
- **Coverage presets:** superradiance, Schwinger, kugelblitz, Klein/RP² and the external
  fields return only as experiments.

## 9. Architecture

### 9.1 World-line store (built)

Per sample 12 f32 (48 B): `t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`, every 1/8 of the
world-line clock, 1024 per slot (24 MB at 512 slots), always recorded; positions on the
covering plane through a per-slot deck; times on a rolling f32 epoch; meta
`writeIdx, count, creationTime, generation, deck flips, bx, by, _pad`; birth samples, death
snapshots and merge breaks. `retardedState()` (past null cones) and `wlOnSlice()`
(spacelike planes) read it. The archive (§4.1) sits behind it.

### 9.2 Event log schema (fixed in M1; built in 2.5)

The log holds the discrete events a slice needs to decide who existed and what changed
hands. Continuous changes (Hawking loss, superradiance, accretion) live in the samples'
`m` and `q`.

```wgsl
struct WorldEvent {          // 48 B, 12 words
    t: f32,                  // world-line clock, on the epoch
    kind: u32,               // EV_BIRTH, EV_DEATH, EV_MERGE, EV_EMIT, EV_ABSORB
    slot: u32,               // the body it happens to
    gen: u32,                // that slot's generation
    other: u32,              // partner slot, or boson pool index, or EV_NONE
    otherGen: u32,           // partner's generation, or boson species
    x: f32, y: f32,          // where
    e: f32, px: f32, py: f32,  // lab four-momentum that changed hands
    cause: u32,              // EV_CAUSE_*, per kind
};
```

| kind | slot | other | four-momentum | causes |
|---|---|---|---|---|
| `EV_BIRTH` | the new body | parent, or none | its initial momentum | spawn, preset, load, kugelblitz |
| `EV_DEATH` | the body | annihilation partner, or none | its final momentum | delete, despawn, evaporate, annihilate, cull |
| `EV_MERGE` | the survivor (heavier) | the absorbed body, which logs no death | the absorbed body's | inelastic, horizon capture |
| `EV_EMIT` | the emitter, or none | the boson | the boson's | photon, pion, lepton by process |
| `EV_ABSORB` | the absorber | the boson | the boson's | photon, pion, lepton |

- Append with `atomicAdd` into a ring of 16,384 records (768 KB) that overwrites its oldest;
  births and deaths from the CPU go through a one-thread append pass, so the counter has one
  owner. The archive keeps lifecycle records alive past the ring (§4.2).
- Unordered within a substep, ordered between substeps; readers bin by t.
- If boson events crowd out lifecycle events (Hawking-heavy scenes), they move to their own
  ring; decide on measurement.
- Annihilation is not a merge: both bodies lose the lighter one's mass, a body left with none
  logs `EV_DEATH` (annihilate), and the photon pair logs two `EV_EMIT`s at the event point.

### 9.3 Tests

`tests/physics-validation.html` instantiates the production `GPUPhysics` headlessly, runs
each analytic oracle and reads back GPU state (35 oracles). Every feature adds its oracle.
The WGSL→JS transpiler (`lib/wgsl/transpile.js`, compute only) and `gpu-diff.mjs` remain
available for Node kernel tests where a kernel is pure compute. 2.1 adds the screenshot-diff
and benchmark harnesses (§3.1).

## 10. Landed

| Milestone | Date | Commits | What |
|---|---|---|---|
| M0 | 2026-10-23 | `5939bcc` | Internal processes on proper time, rest-frame emission with recoil; KG in the exponential metric; the oracle page. Found: the field-gravity FFT ran every stage with the last stage's parameters, so Φ ≡ 0. |
| M0′ | 2026-10-23 | `73eb90b` | WebGPU only: the CPU path retired (about 8,250 lines); device-loss recovery; the no-WebGPU popup. |
| M1 | 2026-10-23 | `4aa7101` | Proper-time clocks, the spoke through the Lorentz map, world lines, the domain as state; saves v2. |
| LW | 2026-10-23 | `2187ef4` | Liénard–Wiechert fields from the world lines; world lines on the covering plane; the force-law audit (Biot–Savart and gravitomagnetic signs, EIH, Bažański, Breit, spin-orbit, Barnes–Hut ghosts double-counting). |
| M2 | 2026-10-23 | `7f71a38`, `62fb193`, `90fa258` | Frames: the slicer, the lagged view, the lab-ruler grid, the twins, the free-fall frame. |
| M3 | 2026-10-23 | `35bba37`, `f4c0308`, `c34c9a9`, `abc1c5d`, `cc96472` | Honest cosmology: an expanding FRW torus, conformal world lines, the Friedmann closure, the ledger, misalignment and Kibble–Zurek. |
| M4 | 2026-10-23 | `4d03f08`, `518076c`, `8ba633e` | Lensing: the lensed backdrop and the microlensing probe. |
| Stats | 2026-10-23 | `4b68bb6` | The stats' energies for the audited forces (Darwin, EIH, Bažański, Breit). |
| 2.0 | 2026-10-24 | `433c8bf` … `8533f6d` | The visual overhaul: the tilted spacetime plate, Lab and Observer coordinates, the glyph grammar, photons as wave packets, the field atlas, the key, scale bar and captions, six presets. Sketches and the screenshot harness in `docs/second-pass/`. |
| 2.1 | 2026-10-24 | `346564b` | The ghost count clamped to its buffer, so a torus with more than about 170 bodies keeps stepping. |
| 2.1 | 2026-10-24 | `ef6576f` | Disintegration deleted (tidal breakup, Roche transfer, `inheritClockFrom`); extremal censorship runs alone as `extremal.wgsl`. |
| 2.1 | 2026-10-24 | `fba2e83`, `b27b83c`, `25cc1ca`, `4f2eb49` | Measurement: `?perf` timestamps on every pass; the benchmark harness, scenarios, budgets and A/B runner; plate screenshots, diffs and colour-vision checks. |
| 2.1 | 2026-10-24 | `a114ccd`, `480070a`, `ac96055`…`17fa383`, `9e0f2af`, `1692267`, `a43fee0` | Speed: one render pass for the scene; `statsPE` on a workgroup; 32 threads per body in the pair forces, clocks and 1PN, with light-cone hints; parallel boson absorption. |
| 2.1 | 2026-10-24 | `f950c0a`, `0847f38`, `98b193b`, `dd97a1c` | Structure: radius-sized ghosts and searches; fields and bosons stepping without bodies and on their pools' counts; one readback per frame (fixes from Codex's review in `dd97a1c`). |
| 2.1 | 2026-10-24 | `937fadc`, `479e3a4`, `4a420a5` | Presets as data through `applyConfig` with saves; the fields in `gpu-fields.js`; the heatmap's own rectangle, the named `dt` offset, the torque table. |
| 2.1 | 2026-10-24 | `cc857bc`, `f0e9fa5`, `319d2a9`, `93515a3` | Bugs the checks found: extremal shedding overshot and created charge; absorption lost energy at the seam; the field kicks raced on φ̇; a flipped theme kept the old inks; hidden panel sections showed. |
| 2.1 | 2026-10-24 | `74a8fad`, `ec3fae2`, `9eb8c48`, `08da183`, `432713c` | Receipts: the twin fits its history; Kibble–Zurek measures its walls, with a quench-time knob and no tracer; captions follow the state; `about.md`; the social card. |
| 2.2 | 2026-10-25 | `1eaa1f0`, `5e5fbab`, `63b655f` | Trees from sorted Morton keys (radix tree, compressed quadtree, each node summing its own range), sorts sized on the GPU; Barnes–Hut as a group walk from a ring; the world-line store growing in tiers to the 4096-body cap. |
| 2.2 | 2026-10-25 | `4d3dc05`, `48ce0f8`, `3e9baa5` | The stats readback and the zero-momentum anchor over workgroups in a fixed order (lane). |
| 2.2 | 2026-10-25 | `e57e1c3`, `4394810`, `98cfeb3` | Searches pruned by each node's largest radius; pion annihilation by proposals through the bosons' tree; pools of 16384 photons and 4096 each of pions and leptons, sized by live counts. |
| 2.2 | 2026-10-25 | `4650290`, `ab66afa` | The light-cone search's guess from the distance; field lines budgeted; the heatmap's sources in tiles. |
| 2.2 | 2026-10-25 | `34a1716`, `888a26c`, `7b3275f` | World lines decimated on the GPU before they are drawn (lane); the selection ring draws one body; ghost slots bounded by eight a body. |
| 2.2 | 2026-10-25 | `f89688c`, `7ab8fea`, `fda423a` | Fixes from Codex's review; three 4000-body benchmarks; Barnes–Hut's oracle at 4000 bodies. |
| 2.3 | 2026-10-26 | `537323d` | The lens map compacts the live lenses and sums them in tiles, coarser past 512 lenses (lane): 0.97 → 0.26 ms a render at 500 bodies, 6.7 → 0.3 ms at 4000, so lensing can follow Gravity. |
| 2.3 | 2026-10-26 | `8289c3b`, `d35231e` | Force summation automatic (lane): pairwise below 1536 bodies, the tree above with θ from 0.1 to 0.5 by 4096, held to 1152; periodic domains pairwise (the torus walk is open work, §3.3). |
| 2.3 | 2026-10-26 | `9c80cbc`, `dc56d43` | The margin in the plate's notation: Figure · Laws · World · Measure, word choices, ticks showing each law's mark, ruled scales, edge diagrams, field pads; caption knobs and figure numbers; the Trails, Clocks and lensing switches removed; every body's outline its clock. |

## 11. Gotchas

- f32 times on the GPU: use the rolling epoch.
- `queue.writeBuffer()` lands before any of the encoder's passes; per-pass uniforms go through
  dynamic offsets, copies or separate submits.
- WebGPU has no float atomics.
- Torus identifications are simultaneous only in the lab frame.
- Potentials aren't Lorentz scalars; φ is.
- **Familiar approximation names don't certify Worldline's hybrid integrator** (Codex):
  Paczyński–Wiita's 6M ISCO and Darwin's O(v²) covariance must be measured.
- **A dimensional label doesn't repair an equation** (Codex): the planar convention fixes the
  parent equations; each reduction still needs its own derivation.
- Never let one length serve as confinement thickness, comoving slab thickness and
  softening at once.
- The naming rule (`AGENTS.md`) covers every new string: "signal delay", "light-cone" or
  "Liénard–Wiechert" for finite-speed propagation.
- **Reading GPU timings on Metal:** passes overlap, so per-pass times include waits and their
  sum overcounts; compare spans (first begin to last end), per phase. Other GPU work (another
  benchmark, another agent's browser) skews them: A/B by alternating two frozen trees, and
  never edit a tree that a benchmark is serving.
- **An idle GPU clocks down:** a paused page redrawing every frame leaves the GPU mostly idle,
  so a render's span reads several times its cost at speed and swings 2× between identical runs
  (the scene without world lines read 0.12 and 0.58 ms). Time render work back to back instead,
  many renders in one task and the wall time each, with and without the part measured; the
  spacetime view's world lines cost 0.58 ms at 500 bodies tilted that way, not the 2.6 a paused
  redraw showed. Latency-bound compute (a serial chain a thread) inflates most at low clocks.
- **Occupancy:** a pass of one thread per body over N sources leaves the GPU idle at
  Worldline's sizes (500 bodies is eight workgroups); give each body a group of threads.
- **A render pass per layer** costs a full-canvas load and store each on a tiled GPU.
- **A count read back a frame late** sizes nothing safely: copy the capacity and trim, or keep
  the count on the GPU.
- **Data races hide as noise:** a kernel that reads neighbours of the buffer it writes passes
  every oracle and fails only a bitwise reproducibility check (`shots.mjs`).
- **Test a tree by its root:** both CAS-built trees had empty roots at scale, and every walk
  over them quietly returned nothing. An oracle that the root holds every item, and a walk
  against the pairwise sum at a few hundred items, catch it.
- **Lock-free GPU structures lose items** when one thread's subdivision races another's claim;
  build from sorted keys instead, which is also the same every run.
- **A light scene clocks the GPU down,** so its per-pass times read high and a paused redraw
  loop measures little: compare loaded scenes, or the same scene A/B, alternating.
- **An empty compute pass writes no timestamps** on Metal, and its stale ones stretch the
  profiler's span by seconds.
- **A dispatch can't read its indirect size** from a buffer bound for writing in that dispatch;
  the tree plan writes its own buffer through its own bind group.
- **One compute pass serializes its dispatches** on Metal where separate passes overlap: fuse
  only chains that depend on each other anyway.
- Citations here are names and years. Verify each against its primary source (DOI resolver,
  Crossref) before it reaches `about.md` or JSON-LD.
