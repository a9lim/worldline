---
name: Worldline
title: Worldline — Interactive Particle Physics Simulator
description: Explore relativistic many-body dynamics, electromagnetism, light and scalar fields in six curated presets, and tilt the plane into spacetime to see the world lines they trace.
updated: 2026-10-26
---

# Worldline

Worldline is a relativistic many-body sandbox. Up to 4096 charged, spinning bodies move in a plane under gravity, electromagnetism, gravitomagnetism, a Yukawa force and two scalar fields, with black holes, radiation and pools of photons, pions and leptons. Units are c = G = ħ = 1, and the physics runs as WebGPU compute shaders.

The scene is a slice of a 3+1-dimensional world. Bodies are 3D point masses confined to a symmetry plane, spinning about its normal and interacting through their 3D force laws. The scalar fields live in a slab of thickness 8, and the expanding universe is a slab of a flat 3D Friedmann–Robertson–Walker universe. Each effect below is either a stated law or a named approximation.

## Interactions

The Laws tab sets the model. Seven of its ticks are interactions:

- **Gravity** is Newtonian with Plummer softening, F ∝ r/(r² + ε²)^{3/2} with ε = 8, and carries a tidal-locking torque.
- **Gravitomagnetism** adds the field of moving and spinning masses, F = 4m v × B_g. Parallel mass currents repel, and a spinning mass slows prograde orbits. With Relativity on it also adds a frame-dragging torque.
- **Coulomb** is electrostatics, softened in the same way.
- **Magnetism** adds the Lorentz force from moving charges (Biot–Savart) and the dipole–dipole force between spinning charges.
- **Yukawa** is a screened attraction e^(−μr)/r, whose quanta are massive pions.
- **Higgs** and **Axion** are scalar fields (see below).

**Mechanics** is Newton's, relativity, or relativity with 1PN. Relativity gives bodies proper velocity w = γv and turns on signal delay. 1PN adds the O(v²) two-body terms the other sectors leave out: Einstein–Infeld–Hoffmann (with Gravitomagnetism), Bažański's gravity–charge term and the scalar Breit term. Electromagnetism needs no Darwin term, because under Relativity it already acts through each charge's full field. **Spin–orbit** kicks spinning bodies along field gradients (Stern–Gerlach F = μ∇B_z, Mathisson–Papapetrou F = 2L∇B_g). **Radiation** and **Black holes** are described below. **Bosons interact** lets photons, pions and leptons gravitate, and lets charged pions interact electrically. A boson cluster whose energy exceeds half its extent collapses into a body (a kugelblitz, by the hoop conjecture). **Barnes–Hut** and **Expansion** are not forces: one swaps pairwise sums for a tree (opening angle 0.5) when Relativity is off, the other makes the domain an expanding universe. The World tab adds uniform gravity, electric field and B_z on top, the first two as arrows dragged to their strength and direction.

Collisions pass through, merge or bounce. A merge adds rest masses and conserves momentum and angular momentum. The kinetic energy it loses goes into the scalar fields if one is on, and otherwise leaves the books. Matter meeting antimatter in Merge mode annihilates into two photons.

## Integration and resolution

The integrator is a staggered Boris pusher: magnetic and gravitomagnetic forces rotate the velocity, and velocities sit half a kick from positions. Each frame takes at most 32 substeps of dt ≈ √(ε/a_max), from the previous frame's largest acceleration, and 1PN's velocity-dependent forces get a velocity-Verlet correction. With Relativity off the dynamics are Newtonian and nothing caps the speed; a strong Yukawa well drives bodies past 3c.

The softening length ε = 8 is large against the default 64 × 64 domain, so close encounters are soft. Behaviour at separations near ε belongs to the softening, not to the force law (black-hole mode uses ε = 4). The analytic checks hold well outside it. With 1PN and Gravitomagnetic on, a weak-field orbit at r ≈ 200 advances its perihelion by Schwarzschild's 6πM/p per revolution, of which special relativity alone supplies πM/p. Inside the softening length the 1PN terms are far outside their range.

## Signal delay

Every body records its world line: 1024 samples, one every 1/8 time unit, of position, velocity, acceleration, proper time, spin, mass and charge. With Relativity on, every force acts from where its source was when the signal left it, found on that record.

Charges act through their Liénard–Wiechert fields. A fast charge's field flattens toward its present position, and an accelerating charge radiates a field that falls off as 1/r. The field is regularized and interpolated:

