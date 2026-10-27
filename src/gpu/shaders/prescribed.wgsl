// ─── Prescribed bodies ───
// A prescribed body's world line is given (src/prescribed.js, shared-prescribed.wgsl): it
// sources every law and responds to nothing. Once a substep, after everything that moves a
// body (the kicks, the drift, 1PN's correction, collisions, bosons, the boundary) and before
// the world lines record it, this pass puts each prescribed body back on its curve at the
// substep's end, u.simTime: its position (through the slot's deck, so on a torus the curve lives
// on the covering plane), its proper velocity, its clock, and in totalForce the curve's own
// m·dw/dt, which worldline.wgsl records as the sample's acceleration (so the Liénard–Wiechert
// field is the field of the motion drawn).
//
// The agent that drives it pays: what the substep did to the body (every force, an external
// field) it undoes, so the four-momentum it adds is the curve's minus the state the substep
// left, summed over the bodies here and added to agentAccum. Over a run that is
// W_agent = Δ(γm) − ∫F_other·v dt (roadmap §6.2): the forces' work is the step from the curve
// to the state left, and the agent's the step back. Read and cleared with the stats.
//
// The clock is the curve's proper time, exact (prescribed clocks run flat: the gravitational
// lapse is the model's, clocks.wgsl, which skips these bodies). The spoke turns with the body
// and precesses by Thomas's (γ²/(γ+1))·(a × v) of the curve's whole acceleration, all of it
// the agent's push.
//
// The hand (roadmap §6.7) is a prescribed line written live: a held body's record (kind
// CURVE_HELD) carries the pointer's position and the pursuit's state, which this pass advances.
// The body pursues the pointer in simulation time with a velocity it would like, (target − x)/
// HAND_REACH capped at HAND_SPEED, and an acceleration toward it, over HAND_RESPONSE, capped at
// HAND_ACCEL: so its speed never passes HAND_SPEED, under the speed where LW_KAPPA_MIN starts to
// suppress the forward field (about 0.78c), and its path is smooth (nothing is clamped after the
// fact). Taking hold (mode 1) starts from the body's own state and sets FLAG_PRESCRIBED; letting go
// (mode 2) clears it, and the body flies on at its last velocity.
//
// One workgroup over the list of prescribed slots (count first; PRESCRIBED_CAP at most).

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read_write> allForces: array<AllForces>;
@group(0) @binding(3) var<storage, read_write> clocks: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> derived: array<ParticleDerived>;
@group(0) @binding(5) var<storage, read> wlMeta: array<u32>;
@group(0) @binding(6) var<storage, read_write> curves: array<vec4<f32>>;   // rw: the hand's state
@group(0) @binding(7) var<storage, read> prescribedList: array<u32>;
@group(0) @binding(8) var<storage, read_write> agentAccum: array<vec4<f32>>;   // E, Px, Py, 0

var<workgroup> shAgent: array<vec4<f32>, PRESCRIBED_CAP>;

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.y - a.y * b.x;
}

const HAND_SPEED: f32 = 0.75;
const HAND_ACCEL: f32 = 0.6;
const HAND_REACH: f32 = 3.0;      // time to close the distance at the speed it would like
const HAND_RESPONSE: f32 = 1.5;   // time to reach that speed

fn capLength(v: vec2<f32>, m: f32) -> vec2<f32> {
    let l = length(v);
    return select(v, v * (m / l), l > m);
}

