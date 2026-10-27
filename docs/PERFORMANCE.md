# Worldline performance: what measurement found

The record of Worldline's two performance passes, 2.1 (2026-10-24) and 2.2 (2026-10-25): what
each measured, what it changed, the costs it left, and the ideas that measurement cleared, so
that later work starts from numbers and doesn't retry what already failed. Moved here from
`ROADMAP.md` §3 on 2026-10-27; the roadmap keeps what is still open (its §10), and its gotchas
(§13) say how to read these numbers. The tools are in `docs/second-pass/tools/` (`AGENTS.md`,
Running and checking).

The model pass (2.5, `docs/MODEL.md`) changes the picture these numbers describe: gravity moves to
present positions, so with Relativity on only electromagnetism still reads the world lines pairwise,
and the contact kernel lets bodies close in, which the step control will pay for. Re-run the
standing set after each of its steps.

## 1. 2.1: performance and receipts

The tools: `?perf` (`src/gpu/gpu-profiler.js`) puts a timestamp on every pass and counts
submits, writes and maps per frame; `docs/second-pass/tools/` runs the standing scenarios
(`bench-scenarios.json`, each preset in plane and tilted, Fields, an observer, 500 bodies three
ways, full boson pools, both fields with grid gravity) and compares two trees scenario by
scenario (`bench-ab.mjs`). Numbers are on an M5 Max (40-core GPU) at 1440 × 900 × 2; a base
M-series GPU is taken as about 4× slower, which sets the presets' budgets (`ROADMAP.md` §13 has the
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
scene degenerates into one runaway hole (`MODEL.md` §3.6), so read it as full pools, not as 200 holes.
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
  is 2.4 ms there); the event log (`ROADMAP.md` §7.1) lets the plate draw logged events instead.

Carried forward:
- **Merge events** reach the fields from a frame's last substep only, since each substep's
  collision pass resets the counter; frames almost never take two. The event log (`ROADMAP.md` §7.1) is
  the place to keep them all.
- **The tree build** (`insertParticles`, a lock-free CAS insertion that spins while another
  thread subdivides) costs about 0.65 ms at 500 bodies, as much as the pair forces now. A
  Morton-ordered build (an LBVH) would be faster and deterministic, which replay
  cares about. (2.2 built it, and found the CAS tree had been losing bodies, §2.)
- **Fixed costs in small scenes** (`quadrupoleApply`, `updateColors` near 0.15 ms with eight
  bodies) may be clock ramp-up rather than work; unexamined.

**Caps** (decided by these numbers then, and superseded by 2.2, `ROADMAP.md` §0): 512 bodies and the
pools were to stay through 2.5, since relativistic pairwise cost grows as N². 2.2 measured
that 500 bodies had left most of the GPU idle: the pair force grew sixfold, not 64-fold, from
500 to 4000.

## 2. 2.2: scale

Done 2026-10-25 in one session, at a9's ask for a second performance pass that raises the caps
substantially. Two lanes ran in worktrees (the stats readback; world-line drawing), the rest in
the main tree. The caps went from 512 bodies, 4096 photons and 2048 pions and leptons to 4096,
16384 and 8192.

What measurement found first, with the 2.1 tree's cap raised to 4096 (4000 random bodies on a
torus, M5 Max, as in §1):
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

What changed (`ROADMAP.md` §14 has the commits):
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
  within 8/255. Timed back to back (`ROADMAP.md` §13), the world lines at 4000 bodies cost 6.5 → 3.8 ms
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

What it costs now (§1's M5 Max, 1440×900 at 2×), timed back to back (`bench-b2b.mjs`, `ROADMAP.md` §13:
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