- It is softened by σ³, σ = R/√(R² + ε²), so a charge at rest gives the softened Coulomb field.
- The beaming factor κ = 1 − n̂·β is floored at 1/κ³ ≤ 100, which suppresses the forward field of a source approaching faster than about 0.785c.
- Positions are cubic Hermite curves and accelerations are linear, so the two do not describe one trajectory, and spin-orbit kicks are missing from the acceleration.
- Magnetic dipoles keep static fields.
- The field carries no energy or momentum in transit, so particle momentum is not conserved, and two charges' mutual radiation leaves without photons.

Gravity, Yukawa and the dipole forces have no field solution. They use a toy instead: the static law at the delayed position, times the aberration factor (1 − n̂·v)⁻³, capped at 100. It is not conservative. At first order in v the pull points to where the source was, so a binary gains energy each orbit (Laplace's argument). In general relativity, velocity-dependent terms cancel this aberration (Carlip, 2000). Measured: an equal-mass binary at v = 0.16 loses 80% of its binding energy in one orbit. Under Relativity every force is summed pairwise from the sources' delayed states, Barnes–Hut or not, since a tree node's aggregate has no world line.

A body spawned by hand acts on nothing until its light arrives. A removed body keeps acting until its last light has passed. Bodies from a preset or a save count as having always existed.

## Proper time and the spoke

Every body carries a clock running at dτ/dt = √(1 + 2Φ − v²), with Φ the other bodies' softened Newtonian potential. Field gravity is excluded, and near a hole Φ stays Newtonian. It is the weak-field rate, exact for a free clock, a static clock outside a Schwarzschild mass and a circular Schwarzschild orbit, √(1 − 3M/r). The Measure tab shows the selected body's τ and dτ/dt, and every body's outline is its clock: a heavier arc sweeps it from the top once per 16 units of the body's proper time, so a moving clock, or one deep in a well, visibly lags. Each point of the outline reads the body's own time there, so a moving clock's face is skewed by the same simultaneity that bends its spoke.

Pion decay, Hawking evaporation, Schwinger discharge and superradiance run on dt/γ: kinematic dilation only, without the gravitational lapse. So a neutral pion beam at γ = 5 travels five times as far before half of it decays, and a hole at γ = 2 takes twice the lab time to evaporate. Emission happens in the emitter's rest frame and is boosted into the lab with its recoil.

Each body is its rest-frame disk pushed through the Lorentz transformation of its velocity, so a moving body contracts by 1/γ along its motion. One spoke marks the body's orientation, turning at its rest-frame rate on its proper time; black holes turn at Ω_H. On a spinning, moving body, points across the disk are seen at different moments of its own time, so the spoke bends by 2·v·v_rim radians. For a rim at 0.9c on a wheel moving at 0.9c, that is about 93°.

The spoke is a transported axis, so it precesses even without spin:

- Thomas precession, from non-gravitational forces only, turns it back by 2π(γ − 1) per circular orbit.
- Geodetic precession turns it forward by 3πM/r per orbit, the effect Gravity Probe B measured.
- With Gravitomagnetic on, a spinning mass drags it (Lense–Thirring).

1PN spin precession's two-body companion term is not modelled.

## Radiation

With Radiation on, three kinds of radiation carry energy away:

- Accelerating charges radiate by Larmor's formula, with its Landau–Lifshitz reaction force.
- Orbiting masses and charges radiate by the gravitational and electric quadrupole formulas.
- Bodies under Yukawa emit pions by the scalar analogue of Larmor's formula.

The energy leaves in quanta of 0.02. Photons are a surrogate. The rates are the 3D formulas, and each quantum then travels in the plane at c, in a direction drawn from the in-plane slice of the angular pattern (sin²θ about the acceleration, beamed forward at high γ). They carry the energy and beaming of 3D emission, but they are not planar electrodynamics. Gravitational quanta are drawn in madder, electromagnetic ones in ochre.

Reaction is strong at these charges. An electron of mass 0.1 and charge −1 has τ = 2q²/3m = 6.7, comparable to a pass, and can radiate more than its kinetic energy. The bremsstrahlung preset's electrons have mass 0.3 for that reason.

Neutral pions decay into two photons (rest-frame half-life 32), and charged ones into a lepton and a photon (64). Bodies absorb photons and pions with their full four-momentum, across a periodic seam too. Photons bend by twice the Newtonian deflection, pions by (1 + v²), and photons never convert into pairs. The pools hold 16384 photons and 4096 each of pions and leptons. Photons are culled at lab age 256 and leptons at 512. The cull bounds memory, is not a lifetime, and can destroy a bound structure. Culled energy is booked as escaped radiation.

## Black holes

Black-hole mode makes every body a Kerr–Newman hole, with horizon r₊ = M + √(M² − a² − Q²) and a = J/M. Super-extremal inputs clamp to r₊ = M, an effective radius rather than a naked singularity. In Merge mode, which black-hole mode forces, a body whose centre crosses a horizon is swallowed, and the hole takes the invariant mass of the pair's four-momentum. That keeps the kinetic energy the fall gained but not the potential that paid for it, so captures create energy: two bodies of mass 1 and 8, at rest 10 apart when black-hole mode is switched on, become one hole of mass 25. Holes carry no antimatter flag (no hair), and the equatorial ergosphere, at M + √(M² − Q²), is drawn dashed.

Gravity near a hole is the Paczyński–Wiita pseudo-potential Φ = −M/(r − r₊), floored at a small gap. It is phenomenological: it steepens the well so that near-horizon orbits plunge, but it is not a geodesic solve, and its orbital radii are not Kerr–Newman's.

- **Hawking radiation** uses the Kerr–Newman temperature T = κ/2π and the Stefan–Boltzmann power σT⁴A (σ = π²/60), with none at extremality. Photons leave isotropically in the hole's rest frame, with recoil. Below mass 0.05 a hole sheds its charge as leptons and ends in two back-to-back photons carrying its four-momentum.
- **Schwinger discharge** runs at a rate ∝ exp(−πE_c/E), with E = |Q|/(r₊² + a²) the horizon field. Each event emits one same-sign lepton and costs the hole one charge quantum and the lepton's rest mass, 0.01. The lepton's kinetic energy is not charged to the hole, since charging it makes the discharge run away, so each event creates that energy.
- **Extremal shedding**: a hole charged past √(M² − a²) sheds same-sign leptons, one quantum each, at a rest-frame speed of 1/√3, with recoil. Their kinetic energy is also unpaid. If the lepton pool is full, the charge is clamped as a backstop.
- **Superradiance** (with Axion): while Ω_H exceeds the axion mass μ_a, the hole pumps energy into the field at a rate ∝ α²(Ω_H − μ_a)(1 + φ²), with α = Mμ_a. It loses dM = dE and dJ = dE/μ_a, spinning down to Ω_H = μ_a. The real rate scales as α⁸, too slow to watch, so α² is a deliberate speed-up. It runs on dt/γ, valid only for slow holes.

## Charge

Charge comes in quanta of 0.1. Charges are rounded on creation, and emission, absorption, decay, discharge and shedding each move whole quanta. Charge leaves the system only with a removed body, a culled lepton, or the extremal backstop.

## Scalar fields

The Higgs and axion fields live on 128 × 128 grids with cubic B-spline deposition and interpolation, clamped to ±2. They step together, one Störmer–Verlet kick–drift–kick per substep, and their sources couple through proper time.

- **Higgs**: a Mexican-hat potential. A body's mass is its base mass times max(|φ|, 0.05), and the field scales the Yukawa range. Its Z₂ symmetry is biased toward the positive vacuum: the field resets there, and its source is positive.
- **Axion**: a quadratic potential. It scales the electromagnetic couplings by 1 + g·a, is sourced by g·q², and modulates the Yukawa coupling with a sign that flips for antimatter.

Both fields carry an ether damping, on by default (2m_H and g·m_a). It is a friction relative to a preferred frame, and it dissolves self-bound lumps. A numerical viscosity damps modes near the grid scale.

With Gravity on, the fields evolve in the metric ds² = −e^(2Φ)dt² + e^(−2Φ)dx², whose Klein–Gordon equation is φ̈ = e^(4Φ)∇²φ − e^(2Φ)V′ + 4Φ̇φ̇. Φ comes from the fields' energy and the bodies' rest mass, convolved by FFT with −1/√(r² + ℓ²), ℓ = 8: a Plummer kernel standing in for a slab, with periodic boundaries. The fields' share of Φ also pulls on the bodies, and oscillations near a mass slow by e^Φ.

The Kibble–Zurek preset ramps the Higgs mass term through the transition over a quench time τ_Q, crossing it τ_Q after the start, with a Langevin heat bath. τ_Q is 120 by default; it is the figure's knob, from 10 to 1000, and changing it re-runs the quench. The field freezes into ±v domains, and a slower quench leaves fewer walls, as a power of τ_Q (Kibble, 1976; Zurek, 1985): mean-field theory predicts a wall density ∝ τ_Q^(−1/4), and the analytic checks measure an exponent near 0.22.

## Expansion

Expansion requires the torus: the periodic domain is the whole universe, a slab of comoving thickness 8 cut from flat 3D FRW. The Klein bottle and RP² aren't homogeneous, so a uniform background would pull on bodies there.

- **History.** a(t) follows de Sitter, matter, radiation, ΛCDM (Ω_m = 0.3), or the Friedmann equation H² = (8π/3)ρ̄ + H_Λ². In the Friedmann case, ρ̄ is measured from bodies, bosons, radiation and the fields' slab energy, scaled as a⁻³ or a⁻⁴ between measurements. a stops at 1000.
- **Dynamics.** Positions stretch and peculiar momenta and photon energies fall as 1/a. The stretch is split symmetrically around substeps that run at the midpoint a, a Strang split at frame cadence (H·dt ≤ 0.02). Bodies at rest keep their comoving places, and a bound pair feels only the tidal term (ä/a)d.
- **Signals.** World lines are recorded in comoving coordinates and conformal time, where light cones are straight. Maxwell's equations are conformally invariant, so the flat-space field there gives the physical field over a², with radiation dimmed by 1/(1 + z). That field keeps every regularization listed under Signal delay and sees one image of each source. The other laws use the delayed physical position, without FRW corrections.
- **Fields** feel Hubble friction, and their sources thin as 1/a. An axion field frozen while H exceeds its mass starts oscillating once H drops below it, then dilutes like cold matter (misalignment).
- **Frames.** An expanding universe has no global inertial frames, so the non-lab frames turn off once a ≠ 1, and the spacetime view becomes a conformal diagram.
- **Ledger.** The Measure tab shows a, H, c/H, the event horizon and the Friedmann density, and it books the energy expansion takes as W. The booking is exact for kinetic and photon redshift and for Hubble friction. For the potentials it is first order and lags a readback, and pending radiation isn't redshifted.

## Frames

The view can be drawn for other observers: zero momentum, the selected particle, a boost at a chosen speed and direction, a frame co-rotating at a chosen rate, or free fall (the selected particle followed without a Lorentz transformation, so uniform gravity vanishes and tides remain). Worldline cuts every recorded world line with the observer's surface of simultaneity. In a boosted frame, moving rulers contract, lab-synchronized clocks disagree across the view, and a fast wheel seen in its own rest frame is round. The observer's present lags the lab's so that everything drawn has already been computed, and the Measure tab reports the lag. The Figure tab chooses the observer, and the figure bar's lab · observer switches between the lab and it. Frames are only a view: spawning and selection act in the lab, arrows and the field overlays stay lab-only, and a frame that is not a boost draws no world lines.

On a torus the lab is a preferred frame: opposite edges are identified at equal lab time. A traveller circling a torus of length L at speed v sees its own images γL apart in its own frame, with clocks γvL apart. A twin circling at 0.8c meets the stay-at-home twin every lap, younger each time, without turning around (Barrow and Levin, 2001). On the Klein bottle and RP², frames draw only the primary image.

## Lensing

With Gravity on, the rulers are a backdrop behind the plane, seen through the bodies as a thin lens along the plane's normal. Each pixel shows the backdrop at β = θ − α(θ), with α summed over the bodies as point lenses, 4M𝒟/b. The distance factor 𝒟 = D_L·D_LS/D_S is set on the Laws tab's Backdrop, and a lone mass makes an Einstein ring of radius √(4M𝒟).

A backdrop star's images appear as arcs and rings. Its magnification, counted by inverse ray shooting, traces a microlensing light curve. For a single lens the curve follows (u² + 2)/(u√(u² + 4)) (Paczyński, 1986), averaged over the star's disk.

The lens is instantaneous and weak-field: no time delays, no moving-lens corrections, no strong-field images, and lab frame only. On a periodic domain each lens sits at its image nearest the view's centre. A thin lens casts no shadow, so each black hole gets an imposed capture disk of Schwarzschild's 3√3·M, ignoring spin and charge.

## Reading the figure

Each body is drawn in the ink of its charge's sign: sienna for positive, prussian for negative, graphite for neutral, with + or − on bodies large enough to carry it. Antimatter is hollow, and a black hole is a void inside its dashed ergosphere. The one red marks the selected body, its world line and past light cone, and the lens probe's star. A photon is a short wave packet whose wavelength shortens as its energy rises. Colour always comes paired with a pattern, so the figure survives grayscale.

World lines are always drawn, and seen from above they are the trails. Alt- or Shift-drag, W or the Spacetime button tilts the plane into time, at one scale for time and space so that light runs at 45°. World lines are beaded at a fixed interval of proper time, so a fast or deeply bound clock beads sparsely. Open circles mark births, deaths, mergers and kicks, and the selected body's past light cone opens below it. Lab and observer switch between the lab's coordinates and the observer's, eased through the boost for a moving observer.

The Fields overlay prints fields the way a textbook figure does:

- gravity's potential as contours, ticked downhill;
- the electric field as field lines, through the delayed field when Relativity is on, so an accelerating charge's lines kink where news of the acceleration has reached;
- the out-of-plane magnetic field as ⊙ and ⊗ on a lattice whose spacing halves with each tenfold rise in strength;
- Yukawa's potential as dotted contours.

Higgs and axion fields are hatched one way above zero and the other below, with domain walls drawn in. A key names each mark in the scene, a scale bar gives lengths in units of c = 1, and the caption states what the figure shows, with live values.

## Presets

Six figures, keys 1 to 6, each set their own domain, forces and view. A dotted number in a figure's caption is its knob, and dragging it changes the figure: the cyclotron's B and E and the beam's speed act at once, while the twin's speed, the wheel's speed, the lens's mass and the quench time re-run the figure.

- **Cyclotron drift**: charges of both signs at about 0.5c gyrate in B_z = 0.8 and drift across an electric field at 0.15c. In spacetime they trace helices of opposite hand, leaning the same way. Their synchrotron light is weak, a few photons a run.
- **Twin paradox**: one twin flies to a wall at 0.8c and back, ageing 0.6 of the home twin's time (√(1 − v²) at the knob's speed). On the traveller's slice, the home clock jumps ahead by 2vd at the turn.
- **Relativistic wheel**: a wheel with rim speed 0.9c, shown at rest and moving at 0.9c, where its spoke bends by about 93°.
- **Bremsstrahlung**: electrons at 0.95c swing past a nucleus of charge 6 and shed forward-beamed light.
- **Kibble–Zurek walls**: the Higgs quench, with no bodies at all. The Measure tab and the caption report the ordered fraction and the wall density, as the walls formed and now.
- **Microlensing**: a mass passes 0.3 Einstein radii from a backdrop star, which splits in two and brightens to a peak magnification of about 3.4.

