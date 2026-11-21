# Worldline's physics model

Each law as it runs, the approximation it makes and why, and where the model is known to be wrong.
`about.md` is the visitor's account of the same laws; the code carries the implementation.

## Scope

- Units c = G = ħ = 1. State is proper velocity w (linear) and angW (rotational), so nothing
  outruns light; v = w/γ. A body's radius is ∛m, the source of its moment of inertia
  I = `INERTIA_K`·m·R², its magnetic moment and its one canonical spin J = I·angW.
- **The planar convention.** The scene is a slice of a 3+1 world, and each model names its
  reduction:

| Reduction | Applies to | Exact | Approximate |
|---|---|---|---|
| Symmetry plane | point bodies with z-spins and their 3D forces; Kerr–Newman equatorial motion | planar orbits are an invariant sector of 3D dynamics under z → −z | softening; anything breaking the reflection |
| Confined slab | the Higgs and axion fields, grid gravity | the 3D action on a transverse profile φ = ψ(x, y, t)·χ(z) | one transverse mode; couplings rescaled; gravity's finite-thickness factor |
| FRW background | cosmology | the slab is a slice of homogeneous flat 3D FRW | perturbations live only in the slab |

- **Three lengths are never identified:** the slab thickness ℓ (`SHEET_THICKNESS`, 8; comoving
  under expansion) for the fields and grid gravity; the comoving thickness of the cosmological
  slice; and the softening ε (8, `BH_SOFTENING` 4 in black-hole mode) for particle forces only.
  A dimensional label doesn't repair an equation: each reduction needs its own derivation.

## Forces

- **Gravity** is Newtonian with Plummer softening, F = m₁m₂ r/(r² + ε²)^{3/2}, and the same ρ =
  √(r² + ε²) in the potential and the lapse, so they agree. ε is a numerical choice, and it is
  large: at r = 20 the pull is 20% short of Newton's.
- **Gravitomagnetism** (signs in the convention r = source − observer, F = q v × B + 4m v × Bg):
  a moving mass gives `Bgz = +m (v × r)_z/r³` (parallel mass currents repel; 4m v × Bg is exactly
  EIH's v₁·v₂ sector), a spinning mass `Bgz = +J/(2r³)` (prograde orbits slow, Ω = Ω_K − J/r³), and
  the gravitomagnetic dipole force +3L₁L₂/r⁴ attracts. With Relativity it adds a frame-dragging
  torque.
- **Electromagnetism:** a moving charge gives `Bz = −q (v × r)_z/r³` (parallel currents attract), a
  spin dipole `Bz = −μ/r³` (aligned dipoles side by side repel, −3μ₁μ₂/r⁴). Spin–orbit applies
  F = μ∇Bz and F = +2L∇Bgz from the moving sources' gradients only, since the dipole–dipole terms
  already carry spin–spin.
- **Yukawa:** V = −g·m₁m₂ e^{−μρ}/ρ with the softened ρ, the pion mass μ its range.
- **External fields:** uniform g, E and B_z, independent of the force toggles, doing work the ledger
  doesn't book.
- **Tidal locking** is a phenomenological torque toward synchronous rotation; no conservative
  Hamiltonian gives it, and it has no orbital reaction.

## Signal delay

- With Relativity on, every source acts from its retarded state, the point where its recorded world
  line crosses the observer's past light cone.
- **Charges act through their Liénard–Wiechert fields**, to all orders in v:
  E = q[(n̂ − β)(1 − β²)/(κ³R²) + n̂ × ((n̂ − β) × β̇)/(κ³R)], B = n̂ × E, both scaled by σ³ with
  σ = R/√(R² + ε²) so a charge at rest gives softened Coulomb, and κ = 1 − n̂·β floored at
  `LW_KAPPA_MIN` (1/κ³ ≤ 100), which suppresses the forward field of sources above about 0.78c. At
  O(v²) the field about the present position is Darwin's, which is the energy the stats book.
- **Gravity, Yukawa and the dipole forces** are their static forms at the retarded position times
  the toy aberration factor min((1 − n̂·v)⁻³, 100); the Bg fields, frame drag, tidal torque,
  spin–orbit and 1PN take the retarded state without it. This is a toy: gravity's aberration
  cancels against its velocity-dependent terms (Carlip 2000), so delay without them is wrong at
  O(v), which is why an inspiral gains energy under it.
- **1PN** (with Relativity): the harmonic-gauge two-body EIH acceleration, with Gravitomagnetic;
  Bažański's mixed gravity–Coulomb term (Majumdar–Papapetrou balance is exactly zero); scalar
  Breit with Yukawa. The relativistic momentum update gets EIH's coordinate acceleration through
  the compensation +½v²a_N + v(v·a_N), the 1PN expansion of dw/dt = γ[a + γ²(v·a)v]. The forces are
  order-reduced Euler–Lagrange forces, so they break Newton's third law (a static pair's
  F₁ + F₂ = m₁m₂(m₁ − m₂)/r³), and the three-body G² terms are missing. EIH on top of retarded
  Newtonian gravity counts retardation twice, so 1PN's accuracy is void while gravity is delayed.

