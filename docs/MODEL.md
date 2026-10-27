# Worldline's physics model

The corrected model for 2.5, specified against an audit of the code at `6de3df8`. Status:
**draft for Codex's adversarial review (2026-10-27).** Once ratified it is the plan of record
for the model, and `ROADMAP.md` §7 points here; until then §7.3 there is the list of known
boundaries and this file is a proposal.

Tags as in the roadmap: [standard] is textbook or established practice, [synthesis] is a
combination made here, [speculation] is a guess to test. **Now** is what the code does (with
`file:line`), **Target** what it should do, **Books** where its energy goes, **Oracle** the
number that certifies it. Equations quoted from memory are marked *verify* and are checked
against their source before code.

## 0. Ordering

Proposed (a9's suggestion, 2026-10-27, refined here): the model pass comes before the record.
The version names swap: **2.5 is the model** (this file), **3.0 is the laboratory** (the
record, sight and the instrument, roadmap §4–6). Of the old 3.0 (§7), the corrections move
into 2.5; the new laboratories (the Schwarzschild and Kerr metric regime, the embedding
diagram, the gravitational-wave detector ring, fields carrying energy) and the covariance
meter (§7.2) stay after the record, since they want its instrument.

Why the model first:

1. **Replay is the dynamics.** The record keeps runs reproducible by link and replay. Changing
   the dynamics after links ship either breaks them or makes the record version the physics,
   a second schema held for old runs. Model first, and the record archives dynamics it keeps.
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

What it costs: the record's replay would have helped bisect model regressions; and §1.1's
"one recorded history serves the dynamics" narrows. World lines still serve electromagnetism,
causal gating, simultaneity, proper time and the picture, but gravity's force no longer reads
them (§3.2).

## 1. Principles

1. **One action per coupling.** Every conservative interaction is a pair potential, a pair
   Lagrangian or a field Lagrangian term. The force, the field source and any mass
   modulation are its derivatives, and the stats book that same function. Nothing
   conservative is written as a force alone.
2. **Declared regimes.** Each law states its approximation and the caption and `about.md` can
   name it: gravity and the Yukawa scalar are near-zone post-Newtonian (instantaneous, gated
   causally); electromagnetism is Liénard–Wiechert from the world lines, to all orders in v;
   the Higgs and axion fields are a slab's Klein–Gordon on a grid; a hole is
   Paczyński–Wiita (pseudo-Newtonian) until 3.x's metric regime.
3. **A closed ledger.** E_total is the conservative energies plus metered columns, one per
   non-conservative exchange, each metered on the GPU at the operator that does the
   exchange (as `hubbleFriction` already is). Drift then measures integration error alone.
4. **One kernel per pair.** Every 1/r law (force, potential, lapse, Liénard–Wiechert's field,
   Darwin, the heatmap) uses the same pair kernel, sized by the two bodies (§3.1).
5. **Time slows before accuracy goes.** When the step budget runs out, simulated time per
   frame shrinks and the caption says so; the step never silently coarsens (§4).
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

**Bugs that don't wait for 2.5** (each a contained fix with an oracle):

1. The boson pools only append: after 16384 photons (8192 pions and leptons) since the last
   reset every emission fails and decay, annihilation and Hawking-burst energy is destroyed
   (§3.12).
2. The Higgs and axion modulations never reach the pair or tree forces: pass 0 resets
   `axYukMod` before the force pass reads it, since 2026-03-14 (§3.2).
3. The quadrupole sink advances `PHYSICS_DT` once a frame, about 34× too little at the default
   speed and frame-rate dependent, and books energy it doesn't take (§3.2).
4. Boson → body gravity is computed into a buffer that is cleared before it's read (§3.12).
5. Pion and lepton Coulomb kicks lack 1/m (§3.12).
6. Bounce mode's second-body spin torque has the wrong sign (§3.6).
7. The 1PN recompute skips retired sources the force pass includes (§3.2).
8. Pending radiation vanishes when its body merges or dies (§3.5).
9. Pion emission books its energy as pending before taking it from the body (§5).
10. A black hole's spin kinetic energy is booked on top of its mass, which already contains it,
    so superradiance reads as an 11% energy loss (measured, §3.6).

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
differences), the pending-radiation description for pions; `ROADMAP.md` §7.3's "the stats'
energies are … unsoftened" (they use the softened ρ).