## Energy and what the drift means

The Measure tab sums rest mass and kinetic, spin, potential, field and radiated energy. Each potential term takes its two-body form: T + V without Relativity or 1PN, the Darwin energy for charges under Relativity, and the EIH, Bažański and scalar Breit energies with 1PN. Radiated energy counts the pools, energy not yet emitted, and escaped radiation.

So the drift is not just numerical error. Only Newtonian gravity and Coulomb, summed pairwise, conserve energy to integrator error, apart from tidal dissipation. Otherwise the drift also carries terms that aren't booked:

- the work done by the gravitational signal-delay toy;
- electric-field energy in transit, and mutual radiation without photons;
- missing three-body EIH terms, and σ³ softening's mismatch with the Darwin energy;
- spin energy lost to tidal torques;
- merger losses with no scalar field on;
- the kinetic energy of Schwinger and shedding leptons;
- field damping, grid viscosity, and the work of the quench and heat bath;
- flat-space field energy, with no field–body gravitational term;
- the expansion ledger's first-order, lagging terms;
- black-hole captures, which keep the infall's kinetic energy without its potential;
- the Barnes–Hut approximation.

## Topology, scope and technical details

The domain has a fixed size, 64 × 64 unless a preset sets its own, and the window is a camera onto it. Its edges are open, a wall, or glued into a torus, Klein bottle or RP², each drawn as its identification diagram on the World tab; Klein and RP² crossings mirror velocity, spin and spoke. Forces use minimum-image displacements.

Worldline is for seeing effects one or a few at a time. Its analytic checks run against the same GPU code, in their own regimes, in the repository's `tests/physics-validation.html`. Several gravities coexist without defining one spacetime: the clocks' lapse, the fields' metric, the holes' pseudo-potential, the thin lens and FRW. Their combinations are not certified, and nothing inside the softening length is.

WebGPU runs and draws everything. There is no CPU fallback, and browsers without WebGPU see a notice. Forces are summed pairwise or through a Barnes–Hut quadtree that the GPU builds every substep from sorted Morton codes, so the same positions always give the same tree. The world-line store grows with the number of bodies. Saves record the domain, each body's proper time and spoke angle, the laws and the parameters, but not fields, bosons or world lines. A lost GPU device is recreated and restored from the latest auto-save, and all state stays in the browser.

## Accessibility

Worldline has keyboard shortcuts, light and dark themes, labelled controls, and numerical readouts for conserved quantities and the selected particle. Under a reduced-motion preference the opening scene starts paused and already tilted, and anyone can pause, single-step or choose a quieter preset.