## Clocks and spin

- dτ = dt·√max(0, 1 + 2Φ_N − v²), Φ_N softened like the force: the additive weak-field lapse.
  Unsoftened it is Schwarzschild's static lapse √(1 − 2M/r), and on a circular orbit it gives
  Schwarzschild's √(1 − 3M/r). Field gravity and Paczyński–Wiita are not in it.
- The spoke angle is a transported axis: θ advances at the rest-frame rate ω (Ω_H for a hole) plus
  Thomas precession (γ²/(γ + 1))(a × v) from the **non-gravitational** acceleration only (gravity's
  share is the geodetic term), geodetic −(3/2)(g × v), and Lense–Thirring Σ −J/r³.
- A body is drawn as its rest-frame disk through the Lorentz map of its centre's velocity, each point
  at its own rest-frame time, so a spinning, moving spoke bends by 2·v·v_rim across the diameter.

## Radiation and bosons

- **Larmor radiation** with reaction τ·jerk (static-form jerks), not Landau–Lifshitz, and blind to
  the magnetic force. It leaves as photons of `PHOTON_QUANTUM` (0.02) emitted in the rest frame and
  boosted with recoil. Photons stay in the plane as a labelled surrogate for 3D emission.
- **Pions** carry Yukawa radiation away (energy taken from the body as it accrues) and decay on
  their own clocks (half-lives 32 neutral, 64 charged); **leptons** come from Schwinger discharge,
  extremal shedding, evaporation remnants and charged-pion decay. Photon → pair conversion is
  deliberately absent.
- **Absorption** adds the boson's whole four-momentum, so the target's invariant mass changes with
  its proper velocity. Opposite pions within 2 annihilate into two photons; a boson cluster whose
  energy exceeds half its extent (the hoop conjecture) collapses into a body, a kugelblitz.
- Bosons lens (photons 2× Newtonian, pions 1 + v²) but don't pull the bodies: a reciprocal pull
  needs each boson's projected impulse.
- The quadrupole sink is off until a radiation reaction replaces it. What it got wrong is what the
  replacement must do: the whole trace-free tensor, centre-of-mass-relative motion, recoil from its
  quanta, and every step, not once a frame.

## Black holes

- The horizon is Kerr–Newman, r₊ = M + √(M² − a² − Q²) with a = J/M; super-extremal inputs clamp to
  r₊ = M, an effective radius for stable evolution, not a naked-singularity model.
- Gravity among holes is Paczyński–Wiita, Φ = −M/(r − r₊), unsoftened: pseudo-Newtonian, not a
  geodesic solve. Under the relativistic kinetics it runs with, its marginally bound and stable
  radii are 4.732M and 7.212M, not the textbook 4M and 6M.
- **Hawking:** Kerr–Newman temperature and Stefan–Boltzmann power (Schwarzschild P = 1/(15360πM²)),
  none at extremality, on the hole's clock; below `MIN_MASS` the hole ends in two back-to-back
  photons.
- **Schwinger** discharge emits same-sign leptons in the hole's rest frame, each costing one charge
  quantum and `ELECTRON_MASS` but not the lepton's kinetic energy (paying that too made the
  discharge run away). **Extremal censorship** sheds whole quanta, with recoil, until the hole is
  under its limit.
