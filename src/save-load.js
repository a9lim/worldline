import { DEFAULT_SPEED_SCALE, WORLD_SCALE } from './config.js';
import { TOGGLE_KEYS, PARAMETER_KEYS } from './physics-contract.js';
import { createPhysicsSettings, applyConfig } from './physics-settings.js';

/**
 * Save simulation state (async: reads particle buffers back from the GPU).
 * @param {Object} sim
 * @returns {Promise<Object|null>} State object, or null before WebGPU is up
 */
export async function saveState(sim) {
    if (!sim._gpuPhysics) return null;
    return await sim._gpuPhysics.serialize(sim);
}

/**
 * Bring a stored state up to the current format (version 2), or return null.
 * Version 1 predates the domain and the clocks: its domain was the window it was
 * saved in, which the best guess is this window, and every clock starts at zero.
 */
function migrateState(state) {
    if (!state) return null;
    if (state.version === 2) return state;
    if (state.version !== 1) return null;
    return {
        ...state,
        version: 2,
        domain: { w: window.innerWidth / WORLD_SCALE, h: window.innerHeight / WORLD_SCALE },
        particles: (state.particles || []).map(p => ({ ...p, tau: 0, theta: 0 })),
    };
}

export function loadState(stored, sim) {
    const state = migrateState(stored);
    if (!state || !sim._gpuPhysics) return false;

    // The domain first: deserialize() places particles in it. Then deserialize()
    // calls reset() internally and uploads particles to GPU.
    sim.setDomain(state.domain.w, state.domain.h);
    const ok = sim._gpuPhysics.deserialize(state, sim);
    if (!ok) return false;
    sim.select(-1);

    // The settings, modes and speed through the presets' path, then the camera
    applyConfig(sim, stateConfig(state));
    if (state.camera) {
        sim.camera.x = state.camera.x;
        sim.camera.y = state.camera.y;
        sim.camera.zoom = state.camera.zoom;
    }
    sim.stats.resetBaseline();
    return true;
}

/** A save's configuration for applyConfig(): what it carries, and the defaults for the rest. */
function stateConfig(state) {
    const settings = createPhysicsSettings();
    for (const key of TOGGLE_KEYS) {
        if (state.toggles && state.toggles[key] != null) settings[key] = !!state.toggles[key];
    }
    for (const key of PARAMETER_KEYS) {
        if (state[key] != null) settings[key] = state[key];
    }
    const s = state.settings;
    if (!s) return { settings };
    if (s.friction != null) settings.bounceFriction = s.friction;
    return {
        settings,
        // 'repel' was renamed to 'bounce' in an earlier version
        modes: { collision: s.collision === 'repel' ? 'bounce' : s.collision, boundary: s.boundary, topology: s.topology },
        speed: s.speed ?? DEFAULT_SPEED_SCALE,
    };
}

export async function downloadState(sim) {
    const state = await saveState(sim);
    if (!state) return;
    const json = JSON.stringify(state);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nohair-state.json';
    a.click();
    // A12: Defer revoke to next frame — immediate revoke may fire before download starts
    requestAnimationFrame(() => URL.revokeObjectURL(a.href));
}

export function uploadState(sim, onComplete) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const state = JSON.parse(reader.result);
                if (loadState(state, sim)) {
                    showToast((window._i18n && window._i18n.t('toast.stateLoaded')) || 'State loaded');
                    if (onComplete) onComplete();
                } else {
                    showToast((window._i18n && window._i18n.t('toast.invalidState')) || 'Invalid state file');
                }
            } catch { showToast((window._i18n && window._i18n.t('toast.parseFailed')) || 'Failed to parse state file'); }
        };
        reader.readAsText(file);
    });
    input.click();
}

export async function quickSave(sim) {
    const state = await saveState(sim);
    if (!state) return;
    localStorage.setItem('nohair-quicksave', JSON.stringify(state));
    showToast((window._i18n && window._i18n.t('toast.quickSaved')) || 'Quick saved');
}

export function quickLoad(sim, onComplete) {
    const json = localStorage.getItem('nohair-quicksave');
    if (!json) { showToast((window._i18n && window._i18n.t('toast.noQuickSave')) || 'No quick save found'); return; }
    try {
        const state = JSON.parse(json);
        if (loadState(state, sim)) {
            showToast((window._i18n && window._i18n.t('toast.quickLoaded')) || 'Quick loaded');
            if (onComplete) onComplete();
        }
    } catch { showToast((window._i18n && window._i18n.t('toast.quickLoadFailed')) || 'Failed to load quick save'); }
}
