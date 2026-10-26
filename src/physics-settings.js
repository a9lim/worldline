// ─── Physics Settings ───
// The toggle and parameter store the UI writes and GPUPhysics.setToggles() reads.
// Defaults match the checked state of the toggles in index.html. A configuration (a preset,
// a save) reaches it through applyConfig(), the one path that writes the store, the modes,
// the speed and the view, and then has the controls show them.
import { PI, DEFAULT_PION_MASS, DEFAULT_AXION_MASS, DEFAULT_HIGGS_MASS, DEFAULT_HUBBLE, SPEED_OPTIONS, colFromString, boundFromString, topoFromString } from './config.js';

export function createPhysicsSettings() {
    return {
        gravityEnabled: true,
        bosonInterEnabled: false,
        coulombEnabled: true,
        magneticEnabled: true,
        gravitomagEnabled: true,
        relativityEnabled: true,
        radiationEnabled: true,
        blackHoleEnabled: false,
        spinOrbitEnabled: true,
        onePNEnabled: true,
        yukawaEnabled: false,
        axionEnabled: false,
        expansionEnabled: false,
        higgsEnabled: false,

        bounceFriction: 0.4,
        yukawaMu: DEFAULT_PION_MASS,
        axionMass: DEFAULT_AXION_MASS,
        hubbleParam: DEFAULT_HUBBLE,
        cosmoSchedule: 0,          // cosmology.js SCHEDULE_KEYS: the Friedmann closure
        fieldDamping: 1,           // 0 turns off the fields' ether damping (Higgs 2m_H, axion g·m_a)
        higgsMass: DEFAULT_HIGGS_MASS,
        // The Higgs quench's τ_Q (quench.js): the protocol a run follows, not a law of the
        // model, so saves leave it out with the field it shapes
        quenchTime: 120,

        // Uniform background fields, independent of the force toggles
        extGravity: 0,
        extGravityAngle: PI * 0.5,   // radians; default points down
        extElectric: 0,
        extElectricAngle: 0,
        extBz: 0,
    };
}

/** sim.view's keys a configuration may set, besides `fields` (the Fields overlay) and the lens. */
const VIEW_KEYS = ['trails', 'showClocks', 'showVelocity', 'showForce', 'showForceComponents'];

/**
 * Apply a configuration, each part optional:
 * - `settings`: store keys, written over sim.settings;
 * - `modes`: { collision, boundary, topology } by name (config.js COL_NAMES …), a missing
 *   name taking the first;
 * - `speed`: the speed scale, snapped to the nearest of SPEED_OPTIONS;
 * - `view`: sim.view keys, `fields` (the Fields overlay), `lensing` and `lensDistance`
 *   (sim.lens), and `depth`, the least time the spacetime view shows (SpacetimeView.minDepth).
 * Then sim.syncControls() (ui.js) has every control show the store, runs the dependency
 * cascade and the mode locks once, which may turn more off, and pushes the result to the GPU.
 */
export function applyConfig(sim, { settings, modes, speed, view } = {}) {
    if (settings) Object.assign(sim.settings, settings);
    if (modes) {
        sim.collisionMode = colFromString(modes.collision);
        sim.boundaryMode = boundFromString(modes.boundary);
        sim.topology = topoFromString(modes.topology);
    }
    if (speed != null) {
        let best = 0;
        SPEED_OPTIONS.forEach((s, i) => { if (Math.abs(s - speed) < Math.abs(SPEED_OPTIONS[best] - speed)) best = i; });
        sim.speedIndex = best;
        sim.speedScale = SPEED_OPTIONS[best];
    }
    if (view) {
        for (const k of VIEW_KEYS) if (k in view) sim.view[k] = view[k];
        if ('fields' in view) sim.heatmap.enabled = view.fields;
        if ('lensing' in view) sim.lens.on = view.lensing;
        if ('lensDistance' in view) sim.lens.distance = view.lensDistance;
        if ('depth' in view) sim.spacetime.minDepth = view.depth;
    }
    sim.syncControls?.();
}
