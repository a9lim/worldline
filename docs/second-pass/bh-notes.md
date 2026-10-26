# Automatic force summation: notes

Working notes for replacing the `barnesHutEnabled` switch with an automatic rule
(2026-10-26). The rule, its constants and the API are in `src/config.js` ("Force summation"),
`GPUPhysics._chooseForceSum()` and AGENTS.md; this file keeps the measurements behind them.

## What the old switch did, from the code

- `_treeWalk = barnesHutEnabled && !relativityEnabled` chose the force pass (`treeForce` or
  `pairForce`) and 1PN's velocity-Verlet recompute (`compute1PNTree` or `compute1PN`). With
  Relativity every force acts pairwise from the world lines whatever the switch.
- `_barnesHutEnabled` alone chose the tree or pairwise pipelines for photon and pion lensing and
  absorption (`_dispatchBosonUpdate`; independent of Relativity) and the heatmap's `useTree`
  (with no signal delay and a non-periodic domain).
- The body tree is built every substep regardless (collisions, hit tests, absorption use it).
- `bhTheta` was already in `SimUniforms` (`gpu-buffers.js` `f[31]`) and `forces-tree.wgsl` read
  it, but both writers passed the literal 0.5. `onePN.wgsl`, `bosons-tree-walk.wgsl`,
  `boson-tree.wgsl` and `heatmap.wgsl` read the generated constant `BH_THETA_SQ`.
- **Boson interaction never needed the switch.** `_dispatchBosonInteraction` builds the bosons'
  own tree (`boson-tree.wgsl` over `tree-items-bosons.wgsl`) and walks that: boson gravity on
  bodies, boson–boson gravity, pion Coulomb, annihilation and kugelblitz all read the boson tree,
  and nothing in it reads `_barnesHutEnabled` or the body tree. The rule in `ui.js`
  (`barneshut-toggle` checked, plus Gravity or Coulomb) is a leftover from when the bosons
  shared the CAS-built body tree (rewritten as sorted trees in 2.2). What Boson interaction
  needs is Gravity or Coulomb, which `pass-graph.js`'s `bosonInteraction` plan leaves to the
  shaders' own guards. Its boson-tree walks keep θ = 0.5 (`BOSON_THETA_SQ`): they have no
  pairwise alternative, so there is no switch for a ramp to make seamless.

## Method

Headless `GPUPhysics` on the oracle page, gravity only, Relativity off, `softening` ε = 8,
masses 0.5–1.5, bodies at rest, seeded. Scenes: uniform on a torus (T; 0.06 bodies per unit²,
so W = √(N/0.06)), uniform open with bounce walls (O), a Gaussian blob open (C) and on a torus
(K; σ = W/6), and a sparse torus (S; 0.015 per unit²). N from 128 to 4096.

- **Error**: one `update(0.001)` per variant on the same state, reading `allForces.f0.xy` (the
  gravity force) of every body; rms of (tree − pairwise) over rms of pairwise. The net force in a
  uniform scene is a small residual of cancelling pulls (rms net force 0.04 on the torus, 0.2
  open), so this is a harsh denominator. Pairwise against itself reads 1e-8.
- **Time**: the force pass's own GPU time (`pairForce` or `treeForce`, `?perf` timestamps on the
  unquantized developer-features Chrome, `GPUProfiler` driven by hand), the median of 30 frames,
  the lowest of 6 rounds interleaving pairwise and the four θ. Whole-step wall time was useless
  here: a step is 0.3–0.6 ms of CPU encoding and the pass is 0.05–0.8 ms, and other lanes
  were running Chrome on the same GPU (the frame span reads 1–3 ms when they were; the
  pass timestamps barely moved). The tree is built every substep either way, so only this pass
  differs between the modes.

Script: `docs/second-pass/tools/tree-vs-pairwise.mjs` (header has the usage); it imports
`GPUPhysics` on the oracle page and sets `treeOverride` / `thetaOverride` per variant.

## Tables

Force-pass GPU time (ms) and rms force error against pairwise, at four opening angles.


