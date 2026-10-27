// ─── Named Constants ───
// All physics uses natural units: c = 1, G = 1, ħ = 1.

// ── Math ──
export const PI = Math.PI;
export const TWO_PI = 2 * Math.PI;

// ── Mode Enums ──
export const COL_PASS = 0;
export const COL_MERGE = 1;
export const COL_BOUNCE = 2;
export const COL_NAMES = ['pass', 'merge', 'bounce'];
export function colFromString(s) { return s === 'merge' ? COL_MERGE : s === 'bounce' ? COL_BOUNCE : COL_PASS; }

export const BOUND_DESPAWN = 0;
export const BOUND_BOUNCE = 1;
export const BOUND_LOOP = 2;
export const BOUND_NAMES = ['despawn', 'bounce', 'loop'];
export function boundFromString(s) { return s === 'loop' ? BOUND_LOOP : s === 'bounce' ? BOUND_BOUNCE : BOUND_DESPAWN; }

export const TORUS = 0;
export const KLEIN = 1;
export const RP2   = 2;
export const TOPO_NAMES = ['torus', 'klein', 'rp2'];
export function topoFromString(s) { return s === 'klein' ? KLEIN : s === 'rp2' ? RP2 : TORUS; }

// ── Numerical Thresholds ──
export const GPU_EPSILON = 1e-6;              // f32-safe epsilon (f32 machine eps ~1.2e-7)
export const EPSILON = GPU_EPSILON * GPU_EPSILON; // 1e-12, f64 epsilon ≈ GPU_EPSILON²
export const MIN_MASS = 0.05;               // Hawking and pion emission threshold, evaporation floor
export const PHOTON_QUANTUM = 0.02;         // a body's radiated energy leaves as photons of about this
export const MAX_SPEED_RATIO = 0.999;

// ── Integrator ──
export const PHYSICS_DT = 1 / 128;
export const MAX_SUBSTEPS = 32;
export const SPEED_OPTIONS = [4, 8, 16, 32, 64];
export const DEFAULT_SPEED_INDEX = 2; // 16x (displays as 1x)
export const DEFAULT_SPEED_SCALE = SPEED_OPTIONS[DEFAULT_SPEED_INDEX];
export const MAX_FRAME_DT = 1 / 16;             // frame delta cap
export const ACCUMULATOR_CAP = 2;            // max accumulator as multiple of PHYSICS_DT * MAX_SUBSTEPS

// ── Lengths ──
// ε: numerical softening for particle–particle forces only.
export const SOFTENING = 8;
export const SOFTENING_SQ = SOFTENING * SOFTENING;
export const BH_SOFTENING = 4;               // reduced softening for black hole mode
export const BH_SOFTENING_SQ = BH_SOFTENING * BH_SOFTENING;
// ℓ: sheet thickness, the softening of grid gravity (field energy and particle
// mass on the field grid). Physical, so black-hole mode does not change it.
export const SHEET_THICKNESS = 8;
export const SHEET_THICKNESS_SQ = SHEET_THICKNESS * SHEET_THICKNESS;
export const BH_PW_MIN_GAP = 0.25;           // floor for Paczynski-Wiita horizon gap
export const BOSON_SOFTENING_SQ = 4;         // photon/pion gravitational lensing
export const BOSON_MIN_AGE = 4;              // minimum age (substeps) before any absorption

// ── Particle Properties ──
export const INERTIA_K = 0.4;                // I = (2/5)mr²
export const MAG_MOMENT_K = 0.2;             // μ = (1/5)q·ω·r²
export const TIDAL_STRENGTH = 64;

