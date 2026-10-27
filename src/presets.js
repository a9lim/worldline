// ─── Preset Definitions ───
// Six curated presets, each a figure that opens on its own frame. A preset is data: the
// toggles it turns on (store keys; every other toggle is off), the parameters it sets (the
// rest take their defaults), its modes, speed, view and domain. Then spawn(sim, run) places
// its bodies, and an optional tick(sim, run) keeps the scene going after each stepped frame;
// `run` is that run's own state, dropped with it by Simulation.reset().
//
// Its knobs (roadmap §1.3) are the numbers its caption states that a visitor can change, set in
// the caption (caption.js) and under its row in the list of figures (ui.js). A knob over a
// `store` key is that setting, live; any other holds a value, from `value`, that spawn and tick
// read as run.knobs[key]: live for what they read every time (the beam's speed), `rerun` for an
// initial condition, which runs the figure again when the knob settles. `commit` acts when a
// knob settles (the quench re-runs from the symmetric phase).
import { DEFAULT_DOMAIN, DEFAULT_SPEED_SCALE, PI } from './config.js';
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
        modes: { collision: 'pass', boundary: 'bounce' },
        speed: 16,
        // The round trip, about 95, fits the world lines' reach (127), and the spacetime view
        // shows all of that reach, so for a third of each trip the tilted plate holds a whole one
        visuals: { depth: Infinity },
        domain: [40, 32],
        // The traveller's speed; below 0.55c a round trip outruns the world lines' reach
        knobs: { v: knob('v', { value: 0.8, min: 0.55, max: 0.95, rerun: true }) },
        spawn(sim, run) {
            // Home at rest by the near wall; the traveller leaves at v (0.8c: γ = 5/3), turns at
            // the far wall and comes home, ageing √(1 − v²) of home's time apart from the turn.
            // Then it turns again at the near wall just behind home, so each trip starts as the
            // last ends
            const y = sim.domainH / 2;
            sim.addParticle(3, y - 3, 0, 0, { mass: 1, charge: 0, spin: 0 });
            sim.addParticle(3, y + 3, run.knobs.v, 0, { mass: 1, charge: 0, spin: 0 });
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

export const PRESET_ORDER = [
    'cyclotron', 'twinBounce', 'wheel', 'bremsstrahlung', 'kibbleZurek', 'microlensing',
];


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
export function loadPreset(name, sim, { quiet = false, knobs = {}, settings = null } = {}) {
    const preset = PRESETS[name];
    if (!preset) return;

    // Clear the scene, set the domain (square by default) and the configuration; the GPU has
    // the preset's settings before anything spawns
    sim.reset();
    const [domainW, domainH] = preset.domain ?? [DEFAULT_DOMAIN, DEFAULT_DOMAIN];
    sim.setDomain(domainW, domainH);
    applyConfig(sim, presetConfig(preset, settings));

    // Spawn the bodies (as initial conditions: see Simulation.addParticle). A tick keeps the
    // scene going (the bremsstrahlung beam) with this run's state; Simulation.reset() stops it
    const run = { knobs };
    sim._spawningPreset = true;
    try { preset.spawn(sim, run); } finally { sim._spawningPreset = false; }
    sim.presetTick = preset.tick ? () => preset.tick(sim, run) : null;

    // Reset baseline and notify (i18n: prefer translated preset name)
    sim.stats.resetBaseline();
    const localized = (typeof window !== 'undefined' && window._i18n)
        ? window._i18n.t('preset.' + name + '.name', preset.name)
        : preset.name;
    if (!quiet) showToast(localized);
}
