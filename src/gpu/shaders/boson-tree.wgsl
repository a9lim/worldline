// ─── Boson Gravity Tree ───
// Walks of the bosons' quadtree, which tree-build.wgsl builds over tree-items-bosons.wgsl
// (mass, charge and centre of mass per node; the node layout is the bodies' tree's):
// particle<-boson gravity, boson<->boson mutual gravity, pion Coulomb, and annihilation.
//
// Standalone shader — defines own structs (NOT prepended with common.wgsl).

// Constants provided by generated wgslConstants block.

// Struct definitions (ParticleState, AllForces, Photon, Pion, SimUniforms) provided by shared-structs.wgsl.

// Boson tree node: same 20-word layout as particle tree but only mass+CoM used
const NODE_WORDS: u32 = 20u;
const NONE: i32 = -1;
const ANNIHILATE_CANDIDATES: u32 = 16u;

// Node field offsets
const N_MIN_X: u32 = 0u;
const N_MIN_Y: u32 = 1u;
const N_MAX_X: u32 = 2u;
const N_MAX_Y: u32 = 3u;
const N_COM_X: u32 = 4u;
const N_COM_Y: u32 = 5u;
const N_TOTAL_MASS: u32 = 6u;
const N_TOTAL_CHARGE: u32 = 7u;
const N_NW: u32 = 12u;
const N_NE: u32 = 13u;
const N_SW: u32 = 14u;
const N_SE: u32 = 15u;
const N_PARTICLE_IDX: u32 = 16u;
const N_PARTICLE_COUNT: u32 = 17u;   // bosons under the node
const N_PARENT: u32 = 18u;

// Group 0: uniforms + boson tree nodes (atomic) + counter + visitor flags
@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read_write> bosonTree: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> bosonNodeCounter: atomic<u32>;
@group(0) @binding(3) var<storage, read_write> bosonVisitorFlags: array<atomic<u32>>;

// Group 1: photon pool (packed)
@group(1) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(1) @binding(1) var<storage, read_write> phCount: atomic<u32>;

// Group 2: pion pool (packed) + annihilation claim buffer
@group(2) @binding(0) var<storage, read_write> pions: array<Pion>;
@group(2) @binding(1) var<storage, read_write> piCount: atomic<u32>;
@group(2) @binding(2) var<storage, read_write> pionClaims: array<atomic<u32>>;

// Group 3: particle state + force accumulators (read_write for encoder compat)
@group(3) @binding(0) var<storage, read_write> particles: array<ParticleState>;
@group(3) @binding(1) var<storage, read_write> allForces: array<AllForces>;

// ── Atomic node accessors ──

fn nodeF32(nodeIdx: u32, field: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&bosonTree[nodeIdx * NODE_WORDS + field]));
}

fn nodeU32(nodeIdx: u32, field: u32) -> u32 {
    return atomicLoad(&bosonTree[nodeIdx * NODE_WORDS + field]);
}

fn setNodeF32(nodeIdx: u32, field: u32, val: f32) {
    atomicStore(&bosonTree[nodeIdx * NODE_WORDS + field], bitcast<u32>(val));
}

fn setNodeU32(nodeIdx: u32, field: u32, val: u32) {
    atomicStore(&bosonTree[nodeIdx * NODE_WORDS + field], val);
}

// Shared BH gravity force: F = massFactor * nodeMass / (r^2 + softening)^{3/2} * r_hat
fn bhGravForce(dx: f32, dy: f32, nodeMass: f32, massFactor: f32) -> vec2f {
    let rSq = dx * dx + dy * dy + BOSON_SOFTENING_SQ;
    let invRSq = 1.0 / rSq;
    let f = massFactor * nodeMass * sqrt(invRSq) * invRSq;
    return vec2f(dx * f, dy * f);
}

// Shared BH Coulomb force: F = -q_self * Q_node / (r^2 + softening)^{3/2} * r_hat
fn bhCoulombForce(dx: f32, dy: f32, nodeCharge: f32, scale: f32) -> vec2f {
    let rSq = dx * dx + dy * dy + BOSON_SOFTENING_SQ;
    let invRSq = 1.0 / rSq;
    let f = scale * nodeCharge * sqrt(invRSq) * invRSq;
    return vec2f(dx * f, dy * f);
}