@compute @workgroup_size(PRESCRIBED_CAP)
fn applyPrescribed(@builtin(local_invocation_index) lid: u32) {
    var books = vec4(0.0);
    let n = min(prescribedList[0], PRESCRIBED_CAP);
    let i = prescribedList[1u + min(lid, PRESCRIBED_CAP - 1u)];
    let b = i * CURVE_VEC4S;
    var p: ParticleState;
    var c: Curve;
    var cp: CurvePoint;
    var on = lid < n && i < u.aliveCount;
    if (on) {
        p = particles[i];
        c = curveFrom(curves[b], curves[b + 1u], curves[b + 2u], curves[b + 3u]);
        // A hand taking hold of a free body prescribes it
        let taking = c.kind == CURVE_HELD && c.p[6] == 1.0;
        on = (p.flags & FLAG_ALIVE) != 0u && ((p.flags & FLAG_PRESCRIBED) != 0u || taking);
    }
    if (on) {
        let relOn = (u.toggles0 & RELATIVITY_BIT) != 0u;

        // The slot's deck: cover = A·x/a + b
        let mb = i * WL_META_STRIDE;
        let bits = wlMeta[mb + 4u];
        let A = vec2(select(1.0, -1.0, (bits & 1u) != 0u), select(1.0, -1.0, (bits & 2u) != 0u));
        let deckB = vec2(bitcast<f32>(wlMeta[mb + 5u]), bitcast<f32>(wlMeta[mb + 6u]));

        if (c.kind == CURVE_HELD) {
            if (c.p[6] == 2.0) {
                // Let go: the body is free from this substep on, at the hand's last velocity
                p.flags &= ~FLAG_PRESCRIBED;
                particles[i] = p;
                curves[b + 2u].y = 0.0;
                on = false;
            } else {
                var x = vec2(c.p[2], c.p[3]);
                var v = vec2(c.p[4], c.p[5]);
                var tau = c.p[7];
                if (c.p[6] == 1.0) {
                    // Take hold from the body's own state
                    p.flags |= FLAG_PRESCRIBED;
                    x = A * vec2(p.posX, p.posY) / u.scaleA + deckB;
                    let wv = A * vec2(p.velWX, p.velWY);
                    v = select(wv, wv / sqrt(1.0 + dot(wv, wv)), relOn);
                    v = capLength(v, HAND_SPEED);
                    tau = clocks[i].x;
                }
                // The pointer, seen from the body's image, on the cover
                let xw = u.scaleA * A * (x - deckB);
                var d = vec2(c.p[0], c.p[1]) - xw;
                if (u.boundaryMode == BOUND_LOOP) {
                    d = fullMinImageP(xw.x, xw.y, c.p[0], c.p[1], u.domainW, u.domainH, u.topologyMode);
                }
                let want = capLength(A * d / u.scaleA / HAND_REACH, HAND_SPEED);
                let acc = capLength((want - v) / HAND_RESPONSE, HAND_ACCEL);
                v += acc * u.dt;
                x += v * u.dt;
                tau += u.dt * sqrt(max(1.0 - dot(v, v), 0.0));
                curves[b + 1u].y = x.x;
                curves[b + 1u].z = x.y;
                curves[b + 1u].w = v.x;
                curves[b + 2u].x = v.y;
                curves[b + 2u].y = 0.0;
                curves[b + 2u].z = tau;
                let g = inverseSqrt(max(1.0 - dot(v, v), EPSILON));
                cp.pos = x;
                cp.w = g * v;
                cp.wdot = g * acc + g * g * g * dot(v, acc) * v;
                cp.tau = tau;
            }
        } else {
            cp = curveAt(c, u.simTime);
        }
    }
    if (on) {
        let relOn = (u.toggles0 & RELATIVITY_BIT) != 0u;
        let mb = i * WL_META_STRIDE;
        let bits = wlMeta[mb + 4u];
        let A = vec2(select(1.0, -1.0, (bits & 1u) != 0u), select(1.0, -1.0, (bits & 2u) != 0u));
        let deckB = vec2(bitcast<f32>(wlMeta[mb + 5u]), bitcast<f32>(wlMeta[mb + 6u]));
        let pos = u.scaleA * A * (cp.pos - deckB);
        let w = A * cp.w;
        let wdot = A * cp.wdot;
        let g = sqrt(1.0 + dot(w, w));
        let v = w / g;
        let acc = (wdot - v * dot(v, wdot)) / g;   // dv/dt

        // The agent's books: the curve's four-momentum minus the state the substep left
        let m = p.mass;
        let wPre = vec2(p.velWX, p.velWY);
        if (relOn) {
            books = vec4(m * (g - gammaFromW(wPre)), m * (w - wPre), 0.0);
        } else {
            books = vec4(0.5 * m * (dot(v, v) - dot(wPre, wPre)), m * (v - wPre), 0.0);
        }

        // Back on the curve; Newtonian mechanics stores the velocity itself
        let wStore = select(v, w, relOn);
        p.posX = pos.x;
        p.posY = pos.y;
        p.velWX = wStore.x;
        p.velWY = wStore.y;
        particles[i] = p;
        // The sample's acceleration: worldline.wgsl records totalForce/m × a, per unit of the
        // world-line clock, which is the curve's own
        allForces[i].totalForce = m * select(acc, wdot, relOn) / u.scaleA;

        var ck = clocks[i];
        let dTau = cp.tau - ck.x;
        ck.x = cp.tau;
        ck.y = cp.tau - CLOCK_PERIOD * floor(cp.tau / CLOCK_PERIOD);
        let thomas = select(0.0, g * g / (g + 1.0) * cross2(acc, v), relOn);
        let theta = ck.z + derived[i].angVel * dTau + thomas * u.dt;
        ck.z = theta - TWO_PI * floor((theta + PI) / TWO_PI);
        ck.w = 1.0 / g;
        clocks[i] = ck;
    }

    shAgent[lid] = books;
    workgroupBarrier();
    for (var s = PRESCRIBED_CAP / 2u; s > 0u; s >>= 1u) {
        if (lid < s) { shAgent[lid] += shAgent[lid + s]; }
        workgroupBarrier();
    }
    if (lid == 0u && n > 0u) { agentAccum[0] += shAgent[0]; }
}
