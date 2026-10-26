// ─── The margin's controls ───
// Behaviour for the controls drawn in the plate's own notation (styles.css draws them):
// - a choice: words, one pressed (or several, `multi`), each a button with data-value;
// - a knob: a number in running text (the caption) that you drag or step with the arrow keys;
// - a pad: an arrow you drag to set a uniform field's magnitude and direction.
// Ticks are labelled checkboxes and scales are range inputs, so they need nothing here.
import { line, circle, arrowTo } from './marks.js';

/**
 * Wire a choice group: a click presses its button (in a single choice, only it) and calls
 * onPick(value, pressed). Disabled buttons do nothing.
 */
export function bindChoice(group, onPick, { multi = false } = {}) {
    group.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-value]');
        if (!btn || btn.disabled || !group.contains(btn)) return;
        const pressed = multi ? btn.getAttribute('aria-pressed') !== 'true' : true;
        if (!multi && btn.getAttribute('aria-pressed') === 'true') return;
        if (!multi) for (const b of group.querySelectorAll('button[data-value]')) b.setAttribute('aria-pressed', String(b === btn));
        else btn.setAttribute('aria-pressed', String(pressed));
        onPick(btn.dataset.value, pressed);
        _haptics.trigger('selection');
    });
}

/** Show a choice's value without firing it: one value, or (multi) a predicate on values. */
export function showChoice(group, value) {
    const on = typeof value === 'function' ? value : (v) => v === value;
    for (const b of group.querySelectorAll('button[data-value]')) b.setAttribute('aria-pressed', String(on(b.dataset.value)));
}

/** Enable or disable one of a choice's buttons by value. */
export function enableChoice(group, value, enabled) {
    const b = group.querySelector(`button[data-value="${value}"]`);
    if (b) b.disabled = !enabled;
}

/**
 * A knob: a number set in running text. Dragging sideways sweeps its whole range in about
 * 240 px (Shift for a tenth of that); the arrow keys step it (Shift for ten steps). `input`
 * gets every value as it changes and `commit` the value it settles on (a drag's release, a
 * key), which is where a knob that re-runs its figure acts. A log knob moves in log₁₀.
 */
export class Knob {
    constructor({ label, min, max, step, log = false, fmt = (v) => v.toFixed(2), get, input, commit }) {
        this.min = min; this.max = max; this.step = step; this.log = log; this.fmt = fmt;
        this.get = get; this.input = input; this.commit = commit;
        const el = this.el = document.createElement('span');
        el.className = 'knob';
        el.tabIndex = 0;
        el.setAttribute('role', 'slider');
        el.setAttribute('aria-label', label);
        el.setAttribute('aria-valuemin', String(min));
        el.setAttribute('aria-valuemax', String(max));
        let x0 = 0, u0 = 0, dragging = false, moved = false;
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser no longer tracks */ }
            dragging = true; moved = false;
            x0 = e.clientX; u0 = this._u(this.get());
            el.classList.add('drag');
        });
        el.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const k = e.shiftKey ? 0.1 : 1;
            const v = this._v(u0 + (e.clientX - x0) * k / 240);
            if (v !== this.get()) { moved = true; this.input(v); this.sync(); }
        });
        const end = () => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('drag');
            if (moved) this.commit?.(this.get());
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('keydown', (e) => {
            const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();   // the shortcuts don't see a knob's arrows
            const n = e.shiftKey ? 10 : 1;
            const v = this.log ? this._v(this._u(this.get()) + d * n * 0.01) : this._clamp(this.get() + d * n * this.step);
            if (v !== this.get()) { this.input(v); this.sync(); this.commit?.(v); }
        });
        this.sync();
    }

    /** Position in [0, 1] of a value, and back (snapped to the step, inside the range). */
    _u(v) {
        return this.log ? (Math.log10(v) - Math.log10(this.min)) / (Math.log10(this.max) - Math.log10(this.min))
                        : (v - this.min) / (this.max - this.min);
    }
    _v(u) {
        u = Math.min(1, Math.max(0, u));
        return this._clamp(this.log ? 10 ** (Math.log10(this.min) + u * (Math.log10(this.max) - Math.log10(this.min)))
                                    : this.min + u * (this.max - this.min));
    }
    _clamp(v) {
        v = Math.min(this.max, Math.max(this.min, v));
        return this.log ? v : Math.round(v / this.step) * this.step;
    }

    /** Show the current value. */
    sync() {
        const v = this.get(), text = this.fmt(v);
        if (this.el.textContent !== text) this.el.textContent = text;
        this.el.setAttribute('aria-valuenow', String(v));
        this.el.setAttribute('aria-valuetext', text);
    }
}

/**
 * A field pad: a circle you drag an arrow in, its length the magnitude (1 at the rim) and its
 * direction the field's, y down as on the plate. The arrow keys turn it (left, right) and
 * lengthen or shorten it (up, down). get() → { m, a } with a in radians; set(m, a); describe(m, a)
 * is the value in words, for its readout `out` and for assistive technology. Returns draw().
 */
export function bindPad(svg, { inkVar, get, set, describe, out }) {
    const R = 30, c = `var(${inkVar})`;
    const draw = () => {
        const { m, a } = get();
        const r = m * R, x = Math.cos(a) * r, y = Math.sin(a) * r;
        svg.innerHTML = circle(0, 0, R, 'var(--border-strong)', 'none', 1)
            + circle(0, 0, R / 2, 'var(--border)', 'none', 1, ' stroke-dasharray="1.5 2.5"')
            + line(-R, 0, R, 0, 'var(--border)', 1) + line(0, -R, 0, R, 'var(--border)', 1)
            + (r > 5 ? arrowTo(0, 0, x, y, c, 1.4, 4) : r > 0.5 ? line(0, 0, x, y, c, 1.4) : circle(0, 0, 1.6, 'none', c, 0));
        const text = describe(m, a);
        svg.setAttribute('aria-valuetext', text);
        if (out && out.textContent !== text) out.textContent = text;
    };
    const at = (e) => {
        const b = svg.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width * 72 - 36, y = (e.clientY - b.top) / b.height * 72 - 36;
        const m = Math.round(Math.min(1, Math.hypot(x, y) / R) * 100) / 100;
        set(m, m > 0 ? Math.atan2(y, x) : get().a);
        draw();
    };
    let down = false;
    svg.addEventListener('pointerdown', (e) => {
        down = true;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser no longer tracks */ }
        at(e);
    });
    svg.addEventListener('pointermove', (e) => { if (down) at(e); });
    svg.addEventListener('pointerup', () => { down = false; });
    svg.addEventListener('pointercancel', () => { down = false; });
    svg.addEventListener('keydown', (e) => {
        let { m, a } = get();
        if (e.key === 'ArrowUp') m = Math.min(1, m + 0.01);
        else if (e.key === 'ArrowDown') m = Math.max(0, m - 0.01);
        else if (e.key === 'ArrowRight') a += Math.PI / 36;
        else if (e.key === 'ArrowLeft') a -= Math.PI / 36;
        else return;
        e.preventDefault();
        e.stopPropagation();
        set(Math.round(m * 100) / 100, (a + 2 * Math.PI) % (2 * Math.PI));
        draw();
    });
    return draw;
}
