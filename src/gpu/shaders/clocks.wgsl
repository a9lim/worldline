// ─── Proper-Time Clocks ───
// After the drift; OBSERVERS_PER_GROUP bodies per workgroup, each with 256 / OBSERVERS_PER_GROUP
// threads that split the potential's O(N) sum over the sources (one thread per body left most
// of the GPU idle). Advances, per particle (clocks[i]):
//   x  τ, proper time
//   y  the clock ring's phase, τ mod CLOCK_PERIOD (kept separately so f32 stays exact)
//   z  θ, the spoke's orientation in the body's rest frame, in [−π, π)
//   w  dτ/dt, the lapse
//
// dτ/dt = √max(0, 1 + 2Φ_N − v²) with Φ_N the Newtonian potential of the other bodies
// (softened by ε; never Paczyński–Wiita, which vanishes at 4M). It is exact for a free
// particle, for a static clock near one Schwarzschild mass, and on a circular
// Schwarzschild orbit (whose coordinate Ω² = M/r³ is exactly Keplerian).
//
// θ turns with the body (ω_rest per unit τ; Ω_H for a black hole) and precesses per unit
// lab time, with Relativity on, by
//   Thomas      (γ²/(γ+1))·(a × v), a from non-gravitational forces only
//   geodetic    (3/2)·∇Φ × v       (gravity; already holds the Thomas-like half)
//   Lense–Thirring  Σ −J_j/r³      (gravitomagnetic, equatorial)
// Feeding gravity into the Thomas term would give free fall a precession it does not
// have, and a geodetic orbit would come out at 1 instead of 3/2.

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read> derived: array<ParticleDerived>;
@group(0) @binding(3) var<storage, read> allForces: array<AllForces>;
@group(0) @binding(4) var<storage, read_write> clocks: array<vec4<f32>>;

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.y - a.y * b.x;
}

const CLOCK_LANES: u32 = 256u / OBSERVERS_PER_GROUP;
var<workgroup> shPhi: array<f32, 256>;
var<workgroup> shLT: array<f32, 256>;

@compute @workgroup_size(256)
fn advanceClocks(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
    let lane = lid.x % CLOCK_LANES;
    let i = wg.x * OBSERVERS_PER_GROUP + lid.x / CLOCK_LANES;
    var p: ParticleState;
    var ok = i < u.aliveCount;
    if (ok) {
        p = particles[i];
        // A prescribed body's clock is its curve's (prescribed.wgsl)
        ok = (p.flags & (FLAG_ALIVE | FLAG_PRESCRIBED)) == FLAG_ALIVE;
    }
    let relOn = (u.toggles0 & RELATIVITY_BIT) != 0u;
    let gravOn = (u.toggles0 & GRAVITY_BIT) != 0u;
    let bhOn = (u.toggles0 & BLACK_HOLE_BIT) != 0u;

    // Φ_N and the Lense–Thirring sum, each lane taking every CLOCK_LANES-th source
    var phi = 0.0;
    var lenseThirring = 0.0;
    if (ok && relOn && gravOn) {
        let gmOn = (u.toggles0 & GRAVITOMAG_BIT) != 0u;
        let soft2 = select(SOFTENING_SQ, BH_SOFTENING_SQ, bhOn);
        let periodic = u.boundaryMode == BOUND_LOOP;
        for (var j = lane; j < u.aliveCount; j += CLOCK_LANES) {
            if (j == i) { continue; }
            let pj = particles[j];
            if ((pj.flags & FLAG_ALIVE) == 0u) { continue; }
            var dr = vec2<f32>(pj.posX - p.posX, pj.posY - p.posY);
            if (periodic) {
                dr = fullMinImageP(p.posX, p.posY, pj.posX, pj.posY, u.domainW, u.domainH, u.topologyMode);
            }
            let invR = inverseSqrt(dot(dr, dr) + soft2);
            phi -= pj.mass * invR;
            if (gmOn) { lenseThirring -= derived[j].angMomentum * invR * invR * invR; }
        }
    }
    shPhi[lid.x] = phi;
    shLT[lid.x] = lenseThirring;
    workgroupBarrier();
    for (var s = CLOCK_LANES / 2u; s > 0u; s >>= 1u) {
        if (lane < s) {
            shPhi[lid.x] += shPhi[lid.x + s];
            shLT[lid.x] += shLT[lid.x + s];
        }
        workgroupBarrier();
    }
    if (!ok || lane != 0u) { return; }
    phi = shPhi[lid.x];
    lenseThirring = shLT[lid.x];

    let dt = u.dt;
    let d = derived[i];
    let v = vec2<f32>(d.velX, d.velY);

    var lapse = 1.0;
    var precession = 0.0;
    if (relOn) {
        lapse = sqrt(max(0.0, 1.0 + 2.0 * phi - dot(v, v)));

        let m = max(p.mass, EPSILON);
        let w = vec2<f32>(p.velWX, p.velWY);
        let gamma = gammaFromW(w);
        let af = allForces[i];
        let extG = vec2<f32>(u.extGx, u.extGy);

        // Thomas: lab acceleration from everything but gravity (Newtonian, gravitomagnetic
        // dipole, 1PN, external gravity), plus the magnetic Lorentz force the Boris rotation applies.
        // After the drift f1.zw also holds Boris's display gravitomagnetic Lorentz force, which
        // totalForce lacks, so subtracting f1.zw takes it out once too often; add it back.
        var fNG = af.totalForce - af.f0.xy - af.f1.zw - af.f2.xy - m * extG;
        if ((u.toggles0 & MAGNETIC_BIT) != 0u || u.extBz != 0.0) {
            fNG += p.charge * af.bFields.x * vec2<f32>(v.y, -v.x);
        }
        if ((u.toggles0 & GRAVITOMAG_BIT) != 0u) {
            fNG += 4.0 * m * af.bFields.y * vec2<f32>(v.y, -v.x);
        }
        let aNG = (fNG - v * dot(v, fNG)) / (gamma * m);
        precession += gamma * gamma / (gamma + 1.0) * cross2(aNG, v);

        if (gravOn) {
            let g = af.f0.xy / m + extG;     // ∇Φ = −g
            precession -= 1.5 * cross2(g, v);
            precession += lenseThirring;
        }
    }

    // The body's own rotation rate: ω in its rest frame, or the horizon's Ω_H
    var omega = d.angVel;
    if (bhOn) {
        let M = p.mass;
        let a = abs(d.angMomentum) / max(M, EPSILON);   // a = J/M
        let disc = M * M - a * a - p.charge * p.charge;
        let rPlus = select(M, M + sqrt(max(0.0, disc)), disc >= 0.0);
        omega = sign(p.angW) * a / max(rPlus * rPlus + a * a, EPSILON);
    }

    let dTau = lapse * dt;
    var c = clocks[i];
    c.x += dTau;
    c.y += dTau;
    c.y -= CLOCK_PERIOD * floor(c.y / CLOCK_PERIOD);
    let theta = c.z + omega * dTau + precession * dt;
    c.z = theta - TWO_PI * floor((theta + PI) / TWO_PI);
    c.w = lapse;
    clocks[i] = c;
}
