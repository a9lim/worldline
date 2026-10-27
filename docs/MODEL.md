# Worldline's physics model

The corrected model for 2.5, specified against an audit of the code at `6de3df8`. Status:
**second draft, after Codex's adversarial review of the first (`fb4d1ab`, 2026-10-27).** It is
the plan for the model pass (`ROADMAP.md` §5), and step 0 has landed from it; its §8 decisions
are a9's and open, and step 2 ratifies the regimes once they are settled. §10 records what the
review found and what changed. §2–§5's **Now** are the model's known boundaries, which were
`ROADMAP.md` §7.3.

Tags as in the roadmap: [standard] is textbook or established practice, [synthesis] is a
combination made here, [speculation] is a guess to test. **Now** is what the code does (with
`file:line`), **Target** what it should do, **Books** where its energy goes, **Oracle** the
number that certifies it. Equations quoted from memory are marked *verify* and are checked
against their source before code; the first draft's were checked in the review (§10).

## 0. Ordering

Decided (a9's suggestion, 2026-10-27; `ROADMAP.md` §0): the model pass comes first.
**2.5 is the model** (this file), **3.0 the causal sandbox** (roadmap §7; a9 set the record aside
the same day), and sight, which reads histories and needs none of this pass's dynamics, runs beside
it as 2.6 behind a shared trajectory contract (roadmap §3, §6). Of the old 3.0, the corrections
move into 2.5; the new spacetimes (cosmic strings, the Schwarzschild and Kerr metric regime and
its embedding diagram, the gravitational-wave detector ring, fields carrying energy) stay after
the sandbox as 3.x, since they want its picking and measurements (roadmap §8), and the covariance
meter becomes this pass's oracle (roadmap §5).

Why the model first:

1. **Replay is the dynamics.** The record keeps runs reproducible by link and replay, so a
   shared run names the dynamics version it ran under, whatever the order. Changing the
   dynamics after links ship means carrying the old version or breaking the links; model
   first, and the record starts on the dynamics it will keep longest. (Codex: the swap doesn't
   remove the need for a version stamp, only how many versions the record must carry.)
2. **The instrument would exhibit the faults.** §6.5 puts a predicted number beside every
   measured one. On the held model the gravitating figures miss their own predictions: an
   equal-mass binary at v = 0.16 loses 80% of its binding energy per orbit, and Plummer
   softening ε = 8 leaves the pull at r = 20 (a third of the domain) 20% short of Newton's.
3. **The decision is already informed.** The record was to inform 3.0's choice. The faults are
   measured (§7.3) and the theory is standard: instantaneous forces can't be frame-independent
   (Currie–Jordan–Sudarshan), and gravity's aberration cancels against velocity-dependent
   terms (Carlip 2000). The covariance meter would quantify that, not decide it.
4. **The harness exists.** `tests/physics-validation.html` and the physics hashes of
   `shots.mjs` are enough to develop the model against.

Reason 1 lapsed when a9 set the record aside (2026-10-27): there are no replay links to carry a
dynamics version. Reasons 2–4 stand, with "the instrument" read as each figure's predicted number.

What it costs: the record's replay would have helped bisect model regressions; and §1.1's
"one recorded history serves the dynamics" narrows. World lines still serve electromagnetism,
causal gating, simultaneity, proper time and the picture, but gravity's force no longer reads
them (§3.2).

## 1. Principles

1. **One combined action per regime.** The couplings allowed together come from one action:
   pair potentials, pair Lagrangians and field terms, with the force, the field source and
   any mass modulation as its derivatives and the stats booking that same function. Order
   reduction in velocity-dependent terms (EIH, Breit, Bažański) uses the combined theory's
   leading acceleration, not each law's own, and mixed derivatives are kept (a
   Higgs-dependent mass enters gravity, Yukawa, inertia and spin, and each of those sources
   the field). Where a combination isn't derived, it is restricted in the UI or its omitted
   cross terms are named. Nothing conservative is written as a force alone.
2. **Declared regimes.** Each law states its approximation and the caption and `about.md` can
   name it: gravity and the Yukawa scalar are near-zone post-Newtonian (instantaneous, gated
   causally); electromagnetism is Liénard–Wiechert from the world lines, to all orders in v;
   the Higgs and axion fields are a slab's Klein–Gordon on a grid; a hole is
   Paczyński–Wiita (pseudo-Newtonian) until 3.x's metric regime.
3. **A closed ledger, certified independently.** E_total is the conservative energies plus
   metered columns, one per non-conservative exchange, each metered on the GPU at the
   operator that does the exchange (as `hubbleFriction` already is). A column is never
   defined as whatever makes the sum close: each is checked against an independently
   predicted number (a flux, a rate, a balance law), or closure is a tautology. Physical
   energies are kept apart from accounting reservoirs (edits, historical work); only the
   former are stress-energy (they feed the Friedmann density). The remaining drift mixes
   integration error with spatial, tree, history and truncation errors, which are separated
   by refining each independently (§4).
4. **One kernel per pair.** Every 1/r law (force, potential, lapse, Liénard–Wiechert's field,
   Darwin, the heatmap) uses the same pair kernel, sized by the two bodies (§3.1).
5. **Time slows before accuracy goes.** When the step budget runs out, simulated time per
   frame shrinks and the caption says so; the step never silently coarsens, and a state that
   can't be resolved is subdivided below the nominal tick or refused, never run coarse (§4).
6. **Causality as a gate.** No source acts before light from its creation reaches the
   observer, and a removed source acts from its death state until light from its removal has
   passed. Gating is an edit, metered, and outside conservation oracles (Codex, §7.1).

## 2. Audit: what the code does beyond §7.3

Six lanes (2026-10-27) read the physics end to end, one area each, without editing the repo;
the fields lane also measured in a headless `GPUPhysics`. Their check scripts (sympy
Euler–Lagrange for EIH, Bažański and Breit; the Liénard–Wiechert force against Darwin; a CPU
transcription of capture) are in that session's scratchpad. Findings were spot-checked where
they were surprising: the pools, boson gravity, the modulations' pass order and the radiation
reaction were each confirmed by reading the code again, and the pass order also live (an
axion field with `axMod` = 1.25 left the Coulomb kick unchanged to 0.5%). Each section's
**Now** has its detail; the headlines:

**Bugs that don't wait for 2.5.** Status, 2026-10-27: 2, 3 and 4 are disabled (the pair
modulations, the quadrupole sink and the bodies' pull from the bosons removed, since each fix
alone would have switched on a coupling with no consistent action); 5–11 are fixed, each with an
oracle in `tests/physics-validation.html`; so is 12, and 1's compaction (the pools pack each
frame), while 1's transactional saturation (a pool full of *live* bosons dropping a decay's or
annihilation's products) is still open. Bug 6's fix went past the sign: the
contact torques also take their lever from the mid-overlap contact point (r_i − δ/2), which makes
orbital plus spin angular momentum exact; bug 8's dead bodies emit their balance as a photon
(the collision pass is at its ten storage buffers, so it can't hand it to the survivor).

Codex confirmed each of 1–10 by reading the code. Its
caution governs the list: a wiring fix that switches on a defective coupling makes things
worse, so where the coupling behind a bug is itself wrong, the immediate fix *disables* it
until its model correction lands.

1. The boson pools only append: after 16384 photons (8192 pions and leptons) since the last
   reset every emission fails and decay, annihilation and Hawking-burst energy is destroyed
   (§3.12). Fix: compaction, and transactional saturation (a full pool of live packets
   defers an event or keeps a conserved reservoir; a decay never consumes its parent before
   its products are secured).
2. The Higgs and axion modulations never reach the pair or tree forces: pass 0 resets
   `axYukMod` before the force pass reads it, since 2026-03-14 (§3.2). **Don't reorder:** that
   switches on an axion pair coupling of the wrong sign with no source and no force from ∇a
   (§3.8), and a Higgs-modulated Yukawa range with no force from ∇μ (§3.4). Remove the pair
   modulations, from the stats too (they book a coupling no force applies), until §3.4 and
   §3.8 settle them.
3. The quadrupole sink advances `PHYSICS_DT` once a frame, about 34× too little at the default
   speed and frame-rate dependent, and books energy it doesn't take (§3.2). **Don't fix the dt
   alone:** that makes a sink with the wrong formula, a spurious lone-body drag and no momentum
   conservation 34× stronger. Disable it until the reaction of §3.2 and §3.5 replaces it.
4. Boson → body gravity is computed into a buffer that is cleared before it's read (§3.12).
5. Pion and lepton Coulomb kicks lack 1/m (§3.12).
6. Bounce mode's second-body spin torque has the wrong sign (§3.6).
7. The 1PN recompute skips retired sources the force pass includes (§3.2).
8. Pending radiation vanishes when its body merges or dies (§3.5); the surviving slot's
   balance stays, the consumed slot's goes.
9. Pion emission books its energy as pending before taking it from the body (§5).
10. A black hole's spin kinetic energy is booked on top of its mass, which already contains it,
    so superradiance reads as an 11% energy loss (measured by audit D, §3.6).
11. **Two spin angular momenta** (found by Codex): `cache-derived.wgsl:43–58` takes J = I·angVel
    for gravitomagnetism and the Kerr parameter, while the stats, merges and superradiance take
    J = I·angW; they differ relativistically, and subtracting dJ/I_old then changing I doesn't
    remove dJ. Fix: store one canonical J and derive a = J/M and the drawn rate from it.
12. **The stats' field energy misses the stiffest modes** (Codex; audit F had it as a small
    seam effect): `compute-stats.wgsl:545–580` takes centred gradients, which vanish on a
    checkerboard, while the evolution's 5-point Laplacian is stiffest there. Fix: the
    edge-difference quadratic energy whose derivative is that Laplacian, with the actual
    boundary conditions; oracle, single Fourier modes up to Nyquist.

**Model faults beyond §7.3:**

- Softening breaks time symmetry in electromagnetism as the toy factor does in gravity: σ³
  of the retarded distance gives an O(v) time-odd force within about 2ε (§3.5).
- Radiation reaction isn't Landau–Lifshitz and ignores the magnetic force entirely (§3.5).
- The step depends on the wall clock: the same run takes different steps at different frame
  rates, and the first frame of a run is one substep of the whole frame (§4, §3.6).
- Black holes: two capture rules, a plateau force of 16·m_i m_j inside a horizon, captures
  that turn the plateau's work into mass; that loop, not Schwinger, is the runaway (§3.6).
