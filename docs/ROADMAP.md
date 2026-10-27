# Worldline Roadmap

The one authoritative plan for Worldline. `AGENTS.md` describes Worldline as it is; this file
describes where it is going; `docs/MODEL.md` is the plan for the physics model (2.5). When an item
lands, move it to §14 with its commit and update `AGENTS.md`.

Rewritten on 2026-10-27 by Claude with a9, after 2.3 and the first step of the model pass, to point
the plan forward. The measurements of 2.1 and 2.2 moved to `docs/PERFORMANCE.md`, the model's known
boundaries to `docs/MODEL.md`. The plan gained a list of figures as its spine (§4), sight in
parallel with the model behind a shared trajectory contract (§3, §6), prescribed world lines and the
hand (§6.2, §6.7), and spacetimes the plate can draw exactly (§8). The same day a9 turned 3.0 from
a record of runs into a causal, observational sandbox (§7). Codex (astra) read the draft
adversarially; corrections that changed a design are marked "(Codex)". The 2026-10-24 rewrite and
earlier versions are in git history.

This file lives in `docs/` so the parent build's stager never deploys it
(`tools/stage-assets.mjs` skips `docs/`). Keep planning documents here.

Tags: **[standard]** textbook physics with a known answer · **[synthesis]** our own
derivation or design applying standard physics · **[speculative]** needs prototyping
before it's trusted. Sizes **S / M / L** are relative, not session counts: a9's
calibration (2026-10-24) is that a milestone like the model's conservative gravity is one to
three serial sessions, and parallel lanes (subagents, worktrees) fit a whole version in one.

## 0. Decisions

### Decided

