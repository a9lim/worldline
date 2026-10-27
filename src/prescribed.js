// ─── Prescribed world lines ───
// A prescribed body's world line is given, not computed (roadmap §6.2): it sources every law
// like any body and responds to nothing, and the agent that drives it pays. These are its
// curves, evaluated here for the host (the known past written into the ring at spawn, the
// figures' predictions, the oracles) and in shared-prescribed.wgsl for the GPU (prescribed.wgsl
// keeps the body on its curve; spacetime-render.wgsl draws its known future). The two must
// agree: a curve here is the same curve there.
//
// A curve is a plain object with its kind, t0 (world-line time, lab time without expansion),
// tau0 (its proper time at t0) and the kind's parameters, s = t − t0:
//   uniform      x, y at t0; proper velocity wx, wy
//   hyperbola    the turning point x, y at t0, direction nx, ny, proper acceleration alpha:
//                w = α·s·n̂, the whole hyperbola about its corner (x, y) − n̂/α
//   circle       centre cx, cy, radius r, angular rate omega (signed), angle phase at t0
//   oscillation  centre cx, cy, direction nx, ny, amplitude amp, rate omega, phase at t0:
//                x = c + n̂·amp·sin(ω·s + phase)
//   shuttle      at rest at x, y at t0, then out along n̂ to speed v and back, turning at
//                proper acceleration alpha with `coast` of lab time at speed each way, forever
//                (the twin's traveller): a period of four turns of W/α (W = γv) and two coasts
// Speeds stay under c: a circle's r|ω|, an oscillation's amp·ω and a shuttle's v below 1.
//
// The hand (roadmap §6.7) is a sixth kind, 'held': no curve but a pursuit of the pointer that
// prescribed.wgsl integrates, its state in the GPU record (GPUPhysics.grip()). Its future isn't
// known, and curveAt() doesn't evaluate it.

export const CURVE_KINDS = { uniform: 1, hyperbola: 2, circle: 3, oscillation: 4, shuttle: 5, held: 6 };

/** True for a curve whose future is known (every kind but the hand's). */
export const isKnown = (c) => c.kind !== 'held';
export const CURVE_FLOATS = 16;   // the GPU record: kind, t0, tau0, then 13 parameters

// G(θ) = ∫₀^θ √(1 − k² cos² u) du, quasi-periodic: G(θ + π) = G(θ) + G(π), G(π) = 2E(k)
const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
    0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
    0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** ∫ₐᵇ √(1 − k² cos² u) du by two 8-point Gauss–Legendre panels (b − a ≤ π). */
function gPanel(k2, a, b) {
    let sum = 0;
    for (let p = 0; p < 2; p++) {
        const lo = a + (b - a) * p / 2, half = (b - a) / 4, mid = lo + half;
        for (let i = 0; i < 8; i++) {
            const c = Math.cos(mid + half * GL_X[i]);
            sum += GL_W[i] * half * Math.sqrt(Math.max(0, 1 - k2 * c * c));
        }
    }
    return sum;
}

function gQuasi(k2, gPi, theta) {
    const n = Math.floor(theta / Math.PI);
    return n * gPi + gPanel(k2, 0, theta - n * Math.PI);
}

/** The shuttle's derived numbers: W, γ, v, the turn's lab time Ta and distance Da, the period. */
export function shuttleShape(c) {
    const v = c.v, g = 1 / Math.sqrt(1 - v * v), W = g * v, a = c.alpha;
    const Ta = W / a, Da = (g - 1) / a, Tc = c.coast;
    return { v, g, W, Ta, Da, Tc, period: 4 * Ta + 2 * Tc,
             tauPeriod: 4 * Math.asinh(W) / a + 2 * Tc / g, far: 2 * Da + v * Tc };
}

/**
 * The curve at world-line time t: position (x, y), proper velocity (wx, wy), dw/dt (ax, ay)
 * and proper time tau.
 */