- The Higgs coupling's force, source and mass come from opposite actions; the ledger books
  mass + interaction = baseMass, hiding the field energy the coupling makes (measured: +22% of
  a lone body's energy in 2 time units); an undocumented thermal term and a viscosity act
  unbooked, the viscosity taking 23% of a merge's field energy in about 2 time units (§3.7).
- The axion's pair coupling runs opposite to its documented Lagrangian, with no source or
  force from pair energies (§3.8).
- Grid gravity sources the fields' metric with ρ where the ansatz's action gives ρ + 3p, so
  false vacuum attracts; the bodies feel the fields' Φ but not reciprocally (§3.9).
- Every open field boundary reflects; damping and viscosity single out the grid frame (§3.10).
- 1PN at retarded positions on top of retarded gravity counts retardation twice (§3.2).
- Angular momentum is meaningless on a torus as reported, and tidal and frame-drag torques
  have no orbital reaction (§3.3, §5).
- No charge ledger; external fields, walls and despawns move energy and charge unbooked (§5).

**Docs that are wrong** (fixed when the corresponding code is): `AGENTS.md`'s "sized by the
live counts", "every other law … times the toy aberration factor" (four laws carry it),
"Paczyński–Wiita … with `BH_SOFTENING`" (unsoftened), "capture with merge bookkeeping" (five
differences), the pending-radiation description for pions; `ROADMAP.md`'s old §7.3 said "the
stats' energies are … unsoftened" (they use the softened ρ).

**Checked and right:** the force-sign conventions; two-body EIH (with the Boris Bg term) and
its energy; the kinematic compensation for EIH under relativistic momentum; scalar Breit;
Majumdar–Papapetrou balance; Liénard–Wiechert's formula and its O(v⁴) agreement with Darwin
at ε = 0; the expansion split and its exact kinetic, photon and field work; the dipoles'
energies; the sum of the bodies' translational four-momenta through a capture (before any
potential accounting; an ordinary merge fixes the remnant's rest mass and routes the lost
kinetic energy to an event, which isn't by itself a conservation result).

## 3. The laws

### 3.1 The pair kernel [standard kernel; synthesis to size it by contact]

**Now:** Plummer, ε = `SOFTENING` (8) for every particle law, `BH_SOFTENING` (4) in
black-hole mode; Liénard–Wiechert scales by σ³, σ = R/√(R² + ε²). Force, potential and lapse
use the same ρ = √(r² + ε²), so they agree where they apply (audit A); the exceptions are
Paczyński–Wiita (raw r), Liénard–Wiechert (σ³ of the retarded distance) and the
effective-potential plot's Yukawa exponent (raw r). Black-hole mode switches ε for every law at
once while Paczyński–Wiita ignores it.

**Target:** a compact kernel that is exactly 1/r beyond its support: the cubic spline of
Monaghan and Lattanzio as GADGET uses it (Springel 2001), potential −u(r; h) with u = 1/r for
r ≥ h. The pair's support is the contact distance, `h_ij = R_i + R_j` with R = ∛(baseMass)
the drawn body radius (the horizon in black-hole mode), so the kernel acts only where the
bodies overlap and every law is exact between bodies that don't touch: the softening is the
size the glyph shows. R comes from `baseMass`, not the Higgs-modulated mass, so for ordinary
bodies h changes only at events (merges, accretion), each booked as an edit, and the glyph
draws that same radius. A hole's horizon changes continuously (Hawking loss, discharge,
superradiance), so in black-hole mode the kernel's time dependence is part of the model,
not an edit. Scalar laws (Newtonian gravity, Yukawa, Coulomb) take −u and its gradient.

**Tensor terms need their own kernels** (Codex). Replacing 1/r by a finite u(r) doesn't
regularize a velocity-dependent term: u(r)(v_a·n)(v_b·n) stays direction-dependent at r = 0
where u(0) ≠ 0, and its gradient can diverge as 1/r; e^{−μr}u(r) has a cusp at the origin.
So the EIH, Darwin, Breit and dipole terms take smooth radial *and* tensor kernels with
regular limits at the origin and the exact exterior fields, derived with their derivatives.
Liénard–Wiechert's softening is §3.5's.

**What the kernel is:** a regularization chosen for the code, not an extended-body
derivation, and contact isn't a weak-field criterion (r > R_a + R_b doesn't make M/r ≪ 1).
Each law's weak-field and slow-motion validity is stated separately.

**Cost:** bodies now get close; encounters need the step control of §4, and every preset is
retuned (its physics hash moves).

**Oracle:** a Kepler orbit outside contact keeps its period and energy to integration error;
force = −∇V by finite differences across the kernel edge; third law to rounding.

### 3.2 Gravity: near-zone post-Newtonian [standard]

**Now** (audit A; sympy Euler–Lagrange checks `eih_check.py`, `baz_check.py`,
`breit_check.py`, each exact to 10⁻¹³ unsoftened and unretarded):

- Every source under Relativity is its retarded state (position, velocity, mass, charge,
  spin, acceleration) seen from the observer's present; the toy factor
  min((1 − n̂·v)⁻³, 100) multiplies gravity (Paczyński–Wiita included), Yukawa and the two
  dipole forces, not the moving-mass Bg, the spin Bg, frame drag, tidal torque, the spin–orbit
  gradients or 1PN (`AGENTS.md` says every other law). The lapse uses present positions.
- **EIH is right, two-body.** `shared-1pn.wgsl:36–37` plus the Boris term 4m v × Bg reproduce
  the harmonic two-body EIH acceleration exactly; the stats' e0 + e2 + ⅜mv⁴ is its conserved
  energy. The force is the order-reduced Euler–Lagrange force, so it isn't reciprocal (static
  pair: F₁ + F₂ = m₁m₂(m₁ − m₂)/r³) and no 1PN momentum is booked. The three-body G² terms
  are missing (summed two-body forms).
- **The kinematic compensation exists** (`shared-1pn.wgsl:38–41`: + ½v²a_N + v(v·a_N), so the
  relativistic momentum update gives EIH's dw/dt). It uses the unaberrated a_N even when
  gravity is aberrated or Paczyński–Wiita, and EIH evaluated at retarded positions on top of
  retarded Newtonian gravity counts retardation twice: 1PN's accuracy is void while gravity is
  delayed. 1PN requires Relativity in the UI (`ui.js:26`), so the Relativity-off 1PN paths
  (and the 1PN tree walk) are unreachable.
- Bažański's cross term is 6m + 5M where its potential gives 2(m + M); the extra is
  order-reduction with Coulomb accelerations plus Darwin's Gq² piece, which Liénard–Wiechert
  supplies. Majumdar–Papapetrou balance is exactly zero. The full two-body coefficient is a
  symmetrization of the test-charge Reissner–Nordström limit, not independently sourced.
- **The 1PN velocity-Verlet recompute doesn't match the force pass:** the force pass includes
  retired sources in 1PN and `onePN.wgsl:114,169` skips them (effective weight ½), and the
  recompute has no Breit cutoff.
- The moving-mass Bg sector books no energy (it's in EIH's e2, booked only with 1PN on) and is
  non-reciprocal with no gravitational field momentum booked.
- **The Higgs and axion modulations never reach the pair or tree forces.** `cache-derived.wgsl:78`
  resets `axYukMod` to (1, 1, 1, 0) in pass 0; the force pass (5) reads it; the field pass that
  writes it runs after (5c). So the axion's EM scaling, the Higgs-modulated Yukawa range and
  the Peccei–Quinn Yukawa flip have acted on nothing but the 1PN recompute, the radiation's
  pion mass, the stats and the plot, since `46e6670` (2026-03-14). No oracle covers it.
  (Confirmed by reading the pass order.)
- **The quadrupole sink** (audits B, E, F; `quadrupole.wgsl`) runs once a frame with
  dE = P·`PHYSICS_DT` (`:353`) while a frame is about 34 ticks at the default speed (8–64
  across speeds), so gravitational and EM quadrupole losses are low by that factor and change
  with frame rate and speed. Its gravitational power omits the trace-free zz component; it
  uses absolute v and F, not centre-of-mass-relative, so a lone body in a uniform field or a
  cyclotron feels a spurious drag; it removes energy by rescaling each body's w (momentum and
  angular momentum not conserved, no recoil from its quanta); and it books each body's share
  before clipping it to the body's kinetic energy, so a clipped body creates energy.

**Target.** Collisional N-body practice: gravity is instantaneous in the near zone, with
post-Newtonian corrections, and radiation reaction is its own term. This gives up propagating
gravitational disturbances and any genuinely causal gravitational response; the gates of
§1.6 are editing conventions and restore neither (Codex). That is the declared regime.

- **Present positions, gated.** Gravity, the Yukawa scalar and the dipole laws act from the
  source's present state under Relativity too, gated by §1.6. The world-line search and the
  aberration factor leave every law but electromagnetism. Gravity no longer needs world lines,
  so Barnes–Hut can serve it with Relativity on; only electromagnetism stays pairwise there.
