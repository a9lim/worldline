// ─── Extremal Charge Shedding ───
// One thread per particle, black-hole mode only. A Kerr–Newman hole whose charge passes
// √(M² − a²) would be a naked singularity, so it sheds same-sign leptons, a quantum of
// charge each, until it is back under the limit.

// Constants provided by generated wgslConstants block.

// Struct definitions (SimUniforms, ParticleState, ParticleAux, ParticleDerived, Pion)
// provided by shared-structs.wgsl.

@group(0) @binding(0) var<uniform> u: SimUniforms;

@group(1) @binding(0) var<storage, read_write> particles: array<ParticleState>;
@group(1) @binding(1) var<storage, read_write> particleAux: array<ParticleAux>;
@group(1) @binding(2) var<storage, read_write> derived: array<ParticleDerived>;

@group(2) @binding(0) var<storage, read_write> pions: array<Pion>;
@group(2) @binding(1) var<storage, read_write> piCount: atomic<u32>;

@compute @workgroup_size(256)
fn shedExtremalCharge(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pid = gid.x;
    if (pid >= u.aliveCount) { return; }
    if ((u.toggles0 & BLACK_HOLE_BIT) == 0u) { return; }

    let p = particles[pid];
    if ((p.flags & FLAG_ALIVE) == 0u) { return; }

    let m = p.mass;
    if (m <= MIN_MASS) { return; }
    let d = derived[pid];
    let bodyRSq = max(d.bodyRSq, EPSILON);

    let q0 = p.charge;
    let absQ = abs(q0);
    if (absQ < BOSON_CHARGE - EPSILON) { return; }

    let a = abs(d.angMomentum) / m;   // a = J/M
    let qLimit = sqrt(max(m * m - a * a, 0.0));
    let targetAbs = floor((qLimit + EPSILON) / BOSON_CHARGE) * BOSON_CHARGE;
    if (absQ <= targetAbs + EPSILON) { return; }

    let sign = select(-1.0, 1.0, q0 > 0.0);
    var emitted: u32 = 0u;
    var seed = (pid * 2654435761u) ^ u.aliveCount;
    let offset = max(particleAux[pid].radius * SPAWN_OFFSET_MUL, SPAWN_OFFSET_FLOOR);
    // Leptons leave isotropically in the hole's rest frame at the
    // fixed toy speed 1/√3, boosted to the lab; pShed sums their lab
    // momentum for the recoil.
    let wHole = vec2<f32>(p.velWX, p.velWY);
    let restSpeed = 0.57735;
    let restGamma = 1.0 / sqrt(1.0 - restSpeed * restSpeed);
    var pShed = vec2<f32>(0.0);
    var qLeft = absQ;
    var mLeft = m;
    for (var ci = 0u; ci < 64u; ci++) {
        // Stop at the first whole-quantum charge the lightened hole can hold
        let rSqLeft = pow(mLeft, 2.0 / 3.0);
        let aLeft = INERTIA_K * rSqLeft * abs(p.angW / sqrt(1.0 + p.angW * p.angW * rSqLeft));
        let limLeft = floor((sqrt(max(mLeft * mLeft - aLeft * aLeft, 0.0)) + EPSILON) / BOSON_CHARGE) * BOSON_CHARGE;
        if (qLeft <= limLeft + EPSILON) { break; }
        let li = atomicAdd(&piCount, 1u);
        if (li >= PION_POOL_CAP) {
            atomicSub(&piCount, 1u);
            break;
        }
        seed = seed * 747796405u + 2891336453u;
        let angle = f32(seed) / 4294967296.0 * TWO_PI;
        let dir = vec2<f32>(cos(angle), sin(angle));
        let lab = boostToLab(ELECTRON_MASS * restGamma,
                             ELECTRON_MASS * restGamma * restSpeed * dir, wHole);
        pShed += lab.yz;
        let labDir = lab.yz / max(length(lab.yz), EPSILON);
        var lep: Pion;
        lep.posX = p.posX + labDir.x * offset;
        lep.posY = p.posY + labDir.y * offset;
        lep.wX = lab.y / ELECTRON_MASS;
        lep.wY = lab.z / ELECTRON_MASS;
        lep.mass = ELECTRON_MASS;
        lep.charge = sign * BOSON_CHARGE;
        lep.energy = 0.0;
        lep.emitterId = particleAux[pid].particleId;
        lep.age = 0u;
        lep.flags = 1u;
        lep.kind = 1u;
        lep._pad1 = 0u;
        pions[li] = lep;
        emitted++;
        qLeft -= BOSON_CHARGE;
        mLeft = max(mLeft - ELECTRON_MASS, MIN_MASS);
    }

    let emittedF = f32(emitted);
    let massLoss = min(ELECTRON_MASS * emittedF, max(m - MIN_MASS, 0.0));
    let newMass = m - massLoss;
    var newCharge = q0 - sign * BOSON_CHARGE * emittedF;

    particles[pid].mass = newMass;
    if (m > EPSILON) {
        particles[pid].baseMass *= newMass / m;
    }
    if (emitted > 0u && newMass > EPSILON) {
        let wNew = (wHole * m - pShed) / newMass;
        particles[pid].velWX = wNew.x;
        particles[pid].velWY = wNew.y;
    }

    let newBodyRSq = pow(max(newMass, EPSILON), 2.0 / 3.0);
    let newAngVel = p.angW / sqrt(1.0 + p.angW * p.angW * newBodyRSq);
    let newA = INERTIA_K * newBodyRSq * abs(newAngVel);
    let finalTargetAbs = floor((sqrt(max(newMass * newMass - newA * newA, 0.0)) + EPSILON) / BOSON_CHARGE) * BOSON_CHARGE;
    if (abs(newCharge) > finalTargetAbs + EPSILON) {
        newCharge = sign * finalTargetAbs;
    }
    particles[pid].charge = newCharge;
    let newDisc = newMass * newMass - newA * newA - newCharge * newCharge;
    let newRadius = select(newMass, newMass + sqrt(max(0.0, newDisc)), newDisc >= 0.0);
    var nd = d;
    nd.invMass = select(0.0, 1.0 / newMass, newMass > EPSILON);
    nd.radiusSq = newRadius * newRadius;
    nd.bodyRSq = newBodyRSq;
    nd.angVel = newAngVel;
    derived[pid] = nd;
    particleAux[pid].radius = newRadius;
}