// ── Force summation ──
// Bodies' forces are summed pairwise below TREE_ON bodies and by a Barnes–Hut tree walk above
// (GPUPhysics._chooseForceSum). Once the tree is in use it stays until the count falls under
// TREE_OFF, so a scene hovering at the threshold doesn't flip every frame. The tree's opening
// angle θ ramps log-linearly with the count from THETA_MIN at TREE_ON to THETA_MAX at TREE_FULL
// (the body cap), so the error at the switch is far under what shows and grows only with the
// count. TREE_ON is where the walk at THETA_MIN costs what the pairwise loop does on an open
// domain (M5 Max; docs/second-pass/bh-notes.md has the table).
export const TREE_ON = 1536;
export const TREE_OFF = 1152;
export const THETA_MIN = 0.1;
export const THETA_MAX = 0.5;
export const TREE_FULL = 4096;
// On a periodic domain the walk has to open every node that reaches past half a domain, which
// the pairwise loop's minimum image doesn't. It never beats the pairwise loop by more than a
// third up to the body cap, and from about 4000 bodies it sometimes takes 5–6 ms against the
// loop's 0.75: the tree is chosen there only above the cap, so never until the cap or the walk
// changes.
export const TREE_ON_PERIODIC = 8192;
export const TREE_OFF_PERIODIC = 6144;
/** The tree's opening angle for n bodies. */
export function treeTheta(n) {
    const u = Math.log(Math.max(n, 1) / TREE_ON) / Math.log(TREE_FULL / TREE_ON);
    return THETA_MIN + (THETA_MAX - THETA_MIN) * Math.min(Math.max(u, 0), 1);
}
// The bosons' own tree has no pairwise alternative, so its opening angle does not move with the
// body count: the boson tree walks keep THETA_MAX (BOSON_THETA_SQ in WGSL).
export const BOSON_THETA_SQ = THETA_MAX * THETA_MAX;

// ── Radiation & Bosons ──
// Pool culls: photons and leptons are removed after this lab-time age.
// Non-physical (leptons are stable, photons don't expire); they bound the pools.
export const PHOTON_CULL_AGE = 256;
export const GPU_MAX_PHOTONS = 16384;
export const GPU_MAX_PIONS = 4096;
export const GPU_MAX_LEPTONS = 4096;
export const LEPTON_CULL_AGE = 512;
export const PION_HALF_LIFE = 32;         // pi0 rest-frame half-life (fast EM decay)
export const CHARGED_PION_HALF_LIFE = 64; // pi+/- rest-frame half-life (slower weak decay)
export const ELECTRON_MASS = 0.01;                // decay product mass for pi+/- -> e+/- + photon
export const BOSON_CHARGE = 0.1;                  // magnitude of pion/lepton charge (tunable)
export const MAX_REJECTION_SAMPLES = 32;     // emission-direction rejection sampling cap
export const ABERRATION_THRESHOLD = 1.001;   // min gamma for relativistic aberration

// ── Yukawa ──
export const YUKAWA_COUPLING = 14;           // g² coupling strength (fixed)
export const DEFAULT_PION_MASS = 0.15;       // mediator mass (inverse range), ~m_π/m_N

// ── Scalar Fields (Higgs & Axion) ──
export const SCALAR_FIELD_MAX = 2;           // field value clamp
export const FIELD_EXCITATION_SIGMA = 2;     // Gaussian width in grid cells (merge wave packets)

export const DEFAULT_HIGGS_MASS = 0.50;      // m_H (oscillation frequency), ~m_H/v_EW
export const HIGGS_COUPLING = 1;             // g (source = g·baseMass, force = g·baseMass·∇φ)
export const HIGGS_MASS_FLOOR = 0.05;        // min |φ| for mass: m ≥ 0.05·baseMass (caps accel at 20×)
export const HIGGS_MASS_MAX_DELTA = 8;       // max mass change per unit time (prevents resonant throb)
export const METRIC_PHI_CLAMP = 8;           // NaN guard on the GPU metric potential; e^{±2Φ} stays finite in f32

export const DEFAULT_AXION_MASS = 0.05;      // m_a (oscillation frequency)
export const AXION_COUPLING = 0.05;          // g in L = -(1+g·a)F²/4
export const HIGGS_AXION_COUPLING = 0.01;    // λ in V_portal = ½λφ²a² (Higgs portal)

// ── Emission ──
export const SPAWN_OFFSET_MULTIPLIER = 1.5;  // emitted bosons start this many radii from the emitter
export const SPAWN_OFFSET_FLOOR = 1;

// ── Kugelblitz Collapse ──
export const MIN_KUGELBLITZ_ENERGY = 0.2;    // minimum total boson energy for collapse (4 × MIN_MASS)
export const MIN_KUGELBLITZ_COUNT = 4;       // minimum boson count in collapsing node