Torus, uniform, 0.06 bodies per unit²

| N | W | pair ms | tree θ=0.1 ms | tree θ=0.2 ms | tree θ=0.3 ms | tree θ=0.5 ms | err θ=0.1 | err θ=0.2 | err θ=0.3 | err θ=0.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 128 | 46 | 0.074 | 0.055 | 0.056 | 0.052 | 0.055 | 0.000% | 0.000% | 0.000% | 0.018% |
| 256 | 65 | 0.074 | 0.071 | 0.071 | 0.071 | 0.070 | 0.000% | 0.031% | 0.076% | 0.334% |
| 512 | 92 | 0.075 | 0.089 | 0.084 | 0.091 | 0.091 | 0.009% | 0.060% | 0.216% | 0.532% |
| 1024 | 131 | 0.112 | 0.141 | 0.140 | 0.138 | 0.139 | 0.012% | 0.084% | 0.269% | 0.805% |
| 1536 | 160 | 0.197 | 0.219 | 0.215 | 0.217 | 0.198 | 0.017% | 0.124% | 0.370% | 1.092% |
| 2048 | 185 | 0.277 | 0.308 | 0.273 | 0.265 | 0.243 | 0.020% | 0.145% | 0.459% | 1.271% |
| 3072 | 226 | 0.528 | 0.502 | 0.446 | 0.444 | 0.421 | 0.032% | 0.207% | 0.652% | 1.731% |
| 4096 | 261 | 0.771 | 3.717 | 0.927 | 0.805 | 0.706 | 0.039% | 0.250% | 0.752% | 2.109% |

Open (bounce), uniform, 0.06 per unit²

| N | W | pair ms | tree θ=0.1 ms | tree θ=0.2 ms | tree θ=0.3 ms | tree θ=0.5 ms | err θ=0.1 | err θ=0.2 | err θ=0.3 | err θ=0.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 128 | 46 | 0.068 | 0.052 | 0.052 | 0.052 | 0.052 | 0.001% | 0.021% | 0.048% | 0.091% |
| 256 | 65 | 0.073 | 0.062 | 0.060 | 0.057 | 0.061 | 0.001% | 0.018% | 0.064% | 0.215% |
| 512 | 92 | 0.080 | 0.085 | 0.079 | 0.080 | 0.068 | 0.003% | 0.030% | 0.097% | 0.282% |
| 1024 | 131 | 0.104 | 0.121 | 0.112 | 0.084 | 0.079 | 0.008% | 0.058% | 0.170% | 0.429% |
| 1536 | 160 | 0.186 | 0.132 | 0.118 | 0.102 | 0.085 | 0.010% | 0.068% | 0.203% | 0.507% |
| 2048 | 185 | 0.291 | 0.193 | 0.122 | 0.128 | 0.098 | 0.012% | 0.078% | 0.225% | 0.549% |
| 3072 | 226 | 0.465 | 0.256 | 0.199 | 0.159 | 0.135 | 0.017% | 0.096% | 0.265% | 0.660% |
| 4096 | 261 | 0.762 | 0.349 | 0.238 | 0.211 | 0.183 | 0.020% | 0.105% | 0.290% | 0.741% |

Open, Gaussian blob (σ = W/6), mean 0.06 per unit²

| N | W | pair ms | tree θ=0.1 ms | tree θ=0.2 ms | tree θ=0.3 ms | tree θ=0.5 ms | err θ=0.1 | err θ=0.2 | err θ=0.3 | err θ=0.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 128 | 46 | 0.060 | 0.053 | 0.049 | 0.056 | 0.057 | 0.000% | 0.001% | 0.031% | 0.059% |
| 256 | 65 | 0.070 | 0.066 | 0.065 | 0.067 | 0.063 | 0.001% | 0.008% | 0.037% | 0.126% |
| 512 | 92 | 0.072 | 0.085 | 0.089 | 0.074 | 0.078 | 0.002% | 0.014% | 0.048% | 0.176% |
| 1024 | 131 | 0.097 | 0.126 | 0.124 | 0.116 | 0.132 | 0.007% | 0.041% | 0.128% | 0.350% |
| 1536 | 160 | 0.176 | 0.190 | 0.186 | 0.168 | 0.142 | 0.010% | 0.061% | 0.170% | 0.438% |
| 2048 | 185 | 0.268 | 0.204 | 0.200 | 0.210 | 0.193 | 0.013% | 0.072% | 0.198% | 0.529% |
| 3072 | 226 | 0.530 | 0.328 | 0.277 | 0.248 | 0.232 | 0.016% | 0.091% | 0.236% | 0.631% |
| 4096 | 261 | 0.847 | 0.463 | 0.349 | 0.305 | 0.277 | 0.020% | 0.108% | 0.273% | 0.706% |

