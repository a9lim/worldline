/**
 * @fileoverview GPU buffer allocation for particle state.
 *
 * Creates and manages all GPUBuffer instances for the particle system.
 * Buffers are fixed-capacity (MAX_PARTICLES), indexed by particle slot.
 *
 * Packed struct buffers reduce storage buffer count per shader stage:
 *   ParticleState  (36 bytes) — posX,posY,velWX,velWY,mass,charge,angW,baseMass,flags
 *   ParticleAux    (20 bytes) — radius,particleId,deathTime,deathMass,deathAngVel
 *   RadiationState (40 bytes) — accumulators,display,quadrupole contrib
 *   Photon         (32 bytes) — pos,vel,energy,emitterId,lifetime,flags
 *   Pion           (48 bytes) — pos,w,mass,charge,energy,emitterId,age,flags,pad
 */

import {
    WORLDLINE_LEN, GPU_MAX_PHOTONS, GPU_MAX_PIONS,
    GPU_SCALAR_GRID, GPU_MAX_LEPTONS, GPU_MAX_PARTICLES,
} from '../config.js';
import { WL_STRIDE, WL_META_STRIDE, STATS_LAYOUT } from './gpu-constants.js';

// Quadtree node size in bytes (20 u32 words = 80 bytes, must match tree-build.wgsl)
const QTNODE_SIZE_BYTES = 80;

// Packed struct sizes (must match common.wgsl struct definitions)
const PARTICLE_STATE_SIZE = 36;  // 9 × 4 bytes
const PARTICLE_AUX_SIZE = 20;   // 5 × 4 bytes
const RADIATION_STATE_SIZE = 40; // 10 × 4 bytes (accumulators + display + quadrupole scratch)
const PHOTON_SIZE = 32;          // 8 × 4 bytes
const PION_SIZE = 48;            // 12 × 4 bytes
const MERGE_RESULT_SIZE = 32;    // 2 × vec4: x,y,energy,type + px,py,pad,pad
const DERIVED_SIZE = 32;         // 8 × f32 (ParticleDerived)
const VEC2_SIZE = 8;             // 2 × f32
const VEC4_SIZE = 16;            // 4 × f32
const ALLFORCES_SIZE = 160;      // 10 × vec4

/** The capacities the world-line store grows through (GPUPhysics._growStore), the last the cap. */
export const STORE_TIERS = [512, 1024, 2048, 4096];

/**
 * The world lines and the per-pair light-cone hints for `capacity` slots: 48 KB a slot and
 * capacity² hints, so they grow with the slots in use while everything else is allocated at
 * the cap. A slot's ring sits at the same offset at every capacity.
 * @param {GPUDevice} device
 */
export function createWorldLineStore(device, capacity) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    return {
        wlData: device.createBuffer({ label: 'wlData', size: WL_STRIDE * 4 * capacity * WORLDLINE_LEN, usage }),
        // Per-pair light-cone search hints (pair-force.wgsl): the bracket's distance back from
        // the last world-line point, source-major. Any value is safe; 0 means none yet.
        wlHints: device.createBuffer({ label: 'wlHints', size: 4 * capacity * capacity, usage }),
    };
}