| Date | Decision |
|---|---|
| 2026-10-27 | **No bitwise determinism** (a9): it was for replay, which is gone. The model's step 1 is the state-driven step schedule, sub-tick subdivision and time slowing (a figure behaves the same at any frame rate and never loses accuracy silently); reproducibility to the bit isn't pursued (§5). |
| 2026-10-27 | **3.0 is a causal, observational sandbox** (a9): the live run is the experiment. No checkpoints, replay, recipes, side-by-side runs or provenance, and no apparatus objects (beacons, detectors, mirrors); a visitor acts through the hand, prescribed bodies, editing and composing, and reads the history through events and their cones (§7). Supersedes the record (2026-10-24). |
| 2026-10-27 | **The list of figures grows by acceptance criteria** (§1.3, §4): §4's two dozen are candidates; a figure ships when its measured number meets its prediction, and earns its place by putting a question no other figure puts; variants share a figure. |
| 2026-10-27 | **Sight beside the model:** 2.6 runs in parallel with 2.5, behind the trajectory contract (§3, §6.1). |
| 2026-10-27 | **The known future is drawn:** a prescribed world line's future rises above the present, faint and dashed, while free bodies' futures stay blank (§6.2). |
| 2026-10-27 | **No sound, for now** (a9's lean): the opt-in speaker is set aside (§11.2). |
| 2026-10-27 | **The model before 3.0** (a9's suggestion; `MODEL.md` §0): 2.5 is the model pass, 3.0 then the sandbox. Step 0 landed the same day. Supersedes "the model is held through 2.5" (2026-10-24). |
| 2026-10-27 | **Show, don't tell** (root `AGENTS.md`): the sim names things and reads out values; what they mean lives in the about panel, the info tips and a9's posts. A figure's caption is its name and its live values. |
| 2026-10-26 | **The margin in the plate's notation** (2.3): four tabs, Figure · Laws · World · Measure; what the plate always means is not a switch (world lines always drawn, lensing follows Gravity, every body's outline is its clock); one question, one control; each figure's knobs in its caption. Barnes–Hut is not a user choice: the count picks it. |
| 2026-10-25 | **The caps are 4096 bodies, 16384 photons and 4096 each of pions and leptons** (2.2). The world-line store grows with the bodies in use, so a small scene costs what it did. |
| 2026-10-24 | **Worldline is a planar spacetime laboratory** (§1). No volumetric 3D physics, no gas, no quantum layer. |
| 2026-10-24 | **Canvas labels arrive with picking** (§7.1), attached to picked events and named bodies. |
| 2026-10-24 | **Six curated presets** (2.0); the eighteen cut presets stay cut. A preset earns its place as an experiment, not as coverage; since 2026-10-27 the list grows by that rule. |
| 2026-10-23 | **WebGPU only.** No CPU physics or Canvas renderer. |
| 2026-10-23 | **The planar convention:** the scene is a symmetry plane of a 3+1 world, with named reductions (§1.2). |
| 2026-10-23 | **Lengths: two knobs.** ℓ, the sheet thickness (physical, comoving under expansion) for fields and grid gravity; ε, numerical softening, for particle forces only. `MODEL.md` §3.1 proposes replacing ε by a contact kernel sized by the two bodies; ℓ stays. |
| 2026-10-23 | **Photons stay planar,** a labelled surrogate for 3D emission. `MODEL.md` §3.5 makes them diagnostic first (open decision 1). |
| 2026-10-23 | **KG in the exponential metric:** `φ̈ = e^{4Φ}∇²φ − e^{2Φ}V′ + 4Φ̇φ̇`, Φ from fields and particles. |
| 2026-10-23 | **Clocks:** the additive lapse `√max(0, 1 + 2Φ_N − v²)`; Thomas precession from non-gravitational acceleration only, gravity through the geodetic term. |
| 2026-10-23 | **World-line samples are 12 floats** (`t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`); the event log's schema is fixed (§12.2). |
| 2026-10-23 | **The domain is state;** the window is a camera. |
| 2026-10-23 | **Frames use the lagged view:** the observer's slice is all computed past, and the HUD names the lag. |
| 2026-10-23 | **Expansion requires the torus,** with physical coordinates on a growing domain and comoving, conformal world lines. |
| 2026-10-24 | **2.0's grammar:** trails are world lines seen from above; field lines replace the comb; one red for the selection. |

Superseded rows (the 1.5–3.0 version plan, parked 3D views, hidden Disintegration kept and then
deleted, no labels in 2.0, the 1+1 Minkowski panel, 2.1's caps of 512 bodies, the model held
through 2.5, the 2026-10-24 version order) are in git history.

### Open

1. **The model's decisions** (`MODEL.md` §8): the axion's name and its pair coupling; derive or drop
   the Peccei–Quinn term and the Higgs-modulated Yukawa range (recommended there: drop both);
   whether photons stay diagnostic or come to act; relativistic or Newtonian kinetics near
   Paczyński–Wiita holes. The model's step 2 ratifies its regimes once these are settled.
2. **Where Seen lives** (§6.3): a third choice beside Lab and Observer, with the streak plate as a
   band under the scene (recommended), or an inset.
3. **The first other spacetime** (§8): a static cosmic string, exact and drawn whole by the plate,
   then a moving one, with Gott's pair as a separate geometric explorer (recommended); or the
   black-hole metric first.

## 1. Thesis

### 1.1 A planar spacetime laboratory

**Act on a live world and watch the consequences travel: through the light cone, on every
observer's clocks, and in what each observer sees.**

One recorded history serves simultaneity (frames), proper time (beads, clocks), electromagnetism's
signal delay and the picture, and the tilted plate makes it legible. Its notation (beads for proper
time, the sheet of the present, the light cone, events) is real notation a visitor can manipulate.
After the model pass gravity acts from present positions (`MODEL.md` §3.2), so only
electromagnetism reads the history for force; everything else still does.

It comes in three layers, in this order:

1. **The model** (2.5): laws that come from actions, a ledger that closes, a step that slows time
   before it loses accuracy. A figure can't report a number its model can't be trusted to produce.
2. **Sight** (2.6): what an observer *sees* beside what it *measures*: the past light cone as a
   slice, light signals and radar, the Doppler-shifted sky. Contraction is measured and never seen;
   Worldline can show both from one history.
3. **The causal sandbox** (3.0): pick any event and see its light cones; measure intervals and
   proper times; act on the running world (the hand, prescribed bodies, editing, composing) and
   watch each act's light carry its consequences outward. The live run is the experiment.

**Why planar.** A 2D world's whole block universe fits on a screen: that is what the tilted plate
is. A 3D world's doesn't, and the plate would have to become slices or projections. So 2+1 is the
identity, not a waystation. What it gives up (unrestricted orbital planes, magnetic bottles, vector
spin dynamics) is real but smaller than the drawability. Both gravitational-wave polarizations stay
reachable through an off-plane detector's response to a planar source (Codex). And some spacetimes
are exact in the plane and drawable whole, where in 3D they would be pictures of slices: a cosmic
string's cone and Gott's pair (§8.1).

Three commitments carry over from 1.5:

1. **World lines are first-class state.** Every entity records a history; the history serves
   physics and picture alike.
2. **A view is a hypersurface.** Lab simultaneity, an observer's simultaneity, an observer's past
   light cone, radar time and an accelerated observer's planes are all choices of slice and
   coordinate map. The slicer bisects a monotone function along each world line.
3. **Internal processes run on proper time.**

### 1.2 The planar convention

The scene is a slice of a 3+1 world, and Worldline says which reduction each model uses (Codex):

| Reduction | Applies to | Exact part | Approximate part |
|---|---|---|---|
| **Symmetry plane** | point particles with z-spins and their mutual 3D forces, Kerr–Newman equatorial motion, straight strings along z | planar orbits are an invariant sector of 3D dynamics under z → −z; a string's cone is invariant along z | softening; anything breaking the reflection symmetry |
| **Confined slab** | the Higgs and axion fields, grid gravity | project the 3D action onto a transverse profile `φ = ψ(x,y,t)·χ(z)` | one transverse mode; profile integrals rescale couplings; gravity carries a finite-thickness factor F(kℓ) |
| **FRW background** | cosmology | the slab is a slice of homogeneous 3D FRW | perturbations live only in the slab |

Three lengths are never silently identified: the slab's physical thickness, the comoving thickness
of the cosmological slice, and the numerical softening (or, after the model pass, the contact
kernel). Radiation uses 3D rate formulas with the planar photon surrogate; gravitational waves use
the 3D quadrupole and TT projection.

### 1.3 Figures

The unit of work is a figure. A figure is one experiment: a scene, a knob or two, a predicted number
and a measured one, under a caption that names it and reads out its values. The figures are
numbered and listed in the Figure tab as a book lists its figures; that list (§4) is the spine of
this plan, and an engine feature is admitted by a figure that needs it.

The figures are wordless (show, don't tell). What a figure means belongs in the about panel and in
a9's posts, which can carry a live figure through `?embed` (§9). A figure ships when its measured
number agrees with its prediction within a stated tolerance, on the model it runs under, so every
figure is also an oracle in `tests/physics-validation.html`.

The prediction is a figure's acceptance criterion, not its claim to a place in the list (Codex): a
figure earns navigation space by putting a question no other figure puts. Experiments that share
apparatus and a question are variants of one figure (the twin by clocks, by its ticks' light and by radar).
A statistical figure is accepted across realizations, with its uncertainty: Kibble–Zurek's exponent
is a fit over many quenches, not one run's number.

## 2. Where it stands

As of 2026-10-27 (`5009c17`):

- **The plate.** The canvas tilts into spacetime: world lines with proper-time beads, events, the
  selected body's past cone, the sheet of the present; Lab and Observer coordinates through a boost;
  six observers (the lab, zero momentum, a body, a boost, co-rotation, free fall). Every body's
  outline is its clock, and its spoke bends through the Lorentz map.
- **The physics.** Up to 4096 bodies under gravity (signal delay as a toy; 1PN),
  Liénard–Wiechert electromagnetism from the world lines, gravitomagnetism, Yukawa, two scalar
  fields on 128² grids with grid gravity, Paczyński–Wiita holes with Hawking, Schwinger and
  superradiance, pools of photons, pions and leptons, an expanding torus, and a lensed backdrop with
  a microlensing probe.
- **The margin** in the plate's notation (2.3), and six figures with knobs in their captions.
- **Checks.** 57 oracles in `tests/physics-validation.html`; plate screenshots that reproduce byte
  for byte with their physics hashes; colour-vision sheets; benchmarks timed back to back
  (`docs/PERFORMANCE.md`).
- **The model pass** has landed step 0: ten contained bugs fixed or disabled (the quadrupole sink,
  the fields' pair modulations and the bodies' pull from bosons are off until they have actions),
  the pools compacting every frame, the fields' energy seeing every mode. Step 1, the step schedule
  and resolution, is next.

## 3. Versions

| Version | Theme | Contents | Size |
|---|---|---|---|
| 1.5–2.3 | WebGPU only, relativity you can see, frames, cosmology, lensing; the visual overhaul; performance; the margin | done (§14) | — |
| **2.5** | The model | `MODEL.md` steps 1–4 (§5) | L |
| **2.6** | Sight and the hand | the trajectory contract, prescribed world lines, the cone as a slice, light signals and radar, the seen sky and the streak plate, the accelerated observer, the hand, the sheet as a handle (§6) | M |
| **3.0** | The causal sandbox | events and their cones, every act an event, acting on the live world, fields in spacetime (§7) | M |
| **3.x** | Other spacetimes | cosmic strings and Gott's pair, the black-hole metric, FRW measured, the gravitational-wave ring, the model's separate projects (§8) | L |
| any | Figures in posts | `?embed` (§9) | S |

**Two lanes behind one contract.** 2.5 and 2.6 run side by side, and either may land first. Sight's
predictions (aberration, Doppler, k, radar time, the Rindler horizon) are kinematic, true whatever
the force laws, and on analytic prescribed world lines they need nothing from the model pass. But
the lanes share more than that suggests (Codex): both read the history through
`shared-worldline.wgsl`, whose interpolation the model rewrites (one timelike curve for position,
velocity and acceleration, `MODEL.md` §3.5); frame dispatch and uniforms live in `gpu-physics.js`
beside the step schedule; and the light of a simulated body's ticks inherits its clock, whose lapse and
Thomas precession are the model's. So 2.6 starts from an explicit trajectory contract (§6.1): flat
space, an open domain, prescribed observers and sources first; the history's writer
(`worldline.wgsl`) and reader have one owner, the model lane, and sight builds against the repaired
reader rather than keeping a second one. The hand crosses into the integrator and comes last in 2.6
(§6.7).

3.0 builds on 2.6's machinery (cones, slices, prescribed bodies, the hand) and needs nothing from
the model pass but its figures' predictions, which come after the model's step 4 so that they
don't measure the model's faults. 3.x needs 3.0's picking and measurements.

What each version brings to the list of figures is §4's last column.

## 4. The list of figures

Each figure puts one question and answers it with a number. The rows give its knob, the predicted
number, what is measured, and the version that makes it possible; ✓ marks the six that exist, with
the version that brings their predictions in brackets; a row beginning with a dash is a variant of
the figure above it. Chapters order the Figure tab, each under a hairline rule with its figures'
drawings (`plateGlyph`) beside them, and the numbering follows the list.

**I. Clocks and simultaneity**

| Figure | Knob | Predicted | Measured | Needs |
|---|---|---|---|---|
| **The twin** ✓ | v | `Δτ_traveller/Δτ_home = √(1 − v²)` | both clocks at reunion | (2.6) |
| — by its ticks' light | v | the light of the traveller's ticks reaches home every kT going out and every T/k coming back, `k = √((1 + v)/(1 − v))`; the counts give the ages with no simultaneity at all | ticks counted as their light arrives, both ways | 2.6 |
| — by radar | v | the traveller's radar surfaces stay continuous through the turn, where its rest frames jump | the radar slices along the traveller's world line | 2.6 |
| **The wheel** ✓ | v | twist `2·v·v_rim` across the disk; the rim's clocks at 1/γ | the spoke's angle; τ | (2.6) |
| **The accelerated observer** | α | a horizon 1/α behind it; a static body's radar distance `(1/α)·arcosh[(α²(ξ² + y²) + 1)/(2αξ)]`, diverging at the horizon | static bodies' radar distances; the last light from a body that crosses the horizon | 2.6 |
| — Bell's ships and the rigid ruler | g | ships under equal lab accelerations drift apart in their own frame, their proper separation growing as γ; a Born-rigid ruler's ends accelerate as α = 1/ξ and keep their length | separations on the rear's slice | 3.0 |

**II. Light**

| Figure | Knob | Predicted | Measured | Needs |
|---|---|---|---|---|
| **The seen sky** | v | aberration `cos θ′ = (cos θ + v)/(1 + v cos θ)`; bolometric intensity ×D⁴ | the streak plate's directions and weights | 2.6 |
| **Faster than light, seen** | θ | apparent speed `v sin θ/(1 − v cos θ)`, up to γv | the track's slope on the streak plate | 2.6 |
| **A fast disk, seen** | v | Terrell's apparent rotation | the disk's seen outline | 2.6, second stage |

**III. Fields and radiation**

| Figure | Knob | Predicted | Measured | Needs |
|---|---|---|---|---|
| **Cyclotron drift** ✓ | B, E | drift E/B; gyroradius γmv/(qB) | the guiding centre's drift; the radius | (2.5) |
| **The kink** | the hand | a shake's field change fills the band between the light fronts of its start and its end, at c(t − t_shake) | the band's radii against time | 2.6 (quantitative after `MODEL.md` §3.5's history) |
| **Bremsstrahlung** ✓ | speed | Liénard's power along the recorded path | the radiated energy per electron | (2.5, step 4) |
| **Synchrotron** | B, v | a charge in pure B spirals in at Larmor's rate | the radius against time | 2.5, step 4 |
| **The antenna** | phase | two driven charges' coherent pattern, cross terms included: broadside in phase, endfire out of phase | flux computed by quadrature over the 3D sphere around them | 2.5, step 4; 2.6 |

**IV. Gravity**

| Figure | Knob | Predicted | Measured | Needs |
|---|---|---|---|---|
| **The binary** | separation | it keeps its binding energy (against the held model's 80% lost per orbit at v = 0.16); with radiation reaction, inside its near-zone validity, Peters' da/dt | a(t), e(t) | 2.5, steps 3–4 |
| **Perihelion** | p | 6πM/p per orbit with 1PN, πM/p from special relativity alone | periapses along the world line | 2.5, step 3 |
| **Microlensing** ✓ | u | `(u² + 2)/(u√(u² + 4))`, disk-averaged | the probe's ray-shot μ | (2.6) |
| **Near a hole** | L | the circular-orbit sequence of the Hamiltonian in use (`MODEL.md` §3.6), then the metric's photon sphere and ISCO | which orbits hold; capture | 2.5; metric 3.x |
| **A cosmic string** | μ | a source behind it seen twice, the images `8πμ·D_LS/D_S` apart and undistorted; rulers that lose the angle 8πμ around it | the streak plate's two tracks; the seam | 3.x |
| **Gott's pair** | v | for equal strings at equal and opposite speeds, closed timelike curves once `γ sin(4πμ) > 1` | a constructed loop's closure and timelikeness | 3.x |

**V. The universe**

| Figure | Knob | Predicted | Measured | Needs |
|---|---|---|---|---|
| **Kibble–Zurek** ✓ | τ_Q | wall density falling as `τ_Q^{−ν/(1+νz)}` | the exponent fitted over many quenches in the test page, with its uncertainty | (2.5) |
| **Walls and matter** | density | walls pin to bodies (`MODEL.md` §3.7) | bodies on walls; wall length | 2.5, step 3 |
| **The Hubble flow** | H | received light at `1 + z = a_receive/a_emit`; particle and event horizons | the redshift of ticks' light between comoving bodies | 3.x |

The candidates grow only by experiments, under the same rule. Today's figures move to their
chapters when the list grows, so their numbers change.

## 5. 2.5: the model

`docs/MODEL.md` is the plan and its §7 the order. Each step, and what it brings to the rest of this
plan:

0. **Contained bugs.** Landed (`aee6699`, `a3bdc7b`); the pools' transactional saturation (a pool
   full of live bosons dropping a decay's products) is still open.
1. **The step schedule and resolution.** Next. The substep becomes a function of the state
   (encounters, gyration, field stiffness, the reaction's τ₀), subdivided below the tick where
   needed; when the budget runs out a frame runs less simulated time and the caption says so. So a
   figure behaves the same at any frame rate and never loses accuracy silently. Bitwise
   reproducibility was for replay, which is gone, and isn't pursued (§0).
2. **The regimes ratified,** once open decision 1 is settled.
3. **Conservative gravity, the kernels and the Higgs action,** with their energies and momenta. It
   brings the binary, perihelion and walls-and-matter figures; with gravity off the world lines,
   Barnes–Hut can serve gravity under Relativity, so only charges pay the pairwise light-cone cost
   (§10); every preset is retuned and its physics hash moves.
4. **Radiation and the ledger's columns,** each certified independently. It brings synchrotron,
   bremsstrahlung's prediction, and the coherent flux the antenna measures.
5. **Separate projects** (varying-α electromagnetism, self-consistent slab gravity, 2PN if an oracle
   asks for it) move to 3.x (§8.5).

**The history's reader moves forward.** `MODEL.md` §3.5's repair, one timelike curve for a sample's
position, velocity and acceleration with impulses as segment breaks, sits with electromagnetism in
step 4, but both lanes read through it: sight's quantitative claims on simulated bodies and the
hand's radiation wait for it. So it lands right after step 1, as its own change, with the model lane
owning `worldline.wgsl` and `shared-worldline.wgsl` throughout (§6.1).

**The covariance meter** is the model's yardstick, an oracle in the test page rather than a figure
[synthesis]. By the Currie–Jordan–Sudarshan no-interaction theorem, instantaneous forces make the
lab Worldline's ether. Two headless runs, one of bodies with uniform-motion pasts and one of the
same bodies boosted, are compared event for event in one frame, per law: Newtonian laws miss at
O(v²), near-zone post-Newtonian gravity agrees to its order at small v, Liénard–Wiechert agrees.
Bodies created with uniform-motion pasts (as preset bodies are) keep that property under a boost,
so no boosted history has to be written; boosting the display alone would test only the display
(Codex).

The model's known boundaries, which were this file's §7.3, are `MODEL.md` §2–§5 in full; `about.md`
names the ones a visitor meets and changes with each law.

## 6. 2.6: sight and the hand

Beside what an observer measures (its simultaneity), what it sees, from the same history.
`retardedState()` already solves each source's past light cone for signal delay, so point sources
are cheap. And beside watching, the first ways to act on the history: world lines given rather than
computed, and then the hand. Codex ranked prescribed world lines first among the new directions for
what they supply: exact sources and observers for nearly every chapter's oracles.

### 6.1 The trajectory contract

What sight may assume, stated before it is built (Codex):

- **First, flat and open:** an open domain, no expansion, Relativity's straight null lines, and
  prescribed analytic observers and sources (§6.2), whose every value is known exactly; then
  simulated bodies, then the torus's images.
- **One history, one owner.** The writer (`worldline.wgsl`) and reader (`shared-worldline.wgsl`)
  belong to the model lane, which repairs the reader so that position, velocity and acceleration
  come from one timelike curve (`MODEL.md` §3.5). Sight reads the history through that reader and
  keeps no second one.
- **Unavailable is drawn as unavailable.** Before a source's oldest sample the reader extrapolates
  uniform motion (`shared-worldline.wgsl`, `retardedState`), which suits a force but would fabricate
  a plausible sky once real history has expired. Sight marks those events unavailable instead.
- **Clocks belong to the model.** A simulated body's ticks come from its clock (the lapse and
  Thomas precession in `clocks.wgsl`), so sight's oracles use prescribed clocks, whose τ is exact.

### 6.2 Prescribed world lines

Landed 2026-10-27 (§14; `AGENTS.md`, Prescribed bodies): the five curves, the pass that keeps a
body on its curve, the agent's books, the known past written at a figure's start and the known
future drawn, and the twin rebuilt on them with turns of finite duration.

- A body can be **prescribed**: its world line given, not computed. 2.6 brings the analytic curves:
  uniform motion, hyperbolic motion, uniform circular motion, a linear oscillation, and a twin's legs
  joined by a turn of finite duration. Prescribed bodies source every law and
  serve as observers like any body; they respond to nothing, and the agent that drives them pays
  (Jackson's prescribed currents) [standard].
- **Stated interactions.** A prescribed body keeps its charge (its mass follows the Higgs like any
  body's); it doesn't radiate away energy, absorb bosons, collide, bounce or merge, and other bodies' collisions with it are a stated
  policy (they pass through, first). Its samples carry the curve's own position, proper velocity and
  dw/dt, so its Liénard–Wiechert field is the field of the motion drawn; the sample's acceleration is
  otherwise the summed force at the substep's start plus the Boris rotations (`worldline.wgsl`).
- **Books:** the agent's work. With F_other the forces the regime applies to the body,
  `F_agent = d(mw)/dt − F_other` and `W_agent = Δ(γm) − ∫F_other·v dt` (Codex: the inertial term
  matters; an isolated neutral body accelerated from rest is the falsifier). Radiation and its Schott
  term then settle the whole system's balance (`MODEL.md` §3.5).
- **The known future** [synthesis]: a prescribed line's future is known, so the
  tilted plate draws it above the present, faint and dashed, rising out of the sheet, while free
  bodies' futures stay blank. The plate then shows what is determined and what isn't.

### 6.3 The cone as a slice

- **An observer** is a world line: the selected body, the boost observer, the accelerated observer
  (§6.6), or a prescribed or held body.
- At each moment of its proper time, its past light cone meets every world line once (for
  subluminal sources, `g(t) = (t_O − t) − |x(t) − x_O|` is monotone). That intersection is the event
  the observer sees. The slicer gains the cone beside its planes.
- **Tilted:** the selected body's past cone is already drawn. Under Seen it becomes a slice: world
  lines pierce it (`vs_pierce`'s job, for the cone), and the light in flight runs faint along the
  cone's generators from each pierce point to the apex.
- **In the plane:** each body is drawn at the emission event's position in the observer's
  coordinates, which puts it in its aberrated direction at the distance its light travelled. A fast
  body shows where it was, at its seen speed.
- Seen is a third choice beside Lab and Observer (open decision 2), with the streak plate (§6.5)
  under the scene.
- **Model boundaries:** sight uses straight null lines; with gravity on, light bends (lensing, boson
  deflection) and sight doesn't, and the backdrop's lens map doesn't change that, which the key says.
  Frames on Klein and RP² draw the primary image only, and so does sight there.

### 6.4 Ticks' light and radar

No beacons or mirrors (a9, 2026-10-27): the signals are the light of events the plate already
draws. Ticks' light landed 2026-10-27 (§14): rings at the present, rays and reception marks, a
prescribed receiver's receptions found in its known future. Radar is open.

- **Ticks' light.** A body's beads are its clock's ticks. Selected, its ticks send light: each bead's
  future cone, drawn as a ring growing at c in the plane and a cone in the plate, marked where it
  meets another world line (a monotone function along that line, bisected as the slicer does). The
  light interacts with nothing; it is the tick seen, not a signal sent.
- **The k-calculus** [standard] (Bondi): ticks every T of a source receding at v arrive every kT,
  `k = √((1 + v)/(1 − v))`. The twin by its ticks' light counts what each twin receives, and the
  age difference falls out with no simultaneity.
- **Radar time** [standard] (Bondi; Dolby and Gull 2001) is a slicing, computed from the geometry,
  with nothing reflecting: an event that the observer's light could reach at τ₁ and whose light
  reaches the observer at τ₂ is assigned time (τ₁ + τ₂)/2 and distance (τ₂ − τ₁)/2. For an inertial observer these are its Lorentz coordinates; for the travelling twin
  they give simultaneity surfaces that stay continuous through the turn, where the instantaneous
  rest frame's jump. Both slicings, side by side on the twin, are the clearest picture of what
  "simultaneous" means.
- **Radar needs the future** (Codex): an event's radar time waits for its light to reach the
  observer. For a simulated observer, sight draws radar coordinates only where that has already
  happened (or lags the view until it has); a prescribed observer's whole line is known, so it has
  none of this wait. The rest frame's lag (frames' lagged view) is not enough for radar.

### 6.5 The seen sky and the streak plate

- **Doppler** [standard]: `ν_o/ν_s = (k·u_o)/(k·u_s)`, for any source and observer.
- **Aberration** [standard]: a source at angle θ from the observer's velocity is seen at
  `cos θ′ = (cos θ + β)/(1 + β cos θ)`.
- **Beaming** [standard]: under the planar convention the sources and their light are 3+1, and the
  ring samples the equator of a 3+1 sky. Bolometric intensity transforms as D⁴ (energy) and photon
  number intensity as D³; a receiver's flux adds its source's angular extent, distance and aperture
  (Codex). Sight states which one a mark's weight reads, and doesn't redefine radiation as 2+1.
- **Apparent superluminal motion** [standard] (Rees 1966): a blob at v, at angle θ to the line of
  sight, crosses the sky at `v sin θ/(1 − v cos θ)`.
- **Real light:** pool photons that reach the observer register as arrivals, so the sky shows both
  virtual sight and the light the simulation emitted.
- **The streak plate** [synthesis]: a planar eye sees a one-dimensional image, directions on a
  circle. Stacked over the observer's proper time, these images become a two-dimensional picture of
  everything the observer saw: direction across, τ upward, now at the top. It is the family of the
  observer's past light cones, one per reception event, unrolled along its world line, as the
  tilted plate is the lab's history. Each source draws a track, its seen direction against τ; the
  track's weight reads its intensity and its pattern its Doppler factor (solid approaching, dashed
  receding), so it holds in grayscale; the forward direction sits at the centre. It shows a fast
  observer's sky crowding forward, the twin's turnaround as a kink in every track with receding
  sources turning solid, apparent superluminal motion as a slope, and, in 3.x, a cosmic string's
  doubled tracks. It costs one light-cone solve per reception event and source, and it is computed,
  not recorded. **Its window isn't a fixed 127 units of τ** (Codex): each old reception event needs
  older source history still, samples arrive once per qualifying substep, and under expansion the
  ring holds conformal time. The plate's bottom edge is where history runs out, drawn as such.

### 6.6 The accelerated observer [standard]

- An observer kind beside the six: constant proper acceleration α along a chosen direction, through
  the camera's centre now. Its world line is the hyperbola x² − t² = 1/α² about a corner, the line
  x = t = 0 (along y in the plane).
- Its simultaneity planes all contain the corner (`t = x·tanh ατ`), so the slicer's plane
  `t − u·x = t_A − u·X_A` serves with the anchor on the corner and u = tanh ατ: in the tilted plate
  the sheet of the present swings about the corner line as τ advances.
- **Two null boundaries**, the planes x = t and x = −t through the corner, drawn as hatched sheets at
  45°. Events beyond x = t can never send light to the observer, and two-way radar needs the
  wedge between both: seeing an event and assigning it radar coordinates are different conditions
  (Codex). Bodies that cross x = t fade on the far side. An observer accelerated only for a while has
  no eternal horizon, and the sheets are drawn only for the eternal one.
- **Radar** [standard; derived here and by Codex; Bini, Lusanna and Mashhoon, arXiv gr-qc/0409052]: the
  observer at `(t, x) = (sinh ατ, cosh ατ)/α`, an event at `(ξ sinh αη, ξ cosh αη, y)` in the
  wedge. The null conditions give `cosh α(η − τ) = (α²(ξ² + y²) + 1)/(2αξ)`, so radar time is η and
  radar distance `(1/α)·arcosh[(α²(ξ² + y²) + 1)/(2αξ)]`, which is `|ln(αξ)|/α` on the
  acceleration axis. The radar slicing is the Rindler slicing, and the horizon is infinitely far.
- **Bell's ships and the rigid ruler** (3.0, measured by picking): two bodies under the same uniform external g follow
  hyperbolae of the same α about different corners, and their proper separation grows as γ; a
  Born-rigid ruler's points share one corner, with α = 1/ξ. The figure contrasts the two. It shows
  the separation, not a string breaking, which would need material dynamics (Codex).

### 6.7 The hand [synthesis on standard pieces]

Landed 2026-10-27 (§14; `AGENTS.md`, Prescribed bodies): grab, pursuit under 0.75c, throw, the
agent's books, and its oracle. Still open: the band's fronts measured against c (quantitative after
`MODEL.md` §3.5), and the grip's start and end as acts with light cones (§7.2).

The hand comes last in 2.6, on top of prescribed world lines: it is a prescribed line written live.

- **Grab a body and move it.** Press on a body and drag (touch the same; a drag from empty space
  still spawns). While held, the body is prescribed: the pointer sets a target, which the body
  pursues in simulation time along a smooth path with bounded acceleration, on the sheet of the
  present in either view. Smoothness comes from the pursuit itself; clamping a velocity after the
  fact would break it (Codex). Releasing it throws it with its last velocity.
- **Its speed stays under the κ floor's,** about 0.78c, where `LW_KAPPA_MIN` starts suppressing the
  forward field, so the fields it makes are quantitative; past it the caption would have to say so
  (Codex: at 0.98c the forward κ is 0.02 against a floor of 0.215).
- **The interpolant stays timelike.** A smooth bounded path doesn't guarantee that the sampled
  Hermite segments do, so the samples are validated, at release too.
- **Everything that reads world lines answers through the light cone.** Shake a charge and the field
  atlas's lines kink: the change fills the band between the light fronts of the shake's start and
  end, running outward at c, J. J. Thomson's and Purcell's picture of radiation drawn from the
  simulation's own fields. The lines are each frame's integral curves, not material threads that
  travel. Tilted, the band lies between two future light cones. Other charges feel the shake when
  its light reaches them. Quantitative claims wait for the model's one-trajectory reader.
- **Books:** the hand is the agent of §6.2, with its work booked the same way. The grip's start and
  end are acts, each with its light cone (§7.2).

### 6.8 The sheet as a handle

Tilted, the sheet of the present is the observer's simultaneity. Drag its far edge and it tilts:
its slope is the observer's velocity, and the figure bar's boost scale follows. The drawing is the
control: an affordance rather than an instruction.

### 6.9 Extended bodies (a second stage)

Each point of a body is seen at its own retarded time, so a fast body's seen outline is neither its
lab shape nor its contracted shape (Terrell 1959, Penrose 1959) [standard]. In the plane, sample the
body's rest-frame disk along its world tube per sky direction [synthesis]. Delaying the centre alone
isn't this effect (Codex); label point-source sight as point-source until this stage lands.

### 6.10 Oracles

- a prescribed body's samples reproduce its curve's position, proper velocity and acceleration, and
  its interpolant stays timelike;
- the agent's work on an isolated neutral body accelerated from rest equals Δ(γm);
- the cone slice of a uniformly moving body equals its analytic retarded position and
  `retardedState()`;
- aberration of a ring of static sources seen by a moving observer;
- the Doppler ratio for moving source and observer pairs;
- a tick's light reaches another world line on the cone, with an arrival-time residual under
  tolerance;
- radar coordinates of an inertial observer equal its Lorentz coordinates; a static body's radar
  distance is its distance; the accelerated observer's radar time equals η and its radar distance
  the arcosh above, off the axis too;
- the k-calculus interval kT, and the twin's ticks counted against its clocks;
- apparent transverse speed `v sin θ/(1 − v cos θ)`;
- a held or prescribed charge's field at a distant point equals the analytic Liénard–Wiechert field
  of its curve, and the band's fronts move at c.

## 7. 3.0: the causal sandbox

The live run is the experiment (a9, 2026-10-27). 3.0 makes the running world something a visitor
acts on and reads causally: any event can be picked and measured, every act is an event whose light
can be watched spreading, and its consequences arrive where that light reaches. Nothing is kept for
later: no checkpoints, replay, recipes or side-by-side runs, and no apparatus objects (§11.2). The
general means of acting are the hand and prescribed bodies (2.6), editing a body, and composing.

### 7.1 Events and their cones

- **Picking.** Pick a marked event, a bead or any point on a world line in the tilted plate: an id
  pass renders world-line strips and events into an integer target with (slot, sample, fraction),
  and a click reads one texel. Selection works in frames: a click maps back through the display
  transform.
- **Cones on demand.** A picked event shows its past and future light cones, live: the future cone
  keeps widening as the run goes on, and in the plane view its present is a ring growing at c. The
  cones divide the history into what the event can influence, what can have influenced it, and
  what is elsewhere.
- **Measurements,** for a picked pair: the interval s² with its kind, and Δt and Δx in the lab's
  and the observer's coordinates, live as the boost changes while s² doesn't; each world line's own
  proper time between its picked events (the twin: home's 10 against the traveller's 6);
  simultaneity through an event, the observer's and radar's.
- **Labels.** Picked events take letters (A, B, …) and bodies take the names their figure gives
  them ("home", "traveller"), set in italic Newsreader and collision-checked. The colour-vision
  checks found the accent falling to ΔE₀₀ 2.1–2.9 against sap and sienna in dark deuteranopia, so
  picked events and their labels carry a pattern too.
- **The event log** (§12.2) gives picking and the plate true events: births, deaths, merges,
  emissions and absorptions, with the four-momentum that changed hands, so a photon is drawn from
  its emission event and the plate draws logged events instead of scanning every sample for them
  (§10). Bodies are named by (slot, generation), which survives slot reuse.
- The Measure tab holds the picked events and their numbers beside the ledger and the selected
  body; the phase and potential plots are redrawn in the plate's language.

### 7.2 Every act is an event [synthesis]

- Spawning, deleting, editing a body, and the start and end of a hand's grip are events. Each is
  marked where and when it happened, and its future light cone is drawn faint, widening at c and
  fading with age: the act's news, spreading. The bodies inside it are the ones that can know of the
  act.
- This is the model's causal gate made visible (`MODEL.md` §1.6): no source acts before the light
  from its creation reaches an observer, and a removed source acts from its death state until the
  light from its removal has passed. Electromagnetism, through signal delay, answers any act exactly
  when the cone arrives. Near-zone gravity answers a kick at once (`MODEL.md` §3.2 gates only births
  and deaths), so the key says that the cone is the act's light, and gravity doesn't wait for it.
  The drawing shows each law's regime rather than hiding it.
- The acts are a short list kept on the CPU, drawn like the selected body's cone.

### 7.3 Acting on the live world

- **The hand and prescribed bodies** (§6.2, §6.7), the general way to drive a body.
- **Editing the selection:** mass, charge, spin and velocity, typed or dragged, applied at the next
  substep, each an act with its cone.
- **Composing:** an orbit about the selection, its speed from the measured radial acceleration
  there, so it holds under whatever forces are on; a binary; a ring; a cloud at a chosen temperature,
  with its speed histogram against Maxwell–Jüttner in the Measure tab. A body can be a test body,
  sourcing nothing.
- **Running backwards** [standard; the retracing claims to be checked by oracle]: one act flips
  every proper velocity, spin and φ̇ and the external B, live (Loschmidt). Time-symmetric laws
  retrace until chaos sets in. Radiation doesn't: the time reverse of a retarded field is an
  advanced one, so the reversed run departs from the forward one at radiation order, and the light
  already emitted never returns. Which parts retrace and which don't is a live picture of the
  radiation arrow.

### 7.4 Fields in spacetime

A ring of snapshots of the scalar fields (for example 64 snapshots at 64², about 1 MB a field) puts
them into the plate: the Higgs's zero contour sweeps out world-sheets in the tilted plate, so
Kibble–Zurek coarsening shows walls pinching off in time [synthesis]. φ is a Lorentz scalar, so
sampling the ring on an observer's slice is exact up to interpolation, and the scalar fields can be
drawn in a frame (they're hidden in frames now). Potentials aren't scalars and stay lab-only.

### 7.5 Figures

Each figure shows its predicted number beside its measured one, in its caption or the Measure tab
(§4), and the sandbox makes new figures possible: Bell's ships and the rigid ruler, the slingshot
twin (a twin turned by a mass), Maxwell–Jüttner.

### 7.6 Oracles

- s² for a picked pair is invariant under the boost, to f32 tolerance;
- proper time between picked events on a free body and on a circular orbit against Δt/γ and the
  lapse;
- a picked event's future cone meets each world line where the slicer's cone search finds it;
- an act's cone reaches a distant charge exactly when that charge's force from the act changes;
- Bell's proper separation grows as γ, and a Born-rigid ruler's doesn't;
- a composed orbit stays circular over an orbit (eccentricity under 10⁻³ outside contact);
- running backwards: a Newtonian binary retraces to its start within integration error; a fast
  charge pair departs, by an amount at radiation order;
- **UI acceptance:** the harness reproduces each figure's comparison by clicking alone.

## 8. 3.x: other spacetimes

Each is a regime of its own, chosen as a topology is, not blended with the many-body forces
(`MODEL.md` §1.2, declared regimes): test bodies, light and clocks in a given spacetime, with the
sight and the sandbox working there as everywhere.

### 8.1 Cosmic strings and Gott's pair [standard geometry; synthesis to build it here]

- **The cone.** A straight cosmic string perpendicular to the plane, its energy per length equal to
  its tension μ, is invariant along its length, so the plane is a slice of an exact solution: flat
  spacetime with a wedge of angle Δ = 8πμ removed and its faces identified (Vilenkin 1981). In 2+1
  gravity the same cone is a point particle's (Deser, Jackiw and 't Hooft 1984); that equivalence is
  the geometry's, and 3+1 electromagnetism stays 3+1 (Codex).
- **Motion is straight.** Test bodies, light and clocks move on straight lines in the cut chart and
  cross the cut by its holonomy, `X′ = A + B(v)·R(±Δ)·B(v)⁻¹·(X − A)`: a rotation by Δ about the
  string's event A, conjugated by its boost B(v) when it moves, acting on the event X, so it changes
  the chart's time as well as position and velocity (Codex; Grant constructs these). Nothing is
  integrated, so nothing is approximated.
- **A cut domain, sewn.** The implementation sews the two faces of a cut domain; quotienting the
  whole plane by repeated rotations doesn't make a cone. Curvature sits at the string, but the
  identification acts globally (Codex).
- **The plate draws the identification.** The cut is a seam with matching ticks, as a torus's seams
  are, and the rulers bend across it by Δ: the quantity is the drawing. The World tab's
  identification diagrams gain the cone.
- **Seen twice.** Lines of sight in the plane pass on either side of the string, so an in-plane
  observer sees a source behind it twice, the images `Δ·D_LS/D_S` apart and neither magnified nor
  distorted (Vilenkin 1984). The streak plate shows the doubled track. The backdrop lens, viewed
  along z, along the string, shows nothing: light travelling along a straight string isn't
  deflected.
- **In order:** a static string first, then a moving one, then Gott's pair as its own deliverable.
- **Gott's pair** (Gott 1991): two equal strings passing at equal and opposite speeds in their
  symmetric frame admit closed timelike curves once `γ sin(Δ/2) > 1`; the condition isn't a
  threshold to apply to unequal strings one at a time. Carroll, Farhi and Guth (1992): the pair's
  total momentum, read from the combined holonomy (not by adding momenta), is spacelike, so it can't
  be assembled from timelike matter in an open universe; 't Hooft (1992): a closed universe crunches
  first. A spacetime with closed timelike curves has no global Cauchy evolution for the stepping
  loop to run (Codex), so the first deliverable is a **geometric path explorer**: a constructed loop
  drawn in the plate with its closure and timelikeness residuals, and test clocks on it.
- **What it excludes:** Worldline's own forces and fields. Electromagnetism on a general cone has a
  geodesic part and a scattered tail, so rotated copies of flat Liénard–Wiechert fields aren't
  enough; on a cone of opening 2π/n, n an integer, finitely many images suffice with no scattered
  part (Krtouš), which could let prescribed sources radiate there, but not on an arbitrary deficit or
  Gott's pair. Many strings, by 't Hooft's polygon evolution, are [speculative].

### 8.2 Black holes as a metric [standard]

A fixed Schwarzschild, then equatorial Kerr, metric for test bodies, light and clocks: capture, the
photon sphere at 3M, the ISCO at 6M (1M to 9M for Kerr), zoom-whirl orbits, Shapiro delay, a real
Penrose process, the exact lapse, and signals across a horizon. The embedding diagram as a view:
Flamm's paraboloid, and for Kerr's equatorial slice `R(r) = √(r² + a² + 2Ma²/r)`,
`Z′² = r²/Δ − R′²` (Codex). A fixed metric isn't blended with many-body forces; Paczyński–Wiita stays
the many-body regime's hole (`MODEL.md` §3.6).

### 8.3 FRW, measured [standard]

Emitted against received wavelength, `1 + z = a_receive/a_emit`, by ticks' light between comoving
bodies;
conformal distances; particle and event horizons; bound against expanding systems, all as
measurements; imposed backgrounds kept apart from the Friedmann closure.

### 8.4 Gravitational waves at a ring [standard]

After the model pass identified binaries radiate by 2.5PN reaction (`MODEL.md` §3.2). Their waves are
read at a remote ring of test masses, since their wavelength is about π/(2v) separations and a tensor
strain is not a picture of a spiral; both polarizations through an off-plane detector's response.

### 8.5 Fields carrying energy, and the model's separate projects

- A controlled acceleration pulse on a prescribed charge (§6.2), its field change propagating,
  received power measured by quadrature over a closed surface and balanced against the agent's work.
  Point-charge self-energy needs a stated regularization, and planar field pictures can't recover 3D
  flux by themselves (Codex).
- `MODEL.md` step 5: varying-α electromagnetism with retardation (§3.8 there), self-consistent slab
  gravity (§3.9), 2PN only if an oracle asks for it.

## 9. Figures in posts

Any time, in any lane: `?embed` shows the plate and its caption with play and pause only, and
`?fig=N` names a figure, so a9's posts carry live figures through the markdown `iframe` directive,
whose same-origin frames the root's `frame-ancestors 'self'` allows. Figures are data
(`applyConfig`), so this needs nothing else. The post does the telling; the figure stays live.

## 10. Performance: open

What 2.1 and 2.2 measured, changed and cleared is in `docs/PERFORMANCE.md`. Open:

- **The model pass moves the costs.** With gravity at present positions, Barnes–Hut serves gravity
  under Relativity, and the O(N²) light-cone cost falls on electromagnetism alone; the contact
  kernel lets bodies close in, and the step control pays in substeps, with time slowing past the
  budget instead of the 32-substep cap. Re-run the standing set after each step.
- **The relativistic pair force** is O(N²) and arithmetic-bound: about 2.4 ms back to back at 4000
  bodies here, so 4096 relativistic charges run near 10–15 ms on a base M-series GPU. Past it lies a
  retarded far field: fixed cells keep moment histories, read at each cell's light-crossing time
  [speculative].
- **The heatmap with Relativity** solves 128² cells × N light cones every fourth frame: about 9 ms at
  4000 bodies, the overlay's one remaining hitch.
- **World lines at 4000 bodies tilted** keep 1.6M of 4.1M points and cost about 3.8 ms, 134K events
  among them; the event log (§7.1) lets the plate draw logged events instead of scanning for them.
- **The torus walk.** On a periodic domain the tree gains at most a third over the pairwise loop to
  the cap and sometimes takes 5–6 ms against 0.75 near 4000 bodies (`docs/second-pass/bh-notes.md`),
  so periodic domains stay pairwise (`TREE_ON_PERIODIC`). Finding the cause (the half-domain
  criterion opening every node near a plane, or group boxes that Morton order's jumps make large)
  would let the torus use the tree.
- **2.6's costs:** the streak plate's light-cone solves (observer samples × sources) and the ticks'
  light arrival searches, budgeted against the presets'.
- **Kugelblitz in Hawking gas** collapses at its one-a-frame limit: whether that is the experiment or
  a tuning question is open.

## 11. Branches, considered, retired

### 11.1 Branches

Not scheduled. Each is admitted when a figure needs it and nothing in the spine provides it.

- **Dust** (collisionless particle-mesh tracers): structure formation on the expanding torus seen
  through the lens; thin-disk dynamics. Gas is not coming, so the Bullet Cluster isn't either.
- **Media** for light: Fizeau's drag in moving water, a classic test of relativistic velocity
  addition, and Cherenkov cones at `cos θ = 1/(nβ)`; weak gravity as an index `n = 1 − 2Φ`. Not
  prisms or spectroscopy.

### 11.2 Considered and not proposed

- **Scored problems or challenges:** each figure's prediction already is its problem, and scores
  aren't the register.
- **The record** (set aside 2026-10-27, a9): an archive of whole runs, checkpoints, replay and
  branching, recipes by URL, `version: 3` saves, and side-by-side runs. Provenance distracts from
  the live model, and the run comparisons and recipes weren't worth their cost. A longer drawn past
  than the ring's 127 units returns only if a figure needs it.
- **Apparatus objects** (set aside 2026-10-27, a9): beacons, detectors and mirrors were specific to
  particular experiments; ticks' light, radar as a slicing and computed readouts cover their uses.
  The figures that needed them, the light clock and Sagnac's loop, went with them.
- **Exports** (set aside with the record): a vector SVG of the plate and the history as a 3D solid.
  A post carries the live figure instead (§9).
- **Shared universes** between visitors.
- **A 1+1 panel beside the plate:** the tilt superseded it.
- **Sound** (set aside 2026-10-27, a9's lean): an opt-in speaker for ticks clicking as their light arrives
  (at the rate D/T, so the twin would hear 1/(kT) going out and k/T coming back), Doppler-shifted
  tones and a binary's strain. Each sound would have read a quantity; the plate carries them.

### 11.3 Retired

- **Volumetric 3D physics** and the inclined, ray-traced view of the slab.
- **Gas** (SPH or Eulerian), its sinks, accretion and cooling.
- **The quantum layer**: Schrödinger, Dirac, Gross–Pitaevskii, Schrödinger–Poisson.
- **The brush as a general layer system.**
- **"Make a geon"** as a success criterion: a long-lived numerical lump wouldn't establish it.
- **The ER=EPR framing** for annihilation photons: they share an origin, which the event log shows;
  that isn't entanglement.
- **Hidden Disintegration**, deleted 2026-10-24 (`ef6576f`).
- **Coverage presets:** superradiance, Schwinger, kugelblitz, Klein/RP² and the external fields
  return only as figures.

## 12. Architecture

### 12.1 World-line store (built)

Per sample 12 f32 (48 B): `t, x, y, wx, wy, ax, ay, τ, θ, angw, m, q`, every 1/8 of the world-line
clock, 1024 per slot (48 KB a slot, in tiers of 512 to 4096 slots), always recorded; positions on
the covering plane through a per-slot deck; times on a rolling f32 epoch; meta
`writeIdx, count, creationTime, generation, deck flips, bx, by, _pad`; birth samples, death snapshots
and merge breaks. `retardedState()` (past null cones) and `wlOnSlice()` (spacelike planes) read it.

### 12.2 Event log schema (fixed in M1; built in 3.0)

The log holds the discrete events a slice needs to decide who existed and what changed hands.
Continuous changes (Hawking loss, superradiance, accretion) live in the samples' `m` and `q`.

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

- Append into a ring of 16,384 records (768 KB) that overwrites its oldest; births and deaths from
  the CPU go through a one-thread append pass, so the counter has one owner.
- Unordered within a substep, ordered between substeps; readers bin by t.
- If boson events crowd out lifecycle events (Hawking-heavy scenes), they move to their own ring;
  decide on measurement.
- Annihilation is not a merge: both bodies lose the lighter one's mass, a body left with none logs
  `EV_DEATH` (annihilate), and the photon pair logs two `EV_EMIT`s at the event point.

### 12.3 Tests

`tests/physics-validation.html` instantiates the production `GPUPhysics` headlessly, runs each
analytic oracle and reads back GPU state (57 oracles). Every feature adds its oracle, and every
figure is one. The WGSL→JS transpiler (`lib/wgsl/transpile.js`, compute only) and `gpu-diff.mjs`
remain available for Node kernel tests where a kernel is pure compute. The screenshot-diff,
colour-vision and benchmark harnesses are in `docs/second-pass/tools/`.

## 13. Gotchas

- f32 times on the GPU: use the rolling epoch.
- `queue.writeBuffer()` lands before any of the encoder's passes; per-pass uniforms go through
  dynamic offsets, copies or separate submits.
- WebGPU has no float atomics.
- Torus identifications are simultaneous only in the lab frame.
- Potentials aren't Lorentz scalars; φ is.
- **Familiar approximation names don't certify Worldline's hybrid integrator** (Codex):
  Paczyński–Wiita's 6M ISCO and Darwin's O(v²) covariance must be measured (and under relativistic
  kinetics Paczyński–Wiita's radii aren't 4M and 6M at all, `MODEL.md` §3.6).
- **A dimensional label doesn't repair an equation** (Codex): the planar convention fixes the parent
  equations; each reduction still needs its own derivation.
- **A wiring fix can switch on a defective coupling** (Codex, `MODEL.md` §2): where the coupling
  behind a bug is itself wrong, disable it until its model lands.
- Never let one length serve as confinement thickness, comoving slab thickness and softening at once.
- The naming rule (`AGENTS.md`) covers every new string: "signal delay", "light-cone" or
  "Liénard–Wiechert" for finite-speed propagation.
- **Reading GPU timings on Metal:** passes overlap, so per-pass times include waits and their sum
  overcounts; compare spans (first begin to last end), per phase. Other GPU work (another benchmark,
  another agent's browser) skews them: A/B by alternating two frozen trees, and never edit a tree
  that a benchmark is serving.
- **An idle GPU clocks down:** a paused page redrawing every frame leaves the GPU mostly idle, so a
  render's span reads several times its cost at speed and swings 2× between identical runs. Time
  render work back to back instead, many renders in one task and the wall time each, with and without
  the part measured.
- **Occupancy:** a pass of one thread per body over N sources leaves the GPU idle at Worldline's
  sizes (500 bodies is eight workgroups); give each body a group of threads.
- **A render pass per layer** costs a full-canvas load and store each on a tiled GPU.
- **A count read back a frame late** sizes nothing safely: copy the capacity and trim, or keep the
  count on the GPU.
- **Data races hide as noise:** a kernel that reads neighbours of the buffer it writes passes every
  oracle and fails only a bitwise reproducibility check (`shots.mjs`).
- **Test a tree by its root:** both CAS-built trees had empty roots at scale, and every walk over
  them quietly returned nothing. An oracle that the root holds every item, and a walk against the
  pairwise sum at a few hundred items, catch it.
- **Lock-free GPU structures lose items** when one thread's subdivision races another's claim; build
  from sorted keys instead, which is also the same every run.
- **An empty compute pass writes no timestamps** on Metal, and its stale ones stretch the profiler's
  span by seconds.
- **A dispatch can't read its indirect size** from a buffer bound for writing in that dispatch; the
  tree plan writes its own buffer through its own bind group.
- **One compute pass serializes its dispatches** on Metal where separate passes overlap: fuse only
  chains that depend on each other anyway.
- **The browser pane's screenshots miss the WebGPU canvas;** use `shots.mjs` for the plate.
- Citations here are names and years. Verify each against its primary source (DOI resolver,
  Crossref) before it reaches `about.md` or JSON-LD.

## 14. Landed

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
| 2.3 | 2026-10-26 | `8289c3b`, `d35231e` | Force summation automatic (lane): pairwise below 1536 bodies, the tree above with θ from 0.1 to 0.5 by 4096, held to 1152; periodic domains pairwise (the torus walk is open work, §10). |
| 2.3 | 2026-10-26 | `9c80cbc`, `dc56d43`, `b51feee` | The margin in the plate's notation: Figure · Laws · World · Measure, word choices, ticks showing each law's mark, ruled scales, edge diagrams, field pads; caption knobs and figure numbers; the Trails, Clocks and lensing switches removed; every body's outline its clock. The lens pass runs only while there is something to bend. |
| 2.5 | 2026-10-27 | `fb4d1ab`, `95039c1` | `docs/MODEL.md`: a six-lane audit of the physics and the model's plan, after Codex's adversarial review. |
| 2.5 | 2026-10-27 | `aee6699`, `a3bdc7b` | Step 0: ten contained bugs fixed or disabled (pion and lepton Coulomb's 1/m, the bounce torque's sign, the 1PN recompute's sources, pending radiation through deaths, pion over-booking, holes' double-booked spin, one canonical J; the quadrupole sink, pair modulations and boson pull disabled), pools compacted every frame, the fields' energy from edge differences. |
| — | 2026-10-27 | `5009c17` | Show, don't tell: each figure's caption is its name and live values, in both languages. |
| 2.6 | 2026-10-27 | `e2d56c2` | Prescribed world lines (§6.2): five curves, the pass that keeps a body on its curve, the agent's books, a figure's known past in the ring and the known future drawn above the present; the twin on prescribed bodies with turns of finite duration. |
| 2.6 | 2026-10-27 | `653d83b` | The hand (§6.7): grab, pursuit under 0.75c, throw; field lines kink in bands running outward at c. |
| 2.6 | 2026-10-27 | `ed88573` | Ticks' light (§6.4): rings at the present, rays and reception marks; the k-calculus on the twin. |