Torus, sparse uniform, 0.015 per unit²

| N | W | pair ms | tree θ=0.1 ms | tree θ=0.2 ms | tree θ=0.3 ms | tree θ=0.5 ms | err θ=0.1 | err θ=0.2 | err θ=0.3 | err θ=0.5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 128 | 92 | 0.065 | 0.048 | 0.050 | 0.054 | 0.053 | 0.000% | 0.006% | 0.016% | 0.077% |
| 256 | 131 | 0.066 | 0.065 | 0.066 | 0.065 | 0.065 | 0.000% | 0.019% | 0.092% | 0.309% |
| 512 | 185 | 0.075 | 0.090 | 0.090 | 0.086 | 0.087 | 0.006% | 0.041% | 0.127% | 0.317% |
| 1024 | 261 | 0.102 | 0.149 | 0.134 | 0.150 | 0.136 | 0.010% | 0.066% | 0.213% | 0.782% |
| 1536 | 320 | 0.168 | 0.232 | 0.193 | 0.223 | 0.203 | 0.011% | 0.083% | 0.291% | 0.931% |
| 2048 | 370 | 0.285 | 0.267 | 0.265 | 0.216 | 0.245 | 0.013% | 0.108% | 0.372% | 1.053% |
| 3072 | 453 | 0.512 | 0.519 | 0.442 | 0.401 | 0.374 | 0.018% | 0.134% | 0.445% | 1.298% |
| 4096 | 523 | 0.753 | 5.689 | 6.063 | 5.502 | 5.330 | 0.022% | 0.156% | 0.497% | 1.455% |

Torus, Gaussian blob (σ = W/6), mean 0.06 per unit²

| N | W | pair ms | tree θ=0.1 ms | tree θ=0.3 ms | tree θ=0.5 ms | err θ=0.1 | err θ=0.3 | err θ=0.5 |
|---|---|---|---|---|---|---|---|---|
| 1024 | 131 | 0.071 | 0.109 | 0.107 | 0.101 | 0.005% | 0.095% | 0.255% |
| 1536 | 160 | 0.138 | 0.167 | 0.177 | 0.159 | 0.008% | 0.141% | 0.355% |
| 2048 | 185 | 0.250 | 0.233 | 0.222 | 0.221 | 0.010% | 0.186% | 0.473% |
| 3072 | 226 | 0.449 | 0.386 | 0.356 | 0.360 | 0.015% | 0.221% | 0.544% |
| 4096 | 261 | 0.671 | 0.577 | 0.424 | 0.457 | 0.020% | 0.255% | 0.655% |

## What the tables say

- **Open domain** (O, C): the pairwise pass grows as N² (0.07 ms at 512, 0.76 at 4096); the walk
  at θ = 0.1 equals it at about 1200 (uniform) to 1700 (blob) bodies and is 45–54% under it at 4096.
  At θ = 0.5 it is 0.18 ms at 4096, a quarter of pairwise. The walk's error at θ = 0.1 is 0.01% at
  1536 and 0.02% at 4096; at 0.5, 0.5% and 0.74%.