- **N-body EIH from one Lagrangian.** Landau and Lifshitz's Eq. 106.17 (Codex checked the
  unsoftened form against it), each 1/r written in the kernel of §3.1:

      L = Σ_a m_a v_a²/2 + Σ_a m_a v_a⁴/8 + Σ_{a<b} m_a m_b u_ab
          + Σ_{a<b} (m_a m_b u_ab / 2)[3(v_a² + v_b²) − 7 v_a·v_b − (v_a·n_ab)(v_b·n_ab)]
          − ½ Σ_a m_a Φ_a²,           Φ_a = Σ_{b≠a} m_b u_ab

  The last term is the whole G² sector, the two-body and the three-body terms together:
  Σ_{b≠a} Σ_{c≠a} m_b m_c/(r_ab r_ac) = Φ_a². [synthesis: an identity, but it is what makes
  the three-body terms cheap; Codex confirmed it and its derivative for fixed masses and a
  symmetric fixed kernel.] Its force is a pair force, ∂L/∂x_k = −m_k Σ_b m_b (Φ_k + Φ_b)
  ∇_k u_kb, equal and opposite, so the G² sector costs one extra pass for Φ. Its energy is
  **+½Σ_a m_a Φ_a²** (a velocity-free term enters the energy with the opposite sign). The
  velocity terms' equations of motion carry the other bodies' accelerations, replaced by the
  *combined* theory's leading accelerations (gravity, Coulomb and Yukawa together, §1.1), as
  the N-body EIH equations do with Newtonian ones (Newhall, Standish and Williams 1983, the JPL
  ephemerides; REBOUNDx's `gr_full` iterates instead). So: pass 1 sums Φ_a and the leading
  accelerations, pass 2 the EIH acceleration from them. The stats book this Lagrangian's energy
  function and canonical momentum, with the free kinetic part as the Σmγ already booked (not
  the expansion's m v⁴/8 on top of it). Inside the kernel this is a modified conservative
  model, not EIH; its tensor terms take §3.1's tensor kernels.
- **Kinematics without double counting.** EIH gives a coordinate acceleration that already
  holds special relativity's kinematics to 1PN; the integrator keeps proper velocity w. The
  code's compensation (+ ½v²a_N + v(v·a_N)) is the 1PN expansion of the exact identity
  dw/dt = γ[a + γ²(v·a)v]; keep it, with a_N the same leading acceleration the EIH pass uses.
- **The gravitomagnetic split stays.** EIH's v₁·v₂ sector through the Boris rotation 4m v × Bg
  is time-centred and agrees with EIH to the retained order (not exactly at arbitrary γ, Codex);
  the EIH residual is derived once with that sector removed, from the same states and leading
  accelerations. Bg comes from present positions like the rest, and the heatmap and key draw it.
- **The modulations:** the pair modulations are removed (§2, bug 2) until §3.4 and §3.8 give
  them an action; their regression oracle then follows that action.
- **2.5PN radiation reaction for identified binaries,** replacing the quadrupole sink. For a
  pair in harmonic gauge (Codex checked the coefficients against Blanchet's Living Review,
  Eqs. 219–220):

      a_RR = (8/5) ν (m²/r³) [ ṙ (3v² + (17/3) m/r) n − (v² + 3m/r) v ]

  on the relative coordinate, m = m_a + m_b, ν = m_a m_b/m², the force μ·a_RR on a and its
  negative on b; on a circular orbit its power is Peters' −(32/5)ν²(m/r)⁵. Two corrections from
  the review:
  - **It applies to identified, approximately isolated binaries, not to every pair.** Summed
    over all pairs it damps a rotating equilateral triple of equal masses, whose mass
    quadrupole is constant (three-fold symmetry makes it isotropic in the plane) and which
    radiates nothing at this order. A compact group radiates through its collective
    quadrupole; a scene of several such sources farther apart than a wavelength is a set of
    explicitly identified incoherent sources. How sources are identified (bound subsystems by
    a tree of binding energies, say) is open: Question 3.
  - **Work isn't flux.** Mechanical work differs from the outgoing flux by a Schott term:
    E_Schott = (8/5)ν²m³ṙv²/r² at leading order, with d(E_cons + E_Schott)/dt = −F_GW, and on
    a radial infall the reaction's work is positive while the flux isn't. So quanta are
    emitted from the non-negative flux (the quadrupole formula's), the signed near-field
    exchange (E_Schott) is its own column, and orbit-averaged balance is certified before the
    instantaneous one.
- **2PN last,** pairwise and two-body, only if an oracle shows the staged 1PN + 2.5PN model
  short (Codex's condition: without it the model is staged, not accurate through 2.5PN).

**Books:** the EIH energy (Σmγ, the Newtonian and 1PN potentials, +½Σm_aΦ_a²) and canonical
momentum Σ∂L/∂v_a, which is what 1PN conserves (Σm·w isn't: the order-reduced pair force isn't
reciprocal); the reaction's flux as gravitational radiation and its Schott term apart; gating's
jumps as edits.

**Oracles:** an equal-mass binary at v = 0.16 keeps its binding energy to integration error
over ten orbits (the regression for §7.3's 80%); perihelion advance 6πM/p with 1PN and πM/p
from special relativity alone (exists: "1PN perihelion advance"); the EIH energy on an
eccentric binary (exists) and on a hierarchical triple; a circular binary's inspiral, and an
eccentric one's da/dt and de/dt against Peters 1964, orbit-averaged; the eccentric and radial
binaries' instantaneous Schott balance; the rotating equilateral triple loses nothing at
leading order.

### 3.3 Spin [standard]

**Now:** spin-orbit is F = μ∇Bz and F = +2L∇Bgz from the moving sources' field gradients;
the gravitomagnetic dipole force is +3L₁L₂/r⁴; the spoke precesses by Thomas (non-gravitational
acceleration), geodetic −(3/2)(g × v) and Lense–Thirring −J/r³, without 1PN's companion term
(2 + 3m₂/2m₁)·L_N/r³. Spin–orbit has no potential: it moves energy between linear and spin
kinetic energy (dω = −F·v·dt/L, with a 10⁻⁴ floor on |L| that breaks even that), and its
reaction on the source is only the Boris term. Tidal torque and frame drag act on spin alone
with no orbital reaction, so total angular momentum isn't conserved; the frame-drag torques
of a pair sum to 2(ω_j − ω_i)(L_j − L_i)/ρ³, not zero (audit A).

**Target:** first, **one canonical spin J** per body (§2, bug 11), from which the Kerr
parameter a = J/M, the moments and the drawn rate all follow, and which every event updates.
Then two separate things (Codex):

- **Conservative spin transport:** the leading spin–orbit and spin–spin Hamiltonian (Barker
  and O'Connell 1975; Kidder 1995), restricted to the plane: spins along z, so every term is a
  scalar times the orbital angular momentum or the spins' product. The forces and the spoke's
  precession come from the same Hamiltonian, which supplies the companion term and makes the
  spoke and the orbit agree. For compact bodies spin–orbit is 1.5PN and spin–spin 2PN, above
  the 1PN the orbit carries, so this is a declared partial order (Worldline's bodies aren't
  compact; the counting says what the terms are, not that they're small).
- **Tidal dissipation, phenomenological:** no conservative Hamiltonian gives the present
  spin-synchronizing torque. It stays a labelled dissipative model with an equal and opposite
  orbital torque (total angular momentum conserved) and its dissipated energy metered.
  Frame drag as a torque goes: its conservative content is in the spin Hamiltonian.

Electromagnetic spin terms (the magnetic dipole and its spin–orbit) stay Darwin-order
magnetostatics (§3.5).

**Oracles:** the gravitomagnetic clock effect (exists); a spinning binary's orbital-plane
precession is absent (z-spins) while its periastron advance carries the spin–orbit
correction; the spoke's precession per orbit against the Hamiltonian's.

### 3.4 Yukawa [standard; one decision]

**Now** (audit A): Yukawa from the retarded state with the toy factor under Relativity,
exactly −∇ of the booked −g·m_i m_j e^{−μρ}/ρ at fixed μ; scalar Breit at 1PN, its Lagrangian
re-derived from the Klein–Gordon propagator and matched exactly. With the Higgs on the range
is μ·√(h_i h_j), with no force from ∇μ and no back-reaction on φ, but by the pass-order fault
in §3.2 the forces never see the modulation. The range is truncated four different ways
(the pair path on raw r < 6/(0.05μ) with the Higgs on, the tree per pair at μ_eff·r < 6, the
stats at softened μρ < 6, the 1PN recompute not at all), so the force jumps by about e⁻⁶ at
the cutoff and pair and tree disagree past it.

**Target:** the instantaneous potential V_ab = −g_Y m_a m_b e^{−μr}/r outside contact, with a
kernel inside that is smooth at the origin (e^{−μr}·u(r) has a cusp there, §3.1), gated like gravity, with scalar Breit at 1PN from its Lagrangian, and one
smooth range window shared by force, recompute, tree and stats in place of the four cutoffs.
**Decision:** the Higgs-modulated range is not a field theory (a pair potential
whose range is the geometric mean of the field at its two ends has no source and no force
from ∇φ). Either derive it (a force term −∂V/∂μ·∇μ and a source in φ) or drop it. I'd drop
it: the Higgs already gives the bodies their mass (§3.7), and the endpoint mean has no
physical reading to protect.

**Oracle:** two bodies' Yukawa energy conserved; the Yukawa well's escape-speed bound
(the nucleus preset's 3c bodies came from 1PN inside ε, gone with the kernel).

### 3.5 Electromagnetism [standard]

**Now** (audit B; `pair-force.wgsl:213–243`, `boris-fused.wgsl`, `radiation.wgsl:36–160`):

- The field is Liénard–Wiechert as `AGENTS.md` states, E as a kick and B = n̂ × E as the Boris
  rotation, both scaled by σ³ with σ from the *retarded* distance. At ε = 0 the applied force
  matches the Darwin force to O(v⁴) (5·10⁻⁷ of Coulomb at v = 0.05, 2·10⁻³ at 0.4). At ε = 8 it
  doesn't: σ³(R_ret) isn't even under v → −v, so within about 2ε the force has a time-odd part
  of 4%, 7.5% and 14% of Coulomb at v = 0.05, 0.1, 0.2 (pair at R = 8): an O(v) dissipative
  or anti-dissipative force, gravity's aberration fault in another law. The stats' Darwin
  energy and field momentum use the softened r, so they're O(v)-wrong where R ≲ ε.
  (Numerical check: `lw_vs_darwin.py`, the shader's formula against a uniform-motion
  retarded state.)
- The retarded state isn't one trajectory: positions cubic Hermite, velocity its
  derivative, acceleration linear between samples. A sample's acceleration is the summed
  force at the substep's *start* plus the Boris rotations, written at its *end*; it omits
  spin–orbit kicks, radiation reaction, the quadrupole drag, the 1PN correction, and every
  impulse (collisions, bounces, boundaries, absorption), so impulsive events radiate no pulse.
- **Radiation reaction isn't Landau–Lifshitz.** It is τ·jerk (static-form jerks of gravity,
  Coulomb, Yukawa and the dipoles) times 1/γ³, plus −τγ(F² − (v·F)²)v/m with F =
  `totalForce`. Against LL §76: term 1 should carry γ, not 1/γ³; term 2 (E × H + H × (H × v)
  + E(v·E)) is absent; term 3 should carry γ². `totalForce` excludes the v × B force, so **a
  charge in a pure magnetic field feels no reaction at all**: the cyclotron radiates only
  through its E. On a steady circular orbit under a central force the dissipated power is
  −τmv²Ω²(γ⁻² + γ³v²) against Larmor's −τmγ⁴v²Ω²: 0.98 of Larmor at 0.1c, 0.84 at 0.3c, 0.64
  at 0.5c, 0.36 at 0.9c (derived by hand, not yet run). Gravity's jerk drives a
  charge's reaction too. The booked energy is `max(0, KE_before − KE_after)`, so a step where
  the reaction raises KE creates energy, and its Schott part is mixed in. Photons carry no
  recoil; momentum balances only on average through the −v term.
- Pending radiation (`radAccum`) vanishes when its body dies, merges or is absorbed.
- The EM quadrupole sink (`quadrupole.wgsl:347–386`) uses Q = Σ q x x, neither trace-free nor
  with the factor 3; its dE is P·`PHYSICS_DT` once a frame whatever the frame's length; and it
  books dE before clipping it to the body's KE, so a clipped body creates energy.
- Without Relativity, Coulomb, Biot–Savart and the dipoles act from present positions, Coulomb
  and dipole energies are booked, and Biot–Savart alone isn't Newton-3 and books no momentum.
  The tree (Relativity off, past `TREE_ON`) aggregates a node as its net charge at the mass
  centre and its current as Q·P/M, wrong for a mixed-sign cluster's dipole and current.
- Magnetic dipoles act from the retarded state times the toy aberration; their booked energy
  is the present-time pair term. Spin–orbit F = μ∇Bz moves energy between linear and spin
  kinetic energy with no potential, and doesn't conserve angular momentum.

**Target.** Liénard–Wiechert from the world lines stays. With the Lorentz force through the
Boris push, special-relativistic kinematics and a consistent self-force, ideal mutual
retarded fields carry the system's radiation reaction beyond each charge's own, every
multipole included (Codex agrees). The fixes:

- **One trajectory, with events apart.** Interpolate the retarded state so position,
  velocity and acceleration come from one curve, and keep it timelike: arbitrary quintic
  Hermite data can overshoot to superluminal velocity and give several light-cone roots
  (Codex), so the interpolant is constrained (or its segment refined) to |v| < 1. A sample's
  acceleration is what the integrator did, centred with the positions, so spin–orbit,
  radiation reaction and the magnetic rotation are in β̇. Impulses (collisions, bounces,
  walls, absorption) aren't smooth: they split the world line into segments at an event,
  each with its own fit, and an instantaneous velocity jump has singular radiation, so an
  event gets either a resolved duration or an explicit event-radiation model.
- **Time-even softening, as an approximation.** ρ = −u·R = γκR is the distance in the
  source's rest frame for uniform motion (φ = q/(κR) = γ·q/r′; Codex confirmed), so S(ρ)
  times the field is the boosted rest-frame kernel field and stays even under v → −v. Under
  acceleration ρ refers to the instantaneous rest frame at the *retarded* event, and S(ρ)·F
  violates the homogeneous Maxwell equations (d(SF) = dS ∧ F ≠ 0). So this is a stated
  interior-contact prescription, with uniform motion as its oracle, not an extended-charge
  theory; outside contact S = 1 and nothing is approximated. The Darwin Lagrangian takes the
  kernels of §3.1.
- **The self-force: reduced-order Abraham–Lorentz–Dirac** [standard; Poisson, Pound and Vega,
  Eq. 1.5]. With signature (−+++), u² = −1, constant mass and K·u = 0,
  f^μ = τ₀(δ^μ_ν + u^μu_ν) dK^ν/dτ = τ₀[dK^μ/dτ − (K·K/m)u^μ], τ₀ = 2q²/3m, and the three-force
  on the momentum is f^i/γ. K is the external four-force *including* q v × B and gravity: the
  model is flat Maxwell with gravity as an external mechanical force, and flat
  Liénard–Wiechert fields see the accelerated trajectory whatever force caused it, so leaving
  gravity out of the self-force while its acceleration still radiates through the mutual
  fields would be inconsistent. (The draft's equivalence-principle argument was wrong: in
  curved spacetime a geodesic charge still has a self-force from curvature and tails,
  Pfenning and Poisson.) Reduction of order evaluates dK/dτ from the lower-order equations
  (the field's change along the unreacted path), not by differencing forces along the
  already reacted trajectory, which is a history-dependent approximation (Codex). Validity
  needs τ₀/T ≪ 1 for the motion's timescale T, which an electron of m 0.1, q −1 (τ₀ = 6.7)
  fails on a pass: such figures are outside the approximation and say so. A Higgs-varying
  mass needs its own derivation. The reaction's work is booked signed, with no clamp.
- **Packets are diagnostics first** (Codex). Coherent radiation has interference terms and
  generally no unique positive share per emitter, so per-body photons can't be the radiation
  itself without counting it twice: the mutual LW fields already exchange it, and an
  absorbed packet would deposit it again. First, photons are drawn representations of an
  explicitly defined flux and don't act. A field-to-packet conversion with an absorption
  model that doesn't double count is a decision of its own (Question 6).
- **Pending radiation outlives its body:** a body that dies, merged or not, emits it (done,
  §2 bug 8).
- **No EM quadrupole sink under signal delay:** with ideal mutual retarded fields it counts the
  system's quadrupole radiation twice (Codex agrees). Without signal delay (Relativity off,
  instantaneous Coulomb) a sink stays, fixed: Q_ij = Σq(3x_i x_j − r²δ_ij), P = (1/180)Σ(Q⃛_ij)²
  (LL Eq. 71.5, checked by Codex), Q_zz included, per substep, booked after its clip; even
  then it and per-body Larmor miss the coherent dipole interference, so that regime is
  labelled approximate.
- **The tree's charge aggregates** carry the dipole and current, or the tree stays out of
  electromagnetism (a mixed-sign node's monopole is often zero).
- **The residual exchange, metered and named as such.** For an autonomous Darwin Lagrangian
  dE_D/dt = Σ_i v_i·[d/dt(∂L_D/∂v_i) − ∂L_D/∂x_i], so the energy meter is
  −∫Σ_i v_i·(F_LW,i − F_D,i) dt with F_D the *acceleration-dependent* Darwin Euler–Lagrange
  force evaluated along the actual trajectory, not a separately order-reduced one (Codex). The
  momentum meter subtracts the Darwin field momentum already booked. Both are called residual
  exchange, with their approximation order stated, until an independent field-energy
  calculation matches them (§1.3).
- **Magnetic dipoles and spin–orbit:** Darwin-order magnetostatics from the present state,
  gated, from one Lagrangian (the dipole–dipole energy and the μ·B coupling to the moving
  charges' field), so their forces are gradients of booked energies and angular momentum,
  orbital plus spin, is conserved.
- **The κ floor** (sources above about 0.785c have suppressed forward fields) is a model
  alteration that refining the step can't remove: the domain claimed for Liénard–Wiechert
  excludes where it acts, and the caption says when it binds.

**Oracles:** "a uniformly moving charge acts from its present position" (exists), and the
same at R < ε: the force even under v → −v; constant-motion, accelerated and boosted cases
with the softening and the κ floor varied independently; a hyperbolically accelerated charge's
field against the analytic one; a cyclotron orbit in pure B radiates Larmor's power and
spirals in at its rate; synchrotron power at 0.1c–0.9c; two antiphase and in-phase
oscillating dipoles, and two like charges in a symmetric orbit (no dipole: quadrupole-order
loss, not twice Larmor), each measured by an independently computed coherent flux, not by the
residual ledger; Darwin energy plus the residual exchange constant (extends the existing
"Darwin energy" oracle).

### 3.6 Black holes [synthesis on standard pieces]

**Now** (audit C; `pair-force.wgsl:117–181`, `compute-stats.wgsl:400`, `collision.wgsl:213–272`;
a CPU transcription reproduces the measured 25.1):

- **The force isn't the booked potential's gradient, and isn't reciprocal.** Body i feels
  m_i m_j/gap_j², gap_j = max(r − r₊,j, 0.25) with the *source's* horizon, unsoftened; the stats
  book ½m_i m_j(1/gap_i + 1/gap_j). For masses 1 and 8 at r = 30 the 1 feels 0.041, the 8 feels
  0.010, the booked gradient is 0.026: the pair gains momentum toward the heavier hole. Under
  Relativity the source's horizon, mass and charge are retarded and the toy factor applies.
  `BH_SOFTENING` touches the other laws, the lapse and the step rule, never Paczyński–Wiita
  (`AGENTS.md` says otherwise). The tree treats a node as one hole of the summed mass.
- **The plateau.** Inside a horizon the gap pins at 0.25: the booked potential is flat, the
  force is a constant 16·m_i m_j toward the centre at any depth.
- **Two capture rules.** Overlapping horizons merge by the ordinary rule (rest masses summed,
  lost kinetic energy to the fields); only a centre inside another's horizon is captured, by
  the invariant mass of the pair's four-momentum, at the capturer's position (the centre of
  energy jumps), orbital angular momentum turned into spin with no cap (often over-extremal,
  so the horizon clamps to M and halves), without `FLAG_WL_BREAK` or a `MergeResult`. Both
  delete the pair's potential and shift the third bodies' (unbooked), and both use γ even with
  Relativity off, when the stats use ½mv².
- **Why 1 and 8 at rest 10 apart become 25.1.** The 1 starts inside the 8's horizon (16), on
  the plateau: a = 128. The first frame has `_maxAccel` = 0, so one substep of the whole frame
  (0.276): w = 35.3, and capture by invariant mass gives M² = 65 + 16γ = 630. The stats go
  from −7.5 to +43.3: 34.3 from the plateau's work, 16.5 from the deleted pair potential. The
  result depends on the frame's dt (17.9 at dt = 0.125).
- **The runaway is the plateau and the capture together.** An engulfed body falls at 16·M_c,
  capture turns its kinetic energy into mass (M_new = M_c√(1 + 8.8 m_v) at dt = 0.276,
  independent of M_c), the bigger horizon engulfs more. 200 uncharged holes at rest in f64
  emulation pass 10⁹⁷; two equal holes of 100 make 88,288. Schwinger (rate ≤ 10⁻³ per unit
  proper time) is not the driver.
- **Charge emission.** Schwinger already launches its lepton at total energy e·Φ_H
  (kinetic max(e·Φ_H − m_e, 0)) but the hole pays only m_e; extremal shedding launches at
  1/√3 and pays m_e, and leptons past the `MIN_MASS` floor are free. Hawking's isotropic
  emission creates about e²/2M of recoil energy per photon, and the final burst's
  charge-shedding leptons take no recoil and unpaid kinetic energy.
- **Superradiance** drops both the hole's mass by dE and its spin by dJ = dE/μ, and the stats
  count mass and spin energy separately, so the bodies lose about dE + Ω·dJ for the field's
  dE; a moving hole loses dE·w of momentum to nothing.
- **Bounce mode's spin torque on the second body has the wrong sign** (`collision.wgsl:644`,
  `angW -= r2·Ft·dt/I2`): ΔL_total = +3·10⁻⁴ per 0.01 of impulse against −1.6·10⁻⁵ with it
  flipped; Hertz contact energy and friction are unbooked.

**Target:**

- **First, the Hamiltonian.** Paczyński–Wiita's 4M marginally bound and 6M marginally stable
  radii hold with Newtonian kinetic energy (Relativity off). Worldline under Relativity uses
  relativistic momentum, and for H = √(m² + p_r² + L²/r²) − Mm/(r − 2M) the marginally bound
  circular orbit is at (3 + √3)M = 4.732M and the ISCO at 7.212M (Codex derived these; checked
  here numerically). So the complete kinetic-plus-potential model comes first, and its capture
  and orbit oracles are derived from it, not imported from Schwarzschild.
- **One pair function, sized by contact.** V_ab = −m_a m_b/(r − c_ab) with c_ab = r₊,a + r₊,b,
  the horizons' contact distance (the kernel's h_ij in black-hole mode, §3.1). It is symmetric,
  reduces to Paczyński–Wiita for a test body, and diverges where the horizons touch. The force
  is −∇V_ab, equal and opposite, from the present state (gated), and the stats, the heatmap and
  the effective-potential plot all use V_ab. No plateau: captures are resolved before the force
  pass, so no body is ever evaluated inside a horizon.
- **One capture rule, on a surface where V is finite.** For each inward-moving pair, capture
  where it passes the peak of its own effective-potential barrier (the unstable circular orbit
  for its angular momentum, in the chosen Hamiltonian): past the peak an inward pair can't turn
  back, and V there is finite, so no pair ever feels the divergence at contact. Bound pairs
  reach it inside the marginally bound radius; a pair with too little angular momentum for a
  barrier has no turning point inside the ISCO and is captured there. [synthesis; Question 7]
  Every black-hole merge
  takes this one rule, and the event is located within the step (the step control resolves the
  approach). The Schwarzschild fact behind it holds for geodesics (an inward timelike geodesic
  with E/m ≤ 1 can't turn around below 4M, Codex); for the SR–PW Hamiltonian and for charged,
  spinning or comparable-mass pairs it is derived again, regime by regime.
- **Energy closes at capture, once.** E_before = E_remnant + E_emitted, every interaction
  that changes included (the pair's V at the capture surface and the third bodies' potentials
  with each parent, which become potentials with the remnant). The remnant takes what isn't
  emitted, at the centre of energy, with `FLAG_WL_BREAK`. A merger burst, if modelled, is an
  explicit E_emitted taken from the remnant, not added: the draft's "remnant at the pair's
  energy, and the deficit as quanta" counted the binding twice (Codex). Orbital plus spin
  angular momentum goes to the remnant's canonical J up to the Kerr–Newman bound; the excess
  leaves with the burst.
- **Bodies engulfed at switch-on or spawn** merge before the first force with rest masses
  summed and no potential: an edit, metered.
- **Charge emission pays its whole energy, and the area theorem bounds it** [standard: the first
  law; Wald's review]. With dM = (κ/8π)dA + Ω_H dJ + Φ_H dQ, Φ_H = Q·r₊/(r₊² + a²), an emission of
  energy E at infinity, charge e and angular momentum j keeps the area from shrinking iff
  E ≤ Φ_H e + Ω_H j: the reversible limit is the *most* a hole can give (the draft had the
  inequality reversed). Charge-to-mass falls iff E < e·M/Q. For a sub-extremal hole
  Φ_H < M/Q, since 2M²r₊ − Q²(r₊ + M) = r₊²(r₊ − M) + a²(r₊ + M) > 0 (the draft's "⟺ r₊ > M"
  was wrong: spinning extremal holes satisfy it too), so any area-respecting emission with
  j = 0 lowers Q/M. The first law doesn't choose a spectrum; the model does, and has to keep
  four energies apart: the lepton's energy at infinity, its launch energy, the recoil, and
  the pair's electrostatic energy. For a finite quantum the reversible bound isn't e·Φ_H: at
  fixed Reissner–Nordström horizon radius the reversible mass decrease is e·Φ_H − e²/(2r₊).
  So each emission is tested on the actual post-emission (M, J, Q) with recoil, and a lepton
  whose rest mass exceeds what the hole may give isn't emitted: a threshold, as Schwinger's
  has. An over-extremal hole has no area to respect, only E < e·M/Q; it sheds near the
  lepton's rest mass, stops when it can't pay, and the clamp stays the backstop with its
  charge change booked. (Why paying the kinetic energy once made the discharge run away,
  as `AGENTS.md` records, this argument doesn't identify: launch versus asymptotic energy,
  finite quanta, recoil and changing J all enter. The plateau-and-capture loop is the mass
  runaway, independently.)
- **Hawking** recoils exactly (M₁² = M₀² − 2M₀e for an isotropic rest-frame photon), and the
  final burst's leptons recoil and are paid.
- **Superradiance** keeps its α² rate (visibility), labelled. A hole's mass M is its whole
  energy, rotation included (Kerr), so the stats stop adding a separate spin kinetic energy for
  holes (bug 10). The deposit itself is a positive scalar pulse that carries no angular
  momentum, so the J the hole loses goes nowhere; real superradiance pumps an m = 1 rotating
  mode with dJ/dE = 1/ω (Codex). Either the deposit excites such a mode, carrying both, or
  superradiance is labelled as an energy-only phenomenology with the angular momentum booked as
  a column. Overlapping holes' independently normalized impulses add quadratic cross energy;
  the deposit is normalized jointly.
- **Bounce** takes the sign fix now, Hertz energy ⅖δ^{5/2} booked and friction metered.

**Oracles:** force = −∇V and the third law for unequal holes; the SR–PW circular-orbit
sequence (4.732M, 7.212M) under Relativity and 4M, 6M without, derived from the Hamiltonian in
use; a test body released at rest outside the capture surface falls in and the ledger closes,
at every frame rate; the 1 and 8 at rest 10 apart give 9 (an edit) with the ledger closed;
200 small charged holes don't run away; finite charged-hole extraction: recoil, area,
extremality and charge each checked per event, Q/M falling monotonically; overlapping
superradiant deposits checked for energy and angular momentum; a bounce conserves total
angular momentum.

### 3.7 The Higgs field [standard: the Standard Model's Yukawa structure]

**Now** (audit D, with live measurements in a headless `GPUPhysics`):

- V = −½εμ²φ² + ¼μ²φ⁴, μ² = m_H²/2, and the evolution is the covariant Klein–Gordon equation for
  the metric ansatz (correct), plus damping 2m_H·φ̇, a viscosity ν∇²φ̇ and a thermal term.
- The mass follows `baseMass·max(|φ|, floor)`, rate-limited by `HIGGS_MASS_MAX_DELTA` (8 a unit
  time) at fixed momentum, after the force pass (forces use the old mass, the kick the new);
  spin isn't rescaled, so spin angular momentum changes unbooked. The force is
  +g·baseMass·sign(φ)·∇φ (no 1/γ) and the source +g·baseMass/γ, never odd in φ
  (`field-forces.wgsl:121–184`, `field-deposit.wgsl:97–116`). The mass alone,
  L = −baseMass·|φ|·dτ, would give F = −baseMass·∇|φ|/γ and J = −baseMass·sgn(φ)/γ; the code's F
  and J have the opposite signs and don't come from one action between them either (the force
  carries sign(φ) and lacks 1/γ, the source lacks the sign; Codex). Measured: on a ramp of |φ| from 0.6 to 1.4 a body of 0.1 is pushed toward
  larger |φ| (+0.00125 a frame) and grows heavier as it goes; a body of 2 dresses itself to
  φ = 1.51 and mass 2.99.
- **The ledger hides it.** The field–particle interaction is booked as −baseMass(|φ| − 1), so
  mass + interaction = baseMass exactly: the body is booked as if it didn't couple. Measured
  (one body, torus, no damping): the booked total goes 1.000 → 1.224 by t = 2 as 0.229 of field
  energy appears with nothing debited.
- **A thermal term the docs don't mention:** every substep each body's kinetic energy is
  deposited per cell (raw, not per area, so resolution-dependent) and enters as
  μ²_eff = εμ² − thermal (`gpu-fields.js:538–541`, `field-evolve.wgsl:91`). It isn't in any
  potential, gives bodies no back-force and is booked nowhere; a body with kinetic energy
  about 1 would melt the vacuum under it at m_H = 0.5 (suspected by arithmetic).
- **Viscosity is real dissipation:** ν∇²φ̇ with ν = 0.5/√(1/dx² + 1/dy²) (`field-evolve.wgsl:116–117,
  187–188`); measured, a merge's field energy fell 23% in about 1.8 time units with damping
  off. The comment that it vanishes for physical modes is wrong.
- Z₂ is broken by the reset, the NaN guard and the drift fix-up (all +1), the exterior cells of
  an open edge (+1), the positive source, and merge pulses (all positive). The Kibble–Zurek
  preset is a torus without bodies, so it is unbiased.

**Target:** one action,

    S = ∫[½φ̇² − ½(∇φ)² − V(φ)] dA dt − Σ_a ∫ m_a(φ(x_a)) dτ_a,   m_a(φ) = baseMass_a·√(φ² + f²)

- the force is d(m w)/dt = −m′(φ)∇φ/γ, with ṁ = m′(∂_tφ + v·∇φ);
- the source is −m′(φ)/γ per cell area, odd in φ, so Z₂ holds;
- the mass follows φ exactly, in the force pass's own substep, with no rate limit and no
  separate coupling g; spin angular momentum is conserved through it (ω rescaled);
- the energy is Σ m_a γ_a plus the field's, with no separate interaction term;
- **the discrete force is the derivative of the discrete energy** (Codex): the body's mass is
  m(Σ_g S_g(x)φ_g), so its force needs Σ_g (∇S_g)φ_g, the gradient of the PQS weights. The code
  interpolates a precomputed central-difference grid gradient (`field-forces.wgsl:55–88`), a
  different operator even in the interior; that is what has to change for the action to
  conserve energy on the grid.

Bodies are drawn to small |φ|, so to the walls, where they are light, and dense matter
pushes φ toward zero around itself: walls gather matter and matter pins walls, a new
Kibble–Zurek observable: walls pin to bodies (a smooth Z₂ wall can't end on a point body, since
φ stays defined through it). [synthesis] The action also does part of what the thermal term
was for: at fixed momenta a gas of bodies adds V_matter(φ) = n·⟨√(p² + m(φ)²)⟩ to the field's
effective potential (Codex's correction of the draft's n·⟨m/γ⟩; its derivative is the m′/γ
source). Since m·m′ = baseMass²·φ, near φ = 0 it is V_matter ≈ const + ½·n·baseMass²·⟨1/E⟩·φ²,
a positive mass term, so dense matter restores the symmetry. That is density-driven, and a
hotter classical gas couples less, unlike quantum thermal restoration, a different mechanism
this model doesn't claim. The unbalanced thermal term goes. [synthesis] With gravity on, the
vacuum energy's offset is stated once (§3.9). Viscosity goes, or, if the deposit's noise
needs it, it is metered. Without the energy pump the rate limit was damping, the "resonant
throb" shouldn't return. [speculation, testable] The reset, the guards and the open boundary
stop choosing +1 (§3.10).

**Oracles:** a body crossing a static wall conserves its energy plus the field's; the
mirror run (φ → −φ) is the bitwise negation; a self-dressed body's mass is the action's
stationary point; the force equals a finite difference of the discrete energy at arbitrary
subcell positions; a quench with matter: walls pin to bodies.

### 3.8 The axion field

**Now** (audit D): two channels.

- **Single body:** force g(q² + s·m)∇a, source g·q² (+ g·s·m/γ for the Peccei–Quinn part),
  booked interaction −g·q²·a − g·s·m·a. These three agree as U = −J·a, and the sign matches a
  self-energy of −¼(1 + ga)F², which falls as a grows. The EM source lacks the 1/γ the PQ
  source has, and the force has none.
- **Pairs:** `axModPair = √(axMod_i·axMod_j)` multiplies Coulomb, the Liénard–Wiechert E, the
  dipoles and Bz (not gravity), with no source from the pair energy and no force from ∇a. It
  multiplies by (1 + ga), where `config.js:121`'s L = −(1 + ga)F²/4 gives e²_eff = e²/(1 + ga):
  the opposite sign. By the pass-order fault (§3.2) the forces never apply it; the stats do
  (measured: the booked Coulomb energy 10% larger at a = 2), so the ledger books work no force
  did.
- `yukMod` (Peccei–Quinn) multiplies the Yukawa pair and scalar Breit, unrelated to the
  single-body PQ term, which is linear in a.
- The field is clamped to ±2 without zeroing ȧ (`field-evolve.wgsl:247`).

**The name.** In the symmetry plane the electric field lies in the plane and the magnetic
field along z, so E·B = 0 on the reflection plane and the axion's aF F̃ coupling vanishes
there. (Only there: in a slab of finite thickness an odd transverse pseudoscalar mode can
couple to off-plane E·B, so the plane rules out this reduction of the axion, not every one;
Codex.) What Worldline
calls the axion couples to F², the electromagnetic Lagrangian: a varying-α modulus in
Bekenstein's sense (Bekenstein 1982), which for point charges couples to their self-energy
and their interaction energies. [standard] Its misalignment and superradiance hold for any
light scalar. Whether to rename it is a9's call; the model should say which it is.

**Target.** Bekenstein's theory, L_EM = −Z(a)F²/4, has Maxwell's equation ∂_μ[Z(a)F^{μν}] = j^ν
(Bekenstein, Eqs. 14–16): Z's variation changes propagation through the whole intervening
field, so it is *not* a factor q·√f(a) at each charge, at emission and absorption (the draft's
proposal; Codex). Two honest options:

- **A quasistatic variable-coefficient field.** Solve ∇·(Z(a)∇φ_E) = −ρ_q on the grid for the
  electrostatic part, with the force on charges and the source for a from that one energy,
  ½∫Z(a)|E|²: a substantial project, beside Liénard–Wiechert rather than inside it.
- **A labelled phenomenological endpoint model.** Keep a pair energy with endpoint factors,
  derive its force on the charges (including −∂U/∂a·∇a) and its source in a from that one
  energy, and call it what it is, without claiming Bekenstein. Generic pair energies don't
  acquire a universal 1/γ.

Until one is chosen, the pair modulation stays removed (§2, bug 2) and the single-body
channel (force, source, booked interaction, consistent with each other as U = −J·a) stays. The
Peccei–Quinn term is dropped or derived the same way; I'd drop it (two unrelated terms, no
reading to protect). The clamp zeroes ȧ, and is metered.

The
Peccei–Quinn term is either a vertex factor on the Yukawa coupling, derived the same way, or
dropped; I'd drop it (two unrelated terms, no reading to protect). The clamp zeroes ȧ, and is
metered.

**Oracles:** a charge crossing an axion gradient conserves its energy plus the field's; the
field's source matches the energy's derivative by finite differences; for whichever pair
model is chosen, its force against a finite difference of its energy (two charges in a
uniform a₀ feeling Z(a₀)⁻¹ of Coulomb is necessary and far from sufficient, Codex).

### 3.9 Grid gravity

**Now** (audit D): Φ_F is sourced by the fields' energy density ρ = ½φ̇² + ½(∇φ)² + V, Φ_P by
the bodies' mass, each convolved with −1/√(r² + ℓ²) by circular FFT for every boundary (an open
domain sees image masses). The fields feel Φ_F + Φ_P; the bodies feel −m∇Φ_F, Newtonian, no γ
or e^Φ, dispatched once (the header says once per field). The particle's own Φ_P sources only
the field, and the particle's lapse ignores Φ_F. For the metric ansatz the field's Lagrangian
density is ½e^{−4Φ}φ̇² − ½|∇φ|² − e^{−2Φ}V, so ∂L/∂Φ at Φ = 0 is −2φ̇² + 2V = −(ρ + Σp): the
active source is ρ + Σp = 2φ̇² − 2V, Tolman's active mass [standard], not ρ, with all three
pressures counted (Codex corrected the draft's sign). Here a false vacuum (V > 0) attracts
where the action has it repel. A moving point body sources mγ(1 + v²) in the same ansatz, not m. Field–particle and field–field
gravitational energy is booked nowhere. The deposit's fixed point caps at ±2048 a cell
(suspected reachable for a heavy hole).

**Target:** one gravitational coupling from the complete projected action, varied *before*
projecting onto the slab: Φ from every source (ρ + Σp for the fields, mγ(1 + v²) for the bodies),
both feeling the same Φ (minus each body's own term), so the forces are reciprocal; the energy
is the Hamiltonian of that action with the momentum π = e^{−4Φ}φ̇, not today's flat energy plus
½∫ρ_active Φ (Codex). Projecting φ = ψχ(z) brings transverse-gradient energy and confinement
stresses; the transverse gradient cancels from T₀₀ + ΣT_ii, so treating it afterwards as an
ordinary effective potential gives the wrong active source, and particle–slab and slab–slab
couplings take different transverse-profile integrals. The slab kernel F(kℓ) changes the
spatial response, not the active stress. A single scalar Φ is itself an approximation when the
stresses are anisotropic. This is a substantial project of its own (§7). Meanwhile: a
zero-padded convolution on open domains (Hockney and Eastwood) and circular only on the torus;
Φ_F in the bodies' lapse; a deposit format that can't overflow.

### 3.10 Field boundaries and damping [standard]

**Now** (audit D): every open boundary reflects. Bounce is Neumann, despawn Dirichlet to the
vacuum (+1 for the Higgs, 0 for the axion) through ghost cells, and `pqsGradient` drops
out-of-grid cells while the grid gradients use the ghosts, so the two disagree near an edge.
Damping (Higgs e^Φ·2m_H·φ̇, axion e^Φ·g·m_a·ȧ) and viscosity act on the grid frame's φ̇, an
ether; the Langevin bath has no e^Φ, so no fluctuation–dissipation balance under gravity.
Only the Hubble friction is metered.

**Target:** the bulk evolves without damping or viscosity; an open domain absorbs at its edge
through a sponge layer, its absorbed energy metered into an "escaped field" column; a torus is
Hamiltonian. Self-bound lumps (oscillons in φ⁴, Gleiser 1994) then survive. The reset is
φ = 0 plus noise symmetric in sign, the guards don't choose a sign, and the edge condition is
the absorbing layer, not +1. The quench's mass ramp and the Langevin bath stay, each metered
(∫∂V/∂t dA, the bath's work), the bath with e^Φ so it balances its damping.

### 3.11 Cosmology

**Now** (audit F; `gpu-physics.js:2229–2279, 2644–2761`, `expansion.wgsl`, `gpu-backend.js:15–16,
107–108`): the Strang split is as `AGENTS.md` says (two √r half-stretches around substeps at
the midpoint a), with chunks min(16, ⌈H·dt/0.02⌉) from H sampled once at the frame's start:
enough for the imposed schedules (H·dt ≤ 0.25 at the slider's top), not for the Friedmann
closure, whose H is unbounded; the cap of 16 is undocumented. `expansionWork` is exact for
kinetic energy, photons, pions and the fields; the potentials' share is first order
(−ln r times the last completed readback's Σd·∂V/∂d, every 8th frame plus latency, kept across
spawns). Every §7.3 cosmology item holds as written; more precisely, the Friedmann sources
put kinetic energy in the matter term though it redshifts faster, dilute a false-vacuum
field as a⁻³, and omit the potential, Darwin and field–particle interaction energies. The
mean-density cancellation relies on the minimum image, so images past the nearest are
absent. Post-substep passes run with the domain at the midpoint a while positions are
already stretched (≤ H·dt/2, about 1%; suspected). The headers of `expansion.wgsl` and
`cosmology.js` still say once a frame and momentum by 1/r.

**Target:** the stretch per substep instead of per frame, with H re-evaluated each chunk and
no cap that can bind silently; pending radiation redshifted in `expansion.wgsl`; the bath's
temperature rescaled; each law's share of the stretch metered around the stretch operator
exactly (the energy before and after, as the fields' already is) instead of the first-order
Σ d·∂V/∂d that lags a readback; the Friedmann density from the physical energies only, each by
its own equation of state (kinetic energy radiation-like at high γ, a field's potential energy
vacuum-like). Accounting columns (edits, historical work, residual exchange) aren't
stress-energy, and gravitational binding energy has no universal equation of state (Codex), so
the closure's matter content is stated as an approximation.

### 3.12 Bosons and pools

**Now** (audit E):

- **The pools only append.** Every emitter `atomicAdd`s `phCount` or `piCount` and only an
  overflow rolls it back; only `reset()` zeroes them (`gpu-physics.js:3368–3373`), and the
  culls clear flags without freeing slots. The counts are high-water marks that size every
  boson dispatch, and after 16384 photons (8192 pions and leptons) emitted since the last
  reset every emission fails: Larmor and quadrupole energy waits as pending, while pion-decay
  products, annihilation and merge photons and the Hawking final burst are destroyed.
  `AGENTS.md`'s "sized by the live counts" is wrong. (Confirmed by reading every write.)
- **Boson → body gravity is dead:** `computeBosonGravity` adds to `allForces.f0` only
  (`boson-tree.wgsl:130–133`), which the next substep clears before anything reads it.
- **Pion and lepton Coulomb has no 1/m** (`bosons.wgsl:116–118`, `bosons-tree-walk.wgsl`,
  `boson-tree.wgsl:235`): the kick goes straight into w, 6.7× low for pions and 100× for
  leptons, static and without recoil on the body. Photon and pion lensing gives the bodies
  no recoil either.
- Boson–boson gravity and pion–pion Coulomb kick once a frame with the frame's dt (up to
  0.5) while lensing steps per substep.
- Culls are by age: photons past 256, leptons past 512 (their energy field reused as an age),
  charged pions never; a culled lepton's charge is booked nowhere.
- Absorption tests the point against the disk now, with no swept test (c·dt_sub is 0.27–0.5
  against 0.74 for the smallest body: tunnelling suspected); it conserves four-momentum and
  charge but not angular momentum (spin unchanged as the moment of inertia grows); the
  minimum age is a time for photons and a count of updates for pions.
- Emission recoil is exact for Hawking, Schwinger and extremal shedding; none for Larmor
  (§3.5); pion emission rescales w only if the emitter's kinetic energy covers it, else it
  creates the energy.
- Kugelblitz runs once a frame (its header says substep); its bosons die on the GPU and its
  body is spawned 1–3 frames later from the readback, lost if `addParticle` fails, and its
  parsed radiated totals are never used.

**Target:**

- Live-count pools: a stream compaction (prefix sum, the trees' machinery) once a frame
  after the culls, so counts are live and slots are reused, and transactional saturation for
  a pool full of live packets (§2, bug 1). A fix that doesn't wait for 2.5.
- Bosons gravitate the bodies, through `totalForce`, equal and opposite to the lensing they
  feel; pion and lepton Coulomb divides by mass and recoils on the body; boson–boson terms
  kick per substep.
- Culled by escape (outside the domain plus a margin, moving away), not by age, every culled
  quantity booked (energy, momentum, charge); on a periodic domain bosons wrap, their emission
  points kept on the covering plane so their lines still draw back to it.
- A swept absorption test; absorption adds the boson's angular momentum about the body to its
  spin; one minimum age, in time.
- Kugelblitz spawns its body on the GPU in the same pass that consumes the bosons.

## 4. The integrator and resolution

**Now** (audit E; `main.js:586–605`, `gpu-backend.js:127–130`, `gpu-physics.js:2631–2637`):

- **The step depends on the wall clock.** A frame's simulated time is `ticks·PHYSICS_DT`
  from the frame's wall-clock time × speed (about 0.27 at the default speed and 60 Hz, 0.07–0.5
  across speeds), split into n = min(⌈dt/dtSafe⌉, 32) equal substeps. The same run takes
  different steps at different frame rates.
- dtSafe = √(ε/a_max) with coefficient 1 and no other limit (no gyroperiod, encounter time
  or field CFL). a_max is |`totalForce`|/m of the *last* substep of a frame 1–3 frames old,
  before the external, scalar-field and field-gravity forces are added, without the Boris
  rotation or spin–orbit, and `reset()` doesn't clear it. When the cap binds, accuracy goes:
  simulated time never slows for physics.
- The scheme is staggered leapfrog: forces at x_n with `derived.vel` = v_{n−1/2}, kicks to
  v_{n+1/2}, drift. The magnetic force is time-centred by the rotation; every other
  velocity-dependent force sees v_{n−1/2}, repaired for 1PN by the trapezoid but not for
  spin–orbit, which reads `derived.vel` from before the kick. Spawned bodies start with v at
  the position's time (an O(dt) start-up error).
- `vvKick1PN` leaves `derived.vel` stale, but only the Relativity-off stats' kinetic energy
  and the drawing read it before the next `cacheDerived`. The clocks *must* run before the 1PN
  correction today: Thomas precession subtracts `allForces.f2` (the 1PN force) from
  `totalForce`, and `compute1PN` overwrites f2 with the new force.
- The lapse is √(1 + 2Φ − v²) under Relativity, Φ Plummer-softened at post-drift positions,
  Newtonian in black-hole mode too, without Φ_F, external g or bosons; geodetic precession
  uses the force's retarded, aberrated field (Paczyński–Wiita among holes).

**Target:**

- **A state-driven step schedule** [synthesis]: the substep is a function of the state
  alone, chosen by the physics criteria below, and a frame only decides how many substeps to
  run in its wall time, so a figure behaves the same at any frame rate. **Bitwise
  reproducibility isn't pursued** (a9, 2026-10-27: it was for replay, which was set aside), so
  the emission RNG keyed by `u.frameCount`, atomic claims in collisions and emission
  (`collision.wgsl:180–188`) and merge identities stay as they are. What still changes is
  feedback that makes the *dynamics* depend on the frame rate: the step's a_max read back from an
  older frame and the Friedmann density from a delayed readback move onto the GPU or to step
  boundaries, because they bias results, not for bit-equality (Codex listed both).
- **Step control** [standard criteria; synthesis to combine them]: dt = η·min over the
  encounter time of every pair within a few contact lengths (min of r/|v_rel| and
  √(r³/(m_a + m_b)), reduced in the pair loop the force pass already runs), |v|/|a| from every
  acceleration (electric included), the gyroperiod γm/(|q|B) and the gravitomagnetic rotation,
  the time scale of a scalar-driven mass change, the fields' oscillation stiffness (spatial CFL
  alone doesn't bound a massive, nonlinear Klein–Gordon oscillator: the potential's curvature
  enters), and the radiation reaction's τ₀, all from the current substep and none from an
  asynchronous readback. The substep may go below the nominal tick, subdivided; a state that still can't be resolved is refused rather than run coarse. When the
  budget can't cover a frame, the frame runs less simulated time and the caption says time is
  slowed and by how much. Block steps or regularization only for a measured close-binary
  bottleneck (§7.1).
- Thomas precession reads a stored non-gravitational force, so the clocks can run after the
  1PN correction; `vvKick1PN` refreshes `derived.vel`; spin–orbit reads the kicked velocity.

## 5. The ledger

**Now** (audit F; `stats-display.js:75–106`):

- E = rest + linear kinetic + spin kinetic + potential (with the field–particle interaction) +
  Darwin + the fields' slab energies + radiated (photons, pions and leptons with rest mass,
  pending accumulators, escaped), and the drift adds `expansionWork`, scaled by
  max(|E₀|, |E|, |W|). The baseline resets on spawn, preset, clear and load.
- Momentum drift compares magnitudes only, |P|·a against |P₀|·a, scaled by an ad hoc
  max(|P₀|, |P|a, √(2M·KE)); bodies, Darwin, the scalar field, bosons and escaped momentum
  are in it, nothing else.
- Angular momentum is orbital plus spin only, about a naive centre of mass on raw positions,
  so **on a torus every wrap jumps it by about domain·p**: meaningless there.
- **Pion emission over-books:** `radiation.wgsl:382` adds to `yukawaRadAccum`, which the ledger
  counts as pending, while the body keeps its kinetic energy; the energy is taken only at
  emission, and only if the body's kinetic energy covers it.
- Unbooked, beyond those in §3: the uniform external g and E do work with no column; field
  damping, numerical clamps and NaN resets in `field-evolve.wgsl`; the Langevin bath (outside
  the friction bracket); the quench's ∂V/∂t and its thermal deposit; Hertz contact and
  friction; wall impulses and despawns (mass, energy, momentum, angular momentum and charge
  leave with no column); boson–boson gravity and pion Coulomb (no potential, photons pulled 2×
  and bodies 1×); photon lensing (no recoil, no redshift). There is no charge ledger at all.
- Three discrete gradient energies (stats with clamped edges and centred differences, the
  ledger wrapping, the evolution's 5-point Laplacian) disagree, and not only at the seams: a
  checkerboard mode has zero centred gradient and the Laplacian's largest stiffness (§2, bug
  12; Codex).
- Relativity off, the stats book ½mv² while capture, merge, absorption and Larmor use (γ−1)m.

**Target:** E_total = conservative energies + Σ metered columns, each column certified by an
independently predicted number (§1.3); the residual drift is then refined apart into
integration, spatial (grid), tree, history (world-line cadence) and truncation error (§4).

- Conservative: rest and kinetic (Σ m γ), the EIH energy (§3.2), Darwin, Yukawa and Breit,
  the dipole and spin energies, Paczyński–Wiita, the fields' energies and their
  interactions (the Higgs's inside Σ m γ), grid gravity's interaction and self-energy.
- Metered: radiated (photons, pending, escaped); gravitational radiation (radiation
  reaction's work and capture deficits); the electromagnetic field in transit (§3.5) and its
  momentum; tidal dissipation (the tidal torque's work); edits (spawn, delete, engulfing at
  switch-on, gating's fronts); the field absorbed at the edge; the bath's work; the quench's
  work; external fields' work; contact (Hertz energy conservative, friction metered); escapes
  through walls and despawns; expansion (exists).
- A charge ledger beside energy and momentum: every emission, absorption, cull, clamp and
  escape moves whole quanta between columns.
- Momentum drift compares vectors (a·P − a·P₀, by component). Angular momentum is reported on
  open and walled domains only: a torus has no rotational symmetry (minimum-image forces
  aren't central about any point), so there it isn't conserved and isn't shown.
- One kinetic energy per mode: every pass computes it as the stats do.

Oracle: every preset, with every column on, holds |drift| under its integration tolerance,
and each metered column matches its independent prediction (the quadrupole flux, Larmor,
the bath's fluctuation–dissipation balance, the expansion's exact work).

## 6. Oracles

New ones by section, in `tests/physics-validation.html`, each with its analytic number: §3.1 the
kernels (scalar and tensor) against finite differences; §3.2 binary binding at v = 0.16, the
hierarchical triple's EIH energy, Peters' da/dt and de/dt, the instantaneous Schott balance,
the rotating equilateral triple's zero loss; §3.3 spin–orbit periastron and the spoke's
precession; §3.5 the softened field's time symmetry, the hyperbolic charge, the cyclotron's
Larmor spiral, synchrotron power, coherent two-source radiation measured independently of the
ledger; §3.6 the SR–PW orbit sequence, capture through the barrier, the 1-and-8 edit, the
charged-hole swarm, finite charged extraction per event, overlapping superradiance; §3.7 the
wall crossing, the mirror run, the subcell force against the discrete energy; §3.12 a full
pool of live packets with multi-product decays; §4 simultaneous multi-contact collisions, a
figure's numbers statistically the same at 30, 60 and 120 frames a second, and independent
refinement of the step, the
grid spacing, the tree's opening angle and the world-line cadence; §2 single Fourier modes up
to Nyquist; §5 the closed ledger per preset with each column against its prediction.

## 7. Order of work

Revised after the review (Codex's order, with the §2 caution folded in):

0. **Contained bugs, without switching on defective couplings** (§2): the pools with
   transactional saturation; pending balances carried through merges and deaths; boson
   gravity; pion Coulomb's 1/m; the bounce torque's sign; the 1PN recompute's sources; the
   pion over-booking; the holes' double-booked spin; one canonical J; the discrete field
   energy. The quadrupole sink and the pair modulations are *disabled*, not repaired.
1. **The step schedule with sufficient resolution** (§4): the state-driven schedule, sub-tick
   subdivision, the complete stiffness bound, time slowing when the budget runs out, and the
   readback feedback that makes the dynamics frame-rate dependent moved to the GPU. Bitwise
   reproducibility isn't pursued (a9, 2026-10-27).
   - **Then the history's reader** (§3.5's one timelike curve for a sample's position, velocity
     and acceleration, impulses as segment breaks), as its own change ahead of step 3: sight (2.6)
     reads the history through it too, so the model lane owns `worldline.wgsl` and
     `shared-worldline.wgsl` and lands this early (roadmap §5, §6.1).
2. **Ratify the regimes and their combined actions** (§1.1) before writing their code: the
   SR–PW Hamiltonian and its capture surface, the electromagnetic regularization and the
   packets' meaning, which combinations of laws are allowed together.
3. **Conservative gravity, kernels and the Higgs, with their energies and momenta in the same
   change:** present positions with gating, N-body EIH in two passes, the scalar and tensor
   kernels, the Higgs action with its discrete-gradient force, Paczyński–Wiita as one
   symmetric pair function with captures before forces; the presets retuned.
4. **Radiation and exchange columns, each certified independently:** the binary reaction with
   its flux and Schott column, the electromagnetic self-force by reduction of order, charge
   emission by the area bound, the residual exchange, the remaining ledger columns.
5. **Separate projects:** varying-α electromagnetism with retardation (§3.8) and
   self-consistent slab gravity (§3.9); 2PN only if an oracle asks for it.

Files overlap: step 3 touches `pair-force`, `forces-tree`, `shared-1pn`, `onePN` and
`compute-stats`, so it is one lane; the fields (`field-*`), charge emission (`radiation`,
`extremal`) and cosmology (`expansion`, `cosmology.js`) are separate lanes.

## 8. Questions, with the review's answers

Codex's answers to the first draft's sixteen questions (2026-10-27), and what each leaves open.

1. **Near-zone PN with gating, against a gravitational Liénard–Wiechert.** Agreed, with the
   gates as explicitly nonphysical edits. The draft's argument against the alternative (a
   pairwise linearized field leaves a +(2/3)m_i²x⃛_i dipole reaction) was wrong as a GR claim:
   2/3 is electromagnetism's coefficient, linearized gravitational self-force has an
   Abraham-type −11/3, and the cancellation runs through the supporting dynamics (Pfenning and
   Poisson). The defensible objection: accelerated point dust fails linearized stress
   conservation, and the nonlinear and binding contributions are missing. *Settled.*
2. **The −½Σm_aΦ_a² identity and two passes.** Right for fixed masses and a symmetric fixed
   kernel; its energy is +½Σm_aΦ_a²; inside support it is a modified model with tensor terms to
   regularize; order reduction uses the combined dynamics. *Settled, folded in.*
3. **2.5PN pairwise or collective.** Coefficients right (Blanchet 219–220); every-pair
   application wrong (the equilateral triple). *Open:* how sources are identified, isolated
   binaries and compact groups, in a scene larger than a wavelength.
4. **The kinematic identity.** Right; the code's compensation is its 1PN expansion; the Boris
   split agrees to the retained order. *Settled.*
5. **The contact kernel on baseMass.** A defensible numerical convention for ordinary bodies,
   with the glyph drawn at the same radius; holes' horizons change and need their own
   treatment. *Settled for bodies; holes open.*
6. **The field meter and packets.** The energy meter needs the acceleration-dependent Darwin
   force on the actual trajectory, the momentum meter must subtract the booked Darwin
   momentum; per-body positive radiative attribution generally doesn't exist. Ideal mutual LW
   plus a consistent self-force does make an electric-quadrupole sink redundant. *Open:*
   whether packets ever act (a field-to-packet conversion and absorption without double
   counting), or stay diagnostic.
7. **Capture at r_mb.** Disagreed: the Schwarzschild statement holds for geodesics, not for the
   SR–PW Hamiltonian (whose radii are 4.732M and 7.212M) or for charged, spinning or
   comparable-mass pairs. *Open:* the barrier-peak capture surface of §3.6 is the replacement
   proposal, to be derived per regime.
8. **The emission rule.** The area inequality was reversed (E ≤ Φ_H e + Ω_H j) and the
   equivalence was wrong; finite quanta need the post-emission state. The historical Schwinger
   runaway isn't identified by this argument. *Settled as rewritten; the old runaway open.*
9. **The Higgs action.** Attraction to small |φ| and density suppression agreed; matter
   behaviour changes, so presets need retuning; test pinning, not wall endpoints, with
   inertia and the other mass-dependent laws included. *Settled, folded in.*
10. **The self-force.** Right only with the sign for (−+++) and genuine reduction of order;
    stability unverified; leaving gravity out is inconsistent with flat Liénard–Wiechert;
    variable mass needs a new derivation. *Folded in; the variable-mass form open.*
11. **ρ = γκR.** Right for uniform motion; under acceleration a stated approximation, not
    Maxwell-consistent. *Settled as an approximation.*
12. **Deterministic stepping.** Right direction, insufficient alone (RNG, events, atomics,
    feedback). *Folded into §4.*
13. **The thermal term.** Remove it; the action doesn't reproduce quantum thermal
    restoration, and needn't. *Settled.*
14. **Tolman for a slab.** All three pressures, and confinement stresses kept before
    reduction; the kernel doesn't change the active stress. *Folded into §3.9; a project.*
15. **The axion's vertex factors.** Wrong: Bekenstein's field equation has a variable
    coefficient everywhere. *Open:* quasistatic solve or a labelled endpoint model (§3.8).
16. **The ordering.** The model before public replay links, and contained bugs early, but
    without switching on the quadrupole sink at 34× or the inconsistent axion coupling.
    *Folded into §2 and §7.*

**Decisions for a9** (none blocks step 0):

- the axion's name, given that its coupling here is to F², not to E·B (§3.8);
- the axion's pair coupling: a quasistatic variable-coefficient solve, a labelled endpoint
  model, or none (§3.8);
- the Peccei–Quinn term and the Higgs-modulated Yukawa range: derive or drop (I'd drop both,
  §3.4, §3.8);
- whether photons stay diagnostic or come to act, with a conversion model (§3.5);
- whether Paczyński–Wiita holes keep relativistic kinetics (radii 4.732M, 7.212M) or the
  textbook pair is wanted (Newtonian kinetics near holes), §3.6.

## 9. After the sandbox (3.x)

Cosmic strings and Gott's pair, the Schwarzschild and Kerr metric regime for test bodies and
light, the embedding diagram, gravitational waves at a ring of test masses,
fields carrying energy through a closed surface; the covariance meter is this pass's oracle
(roadmap §5). Roadmap §8 holds their detail.

## 10. Review log

**Codex (astra, extra-high effort, read-only), 2026-10-27, on `fb4d1ab`:** "Do not ratify this
draft yet. The main §2 bug reports are real, but several target equations and conservation
claims are wrong." It confirmed bugs 1–10 by reading the code and found two more (11, 12); it
checked the EIH Lagrangian (LL 106.17), the 2.5PN coefficients (Blanchet 219–220), the EM
quadrupole power (LL 71.5), ρ = γκR for uniform motion and E·B = 0 on the plane; and it found
these wrong, each corrected above:

- the area theorem's inequality, reversed, and an equivalence that should be an implication
  (§3.6);
- Paczyński–Wiita's 4M and 6M under relativistic kinetics, where they are 4.732M and 7.212M
  (§3.6; checked here numerically);
- the remnant booked at the pair's energy *and* a binding deficit emitted (§3.6);
- the self-force's sign for the signature in use, differencing along the reacted path called
  reduction of order, and the equivalence-principle argument for leaving gravity out (§3.5);
- reaction work emitted as flux, ignoring the Schott term; every-pair 2.5PN, refuted by the
  rotating equilateral triple (§3.2);
- Bekenstein as endpoint factors (§3.8); scalar softening for tensor terms (§3.1); the G²
  energy's sign (§3.2); the Tolman derivative's sign and the point body's source (§3.9);
- the discrete force for the Higgs action, and the field energy's checkerboard blind spot
  (§3.7, §2);
- the matter effective potential and "walls end on bodies" (§3.7);
- the gravitational-LW 2/3 argument (§8.1);
- "one action per coupling" without the combined theory's order reduction and mixed
  derivatives (§1.1);
- replay guaranteed by the step schedule alone, and the step criteria's gaps (§4);
- pool compaction as the whole fix (§2, §3.12); quintic Hermite through impulses (§3.5);
- a ledger closed by definition, and accounting columns as Friedmann stress-energy (§1.3,
  §3.11);
- and, most consequentially, that two of the "contained" bug fixes would switch on defective
  couplings (§2, bugs 2 and 3).

Where this file says "Codex" without more, the point came from this review. The thread is
`worldline-model-review` (gaslamp), job `cx-20261027-085629-c762`.
