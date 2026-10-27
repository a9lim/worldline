// ─── Prescribed world lines: the curves ───
// src/prescribed.js documents the kinds and packs the records; this include evaluates them,
// the same curves (prescribed.wgsl keeps a prescribed body on its curve, spacetime-render.wgsl
// draws its known future). A record is CURVE_VEC4S vec4s a slot:
//   [0] kind (u32 bits), t0 (GPU time), tau0, p0      [1] p1 … p4
//   [2] p5 … p8                                        [3] p9 … p12
// Parameters by kind (s = t − t0):
//   1 uniform      x, y, wx, wy
//   2 hyperbola    x, y (the turning point), nx, ny, α
//   3 circle       cx, cy, r, ω, phase
//   4 oscillation  cx, cy, nx, ny, amp, ω, phase, G(π)
//   5 shuttle      x, y (the near apex), nx, ny, W = γv, α, coast, period, τ per period

const CURVE_VEC4S: u32 = 4u;
const CURVE_UNIFORM: u32 = 1u;
const CURVE_HYPERBOLA: u32 = 2u;
const CURVE_CIRCLE: u32 = 3u;
const CURVE_OSCILLATION: u32 = 4u;
const CURVE_SHUTTLE: u32 = 5u;

struct Curve {
    kind: u32,
    t0: f32,
    tau0: f32,
    p: array<f32, 13>,
};

/** A point of a curve: position, proper velocity, dw/dt and proper time. */
struct CurvePoint {
    pos: vec2<f32>,
    w: vec2<f32>,
    wdot: vec2<f32>,
    tau: f32,
};

fn curveFrom(a: vec4<f32>, b: vec4<f32>, c: vec4<f32>, d: vec4<f32>) -> Curve {
    var r: Curve;
    r.kind = bitcast<u32>(a.x);
    r.t0 = a.y;
    r.tau0 = a.z;
    r.p = array<f32, 13>(a.w, b.x, b.y, b.z, b.w, c.x, c.y, c.z, c.w, d.x, d.y, d.z, d.w);
    return r;
}

// G(θ) = ∫₀^θ √(1 − k² cos² u) du on [0, π] by two 8-point Gauss–Legendre panels
var<private> GL8_X: array<f32, 8> = array<f32, 8>(-0.96028986, -0.79666648, -0.52553241, -0.18343464,
                            0.18343464, 0.52553241, 0.79666648, 0.96028986);
var<private> GL8_W: array<f32, 8> = array<f32, 8>(0.10122854, 0.22238103, 0.31370665, 0.36268378,
                            0.36268378, 0.31370665, 0.22238103, 0.10122854);

fn curveGPanel(k2: f32, b: f32) -> f32 {
    var sum = 0.0;
    let half = b * 0.25;
    for (var p = 0; p < 2; p++) {
        let mid = b * 0.5 * f32(p) + half;
        for (var i = 0; i < 8; i++) {
            let c = cos(mid + half * GL8_X[i]);
            sum += GL8_W[i] * half * sqrt(max(0.0, 1.0 - k2 * c * c));
        }
    }
    return sum;
}

fn curveG(k2: f32, gPi: f32, theta: f32) -> f32 {
    let n = floor(theta / PI);
    return n * gPi + curveGPanel(k2, theta - n * PI);
}

/** The curve at GPU time t. */
fn curveAt(c: Curve, t: f32) -> CurvePoint {
    let s = t - c.t0;
    var o: CurvePoint;
    o.wdot = vec2(0.0);
    var tau = 0.0;
    switch c.kind {
        case 1u: {   // uniform
            let w = vec2(c.p[2], c.p[3]);
            let g = sqrt(1.0 + dot(w, w));
            o.pos = vec2(c.p[0], c.p[1]) + w / g * s;
            o.w = w;
            tau = s / g;
        }
        case 2u: {   // hyperbola
            let n = vec2(c.p[2], c.p[3]);
            let alpha = c.p[4];
            let w = alpha * s;
            let g = sqrt(1.0 + w * w);
            o.pos = vec2(c.p[0], c.p[1]) + n * ((g - 1.0) / alpha);
            o.w = n * w;
            o.wdot = n * alpha;
            tau = asinh(w) / alpha;
        }
        case 3u: {   // circle
            let r = c.p[2];
            let om = c.p[3];
            let v = r * abs(om);
            let g = inverseSqrt(max(1.0 - v * v, EPSILON));
            let ph = c.p[4] + om * s;
            let e = vec2(cos(ph), sin(ph));
            o.pos = vec2(c.p[0], c.p[1]) + r * e;
            o.w = g * r * om * vec2(-e.y, e.x);
            o.wdot = -g * r * om * om * e;
            tau = s / g;
        }
        case 4u: {   // oscillation
            let n = vec2(c.p[2], c.p[3]);
            let amp = c.p[4];
            let om = c.p[5];
            let th = om * s + c.p[6];
            let k = amp * om;
            let v = k * cos(th);
            let g = inverseSqrt(max(1.0 - v * v, EPSILON));
            o.pos = vec2(c.p[0], c.p[1]) + n * (amp * sin(th));
            o.w = n * (g * v);
            o.wdot = n * (-g * g * g * amp * om * om * sin(th));
            tau = (curveG(k * k, c.p[7], th) - curveG(k * k, c.p[7], c.p[6])) / om;
        }
        case 5u: {   // shuttle
            let n = vec2(c.p[2], c.p[3]);
            let W = c.p[4];
            let alpha = c.p[5];
            let Tc = c.p[6];
            let P = c.p[7];
            let g = sqrt(1.0 + W * W);
            let v = W / g;
            let Ta = W / alpha;
            let Da = (g - 1.0) / alpha;
            let far = 2.0 * Da + v * Tc;
            let asW = asinh(W);
            let cycles = floor(s / P);
            let r = s - cycles * P;
            tau = cycles * c.p[8];
            var d = 0.0;
            var w = 0.0;
            var acc = 0.0;
            if (r < Ta) {
                w = alpha * r; d = (sqrt(1.0 + w * w) - 1.0) / alpha; acc = alpha;
                tau += asinh(w) / alpha;
            } else if (r < Ta + Tc) {
                w = W; d = Da + v * (r - Ta);
                tau += asW / alpha + (r - Ta) / g;
            } else if (r < 3.0 * Ta + Tc) {
                w = W - alpha * (r - Ta - Tc); d = far - (sqrt(1.0 + w * w) - 1.0) / alpha; acc = -alpha;
                tau += asW / alpha + Tc / g + (asW - asinh(w)) / alpha;
            } else if (r < 3.0 * Ta + 2.0 * Tc) {
                w = -W; d = far - Da - v * (r - 3.0 * Ta - Tc);
                tau += 3.0 * asW / alpha + Tc / g + (r - 3.0 * Ta - Tc) / g;
            } else {
                w = -W + alpha * (r - 3.0 * Ta - 2.0 * Tc); d = (sqrt(1.0 + w * w) - 1.0) / alpha; acc = alpha;
                tau += 3.0 * asW / alpha + 2.0 * Tc / g + (asinh(w) + asW) / alpha;
            }
            o.pos = vec2(c.p[0], c.p[1]) + n * d;
            o.w = n * w;
            o.wdot = n * acc;
        }
        default: {
            o.pos = vec2(0.0);
            o.w = vec2(0.0);
        }
    }
    o.tau = c.tau0 + tau;
    return o;
}