export function curveAt(c, t) {
    const s = t - c.t0;
    let x, y, wx, wy, ax = 0, ay = 0, tau;
    switch (c.kind) {
        case 'uniform': {
            const g = Math.sqrt(1 + c.wx * c.wx + c.wy * c.wy);
            x = c.x + c.wx / g * s; y = c.y + c.wy / g * s;
            wx = c.wx; wy = c.wy; tau = s / g;
            break;
        }
        case 'hyperbola': {
            const w = c.alpha * s, g = Math.sqrt(1 + w * w), d = (g - 1) / c.alpha;
            x = c.x + c.nx * d; y = c.y + c.ny * d;
            wx = c.nx * w; wy = c.ny * w;
            ax = c.nx * c.alpha; ay = c.ny * c.alpha;
            tau = Math.asinh(w) / c.alpha;
            break;
        }
        case 'circle': {
            const v = c.r * Math.abs(c.omega), g = 1 / Math.sqrt(1 - v * v);
            const ph = c.phase + c.omega * s, cs = Math.cos(ph), sn = Math.sin(ph);
            x = c.cx + c.r * cs; y = c.cy + c.r * sn;
            wx = -g * c.r * c.omega * sn; wy = g * c.r * c.omega * cs;
            ax = -g * c.r * c.omega * c.omega * cs; ay = -g * c.r * c.omega * c.omega * sn;
            tau = s / g;
            break;
        }
        case 'oscillation': {
            const th = c.omega * s + c.phase, k = c.amp * c.omega, k2 = k * k;
            const v = k * Math.cos(th), g = 1 / Math.sqrt(1 - v * v);
            const d = c.amp * Math.sin(th), acc = -g * g * g * c.amp * c.omega * c.omega * Math.sin(th);
            x = c.cx + c.nx * d; y = c.cy + c.ny * d;
            wx = c.nx * g * v; wy = c.ny * g * v;
            ax = c.nx * acc; ay = c.ny * acc;
            const gPi = gPanel(k2, 0, Math.PI);
            tau = (gQuasi(k2, gPi, th) - gQuasi(k2, gPi, c.phase)) / c.omega;
            break;
        }
        case 'shuttle': {
            const sh = shuttleShape(c), a = c.alpha;
            const n = Math.floor(s / sh.period), r = s - n * sh.period;
            const asW = Math.asinh(sh.W);
            let d, w, acc;
            tau = n * sh.tauPeriod;
            if (r < sh.Ta) {
                w = a * r; d = (Math.sqrt(1 + w * w) - 1) / a; acc = a; tau += Math.asinh(w) / a;
            } else if (r < sh.Ta + sh.Tc) {
                w = sh.W; d = sh.Da + sh.v * (r - sh.Ta); acc = 0; tau += asW / a + (r - sh.Ta) / sh.g;
            } else if (r < 3 * sh.Ta + sh.Tc) {
                w = sh.W - a * (r - sh.Ta - sh.Tc); d = sh.far - (Math.sqrt(1 + w * w) - 1) / a; acc = -a;
                tau += asW / a + sh.Tc / sh.g + (asW - Math.asinh(w)) / a;
            } else if (r < 3 * sh.Ta + 2 * sh.Tc) {
                w = -sh.W; d = sh.far - sh.Da - sh.v * (r - 3 * sh.Ta - sh.Tc); acc = 0;
                tau += 3 * asW / a + sh.Tc / sh.g + (r - 3 * sh.Ta - sh.Tc) / sh.g;
            } else {
                w = -sh.W + a * (r - 3 * sh.Ta - 2 * sh.Tc); d = (Math.sqrt(1 + w * w) - 1) / a; acc = a;
                tau += 3 * asW / a + 2 * sh.Tc / sh.g + (Math.asinh(w) + asW) / a;
            }
            x = c.x + c.nx * d; y = c.y + c.ny * d;
            wx = c.nx * w; wy = c.ny * w; ax = c.nx * acc; ay = c.ny * acc;
            break;
        }
        default: throw new Error('unknown curve kind ' + c.kind);
    }
    return { x, y, wx, wy, ax, ay, tau: (c.tau0 ?? 0) + tau };
}

/** The highest speed a curve reaches (for checks: a prescribed body stays under c). */
export function curveTopSpeed(c) {
    switch (c.kind) {
        case 'uniform': { const w = Math.hypot(c.wx, c.wy); return w / Math.sqrt(1 + w * w); }
        case 'hyperbola': return 1;
        case 'circle': return c.r * Math.abs(c.omega);
        case 'oscillation': return c.amp * Math.abs(c.omega);
        case 'shuttle': return c.v;
        default: return NaN;
    }
}

/**
 * The GPU record (shared-prescribed.wgsl, CURVE_FLOATS words): kind (u32), t0 as GPU time
 * (the world-line clock minus `epoch`), tau0, then the kind's parameters, with what the shader
 * would otherwise recompute every call (the oscillation's G(π), the shuttle's shape).
 */
export function packCurve(c, epoch, out = new Float32Array(CURVE_FLOATS), offset = 0) {
    const f = out.subarray(offset, offset + CURVE_FLOATS);
    f.fill(0);
    new Uint32Array(f.buffer, f.byteOffset, 1)[0] = CURVE_KINDS[c.kind];
    f[1] = c.t0 - epoch;
    f[2] = c.tau0 ?? 0;
    const p = (...v) => v.forEach((x, i) => { f[3 + i] = x; });
    switch (c.kind) {
        case 'uniform': p(c.x, c.y, c.wx, c.wy); break;
        case 'hyperbola': p(c.x, c.y, c.nx, c.ny, c.alpha); break;
        case 'circle': p(c.cx, c.cy, c.r, c.omega, c.phase); break;
        case 'oscillation': {
            const k = c.amp * c.omega;
            p(c.cx, c.cy, c.nx, c.ny, c.amp, c.omega, c.phase, gPanel(k * k, 0, Math.PI));
            break;
        }
        case 'shuttle': {
            const sh = shuttleShape(c);
            p(c.x, c.y, c.nx, c.ny, sh.W, c.alpha, c.coast, sh.period, sh.tauPeriod);
            break;
        }
        // The pointer, and the mode that takes hold from the body's own state
        case 'held': p(c.tx, c.ty, 0, 0, 0, 0, 1, 0); break;
    }
    return out;
}

/** The same curve with t0 moved by dt (a save keeps t0 relative to its own time). */
export const shiftCurve = (c, dt) => ({ ...c, t0: c.t0 + dt });
