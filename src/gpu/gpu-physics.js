/**
 * @fileoverview GPUPhysics — WebGPU compute pipeline orchestrator.
 *
 * Phase 2+3+4+5: Full force computation, Boris integrator, tree build, collisions,
 * dead GC, radiation, 1PN VV, boson lifecycle, boson gravity, signal delay history,
 * scalar fields, heatmap, expansion, extremal charge shedding.
 *
 * Dispatch sequence per substep:
 *   1. resetForces (DMA clear)
 *   2. cacheDerived
 *   3. generateGhosts        (Phase 3 — if periodic boundary)
 *   4a-d. treeBuild           (Phase 3 — if BH enabled)
 *   5. computeForces          (Phase 2 pairwise OR Phase 3 tree walk)
 *   5b. externalFields
 *   5c. scalarFieldForces      (Phase 5 — gradient forces + Higgs mass modulation, before Boris)
 *   6-8. borisFused            (halfKick + rotate + halfKick in one pass)
 *   9. spinOrbit
 *  10. applyTorques
 *  11. radiationReaction      (Phase 4 — Larmor, Hawking, pion emission)
 *  12. borisDrift
 *  13. (cosmological expansion: once per frame after the substeps, on a periodic domain)
 *  14. compute1PN_VV          (Phase 4 — 1PN recompute + VV correction kick)
 *  15. scalarFieldEvolve      (Phase 5 — deposit → [self-grav] → KDK → gradients)
 *  17-18. collisions          (Phase 3 — detect + resolve)
 *  19. fieldExcitations       (Phase 5 — merge KE → wave packets)
 *  20. shedExtremalCharge     (Phase 5 — black holes past the extremal limit shed leptons)
 *  21. bosonUpdate            (Phase 4 — photon/pion drift, absorption, decay)
 *  24. boundary
 *
 * Post-substep (once per frame):
 *  - heatmap compute + blur   (Phase 5 — every HEATMAP_INTERVAL frames)
 *  - bosonInteraction         (Phase 4 — build boson tree + particle/boson gravity + pion Coulomb)
 *  - deadParticleGC           (Phase 3)
 *  World lines record at the end of every substep: a sample for every particle when the
 *  substep crosses a WORLDLINE_DT mark, else only merge breaks and new death snapshots.
 *  GPU times are relative to a rolling epoch (gpuTime, _maybeRebaseEpoch).
 *  Under expansion the domain is a × the comoving domain and the world-line clock is
 *  conformal time (cosmology.js, expansion.wgsl).
 */
import { PERF } from './gpu-profiler.js';
import { createParticleBuffers, createWorldLineStore, STORE_TIERS, createUniformBuffer, writeFrameUniforms, writeSubstepUniforms, UNIFORM_DT_OFFSET, UNIFORM_RADIUS_MAX_OFFSET, createFieldBuffers, createGravityGridBuffers, createAtomicGridBuffer, createHeatmapBuffers, createKugelblitzBuffers, createFrameBuffers, FRAME_PARAMS_SIZE, FRAME_STATE_SIZE, FIELD_GRID_RES, PARTICLE_STATE_SIZE, PARTICLE_AUX_SIZE, RADIATION_STATE_SIZE, DERIVED_SIZE, MERGE_RESULT_SIZE } from './gpu-buffers.js';
import { fetchShader, createLensPipeline, createPhase2Pipelines, createGhostGenPipeline, createTreeBuildPipelines, createTreeForcePipeline, createCollisionPipelines, createMergePhotonPipeline, createDeadGCPipeline, createPhase4Pipelines, createFieldDepositPipelines, createFieldEvolvePipelines, createFieldForcesPipelines, createFieldParticleGravPipeline, createFieldGravityPipelines, createFFTPipelines, createFieldExcitationPipeline, createHeatmapPipelines, createExpansionPipeline, createExtremalPipeline, createBosonDispatchArgsPipeline, createUpdateColorsPipeline, createHitTestPipeline, createComputeStatsPipeline, createFrameSlicePipelines } from './gpu-pipelines.js';
import { buildWGSLConstants, FLAG_PRESCRIBED, GRAVITY_BIT, COULOMB_BIT, MAGNETIC_BIT, GRAVITOMAG_BIT, ONE_PN_BIT, RELATIVITY_BIT, SPIN_ORBIT_BIT, RADIATION_BIT, BLACK_HOLE_BIT, EXPANSION_BIT, YUKAWA_BIT, HIGGS_BIT, AXION_BIT, BOSON_INTER_BIT, FIELD_GRAV_BIT_T1, HERTZ_BOUNCE_BIT_T1, WL_STRIDE, WL_META_STRIDE, OBSERVERS_PER_GROUP, STATS_LAYOUT } from './gpu-constants.js';
import { createGPUDispatchPlan, updateGPUDispatchPlan } from './pass-graph.js';
import { WORLDLINE_DT, WORLDLINE_LEN, GPU_MAX_PHOTONS, GPU_MAX_PIONS, GPU_MAX_LEPTONS, GPU_MAX_PARTICLES, GPU_HEATMAP_GRID, HEATMAP_INTERVAL_MASK, COL_MERGE, COL_BOUNCE, BOUND_LOOP, TORUS, COL_NAMES, BOUND_NAMES, TOPO_NAMES, SOFTENING, BH_SOFTENING, SOFTENING_SQ, BH_SOFTENING_SQ, CLOCK_PERIOD, PRESCRIBED_CAP, HIGGS_COUPLING, AXION_COUPLING, BOSON_CHARGE, EPOCH_SPAN, EPOCH_STEP, TREE_ON, TREE_OFF, TREE_ON_PERIODIC, TREE_OFF_PERIODIC, treeTheta, kerrNewmanRadius } from '../config.js';
import { installFieldMethods } from './gpu-fields.js';
import Cosmology, { SCHEDULE_KEYS, slabVolume } from '../cosmology.js';
import { GPU_PARAMETER_SLOTS } from '../physics-contract.js';
import { curveAt, packCurve, isKnown, CURVE_FLOATS } from '../prescribed.js';


const MAX_PARTICLES = GPU_MAX_PARTICLES;
// Keys per workgroup of the tree's bitonic sort (tree-build.wgsl SORT_BLOCK), and bodies per
// workgroup of the Barnes–Hut group walk (forces-tree.wgsl GROUP)
const TREE_SORT_BLOCK = 1024;
const TREE_GROUP = 32;
const PION_POOL_CAP = GPU_MAX_PIONS + GPU_MAX_LEPTONS;
const BOSON_ARGS_PHOTON = 0;
const BOSON_ARGS_PION = 12;
const BOSON_ARGS_TOTAL = 24;
const BOSON_ARGS_NODES = 36;

// A new slot's ink as update-colors.wgsl would give it, so a body spawned while paused
// shows its charge before the first step: sienna positive, prussian negative, graphite
// neutral, the text colour for a black hole
const _hexABGR = (hex) => { const n = parseInt(hex.slice(1), 16); return (0xFF000000 | ((n & 0xFF) << 16) | (n & 0xFF00) | ((n >> 16) & 0xFF)) >>> 0; };
const _DEFAULT_SLATE_ABGR = _hexABGR(window._PALETTE.light.textMuted);
function _inkABGR(charge, dark, hole) {
    const T = dark ? window._PALETTE.dark : window._PALETTE.light;
    if (hole) return _hexABGR(T.text);
    if (charge > 0.5 * BOSON_CHARGE) return _hexABGR(T.inks.sienna);
    if (charge < -0.5 * BOSON_CHARGE) return _hexABGR(T.inks.prussian);
    return _hexABGR(T.textMuted);
}

// Pre-allocated typed arrays for per-frame writeBuffer calls (avoid GC pressure)
const _qtBoundsResetData = new Int32Array([2147483647, 2147483647, -2147483647, -2147483647]);
const _postSubDt = new Float32Array(1); // scratch for writing total dt to uniforms post-substep

// One frame's readback (_encodeFrameReadback), byte offsets: the small counters, then the merge
// results, the kugelblitz event and the free stack
const RB_MAX_ACCEL = 0, RB_GHOSTS = 4, RB_MERGES = 8, RB_KB = 12, RB_FREE_TOP = 16;
const RB_MERGE_RESULTS = 32;
const RB_KB_EVENT = RB_MERGE_RESULTS + MAX_PARTICLES * MERGE_RESULT_SIZE;
const RB_FREE_STACK = RB_KB_EVENT + 64;
const RB_SIZE = RB_FREE_STACK + MAX_PARTICLES * 4;

// Pre-allocated field uniform data (avoids per-substep GC from _writeFieldUniforms)

// Pre-allocated dispatch uniform buffers (avoids per-frame GC from dispatch methods)
const _heatmapUniformData = new ArrayBuffer(96);
const _heatmapUniformF32 = new Float32Array(_heatmapUniformData);
const _heatmapUniformU32 = new Uint32Array(_heatmapUniformData);
const _colorUniformData = new Uint32Array(4);

// Pre-allocated addParticle buffers (avoids per-call allocation)
const _addParticleStateData = new ArrayBuffer(36);  // PARTICLE_STATE_SIZE
const _addParticleStateF32 = new Float32Array(_addParticleStateData);
const _addParticleStateU32 = new Uint32Array(_addParticleStateData);
const _addParticleAuxData = new ArrayBuffer(20);     // PARTICLE_AUX_SIZE
const _addParticleAuxF32 = new Float32Array(_addParticleAuxData);
const _addParticleAuxU32 = new Uint32Array(_addParticleAuxData);
const _addParticleColorData = new Uint32Array(1);
const _addParticleModData = new Float32Array(4);
const _addParticleClockData = new Float32Array(4);   // τ, ring phase, θ, lapse
const _birthSampleData = new Float32Array(12);
const _lensData = new ArrayBuffer(96);               // lens-deflection.wgsl LensParams
const _lensF32 = new Float32Array(_lensData);
const _lensU32 = new Uint32Array(_lensData);
// The lens map's resolution, and each lens's core as a fraction of its R_E², so a ray
// through a body stays finite (the ring radius shifts by 5·10⁻⁵ R_E)
export const LENS_RES = 512;
const LENS_CORE_FRAC = 1e-4;
const LENS_WG = 32;      // cells a lens-deflection.wgsl workgroup covers a side (16 × 16 threads, 2 × 2 cells each)
// Past 512 lenses the map is computed on a grid of side LENS_RES·√(512/lenses) (a multiple of 16, at
// least LENS_MIN_RES) and lensExpand refills the full map, so a dispatch costs about as much at 4000
// lenses as at 512: the sum is res² × lenses interactions
const LENS_WORK = LENS_RES * LENS_RES * 512;
const LENS_MIN_RES = 128;
const PROBE_RES = 1024;   // the probe's ray-shooting grid, finer: magnifications to ~1%
const _ledgerAData = new Float32Array(4);           // boson-ledger.wgsl LedgerA
const _ledgerAU32 = new Uint32Array(_ledgerAData.buffer);
// The energy accounts the stats can't see (stats-display.js): escaped radiation (redshifting),
// escaped leptons (matter), and the work the expansion has done
// (escapedE: culled photons and culled leptons' kinetic energy, both redshifting as 1/a, the
// relativistic law; escapedMatterE: culled leptons' rest mass; escapedP: all their momentum,
// which falls as 1/a at any speed), and the four-momentum the agents driving prescribed bodies
// have added (prescribed.wgsl)
const EMPTY_LEDGER = Object.freeze({ escapedE: 0, escapedPx: 0, escapedPy: 0, escapedMatterE: 0, expansionWork: 0,
                                     agentE: 0, agentPx: 0, agentPy: 0 });
const _curveData = new Float32Array(CURVE_FLOATS);
const _gripData = new Float32Array(2);
const _prescribedListData = new Uint32Array(PRESCRIBED_CAP + 1);
const _pastData = new Float32Array(WORLDLINE_LEN * WL_STRIDE);
const _expansionUniformData = new ArrayBuffer(32);   // ExpansionUniforms
const _expansionUniformF32 = new Float32Array(_expansionUniformData);
const _expansionUniformU32 = new Uint32Array(_expansionUniformData);       // one world-line sample (WL_STRIDE)
const RADIATION_STATE_WORDS = RADIATION_STATE_SIZE / 4;
const _addParticleRadData = new Float32Array(RADIATION_STATE_WORDS);
const _addParticleMetaBuf = new ArrayBuffer(32);       // 8 u32 for wlMeta (WL_META_STRIDE)
const _addParticleMetaU32 = new Uint32Array(_addParticleMetaBuf);
const _addParticleMetaF32 = new Float32Array(_addParticleMetaBuf);
const _zeroU32 = new Uint32Array([0]);                // reusable zero for counter resets
const _retiredFlagU32 = new Uint32Array([2]);         // FLAG_RETIRED for removeParticle
const _frameParamsData = new ArrayBuffer(FRAME_PARAMS_SIZE);
const _frameParamsF32 = new Float32Array(_frameParamsData);
const _frameParamsU32 = new Uint32Array(_frameParamsData);
const _rebaseUniformData = new ArrayBuffer(16);           // shift (f32), slots (u32), pad
const _rebaseUniformF32 = new Float32Array(_rebaseUniformData);
const _rebaseUniformU32 = new Uint32Array(_rebaseUniformData);
const _deathMetaData = new ArrayBuffer(12);           // deathTime(f32), deathMass(f32), deathAngVel(f32)
const _deathMetaF32 = new Float32Array(_deathMetaData);

// Pre-allocated hitTest uniform data (avoids per-call allocation)
const _hitUniformData = new ArrayBuffer(16);
const _hitUniformF32 = new Float32Array(_hitUniformData);
const _hitUniformU32 = new Uint32Array(_hitUniformData);

// Pre-allocated requestStats uniform data (avoids per-call allocation)
const _statsUniformData = new ArrayBuffer(48);
const _statsUniformF32 = new Float32Array(_statsUniformData);
const _statsUniformU32 = new Uint32Array(_statsUniformData);
const _statsUniformI32 = new Int32Array(_statsUniformData);

// FFT stage parameters: one 256-byte uniform record per butterfly stage, written once.
// Stage index = (inverse ? 2·logN : 0) + axis·logN + s.

// Pre-allocated field excitation event data (max 64 events × 4 floats)

// Pre-allocated field vacuum data (reused across _initFieldToVacuum calls)

// Pre-allocated Green's hat upload buffer

// G16: Pre-allocated batch deserialize buffers, for the full particle capacity
// Sized for the full GPU particle capacity so no reallocation is needed.
const _DS_MAX = GPU_MAX_PARTICLES;
const _dsStateData  = new ArrayBuffer(_DS_MAX * 36);  // PARTICLE_STATE_SIZE = 36
const _dsStateF32   = new Float32Array(_dsStateData);
const _dsStateU32   = new Uint32Array(_dsStateData);
const _dsAuxData    = new ArrayBuffer(_DS_MAX * 20);  // PARTICLE_AUX_SIZE = 20
const _dsAuxF32     = new Float32Array(_dsAuxData);
const _dsAuxU32     = new Uint32Array(_dsAuxData);
const _dsColorData  = new Uint32Array(_DS_MAX);        // 4 bytes each
const _dsModData    = new Float32Array(_DS_MAX * 4);   // VEC4_SIZE = 16
const _dsRadData    = new Float32Array(_DS_MAX * RADIATION_STATE_WORDS);
const _dsMetaData   = new ArrayBuffer(_DS_MAX * 32);  // wlMeta: WL_META_STRIDE (8) u32 per particle
const _dsMetaF32    = new Float32Array(_dsMetaData);
const _dsMetaU32    = new Uint32Array(_dsMetaData);
const _dsClockData  = new Float32Array(_DS_MAX * 4);   // clocks: τ, phase, θ, lapse

