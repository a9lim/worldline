// ─── Frame panel ───
// The Figure tab's Observer: which observer the view is drawn for (frames.js), as words, with
// its parameters and the look-back scrubber, which only acts while paused; and the Measure
// tab's readouts of it (speed, γ, and how far behind the lab its now is). The figure bar's
// lab · observer switches between the lab and the observer chosen here.
import { FRAME_KEYS, FRAME_LAB, FRAME_PARTICLE, FRAME_BOOST, FRAME_COROTATE, FRAME_FREEFALL, FRAME_ACCEL } from './frames.js';
import { WORLDLINE_LEN, WORLDLINE_DT } from './config.js';
import { t } from './i18n.js';
import { showChoice, enableChoice } from './controls.js';
import { radarCoords, observerLine } from './radar.js';

export default class FramePanel {
    constructor(sim) {
        this.sim = sim;
        const $ = (id) => document.getElementById(id);
        this.el = {
            choice: $('observer-choice'),
            boost: $('frame-boost-group'),
            corotate: $('frame-corotate-group'),
            speedRow: $('frame-speed-row'),
            accel: $('frame-accel-row'),
            readout: $('frame-readout'),
            speed: $('frame-speed'),
            gamma: $('frame-gamma'),
            now: $('frame-now'),
            extrapolated: $('frame-extrapolated'),
            radarRow: $('frame-radar-row'),
            radar: $('frame-radar'),
            scrub: $('frame-scrub-group'),
            lookBack: $('frameLookBackInput'),
        };

        this._fmtSpeed = v => Math.tanh(v).toFixed(2) + 'c';
        this._fmtDir = v => Math.round(v) + '°';
        // The boost here and the scene's Boost slider are one setting (ui.js setBoost)
        _forms.bindSlider($('frameRapidityInput'), $('frameSpeedValue'), v => {
            sim.frames.rapidity = v;
            sim.syncBoost?.();
            sim._dirty = true;
        }, this._fmtSpeed);
        _forms.bindSlider($('frameAlphaInput'), $('frameAlphaValue'), v => {
            sim.frames.alpha = v;
            sim._dirty = true;
        }, v => v.toFixed(3));
        _forms.bindSlider($('frameDirInput'), $('frameDirValue'), v => {
            sim.frames.direction = v * Math.PI / 180;
            sim.syncBoost?.();
            sim._dirty = true;
        }, this._fmtDir);
        _forms.bindSlider($('frameOmegaInput'), $('frameOmegaValue'), v => {
            sim.frames.omega = v;
            sim._dirty = true;
        }, v => v.toFixed(3));
        _forms.bindSlider(this.el.lookBack, $('frameLookBackValue'), v => {
            sim.frames.lookBack = v;
            sim._dirty = true;
        }, v => v.toFixed(1));
        this.syncBoost();
        this._sync();
    }

    /** Switch to the frame named `key` ('lab', 'zmf', …); the particle frame needs a selection. */
    choose(key) {
        const sim = this.sim;
        const kind = Math.max(0, FRAME_KEYS.indexOf(key));
        // The figure bar's observer is the last one chosen here
        if (kind !== FRAME_LAB) sim.observerKind = key;
        if (kind !== FRAME_LAB && !sim.frames.allowed) {
            if (typeof showToast === 'function') showToast(t('frame.expanding'));
            sim.frames.set(FRAME_LAB);
        } else if (!sim.frames.set(kind)) {
            if (typeof showToast === 'function') showToast(t('frame.needSelection'));
        }
        this._sync();
    }

    /** Show the boost frame's speed and direction as frames.js holds them. */
    syncBoost() {
        const f = this.sim.frames, $ = (id) => document.getElementById(id);
        const deg = ((f.direction * 180 / Math.PI) % 360 + 360) % 360;
        $('frameRapidityInput').value = f.rapidity;
        $('frameSpeedValue').textContent = this._fmtSpeed(f.rapidity);
        $('frameDirInput').value = deg;
        $('frameDirValue').textContent = this._fmtDir(deg);
    }

    /** The next frame in the list (B). */
    cycle() {
        // The next frame, skipping the ones that follow a particle when nothing is selected
        let kind = this.sim.frames.kind;
        do kind = (kind + 1) % FRAME_KEYS.length;
        while ((kind === FRAME_PARTICLE || kind === FRAME_FREEFALL) && this.sim.selectedIdx < 0);
        this.choose(FRAME_KEYS[kind]);
    }

    _sync() {
        this.showObserver();
        this.syncAvailable();
        this.update();
        this.sim.syncCoords?.();
    }