// Gravitational force from bosons onto particles via BH tree walk.
@compute @workgroup_size(64)
fn computeBosonGravity(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= u.aliveCount) { return; }
    if ((particles[i].flags & FLAG_ALIVE) == 0u) { return; }

    let px = particles[i].posX; let py = particles[i].posY;
    let pMass = particles[i].mass;

    var force = vec2f(0.0);

    // Stack-based BH tree walk (boson tree)
    var stack: array<u32, 48>;
    var top: i32 = 0;
    stack[0] = 0u; // root
    top = 1;

    while (top > 0) {
        top--;
        let nIdx = stack[top];
        let nodeMass = nodeF32(nIdx, N_TOTAL_MASS);
        if (nodeMass < EPSILON) { continue; }

        let cx = nodeF32(nIdx, N_COM_X);
        let cy = nodeF32(nIdx, N_COM_Y);
        let dx = cx - px;
        let dy = cy - py;
        let dSq = dx * dx + dy * dy;
        let size = nodeF32(nIdx, N_MAX_X) - nodeF32(nIdx, N_MIN_X);
        let isDivided = bitcast<i32>(nodeU32(nIdx, N_NW)) != NONE;

        if (!isDivided || size * size < BOSON_THETA_SQ * dSq) {
            force += bhGravForce(dx, dy, nodeMass, pMass);
        } else if (top + 4 <= 48) {
            // Two to four children fill the first slots (tree-build.wgsl)
            for (var c = 0u; c < 4u; c++) {
                let ch = nodeU32(nIdx, N_NW + c);
                if (bitcast<i32>(ch) != NONE) { stack[top] = ch; top++; }
            }
        }
    }

    // Add to gravity force accumulators (allForces.f0.xy = gravity)
    var af = allForces[i];
    af.f0.x += force.x;
    af.f0.y += force.y;
    allForces[i] = af;
}

// Mutual gravitational interaction between bosons via BH tree walk.
// GR receiver factors: 2 for photons (null geodesic), 1+v^2 for pions (massive).
@compute @workgroup_size(64)
fn applyBosonBosonGravity(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let phN = atomicLoad(&phCount);
    let piN = atomicLoad(&piCount);
    let total = phN + piN;
    if (i >= total) { return; }

    let dt = u.dt;
    var bx: f32; var by: f32; var grFactor: f32;

    if (i < phN) {
        if ((photons[i].flags & 1u) == 0u) { return; }
        bx = photons[i].posX; by = photons[i].posY;
        grFactor = 2.0; // photon: null geodesic
    } else {
        let pi = i - phN;
        if ((pions[pi].flags & 1u) == 0u) { return; }
        bx = pions[pi].posX; by = pions[pi].posY;
        let wx = pions[pi].wX; let wy = pions[pi].wY;
        let wSq = wx * wx + wy * wy;
        let vSq = wSq / (1.0 + wSq);
        grFactor = 1.0 + vSq; // massive: 1+v^2
    }

    // BH tree walk of boson tree
    let massFactor = grFactor * dt;
    var kick = vec2f(0.0);

    var stack: array<u32, 48>;
    var top: i32 = 0;
    stack[0] = 0u;
    top = 1;

    while (top > 0) {
        top--;
        let nIdx = stack[top];
        let nodeMass = nodeF32(nIdx, N_TOTAL_MASS);
        if (nodeMass < EPSILON) { continue; }

        let cx = nodeF32(nIdx, N_COM_X);
        let cy = nodeF32(nIdx, N_COM_Y);
        let dx = cx - bx;
        let dy = cy - by;
        let dSq = dx * dx + dy * dy;
        let size = nodeF32(nIdx, N_MAX_X) - nodeF32(nIdx, N_MIN_X);
        let isDivided = bitcast<i32>(nodeU32(nIdx, N_NW)) != NONE;

        if (!isDivided || size * size < BOSON_THETA_SQ * dSq) {
            kick += bhGravForce(dx, dy, nodeMass, massFactor);
        } else if (top + 4 <= 48) {
            // Two to four children fill the first slots (tree-build.wgsl)
            for (var c = 0u; c < 4u; c++) {
                let ch = nodeU32(nIdx, N_NW + c);
                if (bitcast<i32>(ch) != NONE) { stack[top] = ch; top++; }
            }
        }
    }

    // Apply impulse
    if (i < phN) {
        var pvx = photons[i].velX + kick.x;
        var pvy = photons[i].velY + kick.y;
        // Renormalize photon to c=1
        let vSq = pvx * pvx + pvy * pvy;
        if (vSq > EPSILON) {
            let invV = inverseSqrt(vSq);
            pvx *= invV;
            pvy *= invV;
        }
        // NaN guard
        if (pvx != pvx || pvy != pvy) { pvx = 1.0; pvy = 0.0; }
        photons[i].velX = pvx;
        photons[i].velY = pvy;
    } else {
        let pi2 = i - phN;
        pions[pi2].wX += kick.x;
        pions[pi2].wY += kick.y;
    }
}

