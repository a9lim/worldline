// ─── Tree-accelerated Boson Lensing ───
// BH tree walk variants of updatePhotons/updatePions (absorption: boson-absorb.wgsl).
// Uses the main particle tree (qtNodeBuffer) built each substep by tree-build.wgsl.
//
// Bindings mirror bosons.wgsl except group 1 gains binding 2 (tree nodes).
// shared-tree-nodes.wgsl prepended for node accessors (getTotalMass, getComX, etc.).

const NONE: i32 = -1;

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read_write> aliveCountAtomic: atomic<u32>;

@group(1) @binding(0) var<storage, read_write> particles: array<ParticleState>;
@group(1) @binding(1) var<storage, read_write> particleAux: array<ParticleAux>;
@group(1) @binding(2) var<storage, read_write> nodes: array<u32>;

@group(2) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(2) @binding(1) var<storage, read_write> phCount: atomic<u32>;

@group(3) @binding(0) var<storage, read_write> pions: array<Pion>;
@group(3) @binding(1) var<storage, read_write> piCount: atomic<u32>;

// ─── updatePhotonsTree ───
// BH tree walk for photon gravitational lensing (2x Newtonian, null geodesic).
@compute @workgroup_size(64)
fn updatePhotonsTree(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= atomicLoad(&phCount)) { return; }

    var ph = photons[i];
    if ((ph.flags & 1u) == 0u) { return; }

    let dt = u.dt;
    let phPosX = ph.posX;
    let phPosY = ph.posY;
    var phVX = ph.velX;
    var phVY = ph.velY;

    var stack: array<u32, 48>;
    var top: i32 = 0;
    stack[0] = 0u;
    // Lensing is part of gravity: no walk with Gravity off.
    top = select(0, 1, (u.toggles0 & GRAVITY_BIT) != 0u);
    while (top > 0) {
        top--;
        let nIdx = stack[u32(top)];
        let nodeMass = getTotalMass(nIdx);
        if (nodeMass < EPSILON) { continue; }
        let cx = getComX(nIdx);
        let cy = getComY(nIdx);
        let dx = cx - phPosX;
        let dy = cy - phPosY;
        let dSq = dx * dx + dy * dy;
        let size = getMaxX(nIdx) - getMinX(nIdx);
        let isLeaf = getNW(nIdx) == NONE;

        if (isLeaf || size * size < (u.bhTheta * u.bhTheta) * dSq) {
            let rSq = dSq + BOSON_SOFTENING_SQ;
            let invRSq = 1.0 / rSq;
            let invR3 = invRSq * sqrt(invRSq);
            phVX += 2.0 * nodeMass * dx * invR3 * dt;
            phVY += 2.0 * nodeMass * dy * invR3 * dt;
        } else if (top + 4 <= 48) {
            let nw = getNW(nIdx); let ne = getNE(nIdx);
            let sw = getSW(nIdx); let se = getSE(nIdx);
            if (nw != NONE) { stack[u32(top)] = u32(nw); top++; }
            if (ne != NONE) { stack[u32(top)] = u32(ne); top++; }
            if (sw != NONE) { stack[u32(top)] = u32(sw); top++; }
            if (se != NONE) { stack[u32(top)] = u32(se); top++; }
        }
    }

    // Renormalize to c=1
    let vSq = phVX * phVX + phVY * phVY;
    if (vSq > EPSILON) {
        let invV = 1.0 / sqrt(vSq);
        phVX *= invV;
        phVY *= invV;
    }

    // NaN guard
    if (phVX != phVX || phVY != phVY) { phVX = 1.0; phVY = 0.0; }

    ph.velX = phVX; ph.velY = phVY;
    ph.posX += phVX * dt;
    ph.posY += phVY * dt;
    ph.lifetime += dt;   // boson-ledger.wgsl culls the pool once per frame
    photons[i] = ph;
}

// ─── updatePionsTree ───
// BH tree walk for pion gravitational lensing ((1+v²) factor, massive)
// + Coulomb deflection from particles (always on when Coulomb enabled).
@compute @workgroup_size(64)
fn updatePionsTree(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= atomicLoad(&piCount)) { return; }

    var pi = pions[i];
    if ((pi.flags & 1u) == 0u) { return; }

    let dt = u.dt;
    let piPosX = pi.posX;
    let piPosY = pi.posY;
    var piWX = pi.wX;
    var piWY = pi.wY;
    let wSq = piWX * piWX + piWY * piWY;
    let gamma = sqrt(1.0 + wSq);
    let vSq = wSq / max(gamma * gamma, EPSILON);
    let grFactor = select(0.0, 1.0 + vSq, (u.toggles0 & GRAVITY_BIT) != 0u);
    let coulombOn = (u.toggles0 & COULOMB_BIT) != 0u;
    let piCharge = pi.charge;
    let coulombScale = select(0.0, -piCharge * dt, coulombOn && abs(piCharge) > EPSILON);

    var stack: array<u32, 48>;
    var top: i32 = 0;
    stack[0] = 0u;
    top = 1;
    while (top > 0) {
        top--;
        let nIdx = stack[u32(top)];
        let nodeMass = getTotalMass(nIdx);
        let nodeCharge = getTotalCharge(nIdx);
        let skip = nodeMass < EPSILON && (nodeCharge == 0.0 || coulombScale == 0.0);
        if (skip) { continue; }
        let cx = getComX(nIdx);
        let cy = getComY(nIdx);
        let dx = cx - piPosX;
        let dy = cy - piPosY;
        let dSq = dx * dx + dy * dy;
        let size = getMaxX(nIdx) - getMinX(nIdx);
        let isLeaf = getNW(nIdx) == NONE;

        if (isLeaf || size * size < (u.bhTheta * u.bhTheta) * dSq) {
            let rSq = dSq + BOSON_SOFTENING_SQ;
            let invRSq = 1.0 / rSq;
            let invR3 = invRSq * sqrt(invRSq);
            piWX += grFactor * nodeMass * dx * invR3 * dt;
            piWY += grFactor * nodeMass * dy * invR3 * dt;
            // Coulomb from particle tree aggregate charge
            if (coulombScale != 0.0 && nodeCharge != 0.0) {
                let fC = coulombScale * nodeCharge * invR3;
                piWX += fC * dx;
                piWY += fC * dy;
            }
        } else if (top + 4 <= 48) {
            let nw = getNW(nIdx); let ne = getNE(nIdx);
            let sw = getSW(nIdx); let se = getSE(nIdx);
            if (nw != NONE) { stack[u32(top)] = u32(nw); top++; }
            if (ne != NONE) { stack[u32(top)] = u32(ne); top++; }
            if (sw != NONE) { stack[u32(top)] = u32(sw); top++; }
            if (se != NONE) { stack[u32(top)] = u32(se); top++; }
        }
    }

    // NaN guard
    if (piWX != piWX || piWY != piWY) { piWX = 0.0; piWY = 0.0; }

    // Sync vel from w
    let gamma2 = sqrt(1.0 + piWX * piWX + piWY * piWY);
    let invGamma2 = 1.0 / gamma2;
    let velX = piWX * invGamma2;
    let velY = piWY * invGamma2;

    pi.wX = piWX; pi.wY = piWY;
    pi.posX += velX * dt;
    pi.posY += velY * dt;
    pi.age += 1u;

    // A lepton's age lives in its energy field; boson-ledger.wgsl culls the pool
    if (pi.kind == 1u) { pi.energy += dt; }

    pions[i] = pi;
}
