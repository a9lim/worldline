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
// One workgroup over the list of prescribed slots (count first; PRESCRIBED_CAP at most).

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read_write> allForces: array<AllForces>;
@group(0) @binding(3) var<storage, read_write> clocks: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> derived: array<ParticleDerived>;
@group(0) @binding(5) var<storage, read> wlMeta: array<u32>;
@group(0) @binding(6) var<storage, read> curves: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read> prescribedList: array<u32>;
@group(0) @binding(8) var<storage, read_write> agentAccum: array<vec4<f32>>;   // E, Px, Py, 0

var<workgroup> shAgent: array<vec4<f32>, PRESCRIBED_CAP>;

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.y - a.y * b.x;
}

@compute @workgroup_size(PRESCRIBED_CAP)
fn applyPrescribed(@builtin(local_invocation_index) lid: u32) {
    var books = vec4(0.0);
    let n = min(prescribedList[0], PRESCRIBED_CAP);
    let i = prescribedList[1u + min(lid, PRESCRIBED_CAP - 1u)];
    var p: ParticleState;
    var on = lid < n && i < u.aliveCount;
    if (on) {
        p = particles[i];
        on = (p.flags & (FLAG_ALIVE | FLAG_PRESCRIBED)) == (FLAG_ALIVE | FLAG_PRESCRIBED);
    }
    if (on) {
        let relOn = (u.toggles0 & RELATIVITY_BIT) != 0u;
        let b = i * CURVE_VEC4S;
        let cp = curveAt(curveFrom(curves[b], curves[b + 1u], curves[b + 2u], curves[b + 3u]), u.simTime);

        // From the cover to the slot's wrapped position, physical (cover = A·x/a + b)
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