**Checked and right:** the force-sign conventions; two-body EIH (with the Boris Bg term) and
its energy; the kinematic compensation for EIH under relativistic momentum; scalar Breit;
Majumdar–Papapetrou balance; Liénard–Wiechert's formula and its O(v⁴) agreement with Darwin
at ε = 0; the expansion split and its exact kinetic, photon and field work; the dipoles'
energies; merge and capture four-momentum.

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
size the glyph shows. R comes from `baseMass`, not the Higgs-modulated mass, so h changes
only at events (merges, accretion), each booked as an edit. Every 1/r in every law becomes u:
the force is −∇ of the same function, the lapse uses it, Liénard–Wiechert's velocity field
scales by S(R) = R²·|u′(R)| (1 outside contact), and the Darwin and EIH Lagrangians are
written in u (§3.2, §3.5) so their energies stay conserved.

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
post-Newtonian corrections, and radiation reaction is its own term.

- **Present positions, gated.** Gravity, the Yukawa scalar and the dipole laws act from the
  source's present state under Relativity too, gated by §1.6. The world-line search and the
  aberration factor leave every law but electromagnetism. Gravity no longer needs world lines,
  so Barnes–Hut can serve it with Relativity on; only electromagnetism stays pairwise there.
- **N-body EIH from one Lagrangian.** Landau and Lifshitz's §106 form (*verify*), with each
  1/r written as u(r; h_ij):

      L = Σ_a m_a v_a²/2 + Σ_a m_a v_a⁴/8 + Σ_{a<b} m_a m_b u_ab
          + Σ_{a<b} (m_a m_b u_ab / 2)[3(v_a² + v_b²) − 7 v_a·v_b − (v_a·n_ab)(v_b·n_ab)]
          − ½ Σ_a m_a Φ_a²,           Φ_a = Σ_{b≠a} m_b u_ab

  The last term is the whole G² sector, the two-body and the three-body terms together:
  Σ_{b≠a} Σ_{c≠a} m_b m_c/(r_ab r_ac) = Φ_a². [synthesis: an identity, but it is what makes
  the three-body terms cheap.] Its force is a pair force, F_k = −m_k Σ_b m_b (Φ_k + Φ_b)
  ∇_k u_kb, equal and opposite, so the G² sector costs one extra pass for Φ. The velocity
  terms' equations of motion carry the other bodies' accelerations, replaced by their
  Newtonian values as the N-body EIH equations do (Newhall, Standish and Williams 1983, the
  JPL ephemerides; REBOUNDx's `gr_full` iterates instead). So: pass 1 sums Φ_a and a_a^N,
  pass 2 sums the EIH acceleration from them. The stats book this Lagrangian's energy
  function, which closes §7.3's "pairwise EIH misses three-body terms".
- **Kinematics without double counting.** EIH gives a coordinate acceleration that already
  holds special relativity's kinematics to 1PN; the integrator keeps proper velocity w. The
  code's compensation (+ ½v²a_N + v(v·a_N)) is the 1PN expansion of the exact identity
  dw/dt = γ[a + γ²(v·a)v]; keep it, with a_N the same Newtonian acceleration the EIH pass uses
  (present positions, the kernel), so Codex's condition in §7.1 holds by construction.
- **The gravitomagnetic split stays.** EIH's v₁·v₂ sector through the Boris rotation 4m v × Bg
  is exact and time-centred; Bg comes from present positions like the rest, and the heatmap
  and key draw it.
- **The modulations reach the forces:** `axYukMod` is written before the force pass that reads
  it (or not reset in pass 0), with an oracle (axion on, two charges, the force scales by
  (1 + g·a₀)²). A fix that doesn't wait for 2.5.
- **2.5PN radiation reaction, pairwise,** replacing the quadrupole sink (`quadrupole.wgsl`).
  For a pair in harmonic gauge (*verify*, Blanchet's Living Review):

      a_RR = (8/5) ν (m²/r³) [ ṙ (3v² + (17/3) m/r) n − (v² + 3m/r) v ]

  on the relative coordinate, m = m_a + m_b, ν = m_a m_b/m², the force μ·a_RR on a and its
  negative on b. On a circular orbit (ṙ = 0, v² = m/r) its power is −(32/5) ν² (m/r)⁵, Peters'
  flux, which checks the v-coefficient. Its work is metered into the gravitational-radiation
  column and the gravitational quanta are emitted from that meter, so quanta and ledger are
  one quantity. Pairwise is local; a system quadrupole (Burke–Thorne, Schäfer's N-body
  Hamiltonian) is exact for an isolated system but mixes binaries farther apart than a
  wavelength, which Worldline's scenes are. Question 3 (§8).
- **2PN last,** pairwise and two-body, only if an oracle shows the staged 1PN + 2.5PN model
  short (Codex's condition: without it the model is staged, not accurate through 2.5PN).

**Books:** the EIH energy (kinetic, rest, Newtonian and 1PN potential, the −½Σm_aΦ_a² term) and
the EIH canonical momentum Σ∂L/∂v_a, which is what 1PN conserves (Σm·w isn't: the
order-reduced pair force isn't reciprocal); radiation reaction's work and impulse as
gravitational radiation; gating's jumps as edits.

**Oracles:** an equal-mass binary at v = 0.16 keeps its binding energy to integration error
over ten orbits (the regression for §7.3's 80%); perihelion advance 6πM/p with 1PN and πM/p
from special relativity alone (exists: "1PN perihelion advance"); the EIH energy on an
eccentric binary (exists) and on a hierarchical triple; a circular binary's inspiral and an
eccentric one's da/dt and de/dt against Peters 1964, orbit-averaged and leading order.

### 3.3 Spin [standard]

**Now:** spin-orbit is F = μ∇Bz and F = +2L∇Bgz from the moving sources' field gradients;
the gravitomagnetic dipole force is +3L₁L₂/r⁴; the spoke precesses by Thomas (non-gravitational
acceleration), geodetic −(3/2)(g × v) and Lense–Thirring −J/r³, without 1PN's companion term
(2 + 3m₂/2m₁)·L_N/r³. Spin–orbit has no potential: it moves energy between linear and spin
kinetic energy (dω = −F·v·dt/L, with a 10⁻⁴ floor on |L| that breaks even that), and its
reaction on the source is only the Boris term. Tidal torque and frame drag act on spin alone
with no orbital reaction, so total angular momentum isn't conserved; the frame-drag torques
of a pair sum to 2(ω_j − ω_i)(L_j − L_i)/ρ³, not zero (audit A).

**Target:** the 1PN spin–orbit and spin–spin Hamiltonian (Barker and O'Connell 1975; Kidder
1995), restricted to the plane: spins along z, so every spin term is a scalar times the
orbital angular momentum or the spins' product. The forces and the spoke's precession
come from the same Hamiltonian, which supplies the companion term and makes the spoke and
the orbit agree. Electromagnetic spin terms (the magnetic dipole and its spin–orbit) stay
Darwin-order magnetostatics (§3.5). Tidal torque and frame drag take an equal and opposite
orbital torque on the pair, so total angular momentum is conserved, and the tidal torque's
dissipation is metered.

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

**Target:** the instantaneous potential V_ab = −g_Y m_a m_b e^{−μr}·u(r; h_ij), exact Yukawa
outside contact, gated like gravity, with scalar Breit at 1PN from its Lagrangian, and one
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
Boris push, special-relativistic kinematics and a correct self-force, it is complete classical
electromagnetism for point charges, every multipole's radiation included: the mutual
retarded fields carry the system's radiation reaction beyond each charge's own. The fixes:

- **One trajectory.** Interpolate the retarded state by quintic Hermite from each sample's
  position, velocity and acceleration at both ends, so position, velocity and acceleration
  come from one polynomial. A sample's acceleration is what the integrator did, the
  substep's Δw/Δt converted to dv/dt and centred with the positions, so spin–orbit kicks,
  radiation reaction, the magnetic rotation and impulses are all in β̇.
- **Time-even softening.** Soften by the invariant ρ = −u·R = γκR, which for uniform motion
  is the distance in the source's rest frame (φ = q/(κR) = γ·q/r′), so the softened field is
  the boosted rest-frame kernel field and stays even under v → −v. With the contact kernel
  S(ρ) = 1 outside contact, and the Darwin Lagrangian is written in the same kernel so the
  stats' Darwin energy is the conserved quantity of the softened O(v²) dynamics.
- **The self-force: reduced-order Abraham–Lorentz–Dirac** (Landau–Lifshitz when the external
  force is the Lorentz force) [standard]: F_rad^μ = τ[dK^μ/dτ + (K·K/m)u^μ] (sign by the metric,
  *verify*), with K the non-gravitational four-force *including* q v × B, and dK/dτ the finite
  difference of K along the trajectory between substeps (the field's change along the path,
  LL's (∂_t + v·∇)E, without per-law jerks). Gravity is left out, the equivalence-principle
  choice: a free-falling charge has no local self-force (its tail is DeWitt–Brehme's, out of
  scope). Its work is booked signed, no clamp; photons are emitted from the positive balance,
  and the body takes as recoil the difference between the four-momentum the reaction removed
  and what the photon carries, so each emission closes.
- **Pending radiation outlives its body:** a merge carries it to the survivor, a death or
  absorption emits it.
- **No EM quadrupole sink under signal delay** [synthesis]: with the mutual fields retarded,
  the sink counts the system's quadrupole radiation twice. Without signal delay (Relativity
  off, instantaneous Coulomb) the quadrupole sink stays, fixed: Q_ij = Σq(3x_i x_j − r²δ_ij),
  P = (1/180)Σ(Q⃛_ij)² (LL §71, *verify*), per substep, booked after its clip.
- **The tree's charge aggregates** carry the dipole and current, or the tree stays out of
  electromagnetism (a mixed-sign node's monopole is often zero).
- **The field in transit, metered.** Beyond O(v²) the pair exchanges energy with the field:
  the mutual radiation (the interference term −(4/3)q₁q₂a₁·a₂ of two dipoles' power, §7.3)
  and energy in flight. Meter −∫Σ(F_LW − F_Darwin)·v dt into an "electromagnetic field"
  column, and −∫Σ F_LW dt into a field-momentum column, so energy and momentum close.
  The meter needs the Darwin force beside the Liénard–Wiechert one in the same pair loop.
  Question 6 (§8).
- **Magnetic dipoles and spin–orbit:** Darwin-order magnetostatics from the present state,
  gated, from one Lagrangian (the dipole–dipole energy and the μ·B coupling to the moving
  charges' field), so their forces are gradients of booked energies and angular momentum,
  orbital plus spin, is conserved.
- **The κ floor** (sources above about 0.785c have suppressed forward fields) stays as a
  stated boundary; it binds only at speeds the step control should resolve.

**Oracles:** "a uniformly moving charge acts from its present position" (exists); the same
at R < ε: the force even under v → −v; a hyperbolically accelerated charge's field against the
analytic one; a cyclotron orbit in pure B radiates Larmor's power and spirals in at its rate;
synchrotron power at 0.1c–0.9c; two antiphase and in-phase oscillating dipoles: the field
column's average equals (4/3)q₁q₂⟨a₁·a₂⟩; two like charges in a symmetric orbit (no dipole)
lose energy at quadrupole order (photons and field column together), not twice Larmor;
Darwin energy plus the field column constant
(extends the existing "Darwin energy" oracle).

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

- **One pair function, sized by contact.** V_ab = −m_a m_b/(r − c_ab) with c_ab = r₊,a + r₊,b,
  the horizons' contact distance (the kernel's h_ij in black-hole mode, §3.1). It is symmetric,
  reduces to Paczyński–Wiita for a test body, and diverges where the horizons touch, which is
  where collision detection already looks. The force is −∇V_ab, equal and opposite, from the
  present state (gated), and the stats, the heatmap and the effective-potential plot all use
  V_ab. No plateau: captures are resolved before the force pass, so no body is ever evaluated
  inside a horizon.
- **One capture rule.** Paczyński–Wiita reproduces Schwarzschild's marginally bound radius 4M
  and marginally stable radius 6M by construction (Paczyński and Wiita 1980), and in
  Schwarzschild every orbit with E ≤ m that reaches inside 4M plunges. So a pair that is bound
  or marginally bound (relative energy with V_ab ≤ 0) is captured when it crosses
  r_mb,ab = 2·c_ab (4M for a test body), where |V| is bounded (m/2 for a test body); an unbound
  pair is captured on contact. Every black-hole merge takes this one rule.
- **The remnant is lighter than its parts.** Its mass is the pair's energy in its centre of
  momentum frame including V_ab at capture, at the centre of energy, with `FLAG_WL_BREAK`;
  the deficit leaves as gravitational quanta (booked), as a merger's remnant is lighter than
  its parents. Codex's objection to booking the pair potential (an engulfed body got −7.5)
  came from the plateau, which capture at r_mb never reaches. Orbital plus spin angular
  momentum goes to the remnant up to the Kerr–Newman bound; the excess leaves with the quanta.
- **Bodies engulfed at switch-on or spawn** merge before the first force with rest masses
  summed and no potential: an edit, metered.
- **Charge emission pays its whole energy** (rest, kinetic, and its potential in the hole's
  fields at launch) from the hole, with exact recoil. The first law picks the energy
  [synthesis: the area theorem used as the emission rule]: charge-to-mass falls with an
  emission of charge e and energy E iff E < e·M/Q, and the area theorem asks E ≥ e·Φ_H,
  Φ_H = Q·r₊/(r₊² + a²). Below extremality E = e·Φ_H satisfies both, since by the Kerr–Newman
  identity r₊² + a² = 2Mr₊ − Q² the condition Φ_H < M/Q is Q²(r₊ + M) < 2M²r₊, true for r₊ > M.
  So Schwinger keeps its launch energy and the hole pays it, which can't raise Q/M. An
  over-extremal hole has no area theorem to respect, only E < e·M/Q: shedding emits near the
  lepton's rest mass, stops when the hole can't pay, and the clamp stays the backstop with its
  charge change booked. (`AGENTS.md` records that paying the lepton's kinetic energy made the
  discharge run away; by this argument paying e·Φ_H can't, so what was paid then is Question 8.)
- **Hawking** recoils exactly (M₁² = M₀² − 2M₀e for an isotropic rest-frame photon), and the
  final burst's leptons recoil and are paid.
- **Superradiance** keeps its α² rate (visibility), labelled. A hole's mass M is its whole
  energy, rotation included (Kerr), so the stats stop adding a separate spin kinetic energy for
  holes; then dM = dE with dJ = dE/μ is already right, and the field's angular momentum and
  the hole's recoil are booked. (Measured: a hole of 0.5 over 80 time units kept dM = μ·dJ
  to 2%, but the booked total fell 11% because spin kinetic energy, counted on top of M, fell
  14× the field's gain.)
- **Bounce** takes the sign fix now, Hertz energy ⅖δ^{5/2} booked and friction metered.

**Oracles:** force = −∇V and the third law for unequal holes; a test body released at rest
just outside r_mb falls in and the remnant is M + m/2, at every frame rate; the 1 and 8 at rest
10 apart give 9 (an edit) with the ledger closed; 200 small charged holes don't run away;
Schwinger and shedding lower Q/M monotonically and the area never shrinks below extremality
(extends the censorship oracles); a stable circular orbit at 6M, none inside; a bounce
conserves total angular momentum.

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
  and J have the opposite signs, and with each other derive from L = +g·baseMass·φ/γ, a
  different coupling. Measured: on a ramp of |φ| from 0.6 to 1.4 a body of 0.1 is pushed toward
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
- the energy is Σ m_a γ_a plus the field's, conserved by the action up to the deposit and the
  interpolation being adjoint (both PQS, so they are); no separate interaction term.

Bodies are drawn to small |φ|, so to the walls, where they are light, and dense matter
pushes φ toward zero around itself: walls gather matter and matter pins walls, a new
Kibble–Zurek observable. [synthesis] The action also does what the thermal term was for: a
gas of bodies adds n·⟨m(φ)/γ⟩ to the field's effective potential, which near φ = 0 is a
positive mass term n·baseMass·⟨1/γ⟩/(2f)·φ², so dense matter restores the symmetry. It is
density-driven, and a hotter classical gas couples less (1/γ), unlike the quantum thermal
mass's T². So the thermal term goes. [synthesis] Viscosity goes, or, if the deposit's noise
needs it, it is metered. Without the energy pump the rate limit was damping, the "resonant
throb" shouldn't return. [speculation, testable] The reset, the guards and the open boundary
stop choosing +1 (§3.10).

**Oracles:** a body crossing a static wall conserves its energy plus the field's; the
mirror run (φ → −φ) is the bitwise negation; a self-dressed body's mass is the action's
stationary point; a quench with matter: walls end on bodies.

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
field along z, so E·B = 0 and the axion's aF F̃ coupling vanishes identically. What Worldline
calls the axion couples to F², the electromagnetic Lagrangian: a varying-α modulus in
Bekenstein's sense (Bekenstein 1982), which for point charges couples to their self-energy
and their interaction energies. [standard] Its misalignment and superradiance hold for any
light scalar. Whether to rename it is a9's call; the model should say which it is.

**Target:** one action, Bekenstein's form. Each charge carries q·√f(a(x)) at its position,
f = 1/(1 + ga) as `config.js` documents (so the coupling falls as a grows), and every
electromagnetic energy follows from it: the self-energy q²f/(2r_c) and the pair energies
q_a q_b √(f_a f_b)·u(r) (Liénard–Wiechert with the factor at emission, the retarded a at the
source, and at absorption). The force on a charge is −Σ ∂U/∂a·∇a; the field's source is
−∂U/∂a summed per cell, pair energies included; both carry 1/γ as proper-time couplings. The
Peccei–Quinn term is either a vertex factor on the Yukawa coupling, derived the same way, or
dropped; I'd drop it (two unrelated terms, no reading to protect). The clamp zeroes ȧ, and is
metered.

**Oracles:** two charges in a uniform a₀ feel (1 + ga₀)⁻¹ of Coulomb; a charge crossing an
axion gradient conserves its energy plus the field's; the field's source matches the
energy's derivative by finite differences.

### 3.9 Grid gravity

**Now** (audit D): Φ_F is sourced by the fields' energy density ρ = ½φ̇² + ½(∇φ)² + V, Φ_P by
the bodies' mass, each convolved with −1/√(r² + ℓ²) by circular FFT for every boundary (an open
domain sees image masses). The fields feel Φ_F + Φ_P; the bodies feel −m∇Φ_F, Newtonian, no γ
or e^Φ, dispatched once (the header says once per field). The particle's own Φ_P sources only
the field, and the particle's lapse ignores Φ_F. For the metric ansatz the field's action
gives ∂L/∂Φ = 2φ̇² − 2V, which is ρ + 3p, Tolman's active mass [standard], not ρ: here a false
vacuum (V > 0) attracts where the action has it repel. Field–particle and field–field
gravitational energy is booked nowhere. The deposit's fixed point caps at ±2048 a cell
(suspected reachable for a heavy hole).

**Target:** one gravitational coupling: Φ from every source, ρ + 3p for the fields and mass for
the bodies, and both feel the same Φ (minus each body's own term), so the forces are
reciprocal and the interaction energy ½∫ρ_active Φ is booked. The slab's own kernel F(kℓ)
(roadmap §1.2) in place of Plummer; a zero-padded convolution on open domains (Hockney and
Eastwood) and circular only on the torus; Φ_F in the bodies' lapse; a deposit format that
can't overflow.

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
Σ d·∂V/∂d that lags a readback; the Friedmann density from every booked energy by its own
equation of state (kinetic energy as radiation-like at high γ, a field's potential energy as
vacuum-like).

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
  after the culls, so counts are live and slots are reused. A fix that doesn't wait for 2.5.
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

- **A deterministic step schedule** [synthesis]: the substep is a function of the state
  alone, a whole number of `PHYSICS_DT` ticks chosen by the physics criteria below, and a
  frame only decides how many substeps to run in its wall time. The same initial state then
  takes the same steps on every machine and at every frame rate, which the record's replay
  (3.0) depends on, and which is a further reason to settle the model first.
- **Step control** [standard criteria; synthesis to combine them]: dt = η·min over the
  encounter time of every pair within a few contact lengths (min of r/|v_rel| and
  √(r³/(m_a + m_b)), reduced in the pair loop the force pass already runs), the gyroperiod
  γm/(|q|B), and the fields' CFL, from the current substep's forces, every force included.
  When the budget can't cover a frame, the frame runs fewer ticks of simulated time and the
  caption says time is slowed and by how much. Block steps or regularization only for a
  measured close-binary bottleneck (§7.1).
- Thomas precession reads a stored non-gravitational force, so the clocks can run after the
  1PN correction; `vvKick1PN` refreshes `derived.vel`; spin–orbit reads the kicked velocity.
- Determinism stays: every new reduction in a fixed order.

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
- Three discrete gradient energies (stats with clamped edges, the ledger wrapping, the
  evolution's 5-point Laplacian) disagree at the seams (suspected, small).
- Relativity off, the stats book ½mv² while capture, merge, absorption and Larmor use (γ−1)m.

**Target:** E_total = conservative energies + Σ metered columns; drift = integration error.

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

Oracle: every preset, with every column on, holds |drift| under its integration tolerance.

## 6. Oracles

New ones by section, in `tests/physics-validation.html`, each with its analytic number:
§3.1 kernel; §3.2 binary binding at v = 0.16, hierarchical triple's EIH energy, Peters'
da/dt and de/dt; §3.3 spin–orbit periastron and the spoke's precession; §3.5 the
hyperbolic charge, synchrotron power, the two dipoles' mutual radiation; §3.6 the
Paczyński–Wiita gradient, the capture at r_mb, the 1-and-8 edit, the charged-hole swarm,
monotone Q/M; §3.7 the wall crossing and the mirror run; §5 the closed ledger per preset.

## 7. Order of work

0. **The bugs of §2** now, before the model pass, each with its oracle: they are wrong under
   any model. (The pools and the modulations' pass order first: the first destroys energy in
   any long run with radiation, the second has silently disabled three couplings since March.)
1. **Corrections that fit any model** (small, local): the deterministic step schedule; the
   1PN ordering; the Higgs action; Paczyński–Wiita as one symmetric pair function with one
   capture rule and captures before forces; charge emission by the first law; the
   radiation reaction as reduced-order ALD with v × B.
2. **Gravity and the kernel together** (they couple: 1PN inside the kernel): present
   positions with gating, N-body EIH in two passes, the contact kernel for every law, step
   control with slowed time, the presets retuned.
3. **Radiation and the ledger:** 2.5PN radiation reaction for the quadrupole sink, capture at
   r_mb, the metered columns, the electromagnetic field in transit.
4. **Spins and fields:** the 1PN spin Hamiltonian, field boundaries and damping, the slab
   kernel, the axion's action, cosmology's per-substep stretch, pools by escape.
5. **2PN** only if an oracle asks for it.

Files overlap: step 2 touches `pair-force`, `forces-tree`, `shared-1pn`, `onePN` and
`compute-stats`, so it is one lane; the fields (`field-*`), charge emission (`radiation`,
`extremal`) and cosmology (`expansion`, `cosmology.js`) are separate lanes.

## 8. Questions for review

1. Near-zone PN with causal gating, against a gravitational Liénard–Wiechert (the linearized
   retarded field), which would keep §1.1's thesis whole. My objection to the latter: summed
   pairwise without a self-field, the 1.5PN near-zone term doesn't cancel. Each body feels
   −(2/3)m_i Σ_{j≠i} m_j x⃛_j, which momentum conservation (Σ_j m_j x⃛_j = 0) turns into
   +(2/3)m_i² x⃛_i, a dipole radiation reaction that GR forbids because the self-field cancels
   it; inspirals would run about 1/v² too fast. And linearized gravity isn't self-consistent
   for bound sources. Is that right, and is anything lost by dropping signal delay for gravity?
2. The −½Σ_a m_a Φ_a² form of EIH's G² sector, its pair force with weight (Φ_k + Φ_b), and the
   two-pass N-body EIH: correct, and correct with u(r) in place of 1/r?
3. 2.5PN pairwise against a system or clustered quadrupole: which, for scenes larger than a
   wavelength? Verify the coefficients above.
4. The kinematic map dw/dt = γ[a + γ²(v·a)v] for EIH's coordinate acceleration: right, and
   consistent with the Boris push carrying the electromagnetic and gravitomagnetic rotations?
5. The contact kernel h_ij = R_i + R_j: does a kernel whose support moves with the bodies
   (merges, Higgs-free) break anything, and is baseMass the right anchor?
6. The electromagnetic field column: is −∫Σ(F_LW − F_Darwin)·v dt the energy in the field
   beyond Darwin, given Darwin is velocity-dependent (its energy function isn't T + V)? And
   coherence: photons are emitted per body from its self-force, so two like charges in a
   symmetric orbit emit twice Larmor in photons while the mutual field returns it (true
   radiation is quadrupole order). Emit from each body's net of self and mutual radiative
   work instead, and how to separate "radiative" from "in flight" in the mutual part?
   Also: is the claim that mutual Liénard–Wiechert plus a correct self-force makes the EM
   quadrupole sink redundant right?
7. Capture at r_mb = 2(r₊,a + r₊,b) with the remnant at the pair energy and the gap
   c_ab = r₊,a + r₊,b: sound for bound pairs and the test-body limit, and what for
   comparable-mass holes, where Paczyński–Wiita means little?
8. The emission rule from the first law and the area theorem (the Kerr–Newman step
   Q²(r₊ + M) < 2M²r₊ ⟺ r₊ > M), and the over-extremal case. `AGENTS.md` says paying the
   Schwinger lepton's kinetic energy made the discharge run away; if paying e·Φ_H can't raise
   Q/M below extremality, what produced that runaway?
9. The Higgs action's consequences for the Kibble–Zurek figure (matter on walls), and whether
   anything relied on the old coupling.
10. The self-force as reduced-order ALD with K the non-gravitational four-force including
    v × B and dK/dτ by finite difference along the path: right sign and form, stable at the
    step sizes in use (τ = 6.7 for an electron of m 0.1, q −1, comparable to a pass), and is
    leaving gravity out (the equivalence-principle choice) defensible here?
11. Time-even softening by the invariant ρ = −u·R = γκR: is that the rest-frame distance for
    uniform motion as claimed, and what does it do under acceleration?
12. The deterministic step schedule (the substep a function of the state, the frame only
    choosing how many): anything in the expansion split, the world-line cadence or the
    readbacks that assumes a frame's dt?
13. The thermal term's removal: does the action's density-driven symmetry restoration
    (n·⟨m(φ)/γ⟩ in the effective potential) cover what the term was for, and is a classical
    gas coupling less as it heats acceptable?
14. Tolman's ρ + 3p for a field confined to a slab in one transverse mode: which pressures
    count, and does the slab kernel F(kℓ) change the active mass?
15. The axion in Bekenstein's form with vertex factors √f(a) at each charge, f = 1/(1 + ga): is
    the pair energy's a-dependence (and so its source) right for Liénard–Wiechert, where the
    emitting vertex is at the retarded point?
16. The ordering in §0, and whether the §2 bugs should land before any of it.

## 9. After the record (3.x)

The Schwarzschild and Kerr metric regime for test bodies and light, the embedding diagram,
gravitational waves at a ring of test masses with chirp audio, fields carrying energy through
a closed surface, the covariance meter. Roadmap §7.1–7.2 hold their detail.
