// ─── Preset Definitions ───
// Six curated presets, each a figure that opens on its own frame. A preset is data: the
// toggles it turns on (store keys; every other toggle is off), the parameters it sets (the
// rest take their defaults), its modes, speed, view and domain. Then spawn(sim, run) places
// its bodies, and an optional tick(sim, run) keeps the scene going after each stepped frame;
// `run` is that run's own state, dropped with it by Simulation.reset().
import { DEFAULT_DOMAIN, DEFAULT_SPEED_SCALE, PI } from './config.js';
import { TOGGLE_KEYS } from './physics-contract.js';
import { createPhysicsSettings, applyConfig } from './physics-settings.js';

// The view a preset starts from: what it doesn't turn on is off (the rulers and key are the
// visitor's own choice and stay as they are)
const PRESET_VIEW = {
    trails: false, showClocks: false, showVelocity: false, showForce: false, showForceComponents: false,
    fields: false, lensing: false, lensDistance: 1,
};

// Each preset may set `domain: [w, h]` in world units; the default is DEFAULT_DOMAIN square.
export const PRESETS = {
    cyclotron: {
        name: 'Cyclotron drift',
        desc: 'Charges of both signs circle a uniform magnetic field and drift together across an electric one: in spacetime, helices of opposite hand leaning the same way',
        toggles: ['coulombEnabled', 'magneticEnabled', 'relativityEnabled', 'radiationEnabled'],
        settings: { extBz: 0.8, extElectric: 0.12, extElectricAngle: PI / 2 },
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        visuals: { trails: true },
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
        desc: 'One twin flies to a wall at 0.8c and back, returning younger; on the traveller’s slice the home clock leaps 2vd at the turn',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'bounce' },
        speed: 16,
        visuals: { showClocks: true },
        domain: [160, 40],
        spawn(sim) {
            // Home at rest; the traveller leaves at 0.8c (γ = 5/3), turns at the far wall and
            // comes back, ageing 0.6 of home's time apart from the turn
            const y = sim.domainH / 2;
            sim.addParticle(12, y - 3, 0, 0, { mass: 1, charge: 0, spin: 0 });
            sim.addParticle(12, y + 3, 0.8, 0, { mass: 1, charge: 0, spin: 0 });
        },
    },

    wheel: {
        name: 'Relativistic wheel',
        desc: 'A wheel spinning at 0.9c, moving at 0.9c: contracted, its spoke bent, its clock slow',
        toggles: ['relativityEnabled'],
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        visuals: { showClocks: true },
        spawn(sim) {
            const cx = sim.domainW / 2, cy = sim.domainH / 2;
            // The same wheel twice, rim speed 0.9: at rest, and crossing the torus at 0.9c.
            // The moving spoke bends by 2·v·v_rim ≈ 93° across the diameter.
            sim.addParticle(cx, cy - 12, 0, 0, { mass: 40, charge: 0, spin: 0.9 });
            sim.addParticle(cx, cy + 12, 0.9, 0, { mass: 40, charge: 0, spin: 0.9 });
        },
    },

    bremsstrahlung: {
        name: 'Bremsstrahlung',
        desc: 'A beam of electrons at 0.95c swings past a heavy nucleus, and each, bent, sheds light beamed along its path',
        toggles: ['coulombEnabled', 'magneticEnabled', 'relativityEnabled', 'radiationEnabled'],
        modes: { collision: 'pass', boundary: 'despawn' },
        speed: 32,
        visuals: { trails: true },
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
        desc: 'A Higgs field quenched through its symmetry-breaking transition freezes into ±v domains; a slower quench leaves fewer walls',
        domain: [128, 128],
        toggles: ['higgsEnabled'],
        settings: { higgsMass: 0.75 },
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        spawn(sim) {
            // The symmetric phase, φ ≈ 0, with a Langevin bath; the mass term crosses the
            // transition 120 time units in
            const gp = sim._gpuPhysics;
            gp.setField('higgs', () => 1e-3 * (Math.random() - 0.5));
            gp.setHiggsQuench(120, 1e-4);
            // The simulation steps only with a body: one tracer, too light to bias the field
            sim.addParticle(sim.domainW / 2, sim.domainH / 2, 0, 0, { mass: 1e-3, charge: 0, spin: 0 });
        },
    },

    microlensing: {
        name: 'Microlensing',
        desc: 'A mass drifts in front of a backdrop star: the star splits into two images and brightens along the Paczyński light curve',
        domain: [96, 96],
        toggles: ['gravityEnabled'],
        modes: { collision: 'pass', boundary: 'loop', topology: 'torus' },
        speed: 16,
        visuals: { lensing: true, lensDistance: 1 },
        spawn(sim) {
            // θ_E = √(4MD) = 8.9 at D = 1; the lens passes 0.3 θ_E from the star, so μ peaks
            // near 3.4
            const cx = sim.domainW / 2, cy = sim.domainH / 2, M = 20;
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
    sim.addParticle(x0, sim.domainH / 2 + b, 0.95 * dir, 0, { mass: 0.3, charge: -1, spin: 0 });
    beam.next = sim._gpuPhysics.simTime + 24;
}

export const PRESET_ORDER = [
    'cyclotron', 'twinBounce', 'wheel', 'bremsstrahlung', 'kibbleZurek', 'microlensing',
];


/** A preset's configuration for applyConfig(): what it sets, and the defaults for the rest. */
export function presetConfig(preset) {
    const settings = createPhysicsSettings();
    for (const k of TOGGLE_KEYS) settings[k] = preset.toggles.includes(k);
    Object.assign(settings, preset.settings);
    return {
        settings,
        modes: { topology: 'torus', ...preset.modes },
        speed: preset.speed ?? DEFAULT_SPEED_SCALE,
        view: { ...PRESET_VIEW, ...preset.visuals },
    };
}

export function loadPreset(name, sim, { quiet = false } = {}) {
    const preset = PRESETS[name];
    if (!preset) return;

    // Clear the scene, set the domain (square by default) and the configuration; the GPU has
    // the preset's settings before anything spawns
    sim.reset();
    const [domainW, domainH] = preset.domain ?? [DEFAULT_DOMAIN, DEFAULT_DOMAIN];
    sim.setDomain(domainW, domainH);
    applyConfig(sim, presetConfig(preset));

    // Spawn the bodies (as initial conditions: see Simulation.addParticle). A tick keeps the
    // scene going (the bremsstrahlung beam) with this run's state; Simulation.reset() stops it
    const run = {};
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