export default class GPUPhysics {
    /**
     * @param {GPUDevice} device
     * @param {number} domainW
     * @param {number} domainH
     */
    constructor(device, domainW, domainH) {
        this.device = device;
        // The domain as state is comoving; the GPU's is physical, a × comoving
        this.comovingW = domainW;
        this.comovingH = domainH;
        this.domainW = domainW;
        this.domainH = domainH;
        this.cosmology = new Cosmology();
        // What the stats can't see: escaped radiation (culled boson pools, which redshift
        // with everything else) and the energy the expansion has taken (stats-display.js)
        this.ledger = Object.assign({}, EMPTY_LEDGER);
        this.substepsRun = 0;         // substeps since construction (the ?perf profiler reads it)
        this._resetGen = 0;           // reset() count: a frame readback from before one is stale
        this._frameReadback = Array.from({ length: 3 }, (_, k) => ({
            buf: device.createBuffer({ label: 'frameReadback-' + k, size: RB_SIZE, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
            busy: false,
        }));
        this.heatmapRect = { left: 0, top: 0, cellW: 1, cellH: 1 };   // dispatchHeatmap's grid
        this._frameA = null;          // update(): the frame's midpoint a while the substeps run
        this._frameH = 0;             // update(): the Hubble rate the substeps see
        // A stats readback describes the state it was requested in: stateVersion bumps on
        // every add, removal, reset and load, resetGen on resets and loads only
        this.stateVersion = 0;
        this.resetGen = 0;
        this._stepsSinceChange = 0;   // a readback before any step sees stale derived state
        this._peScale = null;         // null until the first readback after a reset
        this._lnrPending = 0;         // ln a accumulated while _peScale is unknown
        this.simTime = 0;
        // The world-line clock: lab time, or conformal time η (dη = dt/a) while the universe
        // expands. GPU times are conformalTime − timeEpoch (gpuTime).
        this.conformalTime = 0;
        this.timeEpoch = 0;
        this.aliveCount = 0;
        // Per-slot generation, bumped whenever addParticle() fills the slot: (slot, generation)
        // names one body across slot reuse (world-line meta word 3)
        this._slotGeneration = new Uint32Array(GPU_MAX_PARTICLES);
        // Prescribed bodies (src/prescribed.js): slot → its curve, t0 on the world-line clock
        this.prescribed = new Map();
        this.held = null;             // the slot the hand holds (grip())
        this._letGo = null;           // a slot let go of, which leaves the list after a step

        // Defaults matching CPU path
        this.boundaryMode = 0;  // despawn
        this.topologyMode = 0;  // torus

        this.buffers = createParticleBuffers(device, MAX_PARTICLES, STORE_TIERS[0]);
        // Expansion's ledger accumulators (expansion.wgsl), read and cleared with the stats
        this._cosmoAccum = device.createBuffer({
            label: 'cosmoAccum', size: 32,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.uniformBuffer = createUniformBuffer(device);

        // Phase 1 pipelines
        this._boundaryPipeline = null;
        this._boundaryBindGroup = null;

        // The tree builds' bounds reset, copied in by the encoder: queue.writeBuffer() happens
        // at queue time (before encoder start), so it can't reset state between two tree
        // builds in the same command buffer
        this._qtBoundsSrc = device.createBuffer({
            label: 'qt-bounds-src',
            size: 16,
            usage: GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true,
        });
        new Int32Array(this._qtBoundsSrc.getMappedRange()).set([2147483647, 2147483647, -2147483647, -2147483647]);
        this._qtBoundsSrc.unmap();

        // Phase 2 pipelines + bind groups
        this._phase2 = null;

        // Phase 3: Ghost generation
        this._ghostGenPipeline = null;
        this._ghostGenBindGroups = null;
        this._ghostCount = 0;

        // Phase 3: Tree build (GPU Barnes-Hut)
        this._treeBuild = null;
        this._treeBuildBindGroups = null;
        // How the bodies' forces are summed (config.js "Force summation"), chosen each frame from
        // the body count by _chooseForceSum() and read by the dispatches and the UI's readout:
        //   byCount  the rule picks the tree at this count; lensing, absorption and the heatmap follow it
        //   tree     the force pass and 1PN's recompute walk the tree: byCount, but not with
        //            Relativity, where every force acts pairwise from the sources' world lines
        //   theta    the opening angle the body tree's walks use at this count
        // treeOverride (null | 'pairwise' | 'tree') and thetaOverride (null | number) pin the rule
        // for oracles and benchmarks; null is the automatic rule.
        this.forceSum = { byCount: false, tree: false, theta: treeTheta(0) };
        this.treeOverride = null;
        this.thetaOverride = null;
        this._treeLatched = false;

        // Phase 3: Tree force (BH tree walk)
        this._treeForcePipeline = null;
        this._treeForceBindGroups = null;

        // Phase 3: Collision detection/resolution
        this._collisionPipelines = null;
        this._collisionBindGroups = null;
        this._mergePhotonPipeline = null;
        this._mergePhotonBindGroup = null;
        this._pendingMergeEvents = [];
        this._pendingKugelblitzEvents = [];

        // Phase 3: Dead particle GC
        this._deadGCPipeline = null;
        this._deadGCBindGroup = null;

        // Phase 4: Advanced physics pipelines
        this._phase4 = null;
        this._phase4BindGroups = {};

        // World lines: the next lab time at which a sample is due
        this._nextWorldLineTime = 0;
        this._frameCount = 0;

        // Phase 4: Toggle state for advanced passes
        this._relativityEnabled = false;
        this._onePNEnabled = false;
        this._radiationEnabled = false;
        this._yukawaEnabled = false;
        this._bosonInterEnabled = false;

        // Toggle state
        this._toggles0 = 0;
        this._toggles1 = 0;
        this._isDarkTheme = document.documentElement.dataset.theme === 'dark';
        this._gravityEnabled = false;
        this._coulombEnabled = false;
        this._magneticEnabled = false;
        this._gravitomagEnabled = false;
        this._spinOrbitEnabled = false;
        this._blackHoleEnabled = false;
        this._yukawaCoupling = 14;
        this._yukawaMu = 0.15;
        this._higgsMass = 0.5;
        this._axionMass = 0.05;
        this._extGravity = 0;
        this._extGravityAngle = 0;
        this._extElectric = 0;
        this._extElectricAngle = 0;
        this._extBz = 0;
        this._cachedExtGx = 0;
        this._cachedExtGy = 0;
        this._cachedExtEx = 0;
        this._cachedExtEy = 0;
        this._bounceFriction = 0.4;
        this._collisionMode = 0;
        this._axionCoupling = AXION_COUPLING;
        this._higgsCoupling = HIGGS_COUPLING;
        this._dispatchPlan = createGPUDispatchPlan();

        // Phase 5: Scalar field buffers (lazy-allocated on first toggle-on)
        this._higgsBuffers = null;
        this._axionBuffers = null;
        this._atomicGrid = null;
        this._heatmapBuffers = null;
        this._excitationBuffers = null;
        this._bosonDispatchArgs = null;
        this._higgsEnabled = false;
        this._axionEnabled = false;
        this._expansionEnabled = false;
        this._hubbleParam = 0.001;
        this._cosmoSchedule = 0;
        this._fieldDamping = 1;
        this._higgsQuench = null;   // setHiggsQuench()
        this._noiseSeed = 0;
        this._heatmapEnabled = false;
        this._heatmapMode = 'all';
        this._heatmapFrame = 0;

        // Phase 5: Pipelines (lazy-initialized)
        this._phase5Ready = false;
        this._fieldDeposit = null;
        this._fieldEvolve = null;
        this._fieldForces = null;
        this._fieldParticleGrav = null;
        this._fieldGravity = null;
        this._fftPipelines = null;
        this._fftParamsBuffer = null;
        this._fftBGs = null;
        this._greenHatKey = null;
        this._gravGrid = null;      // shared gravity grid (lazy, with the first field)
        this._gravBGs = null;
        this._metricPrimed = false; // metricPhiPrev holds a valid previous potential
        this._fieldExcitation = null;
        this._heatmapPipelines = null;
        this._expansionPipeline = null;
        this._extremalPipeline = null;
        this._bosonDispatchArgsPipeline = null;

        // Phase 5: Bind groups (lazy-created per field)
        this._fieldDepositBGs = {};
        this._fieldEvolveBGs = {};
        this._fieldGradBGs = {};
        this._fieldForcesBGs = null;
        this._fieldParticleGravBGs = null;
        this._fieldParticleGravUniform = null;
        this._fieldExcitationBGs = {};
        this._heatmapBGs = null;
        this._heatmapBlurBGs = {};
        this._expansionBG = null;
        this._extremalBGs = null;
        this._bosonDispatchArgsBG = null;

        // Phase 5: FieldUniforms buffer (shared)
        this._fieldUniformBuffer = null;
        this._heatmapUniformBuffer = null;
        // The overlay's atlas reads the potentials, E and the bodies back every heatmap update
        // (src/field-atlas.js): a copy queued after the heatmap passes, mapped after the submit
        this._heatmapStaging = null;
        this._heatmapCopyMeta = null;
        this._heatmapReadPending = false;
        this.heatmapReadback = null;
        this._expansionUniformBuffer = null;

        // Update colors pipeline
        this._updateColorsPipeline = null;
        this._updateColorsBindGroup = null;
        this._colorUniformBuffer = null;

        // Hit test pipeline + buffers
        this._hitTestPipeline = null;
        this._hitTestBindGroup = null;
        this._hitUniformBuffer = null;
        this._hitResultBuffer = null;
        this._hitResultStaging = null;
        this._hitPending = false;
        this._hitResultReady = false;
        this._hitStagingI32 = null;
        this._hitStagingF32 = null;

        // Stats readback (compute-stats.wgsl: per-workgroup partials, then statsReduce)
        this._statsPipelines = null;
        this._statsBindGroup0 = null;
        this._statsBindGroup1 = null;
        this._statsGroup0Layout = null;
        this._statsGroup1Layout = null;
        this._statsUniformBuffer = null;
        this._statsDummyBuffer = null;
        this._statsPending = false;
        this._statsResultReady = false;
        this._statsData = null; // Float32Array(128) from readback
        this._statsDataSel = -1; // the selection _statsData was computed for
        this._statsStagingFlip = false; // double-buffer flip
        this._statsFieldHasHiggs = false;
        this._statsFieldHasAxion = false;

        // Free slot management: CPU-side mirror of GPU free stack
        this._cpuFreeSlots = [];

        // Adaptive substepping state
        this._maxAccel = 0;

        this._ready = false;
    }

    /** Load WGSL shaders and create compute pipelines. Must be called before update(). */
    async init() {
        const wgslConstants = buildWGSLConstants();
        // Fetch shared includes + common.wgsl
        const [sharedStructs, sharedTopo, sharedRng, commonSrc, boundaryWGSL] = await Promise.all([
            fetchShader('shared-structs.wgsl'),
            fetchShader('shared-topology.wgsl'),
            fetchShader('shared-rng.wgsl'),
            fetchShader('common.wgsl'),
            fetchShader('boundary.wgsl'),
        ]);
        const commonWGSL = wgslConstants + '\n' + sharedStructs + '\n' + sharedTopo + '\n' + sharedRng + '\n' + commonSrc;

        // --- Boundary pipeline ---
        const boundaryModule = this.device.createShaderModule({
            label: 'boundary',
            code: commonWGSL + '\n' + boundaryWGSL,
        });

        const boundaryBindGroupLayout = this.device.createBindGroupLayout({
            label: 'boundary',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // particleAux
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // allForces
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // clocks
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // wlMeta (decks)
            ],
        });

        this._boundaryPipeline = this.device.createComputePipeline({
            label: 'boundary',
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [boundaryBindGroupLayout] }),
            compute: { module: boundaryModule, entryPoint: 'main' },
        });

        this._boundaryBindGroup = this.device.createBindGroup({
            label: 'boundary',
            layout: boundaryBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.buffers.particleState } },
                { binding: 2, resource: { buffer: this.buffers.particleAux } },
                { binding: 3, resource: { buffer: this.buffers.allForces } },
                { binding: 4, resource: { buffer: this.buffers.clocks } },
                { binding: 5, resource: { buffer: this.buffers.wlMeta } },
            ],
        });

        // --- All pipelines: fetch shaders in parallel ---
        const [phase2, ghostGen, treeBuild, bosonTreeBuild, treeForce, collisionPipelines, mergePhotons, deadGC, phase4, updateColors, hitTest, computeStats] =
            await Promise.all([
                createPhase2Pipelines(this.device, wgslConstants),
                createGhostGenPipeline(this.device, wgslConstants),
                createTreeBuildPipelines(this.device, wgslConstants, 'bodies'),
                createTreeBuildPipelines(this.device, wgslConstants, 'bosons'),
                createTreeForcePipeline(this.device, wgslConstants),
                createCollisionPipelines(this.device, wgslConstants),
                createMergePhotonPipeline(this.device, wgslConstants),
                createDeadGCPipeline(this.device, wgslConstants),
                createPhase4Pipelines(this.device, wgslConstants),
                createUpdateColorsPipeline(this.device, wgslConstants),
                createHitTestPipeline(this.device, wgslConstants),
                createComputeStatsPipeline(this.device, wgslConstants),
            ]);

        // --- Phase 2 ---
        this._phase2 = phase2;
        this._createPhase2BindGroups();

        // --- Ghost gen ---
        this._ghostGenPipeline = ghostGen.pipeline;
        this._maxRadiusPipeline = ghostGen.maxRadius;
        this._trimGhostsPipeline = ghostGen.trim;
        this._createGhostGenBindGroups(ghostGen.bindGroupLayouts);

        // --- Tree builds: the bodies' (every substep) and the bosons' (boson interaction) ---
        this._treeBuild = treeBuild;
        this._bosonTreeBuild = bosonTreeBuild;
        this._createTreeBuildBindGroups();

        // --- Tree force ---
        this._treeForcePipeline = treeForce.pipeline;
        this._treeForceLayouts = treeForce.bindGroupLayouts;
        this._createTreeForceBindGroups(treeForce.bindGroupLayouts);

        // --- Collision ---
        this._collisionPipelines = collisionPipelines;
        this._createCollisionBindGroups(this._collisionPipelines.bindGroupLayouts);
        this._mergePhotonPipeline = mergePhotons.pipeline;
        this._createMergePhotonBindGroup(mergePhotons.bindGroupLayout);

        // --- Dead GC ---
        this._deadGCPipeline = deadGC.pipeline;
        this._createDeadGCBindGroup(deadGC.bindGroupLayouts);

        // --- Phase 4 ---
        this._phase4 = phase4;
        this._createPhase4BindGroups();

        // --- Update colors ---
        {
            this._updateColorsPipeline = updateColors.pipeline;
            this._colorUniformBuffer = this.device.createBuffer({
                label: 'colorUniforms', size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._updateColorsBindGroup = this.device.createBindGroup({
                label: 'updateColors',
                layout: updateColors.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this._colorUniformBuffer } },
                    { binding: 1, resource: { buffer: this.buffers.particleState } },
                    { binding: 2, resource: { buffer: this.buffers.color } },
                ],
            });
        }

        // --- Hit test ---
        {
            this._hitTestPipeline = hitTest.pipeline;
            this._hitUniformBuffer = this.device.createBuffer({
                label: 'hitUniforms', size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // 12 u32s = 48 bytes: index + mass/charge/radius/vel/angVel/pos + reserved
            this._hitResultBuffer = this.device.createBuffer({
                label: 'hitResult', size: 48,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
            this._hitResultStaging = this.device.createBuffer({
                label: 'hitResultStaging', size: 48,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this._hitTestBindGroup = this.device.createBindGroup({
                label: 'hitTest',
                layout: hitTest.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this._hitUniformBuffer } },
                    { binding: 1, resource: { buffer: this.buffers.qtNodeBuffer } },
                    { binding: 2, resource: { buffer: this.buffers.particleState } },
                    { binding: 3, resource: { buffer: this.buffers.particleAux } },
                    { binding: 4, resource: { buffer: this._hitResultBuffer } },
                    { binding: 5, resource: { buffer: this.buffers.derived } },
                ],
            });
        }

        // --- Compute stats ---
        {
            this._statsPipelines = computeStats.pipelines;
            this._statsGroup0Layout = computeStats.group0Layout;
            this._statsGroup1Layout = computeStats.group1Layout;
            this._statsUniformBuffer = this.device.createBuffer({
                label: 'statsUniforms', size: 48,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._statsDummyBuffer = this.device.createBuffer({
                label: 'statsDummy', size: 4,
                usage: GPUBufferUsage.STORAGE,
            });
            this._statsBindGroup0 = this.device.createBindGroup({
                label: 'computeStats_g0',
                layout: computeStats.group0Layout,
                entries: [
                    { binding: 0, resource: { buffer: this._statsUniformBuffer } },
                    { binding: 1, resource: { buffer: this.buffers.particleState } },
                    { binding: 2, resource: { buffer: this.buffers.derived } },
                    { binding: 3, resource: { buffer: this.buffers.allForces } },
                    { binding: 4, resource: { buffer: this.buffers.statsBuffer } },
                    { binding: 5, resource: { buffer: this.buffers.clocks } },
                ],
            });
            this._statsBindGroup1 = null;
            this._rebuildStatsFieldBindGroup();
            this._ledgerPipelines = computeStats.ledger;
            this._ledgerAUniform = this.device.createBuffer({
                label: 'ledgerA', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._ledgerBindGroup = this.device.createBindGroup({
                label: 'bosonLedger',
                layout: computeStats.ledger.layout,
                entries: [
                    { binding: 0, resource: { buffer: this.buffers.photonPool } },
                    { binding: 1, resource: { buffer: this.buffers.pionPool } },
                    { binding: 2, resource: { buffer: this._cosmoAccum } },
                    { binding: 3, resource: { buffer: this.buffers.statsBuffer } },
                    { binding: 4, resource: { buffer: this.buffers.phCount } },
                    { binding: 5, resource: { buffer: this.buffers.piCount } },
                    { binding: 6, resource: { buffer: this.buffers.particleState } },
                    { binding: 7, resource: { buffer: this.buffers.radiationState } },
                    { binding: 8, resource: { buffer: this._ledgerAUniform } },
                ],
            });
            // Pool compaction packs into scratch pools the size of the pools, then copies back
            this._compactPipeline = computeStats.compact.pipeline;
            this._photonScratch = this.device.createBuffer({
                label: 'photonScratch', size: this.buffers.photonPool.size, usage: GPUBufferUsage.STORAGE,
            });
            this._pionScratch = this.device.createBuffer({
                label: 'pionScratch', size: this.buffers.pionPool.size, usage: GPUBufferUsage.STORAGE,
            });
            this._compactBindGroup = this.device.createBindGroup({
                label: 'bosonCompact',
                layout: computeStats.compact.layout,
                entries: [
                    { binding: 0, resource: { buffer: this.buffers.photonPool } },
                    { binding: 1, resource: { buffer: this.buffers.pionPool } },
                    { binding: 2, resource: { buffer: this.buffers.phCount } },
                    { binding: 3, resource: { buffer: this.buffers.piCount } },
                    { binding: 4, resource: { buffer: this._photonScratch } },
                    { binding: 5, resource: { buffer: this._pionScratch } },
                ],
            });
        }

        await this._initFrames(wgslConstants);
        await this._initLens(wgslConstants);

        this._ready = true;
    }

    // ─── Lensing (lens-deflection.wgsl) ───

    async _initLens(wgslConstants) {
        const d = this.device;
        this.lensBuffers = {
            params: d.createBuffer({ label: 'lensParams', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
            probeParams: d.createBuffer({ label: 'lensProbeParams', size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
            map: d.createBuffer({ label: 'lensMap', size: 2 * LENS_RES * LENS_RES * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }),
            hits: d.createBuffer({ label: 'lensHits', size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }),
            lenses: d.createBuffer({ label: 'lensList', size: this.buffers.maxParticles * 16, usage: GPUBufferUsage.STORAGE }),
            count: d.createBuffer({ label: 'lensCount', size: 4, usage: GPUBufferUsage.STORAGE }),
            staging: d.createBuffer({ label: 'lensHitsStaging', size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        };
        const pl = await createLensPipeline(d, wgslConstants);
        const lb = this.lensBuffers;
        this._lensPipeline = pl.pipeline;
        this._lensShadowPipeline = pl.pipelineShadows;
        this._lensCompactPipeline = pl.compact;
        this._lensExpandPipeline = pl.expand;
        const bg = (params) => d.createBindGroup({
            label: 'lens_g0', layout: pl.layout,
            entries: [params, this.buffers.particleState, lb.map, lb.hits, lb.lenses, lb.count].map((buffer, i) => ({ binding: i, resource: { buffer } })),
        });
        this._lensBG = bg(lb.params);
        this._lensProbeBG = bg(lb.probeParams);
        this._lensPending = false;
        this.lensHits = null;   // the probe's last count, with the cell area and star radius it used
    }

    /**
     * Build the lens map over the rectangle `p` = { left, top, width, height } (lab) for the
     * backdrop distance `p.distance`, and, when `p.star` = { x, y, r } is set, count the
     * probe's rays on a window around the star (read back a frame late into `lensHits`).
     * The window spans 4 R_E either side for the total mass's Einstein radius (`p.massTotal`,
     * else the last stats), a heuristic that holds both images of a single lens out to u ≈ 3.7
     * (beyond, the missed secondary carries under 0.5% of the flux), and at least 20 star
     * radii. `p.generation` tags the result, so a readback from before a change is ignored.
     */
    dispatchLens(p) {
        if (!this._lensPipeline) return;
        const refX = p.left + p.width / 2, refY = p.top + p.height / 2;
        // The map's side: LENS_RES up to LENS_WORK / LENS_RES² lenses, then res² × lenses held at LENS_WORK
        const mapRes = Math.min(LENS_RES, Math.max(LENS_MIN_RES, Math.floor(Math.sqrt(LENS_WORK / Math.max(this.aliveCount, 1)) / 16) * 16));
        const reduced = mapRes < LENS_RES;
        const writeParams = (buf, left, top, w, h, star, countOnly, res, mapOffset = 0) => {
            const f = _lensF32, u = _lensU32;
            f[0] = left; f[1] = top; f[2] = w / res; f[3] = h / res;
            u[4] = res; u[5] = this.aliveCount;
            f[6] = 4 * p.distance;
            f[7] = LENS_CORE_FRAC;
            f[8] = star ? star.x : 0; f[9] = star ? star.y : 0; f[10] = star ? star.r * star.r : 0;
            u[11] = star ? 1 : 0;
            u[12] = this.boundaryMode === BOUND_LOOP ? 1 : 0; u[13] = this.topologyMode;
            f[14] = this.domainW; f[15] = this.domainH;
            u[16] = this._blackHoleEnabled ? 1 : 0; u[17] = countOnly ? 1 : 0;
            f[18] = refX; f[19] = refY;   // both passes take each lens's image nearest the view's centre
            u[20] = mapOffset; u[21] = LENS_RES;
            this.device.queue.writeBuffer(buf, 0, _lensData);
        };
        writeParams(this.lensBuffers.params, p.left, p.top, p.width, p.height, null, false, mapRes, reduced ? LENS_RES * LENS_RES : 0);
        const enc = this.device.createCommandEncoder({ label: 'lens' });
        enc.clearBuffer(this.lensBuffers.hits);
        const pass = enc.beginComputePass({ label: 'lensDeflection' });
        // The live lenses once, for the map and the probe alike (the params agree on the image)
        pass.setPipeline(this._lensCompactPipeline);
        pass.setBindGroup(0, this._lensBG);
        pass.dispatchWorkgroups(1);
        const sumPipeline = this._blackHoleEnabled ? this._lensShadowPipeline : this._lensPipeline;
        pass.setPipeline(sumPipeline);
        pass.dispatchWorkgroups(Math.ceil(mapRes / LENS_WG), Math.ceil(mapRes / LENS_WG));
        if (reduced) {
            pass.setPipeline(this._lensExpandPipeline);
            pass.dispatchWorkgroups(LENS_RES / 16, LENS_RES / 16);
            pass.setPipeline(sumPipeline);
        }
        let cellArea = 0;
        if (p.star) {
            const mTot = p.massTotal ?? (this._statsData ? Math.max(this._statsData[8], 0) : 1);
            const half = Math.max(4 * Math.sqrt(4 * mTot * p.distance), 20 * p.star.r);
            writeParams(this.lensBuffers.probeParams, p.star.x - half, p.star.y - half, 2 * half, 2 * half, p.star, true, PROBE_RES);
            cellArea = (2 * half / PROBE_RES) ** 2;
            pass.setBindGroup(0, this._lensProbeBG);
            pass.dispatchWorkgroups(PROBE_RES / LENS_WG, PROBE_RES / LENS_WG);
        }
        pass.end();
        const readHits = p.star && !this._lensPending;
        if (readHits) enc.copyBufferToBuffer(this.lensBuffers.hits, 0, this.lensBuffers.staging, 0, 4);
        this.device.queue.submit([enc.finish()]);
        if (!readHits) return;
        this._lensPending = true;
        const r = p.star.r, t = this.simTime, generation = p.generation ?? 0;
        this.lensBuffers.staging.mapAsync(GPUMapMode.READ).then(() => {
            const n = new Uint32Array(this.lensBuffers.staging.getMappedRange().slice(0))[0];
            this.lensBuffers.staging.unmap();
            this._lensSeq = (this._lensSeq ?? 0) + 1;
            this.lensHits = { hits: n, magnification: n * cellArea / (Math.PI * r * r), t, generation, seq: this._lensSeq };
        }).catch(() => {}).finally(() => { this._lensPending = false; });
    }

    // ─── Frames (frame-slice.wgsl) ───

    async _initFrames(wgslConstants) {
        this.frameBuffers = createFrameBuffers(this.device, this.buffers.maxParticles);
        this._framePipelines = await createFrameSlicePipelines(this.device, wgslConstants);
        this._createFrameBindGroups();
        this._frameStatePending = false;
        this._frameStateLatest = null;
    }

    _createFrameBindGroups() {
        const pl = this._framePipelines;
        const fb = this.frameBuffers;
        const b = this.buffers;
        this._frameBG0 = this.device.createBindGroup({
            label: 'frameSlice_g0', layout: pl.bindGroupLayouts[0],
            entries: [fb.frameParams, fb.frameState, b.particleState, b.particleAux, b.wlData, b.wlMeta]
                .map((buffer, i) => ({ binding: i, resource: { buffer } })),
        });
        this._frameBG1 = this.device.createBindGroup({
            label: 'frameSlice_g1', layout: pl.bindGroupLayouts[1],
            entries: [fb.viewState, fb.viewAux, fb.viewDerived, fb.viewClocks]
                .map((buffer, i) => ({ binding: i, resource: { buffer } })),
        });
    }

    /**
     * Slice every world line on the observer's hyperplane (frames.js builds `p`), writing the
     * view buffers the renderer draws in a non-lab frame. Times in `p` are lab times.
     */
    sliceFrame(p) {
        if (!this._framePipelines || this.aliveCount === 0) return;
        const f = _frameParamsF32, u = _frameParamsU32;
        u[0] = p.kind; u[1] = Math.max(0, p.slot | 0); u[2] = p.lorentz ? 1 : 0; u[3] = p.images;
        f[4] = p.boostX; f[5] = p.boostY; f[6] = p.originX; f[7] = p.originY;
        f[8] = p.refT - this.timeEpoch; f[9] = this.gpuTime; f[10] = p.lookBack; f[11] = p.omega;
        f[12] = p.viewX; f[13] = p.viewY; f[14] = p.viewHalfW; f[15] = p.viewHalfH;
        u[16] = this.aliveCount; f[17] = this.domainW; f[18] = this.domainH;
        u[19] = this.boundaryMode === BOUND_LOOP ? 1 : 0; u[20] = this.topologyMode;
        f[21] = WORLDLINE_LEN * WORLDLINE_DT - 1;   // lag cap: the recorded history
        f[22] = 0; f[23] = 0;
        this.device.queue.writeBuffer(this.frameBuffers.frameParams, 0, _frameParamsData);

        const encoder = this.device.createCommandEncoder({ label: 'frameSlice' });
        const pass = encoder.beginComputePass({ label: 'frameSlice' });
        pass.setBindGroup(0, this._frameBG0);
        pass.setBindGroup(1, this._frameBG1);
        pass.setPipeline(this._framePipelines.frameAnchor);
        pass.dispatchWorkgroups(1);
        pass.setPipeline(this._framePipelines.sliceWorldLines);
        pass.dispatchWorkgroups(Math.ceil(this.aliveCount * p.images / 64));
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this._readbackFrameState();
    }

    /** The observer's state (lag, u, γ, validity) for the HUD, a frame late. */
    _readbackFrameState() {
        if (this._frameStatePending) return;
        this._frameStatePending = true;
        if (!this._frameStateStaging) {
            this._frameStateStaging = this.device.createBuffer({
                label: 'frameStateStaging', size: FRAME_STATE_SIZE,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
        }
        const staging = this._frameStateStaging;
        const enc = this.device.createCommandEncoder({ label: 'frameStateReadback' });
        enc.copyBufferToBuffer(this.frameBuffers.frameState, 0, staging, 0, FRAME_STATE_SIZE);
        this.device.queue.submit([enc.finish()]);
        staging.mapAsync(GPUMapMode.READ).then(() => {
            const f = new Float32Array(staging.getMappedRange().slice(0));
            staging.unmap();
            this._frameStateLatest = {
                ux: f[0], uy: f[1], gamma: f[2], tA: f[3] + this.timeEpoch,
                xA: [f[4], f[5]], aNow: [f[6], f[7]], phi: f[8], lag: f[9],
                lorentz: f[10] > 0.5, valid: f[11] > 0.5, omega: f[12], images: f[13], kind: f[17],
            };
        }).catch(() => {}).finally(() => { this._frameStatePending = false; });
    }

    readFrameState() { return this._frameStateLatest; }

    /** Map `copies` ([buffer, offset, bytes]) into one staging buffer; resolves to an ArrayBuffer. */
    async _readRanges(copies, label) {
        const total = copies.reduce((n, c) => n + c[2], 0);
        if (total === 0) return new ArrayBuffer(0);
        const staging = this.device.createBuffer({ label, size: total, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const enc = this.device.createCommandEncoder({ label });
        let at = 0;
        for (const [buf, offset, bytes] of copies) { enc.copyBufferToBuffer(buf, offset, staging, at, bytes); at += bytes; }
        this.device.queue.submit([enc.finish()]);
        try {
            await staging.mapAsync(GPUMapMode.READ);
            return staging.getMappedRange().slice(0);
        } finally {
            if (staging.mapState === 'mapped') staging.unmap();
            staging.destroy();
        }
    }

    /** Every slot's ParticleState and world-line meta: { n, state (ArrayBuffer), meta (Uint32Array) }. */
    async readSlotsSnapshot() {
        const n = this.aliveCount;
        const raw = await this._readRanges([
            [this.buffers.particleState, 0, n * PARTICLE_STATE_SIZE],
            [this.buffers.wlMeta, 0, n * WL_META_STRIDE * 4],
        ], 'slotsSnapshot');
        return { n, state: raw.slice(0, n * PARTICLE_STATE_SIZE), meta: new Uint32Array(raw, n * PARTICLE_STATE_SIZE) };
    }

    /**
     * The world-line rings and meta of `slots`, with the epoch they were read at:
     * { epoch, meta: Uint32Array[slot meta], rings: Float32Array[WL_LEN·WL_STRIDE] per slot }.
     */
    async readWorldLines(slots) {
        const ringBytes = WORLDLINE_LEN * WL_STRIDE * 4;
        const metaBytes = WL_META_STRIDE * 4;
        const copies = [];
        for (const s of slots) copies.push([this.buffers.wlMeta, s * metaBytes, metaBytes]);
        for (const s of slots) copies.push([this.buffers.wlData, s * ringBytes, ringBytes]);
        const epoch = this.timeEpoch;
        const raw = await this._readRanges(copies, 'worldLines');
        const k = slots.length;
        return {
            epoch,
            meta: slots.map((_, i) => new Uint32Array(raw, i * metaBytes, WL_META_STRIDE)),
            rings: slots.map((_, i) => new Float32Array(raw, k * metaBytes + i * ringBytes, WORLDLINE_LEN * WL_STRIDE)),
        };
    }

    _createPhase2BindGroups() {
        const b = this.buffers;
        const p2 = this._phase2;

        // Helper to create a bind group from layout + buffer list
        const bg = (label, layout, buffers) =>
            this.device.createBindGroup({
                label,
                layout,
                entries: buffers.map((buf, i) => ({ binding: i, resource: { buffer: buf } })),
            });

        // cacheDerived: uniforms + particleState (packed) + derived + particleAux + axYukMod
        this._bg_cacheDerived = bg('cacheDerived', p2.cacheDerived.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.derived, b.particleAux, b.axYukMod]);

        // pairForce: 4 bind groups (packed structs)
        this._bg_pairForce0 = bg('pairForce_g0', p2.pairForce.bindGroupLayouts[0],
            [this.uniformBuffer]);
        this._bg_pairForce1 = bg('pairForce_g1', p2.pairForce.bindGroupLayouts[1],
            [b.particleState, b.derived, b.particleAux]);
        this._bg_pairForce2 = bg('pairForce_g2', p2.pairForce.bindGroupLayouts[2],
            [b.allForces, b.maxAccelBuffer]);
        // Group 3: world lines (signal delay) and the per-pair light-cone hints
        this._bg_pairForce3 = bg('pairForce_g3', p2.pairForce.bindGroupLayouts[3],
            [b.wlData, b.wlMeta, b.wlHints]);

        // externalFields (packed particleState + allForces)
        this._bg_extFields = bg('extFields', p2.externalFields.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.allForces]);

        // borisFused (halfKick + rotate + halfKick in one pass)
        this._bg_borisFused = bg('borisFused', p2.borisFused.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.allForces]);

        // borisDrift (writes vel to derived, reads/writes particleState + allForces for display force reconstruction)
        this._bg_drift = bg('drift', p2.borisDrift.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.derived, b.allForces]);

        // spinOrbit (packed particleState, derived, allForces)
        this._bg_spinOrbit = bg('spinOrbit', p2.spinOrbit.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.derived, b.allForces]);

        // applyTorques (reads from particleState, allForces, writes derived)
        this._bg_torques = bg('torques', p2.applyTorques.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.allForces, b.derived]);

        // saveF1pn (save 1PN forces before Boris kick for VV correction)
        this._bg_saveF1pn = bg('saveF1pn', p2.saveF1pn.bindGroupLayouts[0],
            [this.uniformBuffer, b.allForces, b.f1pnOld, b.particleState]);
    }

    /**
     * Create bind groups for ghost generation pipeline.
     * Ghost output arrays are views into the same SoA buffers at offset = aliveCount.
     * Since ghost writes use atomicAdd for slot allocation, the output buffers are the
     * SAME buffers as input but the shader writes starting at the ghost slot offset.
     */
    _createGhostGenBindGroups(layouts) {
        const b = this.buffers;
        const bg = (label, layout, entries) =>
            this.device.createBindGroup({
                label,
                layout,
                entries: entries.map((buf, i) => ({ binding: i, resource: { buffer: buf } })),
            });

        // Group 0: read-only particle state (packed struct)
        const group0 = bg('ghostGen_g0', layouts[0],
            [b.particleState]);

        // Group 1: ghost output + derived inputs/outputs + aux
        const group1 = bg('ghostGen_g1', layouts[1],
            [b.ghostState, b.ghostAux, b.derived, b.ghostDerived, b.particleAux]);

        // Group 2: ghostCounter + uniforms + ghostOriginalIdx + radiusMax
        const group2 = bg('ghostGen_g2', layouts[2],
            [b.ghostCounter, this.uniformBuffer, b.ghostOriginalIdx, b.radiusMax]);

        this._ghostGenBindGroups = [group0, group1, group2];
    }

    /**
     * Ghost slots copied in after the alive slots each substep: as many as the bodies can make
     * (eight a body, its four edges and four corners, in a domain no wider than two margins),
     * up to the ghost buffer, since the host learns a substep's count only a frame later, and
     * trimGhosts clears the slots past the substep's own count (sizing by the last count missed
     * ghosts the moment it grew). Every pass over the ghost slots, the trees' among them, is
     * sized by this, so a small scene on a torus doesn't scan the whole buffer. 0 off a
     * periodic boundary.
     */
    _ghostSlots() {
        return this.boundaryMode === BOUND_LOOP ? Math.min(MAX_PARTICLES, 8 * this.aliveCount) : 0;
    }

    /**
     * Grow the world lines and the light-cone hints to hold `slots` slots: the next tier up
     * (STORE_TIERS), the rings copied to the same offsets (a slot's ring doesn't move), the hints
     * new and empty, and every bind group that reads either rebuilt. The store is 48 KB a slot,
     * so allocating it for the cap up front would cost every page 200 MB. False past the cap.
     */
    _growStore(slots) {
        const b = this.buffers;
        if (slots <= b.storeCapacity) return true;
        const cap = STORE_TIERS.find((t) => t >= slots);
        if (!cap) return false;
        this._resizeStore(cap, true);
        return true;
    }

    /** Replace the store with one of `cap` slots, keeping the rings when `keep` (reset() doesn't). */
    _resizeStore(cap, keep) {
        const b = this.buffers;
        const store = createWorldLineStore(this.device, cap);
        if (keep) {
            const enc = this.device.createCommandEncoder({ label: 'growStore' });
            enc.copyBufferToBuffer(b.wlData, 0, store.wlData, 0, Math.min(b.wlData.size, store.wlData.size));
            this.device.queue.submit([enc.finish()]);
        }
        b.wlData.destroy();
        b.wlHints.destroy();
        b.wlData = store.wlData;
        b.wlHints = store.wlHints;
        b.storeCapacity = cap;
        this._createPhase2BindGroups();
        this._createPhase4BindGroups();
        this._createTreeForceBindGroups(this._treeForceLayouts);
        if (this._framePipelines) this._createFrameBindGroups();
        this._heatmapBGs = null;
        this.syncUniforms();
        if (this.onStoreGrown) this.onStoreGrown(b);
    }

    /**
     * Before the tree build: the largest body radius (into SimUniforms.radiusMax for the
     * collision search), then on a periodic boundary the ghosts, copied into the main arrays
     * after the alive slots.
     */
    _dispatchGhostGen(encoder) {
        const b = this.buffers;
        const loop = this.boundaryMode === BOUND_LOOP;
        if (!loop) this._ghostCount = 0;
        const ghostSlots = this._ghostSlots();

        encoder.clearBuffer(b.radiusMax, 0, 4);
        if (loop) encoder.clearBuffer(b.ghostCounter, 0, 4);

        const pass = encoder.beginComputePass({ label: 'ghostGen' });
        pass.setBindGroup(0, this._ghostGenBindGroups[0]);
        pass.setBindGroup(1, this._ghostGenBindGroups[1]);
        pass.setBindGroup(2, this._ghostGenBindGroups[2]);
        pass.setPipeline(this._maxRadiusPipeline);
        pass.dispatchWorkgroups(Math.ceil(this.aliveCount / 64));
        if (loop) {
            pass.setPipeline(this._ghostGenPipeline);
            pass.dispatchWorkgroups(Math.ceil(this.aliveCount / 64));
            pass.setPipeline(this._trimGhostsPipeline);
            pass.dispatchWorkgroups(Math.ceil(ghostSlots / 64));
        }
        pass.end();
        encoder.copyBufferToBuffer(b.radiusMax, 0, this.uniformBuffer, UNIFORM_RADIUS_MAX_OFFSET, 4);

        // Copy ghost data from dedicated buffers into main arrays at offset aliveCount
        const ghostCount = ghostSlots;
        if (ghostCount > 0) {
            // Copy packed ParticleState structs (36 bytes per element)
            const stateOffset = this.aliveCount * PARTICLE_STATE_SIZE;
            const stateBytes = ghostCount * PARTICLE_STATE_SIZE;
            encoder.copyBufferToBuffer(b.ghostState, 0, b.particleState, stateOffset, stateBytes);
            // Copy packed ParticleAux structs (20 bytes per element)
            const auxOffset = this.aliveCount * PARTICLE_AUX_SIZE;
            const auxBytes = ghostCount * PARTICLE_AUX_SIZE;
            encoder.copyBufferToBuffer(b.ghostAux, 0, b.particleAux, auxOffset, auxBytes);
            // Copy ParticleDerived structs (32 bytes per element)
            const derivedOffset = this.aliveCount * DERIVED_SIZE;
            const derivedBytes = ghostCount * DERIVED_SIZE;
            encoder.copyBufferToBuffer(b.ghostDerived, 0, b.derived, derivedOffset, derivedBytes);
        }
    }

    /**
     * Create bind groups for tree build pipelines.
     * All 4 entry points share the same bind group layouts.
     */
    _createTreeBuildBindGroups() {
        const b = this.buffers;
        const bg = (label, layout, entries) => this.device.createBindGroup({
            label, layout, entries: entries.map((resource, binding) => ({ binding, resource })),
        });

        // The sort network's steps, one 256-byte entry each, picked by dynamic offset (a
        // writeBuffer per step would land before the whole encoder): entry 0 is unused; then
        // for each width k past a block, its steps j ≥ SORT_BLOCK and its in-block merge (j = 0)
        const steps = [[0, 0]];
        for (let k = 2 * TREE_SORT_BLOCK; k <= Math.max(b.TREE_KEYS, b.BOSON_TREE_KEYS); k *= 2) {
            for (let j = k / 2; j >= TREE_SORT_BLOCK; j /= 2) steps.push([k, j]);
            steps.push([k, 0]);
        }
        const table = new Uint32Array(steps.length * 64);
        steps.forEach(([k, j], i) => { table[i * 64] = k; table[i * 64 + 1] = j; });
        this._treeSortParams = this.device.createBuffer({
            label: 'treeSortParams', size: table.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this._treeSortParams, 0, table);
        this._treeSortSteps = steps;

        // Groups 0–3, and treePlan's group 3, which binds the plan's records in place of the radix
        // nodes: a dispatch can't read its size from a buffer it may write
        const groups = (label, t, nodes, count, bounds, items, keys, radix, plan) => {
            const L = t.bindGroupLayouts;
            const params = { buffer: this._treeSortParams, size: 16 };
            return [
                bg(label + '_g0', L[0], [{ buffer: nodes }, { buffer: count }, { buffer: bounds }]),
                bg(label + '_g1', L[1], items.map((buffer) => ({ buffer }))),
                bg(label + '_g2', L[2], [{ buffer: this.uniformBuffer }]),
                bg(label + '_g3', L[3], [{ buffer: keys }, { buffer: radix }, params]),
                bg(label + '_g3plan', L[3], [{ buffer: keys }, { buffer: plan }, params]),
            ];
        };
        this._treeBuildBGs = groups('treeBuild', this._treeBuild, b.qtNodeBuffer, b.qtNodeCounter, b.qtBoundsBuffer,
            [b.particleState, b.derived, b.particleAux], b.treeKeys, b.treeRadix, b.treePlan);
        this._bosonTreeBuildBGs = groups('bosonTreeBuild', this._bosonTreeBuild, b.bosonTreeNodes, b.bosonTreeCounter,
            b.bosonTreeBounds, [b.photonPool, b.phCount, b.pionPool, b.piCount],
            b.bosonTreeKeys, b.bosonTreeRadix, b.bosonTreePlan);
    }

    /**
     * Create bind groups for tree force (BH walk) pipeline.
     * Group 0: nodes (read-only) + uniforms
     * Group 1: particle SoA (15 read-only) + ghostOriginalIdx
     * Group 2: force accumulators (5 read-write)
     */
    _createTreeForceBindGroups(layouts) {
        const b = this.buffers;

        // Group 0: tree nodes + uniforms
        this._treeForceGroup0 = this.device.createBindGroup({
            label: 'treeForce_g0',
            layout: layouts[0],
            entries: [
                { binding: 0, resource: { buffer: b.qtNodeBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } },
            ],
        });

        // Group 1: packed particle structs + derived + axYukMod
        this._treeForceGroup1 = this.device.createBindGroup({
            label: 'treeForce_g1',
            layout: layouts[1],
            entries: [
                { binding: 0, resource: { buffer: b.particleState } },
                { binding: 1, resource: { buffer: b.treeKeys } },
                { binding: 2, resource: { buffer: b.derived } },
                { binding: 3, resource: { buffer: b.qtNodeCounter } },
            ],
        });

        // Group 2: allForces + maxAccel (radiationState removed — jerk now in AllForces)
        this._treeForceGroup2 = this.device.createBindGroup({
            label: 'treeForce_g2',
            layout: layouts[2],
            entries: [
                { binding: 0, resource: { buffer: b.allForces } },
                { binding: 1, resource: { buffer: b.maxAccelBuffer } },
            ],
        });

        // Group 3: world lines (signal delay)
        this._treeForceGroup3 = this.device.createBindGroup({
            label: 'treeForce_g3',
            layout: layouts[3],
            entries: [
                { binding: 0, resource: { buffer: b.wlData } },
                { binding: 1, resource: { buffer: b.wlMeta } },
            ],
        });
    }

    /**
     * Create bind groups for collision detection/resolution pipelines.
     * Both detectCollisions and resolveCollisions share the same layout.
     */
    _createCollisionBindGroups(layouts) {
        const b = this.buffers;

        // Group 0: tree nodes (read-only) + uniforms
        this._collisionBG0 = this.device.createBindGroup({
            label: 'collision_g0',
            layout: layouts[0],
            entries: [
                { binding: 0, resource: { buffer: b.qtNodeBuffer } },
                { binding: 1, resource: { buffer: this.uniformBuffer } },
            ],
        });

        // Group 1: packed particle structs + ghost mapping + allForces (contact torque)
        this._collisionBG1 = this.device.createBindGroup({
            label: 'collision_g1',
            layout: layouts[1],
            entries: [
                { binding: 0, resource: { buffer: b.particleState } },
                { binding: 1, resource: { buffer: b.particleAux } },
                { binding: 2, resource: { buffer: b.ghostOriginalIdx } },
                { binding: 3, resource: { buffer: b.allForces } },
                { binding: 4, resource: { buffer: b.collisionClaims } },
            ],
        });

        // Group 2: collision pairs + counters + merge results
        this._collisionBG2 = this.device.createBindGroup({
            label: 'collision_g2',
            layout: layouts[2],
            entries: [
                { binding: 0, resource: { buffer: b.collisionPairBuffer } },
                { binding: 1, resource: { buffer: b.collisionPairCounter } },
                { binding: 2, resource: { buffer: b.mergeResultBuffer } },
                { binding: 3, resource: { buffer: b.mergeResultCounter } },
            ],
        });
    }

    _createMergePhotonBindGroup(layout) {
        const b = this.buffers;
        this._mergePhotonBindGroup = this.device.createBindGroup({
            label: 'mergePhotons_g0',
            layout,
            entries: [
                { binding: 0, resource: { buffer: b.mergeResultBuffer } },
                { binding: 1, resource: { buffer: b.mergeResultCounter } },
                { binding: 2, resource: { buffer: b.photonPool } },
                { binding: 3, resource: { buffer: b.phCount } },
            ],
        });
    }

    /**
     * Create bind group for dead particle GC pipeline.
     */
    _createDeadGCBindGroup(layouts) {
        const b = this.buffers;
        this._deadGCBindGroup = this.device.createBindGroup({
            label: 'deadGC_g0',
            layout: layouts[0],
            entries: [
                { binding: 0, resource: { buffer: b.particleState } },
                { binding: 1, resource: { buffer: b.particleAux } },
                { binding: 2, resource: { buffer: this.uniformBuffer } },
                { binding: 3, resource: { buffer: b.freeStack } },
                { binding: 4, resource: { buffer: b.freeTop } },
            ],
        });
    }

    /**
     * Create bind groups for all Phase 4 pipelines.
     */
    _createPhase4BindGroups() {
        const b = this.buffers;
        const p4 = this._phase4;
        const bg = (label, layout, buffers) =>
            this.device.createBindGroup({
                label,
                layout,
                entries: buffers.map((buf, i) => ({ binding: i, resource: { buffer: buf } })),
            });

        // ── World lines and clocks ──
        this._phase4BindGroups.worldLineG0 = bg('worldline_g0', p4.recordWorldLines.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.allForces, b.clocks, b.particleAux]);
        this._rebaseUniformBuffer ??= this.device.createBuffer({
            label: 'worldlineRebaseUniforms', size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._phase4BindGroups.rebaseG0 = bg('worldlineRebase_g0', p4.rebaseWorldLines.bindGroupLayouts[0],
            [this._rebaseUniformBuffer, b.wlData, b.wlMeta, b.particleAux]);
        this._phase4BindGroups.worldLineG1 = bg('worldline_g1', p4.recordWorldLines.bindGroupLayouts[1],
            [b.wlData, b.wlMeta]);
        this._phase4BindGroups.clocksG0 = bg('clocks_g0', p4.advanceClocks.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.derived, b.allForces, b.clocks]);
        this._phase4BindGroups.prescribedG0 = bg('prescribed_g0', p4.applyPrescribed.bindGroupLayouts[0],
            [this.uniformBuffer, b.particleState, b.allForces, b.clocks, b.derived, b.wlMeta,
             b.curves, b.prescribedList, b.agentAccum]);

        // ── 1PN (compute1PN + vvKick1PN share bind groups) ──
        this._phase4BindGroups.onePNG0 = bg('onePN_g0', p4.compute1PN.bindGroupLayouts[0],
            [this.uniformBuffer]);
        this._phase4BindGroups.onePNG1 = bg('onePN_g1', p4.compute1PN.bindGroupLayouts[1],
            [b.particleState, b.derived]);
        this._phase4BindGroups.onePNG2 = bg('onePN_g2', p4.compute1PN.bindGroupLayouts[2],
            [b.allForces, b.f1pnOld]);
        this._phase4BindGroups.onePNG3 = bg('onePN_g3', p4.compute1PN.bindGroupLayouts[3],
            [b.wlData, b.wlMeta]);

        // ── 1PN Tree Walk (compute1PNTree — shares G0, G2 with pairwise) ──
        this._phase4BindGroups.onePNTreeG1 = bg('onePNTree_g1', p4.compute1PNTree.bindGroupLayouts[1],
            [b.particleState, b.derived]);
        this._phase4BindGroups.onePNTreeG3 = bg('onePNTree_g3', p4.compute1PNTree.bindGroupLayouts[3],
            [b.wlData, b.wlMeta, b.qtNodeBuffer]);

        // ── Radiation (larmorRadiation, hawkingRadiation, pionEmission share bind groups) ──
        this._phase4BindGroups.radG0 = bg('radiation_g0', p4.larmorRadiation.bindGroupLayouts[0],
            [this.uniformBuffer]);
        // Group 1: packed particle state + aux + derived + allForces + radiationState
        this._phase4BindGroups.radG1 = bg('radiation_g1', p4.larmorRadiation.bindGroupLayouts[1],
            [b.particleState, b.particleAux, b.derived, b.allForces, b.radiationState]);
        // Group 2: photon pool (packed) + phCount
        this._phase4BindGroups.radG2 = bg('radiation_g2', p4.larmorRadiation.bindGroupLayouts[2],
            [b.photonPool, b.phCount]);
        // Group 3: pion pool (packed) + piCount
        this._phase4BindGroups.radG3 = bg('radiation_g3', p4.larmorRadiation.bindGroupLayouts[3],
            [b.pionPool, b.piCount]);

        // ── Bosons (updatePhotons, updatePions, decayPions) ──
        this._phase4BindGroups.bosG0 = bg('bosons_g0', p4.updatePhotons.bindGroupLayouts[0],
            [this.uniformBuffer, b.poolMgmt]);
        this._phase4BindGroups.bosG1 = bg('bosons_g1', p4.updatePhotons.bindGroupLayouts[1],
            [b.particleState, b.particleAux]);
        this._phase4BindGroups.bosG2 = bg('bosons_g2', p4.updatePhotons.bindGroupLayouts[2],
            [b.photonPool, b.phCount]);
        this._phase4BindGroups.bosG3 = bg('bosons_g3', p4.updatePhotons.bindGroupLayouts[3],
            [b.pionPool, b.piCount]);

        // ── Boson Tree Walk (updatePhotonsTree, updatePionsTree) ──
        // Group 1 adds tree nodes buffer at binding 2; groups 0,2,3 shared with non-tree variants.
        this._phase4BindGroups.bosTreeG1 = bg('bosonsTree_g1', p4.updatePhotonsTree.bindGroupLayouts[1],
            [b.particleState, b.particleAux, b.qtNodeBuffer]);

        // ── Boson absorption (claimPhotons, claimPions and their tree walks, applyAbsorption) ──
        // Groups 2 and 3 are the pools' (bosG2, bosG3).
        this._phase4BindGroups.absorbG0 = bg('bosonAbsorb_g0', p4.applyAbsorption.bindGroupLayouts[0],
            [this.uniformBuffer, b.absorbClaims]);
        this._phase4BindGroups.absorbG1 = bg('bosonAbsorb_g1', p4.applyAbsorption.bindGroupLayouts[1],
            [b.particleState, b.particleAux, b.qtNodeBuffer, b.ghostOriginalIdx]);

        // ── Boson tree walks (applyBosonBosonGravity, applyPionPionCoulomb, annihilatePions) ──
        // Group 0: uniforms + tree nodes (atomic) + counter + visitor flags
        this._phase4BindGroups.btG0 = bg('bosonTree_g0', p4.applyBosonBosonGravity.bindGroupLayouts[0],
            [this.uniformBuffer, b.bosonTreeNodes, b.bosonTreeCounter, b.bosonVisitorFlags]);
        this._phase4BindGroups.btG1 = bg('bosonTree_g1', p4.applyBosonBosonGravity.bindGroupLayouts[1],
            [b.photonPool, b.phCount]);
        this._phase4BindGroups.btG2 = bg('bosonTree_g2', p4.applyBosonBosonGravity.bindGroupLayouts[2],
            [b.pionPool, b.piCount, b.pionClaims]);

        // ── Kugelblitz Collapse ──
        // Groups 0-2 reuse boson tree bind groups; group 3 is kugelblitz event output
        if (p4.checkKugelblitz) {
            if (!this._kbBuffers) {
                this._kbBuffers = createKugelblitzBuffers(this.device);
            }
            this._phase4BindGroups.kbG3 = bg('kugelblitz_g3', p4.checkKugelblitz.bindGroupLayouts[3],
                [this._kbBuffers.events, this._kbBuffers.counter]);
        }
    }

    /**
     * Dispatch radiation reaction passes (Phase 4, Pass 11).
     * Runs after Boris half-kick 2 and torques, before drift.
     */
    _dispatchRadiation(encoder, plan = updateGPUDispatchPlan(this, this._dispatchPlan)) {
        if (!plan.radiation) return;

        const workgroups = Math.ceil(this.aliveCount / 64);
        const bgs = this._phase4BindGroups;
        const p4 = this._phase4;

        // Larmor radiation (requires Coulomb + Radiation)
        if (plan.larmorRadiation) {
            const passLarmor = encoder.beginComputePass({ label: 'larmorRadiation' });
            passLarmor.setPipeline(p4.larmorRadiation.pipeline);
            passLarmor.setBindGroup(0, bgs.radG0);
            passLarmor.setBindGroup(1, bgs.radG1);
            passLarmor.setBindGroup(2, bgs.radG2);
            passLarmor.setBindGroup(3, bgs.radG3);
            passLarmor.dispatchWorkgroups(workgroups);
            passLarmor.end();
        }

        // Hawking radiation (requires Black Hole + Radiation)
        if (plan.hawkingRadiation) {
            const passHawking = encoder.beginComputePass({ label: 'hawkingRadiation' });
            passHawking.setPipeline(p4.hawkingRadiation.pipeline);
            passHawking.setBindGroup(0, bgs.radG0);
            passHawking.setBindGroup(1, bgs.radG1);
            passHawking.setBindGroup(2, bgs.radG2);
            passHawking.setBindGroup(3, bgs.radG3);
            passHawking.dispatchWorkgroups(workgroups);
            passHawking.end();
        }

        // Pion emission (requires Yukawa + Radiation)
        if (plan.pionEmission) {
            const passPion = encoder.beginComputePass({ label: 'pionEmission' });
            passPion.setPipeline(p4.pionEmission.pipeline);
            passPion.setBindGroup(0, bgs.radG0);
            passPion.setBindGroup(1, bgs.radG1);
            passPion.setBindGroup(2, bgs.radG2);
            passPion.setBindGroup(3, bgs.radG3);
            passPion.dispatchWorkgroups(workgroups);
            passPion.end();
        }

        // Schwinger discharge (requires Black Hole + Coulomb)
        if (plan.schwingerDischarge) {
            const passSchwinger = encoder.beginComputePass({ label: 'schwingerDischarge' });
            passSchwinger.setPipeline(p4.schwingerDischarge.pipeline);
            passSchwinger.setBindGroup(0, bgs.radG0);
            passSchwinger.setBindGroup(1, bgs.radG1);
            passSchwinger.setBindGroup(2, bgs.radG2);
            passSchwinger.setBindGroup(3, bgs.radG3);
            passSchwinger.dispatchWorkgroups(workgroups);
            passSchwinger.end();
        }
    }

    /**
     * Emit the pending radiation of every slot whose body died this frame (radiation.wgsl
     * flushRetiredRadiation), before dead-slot GC can hand the slot to a new body.
     */
    _dispatchFlushRetiredRadiation(encoder) {
        if (this.aliveCount === 0 || !this._phase4?.flushRetiredRadiation) return;
        const bgs = this._phase4BindGroups;
        const pass = encoder.beginComputePass({ label: 'flushRetiredRadiation' });
        pass.setPipeline(this._phase4.flushRetiredRadiation.pipeline);
        pass.setBindGroup(0, bgs.radG0);
        pass.setBindGroup(1, bgs.radG1);
        pass.setBindGroup(2, bgs.radG2);
        pass.setBindGroup(3, bgs.radG3);
        pass.dispatchWorkgroups(Math.ceil(this.aliveCount / 64));
        pass.end();
    }

    /**
     * Dispatch 1PN velocity-Verlet correction (Phase 4, Pass 14).
     * After drift: recompute 1PN at the new positions, the way the force pass took it (a tree
     * walk over a rebuilt tree, or O(N²) pairwise), and apply the VV kick.
     */
    _dispatch1PNVV(encoder) {
        if (!this._onePNEnabled) return;

        const workgroups = Math.ceil(this.aliveCount / 64);
        const bgs = this._phase4BindGroups;
        const p4 = this._phase4;

        // Step 1: Recompute 1PN forces at post-drift positions, the way the force pass took them
        if (this.forceSum.tree) {
            // Rebuild tree at post-drift positions for VV correction
            this._dispatchGhostGen(encoder);
            this._dispatchTreeBuild(encoder);

            const passCompute = encoder.beginComputePass({ label: 'compute1PNTree' });
            passCompute.setPipeline(p4.compute1PNTree.pipeline);
            passCompute.setBindGroup(0, bgs.onePNG0);
            passCompute.setBindGroup(1, bgs.onePNTreeG1);
            passCompute.setBindGroup(2, bgs.onePNG2);
            passCompute.setBindGroup(3, bgs.onePNTreeG3);
            passCompute.dispatchWorkgroups(workgroups);
            passCompute.end();
        } else {
            const passCompute = encoder.beginComputePass({ label: 'compute1PN' });
            passCompute.setPipeline(p4.compute1PN.pipeline);
            passCompute.setBindGroup(0, bgs.onePNG0);
            passCompute.setBindGroup(1, bgs.onePNG1);
            passCompute.setBindGroup(2, bgs.onePNG2);
            passCompute.setBindGroup(3, bgs.onePNG3);
            passCompute.dispatchWorkgroups(Math.ceil(this.aliveCount / OBSERVERS_PER_GROUP));
            passCompute.end();
        }

        // Step 2: Apply VV correction kick
        const passKick = encoder.beginComputePass({ label: 'vvKick1PN' });
        passKick.setPipeline(p4.vvKick1PN.pipeline);
        passKick.setBindGroup(0, bgs.onePNG0);
        passKick.setBindGroup(1, bgs.onePNG1);
        passKick.setBindGroup(2, bgs.onePNG2);
        passKick.setBindGroup(3, bgs.onePNG3);
        passKick.dispatchWorkgroups(workgroups);
        passKick.end();
    }

    /**
     * Dispatch boson update passes (Phase 4, Pass 21): photon and pion drift, then absorption.
     */
    _dispatchBosonUpdate(encoder) {
        // Every substep, whatever emitted them: bosons outlive their sources' switches, and the
        // indirect dispatch sizes each pass by its pool's count. Without bodies there is no
        // tree (and nothing to absorb), so lensing takes the pairwise loop over none.
        const p4 = this._phase4;
        const bgs = this._phase4BindGroups;
        const bodies = this.aliveCount > 0;
        const useBHTree = this.forceSum.byCount && bodies;

        // Select tree or pairwise pipelines for lensing + absorption
        const phUpdatePipeline = useBHTree ? p4.updatePhotonsTree.pipeline : p4.updatePhotons.pipeline;
        const piUpdatePipeline = useBHTree ? p4.updatePionsTree.pipeline : p4.updatePions.pipeline;
        const g1 = useBHTree ? bgs.bosTreeG1 : bgs.bosG1;

        const useIndirect = this._writeBosonDispatchArgs(encoder);

        {
            // updatePhotons: drift + lensing
            const passPhotons = encoder.beginComputePass({ label: 'updatePhotons' });
            passPhotons.setPipeline(phUpdatePipeline);
            passPhotons.setBindGroup(0, bgs.bosG0);
            passPhotons.setBindGroup(1, g1);
            passPhotons.setBindGroup(2, bgs.bosG2);
            passPhotons.setBindGroup(3, bgs.bosG3);
            if (useIndirect) passPhotons.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PHOTON);
            else passPhotons.dispatchWorkgroups(Math.ceil(GPU_MAX_PHOTONS / 64));
            passPhotons.end();
        }

        {
            // updatePions: drift with proper velocity
            const passPions = encoder.beginComputePass({ label: 'updatePions' });
            passPions.setPipeline(piUpdatePipeline);
            passPions.setBindGroup(0, bgs.bosG0);
            passPions.setBindGroup(1, g1);
            passPions.setBindGroup(2, bgs.bosG2);
            passPions.setBindGroup(3, bgs.bosG3);
            if (useIndirect) passPions.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PION);
            else passPions.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
            passPions.end();
        }

        if (bodies) this._dispatchAbsorption(encoder, useBHTree, useIndirect);
    }

    /**
     * Absorption (boson-absorb.wgsl): each boson claims its absorber in parallel, read-only on
     * the bodies, then one workgroup per body sums its claims and takes them. The tree walk
     * resolves ghost copies to their originals; both searches fold bosons into the domain and
     * take minimum images on a periodic boundary, so they find the same absorbers.
     */
    _dispatchAbsorption(encoder, useTree, useIndirect) {
        const p4 = this._phase4;
        const bgs = this._phase4BindGroups;
        const stage = (label, pipeline, dispatch) => {
            const pass = encoder.beginComputePass({ label });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bgs.absorbG0);
            pass.setBindGroup(1, bgs.absorbG1);
            pass.setBindGroup(2, bgs.bosG2);
            pass.setBindGroup(3, bgs.bosG3);
            dispatch(pass);
            pass.end();
        };
        stage('claimPhotons', (useTree ? p4.claimPhotonsTree : p4.claimPhotons).pipeline, (pass) => {
            if (useIndirect) pass.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PHOTON);
            else pass.dispatchWorkgroups(Math.ceil(GPU_MAX_PHOTONS / 64));
        });
        stage('claimPions', (useTree ? p4.claimPionsTree : p4.claimPions).pipeline, (pass) => {
            if (useIndirect) pass.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PION);
            else pass.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
        });
        stage('applyAbsorption', p4.applyAbsorption.pipeline, (pass) => pass.dispatchWorkgroups(this.aliveCount));
    }

    /**
     * Dispatch pion decay (once per frame, NOT per substep), on each pion's proper time
     * over the frame's whole lab interval.
     */
    _dispatchPionDecay(encoder) {
        const p4 = this._phase4;
        const bgs = this._phase4BindGroups;
        const useIndirect = this._writeBosonDispatchArgs(encoder);
        const passDecay = encoder.beginComputePass({ label: 'decayPions' });
        passDecay.setPipeline(p4.decayPions.pipeline);
        passDecay.setBindGroup(0, bgs.bosG0);
        passDecay.setBindGroup(1, bgs.bosG1);
        passDecay.setBindGroup(2, bgs.bosG2);
        passDecay.setBindGroup(3, bgs.bosG3);
        if (useIndirect) passDecay.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PION);
        else passDecay.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
        passDecay.end();
    }

    /**
     * Dispatch boson interaction passes (Phase 4).
     * Runs once per frame after all substeps: build boson tree, gravity, Coulomb, annihilation.
     */
    _dispatchBosonInteraction(encoder, plan = updateGPUDispatchPlan(this, this._dispatchPlan)) {
        if (!plan.bosonInteraction) return;

        const p4 = this._phase4;
        const bgs = this._phase4BindGroups;
        const b = this.buffers;

        const totalBosons = GPU_MAX_PHOTONS + PION_POOL_CAP;
        const useIndirect = this._writeBosonDispatchArgs(encoder);
        const bosonWG = Math.ceil(totalBosons / 64);

        // The bosons' quadtree, from sorted keys like the bodies'
        this._buildTree(encoder, 'bosonTree', this._bosonTreeBuild, this._bosonTreeBuildBGs, b.bosonTreeBounds,
            b.bosonTreePlan, totalBosons);

        // Bodies don't feel the bosons' gravity: a pull that answered the lensing reciprocally
        // needs each boson's projected impulse (docs/MODEL.md §3.12)
        if (this._gravityEnabled) {
            // applyBosonBosonGravity: boson <-> boson mutual gravity
            const passBosonBoson = encoder.beginComputePass({ label: 'applyBosonBosonGravity' });
            passBosonBoson.setPipeline(p4.applyBosonBosonGravity.pipeline);
            passBosonBoson.setBindGroup(0, bgs.btG0);
            passBosonBoson.setBindGroup(1, bgs.btG1);
            passBosonBoson.setBindGroup(2, bgs.btG2);
            if (useIndirect) passBosonBoson.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_TOTAL);
            else passBosonBoson.dispatchWorkgroups(bosonWG);
            passBosonBoson.end();
        }

        // applyPionPionCoulomb: pion <-> pion Coulomb via boson tree (only when Coulomb enabled)
        if (this._coulombEnabled) {
            const passPiCoulomb = encoder.beginComputePass({ label: 'applyPionPionCoulomb' });
            passPiCoulomb.setPipeline(p4.applyPionPionCoulomb.pipeline);
            passPiCoulomb.setBindGroup(0, bgs.btG0);
            passPiCoulomb.setBindGroup(1, bgs.btG1);
            passPiCoulomb.setBindGroup(2, bgs.btG2);
            if (useIndirect) passPiCoulomb.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PION);
            else passPiCoulomb.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
            passPiCoulomb.end();
        }

        // π⁺π⁻ → 2 photons: proposals, then the pairs whose proposal was kept (boson-tree.wgsl)
        {
            // Reset pion claim buffer (must use clearBuffer within encoder, not queue.writeBuffer)
            encoder.clearBuffer(b.pionClaims);
            const passAnnihilate = encoder.beginComputePass({ label: 'annihilatePions' });
            for (const entry of ['proposePions', 'annihilatePions']) {
                passAnnihilate.setPipeline(p4[entry].pipeline);
                passAnnihilate.setBindGroup(0, bgs.btG0);
                passAnnihilate.setBindGroup(1, bgs.btG1);
                passAnnihilate.setBindGroup(2, bgs.btG2);
                if (useIndirect) passAnnihilate.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_PION);
                else passAnnihilate.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
            }
            passAnnihilate.end();
        }

        // Kugelblitz: boson energy density exceeds hoop conjecture → massive particle. A collapse
        // consumes its bosons on the GPU and leaves the body for the host to spawn from the frame's
        // readback, so it waits for a frame with a free readback slot rather than be lost
        if (this._gravityEnabled && p4.checkKugelblitz && this._kbBuffers && bgs.kbG3 &&
            this._frameReadback.some((r) => !r.busy)) {
            encoder.clearBuffer(this._kbBuffers.counter, 0, 4);
            const passKB = encoder.beginComputePass({ label: 'checkKugelblitz' });
            passKB.setPipeline(p4.checkKugelblitz.pipeline);
            passKB.setBindGroup(0, bgs.btG0);
            passKB.setBindGroup(1, bgs.btG1);
            passKB.setBindGroup(2, bgs.btG2);
            passKB.setBindGroup(3, bgs.kbG3);
            if (useIndirect) passKB.dispatchWorkgroupsIndirect(this._bosonDispatchArgs, BOSON_ARGS_NODES);
            else passKB.dispatchWorkgroups(Math.ceil(totalBosons * 2 / 64));
            passKB.end();
        }
    }

    /** Advance every particle's proper-time clock and spoke angle (clocks.wgsl). */
    _dispatchClocks(encoder) {
        const pass = encoder.beginComputePass({ label: 'advanceClocks' });
        pass.setPipeline(this._phase4.advanceClocks.pipeline);
        pass.setBindGroup(0, this._phase4BindGroups.clocksG0);
        pass.dispatchWorkgroups(Math.ceil(this.aliveCount / OBSERVERS_PER_GROUP));
        pass.end();
    }

    /** Put the prescribed bodies back on their curves (prescribed.wgsl), before the world lines. */
    _dispatchPrescribed(encoder) {
        const pass = encoder.beginComputePass({ label: 'applyPrescribed' });
        pass.setPipeline(this._phase4.applyPrescribed.pipeline);
        pass.setBindGroup(0, this._phase4BindGroups.prescribedG0);
        pass.dispatchWorkgroups(1);
        pass.end();
    }

    /**
     * World lines (worldline.wgsl), every substep: a sample for every particle when one is
     * due, else only the breaks that merges left and the snapshots of new deaths.
     */
    _dispatchRecordWorldLines(encoder, due) {
        const bgs = this._phase4BindGroups;
        const pass = encoder.beginComputePass({ label: due ? 'recordWorldLines' : 'recordBreaks' });
        pass.setPipeline(due ? this._phase4.recordWorldLines.pipeline : this._phase4.recordBreaks.pipeline);
        pass.setBindGroup(0, bgs.worldLineG0);
        pass.setBindGroup(1, bgs.worldLineG1);
        pass.dispatchWorkgroups(Math.ceil(this.aliveCount / 64));
        pass.end();
    }

    /** GPU time: the world-line clock relative to the rolling epoch (config.js EPOCH_SPAN). */
    get gpuTime() { return this.conformalTime - this.timeEpoch; }

    /**
     * The cosmological scale factor of the GPU state: 1 unless the universe has expanded, and
     * during update()'s substeps the frame's midpoint a (the stretch is split around them).
     */
    get scaleA() { return this._frameA ?? this.cosmology.a; }

    /** Set the comoving domain (the state's); the GPU's is a × it. */
    setComovingDomain(w, h) {
        this.comovingW = w;
        this.comovingH = h;
        this.domainW = w * this.scaleA;
        this.domainH = h * this.scaleA;
    }

    /** Whether the universe expands this frame: Expansion on a torus (ui.js locks both). */
    get expanding() { return this._expansionEnabled && this.boundaryMode === BOUND_LOOP && this.topologyMode === TORUS; }

    /**
     * Advance the epoch by EPOCH_STEP once GPU time passes EPOCH_SPAN: every stored GPU time
     * shifts back, and each world line is recentred on its tile (worldline-rebase.wgsl).
     */
    _maybeRebaseEpoch() {
        if (this.gpuTime < EPOCH_SPAN) return;
        _rebaseUniformF32[0] = EPOCH_STEP;
        _rebaseUniformU32[1] = this.buffers.maxParticles;
        this.device.queue.writeBuffer(this._rebaseUniformBuffer, 0, _rebaseUniformData);
        const encoder = this.device.createCommandEncoder({ label: 'worldlineRebase' });
        const pass = encoder.beginComputePass({ label: 'rebaseWorldLines' });
        pass.setPipeline(this._phase4.rebaseWorldLines.pipeline);
        pass.setBindGroup(0, this._phase4BindGroups.rebaseG0);
        pass.dispatchWorkgroups(Math.ceil(this.buffers.maxParticles / 64));
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this.timeEpoch += EPOCH_STEP;
        for (const [slot, c] of this.prescribed) if (isKnown(c)) this._writeCurve(slot);
    }

    /**
     * Dispatch dead particle garbage collection (Phase 3).
     * Runs once per frame (not per substep), after all substeps complete.
     */
    _dispatchDeadGC(encoder) {
        if (this.aliveCount === 0) return;

        const pass = encoder.beginComputePass({ label: 'deadGC' });
        pass.setPipeline(this._deadGCPipeline);
        pass.setBindGroup(0, this._deadGCBindGroup);
        pass.dispatchWorkgroups(Math.ceil(this.buffers.maxParticles / 64));
        pass.end();
    }

    /**
     * Dispatch collision detection and resolution (Phase 3).
     * Always uses tree-accelerated broadphase (tree built every substep).
     *
     * COL_PASS (0):   skip entirely.
     * COL_MERGE (1):  tree detect → resolveCollisions (merge/annihilation).
     * COL_BOUNCE (2): tree detect → resolveBouncePairwise (Hertz impulse).
     */
    _dispatchCollisions(encoder) {
        if (this._collisionMode === 0) return; // COL_PASS — nothing to do
        if (this.aliveCount === 0) return;

        const b = this.buffers;
        const isMerge  = this._collisionMode === COL_MERGE;
        const isBounce = this._collisionMode === COL_BOUNCE;

        // Reset pair counter (and merge counter for merge mode)
        encoder.clearBuffer(b.collisionPairCounter, 0, 4);
        if (isMerge) encoder.clearBuffer(b.mergeResultCounter, 0, 4);
        encoder.clearBuffer(b.collisionClaims, 0, this.aliveCount * 4);

        // ── Detection phase (always tree-accelerated) ──
        const detectWG = Math.ceil(this.aliveCount / 64);
        const passDetect = encoder.beginComputePass({ label: 'detectCollisions' });
        passDetect.setPipeline(this._collisionPipelines.detectCollisions);
        passDetect.setBindGroup(0, this._collisionBG0);
        passDetect.setBindGroup(1, this._collisionBG1);
        passDetect.setBindGroup(2, this._collisionBG2);
        passDetect.dispatchWorkgroups(detectWG);
        passDetect.end();

        // ── Resolution phase ──
        // Conservatively dispatch enough workgroups to cover worst-case pair count.
        // Each shader reads pairCounter atomically and exits early for out-of-range threads.
        const resolveWG = Math.ceil(b.maxParticles / 64);
        if (isMerge) {
            const passResolve = encoder.beginComputePass({ label: 'resolveCollisions' });
            passResolve.setPipeline(this._collisionPipelines.resolveCollisions);
            passResolve.setBindGroup(0, this._collisionBG0);
            passResolve.setBindGroup(1, this._collisionBG1);
            passResolve.setBindGroup(2, this._collisionBG2);
            passResolve.dispatchWorkgroups(resolveWG);
            passResolve.end();

            if (this._mergePhotonPipeline && this._mergePhotonBindGroup) {
                const passPhotons = encoder.beginComputePass({ label: 'mergePhotons' });
                passPhotons.setPipeline(this._mergePhotonPipeline);
                passPhotons.setBindGroup(0, this._mergePhotonBindGroup);
                passPhotons.dispatchWorkgroups(resolveWG);
                passPhotons.end();
            }
        } else if (isBounce) {
            const passResolve = encoder.beginComputePass({ label: 'resolveBouncePairwise' });
            passResolve.setPipeline(this._collisionPipelines.resolveBouncePairwise);
            passResolve.setBindGroup(0, this._collisionBG0);
            passResolve.setBindGroup(1, this._collisionBG1);
            passResolve.setBindGroup(2, this._collisionBG2);
            passResolve.dispatchWorkgroups(resolveWG);
            passResolve.end();
        }
    }

    consumeKugelblitzEvents() {
        const events = this._pendingKugelblitzEvents;
        this._pendingKugelblitzEvents = [];
        return events;
    }

    /**
     * Dispatch tree build sequence (always runs — used by collisions, hit test,
     * and optionally by BH tree-walk force computation).
     * Runs after ghost generation, before force computation.
     *
     * Sequence:
     *   1. Reset nodeCounter to 1 (root = node 0, pre-allocated)
     *   2. Reset bounds to (INT_MAX, INT_MAX, INT_MIN, INT_MIN)
     *   3. Clear visitor flags to 0
     *   4. computeBounds: ceil(totalCount / 256) workgroups
     *   5. initRoot: 1 workgroup (single thread)
     *   6. insertParticles: ceil(totalCount / 64) workgroups
     *   7. computeAggregates: ceil(totalCount / 64) workgroups
     */
    _dispatchTreeBuild(encoder) {
        const totalCount = this.aliveCount + this._ghostSlots();
        if (totalCount === 0) return;
        const b = this.buffers;
        this._buildTree(encoder, 'tree', this._treeBuild, this._treeBuildBGs, b.qtBoundsBuffer, b.treePlan, totalCount);
    }

    /**
     * Build a quadtree over `slots` item slots (tree-build.wgsl): the bodies, or the bosons.
     * The bounds reset is an encoder op, not queue.writeBuffer, because the bodies' tree is
     * built twice in a substep with 1PN's velocity-Verlet correction under Barnes–Hut.
     */
    _buildTree(encoder, label, t, groups, bounds, plan, slots) {
        encoder.copyBufferToBuffer(this._qtBoundsSrc, 0, bounds, 0, 16);

        // The sort steps the slots could need, each sized on the GPU by the active items
        const M = Math.max(TREE_SORT_BLOCK, 2 ** Math.ceil(Math.log2(slots)));
        // Under ?perf a pass per stage, so the profiler times each (an empty pass writes no
        // timestamps on Metal, and its stale ones would stretch the frame's span)
        let pass = null;
        // workgroups: a count, or an indirect record of the plan
        const run = (pipeline, workgroups, step = 0, record = -1) => {
            if (PERF || !pass) {
                if (pass) pass.end();
                pass = encoder.beginComputePass({ label: PERF ? label + ':' + pipeline.label : label });
            }
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, groups[0]);
            pass.setBindGroup(1, groups[1]);
            pass.setBindGroup(2, groups[2]);
            pass.setBindGroup(3, groups[pipeline === t.treePlan ? 4 : 3], [step * 256]);
            if (record >= 0) pass.dispatchWorkgroupsIndirect(plan, 12 * record);
            else pass.dispatchWorkgroups(workgroups);
        };
        run(t.computeBounds, Math.ceil(slots / 256));
        run(t.initRoot, 1);
        run(t.mortonKeys, Math.ceil(slots / 256));
        run(t.treePlan, 1);
        run(t.padKeys, 0, 0, 0);
        run(t.sortLocal, 0, 0, 2);
        const steps = this._treeSortSteps;
        for (let i = 1; i < steps.length && steps[i][0] <= M; i++) {
            run(steps[i][1] ? t.sortGlobal : t.sortMerge, 0, i, 2 + i);
        }
        const wg = Math.ceil(slots / 256);
        run(t.radixBuild, wg);
        run(t.quadLink, wg);
        run(t.writeLeaves, wg);
        run(t.reduceNodes, 0, 0, 1);
        pass.end();
    }

    /**
     * Add a particle to the GPU buffers.
     * Reuses free slots from dead GC when available, otherwise appends.
     */
    /**
     * Write a new particle into a free slot. vx, vy are proper velocity. The clock starts
     * at τ = tau, θ = theta.
     * bornAt is the lab time signal delay treats as the particle's birth: now by default,
     * so its field spreads out at c; −Infinity for initial conditions, which are taken
     * to have moved uniformly forever.
     * @returns {number} slot index, or -1 when the pool is full
     */
    addParticle({ x, y, vx = 0, vy = 0, mass: m = 1, charge: q = 0, angw = 0, antimatter = false,
                  tau = 0, theta = 0, bornAt = null, prescribed = false }) {
        this.stateVersion++;
        this._stepsSinceChange = 0;
        let idx;
        if (this._cpuFreeSlots.length > 0) {
            // Reuse a slot freed by dead GC
            idx = this._cpuFreeSlots.pop();
        } else {
            idx = this.aliveCount;
            if (!this._growStore(idx + 1)) return -1;
            this.aliveCount++;
        }

        // Write packed ParticleState struct (36 bytes = 9 × f32/u32) using pre-allocated buffers
        _addParticleStateF32[0] = x;          // posX
        _addParticleStateF32[1] = y;          // posY
        _addParticleStateF32[2] = vx;         // velWX
        _addParticleStateF32[3] = vy;         // velWY
        _addParticleStateF32[4] = m;          // mass
        _addParticleStateF32[5] = Math.round(q / BOSON_CHARGE) * BOSON_CHARGE; // charge (quantized)
        _addParticleStateF32[6] = angw;       // angW
        _addParticleStateF32[7] = m;          // baseMass
        let flags = FLAG_ALIVE;
        if (antimatter && !this._blackHoleEnabled) flags |= FLAG_ANTIMATTER;
        if (prescribed) flags |= FLAG_PRESCRIBED;
        _addParticleStateU32[8] = flags;
        this.device.queue.writeBuffer(this.buffers.particleState, idx * PARTICLE_STATE_SIZE, _addParticleStateData);

        // Write packed ParticleAux struct (20 bytes = 5 × f32/u32). The radius is the body's, or
        // in black-hole mode its horizon (cache-derived refreshes both every substep)
        const bodyR = Math.cbrt(m);
        _addParticleAuxF32[0] = this._blackHoleEnabled ? kerrNewmanRadius(m, bodyR * bodyR, angw, _addParticleStateF32[5]) : bodyR;
        _addParticleAuxU32[1] = idx;          // particleId
        _addParticleAuxF32[2] = 3.4028235e38;     // deathTime (not dead)
        _addParticleAuxF32[3] = 0;            // deathMass
        _addParticleAuxF32[4] = 0;            // deathAngVel
        this.device.queue.writeBuffer(this.buffers.particleAux, idx * PARTICLE_AUX_SIZE, _addParticleAuxData);

        // The ink of its charge (update-colors refreshes it every frame)
        _addParticleColorData[0] = _inkABGR(_addParticleStateF32[5], this._isDarkTheme, this._blackHoleEnabled);
        this.device.queue.writeBuffer(this.buffers.color, idx * 4, _addParticleColorData);

        // cacheDerived shader computes derived state before forces each substep.
        // No need to initialize derived here; axYukMod starts as cacheDerived resets it.
        _addParticleModData[0] = 1.0;
        _addParticleModData[1] = 1.0;
        _addParticleModData[2] = 1.0;
        _addParticleModData[3] = 0.0; // φ_a²
        this.device.queue.writeBuffer(this.buffers.axYukMod, idx * 16, _addParticleModData);

        // Initialize radiationState to zero (jerk, accumulators, display force)
        _addParticleRadData.fill(0);
        this.device.queue.writeBuffer(this.buffers.radiationState, idx * RADIATION_STATE_SIZE, _addParticleRadData);

        // Clock
        _addParticleClockData[0] = tau;
        _addParticleClockData[1] = tau - CLOCK_PERIOD * Math.floor(tau / CLOCK_PERIOD);
        _addParticleClockData[2] = theta;
        _addParticleClockData[3] = 1;
        this.device.queue.writeBuffer(this.buffers.clocks, idx * 16, _addParticleClockData);

        // World line: one sample at birth, so signal delay has a state to extrapolate
        // from before the first recorded one. Meta (shared-worldline.wgsl): writeIdx, count,
        // creation time, generation, and an identity deck (the cover starts on the domain).
        this._writeBirthSample(idx, x, y, vx, vy, m, q, angw, tau, theta);
        this._slotGeneration[idx]++;
        _addParticleMetaU32.fill(0);
        _addParticleMetaU32[0] = 1;
        _addParticleMetaU32[1] = 1;
        _addParticleMetaF32[2] = bornAt == null ? this.gpuTime : bornAt - this.timeEpoch;
        _addParticleMetaU32[3] = this._slotGeneration[idx];
        this.device.queue.writeBuffer(this.buffers.wlMeta, idx * WL_META_STRIDE * 4, _addParticleMetaBuf);
        return idx;
    }

    /**
     * Add a prescribed body (roadmap §6.2): `curve` (src/prescribed.js) gives its world line, t0
     * on the world-line clock (conformalTime), and the body starts where the curve is now. Its
     * clock reads `tau` now unless the curve sets tau0. A body born at −∞ (a figure's initial
     * condition) has a past too, the curve's, written into its ring, so it acts at once with the
     * field of its whole recorded motion; otherwise it is born now, like any body.
     * Returns the slot, or −1.
     */
    addPrescribed(curve, { mass = 1, charge = 0, angw = 0, tau = 0, theta = 0, bornAt = null } = {}) {
        if (this.prescribed.size >= PRESCRIBED_CAP) return -1;
        const now = this.conformalTime;
        const c = { ...curve };
        if (c.tau0 == null) c.tau0 = tau - curveAt({ ...c, tau0: 0 }, now).tau;
        const p = curveAt(c, now);
        const idx = this.addParticle({ x: p.x * this.scaleA, y: p.y * this.scaleA, vx: p.wx, vy: p.wy,
                                       mass, charge, angw, tau: p.tau, theta, bornAt, prescribed: true });
        if (idx < 0) return -1;
        this.prescribed.set(idx, c);
        this._writeCurve(idx);
        this._writePrescribedList();
        if (bornAt === -Infinity) this._writePast(idx, c, mass, charge, angw, theta);
        return idx;
    }

    /**
     * The hand (roadmap §6.7): take hold of slot idx, pursuing the pointer at lab (x, y) from the
     * body's own state on the next substep (prescribed.wgsl). One body is held at a time.
     */
    grip(idx, x, y) {
        if (this.held != null) this.releaseGrip();
        if (this.prescribed.size >= PRESCRIBED_CAP && !this.prescribed.has(idx)) return false;
        if (this._letGo === idx) this._letGo = null;
        this.prescribed.set(idx, { kind: 'held', tx: x, ty: y });
        this._writeCurve(idx);
        this._writePrescribedList();
        this.held = idx;
        return true;
    }

    /** Move the held body's target to lab (x, y). */
    moveGrip(x, y) {
        if (this.held == null) return;
        _gripData[0] = x;
        _gripData[1] = y;
        this.device.queue.writeBuffer(this.buffers.curves, this.held * CURVE_FLOATS * 4 + 12, _gripData);
    }

    /** Let go: the next substep frees the body at its last velocity, and the slot leaves the list. */
    releaseGrip() {
        if (this.held == null) return;
        _gripData[0] = 2;
        this.device.queue.writeBuffer(this.buffers.curves, this.held * CURVE_FLOATS * 4 + 36, _gripData, 0, 1);
        this._letGo = this.held;
        this.held = null;
    }

    /** Slot idx's curve record (shared-prescribed.wgsl), its t0 as GPU time. */
    _writeCurve(idx) {
        packCurve(this.prescribed.get(idx), this.timeEpoch, _curveData);
        this.device.queue.writeBuffer(this.buffers.curves, idx * CURVE_FLOATS * 4, _curveData);
    }

    /** The prescribed slots, for prescribed.wgsl and the known future's draw. */
    _writePrescribedList() {
        const slots = [...this.prescribed.keys()];
        _prescribedListData[0] = slots.length;
        slots.forEach((s, k) => { _prescribedListData[1 + k] = s; });
        this.device.queue.writeBuffer(this.buffers.prescribedList, 0, _prescribedListData, 0, slots.length + 1);
        this._prescribedDirty = false;
    }

    /** Fill slot idx's ring with its curve's past, a sample every WORLDLINE_DT up to now. */
    _writePast(idx, c, m, q, angw, theta) {
        if (this.scaleA !== 1) return;   // a prescribed past is drawn in a static universe only
        const n = WORLDLINE_LEN, now = this.conformalTime, f = _pastData;
        for (let k = 0; k < n; k++) {
            const t = now - (n - 1 - k) * WORLDLINE_DT;
            const p = curveAt(c, t), b = k * WL_STRIDE;
            f[b] = t - this.timeEpoch; f[b + 1] = p.x; f[b + 2] = p.y; f[b + 3] = p.wx; f[b + 4] = p.wy;
            f[b + 5] = p.ax; f[b + 6] = p.ay; f[b + 7] = p.tau; f[b + 8] = theta; f[b + 9] = angw;
            f[b + 10] = m; f[b + 11] = q;
        }
        this.device.queue.writeBuffer(this.buffers.wlData, idx * WORLDLINE_LEN * WL_STRIDE * 4, f);
        _addParticleMetaU32[0] = 0;   // writeIdx: n wraps to 0
        _addParticleMetaU32[1] = n;
        this.device.queue.writeBuffer(this.buffers.wlMeta, idx * WL_META_STRIDE * 4, _addParticleMetaBuf, 0, 8);
    }

    /**
     * Remove a particle from the GPU by marking it dead (clearing ALIVE, setting RETIRED).
     * Writes death metadata for signal delay fade-out matching collision/boundary shaders.
     * The dead GC shader will reclaim the slot after the signal delay expiry window.
     * @param {number} idx - GPU buffer index of the particle to remove
     * @param {number} deathMass - particle mass at time of death
     * @param {number} deathAngVel - particle angular velocity at time of death
     */
    removeParticle(idx, deathMass = 0, deathAngVel = 0) {
        if (idx < 0 || idx >= this.aliveCount) return;
        this.stateVersion++;
        this._stepsSinceChange = 0;
        // Clear ALIVE bit, set RETIRED bit in flags (byte offset 8 in ParticleState = 32 bytes in)
        // ParticleState: posX(0), posY(4), velWX(8), velWY(12), mass(16), charge(20), angW(24), baseMass(28), flags(32)
        this.device.queue.writeBuffer(this.buffers.particleState, idx * PARTICLE_STATE_SIZE + 32, _retiredFlagU32);
        // Write death metadata to ParticleAux: deathTime(offset 8), deathMass(12), deathAngVel(16)
        _deathMetaF32[0] = this.gpuTime;
        _deathMetaF32[1] = deathMass;
        _deathMetaF32[2] = deathAngVel;
        this.device.queue.writeBuffer(this.buffers.particleAux, idx * PARTICLE_AUX_SIZE + 8, _deathMetaData);
    }

    /** Write a particle's first world-line sample (ring slot 0) at the current time. */
    _writeBirthSample(idx, x, y, wx, wy, m, q, angw, tau, theta) {
        const f = _birthSampleData;
        f[0] = this.gpuTime; f[1] = x / this.scaleA; f[2] = y / this.scaleA; f[3] = wx; f[4] = wy;
        f[5] = 0; f[6] = 0; f[7] = tau; f[8] = theta; f[9] = angw; f[10] = m; f[11] = q;
        this.device.queue.writeBuffer(this.buffers.wlData, idx * WORLDLINE_LEN * WL_STRIDE * 4, f);
    }

    /**
     * Choose how this frame's forces are summed (this.forceSum; config.js "Force summation"):
     * pairwise below TREE_ON bodies, the Barnes–Hut tree above, with the tree kept until the
     * count falls under TREE_OFF, and its opening angle ramping with the count. The override
     * (treeOverride, thetaOverride) takes the rule's place when set. Once per update(), and when
     * the toggles change, so every dispatch of a frame agrees.
     */
    _chooseForceSum() {
        const n = this.aliveCount;
        let byCount;
        if (this.treeOverride) {
            byCount = this.treeOverride === 'tree';
        } else {
            const periodic = this.boundaryMode === BOUND_LOOP;
            byCount = n >= (this._treeLatched ? (periodic ? TREE_OFF_PERIODIC : TREE_OFF) : (periodic ? TREE_ON_PERIODIC : TREE_ON));
            this._treeLatched = byCount;
        }
        const fs = this.forceSum;
        fs.byCount = byCount;
        // With Relativity every force acts pairwise from the sources' world lines, which a
        // node's aggregate doesn't have
        fs.tree = byCount && !this._relativityEnabled;
        fs.theta = this.thetaOverride ?? treeTheta(n);
    }

    /**
     * Pack toggle booleans into u32 bitfields for GPU uniforms.
     * Must be called whenever a toggle changes.
     */
    setToggles(physics) {
        let t0 = 0;
        if (physics.gravityEnabled) t0 |= GRAVITY_BIT;
        if (physics.coulombEnabled) t0 |= COULOMB_BIT;
        if (physics.magneticEnabled) t0 |= MAGNETIC_BIT;
        if (physics.gravitomagEnabled) t0 |= GRAVITOMAG_BIT;
        if (physics.onePNEnabled) t0 |= ONE_PN_BIT;
        if (physics.relativityEnabled) t0 |= RELATIVITY_BIT;
        if (physics.spinOrbitEnabled) t0 |= SPIN_ORBIT_BIT;
        if (physics.radiationEnabled) t0 |= RADIATION_BIT;
        if (physics.blackHoleEnabled) t0 |= BLACK_HOLE_BIT;
        if (physics.expansionEnabled) t0 |= EXPANSION_BIT;
        if (physics.yukawaEnabled) t0 |= YUKAWA_BIT;
        if (physics.higgsEnabled) t0 |= HIGGS_BIT;
        if (physics.axionEnabled) t0 |= AXION_BIT;
        if (physics.bosonInterEnabled) t0 |= BOSON_INTER_BIT;
        this._toggles0 = t0;

        let t1 = 0;
        if (physics.gravityEnabled) t1 |= FIELD_GRAV_BIT_T1; // field gravity follows gravity
        if (physics.collisionMode === COL_BOUNCE) t1 |= HERTZ_BOUNCE_BIT_T1;
        this._toggles1 = t1;
        this._isDarkTheme = document.documentElement.dataset.theme === 'dark';
        this._gravityEnabled = physics.gravityEnabled;
        this._coulombEnabled = physics.coulombEnabled;
        this._magneticEnabled = physics.magneticEnabled;
        this._gravitomagEnabled = physics.gravitomagEnabled;
        this._spinOrbitEnabled = physics.spinOrbitEnabled;
        this._blackHoleEnabled = physics.blackHoleEnabled;
        this._relativityEnabled = physics.relativityEnabled;
        this._chooseForceSum();
        this._onePNEnabled = physics.onePNEnabled;
        this._radiationEnabled = physics.radiationEnabled;
        this._yukawaEnabled = physics.yukawaEnabled;
        this._bosonInterEnabled = physics.bosonInterEnabled;
        this._yukawaCoupling = physics.yukawaCoupling ?? 14;

        this._yukawaMu = physics.yukawaMu;
        this._higgsMass = physics.higgsMass ?? 0.5;
        this._axionMass = physics.axionMass ?? 0.05;
        this._extGravity = physics.extGravity;
        this._extGravityAngle = physics.extGravityAngle;
        this._extElectric = physics.extElectric;
        this._extElectricAngle = physics.extElectricAngle;
        this._extBz = physics.extBz;
        // Cache precomputed external field direction components (avoid per-frame trig)
        const gravAngle = physics.extGravityAngle || 0;
        const elecAngle = physics.extElectricAngle || 0;
        this._cachedExtGx = (physics.extGravity || 0) * Math.cos(gravAngle);
        this._cachedExtGy = (physics.extGravity || 0) * Math.sin(gravAngle);
        this._cachedExtEx = (physics.extElectric || 0) * Math.cos(elecAngle);
        this._cachedExtEy = (physics.extElectric || 0) * Math.sin(elecAngle);
        this._bounceFriction = physics.bounceFriction;
        this._collisionMode = physics.collisionMode || 0;
        this._axionCoupling = AXION_COUPLING;
        this._higgsCoupling = HIGGS_COUPLING;

        // Phase 5 toggle state
        this._higgsEnabled = physics.higgsEnabled;
        this._axionEnabled = physics.axionEnabled;
        // Expansion switched on: the imposed schedules start from the current a
        if (physics.expansionEnabled && !this._expansionEnabled) this.cosmology.start();
        this._expansionEnabled = physics.expansionEnabled;
        this.cosmology.h0 = physics.hubbleParam || 0;
        this._cosmoSchedule = physics.cosmoSchedule | 0;
        this._fieldDamping = physics.fieldDamping ?? 1;
        this.cosmology.schedule = SCHEDULE_KEYS[this._cosmoSchedule] || SCHEDULE_KEYS[0];
        this._hubbleParam = physics.hubbleParam || 0.001;
        this._heatmapEnabled = physics.heatmapEnabled || false;
        this._heatmapMode = physics.heatmapMode || 'all';

        // Lazily allocate scalar field buffers on first toggle-on (matching CPU pattern)
        if (physics.higgsEnabled && !this._higgsBuffers) {
            this._ensureFieldBuffers('higgs');
        }
        if (physics.axionEnabled && !this._axionBuffers) {
            this._ensureFieldBuffers('axion');
        }

        // Lazily initialize Phase 5 pipelines when any Phase 5 feature is enabled
        const needsPhase5 = physics.higgsEnabled || physics.axionEnabled ||
            physics.expansionEnabled || physics.blackHoleEnabled || this._heatmapEnabled;
        if (needsPhase5 && !this._fieldDeposit) {
            this._ensurePhase5Pipelines();
        }
    }

    /**
     * Lazily allocate GPU buffers for a scalar field.
     * Also ensures shared atomic deposit grid buffer is allocated.
     * Initializes field values: Higgs=1.0 (VEV), Axion=0.0.
     * @param {'higgs'|'axion'} which
     */
    _ensureFieldBuffers(which) {
        if (!this._atomicGrid) {
            this._atomicGrid = createAtomicGridBuffer(this.device);
        }
        if (!this._fieldUniformBuffer) {
            this._fieldUniformBuffer = this.device.createBuffer({
                label: 'fieldUniforms',
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // Per-field uniform buffers: eliminate encoder split when both Higgs + Axion enabled
            this._higgsUniformBuffer = this.device.createBuffer({
                label: 'higgsFieldUniforms',
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._axionUniformBuffer = this.device.createBuffer({
                label: 'axionFieldUniforms',
                size: 256,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            // Dummy zero buffer for portal coupling when other field not yet allocated
            this._dummyFieldBuffer = this.device.createBuffer({
                label: 'dummyField',
                size: FIELD_GRID_RES * FIELD_GRID_RES * 4,
                usage: GPUBufferUsage.STORAGE,
            });
        }
        if (!this._gravGrid) {
            this._gravGrid = createGravityGridBuffers(this.device);
            this._metricPrimed = false;
        }
        if (which === 'higgs' && !this._higgsBuffers) {
            this._higgsBuffers = createFieldBuffers(this.device, 'higgs', MAX_PARTICLES);
            this._initFieldToVacuum('higgs');
            this._gravBGs = null; // its field group references this field's buffers
            // Invalidate other field's evolve bind groups (portal coupling references this buffer)
            this._fieldEvolveBGs['axion'] = null;
            this._fieldGradBGs['axion'] = null;
        }
        if (which === 'axion' && !this._axionBuffers) {
            this._axionBuffers = createFieldBuffers(this.device, 'axion', MAX_PARTICLES);
            this._initFieldToVacuum('axion');
            this._gravBGs = null;
            this._fieldEvolveBGs['higgs'] = null;
            this._fieldGradBGs['higgs'] = null;
        }
    }

    /**
     * Lazily initialize Phase 5 pipelines on first use.
     * Called when any Phase 5 feature is first enabled.
     */
    async _ensurePhase5Pipelines() {
        if (this._fieldDeposit) return; // already initialized
        this._phase5Ready = false;

        const wgslConstants = buildWGSLConstants();

        // Initialize all Phase 5 pipelines in parallel
        const [deposit, evolve, forces, particleGrav, selfGrav, fft, excitation, heatmap, expansion, extremal, bosonDispatchArgs] =
            await Promise.all([
                createFieldDepositPipelines(this.device, wgslConstants),
                createFieldEvolvePipelines(this.device, wgslConstants),
                createFieldForcesPipelines(this.device, wgslConstants),
                createFieldParticleGravPipeline(this.device, wgslConstants),
                createFieldGravityPipelines(this.device, wgslConstants),
                createFFTPipelines(this.device, wgslConstants),
                createFieldExcitationPipeline(this.device, wgslConstants),
                createHeatmapPipelines(this.device, wgslConstants),
                createExpansionPipeline(this.device, wgslConstants),
                createExtremalPipeline(this.device, wgslConstants),
                createBosonDispatchArgsPipeline(this.device, wgslConstants),
            ]);

        this._fieldDeposit = deposit;
        this._fieldEvolve = evolve;
        this._fieldForces = forces;
        this._fieldParticleGrav = particleGrav;
        this._fieldGravity = selfGrav;
        this._fftPipelines = fft;
        this._fieldExcitation = excitation;
        this._heatmapPipelines = heatmap;
        this._expansionPipeline = expansion;
        this._extremalPipeline = extremal;
        this._bosonDispatchArgsPipeline = bosonDispatchArgs;
        this._phase5Ready = true;
    }

    /**
     * Stretch the universe by `ratio` from scale factor `aOld`: book the fields' share from
     * their state just before it (field-ledger.wgsl), then scale (expansion.wgsl), and book
     * what the GPU passes don't see in JS.
     */
    _stretch(encoder, ratio, aOld) {
        this._dispatchFieldLedger(encoder, 1, ratio, 0, aOld);
        this._dispatchExpansion(encoder, ratio);
        this._ledgerExpansion(ratio);
    }

    /**
     * The expansion's work on what the GPU passes don't see, from the last stats: the
     * potential energy of the stretched separations, to first order (dPE = ln r · Σ d·∂V/∂d),
     * and the escaped background, which redshifts by 1/r (escaped leptons are matter and keep
     * their energy). The fields' share is on the GPU (field-ledger.wgsl).
     */
    _ledgerExpansion(ratio) {
        const L = this.ledger;
        if (this._peScale === null) this._lnrPending += Math.log(ratio);
        else L.expansionWork -= Math.log(ratio) * this._peScale;
        const e = L.escapedE;
        L.escapedE /= ratio;
        L.escapedPx /= ratio;
        L.escapedPy /= ratio;
        L.expansionWork += e - L.escapedE;
    }

    /**
     * Collect a stats readback's ledger words (compute-stats.wgsl [96-99]) and feed the
     * Friedmann closure its densities at the scale factor `a` the stats were taken at.
     */
    _absorbLedger(d, a, then) {
        const L = this.ledger;
        // Escaped photons arrive comoving (a·E at the cull), so each account converts at its
        // own a and books the redshift since the cull as expansion work
        for (const [l, aAt] of [[L, this.scaleA], [then, a]]) {
            const e = d[98] / aAt;
            l.expansionWork += d[96] + d[97] - e;
            l.escapedE += e;
            l.escapedPx += d[99] / aAt;
            l.escapedPy += d[100] / aAt;
            l.escapedMatterE += d[101];
            l.agentE += d[104];
            l.agentPx += d[105];
            l.agentPy += d[106];
        }
        if (this._peScale === null) {
            L.expansionWork -= this._lnrPending * d[26];
            then.expansionWork -= this._lnrPending * d[26];
        }
        this._peScale = d[26];
        this._lnrPending = 0;
        const V = slabVolume(a, this.comovingW, this.comovingH);
        const matter = d[8] + d[0] + d[1] + d[23] + then.escapedMatterE;   // rest, kinetic, spin; pions, leptons
        const radiation = d[20] + d[27] + then.escapedE;
        const fields = (d[14] + d[15]) * a;           // the slab is a·ℓ thick
        this.cosmology.setDensities(matter / V, radiation / V, fields / V, a);
    }

    /**
     * Grow the universe by `ratio` = a_new/a_old (expansion.wgsl): positions ×ratio,
     * peculiar momenta and photon energies ÷ratio. Once per frame,
     * after the substeps; the caller then sets the domain to the new a.
     */
    _dispatchExpansion(encoder, ratio) {
        const pl = this._expansionPipeline;
        if (!pl) return;
        if (!this._expansionUniformBuffer) {
            this._expansionUniformBuffer = this.device.createBuffer({
                label: 'expansionUniforms', size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        }
        _expansionUniformF32[0] = ratio;
        _expansionUniformU32[1] = this._relativityEnabled ? 1 : 0;
        _expansionUniformU32[2] = this.aliveCount;
        _expansionUniformU32[3] = GPU_MAX_PHOTONS;
        _expansionUniformU32[4] = PION_POOL_CAP;
        this.device.queue.writeBuffer(this._expansionUniformBuffer, 0, _expansionUniformData);

        if (!this._expansionBG) {
            const b = this.buffers;
            this._expansionBG = this.device.createBindGroup({
                label: 'expansion_g0',
                layout: pl.bindGroupLayouts[0],
                entries: [
                    { binding: 0, resource: { buffer: this._expansionUniformBuffer } },
                    { binding: 1, resource: { buffer: b.particleState } },
                    { binding: 2, resource: { buffer: b.photonPool } },
                    { binding: 3, resource: { buffer: b.pionPool } },
                    { binding: 4, resource: { buffer: this._cosmoAccum } },
                    { binding: 5, resource: { buffer: b.phCount } },
                    { binding: 6, resource: { buffer: b.piCount } },
                ],
            });
        }

        const p = encoder.beginComputePass({ label: 'expansion' });
        p.setBindGroup(0, this._expansionBG);
        p.setPipeline(pl.particles);
        p.dispatchWorkgroups(Math.max(1, Math.ceil(this.aliveCount / 64)));
        p.setPipeline(pl.photons);
        p.dispatchWorkgroups(Math.ceil(GPU_MAX_PHOTONS / 64));
        p.setPipeline(pl.pions);
        p.dispatchWorkgroups(Math.ceil(PION_POOL_CAP / 64));
        p.end();
    }

    /**
     * Dispatch extremal charge shedding (Pass 20), black-hole mode only: a hole whose charge
     * passes its Kerr–Newman limit sheds leptons.
     */
    _dispatchExtremal(encoder) {
        if (!this._blackHoleEnabled || !this._extremalPipeline) return;
        if (this.aliveCount === 0) return;

        if (!this._extremalBGs) {
            const b = this.buffers;
            const layouts = this._extremalPipeline.bindGroupLayouts;
            this._extremalBGs = [
                this.device.createBindGroup({
                    label: 'extremal_g0',
                    layout: layouts[0],
                    entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
                }),
                this.device.createBindGroup({
                    label: 'extremal_g1',
                    layout: layouts[1],
                    entries: [
                        { binding: 0, resource: { buffer: b.particleState } },
                        { binding: 1, resource: { buffer: b.particleAux } },
                        { binding: 2, resource: { buffer: b.derived } },
                    ],
                }),
                this.device.createBindGroup({
                    label: 'extremal_g2',
                    layout: layouts[2],
                    entries: [
                        { binding: 0, resource: { buffer: b.pionPool } },
                        { binding: 1, resource: { buffer: b.piCount } },
                    ],
                }),
            ];
        }

        const p = encoder.beginComputePass({ label: 'shedExtremalCharge' });
        p.setPipeline(this._extremalPipeline.pipeline);
        for (let g = 0; g < 3; g++) p.setBindGroup(g, this._extremalBGs[g]);
        p.dispatchWorkgroups(Math.ceil(this.aliveCount / 256));
        p.end();
    }

    _ensureBosonDispatchArgs() {
        if (!this._bosonDispatchArgs) {
            this._bosonDispatchArgs = this.device.createBuffer({
                label: 'boson-dispatch-args',
                size: 48, // four indirect dispatch records, 3 × u32 each
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT,
            });
        }
        if (!this._bosonDispatchArgsBG && this._bosonDispatchArgsPipeline) {
            const b = this.buffers;
            this._bosonDispatchArgsBG = this.device.createBindGroup({
                label: 'bosonDispatchArgs_g0',
                layout: this._bosonDispatchArgsPipeline.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: b.phCount } },
                    { binding: 1, resource: { buffer: b.piCount } },
                    { binding: 2, resource: { buffer: this._bosonDispatchArgs } },
                ],
            });
        }
        return this._bosonDispatchArgs && this._bosonDispatchArgsBG;
    }

    _writeBosonDispatchArgs(encoder) {
        if (!this._bosonDispatchArgsPipeline || !this._ensureBosonDispatchArgs()) return false;
        const pass = encoder.beginComputePass({ label: 'buildBosonDispatchArgs' });
        pass.setPipeline(this._bosonDispatchArgsPipeline.pipeline);
        pass.setBindGroup(0, this._bosonDispatchArgsBG);
        pass.dispatchWorkgroups(1);
        pass.end();
        return true;
    }

    /**
     * Dispatch heatmap compute pass (runs once every HEATMAP_INTERVAL frames).
     * @param {Object} camera - camera state for viewport bounds
     */
    dispatchHeatmap(encoder, camera) {
        if (!this._heatmapEnabled || !this._heatmapPipelines) return;
        if (this.aliveCount === 0) return;

        if (!this._heatmapBuffers) {
            this._heatmapBuffers = createHeatmapBuffers(this.device, GPU_HEATMAP_GRID);
        }

        if (!this._heatmapUniformBuffer) {
            this._heatmapUniformBuffer = this.device.createBuffer({
                label: 'heatmapUniforms',
                size: 96, // HeatmapUniforms struct size (23 fields, padded)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        }

        // Compute viewport bounds from camera — use logical pixels to match
        // render shader (canvasW/canvasH = canvas.width = window.innerWidth, no DPR)
        const canvasW = camera?.viewportW || 800;
        const canvasH = camera?.viewportH || 600;
        const halfW = canvasW / (2 * (camera?.zoom || 16));
        const halfH = canvasH / (2 * (camera?.zoom || 16));
        const viewLeft = (camera?.x || 0) - halfW;
        const viewTop = (camera?.y || 0) - halfH;
        const cellW = (2 * halfW) / GPU_HEATMAP_GRID;
        const cellH = (2 * halfH) / GPU_HEATMAP_GRID;
        // The overlay draws the grid over the rectangle it was computed for, not the camera's
        // now: the grid is a few frames old
        const rect = this.heatmapRect;
        rect.left = viewLeft; rect.top = viewTop; rect.cellW = cellW; rect.cellH = cellH;

        // Write HeatmapUniforms
        // Write HeatmapUniforms (pre-allocated buffers, no per-frame GC)
        _heatmapUniformF32[0] = viewLeft;
        _heatmapUniformF32[1] = viewTop;
        _heatmapUniformF32[2] = cellW;
        _heatmapUniformF32[3] = cellH;
        _heatmapUniformF32[4] = this._blackHoleEnabled ? BH_SOFTENING_SQ : SOFTENING_SQ; // softeningSq
        _heatmapUniformF32[5] = this._yukawaCoupling;
        _heatmapUniformF32[6] = this._yukawaMu;
        _heatmapUniformF32[7] = this.gpuTime;
        _heatmapUniformF32[8] = this.domainW;
        _heatmapUniformF32[9] = this.domainH;
        const hm = this._heatmapMode;
        _heatmapUniformU32[10] = (this._gravityEnabled && (hm === 'all' || hm === 'gravity')) ? 1 : 0;
        _heatmapUniformU32[11] = (this._coulombEnabled && (hm === 'all' || hm === 'electric')) ? 1 : 0;
        _heatmapUniformU32[12] = (this._yukawaEnabled && (hm === 'all' || hm === 'yukawa')) ? 1 : 0;
        _heatmapUniformU32[13] = this._relativityEnabled ? 1 : 0; // useDelay
        _heatmapUniformU32[14] = this.boundaryMode === BOUND_LOOP ? 1 : 0;
        _heatmapUniformU32[15] = this.topologyMode;
        _heatmapUniformU32[16] = this.aliveCount;
        _heatmapUniformU32[17] = this.forceSum.byCount ? 1 : 0; // useTree
        _heatmapUniformU32[18] = this._blackHoleEnabled ? 1 : 0;
        _heatmapUniformF32[19] = this.scaleA;
        // Bz: from moving charges and spins once Magnetic is on, and the external field
        _heatmapUniformU32[20] = ((this._magneticEnabled || this._extBz !== 0) && (hm === 'all' || hm === 'magnetic')) ? 1 : 0;
        _heatmapUniformF32[21] = (hm === 'all' || hm === 'magnetic') ? this._extBz : 0;
        _heatmapUniformF32[22] = this.forceSum.theta;
        this.device.queue.writeBuffer(this._heatmapUniformBuffer, 0, _heatmapUniformData);

        if (!this._heatmapBGs) {
            const b = this.buffers;
            const hm = this._heatmapPipelines;
            const hmBuf = this._heatmapBuffers;
            this._heatmapBGs = {
                g0: this.device.createBindGroup({
                    label: 'heatmap_g0',
                    layout: hm.heatmapLayouts[0],
                    entries: [
                        { binding: 0, resource: { buffer: b.particleState } },
                        { binding: 1, resource: { buffer: b.particleAux } },
                        { binding: 2, resource: { buffer: b.qtNodeBuffer } },
                    ],
                }),
                g1: this.device.createBindGroup({
                    label: 'heatmap_g1',
                    layout: hm.heatmapLayouts[1],
                    entries: [
                        { binding: 0, resource: { buffer: hmBuf.gravPotential } },
                        { binding: 1, resource: { buffer: hmBuf.elecPotential } },
                        { binding: 2, resource: { buffer: hmBuf.yukawaPotential } },
                        { binding: 3, resource: { buffer: this._heatmapUniformBuffer } },
                        { binding: 4, resource: { buffer: hmBuf.magField } },
                        { binding: 5, resource: { buffer: hmBuf.elecField } },
                    ],
                }),
                g2: this.device.createBindGroup({
                    label: 'heatmap_g2_worldlines',
                    layout: hm.heatmapLayouts[2],
                    entries: [
                        { binding: 0, resource: { buffer: this.buffers.wlData } },
                        { binding: 1, resource: { buffer: this.buffers.wlMeta } },
                    ],
                }),
            };
        }

        const gridWG = Math.ceil(GPU_HEATMAP_GRID / 8);

        // Compute heatmap — the tree walk when the body count calls for it, signal delay off, non-periodic
        // (periodic boundaries require minImage wrapping which the tree walk doesn't handle)
        {
            const useDelay = this._relativityEnabled;
            const isPeriodic = this.boundaryMode === BOUND_LOOP;
            const useTree = this.forceSum.byCount && !useDelay && !isPeriodic;
            const pipeline = useTree
                ? this._heatmapPipelines.computeHeatmapTree
                : this._heatmapPipelines.computeHeatmap;
            const p = encoder.beginComputePass({ label: useTree ? 'computeHeatmapTree' : 'computeHeatmap' });
            p.setPipeline(pipeline);
            p.setBindGroup(0, this._heatmapBGs.g0);
            p.setBindGroup(1, this._heatmapBGs.g1);
            p.setBindGroup(2, this._heatmapBGs.g2);
            p.dispatchWorkgroups(gridWG, gridWG);
            p.end();
        }

        // Blur each active channel
        const channels = ['gravPotential', 'elecPotential', 'yukawaPotential', 'magField'];
        const channelToggles = [this._gravityEnabled, this._coulombEnabled, this._yukawaEnabled,
            this._magneticEnabled || this._extBz !== 0];
        const hmBuf = this._heatmapBuffers;

        for (let c = 0; c < channels.length; c++) {
            if (!channelToggles[c]) continue;
            const chName = channels[c];
            if (!this._heatmapBlurBGs[chName]) {
                this._heatmapBlurBGs[chName] = this.device.createBindGroup({
                    label: `heatmapBlur_${chName}`,
                    layout: this._heatmapPipelines.blurLayouts[0],
                    entries: [
                        { binding: 0, resource: { buffer: hmBuf[chName] } },
                        { binding: 1, resource: { buffer: hmBuf.blurTemp } },
                    ],
                });
            }
            // Horizontal blur
            {
                const p = encoder.beginComputePass({ label: `blurH_${chName}` });
                p.setPipeline(this._heatmapPipelines.blurHorizontal);
                p.setBindGroup(0, this._heatmapBlurBGs[chName]);
                p.dispatchWorkgroups(gridWG, gridWG);
                p.end();
            }
            // Vertical blur
            {
                const p = encoder.beginComputePass({ label: `blurV_${chName}` });
                p.setPipeline(this._heatmapPipelines.blurVertical);
                p.setBindGroup(0, this._heatmapBlurBGs[chName]);
                p.dispatchWorkgroups(gridWG, gridWG);
                p.end();
            }
        }
        // Queue the overlay's readback: the potentials (blurred), E (not), and the bodies
        if (!this._heatmapReadPending) {
            const G = GPU_HEATMAP_GRID * GPU_HEATMAP_GRID * 4;
            const nBytes = this.aliveCount * PARTICLE_STATE_SIZE;
            if (!this._heatmapStaging) {
                this._heatmapStaging = this.device.createBuffer({
                    label: 'heatmapReadback', size: 5 * G + MAX_PARTICLES * PARTICLE_STATE_SIZE,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
            }
            const st = this._heatmapStaging;
            encoder.copyBufferToBuffer(hmBuf.gravPotential, 0, st, 0, G);
            encoder.copyBufferToBuffer(hmBuf.elecPotential, 0, st, G, G);
            encoder.copyBufferToBuffer(hmBuf.yukawaPotential, 0, st, 2 * G, G);
            encoder.copyBufferToBuffer(hmBuf.elecField, 0, st, 3 * G, 2 * G);
            if (nBytes > 0) encoder.copyBufferToBuffer(this.buffers.particleState, 0, st, 5 * G, nBytes);
            this._heatmapCopyMeta = {
                viewLeft, viewTop, cellW, cellH, grid: GPU_HEATMAP_GRID, n: this.aliveCount,
                gravity: _heatmapUniformU32[10] === 1, coulomb: _heatmapUniformU32[11] === 1,
                yukawa: _heatmapUniformU32[12] === 1, delayed: this._relativityEnabled,
                blackHole: this._blackHoleEnabled, version: this.stateVersion,
            };
        }
    }

    /** Expose heatmap buffers for renderer overlay drawing */
    getHeatmapBuffers() { return this._heatmapBuffers; }

    /**
     * Map the readback queued by dispatchHeatmap: heatmapReadback becomes { meta, grav, elec,
     * yuk, E (x, y interleaved), state (ParticleState words) }, a frame or two late.
     */
    _mapHeatmapReadback() {
        const meta = this._heatmapCopyMeta;
        if (!meta || this._heatmapReadPending) return;
        this._heatmapCopyMeta = null;
        this._heatmapReadPending = true;
        const st = this._heatmapStaging;
        const G = meta.grid * meta.grid;
        st.mapAsync(GPUMapMode.READ).then(() => {
            const raw = st.getMappedRange().slice(0);
            this.heatmapReadback = {
                meta,
                grav: new Float32Array(raw, 0, G),
                elec: new Float32Array(raw, 4 * G, G),
                yuk: new Float32Array(raw, 8 * G, G),
                E: new Float32Array(raw, 12 * G, 2 * G),
                state: new Float32Array(raw, 20 * G, meta.n * PARTICLE_STATE_SIZE / 4),
            };
        }).catch(() => {}).finally(() => {
            if (st.mapState === 'mapped') st.unmap();
            this._heatmapReadPending = false;
        });
    }

    /**
     * Run one frame: adaptive substepping with full Phase 2 force computation + Boris integrator.
     * When paused, the caller does not call update() — no compute dispatches are issued.
     * @param {number} dt - Total simulation time to advance this frame
     */
    update(dt) {
        // Fields and bosons step without bodies: every body pass is sized by aliveCount
        if (!this._ready || dt <= 0) return;
        this._chooseForceSum();

        // Adaptive substepping: use maxAccel from previous frame
        const softening = this._blackHoleEnabled ? BH_SOFTENING : SOFTENING;
        let dtSafe = this._maxAccel > 1e-9
            ? Math.sqrt(softening / this._maxAccel)
            : dt;
        // Cyclotron limit would need Bz readback — for Phase 2, use conservative estimate
        const maxSubsteps = 32;
        const numSubsteps = Math.min(Math.ceil(dt / dtSafe), maxSubsteps);
        const dtSub = dt / numSubsteps;

        // Expansion, split symmetrically (Strang): half the stretch before the substeps and
        // half after, with the substeps in the static universe at the midpoint a. A first-order
        // split would leave an O(H·dt) error in bound orbits, comparable to the real tidal term.
        const cosmo = this.cosmology;
        let half = 1;
        if (this.expanding) {
            const a0 = cosmo.a;
            half = Math.sqrt(cosmo.step(dt));
            this._frameA = a0 * half;
            this._frameH = cosmo.capped ? 0 : cosmo.hubble(this._frameA);
            if (half !== 1) {
                const enc = this.device.createCommandEncoder({ label: 'expansion-pre' });
                this._stretch(enc, half, a0);
                this.device.queue.submit([enc.finish()]);
                this.setComovingDomain(this.comovingW, this.comovingH);
            }
        } else {
            cosmo.stop();
            this._frameH = 0;
        }

        // Write slow-changing uniforms once per frame (toggles, domain, sliders, etc.)
        this._maybeRebaseEpoch();
        writeFrameUniforms(this.device, this.uniformBuffer, {
            dt: dtSub,
            simTime: this.gpuTime,
            scaleA: this.scaleA,
            hubble: this._frameH,
            domainW: this.domainW,
            domainH: this.domainH,
            speedScale: 1,
            softening: this._blackHoleEnabled ? BH_SOFTENING : SOFTENING,
            softeningSq: this._blackHoleEnabled ? BH_SOFTENING_SQ : SOFTENING_SQ,
            toggles0: this._toggles0,
            toggles1: this._toggles1,
            yukawaCoupling: this._yukawaCoupling,
            yukawaMu: this._yukawaMu,
            higgsMass: this._higgsMass,
            axionMass: this._axionMass,
            boundaryMode: this.boundaryMode,
            topologyMode: this.topologyMode,
            collisionMode: this._collisionMode,
            maxParticles: this.buffers.storeCapacity,
            aliveCount: this.aliveCount,
            extGravity: this._extGravity,
            extGravityAngle: this._extGravityAngle,
            extElectric: this._extElectric,
            extElectricAngle: this._extElectricAngle,
            extBz: this._extBz,
            bounceFriction: this._bounceFriction,
            extGx: this._cachedExtGx,
            extGy: this._cachedExtGy,
            extEx: this._cachedExtEx,
            extEy: this._cachedExtEy,
            axionCoupling: this._axionCoupling,
            higgsCoupling: this._higgsCoupling,
            particleCount: this.aliveCount + this._ghostSlots(),
            bhTheta: this.forceSum.theta,
            frameCount: this._frameCount,
        });
        updateGPUDispatchPlan(this, this._dispatchPlan);

        // One submit per substep: each substep's queue.writeBuffer() calls (simTime above
        // all) must land before that substep's passes, not before the whole frame's.
        this.substepsRun += numSubsteps;
        for (let step = 0; step < numSubsteps; step++) {
            this.simTime += dtSub;
            this.conformalTime += dtSub / this.scaleA;
            this.device.queue.submit([this._dispatchSubstep(dtSub)]);
        }

        this._frameCount++;
        this._stepsSinceChange++;
        // A body let go of was freed by this frame's first substep
        if (this._letGo != null) {
            if (this.prescribed.get(this._letGo)?.kind === 'held') this.prescribed.delete(this._letGo);
            this._letGo = null;
            this._writePrescribedList();
        }

        // Post-substep passes (once per frame)
        {
            const encoder = this.device.createCommandEncoder({ label: 'post-substep' });

            // The second half of the stretch; the domain follows after submit
            if (half !== 1) this._stretch(encoder, half, this._frameA);

            // Pool culls: the removed energy becomes escaped radiation (boson-ledger.wgsl)
            if (this._ledgerPipelines) {
                _ledgerAData[0] = half !== 1 ? this._frameA * half : this.scaleA;
                this.device.queue.writeBuffer(this._ledgerAUniform, 0, _ledgerAData);
                const p = encoder.beginComputePass({ label: 'cullBosons' });
                p.setPipeline(this._ledgerPipelines.cull);
                p.setBindGroup(0, this._ledgerBindGroup);
                p.dispatchWorkgroups(Math.ceil(Math.max(GPU_MAX_PHOTONS, PION_POOL_CAP) / 64));
                p.end();
            }

            // Pack the boson pools so their counts are live and freed slots reusable before this
            // frame's decays, annihilations and emissions append (boson-compact.wgsl); what dies
            // later in the frame is packed the next one
            if (this._compactPipeline) {
                const p = encoder.beginComputePass({ label: 'compactBosons' });
                p.setPipeline(this._compactPipeline);
                p.setBindGroup(0, this._compactBindGroup);
                p.dispatchWorkgroups(1);
                p.end();
            }

            // Heatmap compute (every HEATMAP_INTERVAL=4 frames)
            this._heatmapFrame++;
            if (this._heatmapEnabled && (this._heatmapFrame & HEATMAP_INTERVAL_MASK) === 0) {
                this.dispatchHeatmap(encoder, this._lastCamera);
            }

            // Pion decay: once per frame, so the shader gets the frame's whole dt.
            _postSubDt[0] = dt;
            this.device.queue.writeBuffer(this.uniformBuffer, UNIFORM_DT_OFFSET, _postSubDt);
            this._dispatchPionDecay(encoder);

            // Boson interaction (if enabled): build boson tree + particle<-boson + boson<->boson + pion Coulomb + annihilation
            this._dispatchBosonInteraction(encoder, this._dispatchPlan);

            // Pending radiation of bodies that died, then dead-slot garbage collection
            this._dispatchFlushRetiredRadiation(encoder);
            this._dispatchDeadGC(encoder);


            // Update particle colors from charge/mass/antimatter state
            this._dispatchUpdateColors(encoder);

            const readback = this._encodeFrameReadback(encoder);
            this.device.queue.submit([encoder.finish()]);
            this._mapHeatmapReadback();
            if (readback) this._mapFrameReadback(readback);
        }
        this._frameA = null;
        if (half !== 1) this.setComovingDomain(this.comovingW, this.comovingH);

    }

    /**
     * The frame's readback, copied at the end of its last encoder into a free slot of a small
     * ring (null when all are still mapped, and then the free stack stays on the GPU for the
     * next frame): the largest acceleration and the ghost count for the next frame's sizing,
     * the merge and kugelblitz events, and the free stack, which the same encoder then clears,
     * so each freed slot reaches the host once.
     */
    _encodeFrameReadback(encoder) {
        const slot = this._frameReadback.find((r) => !r.busy);
        if (!slot) return null;
        slot.busy = true;
        slot.gen = this._resetGen;
        // Merge events go only to the fields' excitation (gpu-fields.js), so they are read only
        // while it can consume them, and only after a frame whose collision pass reset the counter
        slot.merges = this._collisionMode === COL_MERGE && this.aliveCount > 0 &&
            !!this._fieldExcitation && (this._higgsEnabled || this._axionEnabled);
        slot.kugelblitz = this._dispatchPlan.kugelblitzReadback;
        const b = this.buffers, dst = slot.buf, max = b.maxParticles;
        encoder.copyBufferToBuffer(b.maxAccelBuffer, 0, dst, RB_MAX_ACCEL, 4);
        encoder.copyBufferToBuffer(b.ghostCounter, 0, dst, RB_GHOSTS, 4);
        encoder.copyBufferToBuffer(b.mergeResultCounter, 0, dst, RB_MERGES, 4);
        encoder.copyBufferToBuffer(b.mergeResultBuffer, 0, dst, RB_MERGE_RESULTS, max * MERGE_RESULT_SIZE);
        if (slot.kugelblitz) {
            encoder.copyBufferToBuffer(this._kbBuffers.counter, 0, dst, RB_KB, 4);
            encoder.copyBufferToBuffer(this._kbBuffers.events, 0, dst, RB_KB_EVENT, 48);
        }
        encoder.copyBufferToBuffer(b.freeTop, 0, dst, RB_FREE_TOP, 4);
        encoder.copyBufferToBuffer(b.freeStack, 0, dst, RB_FREE_STACK, max * 4);
        encoder.clearBuffer(b.freeTop, 0, 4);
        return slot;
    }

    _mapFrameReadback(slot) {
        slot.buf.mapAsync(GPUMapMode.READ).then(() => {
            // A reset since the copy makes its slots and events stale
            if (slot.gen === this._resetGen) this._readFrameReadback(slot, slot.buf.getMappedRange());
            slot.buf.unmap();
        }).catch(() => {}).finally(() => { slot.busy = false; });
    }

    _readFrameReadback(slot, raw) {
        const f = new Float32Array(raw), u = new Uint32Array(raw);
        // NaN/Inf guard: a corrupted value would break adaptive substepping
        const a = f[RB_MAX_ACCEL / 4];
        this._maxAccel = (a === a && a < 1e20) ? a : 0;
        // The counter keeps counting past the ghost slots (ghost-gen drops the overflow), and a
        // copy sized by it would invalidate every substep's command buffer
        this._ghostCount = this.boundaryMode === BOUND_LOOP ? Math.min(u[RB_GHOSTS / 4], MAX_PARTICLES) : 0;
        if (slot.merges) {
            const n = Math.min(u[RB_MERGES / 4], this.buffers.maxParticles);
            for (let i = 0; i < n; i++) {
                // Two vec4s: { x, y, energy, type } and { px, py, _, _ }
                const k = RB_MERGE_RESULTS / 4 + i * (MERGE_RESULT_SIZE / 4);
                this._pendingMergeEvents.push({
                    x: f[k], y: f[k + 1], energy: f[k + 2],
                    type: f[k + 3] < 0.5 ? 'annihilation' : 'merge',
                    px: f[k + 4], py: f[k + 5],
                });
            }
        }
        if (slot.kugelblitz && u[RB_KB / 4] > 0) {
            const k = RB_KB_EVENT / 4;
            this._pendingKugelblitzEvents.push({
                x: f[k], y: f[k + 1], px: f[k + 2], py: f[k + 3],
                energy: f[k + 4], charge: f[k + 5], angL: f[k + 6], count: f[k + 7],
                radiatedEnergy: f[k + 8], radiatedPx: f[k + 9], radiatedPy: f[k + 10],
            });
        }
        const top = u[RB_FREE_TOP / 4];
        if (top <= MAX_PARTICLES) {
            for (let i = 0; i < top; i++) {
                const slotIdx = u[RB_FREE_STACK / 4 + i];
                if (slotIdx < MAX_PARTICLES) this._cpuFreeSlots.push(slotIdx);
                if (this.prescribed.delete(slotIdx)) this._prescribedDirty = true;
            }
            if (this._prescribedDirty) this._writePrescribedList();
        }
    }

    /**
     * Dispatch a single substep: all compute passes in sequence.
     * @param {number} dtSub - Substep timestep
     */
    _dispatchSubstep(dtSub) {
        // Write only the 5 substep-varying fields (dt, simTime, aliveCount, particleCount, frameCount)
        writeSubstepUniforms(this.device, this.uniformBuffer,
            dtSub, this.gpuTime, this.aliveCount,
            this.aliveCount + this._ghostSlots(), this._frameCount);

        const workgroups = Math.ceil(this.aliveCount / 64);
        const plan = this._dispatchPlan;

        let encoder = this.device.createCommandEncoder({ label: 'physics-substep' });

        // Passes 0–14, the bodies: forces, kicks, drift, clocks (skipped without bodies, whose
        // passes would all be empty; the fields and bosons below step regardless)
        const bodies = workgroups > 0;
        if (bodies) this._dispatchBodyStep(encoder, dtSub, workgroups, plan);

        // Pass 15: scalar field evolution (Higgs, Axion), one joint KDK.
        // Per-field uniform buffers carry each field's currentFieldType, so both
        // fields share one encoder.
        if (this._fieldDeposit) {
            if (this._higgsEnabled) this._writeFieldUniforms(dtSub, 0);
            if (this._axionEnabled) this._writeFieldUniforms(dtSub, 1);
            // Hubble friction, its own operator, half a step either side of the KDK (Strang),
            // each half metered by the ledger; the Higgs's Langevin bath, once per substep
            const friction = this.expanding && this._frameH > 0 && this._phase5Ready;
            this._noiseSeed = (this._noiseSeed + 0x9E3779B9) >>> 0;
            if (friction) this._dispatchHubbleFriction(encoder);
            this._dispatchHiggsLangevin(encoder);
            this._dispatchFieldStep(encoder, dtSub);
            if (friction) this._dispatchHubbleFriction(encoder);
        }

        // (Field forces already dispatched at Pass 5c, before Boris)

        // Pass 17-18: collision detection + resolution
        this._dispatchCollisions(encoder);

        // Pass 19: field excitations from merge events
        this._dispatchFieldExcitations(encoder);

        // Pass 20: extremal charge shedding
        this._dispatchExtremal(encoder);

        // Pass 21: boson update (photon/pion drift, absorption, decay)
        this._dispatchBosonUpdate(encoder);

        // Pass 24: boundary
        if (bodies) {
            const passBoundary = encoder.beginComputePass({ label: 'boundary' });
            passBoundary.setPipeline(this._boundaryPipeline);
            passBoundary.setBindGroup(0, this._boundaryBindGroup);
            passBoundary.dispatchWorkgroups(workgroups);
            passBoundary.end();
        }

        // Pass 25: world lines — a sample when this substep crosses a WORLDLINE_DT mark,
        // otherwise merge breaks and death snapshots only
        // (on the world-line clock, so under expansion the ring spans WORLDLINE_LEN·DT of η)
        const due = this.conformalTime >= this._nextWorldLineTime;
        if (bodies && this.prescribed.size > 0) this._dispatchPrescribed(encoder);
        if (bodies) this._dispatchRecordWorldLines(encoder, due);
        if (due) this._nextWorldLineTime = (Math.floor(this.conformalTime / WORLDLINE_DT) + 1) * WORLDLINE_DT;

        return encoder.finish();
    }

    /** Passes 0–14 of a substep, everything the bodies do up to the field step. */
    /** The bodies' inks from their charge, antimatter and black-hole state, in the theme's pair. */
    _dispatchUpdateColors(encoder) {
        if (!this._updateColorsPipeline || this.aliveCount === 0) return;
        _colorUniformData[0] = this._blackHoleEnabled ? 1 : 0;
        _colorUniformData[1] = this._isDarkTheme ? 1 : 0;
        this.device.queue.writeBuffer(this._colorUniformBuffer, 0, _colorUniformData);
        const p = encoder.beginComputePass({ label: 'updateColors' });
        p.setPipeline(this._updateColorsPipeline);
        p.setBindGroup(0, this._updateColorsBindGroup);
        p.dispatchWorkgroups(Math.ceil(this.aliveCount / 64));
        p.end();
    }

    /** A theme change re-inks the bodies at once, paused or not (the inks are theme-paired). */
    setTheme(isDark) {
        this._isDarkTheme = isDark;
        const enc = this.device.createCommandEncoder({ label: 'theme-colors' });
        this._dispatchUpdateColors(enc);
        this.device.queue.submit([enc.finish()]);
    }

    _dispatchBodyStep(encoder, dtSub, workgroups, plan) {
        const p2 = this._phase2;

        // Pass 0: cacheDerived, first, so the radii (horizons in black-hole mode) that ghost-gen
        // reduces to the largest are this substep's
        const pass2 = encoder.beginComputePass({ label: 'cacheDerived' });
        pass2.setPipeline(p2.cacheDerived.pipeline);
        pass2.setBindGroup(0, this._bg_cacheDerived);
        pass2.dispatchWorkgroups(workgroups);
        pass2.end();

        // Pass 0b: ghost generation (Phase 3 — before tree build)
        this._dispatchGhostGen(encoder);

        // Pass 0c: tree build (Phase 3 — after ghost gen, before force computation)
        this._dispatchTreeBuild(encoder);

        // Clear maxAccel for adaptive substepping (reset before force computation)
        encoder.clearBuffer(this.buffers.maxAccelBuffer, 0, 4);

        // Pass 1: resetForces (DMA clear is faster than compute dispatch for zeroing)
        encoder.clearBuffer(this.buffers.allForces, 0, this.aliveCount * 160);


        // Pass 5: force computation — the Barnes–Hut group walk, or O(N^2) pairwise (always
        // with Relativity: every force acts from the sources' world lines)
        if (!this.forceSum.tree) {
            const pass5 = encoder.beginComputePass({ label: 'pairForce' });
            pass5.setPipeline(p2.pairForce.pipeline);
            pass5.setBindGroup(0, this._bg_pairForce0);
            pass5.setBindGroup(1, this._bg_pairForce1);
            pass5.setBindGroup(2, this._bg_pairForce2);
            pass5.setBindGroup(3, this._bg_pairForce3);
            pass5.dispatchWorkgroups(Math.ceil(this.aliveCount / OBSERVERS_PER_GROUP));
            pass5.end();
        }
        if (this.forceSum.tree) {
            // Tree walk force computation (O(N log N))
            const passTree = encoder.beginComputePass({ label: 'treeForce' });
            passTree.setPipeline(this._treeForcePipeline);
            passTree.setBindGroup(0, this._treeForceGroup0);
            passTree.setBindGroup(1, this._treeForceGroup1);
            passTree.setBindGroup(2, this._treeForceGroup2);
            passTree.setBindGroup(3, this._treeForceGroup3);
            // A group of TREE_GROUP bodies per workgroup, in the tree's sorted order
            passTree.dispatchWorkgroups(Math.ceil((this.aliveCount + this._ghostSlots()) / TREE_GROUP));
            passTree.end();
        }

        // Pass 5b: externalFields (skip when all external fields are zero)
        if (this._extGravity !== 0 || this._extElectric !== 0 || this._extBz !== 0) {
            const pass5b = encoder.beginComputePass({ label: 'externalFields' });
            pass5b.setPipeline(p2.externalFields.pipeline);
            pass5b.setBindGroup(0, this._bg_extFields);
            pass5b.dispatchWorkgroups(workgroups);
            pass5b.end();
        }

        // Pass 5c: scalar field forces (Higgs gradient + mass mod, axion gradient, φ_a² at holes)
        // Must run BEFORE Boris so gradient forces are included in totalForce for half-kicks.
        // Uses previous substep's field gradients (computed at end of field evolve).
        if (this._fieldDeposit && (this._higgsEnabled || this._axionEnabled)) {
            this._writeFieldUniforms(dtSub);
        }
        this._dispatchFieldForces(encoder);

        // Pass 5c2: particle-field gravity, F = -m∇Φ_F (if gravity enabled)
        // Uses Φ_F from the previous substep's field step.
        this._dispatchFieldParticleGrav(encoder);

        // Pass 5d: save 1PN forces for velocity-Verlet correction (before Boris)
        if (this._onePNEnabled) {
            const passSave = encoder.beginComputePass({ label: 'saveF1pn' });
            passSave.setPipeline(p2.saveF1pn.pipeline);
            passSave.setBindGroup(0, this._bg_saveF1pn);
            passSave.dispatchWorkgroups(workgroups);
            passSave.end();
        }

        // Pass 6-8 fused: halfKick1 + borisRotate + halfKick2 in one dispatch.
        // Eliminates 2 barrier syncs + 4 redundant global memory loads/stores per particle.
        const passFused = encoder.beginComputePass({ label: 'borisFused' });
        passFused.setPipeline(p2.borisFused.pipeline);
        passFused.setBindGroup(0, this._bg_borisFused);
        passFused.dispatchWorkgroups(workgroups);
        passFused.end();

        // Pass 9: spinOrbit
        if (plan.spinOrbit) {
            const pass9 = encoder.beginComputePass({ label: 'spinOrbit' });
            pass9.setPipeline(p2.spinOrbit.pipeline);
            pass9.setBindGroup(0, this._bg_spinOrbit);
            pass9.dispatchWorkgroups(workgroups);
            pass9.end();
        }

        // Pass 10: applyTorques
        if (plan.applyTorques) {
            const pass10 = encoder.beginComputePass({ label: 'applyTorques' });
            pass10.setPipeline(p2.applyTorques.pipeline);
            pass10.setBindGroup(0, this._bg_torques);
            pass10.dispatchWorkgroups(workgroups);
            pass10.end();
        }

        // ── Radiation + drift + advanced passes (same encoder) ──

        // Pass 11: radiation reaction (Larmor, Hawking, pion emission) — BEFORE drift
        this._dispatchRadiation(encoder, plan);

        // Pass 12: borisDrift
        const pass12 = encoder.beginComputePass({ label: 'borisDrift' });
        pass12.setPipeline(p2.borisDrift.pipeline);
        pass12.setBindGroup(0, this._bg_drift);
        pass12.dispatchWorkgroups(workgroups);
        pass12.end();

        // Pass 12b: proper-time clocks and spoke angles (after the drift: new velocities)
        this._dispatchClocks(encoder);

        // Pass 13: cosmological expansion runs once per frame, after the substeps (update())

        // Pass 14: 1PN velocity-Verlet correction
        this._dispatch1PNVV(encoder);
    }

    /** Store camera state for heatmap viewport calculation */
    setCamera(camera) {
        this._lastCamera = camera;
    }

    /**
     * Read all particle state from GPU and return a save-compatible JSON object.
     * This triggers an async readback. Only called on user action (save/download).
     * @param {Object} sim - The Simulation instance for camera/mode state
     * @returns {Promise<Object>} Save-compatible state object
     */
    async serialize(sim) {
        const count = this.aliveCount;
        const stateByteLen = count * PARTICLE_STATE_SIZE;

        // Create staging buffer for packed ParticleState readback
        const stagingState = this.device.createBuffer({
            size: stateByteLen,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const clockByteLen = count * 16;
        const stagingClock = this.device.createBuffer({
            size: Math.max(clockByteLen, 16),
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const encoder = this.device.createCommandEncoder({ label: 'serialize-readback' });
        encoder.copyBufferToBuffer(this.buffers.particleState, 0, stagingState, 0, stateByteLen);
        if (clockByteLen > 0) encoder.copyBufferToBuffer(this.buffers.clocks, 0, stagingClock, 0, clockByteLen);
        this.device.queue.submit([encoder.finish()]);

        await Promise.all([stagingState.mapAsync(GPUMapMode.READ), stagingClock.mapAsync(GPUMapMode.READ)]);
        const stateRaw = new ArrayBuffer(stateByteLen);
        new Uint8Array(stateRaw).set(new Uint8Array(stagingState.getMappedRange()));
        const clockF32 = new Float32Array(stagingClock.getMappedRange().slice(0));
        stagingState.unmap();
        stagingState.destroy();
        stagingClock.unmap();
        stagingClock.destroy();

        // Parse packed ParticleState structs (9 × 4 bytes each)
        const stateF32 = new Float32Array(stateRaw);
        const stateU32 = new Uint32Array(stateRaw);
        const STRIDE = PARTICLE_STATE_SIZE / 4; // 9 u32/f32 per particle

        const state = {
            version: 2,
            domain: { w: this.comovingW, h: this.comovingH },
            cosmology: { a: this.scaleA },
            particles: [],
            toggles: {},
            settings: {
                collision: COL_NAMES[sim.collisionMode],
                boundary: BOUND_NAMES[sim.boundaryMode],
                topology: TOPO_NAMES[sim.topology],
                speed: sim.speedScale,
                friction: this._bounceFriction,
            },
            camera: {
                x: sim.camera.x,
                y: sim.camera.y,
                zoom: sim.camera.zoom,
            },
        };

        for (let i = 0; i < count; i++) {
            const base = i * STRIDE;
            const flags = stateU32[base + 8];
            if (!(flags & FLAG_ALIVE)) continue;
            state.particles.push({
                x: stateF32[base + 0],      // posX
                y: stateF32[base + 1],      // posY
                wx: stateF32[base + 2],     // velWX
                wy: stateF32[base + 3],     // velWY
                mass: stateF32[base + 4],   // mass
                charge: stateF32[base + 5], // charge
                angw: stateF32[base + 6],   // angW
                baseMass: stateF32[base + 7], // baseMass
                antimatter: !!(flags & FLAG_ANTIMATTER),
                tau: clockF32[i * 4],         // proper time
                theta: clockF32[i * 4 + 2],   // spoke angle
                // A prescribed body's curve, its t0 relative to the save's time
                ...(this.prescribed.has(i) && isKnown(this.prescribed.get(i))
                    ? { curve: { ...this.prescribed.get(i), t0: this.prescribed.get(i).t0 - this.conformalTime } } : {}),
            });
        }

        // Map internal toggle bits back to boolean flags
        const t0 = this._toggles0;
        const t1 = this._toggles1;
        state.toggles.gravityEnabled = !!(t0 & GRAVITY_BIT);
        state.toggles.coulombEnabled = !!(t0 & COULOMB_BIT);
        state.toggles.magneticEnabled = !!(t0 & MAGNETIC_BIT);
        state.toggles.gravitomagEnabled = !!(t0 & GRAVITOMAG_BIT);
        state.toggles.onePNEnabled = !!(t0 & ONE_PN_BIT);
        state.toggles.relativityEnabled = !!(t0 & RELATIVITY_BIT);
        state.toggles.spinOrbitEnabled = !!(t0 & SPIN_ORBIT_BIT);
        state.toggles.radiationEnabled = !!(t0 & RADIATION_BIT);
        state.toggles.blackHoleEnabled = !!(t0 & BLACK_HOLE_BIT);
        state.toggles.expansionEnabled = !!(t0 & EXPANSION_BIT);
        state.toggles.yukawaEnabled = !!(t0 & YUKAWA_BIT);
        state.toggles.higgsEnabled = !!(t0 & HIGGS_BIT);
        state.toggles.axionEnabled = !!(t0 & AXION_BIT);
        state.toggles.bosonInterEnabled = !!(t0 & BOSON_INTER_BIT);
        // field gravity follows gravity (no separate toggle)

        for (const [key, slot] of Object.entries(GPU_PARAMETER_SLOTS)) {
            state[key] = this[slot];
        }

        return state;
    }

    /**
     * Read back scalar field data from GPU for CPU fallback on backend switch.
     * Returns Float32Arrays at GPU resolution (FIELD_GRID_RES × FIELD_GRID_RES).
     * Caller must downsample from GPU grid (128×128) to CPU grid (64×64).
     * @returns {Promise<{higgsField, higgsFieldDot, axionField, axionFieldDot}>}
     */
    async readbackFieldData() {
        const gridBytes = FIELD_GRID_RES * FIELD_GRID_RES * 4;
        const result = { higgsField: null, higgsFieldDot: null, axionField: null, axionFieldDot: null };

        const readBuffer = async (gpuBuffer) => {
            const staging = this.device.createBuffer({
                size: gridBytes,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = this.device.createCommandEncoder({ label: 'field-readback' });
            encoder.copyBufferToBuffer(gpuBuffer, 0, staging, 0, gridBytes);
            this.device.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(FIELD_GRID_RES * FIELD_GRID_RES);
            data.set(new Float32Array(staging.getMappedRange()));
            staging.unmap();
            staging.destroy();
            return data;
        };

        try {
            if (this._higgsBuffers) {
                result.higgsField = await readBuffer(this._higgsBuffers.field);
                result.higgsFieldDot = await readBuffer(this._higgsBuffers.fieldDot);
            }
            if (this._axionBuffers) {
                result.axionField = await readBuffer(this._axionBuffers.field);
                result.axionFieldDot = await readBuffer(this._axionBuffers.fieldDot);
            }
        } catch (e) {
            console.warn('[physsim] Field readback failed:', e);
        }

        return result;
    }

    /**
     * Load a save state into GPU buffers.
     * @param {Object} state - JSON state from serialize() or CPU saveState()
     * @param {Object} sim - The Simulation instance
     * @returns {boolean} Success
     */
    deserialize(state, sim) {
        if (!state || state.version !== 2) return false;

        this.reset();
        // A save from an expanded universe: physical positions on a × the comoving domain
        this.cosmology.a = Math.max(1, Number(state.cosmology?.a) || 1);
        this.cosmology.start();
        this.setComovingDomain(this.comovingW, this.comovingH);

        // G16: Build full packed arrays CPU-side, then issue one writeBuffer per buffer type.
        // This replaces N×6 individual writeBuffer calls with 6 batched uploads.
        const particles = state.particles;
        const count = Math.min(particles.length, MAX_PARTICLES);
        this._growStore(count);

        for (let idx = 0; idx < count; idx++) {
            const pd = particles[idx];
            const m = pd.mass || 1;
            const bm = pd.baseMass ?? m;
            const q = pd.charge || 0;
            const angw = pd.angw || 0;
            const flagBits = FLAG_ALIVE | (pd.antimatter ? FLAG_ANTIMATTER : 0) | (pd.curve ? FLAG_PRESCRIBED : 0);

            // Pack ParticleState (9 × 4 bytes = 36)
            const sBase = idx * 9; // 9 f32/u32 per particle
            _dsStateF32[sBase + 0] = pd.x;
            _dsStateF32[sBase + 1] = pd.y;
            _dsStateF32[sBase + 2] = pd.wx || 0;
            _dsStateF32[sBase + 3] = pd.wy || 0;
            _dsStateF32[sBase + 4] = m;
            _dsStateF32[sBase + 5] = q;
            _dsStateF32[sBase + 6] = angw;
            _dsStateF32[sBase + 7] = bm;
            _dsStateU32[sBase + 8] = flagBits;

            // Pack ParticleAux (5 × 4 bytes = 20)
            const aBase = idx * 5;
            _dsAuxF32[aBase + 0] = Math.cbrt(m);  // radius
            _dsAuxU32[aBase + 1] = idx;            // particleId
            _dsAuxF32[aBase + 2] = 3.4028235e38;  // deathTime = FLT_MAX (alive)
            _dsAuxF32[aBase + 3] = 0;              // deathMass
            _dsAuxF32[aBase + 4] = 0;              // deathAngVel

            // Pack color (1 u32)
            _dsColorData[idx] = _DEFAULT_SLATE_ABGR; // default slate (update-colors will refresh)

            // Pack axYukMod (4 f32 = 16 bytes), as cacheDerived resets it
            const mBase = idx * 4;
            _dsModData[mBase + 0] = 1.0;
            _dsModData[mBase + 1] = 1.0;
            _dsModData[mBase + 2] = 1.0;
            _dsModData[mBase + 3] = 0.0;

            // RadiationState: all zero (accumulator reset)
            const rBase = idx * RADIATION_STATE_WORDS;
            for (let k = 0; k < RADIATION_STATE_WORDS; k++) _dsRadData[rBase + k] = 0;

            // Clock: τ, ring phase, θ, lapse
            const tau = pd.tau || 0;
            _dsClockData[idx * 4 + 0] = tau;
            _dsClockData[idx * 4 + 1] = tau - CLOCK_PERIOD * Math.floor(tau / CLOCK_PERIOD);
            _dsClockData[idx * 4 + 2] = pd.theta || 0;
            _dsClockData[idx * 4 + 3] = 1;

            // World-line meta (shared-worldline.wgsl): writeIdx, count, creation time,
            // generation, identity deck
            const hBase = idx * WL_META_STRIDE;
            _dsMetaU32.fill(0, hBase, hBase + WL_META_STRIDE);
            _dsMetaU32[hBase + 0] = 1;          // writeIdx (the birth sample is written below)
            _dsMetaU32[hBase + 1] = 1;          // count
            _dsMetaF32[hBase + 2] = -Infinity;  // creationTime — always existing particle
            _dsMetaU32[hBase + 3] = ++this._slotGeneration[idx];
        }

        if (count > 0) {
            const b = this.buffers;
            // Issue one writeBuffer per buffer type (6 calls total instead of N×6).
            // ArrayBuffer args: (buffer, bufferByteOffset, arrayBuffer, byteOffset, byteLength)
            // TypedArray args:  (buffer, bufferByteOffset, typedArray, elementOffset, elementCount)
            this.device.queue.writeBuffer(b.particleState,  0, _dsStateData,  0, count * PARTICLE_STATE_SIZE);   // ArrayBuffer, bytes
            this.device.queue.writeBuffer(b.particleAux,    0, _dsAuxData,    0, count * PARTICLE_AUX_SIZE);      // ArrayBuffer, bytes
            this.device.queue.writeBuffer(b.color,          0, _dsColorData,  0, count);                          // Uint32Array, elements (1 u32 per particle)
            this.device.queue.writeBuffer(b.axYukMod,       0, _dsModData,    0, count * 4);                      // Float32Array, elements (4 f32 per particle)
            this.device.queue.writeBuffer(b.radiationState, 0, _dsRadData,    0, count * RADIATION_STATE_WORDS);  // Float32Array, elements (RADIATION_STATE_WORDS f32 per particle)
            this.device.queue.writeBuffer(b.wlMeta, 0, _dsMetaData, 0, count * WL_META_STRIDE * 4);          // ArrayBuffer, bytes
            this.device.queue.writeBuffer(b.clocks, 0, _dsClockData, 0, count * 4);                            // Float32Array, elements
        }
        for (let idx = 0; idx < count; idx++) {
            const pd = particles[idx];
            this._writeBirthSample(idx, pd.x, pd.y, pd.wx || 0, pd.wy || 0, pd.mass || 1, pd.charge || 0,
                pd.angw || 0, pd.tau || 0, pd.theta || 0);
            // A prescribed body keeps its curve, and its past is the curve's
            if (pd.curve) {
                const c = { ...pd.curve, t0: pd.curve.t0 + this.conformalTime };
                this.prescribed.set(idx, c);
                this._writeCurve(idx);
                this._writePast(idx, c, pd.mass || 1, pd.charge || 0, pd.angw || 0, pd.theta || 0);
            }
        }
        if (this.prescribed.size > 0) this._writePrescribedList();

        this.aliveCount = count;

        // Restore slider parameters from save state
        for (const [key, slot] of Object.entries(GPU_PARAMETER_SLOTS)) {
            if (state[key] !== undefined && state[key] !== null) this[slot] = state[key];
        }
        this._cachedExtGx = (this._extGravity || 0) * Math.cos(this._extGravityAngle || 0);
        this._cachedExtGy = (this._extGravity || 0) * Math.sin(this._extGravityAngle || 0);
        this._cachedExtEx = (this._extElectric || 0) * Math.cos(this._extElectricAngle || 0);
        this._cachedExtEy = (this._extElectric || 0) * Math.sin(this._extElectricAngle || 0);

        this.syncUniforms();
        return true;
    }

    reset() {
        this._resetGen++;
        // The event counters outlive the bodies: a frame without bodies runs no collision pass
        // to reset them, so the frame readback would replay the last merge into the new scene
        {
            const enc = this.device.createCommandEncoder({ label: 'reset-events' });
            enc.clearBuffer(this.buffers.mergeResultCounter, 0, 4);
            if (this._kbBuffers) enc.clearBuffer(this._kbBuffers.counter, 0, 4);
            this.device.queue.submit([enc.finish()]);
        }
        this.aliveCount = 0;
        this._treeLatched = false;
        // An emptied store gives its memory back
        if (this._ready && this.buffers.storeCapacity > STORE_TIERS[0]) this._resizeStore(STORE_TIERS[0], false);
        this.simTime = 0;
        this.conformalTime = 0;
        this.timeEpoch = 0;
        this.cosmology.reset();
        this._higgsQuench = null;
        this.setComovingDomain(this.comovingW, this.comovingH);
        this.ledger = Object.assign({}, EMPTY_LEDGER);
        this._peScale = null;
        this._lnrPending = 0;
        this._statsLedger = null;
        this.stateVersion++;
        this._stepsSinceChange = 0;
        this.resetGen++;
        if (this._cosmoAccum) this.device.queue.writeBuffer(this._cosmoAccum, 0, new Uint32Array(8));
        this._nextWorldLineTime = 0;
        this._frameCount = 0;
        this._heatmapFrame = 0;
        this.heatmapReadback = null;
        this._heatmapCopyMeta = null;
        this._pendingMergeEvents = [];
        this._pendingKugelblitzEvents = [];
        this._cpuFreeSlots = [];
        this.prescribed.clear();
        this.held = null;
        this._letGo = null;
        this._writePrescribedList();
        this.device.queue.writeBuffer(this.buffers.agentAccum, 0, new Float32Array(4));
        // Reset GPU free stack (reuse pre-allocated zero buffer)
        if (this.buffers.freeTop) {
            this.device.queue.writeBuffer(this.buffers.freeTop, 0, _zeroU32);
        }
        this.resetFields();
        // Clear boson pools (reuse pre-allocated zero buffer)
        if (this.buffers.phCount) {
            this.device.queue.writeBuffer(this.buffers.phCount, 0, _zeroU32);
        }
        if (this.buffers.piCount) {
            this.device.queue.writeBuffer(this.buffers.piCount, 0, _zeroU32);
        }
        // Clear the heatmap buffers (batch into one encoder/submit)
        if (this._heatmapBuffers) {
            const enc = this.device.createCommandEncoder({ label: 'clearReset' });
            if (this._heatmapBuffers) {
                enc.clearBuffer(this._heatmapBuffers.gravPotential);
                enc.clearBuffer(this._heatmapBuffers.magField);
                enc.clearBuffer(this._heatmapBuffers.elecField);
                enc.clearBuffer(this._heatmapBuffers.elecPotential);
                enc.clearBuffer(this._heatmapBuffers.yukawaPotential);
                enc.clearBuffer(this._heatmapBuffers.output);
            }
            this.device.queue.submit([enc.finish()]);
        }
    }

    /**
     * Sync all toggle/slider state to the GPU uniforms buffer.
     * Called once per frame before compute dispatch.
     */
    syncUniforms() {
        writeFrameUniforms(this.device, this.uniformBuffer, {
            dt: 0,
            simTime: this.gpuTime,
            domainW: this.domainW,
            domainH: this.domainH,
            aliveCount: this.aliveCount,
            toggles0: this._toggles0,
            toggles1: this._toggles1,
            boundaryMode: this.boundaryMode,
            topologyMode: this.topologyMode,
            collisionMode: this._collisionMode,
            bounceFriction: this._bounceFriction,
            yukawaCoupling: this._yukawaCoupling,
            yukawaMu: this._yukawaMu,
            higgsMass: this._higgsMass,
            axionMass: this._axionMass,
            higgsCoupling: this._higgsCoupling,
            axionCoupling: this._axionCoupling,
            extGravity: this._extGravity,
            extGravityAngle: this._extGravityAngle,
            extElectric: this._extElectric,
            extElectricAngle: this._extElectricAngle,
            extBz: this._extBz,
            extGx: this._cachedExtGx,
            extGy: this._cachedExtGy,
            extEx: this._cachedExtEx,
            extEy: this._cachedExtEy,
            maxParticles: this.buffers.storeCapacity,
            particleCount: this.aliveCount + this._ghostSlots(),
            bhTheta: this.forceSum.theta,
            frameCount: this._frameCount,
        });
    }

    /** Reset field buffers to vacuum on preset load */
    resetFields() {
        if (this._higgsBuffers) this._initFieldToVacuum('higgs');
        if (this._axionBuffers) this._initFieldToVacuum('axion');
    }

    /**
     * Queue a GPU hit test. Dispatches the hit test compute shader and starts
     * async readback. Result available via readHitResult() once ready.
     * Uses BH tree when available, falls back to O(N) linear scan.
     */
    hitTest(worldX, worldY) {
        if (!this._hitTestPipeline || !this._hitUniformBuffer) return;
        if (this._hitPending) return; // don't queue while readback is in flight

        // Write click coordinates + aliveCount to uniform
        _hitUniformF32[0] = worldX;
        _hitUniformF32[1] = worldY;
        _hitUniformU32[2] = this.aliveCount;
        _hitUniformU32[3] = 0;
        this.device.queue.writeBuffer(this._hitUniformBuffer, 0, _hitUniformData);

        // Dispatch single-thread compute, the search widened by the last substep's largest radius
        const encoder = this.device.createCommandEncoder({ label: 'hitTest' });
        encoder.copyBufferToBuffer(this.buffers.radiusMax, 0, this._hitUniformBuffer, 12, 4);
        const pass = encoder.beginComputePass({ label: 'hitTest' });
        pass.setPipeline(this._hitTestPipeline);
        pass.setBindGroup(0, this._hitTestBindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();

        // Copy result to staging for readback
        encoder.copyBufferToBuffer(this._hitResultBuffer, 0, this._hitResultStaging, 0, 48);
        this.device.queue.submit([encoder.finish()]);

        // Async readback
        this._hitPending = true;
        this._hitResultStaging.mapAsync(GPUMapMode.READ).then(() => {
            const buf = this._hitResultStaging.getMappedRange().slice(0);
            this._hitResultStaging.unmap();
            this._hitStagingI32 = new Int32Array(buf);
            this._hitStagingF32 = new Float32Array(buf);
            this._hitResultReady = true;
            this._hitPending = false;
        }).catch(() => {
            this._hitPending = false;
        });
    }

    /**
     * Read the result of a previously queued GPU hit test.
     * Returns null if not ready yet, or an object:
     *   { index, mass, charge, radius, velX, velY, angVel, posX, posY, antimatter }
     * index is -1 if no particle was hit.
     */
    readHitResult() {
        if (!this._hitResultReady || !this._hitStagingI32) return null;
        this._hitResultReady = false;
        const idx = this._hitStagingI32[0];
        if (idx < 0) return { index: -1 };
        const f = this._hitStagingF32;
        return {
            index: idx,
            antimatter: (this._hitStagingI32[9] & FLAG_ANTIMATTER) !== 0,
            mass: f[1],
            charge: f[2],
            radius: f[3],
            velX: f[4],
            velY: f[5],
            angVel: f[6],
            posX: f[7],
            posY: f[8],
        };
    }

    /** Rebuild group 1 bind group for stats shader (field buffers). Call when fields toggle. */
    _rebuildStatsFieldBindGroup() {
        if (!this._statsGroup1Layout) return;
        const dummy = this._statsDummyBuffer;
        const hb = this._higgsBuffers;
        const ab = this._axionBuffers;
        this._statsBindGroup1 = this.device.createBindGroup({
            label: 'computeStats_g1',
            layout: this._statsGroup1Layout,
            entries: [
                { binding: 0, resource: { buffer: hb ? hb.field : dummy } },
                { binding: 1, resource: { buffer: hb ? hb.fieldDot : dummy } },
                { binding: 2, resource: { buffer: ab ? ab.field : dummy } },
                { binding: 3, resource: { buffer: ab ? ab.fieldDot : dummy } },
            ],
        });
    }

    /**
     * Dispatch the stats compute shader and start async readback.
     * @param {number} selectedGpuIdx  GPU buffer index of selected particle, or -1
     * @returns {boolean} false if skipped (not ready, or a readback still in flight)
     */
    requestStats(selectedGpuIdx = -1) {
        if (!this._statsPipelines || !this._statsUniformBuffer) return false;
        if (this._statsPending) return false; // readback still in flight

        // Write uniforms (StatsUniforms: 48 bytes = 12 u32/f32)
        _statsUniformU32[0] = this.aliveCount;
        _statsUniformI32[1] = selectedGpuIdx;
        _statsUniformU32[2] = this._toggles0;
        _statsUniformF32[3] = this.domainW;
        _statsUniformF32[4] = this.domainH;
        _statsUniformF32[5] = this._yukawaMu;
        _statsUniformF32[6] = this._higgsMass;
        _statsUniformF32[7] = this._axionMass || 0.05;
        _statsUniformU32[8] = FIELD_GRID_RES; // fieldGridRes (GPU_SCALAR_GRID)
        _statsUniformU32[9] = this.boundaryMode;
        _statsUniformU32[10] = this.topologyMode;
        _statsUniformU32[11] = 0;
        this.device.queue.writeBuffer(this._statsUniformBuffer, 0, _statsUniformData);

        // Rebuild field bind group if needed (field buffers may have been lazily allocated)
        if (!this._statsBindGroup1 ||
            (this._higgsBuffers && !this._statsFieldHasHiggs) ||
            (this._axionBuffers && !this._statsFieldHasAxion)) {
            this._rebuildStatsFieldBindGroup();
            this._statsFieldHasHiggs = !!this._higgsBuffers;
            this._statsFieldHasAxion = !!this._axionBuffers;
        }

        // Each pass writes per-workgroup partials and statsReduce adds them in a fixed order
        // (compute-stats.wgsl); the workgroup counts follow from the aliveCount written above
        const encoder = this.device.createCommandEncoder({ label: 'computeStats' });
        const sp = this._statsPipelines;
        const n = this.aliveCount;
        const statsPass = (label, pipeline, workgroups) => {
            const p = encoder.beginComputePass({ label });
            p.setPipeline(pipeline);
            p.setBindGroup(0, this._statsBindGroup0);
            p.setBindGroup(1, this._statsBindGroup1);
            p.dispatchWorkgroups(workgroups);
            p.end();
        };
        if (n > 0) {
            // KE, momentum, mass moments, angular momentum, the particle-field interaction,
            // the reference body: 64 bodies a workgroup
            statsPass('statsBodies', sp.statsBodies, Math.ceil(n / 64));
            // The pairs: OBSERVERS_PER_GROUP rows a workgroup
            statsPass('statsPE', sp.statsPE, Math.ceil(n / OBSERVERS_PER_GROUP));
        }
        // The scalar fields' energy and momentum, a cell a thread
        if (this._toggles0 & (HIGGS_BIT | AXION_BIT)) {
            statsPass('statsField', sp.statsField, STATS_LAYOUT.fieldGroups);
        }
        // The boson pools and pending radiation (bodies below the aliveCount)
        _ledgerAU32[1] = n;
        this.device.queue.writeBuffer(this._ledgerAUniform, 0, _ledgerAData);
        const p5 = encoder.beginComputePass({ label: 'statsBosons' });
        p5.setPipeline(this._ledgerPipelines.stats);
        p5.setBindGroup(0, this._ledgerBindGroup);
        p5.dispatchWorkgroups(STATS_LAYOUT.ledgerGroups);
        p5.end();
        // The partials in order, the selected particle and the reference body
        statsPass('statsReduce', sp.statsReduce, 1);
        // The ledger's accumulators since the last readback
        encoder.copyBufferToBuffer(this._cosmoAccum, 0, this.buffers.statsBuffer, 96 * 4, 32);
        encoder.clearBuffer(this._cosmoAccum);
        encoder.copyBufferToBuffer(this.buffers.agentAccum, 0, this.buffers.statsBuffer, 104 * 4, 16);
        encoder.clearBuffer(this.buffers.agentAccum);

        // Copy to staging (double-buffered)
        const staging = this._statsStagingFlip
            ? this.buffers.statsStagingB
            : this.buffers.statsStagingA;
        this._statsStagingFlip = !this._statsStagingFlip;
        encoder.copyBufferToBuffer(this.buffers.statsBuffer, 0, staging, 0, 512);
        this.device.queue.submit([encoder.finish()]);

        // Async readback
        this._statsPending = true;
        const statsA = this.scaleA, gen = this.resetGen;
        // Current: no state change since the request, and at least one step before it
        const version = this._stepsSinceChange > 0 ? this.stateVersion : -1;
        // The readback describes the state at the request: its a, and the ledger then
        const ledgerThen = { ...this.ledger };
        staging.mapAsync(GPUMapMode.READ).then(() => {
            this._statsData = new Float32Array(staging.getMappedRange().slice(0));
            this._statsDataVersion = version;
            this._statsScaleA = statsA;
            // The ledger words belong to the state before a reset when one intervened
            if (gen === this.resetGen) {
                this._absorbLedger(this._statsData, statsA, ledgerThen);
                this._statsLedger = ledgerThen;
            }
            this._statsDataSel = selectedGpuIdx;
            staging.unmap();
            this._statsResultReady = true;
            this._statsPending = false;
        }).catch(() => {
            this._statsPending = false;
        });
        return true;
    }

    /**
     * Read the result of a previously requested stats computation.
     * Returns null if not ready, or an object with aggregate stats + selected particle data.
     */
    readStats() {
        if (!this._statsResultReady || !this._statsData) return null;
        this._statsResultReady = false;
        const d = this._statsData;
        const result = {
            linearKE: d[0], spinKE: d[1],
            px: d[2], py: d[3],
            orbitalAngMom: d[4], spinAngMom: d[5],
            comX: d[6], comY: d[7],
            totalMass: d[8], aliveCount: d[9],
            pe: d[10],
            fieldEnergy: d[11], // Darwin
            fieldPx: d[12], fieldPy: d[13], // Darwin momentum
            higgsFieldEnergy: d[14], axionFieldEnergy: d[15],
            pfiEnergy: d[16] + d[17], // higgs + axion particle-field interaction
            scalarFieldMomX: d[18], scalarFieldMomY: d[19],
            photonE: d[20], photonPx: d[21], photonPy: d[22],
            pionE: d[23], pionPx: d[24], pionPy: d[25],
            pendingRadiation: d[27],
            peScale: d[26],
            ledger: this._statsLedger ?? this.ledger,
            scaleA: this._statsScaleA ?? this.scaleA,
            current: this._statsDataVersion === this.stateVersion,
            selectedIdx: this._statsDataSel, // the selection this readback describes
            selected: null,
            reference: null,
        };

        // Selected particle data at offset 32 (mass = -1 signals no selection)
        if (d[36] > 0) {
            const flags = new Uint32Array(d.buffer, 40 * 4, 1)[0];
            result.selected = {
                posX: d[32], posY: d[33],
                velWX: d[34], velWY: d[35],
                mass: d[36], charge: d[37],
                angW: d[38], baseMass: d[39],
                flags,
                radius: d[41],
                velX: d[42], velY: d[43],
                angVel: d[44],
                magMoment: d[45], angMomentum: d[46],
                antimatter: d[47] > 0.5,
                forceGravity:    { x: d[48], y: d[49] },
                forceCoulomb:    { x: d[50], y: d[51] },
                forceMagnetic:   { x: d[52], y: d[53] },
                forceGravitomag: { x: d[54], y: d[55] },
                force1PN:        { x: d[56], y: d[57] },
                forceSpinCurv:   { x: d[58], y: d[59] },
                forceRadiation:  { x: d[60], y: d[61] },
                forceYukawa:     { x: d[62], y: d[63] },
                forceExternal:   { x: d[64], y: d[65] },
                forceHiggs:      { x: d[66], y: d[67] },
                forceAxion:      { x: d[68], y: d[69] },
                tau: d[73], lapse: d[74], theta: d[75],
            };
        }
        if (d[84] > 0) {
            result.reference = {
                index: new Uint32Array(d.buffer, 91 * 4, 1)[0],
                posX: d[80], posY: d[81],
                velX: d[82], velY: d[83],
                mass: d[84], charge: d[85],
                angVel: d[86], magMoment: d[87], angMomentum: d[88],
                radius: d[89],
            };
        }
        return result;
    }

    /**
     * Get the count of alive particles.
     * @returns {number}
     */
    getParticleCount() {
        return this.aliveCount;
    }

    destroy() {
        const _d = b => { if (b) b.destroy(); };
        const _dObj = o => { if (o) Object.values(o).forEach(_d); };

        // Core buffers
        this.buffers.destroy();
        this.uniformBuffer.destroy();
        _d(this._qtBoundsSrc);

        // Scalar field buffers
        _dObj(this._higgsBuffers);
        _dObj(this._axionBuffers);
        _dObj(this._gravGrid);
        _d(this._atomicGrid);
        _d(this._fieldUniformBuffer);
        _d(this._higgsUniformBuffer);
        _d(this._axionUniformBuffer);
        _d(this._dummyFieldBuffer);
        _d(this._fieldParticleGravUniform);

        // Heatmap
        _dObj(this._heatmapBuffers);
        _d(this._heatmapUniformBuffer);
        _d(this._heatmapStaging);

        // Excitation
        _dObj(this._excitationBuffers);
        _d(this._bosonDispatchArgs);

        // Expansion
        _d(this._expansionUniformBuffer);
        _d(this._cosmoAccum);
        if (this.lensBuffers) Object.values(this.lensBuffers).forEach(_d);

        // FFT
        _d(this._fftParamsBuffer);

        // Update colors
        _d(this._colorUniformBuffer);

        // Hit test
        _d(this._hitUniformBuffer);
        _d(this._hitResultBuffer);
        _d(this._hitResultStaging);

        // Stats
        _d(this._statsUniformBuffer);
        _d(this._statsDummyBuffer);
        _d(this._photonScratch);
        _d(this._pionScratch);

        // Null out references
        this._higgsBuffers = null;
        this._axionBuffers = null;
        this._gravGrid = null;
        this._gravBGs = null;
        this._atomicGrid = null;
        this._heatmapBuffers = null;
        this._excitationBuffers = null;
        this._extremalBGs = null;
        this._bosonDispatchArgs = null;
        this._bosonDispatchArgsBG = null;
        this._fieldUniformBuffer = null;
        this._higgsUniformBuffer = null;
        this._axionUniformBuffer = null;
        this._dummyFieldBuffer = null;
        this._fieldParticleGravUniform = null;
        this._heatmapUniformBuffer = null;
        this._expansionUniformBuffer = null;
        this._fftParamsBuffer = null;
        this._colorUniformBuffer = null;
        this._hitUniformBuffer = null;
        this._hitResultBuffer = null;
        this._hitResultStaging = null;
        this._statsUniformBuffer = null;
        this._statsDummyBuffer = null;
        this._qtBoundsSrc = null;
    }
}

// Flag constants (must match common.wgsl)
const FLAG_ALIVE = 1;
const FLAG_RETIRED = 2;
const FLAG_ANTIMATTER = 4;

// fetchShader imported from gpu-pipelines.js (single source of truth)

installFieldMethods(GPUPhysics);