- **Torus** (T, S, K): the walk never beats pairwise by more than a third inside the cap
  (K at 4096), loses by 10–55% from 512 to 1536, and on uniform scenes at about 4000 bodies it
  falls off a cliff: 3.7–6.4 ms against 0.75 for T at θ = 0.1 and for S at every θ, and not
  every run (T 4096 at θ ≥ 0.3 read 0.7–0.8 in the table's run, 5–6 ms in three others; S at
  4000 slow, at 4090 fast). Not the ring: a longer ring (2560) with a shorter list (256)
  changes nothing. The periodic criterion (`reach < ½ domain`, `forces-tree.wgsl`) opens every
  node near a half-domain plane, and the group's box is large wherever Morton order jumps, so
  it is a candidate, but I did not isolate it. Open work: the torus walk, then revisit
  `TREE_ON_PERIODIC`.
- The error is dominated by the denominator on a torus (net forces cancel); on an open domain the
  nets are 5× larger, and the error at a given θ is the same order.

## The rule

| | |
|---|---|
| `TREE_ON` | 1536 bodies: the open-domain crossover for θ = 0.1 (O 1536: 0.132 vs 0.186 ms; C 1536: 0.190 vs 0.176) |
| `TREE_OFF` | 1152 (¾ of `TREE_ON`; a scene would have to lose a quarter of its bodies to hand back) |
| θ | log-linear in N from `THETA_MIN` 0.1 at 1536 to `THETA_MAX` 0.5 at `TREE_FULL` 4096 (the body cap): 0.22 at 2048, 0.38 at 3072, 0.5 at 4096 |
| error at the switch | 0.010% rms (O and C at 1536, θ = 0.1); the oracle with heavy bodies mixed in reads 0.008% |
| error at the cap | 0.74% (O), 0.71% (C) |
| periodic domain | `TREE_ON_PERIODIC` 8192 / `TREE_OFF_PERIODIC` 6144: pairwise to the cap, for the reasons above |
| Relativity | forces pairwise at any count (`forceSum.tree` false, `byCount` still true) |
| boson tree walks | θ = 0.5, no ramp |

`aliveCount` is the slot high-water mark (dead slots included), the same number every pass is
sized by. The rule runs once per `update()` and on `setToggles()`, so a frame's substeps agree.
Lensing, absorption and the heatmap follow `byCount` with no tuning of their own: not timed
separately (the heatmap's pairwise pass is 128² × N, its tree walk a few dozen nodes a cell;
photon and pion lensing and absorption walks go per boson, up to 16384 + 8192).

## Verification

- Oracle page before: 44 of 44. After: 45 of 45 (the new case included); the tree oracles
  forced through `treeOverride` / `thetaOverride = 0.5` read exactly what they read before
  (600 bodies 0.524%, 4000 bodies 2.09%, spinning 0.000224%, torus seam 0.0000084%, absorption
  tree = pairwise 0.0), and the boson tests pass without `barnesHutEnabled`.
- New oracle: the rule's trace (pairwise just under 1536, tree at 1536, still tree at 1152,
  pairwise at 1151, still pairwise at 1535, tree at 1536), the θ ramp's endpoints and midpoint, a
  torus at the cap staying pairwise, Relativity keeping `tree` false, and at 1536 open bodies
  (six of them heavy) the automatic rule's forces against pairwise: 0.008% rms, under the 0.1% bar.
- App page: Fields overlay with 1800 charged open bodies under radiation and Boson interaction
  (tree heatmap, tree lensing, boson tree), a 2000-body torus, a 2000-body open run with
  Relativity, and a preset: no console errors or warnings; `forceSum` read as expected in each.
  The bench scenarios' overrides take effect (`n500-g-bh` tree at θ 0.1, `n4000-g-bh` tree at
  θ 0.49, the `-pair` ones pairwise).

## Scenario notes

- `-bh` scenarios now pin `treeOverride = 'tree'`, the `-pair` and `fields-grav` ones
  `'pairwise'`; θ is the rule's for that count (0.1 at 500, 0.49 at 4000), where the toggle was
  a fixed 0.5. Numbers in ROADMAP §11 for the 500-body `-bh` rows were at 0.5.
- The scenarios set it by `sim.gpu.physics.treeOverride`, not by the margin's switch, which
  another session removes.