// ── World Lines and Clocks ──
// Every particle records a world-line sample every WORLDLINE_DT of lab time into a
// ring of WORLDLINE_LEN samples (128 time units), whatever the toggles. Signal delay
// solves its light cone against it.
export const WORLDLINE_LEN = 1024;            // power of 2 (ring mask)
export const WORLDLINE_DT = 1 / 8;
export const CLOCK_PERIOD = 16;              // proper time per sweep of the clock ring
// GPU times are f32 relative to a rolling epoch. Once GPU time passes EPOCH_SPAN, every
// stored time shifts back by EPOCH_STEP and each world line is recentred on its tile.
export const EPOCH_SPAN = 512;
export const EPOCH_STEP = 256;

// ── GPU-Specific ──
export const GPU_SCALAR_GRID = 128;            // GPU scalar field grid resolution
export const GPU_HEATMAP_GRID = 128;           // GPU heatmap overlay resolution (tunable to 128)
export const GPU_MAX_PARTICLES = 4096;         // GPU buffer pre-allocation limit

// ── Cosmological Expansion ──
export const DEFAULT_HUBBLE = 0.01;   // H₀ of the imposed schedules, H_Λ of the Friedmann closure

// ── Domain, Viewport & Camera ──
// The domain is simulation state, independent of the window: presets set it, and the
// blank sandbox is DEFAULT_DOMAIN square. The window is a camera onto it.
export const DEFAULT_DOMAIN = 64;
export const WORLD_SCALE = 16;               // pixels per world unit at 100% zoom
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 48;
export const WHEEL_ZOOM_IN = 1.1;
export const DESPAWN_MARGIN = 64;

// ── Input ──
export const PINCH_DEBOUNCE = 300;
export const DRAG_THRESHOLD = 4;
export const SHOOT_VELOCITY_SCALE = 0.02;

// ── Display ──
export const DISPLAY_SCALE = 100;
export const STATS_THROTTLE_MASK = 7;           // stats update every 8th frame
export const PHASE_BUFFER_LEN = 512;
export const HEATMAP_INTERVAL_MASK = 3;      // heatmap update every 4th render frame (bitmask)
export const HEATMAP_SENSITIVITY = 2;
export const HEATMAP_MAX_ALPHA = 100;
export const VELOCITY_VECTOR_SCALE = 32;

// ── Helpers ──

/**
 * Kerr-Newman radius for sub-extremal parameters; super-extremal inputs clamp to M as a toy-model
 * effective radius. a = J/M with the one canonical spin J = I·angW.
 */
export function kerrNewmanRadius(M, radiusSq, angW, charge) {
    const a = INERTIA_K * radiusSq * Math.abs(angW);
    const disc = M * M - a * a - charge * charge;
    return disc >= 0 ? M + Math.sqrt(Math.max(0, disc)) : M;
}

/** Source horizon for force/potential helpers, from the spin J (a = J/M). */
export function blackHoleSourceRadius(M, charge = 0, angMomentum = 0) {
    if (!(M > EPSILON)) return 0;
    const a = Math.abs(angMomentum) / M;
    const disc = M * M - a * a - charge * charge;
    return disc >= 0 ? M + Math.sqrt(Math.max(0, disc)) : M;
}

/** Paczynski-Wiita gravity terms for a source horizon. */
export function blackHoleRadialTerms(rawRSq, sourceMass, sourceCharge = 0, sourceAngMomentum = 0) {
    if (!(rawRSq > EPSILON) || !(sourceMass > EPSILON)) {
        return { invPotential: 1 / BH_PW_MIN_GAP, forceScale: 0, jerkFactor: 0 };
    }
    const r = Math.sqrt(rawRSq);
    const gap = Math.max(r - blackHoleSourceRadius(sourceMass, sourceCharge, sourceAngMomentum), BH_PW_MIN_GAP);
    const invR = 1 / r;
    const invGap = 1 / gap;
    const forceScale = invR * invGap * invGap;
    return {
        invPotential: invGap,
        forceScale,
        jerkFactor: forceScale * (invR * invR + 2 * invR * invGap),
    };
}
