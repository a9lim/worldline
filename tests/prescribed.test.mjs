// The prescribed curves (src/prescribed.js) are the CPU reference the GPU follows
// (shared-prescribed.wgsl, checked against them in physics-validation.html), the figures'
// predictions and the known past written at spawn. So they have to be kinematics: here each
// kind's position, proper velocity, dw/dt and proper time agree with one another, and the
// twin's shuttle reads Bondi's k-calculus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { curveAt, shuttleShape } from '../src/prescribed.js';

const CURVES = [
    { kind: 'uniform', t0: 0, x: 3, y: 4, wx: 0.75, wy: 0.4 },
    { kind: 'hyperbola', t0: 6, x: 0, y: 0, nx: 0.6, ny: -0.8, alpha: 0.12 },
    { kind: 'circle', t0: 0, cx: 0, cy: 0, r: 9, omega: -0.1, phase: 1 },
    { kind: 'oscillation', t0: 0, cx: 0, cy: 0, nx: 0, ny: 1, amp: 6, omega: 0.15, phase: 0.3 },
    { kind: 'shuttle', t0: -3, x: 0, y: 0, nx: 1, ny: 0, v: 0.8, alpha: 0.5, coast: 6 },
];

test('every curve kind: dx/dt = w/γ, dw/dt = a and dτ/dt = 1/γ, under c', () => {
    const h = 1e-5;
    for (const c of CURVES) {
        for (let k = 0; k < 60; k++) {
            const t = -7.3 + 1.37 * k, p = curveAt(c, t), lo = curveAt(c, t - h), hi = curveAt(c, t + h);
            const g = Math.sqrt(1 + p.wx ** 2 + p.wy ** 2), d = (f) => (f(hi) - f(lo)) / (2 * h);
            const at = `${c.kind} at t = ${t.toFixed(2)}`;
            assert.ok(Math.hypot(p.wx, p.wy) / g < 1, at);
            assert.ok(Math.abs(d((q) => q.x) - p.wx / g) < 1e-6 && Math.abs(d((q) => q.y) - p.wy / g) < 1e-6, `${at}: dx/dt`);
            assert.ok(Math.abs(d((q) => q.tau) - 1 / g) < 1e-6, `${at}: dτ/dt`);
            // A shuttle's acceleration jumps where a turn begins or ends
            if (Math.abs(hi.ax - lo.ax) + Math.abs(hi.ay - lo.ay) > 1e-9) continue;
            assert.ok(Math.abs(d((q) => q.wx) - p.ax) < 1e-5 && Math.abs(d((q) => q.wy) - p.ay) < 1e-5, `${at}: dw/dt`);
        }
    }
});

test('the twin: the traveller’s ticks reach home kT apart going and T/k coming back, and it comes home younger', () => {
    const c = { kind: 'shuttle', t0: 0, x: 20, y: 32, nx: 1, ny: 0, v: 0.8, alpha: 0.5, coast: 40 };
    const sh = shuttleShape(c), k = Math.sqrt((1 + sh.v) / (1 - sh.v)), T = 0.25;
    // The lab time at which the traveller's clock reads tau (τ rises along the curve)
    const atTau = (tau) => {
        let lo = 0, hi = sh.period;
        for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (curveAt(c, m).tau < tau) lo = m; else hi = m; }
        return 0.5 * (lo + hi);
    };
    // Home sits where the traveller starts, so a tick's light reaches it after |x − x₀|
    const arrival = (tau) => { const t = atTau(tau), p = curveAt(c, t); return t + Math.hypot(p.x - c.x, p.y - c.y); };
    const going = [], back = [];
    for (let n = 0; n * T < sh.tauPeriod; n++) {
        const t = atTau(n * T);
        if (t > sh.Ta && t < sh.Ta + sh.Tc) going.push(arrival(n * T));
        if (t > 3 * sh.Ta + sh.Tc && t < 3 * sh.Ta + 2 * sh.Tc) back.push(arrival(n * T));
    }
    assert.ok(going.length > 20 && back.length > 20);
    for (let i = 1; i < going.length; i++) assert.ok(Math.abs((going[i] - going[i - 1]) / T - k) < 1e-6);
    for (let i = 1; i < back.length; i++) assert.ok(Math.abs((back[i] - back[i - 1]) / T - 1 / k) < 1e-6);
    // Just before the reunion, by the last turn's own formula, the traveller is home at rest
    // having aged the period's closed form, which is less than home's
    const p = curveAt(c, sh.period - 1e-9);
    assert.ok(Math.hypot(p.x - c.x, p.y - c.y) < 1e-6 && Math.abs(p.wx) < 1e-6);
    assert.ok(Math.abs(p.tau - sh.tauPeriod) < 1e-6);
    assert.ok(sh.tauPeriod < sh.period);
});