// Mutual Coulomb interaction between charged pions via BH tree walk.
// F = -q_i * q_j / r² (like-charges repel). Only pions participate.
@compute @workgroup_size(64)
fn applyPionPionCoulomb(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let piN = atomicLoad(&piCount);
    if (i >= piN) { return; }

    let piState = pions[i];
    if ((piState.flags & 1u) == 0u) { return; }
    if (abs(piState.charge) < EPSILON) { return; }

    let dt = u.dt;
    let bx = piState.posX;
    let by = piState.posY;
    let scale = -piState.charge * dt;

    // BH tree walk of boson tree using charge aggregates
    var kick = vec2f(0.0);
    var stack: array<u32, 48>;
    var top: i32 = 0;
    stack[0] = 0u;
    top = 1;

    while (top > 0) {
        top--;
        let nIdx = stack[top];
        let nodeCharge = nodeF32(nIdx, N_TOTAL_CHARGE);
        if (nodeCharge == 0.0) { continue; }

        let cx = nodeF32(nIdx, N_COM_X);
        let cy = nodeF32(nIdx, N_COM_Y);
        let dx = cx - bx;
        let dy = cy - by;
        let dSq = dx * dx + dy * dy;
        let size = nodeF32(nIdx, N_MAX_X) - nodeF32(nIdx, N_MIN_X);
        let isDivided = bitcast<i32>(nodeU32(nIdx, N_NW)) != NONE;

        if (!isDivided || size * size < BOSON_THETA_SQ * dSq) {
            kick += bhCoulombForce(dx, dy, nodeCharge, scale);
        } else if (top + 4 <= 48) {
            // Two to four children fill the first slots (tree-build.wgsl)
            for (var c = 0u; c < 4u; c++) {
                let ch = nodeU32(nIdx, N_NW + c);
                if (bitcast<i32>(ch) != NONE) { stack[top] = ch; top++; }
            }
        }
    }

    pions[i].wX += kick.x;
    pions[i].wY += kick.y;
}

// π⁺π⁻ annihilation: opposite-charge pions within softening distance → 2 photons.
// Pairwise scan over pion pool (pions + leptons, PION_POOL_CAP entries).
/** A pion or lepton that can annihilate: alive, charged, past the minimum age. */
fn annihilable(p: Pion) -> bool {
    return (p.flags & 1u) != 0u && abs(p.charge) >= EPSILON && p.age >= BOSON_MIN_AGE;
}

/**
 * Pion i's partner: the lowest-index pion above it of the same kind (pion + pion or lepton
 * + lepton) and opposite charge within reach, found through the bosons' tree, or NO_PARTNER.
 * The pool scan this replaces took the same one.
 */
const NO_PARTNER: u32 = 0xFFFFFFFFu;
fn annihilationPartner(i: u32, pi1: Pion, piN: u32) -> u32 {
    let reach = sqrt(BOSON_SOFTENING_SQ);
    var best = NO_PARTNER;
    var stack: array<u32, 48>;
    stack[0] = 0u;
    var top: i32 = 1;
    while (top > 0) {
        top--;
        let nIdx = stack[u32(top)];
        if (pi1.posX + reach < nodeF32(nIdx, N_MIN_X) || pi1.posX - reach > nodeF32(nIdx, N_MAX_X) ||
            pi1.posY + reach < nodeF32(nIdx, N_MIN_Y) || pi1.posY - reach > nodeF32(nIdx, N_MAX_Y)) { continue; }
        if (bitcast<i32>(nodeU32(nIdx, N_NW)) == NONE) {
            let id = nodeU32(nIdx, N_PARTICLE_IDX);
            if (bitcast<i32>(id) < 0 || (id & BOSON_PION_TAG) == 0u) { continue; }
            let j = id & ~BOSON_PION_TAG;
            if (j <= i || j >= piN || j >= best) { continue; }
            let pi2 = pions[j];
            if (!annihilable(pi2) || pi2.kind != pi1.kind || pi2.charge * pi1.charge > 0.0) { continue; }
            let dx = pi1.posX - pi2.posX;
            let dy = pi1.posY - pi2.posY;
            if (dx * dx + dy * dy >= BOSON_SOFTENING_SQ) { continue; }
            best = j;
        } else if (top + 4 <= 48) {
            for (var c = 0u; c < 4u; c++) {
                let ch = nodeU32(nIdx, N_NW + c);
                if (bitcast<i32>(ch) != NONE) { stack[u32(top)] = ch; top++; }
            }
        }
    }
    return best;
}