    /** The observer as words: the frame in force, or a moving one being eased into. */
    showObserver() {
        const sim = this.sim, frames = sim.frames;
        const shown = frames.active ? FRAME_KEYS[frames.kind] : (sim.spacetime && sim.spacetime._sTo === 1 ? 'boost' : 'lab');
        showChoice(this.el.choice, shown);
        // The parameters of the observer the figure bar would switch to
        const kind = frames.active ? frames.kind : FRAME_KEYS.indexOf(sim.observerKind || 'boost');
        // Speed for the moving observer; α for the accelerated one; direction for both
        this.el.boost.hidden = kind !== FRAME_BOOST && kind !== FRAME_ACCEL;
        this.el.speedRow.hidden = kind !== FRAME_BOOST;
        this.el.accel.hidden = kind !== FRAME_ACCEL;
        this.el.corotate.hidden = kind !== FRAME_COROTATE;
        this.el.readout.hidden = !frames.active;
    }

    /** Observers that need a selection, or a static universe, are off without one. */
    syncAvailable() {
        const sim = this.sim, allowed = sim.frames.allowed && !sim.settings.expansionEnabled;
        for (const key of FRAME_KEYS) {
            if (key === 'lab') continue;
            const needsBody = key === 'particle' || key === 'freefall';
            enableChoice(this.el.choice, key, allowed && (!needsBody || sim.selectedIdx >= 0));
        }
    }

    /** Refresh the readouts (each rendered frame). */
    update() {
        const sim = this.sim;
        const frames = sim.frames;
        const paused = !sim.running;
        this.el.scrub.hidden = !(frames.active && paused);
        if (!frames.active) return;
        const st = frames.state;
        if (!st || !st.valid) {
            this.el.speed.textContent = '—';
            this.el.gamma.textContent = '—';
            this.el.now.textContent = '—';
            this.el.extrapolated.hidden = true;
            return;
        }
        const speed = Math.hypot(st.ux, st.uy);
        this.el.speed.textContent = speed.toFixed(3) + 'c';
        this.el.gamma.textContent = st.gamma.toFixed(3);
        this.el.now.textContent = st.lag > 0.05
            ? t('frame.nowLagged').replace('{lag}', st.lag.toFixed(1))
            : t('frame.nowLab');
        this.el.extrapolated.hidden = !this._outsideHistory(st);
        this._showRadar();
    }

    /**
     * The red body's radar time and distance for the observer (src/radar.js), at the event the
     * scene snapshot read it at: shown while the observer's future is known and a body other
     * than the observer is selected.
     */
    _showRadar() {
        const sim = this.sim, frames = sim.frames, sel = sim.selectedIdx;
        const b = sim.scene?.bodies?.[sel];
        const line = observerLine(sim);
        const on = !!(line && b && b.alive && sim.scene.t != null && !(frames.kind === FRAME_PARTICLE && frames.slot === sel));
        if (this.el.radarRow.hidden === on) this.el.radarRow.hidden = !on;
        if (!on) return;
        const r = radarCoords(line, sim.scene.t, b.x, b.y);
        this.el.radar.textContent = r.beyond ? t(r.beyond === 'future' ? 'frame.beyondFuture' : 'frame.beyondPast')
            : t('frame.radarValue').replace('{t}', r.time.toFixed(2)).replace('{d}', r.distance.toFixed(2));
    }

    /**
     * Whether the visible slice leaves the recorded history: its trailing edge before the
     * run began or the ring's oldest sample, or its leading edge past the lab's now (the lag
     * is capped at the ring's reach). frame-slice.wgsl extrapolates there.
     */
    _outsideHistory(st) {
        const sim = this.sim;
        const p = sim.frames.params();
        const now = sim._gpuPhysics ? sim._gpuPhysics.conformalTime : 0;
        let back = 0, ahead = 0;
        const s = Math.hypot(st.ux, st.uy);
        if (p && st.lorentz && s > 1e-6) {
            const nx = st.ux / s, ny = st.uy / s;
            const spread = Math.abs(p.viewHalfW * nx) + Math.abs(p.viewHalfH * ny);
            const along = p.viewX * nx + p.viewY * ny;
            back = s * st.gamma * Math.max(spread - along, 0);
            ahead = s * st.gamma * Math.max(spread + along, 0);
        }
        const start = Math.max(0, now - WORLDLINE_LEN * WORLDLINE_DT);
        return st.tA - back < start - 0.01 || st.tA + ahead > now + 0.01;
    }

    /** The particle frame's observer died: fall back to the lab. */
    observerLost() {
        if (this.sim.frames.followsParticle) this.choose('lab');
    }
}

export { FRAME_LAB };