- **Superradiance** runs at α² instead of the real α⁸, which is too steep to see; the hole loses
  dM = dE and dJ = dE/μ_a, so it saturates at Ω_H ≤ μ_a. A hole's mass is its whole energy, so no
  separate spin energy is booked.
- The weak thin lens has no shadow, so lensing imposes a 3√3·M capture disk.

## Scalar fields

- Two fields on 128² slab grids, stepped by one joint Störmer–Verlet step. The grid holds the
  dimensionally reduced ψ = √ℓ·φ_3D, so the slab's energy is ℓ·Σ(…)dA and ℓ is absorbed into ψ and
  the couplings.
- **The Higgs** sets each body's mass, baseMass·max(|φ|, `HIGGS_MASS_FLOOR`), at fixed momentum and
  spin, and bodies source it with `HIGGS_COUPLING`·baseMass. Force, source and mass don't come
  from one action, and the ledger books mass plus interaction as baseMass, hiding the field energy
  the coupling makes.
- **The axion** is sourced by g·q² and pushes with g(q² + s·m)∇a (s the Peccei–Quinn sign, flipped
  for antimatter). It no longer scales the pair laws: that coupling ran opposite to its Lagrangian.
- **In gravity** the fields evolve in ds² = −e^{2Φ}dt² + e^{−2Φ}d𝐱², where Klein–Gordon is exactly
  φ̈ = e^{4Φ}∇²φ − e^{2Φ}V′ + 4Φ̇φ̇. Φ comes from both fields' energy and the bodies' rest mass,
  each convolved with the sheet kernel −1/√(r² + ℓ²). The source is ρ where the action gives ρ + 3p,
  so false vacuum attracts, and the bodies feel the fields' Φ but not reciprocally.
- The field energy sums ½(Δφ)²/h² over cell edges, so its derivative is the evolution's 5-point
  Laplacian and it sees every mode, the checkerboard included.
- The ether damping (Higgs 2m_H, axion g·m_a), the Kibble–Zurek quench's ramp of the mass term and
  its Langevin bath (⟨ξ²⟩ = 2γT·dt/cellArea) do work the ledger doesn't book. Every open boundary
  reflects, and damping singles out the grid frame.

## Expansion

- The universe is the periodic domain, a slab cut from flat 3D FRW. It needs the torus because
  Klein and RP² aren't homogeneous: there the minimum-image pull of a uniform background doesn't
  cancel.
- a(t) follows de Sitter, matter, radiation or ΛCDM (Ω_m 0.3), or the Friedmann closure
  H² = (8π/3)ρ̄ + H_Λ², ρ̄ the bodies', pools' and fields' energy over the slab volume a³·W·H·ℓ.
- Bodies keep physical coordinates on a growing domain, so the forces never see a; the stretch is
  split around the substeps (Strang), which on the torus is the comoving dynamics ẋ = Hx + v,
  ẇ = f − Hw. World lines are comoving and conformal, so Liénard–Wiechert's flat formula holds in
  (η, x/a) and E_phys = E_conformal/a² (Maxwell is conformally invariant). FRW has no global boosts,
  so frames other than the lab are off once a ≠ 1.
- The fields feel Hubble friction φ̇ ← φ̇·e^{−3H dt/2} around each step, and their sources thin by 1/a.
- The energy expansion takes is metered at each operator (kinetic and photon redshift, the fields'
  friction, potentials to first order), so E + W holds; momentum drift compares a·P, which
  expansion conserves on the torus.

## Lensing and sight

- **The backdrop lens** is thin and instantaneous, viewed along z: α(x) = Σ 4M𝒟(x − xᵢ)/|x − xᵢ|²
  with 𝒟 = D_L·D_LS/D_S, so R_E = √(4M𝒟). Each lens sits at its image nearest the view's centre, a
  finite-patch approximation. The probe's magnification is inverse ray shooting over the star's
  disk, for any lens configuration.
