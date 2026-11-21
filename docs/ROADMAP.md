# Worldline roadmap

What's next, in order. Each step's physics constraints are in `docs/MODEL.md` (Constraints on new
work). A figure ships when its measured number meets its prediction on the model it runs under, and
earns its place by putting a question no other figure puts; variants of one question share a figure.

## Next: the model (2.5)

1. **A step schedule from the state.** The substep is chosen from the state alone (encounter times,
   |v|/|a|, the gyroperiod, field stiffness, the radiation reaction's time scale) and subdivided
   below the tick where needed; when the budget runs out a frame runs less simulated time and the
   caption says so. The readbacks that make the dynamics frame-rate dependent (a_max, the Friedmann
   density) move to the GPU or to step boundaries. Bitwise reproducibility isn't a goal.
2. **The history's reader as one timelike curve:** position, velocity and acceleration from one
   interpolant, with impulses as segment breaks. Sight reads through it too, so it lands early.
3. **Ratify the regimes** (MODEL.md, Constraints 2) once the open questions below are settled.
4. **Conservative gravity, the kernels and the Higgs action**, energies and momenta in the same
   change:
   - gravity, Yukawa and the dipoles from present positions, gated causally, so Barnes–Hut can
     serve gravity under Relativity and only charges pay the pairwise light-cone cost;
   - N-body EIH from Landau and Lifshitz's Lagrangian (eq. 106.17), whose −½Σm_aΦ_a² term carries
     the whole G² sector in one extra pass (energy +½Σm_aΦ_a²), with the combined theory's leading
     accelerations in the order reduction;
   - a compact kernel exactly 1/r beyond contact, h_ij = R_i + R_j (the GADGET cubic spline), with
     smooth radial and tensor kernels for the velocity-dependent terms;
   - Paczyński–Wiita as one symmetric pair function with capture on a surface where V is finite,
     and energy closed at capture once;
   - the Higgs coupling from one action, its force the derivative of the discrete energy.
   Every preset is retuned, and its physics hash moves.
5. **Radiation and the ledger's columns, each certified independently:** 2.5PN reaction for
   isolated binaries (not every pair: the rotating equilateral triple loses nothing), with its
   Schott column; the electromagnetic self-force by reduced-order Abraham–Lorentz–Dirac; charge
   emission bounded by the area theorem; a charge ledger; vector momentum drift; angular momentum
   shown only on open and walled domains.
6. **The pools' transactional saturation:** a full pool defers an event or keeps a conserved
   reservoir, and a decay never consumes its parent before its products are secured.
7. **The covariance meter:** two headless runs, one boosted, compared event by event per law
   (Newtonian laws miss at O(v²), near-zone PN agrees to its order, Liénard–Wiechert agrees).

## Then: the causal sandbox (3.0)

The live run is the experiment; nothing is kept for later.

- **Picking:** any event or point on a world line, its past and future cones live, and for a pair
  the interval s², Δt and Δx in both coordinates, each line's proper time between them, labels
  (A, B, … and the figure's names) with a pattern beside the accent.
- **The event log:** births, deaths, merges, emissions and absorptions with the four-momentum that
  changed hands, named by (slot, generation), so the plate draws logged events instead of scanning
  samples, and the streak plate shows real light (an observer body's absorptions).
- **Every act is an event** (spawn, delete, edit, a grip's start and end), its future cone drawn
  spreading at c; near-zone gravity doesn't wait for it, and the key says so.
- **Acting:** editing the selection; composing an orbit, binary, ring or thermal cloud
  (Maxwell–Jüttner in the Measure tab); running backwards (Loschmidt), which retraces until chaos and
  departs at radiation order.
- **Fields in spacetime:** a ring of field snapshots so the Higgs's walls sweep out world-sheets.
- New figures: Bell's ships and the rigid ruler, the slingshot twin, Maxwell–Jüttner.

## Later: other spacetimes (3.x)

- **A cosmic string:** a wedge of 8πμ removed and its faces sewn by the holonomy, test bodies and
  light straight in the cut chart, a source behind it seen twice; static first, then moving, then
  Gott's pair as a geometric path explorer (closed timelike curves admit no Cauchy evolution).
- **Black holes as a metric:** Schwarzschild, then equatorial Kerr, for test bodies, light and
  clocks, with the embedding diagram.
- **FRW, measured:** redshift of ticks' light between comoving bodies, horizons, bound against
  expanding systems.
- **Gravitational waves** read at a ring of test masses.
- **Fields carrying energy:** a prescribed charge's pulse, its flux measured over a closed surface
  and balanced against the agent's work.
- Separate projects: varying-α electromagnetism, self-consistent slab gravity, 2PN if an oracle asks.

## Figures to add

The kink's band fronts at c · synchrotron · the antenna (two charges' coherent pattern) · the
binary (Peters' da/dt) · perihelion (6πM/p with 1PN) · near a hole · walls and matter · a fast disk,
seen (Terrell) · the Hubble flow · a cosmic string · Gott's pair. And `?embed&fig=N` to put a live
figure in a9's posts.

## Performance

- The relativistic pair force is O(N²) and arithmetic-bound, about 2.4 ms at 4000 bodies here; past
  it lies a retarded far field from cells' moment histories.
- The heatmap with Relativity (128² cells × N light cones) is the overlay's last hitch, about 9 ms
  at 4000 bodies.
- The torus walk: find why it falls off a cliff near 4000 bodies, then let periodic domains use
  the tree.
- Tried and not worth it: a per-substep uniform ring, fusing a substep's passes (Metal serializes
  them), light-cone hints from the distance alone, observers in Morton order.

## Open questions

- The axion: its name (its coupling here is to F², not E·B), and its pair coupling (a quasistatic
  variable-coefficient solve, a labelled endpoint model, or none).
- The Peccei–Quinn term and the Higgs-modulated Yukawa range: derive or drop.
- Whether photons stay diagnostic or come to act, which needs a field-to-packet conversion.
- Relativistic kinetics near Paczyński–Wiita holes (radii 4.732M, 7.212M) or Newtonian (4M, 6M).
- The first other spacetime: a static cosmic string, or the black-hole metric.
- Whether kugelblitz collapse in dense Hawking gas, at its one-a-frame limit, is the experiment or a
  tuning question.
- Not planned: volumetric 3D, gas, a quantum layer, runs kept for replay, apparatus objects, sound,
  scores, shared universes.