/** @param {GPUDevice} device */
export function createParticleBuffers(device, maxParticles, storeCapacity = maxParticles) {
    const FLOAT_SIZE = 4;
    const UINT_SIZE = 4;

    // Total SoA capacity: MAX_PARTICLES * 2 to accommodate ghost entries appended after alive particles
    const soaCapacity = maxParticles * 2;

    /**
     * Helper: create a storage buffer with COPY_SRC for readback.
     * @param {string} label
     * @param {number} elementSize - bytes per element
     * @param {number} count
     */
    function storageBuffer(label, elementSize, count) {
        return device.createBuffer({
            label,
            size: elementSize * count,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
    }

    // ── Packed particle struct buffers ──

    // ParticleState (36 bytes): posX,posY,velWX,velWY,mass,charge,angW,baseMass,flags
    // Sized for particles + ghosts
    const particleState = storageBuffer('particleState', PARTICLE_STATE_SIZE, soaCapacity);

    // ParticleAux (20 bytes): radius,particleId,deathTime,deathMass,deathAngVel
    // Sized for particles + ghosts
    const particleAux = storageBuffer('particleAux', PARTICLE_AUX_SIZE, soaCapacity);

    // Packed derived state: ParticleDerived struct (32 bytes per particle)
    // Replaces: magAngMom, invMassRadSq, vel, angVel (4 buffers → 1)
    const derived = storageBuffer('derived', DERIVED_SIZE, soaCapacity);

    // Packed axMod + yukMod + higgsMod (vec4, 16 bytes per particle)
    const axYukMod = storageBuffer('axYukMod', VEC4_SIZE, soaCapacity);

    // Packed AllForces struct (160 bytes per particle)
    // Replaces: forces0-5, torques, bFields, bFieldGrads, totalForce (10 buffers → 1)
    const allForces = storageBuffer('allForces', ALLFORCES_SIZE, maxParticles);

    // Particle color (u32 per particle, not packed — only used by renderer)
    const color = storageBuffer('color', UINT_SIZE, maxParticles);

    // Proper-time clocks (clocks.wgsl): τ, clock-ring phase, spoke angle θ, lapse dτ/dt
    const clocks = storageBuffer('clocks', VEC4_SIZE, maxParticles);

    // World lines (worldline.wgsl): WL_STRIDE f32 per sample, WORLDLINE_LEN samples per
    // particle (~25 MB at 512 particles), at the store's capacity, plus WL_META_STRIDE u32 of
    // ring metadata for every slot
    const { wlData, wlHints } = createWorldLineStore(device, storeCapacity);
    const wlMeta = storageBuffer('wlMeta', WL_META_STRIDE * 4, maxParticles);

    // ── Radiation state (packed struct) ──
    // RadiationState (40 bytes): accumulators, display, quadrupole contrib
    const radiationState = storageBuffer('radiationState', RADIATION_STATE_SIZE, maxParticles);

    // ── Quadrupole radiation reduction buffer ──
    // Workgroup partial sums for 2-pass reduction. Layout:
    //   [0 .. MAX_WG*4): CoM pass: {comXw, comYw, totalMass, totalKE} per workgroup
    //   [MAX_WG*4 .. MAX_WG*12): Contrib pass: {d3Ixx,d3Ixy,d3Iyy, d3Qxx,d3Qxy,d3Qyy, totalD3I,totalD3Q} per wg
    const MAX_QUAD_WG = Math.ceil(maxParticles / 64);
    const quadReductionBuf = storageBuffer('quadReduction', 4, MAX_QUAD_WG * 12); // f32 elements

    // ── Ghost generation ──
    // Ghost particle counter (single atomic u32)
    const ghostCounter = device.createBuffer({
        label: 'ghostCounter',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // The largest body radius this substep, as f32 bits (ghost-gen's maxRadius; positive
    // floats order like their bits): sizes the ghost margin, the collision search and hit tests
    const radiusMax = device.createBuffer({
        label: 'radiusMax',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // Ghost output struct buffers (separate from particle buffers to avoid aliasing)
    // After dispatch, ghost data is copied into the main arrays at offset aliveCount.
    const ghostState = storageBuffer('ghostState', PARTICLE_STATE_SIZE, maxParticles);
    const ghostAux = storageBuffer('ghostAux', PARTICLE_AUX_SIZE, maxParticles);
    const ghostDerived = storageBuffer('ghostDerived', DERIVED_SIZE, maxParticles);

    // Ghost original index mapping (which alive particle each ghost copies)
    const ghostOriginalIdx = storageBuffer('ghostOriginalIdx', UINT_SIZE, maxParticles);


    // ── Quadtree buffers (tree-build.wgsl) ──
    // Each node is 20 u32 words = 80 bytes. The tree holds alive and retired bodies and the
    // ghosts (up to maxParticles of each), sorted into keys of a power-of-two length: binary
    // internal node i is node i and sorted body k is node nActive − 1 + k, under 2·TREE_KEYS.
    const QT_NODE_SIZE = 80; // bytes (20 x u32)
    const TREE_KEYS = Math.max(1024, 2 ** Math.ceil(Math.log2(2 * maxParticles)));
    const QT_MAX_NODES = 2 * TREE_KEYS;

    // Node buffer: flat array of u32, written atomically while the tree is built
    const qtNodeBuffer = device.createBuffer({
        label: 'qtNodes',
        size: QT_NODE_SIZE * QT_MAX_NODES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // The number of bodies in the tree (atomic u32), counted as their keys are made
    const qtNodeCounter = device.createBuffer({
        label: 'qtNodeCounter',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // Bounds: the reduction (minX, minY, maxX, maxY as fixed-point i32 atomics), then the
    // padded root box (minX, minY, width, height as f32 bits)
    const qtBoundsBuffer = device.createBuffer({
        label: 'qtBounds',
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // Children per node, the arrivals the bottom-up sum waits for (one u32 per node)
    const qtVisitorFlags = device.createBuffer({
        label: 'qtVisitorFlags',
        size: 4 * QT_MAX_NODES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // The sort's (Morton code, slot) pairs and the binary radix tree, 6 u32 per internal node
    const treeKeys = storageBuffer('treeKeys', 8, TREE_KEYS);
    const treeRadix = storageBuffer('treeRadix', 24, TREE_KEYS);

    // Pool management: aliveCount + freeStack + freeTop
    // Packed into one buffer: [aliveCount: u32, freeTop: u32, freeStack: u32[maxParticles]]
    const poolMgmt = storageBuffer('poolMgmt', UINT_SIZE, maxParticles + 2);

    // Stats: 128 f32 of results (read back, double-buffered), then the stats passes'
    // per-workgroup partials (STATS_LAYOUT, compute-stats.wgsl)
    const STATS_BUFFER_SIZE = 512; // 128 f32
    const statsBuffer = device.createBuffer({
        label: 'statsBuffer',
        size: STATS_LAYOUT.words * 4,
        // COPY_DST: the stats pass copies the ledger accumulators in (gpu-physics.js requestStats)
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const statsStagingA = device.createBuffer({
        label: 'statsStagingA',
        size: STATS_BUFFER_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const statsStagingB = device.createBuffer({
        label: 'statsStagingB',
        size: STATS_BUFFER_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // ── Collision buffers (Phase 3: collision detection/resolution) ──
    const collisionPairBuffer = device.createBuffer({
        label: 'collisionPairs',
        size: 8 * maxParticles,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const collisionPairCounter = device.createBuffer({
        label: 'collisionPairCounter',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const mergeResultBuffer = device.createBuffer({
        label: 'mergeResults',
        size: MERGE_RESULT_SIZE * maxParticles,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const mergeResultCounter = device.createBuffer({
        label: 'mergeResultCounter',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    const collisionClaims = device.createBuffer({
        label: 'collisionClaims',
        size: 4 * maxParticles,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });



    // Free stack for slot reuse (managed by dead GC shader)
    const freeStack = storageBuffer('freeStack', UINT_SIZE, maxParticles);
    const freeTop = device.createBuffer({
        label: 'freeTop',
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // ── Phase 4: 1PN velocity-Verlet correction ──
    const f1pnOld = storageBuffer('f1pnOld', FLOAT_SIZE, maxParticles * 2);

    // Max acceleration for adaptive substepping (single u32, atomicMax in force shader)
    const maxAccelBuffer = storageBuffer('maxAccel', UINT_SIZE, 1);

    // ── Boson pool buffers (Phase 4: packed photon/pion structs) ──
    // Photon pool: array<Photon, GPU_MAX_PHOTONS> (32 bytes each)
    const photonPool = storageBuffer('photonPool', PHOTON_SIZE, GPU_MAX_PHOTONS);
    const phCount = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        label: 'phCount',
    }); // atomic<u32>

    // Pion pool: shared buffer for pions + leptons (48 bytes each)
    const PION_POOL_CAP = GPU_MAX_PIONS + GPU_MAX_LEPTONS;
    const pionPool = storageBuffer('pionPool', PION_SIZE, PION_POOL_CAP);
    const piCount = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        label: 'piCount',
    }); // atomic<u32>

    // Pion annihilation claim buffer: atomic CAS to prevent double-annihilation races
    const pionClaims = device.createBuffer({
        size: 4 * PION_POOL_CAP,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'pionClaims',
    });

    // Absorption claims (boson-absorb.wgsl): per-body claim counts, then each photon's and
    // each pion-pool entry's absorber (slot + 1, or 0). Zeroed at creation; the counts are
    // cleared as they are applied and the entries rewritten by every claim pass.
    const absorbClaims = device.createBuffer({
        size: 4 * (GPU_MAX_PARTICLES + GPU_MAX_PHOTONS + PION_POOL_CAP),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        label: 'absorbClaims',
    });

    // ── Boson tree buffers (tree-build.wgsl over tree-items-bosons.wgsl) ──
    const BOSON_TREE_KEYS = Math.max(1024, 2 ** Math.ceil(Math.log2(GPU_MAX_PHOTONS + PION_POOL_CAP)));
    const MAX_BOSON_NODES = 2 * BOSON_TREE_KEYS;
    const bosonTreeKeys = storageBuffer('bosonTreeKeys', 8, BOSON_TREE_KEYS);
    const bosonTreeRadix = storageBuffer('bosonTreeRadix', 24, BOSON_TREE_KEYS);
    const bosonTreeBounds = storageBuffer('bosonTreeBounds', 4, 8);
    const bosonTreeNodes = device.createBuffer({
        size: MAX_BOSON_NODES * QTNODE_SIZE_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        label: 'bosonTreeNodes'
    });
    const bosonTreeCounter = device.createBuffer({
        size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'bosonTreeCounter'
    });
    const bosonVisitorFlags = device.createBuffer({
        label: 'bosonVisitorFlags',
        size: MAX_BOSON_NODES * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    return {
        maxParticles,
        soaCapacity,
        // Packed particle structs
        particleState, particleAux,
        // Derived (packed struct)
        derived, axYukMod,
        // Color (separate — renderer only)
        color,
        // Clocks and world lines
        clocks, wlData, wlMeta, wlHints, storeCapacity,
        // Forces (packed AllForces struct)
        allForces,
        // Radiation (packed RadiationState struct)
        radiationState,
        // Quadrupole reduction (workgroup partial sums)
        quadReductionBuf, MAX_QUAD_WG,
        // Pool
        poolMgmt,
        // Stats
        statsBuffer, statsStagingA, statsStagingB,
        // Adaptive substepping
        maxAccelBuffer,
        // Ghost generation
        ghostCounter, ghostOriginalIdx, radiusMax,
        ghostState, ghostAux, ghostDerived,
        // Quadtree (Phase 3)
        qtNodeBuffer, qtNodeCounter, qtBoundsBuffer, qtVisitorFlags,
        QT_MAX_NODES, TREE_KEYS, treeKeys, treeRadix,
        // Collision (Phase 3)
        collisionPairBuffer, collisionPairCounter,
        mergeResultBuffer, mergeResultCounter,
        collisionClaims,
        // Free stack (Phase 3: dead particle GC)
        freeStack, freeTop,
        // 1PN VV correction (Phase 4)
        f1pnOld,
        // Photon pool (Phase 4, packed struct)
        photonPool, phCount,
        GPU_MAX_PHOTONS,
        // Pion pool (Phase 4, packed struct)
        pionPool, piCount, pionClaims, absorbClaims,
        GPU_MAX_PIONS, PION_POOL_CAP,
        // Boson tree (Phase 4)
        bosonTreeNodes, bosonTreeCounter, bosonVisitorFlags, MAX_BOSON_NODES,
        BOSON_TREE_KEYS, bosonTreeKeys, bosonTreeRadix, bosonTreeBounds,

        /** Destroy all buffers */
        destroy() {
            for (const key of Object.keys(this)) {
                if (this[key] && typeof this[key].destroy === 'function') {
                    this[key].destroy();
                }
            }
        }
    };
}

// ── Scalar Field Grid Buffers ──
// Default GRID_RES = 64 (matches CPU SCALAR_GRID), configurable as power-of-2
const FIELD_GRID_RES = GPU_SCALAR_GRID;
const FIELD_GRID_SQ = FIELD_GRID_RES * FIELD_GRID_RES;
/**
 * Allocate GPU buffers for one scalar field instance.
 * @param {GPUDevice} device
 * @param {string} label - 'higgs' or 'axion'
 * @param {number} maxParticles
 * @returns {Object} Buffer set for one field
 */
export function createFieldBuffers(device, label, maxParticles) {
    const gridBytes = FIELD_GRID_SQ * 4; // f32
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;

    return {
        field:         device.createBuffer({ label: `${label}-field`,         size: gridBytes, usage }),
        fieldDot:      device.createBuffer({ label: `${label}-fieldDot`,      size: gridBytes, usage }),
        // φ̇ as a half-kick starts (copied in the encoder): its viscosity reads neighbours here,
        // not from the buffer the kick is rewriting
        fieldDotPrev:  device.createBuffer({ label: `${label}-fieldDotPrev`,  size: gridBytes, usage }),
        source:        device.createBuffer({ label: `${label}-source`,        size: gridBytes, usage }),
        gradX:         device.createBuffer({ label: `${label}-gradX`,         size: gridBytes, usage }),
        gradY:         device.createBuffer({ label: `${label}-gradY`,         size: gridBytes, usage }),
        // Thermal grid (Higgs only, but allocated for both to keep layout uniform)
        thermal:       device.createBuffer({ label: `${label}-thermal`,       size: gridBytes, usage }),
    };
}

/**
 * Allocate the shared gravity grid both scalar fields evolve in (field-gravity.wgsl):
 * FFT scratch and sheet Green's function, Φ_F (field energy) with its gradient,
 * Φ_P (particle mass), and the metric potential with its previous value and Φ̇.
 * @param {GPUDevice} device
 */
export function createGravityGridBuffers(device) {
    const gridBytes = FIELD_GRID_SQ * 4;
    const complexBytes = FIELD_GRID_SQ * 2 * 4; // interleaved complex f32 (re,im pairs)
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const grid = (name) => device.createBuffer({ label: `grav-${name}`, size: gridBytes, usage });
    return {
        fftA:          device.createBuffer({ label: 'grav-fftA', size: complexBytes, usage }),
        fftB:          device.createBuffer({ label: 'grav-fftB', size: complexBytes, usage }),
        greenHat:      device.createBuffer({ label: 'grav-greenHat', size: complexBytes,
                                             usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }),
        phiF:          grid('phiF'),
        phiFGradX:     grid('phiFGradX'),
        phiFGradY:     grid('phiFGradY'),
        phiP:          grid('phiP'),
        metricPhi:     grid('metricPhi'),
        metricPhiPrev: grid('metricPhiPrev'),
        metricPhiDot:  grid('metricPhiDot'),
        massGrid:      grid('massGrid'),
    };
}

/**
 * Allocate atomic grid buffer for single-pass PQS deposition.
 * Layout: atomic<i32>[FIELD_GRID_SQ] — fixed-point accumulator, cleared by finalizeDeposit.
 * @param {GPUDevice} device
 */
export function createAtomicGridBuffer(device) {
    return device.createBuffer({
        label: 'atomic-deposit-grid',
        size: FIELD_GRID_SQ * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
}

/**
 * Allocate heatmap buffers.
 * @param {GPUDevice} device
 * @param {number} gridSize - default 64 (HEATMAP_GRID)
 */
export function createHeatmapBuffers(device, gridSize = 64) {
    const bytes = gridSize * gridSize * 4;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    return {
        gravPotential:   device.createBuffer({ label: 'heatmap-grav',   size: bytes, usage }),
        elecPotential:   device.createBuffer({ label: 'heatmap-elec',   size: bytes, usage }),
        yukawaPotential: device.createBuffer({ label: 'heatmap-yukawa', size: bytes, usage }),
        magField:        device.createBuffer({ label: 'heatmap-bz',     size: bytes, usage }),  // Bz, not a potential
        elecField:       device.createBuffer({ label: 'heatmap-e',      size: bytes * 2, usage }),  // E, vec2 per cell
        blurTemp:        device.createBuffer({ label: 'heatmap-blur',   size: bytes, usage }),
        output:          device.createBuffer({ label: 'heatmap-output', size: gridSize * gridSize * 4 * 4, usage }), // RGBA u8 packed as u32
    };
}

/**
 * Allocate excitation event buffers for field excitation deposits.
 * @param {GPUDevice} device
 * @param {number} maxEvents - max events per frame (default 64)
 */
export function createExcitationBuffers(device, maxEvents = 64) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    return {
        events: device.createBuffer({ label: 'excitation-events', size: maxEvents * 16, usage }), // ExcitationEvent = 16 bytes
        counter: device.createBuffer({ label: 'excitation-counter', size: 4, usage }),
    };
}

/**
 * Allocate kugelblitz collapse event buffers.
 * KugelblitzEvent = 48 bytes (12 × f32):
 * x, y, px, py, energy, charge, angL, count, radiatedE, radiatedPx, radiatedPy, pad.
 * Max 1 event per substep.
 */
export function createKugelblitzBuffers(device) {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    return {
        events: device.createBuffer({ label: 'kugelblitz-events', size: 48, usage }),
        counter: device.createBuffer({ label: 'kugelblitz-counter', size: 4, usage }),
    };
}

/** Torus frames draw each body's 3×3 nearest images. */
export const FRAME_IMAGES_MAX = 9;
export const FRAME_PARAMS_SIZE = 96;   // FrameParams (frame-slice.wgsl)
export const FRAME_STATE_SIZE = 80;    // FrameState

/**
 * Frame buffers (frame-slice.wgsl): the observer's parameters and state, and the view
 * copies of the per-particle buffers the renderer draws in a non-lab frame, one entry per
 * (slot, image).
 */
export function createFrameBuffers(device, maxParticles) {
    const n = maxParticles * FRAME_IMAGES_MAX;
    // COPY_SRC throughout, so the oracle page can read the views back
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    return {
        frameParams: device.createBuffer({ label: 'frameParams', size: FRAME_PARAMS_SIZE,
                                           usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        frameState:  device.createBuffer({ label: 'frameState', size: FRAME_STATE_SIZE, usage: storage }),
        viewState:   device.createBuffer({ label: 'viewState',   size: n * PARTICLE_STATE_SIZE, usage: storage }),
        viewAux:     device.createBuffer({ label: 'viewAux',     size: n * PARTICLE_AUX_SIZE, usage: storage }),
        viewDerived: device.createBuffer({ label: 'viewDerived', size: n * DERIVED_SIZE, usage: storage }),
        viewClocks:  device.createBuffer({ label: 'viewClocks',  size: n * 16, usage: storage }),
    };
}

export {
    FIELD_GRID_RES, FIELD_GRID_SQ,
    PARTICLE_STATE_SIZE, PARTICLE_AUX_SIZE, RADIATION_STATE_SIZE,
    PHOTON_SIZE, PION_SIZE, DERIVED_SIZE, VEC2_SIZE, VEC4_SIZE, ALLFORCES_SIZE, MERGE_RESULT_SIZE,
};

/**
 * Create the uniform buffer for simulation parameters.
 * Layout matches SimUniforms struct in common.wgsl.
 */
export function createUniformBuffer(device) {
    // 256 bytes is enough for all uniforms with padding
    return device.createBuffer({
        label: 'simUniforms',
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}

/**
 * Write simulation uniforms to the GPU buffer.
 * @param {GPUDevice} device
 * @param {GPUBuffer} buffer
 * @param {Object} params - Simulation parameters
 */
// Pre-allocated uniform data buffer (avoids GC pressure from per-substep allocation)
const _uniformData = new ArrayBuffer(256);
const _uniformF32 = new Float32Array(_uniformData);
const _uniformU32 = new Uint32Array(_uniformData);

export function writeFrameUniforms(device, buffer, params) {
    // Pack into pre-allocated Float32Array matching WGSL struct layout.
    // Writes the FULL 256-byte buffer — call once per frame for slow-changing fields.
    // Substep-varying fields (dt, simTime, aliveCount, particleCount, frameCount)
    // are overwritten per substep by writeSubstepUniforms().
    const f = _uniformF32;
    const u = _uniformU32;

    f[0] = params.dt || 0;
    f[1] = params.simTime || 0;
    f[2] = params.domainW || 1;
    f[3] = params.domainH || 1;
    f[4] = params.speedScale || 1;
    f[5] = params.softening || 8;
    f[6] = params.softeningSq || 64;
    u[7] = params.toggles0 || 0;     // toggle bitfield 0
    u[8] = params.toggles1 || 0;     // toggle bitfield 1
    f[9] = params.yukawaCoupling || 14;
    f[10] = params.yukawaMu || 0.15;
    f[11] = params.higgsMass || 0.5;
    f[12] = params.axionMass || 0.05;
    u[13] = params.boundaryMode || 0;
    u[14] = params.topologyMode || 0;
    u[15] = params.collisionMode || 0;
    u[16] = params.maxParticles || 4096;
    u[17] = params.aliveCount || 0;
    // External fields (Phase 2)
    f[18] = params.extGravity || 0;
    f[19] = params.extGravityAngle || 0;
    f[20] = params.extElectric || 0;
    f[21] = params.extElectricAngle || 0;
    f[22] = params.extBz || 0;
    f[23] = params.bounceFriction ?? 0.4;
    // Precomputed external field directions (use cached trig from setToggles)
    f[24] = params.extGx ?? ((params.extGravity || 0) * Math.cos(params.extGravityAngle || 0));
    f[25] = params.extGy ?? ((params.extGravity || 0) * Math.sin(params.extGravityAngle || 0));
    f[26] = params.extEx ?? ((params.extElectric || 0) * Math.cos(params.extElectricAngle || 0));
    f[27] = params.extEy ?? ((params.extElectric || 0) * Math.sin(params.extElectricAngle || 0));
    f[28] = params.axionCoupling || 0.05;
    f[29] = params.higgsCoupling || 1.0;
    u[30] = params.particleCount || 0;  // actual alive particle count for dispatch sizing
    f[31] = params.bhTheta || 0.5;     // Barnes-Hut opening angle
    u[32] = params.frameCount || 0;    // frameCount field in SimUniforms
    f[33] = params.scaleA || 1;        // cosmological scale factor
    f[34] = params.hubble || 0;        // the frame's Hubble rate

    device.queue.writeBuffer(buffer, 0, _uniformData);
}

// Pre-allocated scratch for per-substep partial uniform writes (avoids GC)
const _substepF32 = new Float32Array(1);
const _substepU32 = new Uint32Array(1);

// Byte offsets of substep-varying fields within SimUniforms (index * 4)
export const UNIFORM_DT_OFFSET = 0;    // f[0]
const UNIFORM_SIMTIME_OFFSET = 4;      // f[1]
const UNIFORM_ALIVE_OFFSET = 68;       // u[17]
const UNIFORM_PCOUNT_OFFSET = 120;     // u[30]
const UNIFORM_FRAME_OFFSET = 128;      // u[32]
export const UNIFORM_RADIUS_MAX_OFFSET = 140;   // f[35], filled on the GPU (copyBufferToBuffer)

/**
 * Write only the 5 substep-varying fields at their byte offsets within the
 * existing SimUniforms buffer. Avoids re-uploading the full 256 bytes per substep.
 */
export function writeSubstepUniforms(device, buffer, dt, simTime, aliveCount, particleCount, frameCount) {
    _substepF32[0] = dt;
    device.queue.writeBuffer(buffer, UNIFORM_DT_OFFSET, _substepF32);
    _substepF32[0] = simTime;
    device.queue.writeBuffer(buffer, UNIFORM_SIMTIME_OFFSET, _substepF32);
    _substepU32[0] = aliveCount;
    device.queue.writeBuffer(buffer, UNIFORM_ALIVE_OFFSET, _substepU32);
    _substepU32[0] = particleCount;
    device.queue.writeBuffer(buffer, UNIFORM_PCOUNT_OFFSET, _substepU32);
    _substepU32[0] = frameCount;
    device.queue.writeBuffer(buffer, UNIFORM_FRAME_OFFSET, _substepU32);
}
