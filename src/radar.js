// ─── Radar (roadmap §6.4) ───
// Radar time is a slicing computed from the geometry, with nothing reflecting (Bondi; Dolby and
// Gull 2001): an event E that the observer's light can reach, leaving at its proper time τ₁, and
// whose light reaches the observer at τ₂, has radar time (τ₁ + τ₂)/2 and radar distance
// (τ₂ − τ₁)/2. For an inertial observer these are its Lorentz coordinates; for the accelerated
// one, Rindler's, with the horizon infinitely far. Radar needs the observer's future, so only an
// observer whose world line is known has it: the lab's eye, the moving and accelerated observers,
// and a prescribed red body. A simulated body's future isn't computed, and radar waits on it.
//
// A line is { pos(t) → [x, y], tau(t) } in lab coordinates and world-line time, with speed
// under 1. Flat space, straight light, an open domain (§6.1).
import { curveAt, isKnown } from './prescribed.js';
import { FRAME_BOOST, FRAME_ACCEL, FRAME_PARTICLE } from './frames.js';

const REACH = 1e4;   // how far either way the light is followed

/** The root of a monotone f on [a, b] where f(a), f(b) bracket it; null if they don't. */
function bisect(f, a, b) {
    let fa = f(a), fb = f(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (Math.sign(fa) === Math.sign(fb)) return null;
    for (let i = 0; i < 80; i++) {
        const m = 0.5 * (a + b), fm = f(m);
        if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; }
    }
    return 0.5 * (a + b);
}

/**
 * The radar coordinates of event (tE, xE, yE) for `line`: { time, distance, tau1, tau2 }, or
 * { beyond: 'future' } when E's light never reaches the observer (past its future horizon) or
 * { beyond: 'past' } when the observer's light never reaches E.
 */
export function radarCoords(line, tE, xE, yE) {
    const dist = (t) => { const p = line.pos(t); return Math.hypot(p[0] - xE, p[1] - yE); };
    // τ₁: the observer's light leaving at t₁ < tE arrives at E; (tE − t) − |x(t) − xE| falls with t
    const t1 = bisect((t) => (tE - t) - dist(t), tE - REACH, tE);
    // τ₂: E's light arriving at t₂ > tE; (t − tE) − |x(t) − xE| rises with t
    const t2 = bisect((t) => (t - tE) - dist(t), tE, tE + REACH);
    if (t2 === null) return { beyond: 'future' };
    if (t1 === null) return { beyond: 'past' };
    const tau1 = line.tau(t1), tau2 = line.tau(t2);
    return { time: 0.5 * (tau1 + tau2), distance: 0.5 * (tau2 - tau1), tau1, tau2 };
}

/** Uniform motion through (x0, y0) at lab time t0 with velocity (ux, uy); τ = 0 at t0. */
export function inertialLine(x0, y0, t0, ux, uy) {
    const g = 1 / Math.sqrt(1 - ux * ux - uy * uy);
    return { pos: (t) => [x0 + ux * (t - t0), y0 + uy * (t - t0)], tau: (t) => (t - t0) / g };
}

/** At rest at (x0, y0) at t0, proper acceleration a along (nx, ny): the hyperbola; τ = 0 at t0. */
export function acceleratedLine(x0, y0, t0, a, nx, ny) {
    return {
        pos: (t) => { const w = a * (t - t0), d = (Math.sqrt(1 + w * w) - 1) / a; return [x0 + nx * d, y0 + ny * d]; },
        tau: (t) => Math.asinh(a * (t - t0)) / a,
    };
}

/**
 * The world line of the observer the view is drawn for, when its future is known, else null:
 * the lab (an eye at rest at the camera's centre), the moving and accelerated observers, a
 * prescribed red body.
 */
export function observerLine(sim) {
    const frames = sim.frames, gp = sim._gpuPhysics;
    if (!gp) return null;
    const now = gp.conformalTime;
    if (!frames.active) return inertialLine(sim.camera.x, sim.camera.y, now, 0, 0);
    const dir = [Math.cos(frames.direction), Math.sin(frames.direction)];
    if (frames.kind === FRAME_BOOST) {
        const v = frames.boostSpeed;
        return inertialLine(frames.origin[0], frames.origin[1], frames.refT, v * dir[0], v * dir[1]);
    }
    if (frames.kind === FRAME_ACCEL) {
        return acceleratedLine(frames.origin[0], frames.origin[1], frames.refT, frames.alpha, dir[0], dir[1]);
    }
    if (frames.kind === FRAME_PARTICLE) {
        const c = gp.prescribed.get(frames.slot);
        if (!c || !isKnown(c)) return null;
        return { pos: (t) => { const p = curveAt(c, t); return [p.x, p.y]; }, tau: (t) => curveAt(c, t).tau };
    }
    return null;
}
