// ─── Preset Definitions ───
// Nine curated presets in five chapters, each a figure that opens on its own frame. A preset
// is data: the toggles it turns on (store keys; every other toggle is off), the parameters it
// sets (the rest take their defaults), its modes, speed, view and domain. Then spawn(sim, run)
// places its bodies, an optional observe(sim, run) puts the view in the figure's own observer
// (otherwise a figure opens in the lab), and an optional tick(sim, run) keeps the scene going
// after each stepped frame; `run` is that run's own state, dropped with it by
// Simulation.reset() and kept meanwhile as sim.figureRun for the caption. `run.select` is the
// body a figure opens selected, `run.view` the observer it put the view in.
//
// Its knobs (roadmap §1.3) are the numbers its caption states that a visitor can change, set in
// the caption (caption.js) and under its row in the list of figures (ui.js). A knob over a
// `store` key is that setting, live; any other holds a value, from `value`, that spawn and tick
// read as run.knobs[key]: live for what they read every time (the beam's speed), `rerun` for an
// initial condition, which runs the figure again when the knob settles. `commit` acts when a
// knob settles (the quench re-runs from the symmetric phase).
import { DEFAULT_DOMAIN, DEFAULT_SPEED_SCALE, PI } from './config.js';
import { FRAME_KEYS } from './frames.js';
import { shuttleShape } from './prescribed.js';
import { TOGGLE_KEYS } from './physics-contract.js';
import { createPhysicsSettings, applyConfig } from './physics-settings.js';
import { startQuench } from './quench.js';

// The view a preset starts from: what it doesn't turn on is off (the rulers and key are the
// visitor's own choice and stay as they are)
const PRESET_VIEW = {
    showVelocity: false, showForce: false, showForceComponents: false,
    fields: false, lensDistance: 1, depth: 0,
};

const fmt2 = (v) => v.toFixed(2);
/** A knob's definition with its defaults: two decimals, its label the i18n key knob.{key}. */
const knob = (key, spec) => ({ label: 'knob.' + key, step: 0.01, fmt: fmt2, ...spec });
const DEG = PI / 180;

/** Select slot idx, as the figure's own (run.select): its caption names it. */
function selectOwn(sim, run, idx) {
    if (idx < 0) return;
    run.select = idx;
    sim.select(idx);
}

/** Put the view in observer `key`, Seen or not, as the figure's own (run.view). */
function observeOwn(sim, run, key, seen = false) {
    sim.observe?.(key, { seen });
    const f = sim.frames;
    if (f.kind === FRAME_KEYS.indexOf(key)) run.view = { kind: f.kind, slot: f.slot };
}

/**
 * The figure's own view of its observer (run.fit, which Simulation.fitCamera() keeps): `cx` ahead
 * of it, fitting half-extents (hw, hh) in world units.
 */
function frameCamera(sim, run, hw, hh, cx = 0) {
    run.fit = { hw, hh, cx };
    sim.fitCamera();
}