- **Seen** is the observer's past light cone: each source at its retarded event, in its aberrated
  direction cos θ′ = (cos θ + β)/(1 + β cos θ) at the distance its light travelled; each point of a
  body at its own retarded time (Terrell, Penrose). Sight uses straight null lines, so with gravity
  on, light bends and sight doesn't.
- **The streak plate** stacks the observer's one-dimensional sky over its proper time. Doppler is
  D = γ_o(1 − n̂·u_o)/γ_s(1 − n̂·v_s). Sources and their light are 3+1 under the planar convention,
  so bolometric intensity goes as D⁴ and photon number as D³.
- **Radar** (Bondi; Dolby and Gull 2001): an event the observer's light reaches at τ₁ and whose light
  returns at τ₂ has time (τ₁ + τ₂)/2 and distance (τ₂ − τ₁)/2. For an inertial observer these are its
  Lorentz coordinates; for constant proper acceleration α, Rindler's, the distance
  (1/α)·arcosh[(α²(ξ² + y²) + 1)/(2αξ)] (Bini, Lusanna and Mashhoon, gr-qc/0409052), with the horizon
  infinitely far. Radar needs the observer's future, so only observers whose world line is known
  have it.
- **The k-calculus:** ticks every T from a source receding at v arrive every kT,
  k = √((1 + v)/(1 − v)); the twin's ages follow with no simultaneity at all.
- **A prescribed body** sources every law and responds to nothing; the agent that drives it pays
  W = Δ(γm) − ∫F_other·v dt (Jackson's prescribed currents), the inertial term included.

## The ledger

E is rest plus kinetic, spin, each force's conserved energy (T + V; with Relativity, Darwin's
+(q₁q₂/2r)[v₁·v₂ + (n̂·v₁)(n̂·v₂)]; with 1PN, the two-body EIH, Bažański and Breit energies), the
fields' slab energy, and radiated energy (the pools, pending accumulators, and what the pool culls
remove). Not booked: the external fields' work, damping, the bath and the quench, contact friction,
walls and despawns, boson–boson gravity, photon lensing's recoil, and charge (there is no charge
ledger). On a torus angular momentum isn't conserved (minimum-image forces aren't central), so its
drift there means nothing.

## Known faults

- An equal-mass binary at v = 0.16 loses 80% of its binding energy per orbit, and gravity's toy
  delay makes an inspiral gain energy.
- With 1PN inside the softening length a planet escapes at once; a dense Yukawa well drove bodies
  to about 3c.
- Softening breaks time symmetry in electromagnetism: σ³ of the retarded distance gives an O(v)
  time-odd force within about 2ε.
- Inside a horizon Paczyński–Wiita's gap pins and the force plateaus at about 16·m_i m_j; captures
  turn the plateau's work into mass, and that loop is the runaway in crowded black-hole scenes.
- The step depends on the wall clock (a frame's simulated time split into at most 32 substeps of
  √(ε/a_max), from a readback a frame old), so the same run takes different steps at different
  frame rates, and when the cap binds accuracy goes rather than time slowing.
- A pool full of live bosons drops a multi-product event's products.

## Constraints on new work

1. **One combined action per regime:** force, field source, mass modulation and booked energy are
   derivatives of one function, and order reduction uses the combined theory's leading
   acceleration. A combination that isn't derived is restricted in the UI or its missing cross terms
   are named. Nothing conservative is written as a force alone.
2. **Declared regimes:** gravity and Yukawa become near-zone post-Newtonian (instantaneous, gated
   causally), electromagnetism stays Liénard–Wiechert, the fields a slab's Klein–Gordon, holes
   Paczyński–Wiita until a metric regime. A fixed metric is its own regime, never blended with the
   many-body forces.
3. **A closed ledger, certified independently:** each non-conservative exchange is metered at the
   operator that makes it and checked against an independently predicted number, or closure is a
   tautology.
4. **Time slows before accuracy goes:** when the step budget runs out, a frame runs less simulated
   time and the caption says so.
5. **Causality as a gate:** no source acts before light from its creation arrives, and a removed one
   acts until light from its removal has passed.
6. **Disable before you wire:** where the coupling behind a bug is itself wrong, switch it off until
   its model lands, rather than letting a fix turn a defective coupling on.
