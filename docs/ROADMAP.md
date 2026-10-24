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
no labels in 2.0, the 1+1 Minkowski panel) are in git history.

### Open

1. **3.0's model** (§7): which of honest gravity, fixed-metric curved spacetime and a
   resolution overhaul, in what order. Decided at a decision point after 2.5, informed by
   what the instrument measures.
2. **Body and pool caps** after 2.1's measurements (§3.1). The archive's memory scales with
   them (§4.1), so settle them before 2.5.
3. **Where Seen lives:** a third choice beside Lab and Observer (recommended), or an inset.
4. **Where measurements live:** a Measure tab in the margin (recommended) beside the plate's
   own marks, or on the canvas only.
5. **Replay fidelity:** checkpoints are exact on one machine, recipes reproduce
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
| **2.1** | Performance and receipts | measure and optimize; settle the caps; fix what 2.0 shipped; delete Disintegration; honest `about.md` (§3) | M |
| **2.5** | The laboratory | the record (§4), then sight (§5), then the instrument (§6) | L |
| **3.0** | The model | a decision point, then honest gravity and/or curved spacetime (§7) | L |

Branches outside the spine are admitted only by an experiment they uniquely enable (§8).

## 3. 2.1: performance and receipts

### 3.1 Performance

Measure first, then cut, then settle the caps, because 2.5's archive and second universes
(§6.6) spend whatever 2.1 frees.

**Measure.**
- GPU timestamp queries per pass where the device offers `timestamp-query`, behind `?perf`;
  CPU frame time and readback latency beside them.
- A benchmark mode for the headless harness (`docs/second-pass/tools/tour.mjs`): p50 and
  p95 frame time per scenario, written as JSON so runs can be compared. Scenarios: each
  preset in plane and tilted; Fields on; a boosted observer; 512 bodies with gravity,
  Coulomb and Relativity on a torus; full boson pools in black-hole mode; both fields with
  grid gravity.
- Targets: 60 fps on every preset on an M-series base GPU, physics within half the frame;
  time to first frame.

**Suspects** (to confirm or clear by measurement):
- **Ghosts.** The ghost margin is half the domain (`ghost-gen.wgsl`, `max(W, H)·θ`), so on
  any looped domain every body makes up to three ghosts and the tree holds about 4N
  entries, rebuilt every substep and again for the 1PN correction. Ghosts weigh nothing in
  the aggregates since 2026-10-23, so they need only reach as far as collisions and hit
  tests (in black-hole mode, the largest horizon). The ghost buffer holds 512, so above
  about 170 bodies seam collisions are lost (the count is clamped since `346564b`, which
  stopped the overflow from freezing the physics).
- **Substep submits.** Each substep is its own command buffer so its uniforms land
  (up to 32 a frame). A per-substep uniform ring read by dynamic offset, the FFT's pattern,
  would put a frame's substeps in one encoder.
- **Liénard–Wiechert** runs pairwise, each pair a binary search over up to 1024 samples
  plus Newton steps. The retarded sample moves little between substeps, so a per-pair
  bracket hint should cut the search to a step or two.
- **Readbacks:** fourteen `mapAsync` channels; one consolidated staging copy per frame.
- **The field atlas** traces field lines and contours on the CPU from a readback every
  frame, and the lens map recomputes 512² every rendered frame even when nothing moved.
- **World-line strips** draw 4 vertices for each of 1024 samples per slot at every zoom;
  level of detail by on-screen length.
- **Startup:** serial shader fetches, synchronous pipeline creation, and `init()`
  refetching the shared WGSL. Fetch in parallel and use the async pipeline constructors.

**Caps** (open decision 2): raise the 512-body cap and the pools if the measured budget
allows; the archive's memory (§4.1) and the second universe (§6.6) are the consumers.

**Structure that blocks consumers** (not line count for its own sake):
- `GPUPhysics.update()` returns when no body is alive, so field-only scenes need a tracer
  body (Kibble–Zurek's). Step fields without bodies.
- Photon passes are gated on the switches that can emit photons, so photons left after
  Radiation and Merge are turned off freeze. Gate on existence.
- Presets configure physics through DOM events and keep private mutable state (the beam).
  Presets become data plus a tick, applied through `sim.settings`.
- The audit's extractions: the field subsystem and a readback-channel helper out of
  `gpu-physics.js`; the raw `dt` write at byte 0 of `SimUniforms` as a named offset; the
  dead `_submitArrowDraw`; the heatmap viewport math duplicated in `gpu-backend.js`.
- The `torque-render.wgsl` header table swaps the contact and superradiance offsets.

**Checks for 2.5's UI work:** screenshot diffs across both themes and three zooms, built on
the tour harness, and a colour-vision simulation pass. GPU timestamp budgets join them.

### 3.2 Receipts

Fix what 2.0 shipped, so each figure says only what it shows.

- **Delete Disintegration** (decided). Extremal censorship keeps running in black-hole mode.
- **The twin fits its history.** Its round trip is about 370 time units against a 128-unit
  ring, so the plate never shows departure and reunion together. Shrink the domain to about
  [56, 32] (a round trip near 107) until the archive (§4.1) lets it grow again.
- **Captions follow the state, not the clock.** Tilting the twin replaces its clock
  comparison with generic spacetime prose; keep the comparison. Kibble–Zurek's caption
  says "frozen into domains" at t = 8, before any domain is drawn; read the ordered fraction
  from the scene snapshot instead. Give Kibble–Zurek a quench-time knob and its measured
  wall density now; the side-by-side comparison comes with §6.6.
- **`about.md` says what the model is.** It calls the expanding universe's
  Liénard–Wiechert field exact (it is regularized and interpolated), says the energy drift
  measures numerical error (several terms aren't booked, §7.3), and leaves out that
  superradiance runs at α² instead of α⁸. Its Black Hole Physics, Charge Quantization,
  Forces and Educational Use sections are still in the pre-2.0 register, and the force
  count lists expansion as a force. Name the surrogates: planar photons, the gravitational
  signal-delay toy and what it does to binaries, Paczyński–Wiita.
- **New social-card art** for the 2.0 plate.

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
- **Fidelity** (open decision 5): atomics in the tree build, collisions and boson appends
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
- Seen is a third choice beside Lab and Observer (open decision 3).
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

A Measure tab holds the picked events and their numbers (open decision 4). The Stats and
Particle tabs are redrawn around time and frames: sparklines, and the phase and potential
plots in the plate's language (2.0's pillar 6).

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

One knob, one predicted number, one measured number, and the comparison:

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
- **Pools:** photon and lepton culls are lab-time ages and destroy bound structures.
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
- **Hidden Disintegration** (decided).
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
- Citations here are names and years. Verify each against its primary source (DOI resolver,
  Crossref) before it reaches `about.md` or JSON-LD.