// Each preset may set `domain: [w, h]` in world units; the default is DEFAULT_DOMAIN square.
export const PRESETS = {
    cyclotron: {
        name: 'Cyclotron drift',
        toggles: ['coulombEnabled', 'magneticEnabled', 'relativityEnabled', 'radiationEnabled'],
        settings: { extBz: 0.8, extElectric: 0.12, extElectricAngle: PI / 2 },
        knobs: {
            B: knob('B', { store: 'extBz', min: 0.2, max: 1.5, ink: 'verdigris' }),
            E: knob('E', { store: 'extElectric', min: 0, max: 0.5, ink: 'prussian' }),
        },
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        spawn(sim) {
            // Gyration radius r = γmv/(qB) and period T = 2πγm/(qB): at v = 0.5c, |q| = 0.4 and
            // B = 0.8, r ≈ 1.8 and T ≈ 23, so the default depth shows three or four turns. The
            // drift E×B/B² = 0.15c is the same for either sign; synchrotron light leaves at 45°.
            const W = sim.domainW, H = sim.domainH;
            const spots = [[0.2, 0.25], [0.45, 0.2], [0.75, 0.3], [0.3, 0.55], [0.6, 0.5], [0.85, 0.62], [0.2, 0.8], [0.55, 0.82]];
            spots.forEach(([fx, fy], i) => {
                const q = i % 2 ? -0.4 : 0.4;
                const v = 0.35 + 0.25 * ((i * 37) % 7) / 6;
                const a = i * 2.1;
                sim.addParticle(fx * W, fy * H, v * Math.cos(a), v * Math.sin(a), { mass: 1, charge: q, spin: 0 });
            });
        },
    },

    twinBounce: {
        name: 'Twin paradox',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 16,
        // A round trip at the slowest knob, about 126, fits the world lines' reach (127), and the
        // spacetime view shows all of that reach, so the tilted plate holds a whole trip or more
        visuals: { depth: Infinity },
        domain: [40, 32],
        // The traveller's speed; below 0.55c a round trip outruns the world lines' reach
        knobs: { v: knob('v', { value: 0.8, min: 0.55, max: 0.95, rerun: true }) },
        spawn(sim, run) {
            // Both prescribed (src/prescribed.js): home at rest by the near wall, and the traveller
            // beside it on a shuttle, leaving at v (0.8c: γ = 5/3), turning by the far wall at
            // proper acceleration 0.5 and coming home to rest beside home, then out again, so
            // each trip starts as the last ends. Over a trip it ages τ per period against home's
            // period: √(1 − v²) while it coasts, more in the turns. It opens selected, so its
            // ticks send light and, tilted, draw their two nows on home's line (roadmap §6.4)
            const y = sim.domainH / 2, x = 3, alpha = 0.5, v = run.knobs.v;
            const g = 1 / Math.sqrt(1 - v * v), turn = (g - 1) / alpha;
            const coast = (sim.domainW - 2 * x - 2 * turn) / v;
            sim.addPrescribed({ kind: 'uniform', t0: 0, x, y: y - 3, wx: 0, wy: 0 }, { mass: 1 });
            const trav = sim.addPrescribed({ kind: 'shuttle', t0: 0, x, y: y + 3, nx: 1, ny: 0, v, alpha, coast }, { mass: 1 });
            selectOwn(sim, run, trav);
        },
    },

    wheel: {
        name: 'Relativistic wheel',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        knobs: { v: knob('v', { value: 0.9, min: 0.3, max: 0.95, rerun: true }) },
        spawn(sim, run) {
            const cx = sim.domainW / 2, cy = sim.domainH / 2;
            // The same wheel twice, rim speed 0.9: at rest, and crossing the torus at v (0.9c).
            // The moving spoke bends by 2·v·v_rim (≈ 93° at 0.9c) across the diameter.
            sim.addParticle(cx, cy - 12, 0, 0, { mass: 40, charge: 0, spin: 0.9 });
            sim.addParticle(cx, cy + 12, run.knobs.v, 0, { mass: 40, charge: 0, spin: 0.9 });
        },
    },

    accelerated: {
        name: 'Rindler horizon',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 16,
        domain: [128, 48],
        knobs: { alpha: knob('alpha', { value: 0.08, min: 0.04, max: 0.1, step: 0.005, rerun: true, fmt: (v) => v.toFixed(3) }) },
        spawn(sim, run) {
            // The observer accelerates at α along x (frames.js FRAME_ACCEL), at rest now with its
            // corner 1/α behind it. A lattice at rest in its frame: each body on its own hyperbola
            // about the same corner at proper acceleration 1/ξ (Born-rigid), so on the observer's
            // slices it stands still, its clock running at αξ and its radar distance
            // (1/α)·arcosh[(α²(ξ² + y²) + 1)/(2αξ)] for ever. Two larger bodies at rest in the lab
            // are dropped from the observer's rest and fall toward the horizon, slowing and
            // fading, never crossing on its slices. The corner is on every slice at the run's
            // start, so the run lasts while the history reaches back to it, then runs again
            const a = run.knobs.alpha, L = 1 / a, y = sim.domainH / 2, now = sim._gpuPhysics.simTime;
            const xc = 6;
            Object.assign(run, { alpha: a, tc: now, xc, xo: xc + L, yo: y, until: now + Math.min(110, 4.5 * L) });
            const lattice = [[0.25, 0], [0.5, 0], [1.5, 0], [2, 0],
                [0.5, -0.6], [1, -0.6], [1.5, -0.6], [0.5, 0.6], [1, 0.6], [1.5, 0.6]];
            let pick = -1;
            for (const [f, g] of lattice) {
                const xi = f * L;
                const idx = sim.addPrescribed({ kind: 'hyperbola', t0: now, x: xc + xi, y: y + g * L, nx: 1, ny: 0, alpha: 1 / xi }, { mass: 0.4 });
                if (f === 0.5 && g === 0) pick = idx;
            }
            for (const g of [-0.3, 0.3]) {
                sim.addPrescribed({ kind: 'uniform', t0: now, x: xc + 0.75 * L, y: y + g * L, wx: 0, wy: 0 }, { mass: 1 });
            }
            selectOwn(sim, run, pick);
        },
        observe(sim, run) {
            const f = sim.frames;
            f.alpha = run.alpha;
            f.direction = 0;
            observeOwn(sim, run, 'accel');
            if (!run.view) return;
            f.origin = [run.xo, run.yo];
            f.refT = run.tc;
            f.state = null;
            sim.framePanel?.syncAlpha?.();
            frameCamera(sim, run, 1.5 / run.alpha, 1 / run.alpha);
        },
        tick(sim, run) {
            if (sim._gpuPhysics.simTime >= run.until) sim.loadFigure?.('accelerated', { keep: true });
        },
    },

    seenSky: {
        name: 'Aberration',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 16,
        knobs: { v: knob('v', { value: 0.8, min: 0.3, max: 0.95, rerun: true }) },
        spawn(sim, run) {
            // A ring of 24 lamps at rest and an eye shuttling through its centre along x at v
            // (prescribed, as the twin's traveller is), turning inside the ring at proper
            // acceleration 0.5. Seen from the eye (its own red body, under Seen) the ring crowds
            // forward, cos θ′ = (cos θ + v)/(1 + v cos θ); at the centre it is an ellipse with
            // the eye at a focus, of eccentricity v. On a coast the lamp dead ahead is seen
            // shifted by D = k = √((1 + v)/(1 − v)) (D⁴ in intensity) and the one behind by 1/k,
            // and each turn swings the sky round. It opens on a coast through the centre
            const cx = sim.domainW / 2, cy = sim.domainH / 2, R = 24, N = 24, v = run.knobs.v;
            const now = sim._gpuPhysics.simTime;
            run.axis = [];
            for (let k = 0; k < N; k++) {
                const th = k * 2 * PI / N;
                const idx = sim.addPrescribed({ kind: 'uniform', t0: now, x: cx + R * Math.cos(th), y: cy + R * Math.sin(th), wx: 0, wy: 0 }, { mass: 2 });
                if (k === 0 || k === N / 2) run.axis.push(idx);
            }
            const alpha = 0.5, g = 1 / Math.sqrt(1 - v * v), reach = 20;
            const c = { kind: 'shuttle', t0: 0, x: cx - reach, y: cy, nx: 1, ny: 0, v, alpha, coast: 2 * (reach - (g - 1) / alpha) / v };
            const sh = shuttleShape(c);
            c.t0 = now - (sh.Ta + sh.Tc / 2);
            run.R = R; run.k = Math.sqrt((1 + v) / (1 - v));
            selectOwn(sim, run, sim.addPrescribed(c, { mass: 1 }));
        },
        observe(sim, run) {
            observeOwn(sim, run, 'particle', true);
            if (run.view) frameCamera(sim, run, run.R * Math.min(run.k, 3) + 6, run.R + 6);
        },
    },

    superluminal: {
        name: 'Apparent superluminal motion',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 4,
        domain: [104, 64],
        knobs: {
            theta: knob('theta', { value: 18, min: 3, max: 90, step: 1, rerun: true, fmt: (v) => v.toFixed(0) }),
            v: knob('v', { value: 0.95, min: 0.5, max: 0.99, rerun: true }),
        },
        spawn(sim, run) {
            // An eye at rest (its own red body, under Seen) and a core JET_D away along x, which
            // ejects a blob every JET_EVERY at v, θ off the line of sight toward the eye. A blob
            // leaves the core's direction across the sky at v sin θ/(1 − v cos θ), faster than
            // light near cos θ = v, where it is γv (3.0c at 0.95c and 18°). The blobs already on
            // their way are born at their ejection, with their past
            const y = sim.domainH / 2, now = sim._gpuPhysics.simTime, x = 12;
            Object.assign(run, { eye: [x, y], core: [x + JET_D, y], blobs: [] });
            selectOwn(sim, run, sim.addPrescribed({ kind: 'uniform', t0: now, x, y, wx: 0, wy: 0 }, { mass: 1 }));
            sim.addPrescribed({ kind: 'uniform', t0: now, x: x + JET_D, y, wx: 0, wy: 0 }, { mass: 3 });
            for (let k = 9; k >= 1; k--) eject(sim, run, now - k * JET_EVERY);
            run.next = now;
        },
        observe(sim, run) {
            observeOwn(sim, run, 'particle', true);
            if (run.view) frameCamera(sim, run, JET_D / 2 + 8, 34, JET_D / 2);
        },
        tick(sim, run) {
            const t = sim._gpuPhysics.simTime;
            if (t >= run.next) { eject(sim, run, t); run.next = t + JET_EVERY; }
            if (run.blobs.length > 40) run.blobs.splice(0, run.blobs.length - 40);
        },
    },

    bremsstrahlung: {
        name: 'Bremsstrahlung',
        toggles: ['coulombEnabled', 'magneticEnabled', 'relativityEnabled', 'radiationEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 32,
        // The beam's speed, for the electrons fired from now on
        knobs: { v: knob('v', { value: 0.95, min: 0.5, max: 0.99 }) },
        spawn(sim, beam) {
            // A nucleus of charge 6, heavy enough to barely recoil, and the first electron of a
            // beam already on its way. At 0.95c (γ = 3.2) an electron is unbound anywhere in the
            // domain; passing within the softening length (8) it turns through tens of degrees
            // and radiates a few photons, beamed forward by Larmor's γ⁴. The beam alternates
            // sides, so the momentum the deflected electrons hand the nucleus cancels
            const cx = sim.domainW / 2, cy = sim.domainH / 2;
            sim.addParticle(cx, cy, 0, 0, { mass: 60, charge: 6, spin: 0 });
            beam.k = 0;
            fireElectron(sim, beam, cx - 18);
        },
        /** The beam: another electron every 24, from alternate edges, at the next impact parameter. */
        tick(sim, beam) {
            if (sim._gpuPhysics.simTime >= beam.next) fireElectron(sim, beam);
        },
    },

    kibbleZurek: {
        name: 'Kibble–Zurek walls',
        domain: [128, 128],
        toggles: ['higgsEnabled'],
        settings: { higgsMass: 0.75, quenchTime: 120 },
        knobs: {
            tau: knob('tau', { store: 'quenchTime', min: 10, max: 1000, log: true, ink: 'sap', fmt: (v) => String(Math.round(v)), commit: startQuench }),
        },
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        spawn(sim) {
            // The symmetric phase, φ ≈ 0, with a Langevin bath; the mass term crosses the
            // transition τ_Q in (the quench time knob re-runs it)
            startQuench(sim);
        },
    },

    microlensing: {
        name: 'Microlensing',
        domain: [96, 96],
        toggles: ['gravityEnabled'],
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        visuals: { lensDistance: 1 },
        knobs: { M: knob('M', { value: 20, min: 5, max: 60, step: 1, rerun: true, fmt: (v) => v.toFixed(0) }) },
        spawn(sim, run) {
            // θ_E = √(4MD) = 8.9 for M = 20 at D = 1; the lens passes 0.3 θ_E from the star, so
            // μ peaks near 3.4 whatever the mass
            const cx = sim.domainW / 2, cy = sim.domainH / 2, M = run.knobs.M;
            const thetaE = Math.sqrt(4 * M);
            sim.addParticle(cx - 36, cy + 0.3 * thetaE, 0.3, 0, { mass: M, charge: 0, spin: 0 });
            sim.lensPanel.setProbe(true, { x: cx, y: cy, r: 1.2 });
        },
    },
};

/** Fire the bremsstrahlung beam's next electron: from alternate edges, at the next impact parameter. */
function fireElectron(sim, beam, x) {
    const k = beam.k++, dir = k % 2 ? -1 : 1;
    const b = [2, -4, 6, -3, 5, -7][k % 6];
    const x0 = x ?? (dir > 0 ? 1 : sim.domainW - 1);
    sim.addParticle(x0, sim.domainH / 2 + b, beam.knobs.v * dir, 0, { mass: 0.3, charge: -1, spin: 0 });
    beam.next = sim._gpuPhysics.simTime + 24;
}

// The jet: the core's distance from the eye and the time between blobs
export const JET_D = 80;
const JET_EVERY = 10;

/**
 * Eject a blob from the jet's core at lab time t, at the knobs' v and θ: toward the eye and
 * θ off it, up the screen. One ejected before now is born then, with its past; one that has
 * already left the domain is skipped.
 */
function eject(sim, run, t) {
    const th = run.knobs.theta * DEG, v = run.knobs.v, g = 1 / Math.sqrt(1 - v * v);
    const ux = -v * Math.cos(th), uy = -v * Math.sin(th), age = sim._gpuPhysics.simTime - t;
    const x = run.core[0] + ux * age, y = run.core[1] + uy * age;
    if (x < 0 || y < 0) return;
    const idx = sim.addPrescribed({ kind: 'uniform', t0: t, x: run.core[0], y: run.core[1], wx: g * ux, wy: g * uy }, { mass: 1, bornAt: t });
    if (idx >= 0) run.blobs.push({ idx, t, theta: th, v });
}

// The list of figures in its chapters (roadmap §4): the Figure tab rules them off, and the
// numbering runs on through them
export const CHAPTERS = [
    { key: 'clocks', figures: ['twinBounce', 'wheel', 'accelerated'] },
    { key: 'light', figures: ['seenSky', 'superluminal'] },
    { key: 'fields', figures: ['cyclotron', 'bremsstrahlung'] },
    { key: 'gravity', figures: ['microlensing'] },
    { key: 'universe', figures: ['kibbleZurek'] },
];
export const PRESET_ORDER = CHAPTERS.flatMap((c) => c.figures);


/** A preset's configuration for applyConfig(): what it sets, and the defaults for the rest. */
export function presetConfig(preset, overrides = null) {
    const settings = createPhysicsSettings();
    for (const k of TOGGLE_KEYS) settings[k] = preset.toggles.includes(k);
    Object.assign(settings, preset.settings, overrides);
    return {
        settings,
        modes: { topology: 'torus', ...preset.modes },
        speed: preset.speed ?? DEFAULT_SPEED_SCALE,
        view: { ...PRESET_VIEW, ...preset.visuals },
    };
}

/**
 * Load a preset: clear the scene, configure it, spawn its bodies. `knobs` are the values its
 * spawn and tick read (ui.js keeps them across a re-run), `settings` store values that override
 * the preset's own (a store knob's value, kept across a re-run).
 */
export function loadPreset(name, sim, { quiet = false, knobs = {}, settings = null, rerun = false } = {}) {
    const preset = PRESETS[name];
    if (!preset) return;

    // Leave any observer for the lab before the domain sets the lab's camera; a re-run comes
    // back to the visitor's own observer afterwards (a figure's own it sets itself)
    const f = sim.frames;
    const was = rerun && f.active ? { key: FRAME_KEYS[f.kind], seen: f.seen } : null;
    sim.observe?.('lab');

    // Clear the scene, set the domain (square by default) and the configuration; the GPU has
    // the preset's settings before anything spawns
    sim.reset();
    const [domainW, domainH] = preset.domain ?? [DEFAULT_DOMAIN, DEFAULT_DOMAIN];
    sim.setDomain(domainW, domainH);
    applyConfig(sim, presetConfig(preset, settings));

    // Spawn the bodies (as initial conditions: see Simulation.addParticle). A tick keeps the
    // scene going (the bremsstrahlung beam) with this run's state; Simulation.reset() stops it
    const run = { knobs, select: -1, view: null };
    sim._spawningPreset = true;
    try { preset.spawn(sim, run); } finally { sim._spawningPreset = false; }
    sim.figureRun = run;
    sim.presetTick = preset.tick ? () => preset.tick(sim, run) : null;
    if (preset.observe) preset.observe(sim, run);
    else if (was && (sim.selectedIdx >= 0 || !['particle', 'freefall'].includes(was.key))) {
        sim.observe?.(was.key, { seen: was.seen });
    }

    // Reset baseline and notify (i18n: prefer translated preset name)
    sim.stats.resetBaseline();
    const localized = (typeof window !== 'undefined' && window._i18n)
        ? window._i18n.t('preset.' + name + '.name', preset.name)
        : preset.name;
    if (!quiet) showToast(localized);
}