// Annihilation pairs pions in two passes, deterministically. proposePions: each pion proposes
// to its partner, and a pion keeps its lowest proposer (pionClaims[j] holds PION_POOL_CAP − i,
// so atomicMax keeps the lowest i; 0 is none), and records its partner as j + 1 at
// pionClaims[PION_POOL_CAP + i]. annihilatePions: a pion that nobody proposed to annihilates
// with its partner if its own proposal was the one kept, so no pion is in two pairs and only
// the pair's proposer touches either pion; a chain's leftovers pair on a later frame. (Each
// pion used to claim itself first, so a partner's claim on it failed: threads in lockstep left
// nearly every pair unmatched.)

@compute @workgroup_size(64)
fn proposePions(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let piN = atomicLoad(&piCount);
    if (i >= piN) { return; }
    let pi1 = pions[i];
    if (!annihilable(pi1)) { return; }
    let j = annihilationPartner(i, pi1, piN);
    if (j != NO_PARTNER) {
        atomicMax(&pionClaims[j], PION_POOL_CAP - i);
        atomicStore(&pionClaims[PION_POOL_CAP + i], j + 1u);
    }
}

@compute @workgroup_size(64)
fn annihilatePions(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    let piN = atomicLoad(&piCount);
    if (i >= piN) { return; }

    // Proposed to: the proposer annihilates this pion, or it waits (before reading it, which
    // the proposer may be clearing)
    if (atomicLoad(&pionClaims[i]) != 0u) { return; }
    let partner = atomicLoad(&pionClaims[PION_POOL_CAP + i]);
    if (partner == 0u) { return; }
    let j = partner - 1u;
    if (atomicLoad(&pionClaims[j]) != PION_POOL_CAP - i) { return; }
    let pi1 = pions[i];

    let p1x = pi1.posX;
    let p1y = pi1.posY;
    {
        let pi2 = pions[j];

        // Both claims succeeded — safe to annihilate
        pions[i].flags &= ~1u;
        pions[j].flags &= ~1u;

        // Compute COM kinematics for 2 photons
        let w1x = pi1.wX; let w1y = pi1.wY;
        let w2x = pi2.wX; let w2y = pi2.wY;
        let g1 = sqrt(1.0 + w1x * w1x + w1y * w1y);
        let g2 = sqrt(1.0 + w2x * w2x + w2y * w2y);
        let E = pi1.mass * g1 + pi2.mass * g2;
        let px = w1x * pi1.mass + w2x * pi2.mass;
        let py2 = w1y * pi1.mass + w2y * pi2.mass;
        if (E < EPSILON) { return; }

        let vComX = px / E;
        let vComY = py2 / E;
        let vComSq = vComX * vComX + vComY * vComY;
        let gammaCom = select(1.0 / sqrt(max(1.0 - min(vComSq, MAX_SPEED_RATIO * MAX_SPEED_RATIO), EPSILON)), 1.0, vComSq < 1e-12);

        let sCom = E * E - px * px - py2 * py2;
        let mInv = select(E, sqrt(sCom), sCom > 0.0);
        let ePhRest = mInv * 0.5;

        // Random rest-frame angle from hash
        let rng = pcgRand((i * 73856093u) ^ (pi1.age * 19349663u));
        let angle = rng * TWO_PI;
        let cosA = cos(angle);
        let sinA = sin(angle);

        let midX = (p1x + pi2.posX) * 0.5;
        let midY = (p1y + pi2.posY) * 0.5;
        let emitOffset = max(pi1.mass * 1.5, 1.0);

        for (var s = 0; s < 2; s++) {
            let sign = select(-1.0, 1.0, s == 0);
            var phPx = sign * ePhRest * cosA;
            var phPy = sign * ePhRest * sinA;

            // Lorentz boost from COM to lab
            if (vComSq > 1e-12) {
                let vCom = sqrt(vComSq);
                let nx = vComX / vCom;
                let ny = vComY / vCom;
                let pPar = phPx * nx + phPy * ny;
                let pPerpX = phPx - pPar * nx;
                let pPerpY = phPy - pPar * ny;
                let pParB = gammaCom * (pPar + vCom * ePhRest);
                phPx = pParB * nx + pPerpX;
                phPy = pParB * ny + pPerpY;
            }

            let pMag = sqrt(phPx * phPx + phPy * phPy);
            if (pMag < EPSILON) { continue; }
            let dirX = phPx / pMag;
            let dirY = phPy / pMag;

            let phIdx = atomicAdd(&phCount, 1u);
            if (phIdx < MAX_PHOTONS) {
                var ph: Photon;
                ph.posX = midX + dirX * emitOffset;
                ph.posY = midY + dirY * emitOffset;
                ph.velX = dirX;
                ph.velY = dirY;
                ph.energy = pMag;
                ph.emitterId = 0xFFFFFFFFu; // no emitter
                ph.lifetime = 0.0;
                ph.flags = 1u;
                photons[phIdx] = ph;
            } else {
                atomicSub(&phCount, 1u);
            }
        }
    }
}
