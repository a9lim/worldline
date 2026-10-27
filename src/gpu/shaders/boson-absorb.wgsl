// ─── Boson absorption ───
// Photons and pions that overlap a body hand it their four-momentum (and a pion its charge).
// Two stages, so no float is written by two threads:
//
//   claimPhotons, claimPions (…Tree)  one thread per boson, read-only on the bodies: find
//       the absorber, the nearest body whose radius the boson is inside (ties to the lower
//       slot), not its emitter, and able to take it. A claimed boson dies here, its claim
//       (slot + 1, or 0) goes into its claims entry, and its absorber's count rises by one.
//   applyAbsorption   one workgroup per body slot: a slot with claims sums the four-momenta
//       and charge of the bosons that chose it, in a fixed reduction order, and takes them
//       at once. Absorption adds four-momenta, so taking the sum is taking them one by one.
//
// A claim is checked against the body alone: the body plus that one boson must leave a
// mass above MIN_MASS. Bodies and bosons are future-directed, so adding more of them only
// raises the invariant mass, and a sum of valid claims is valid too.
//
// On a periodic boundary bosons never wrap (they drift past the domain until the pool culls
// them), so each is folded into the fundamental domain and measured to every body by minimum
// image. The tree walk reaches across a seam through the ghost copies and resolves each to
// its original, which takes the four-momentum (a ghost's slot is rewritten every substep).
//
// Claims buffer (u32): [0, MAX_PARTICLES) per-body claim counts, cleared by applyAbsorption;
// then one entry per photon, then one per pion-pool entry, rewritten by every claim pass.
//
// Standalone shader; shared-tree-nodes.wgsl is prepended for the node accessors.

const NONE: i32 = -1;
const PH_CLAIM_BASE: u32 = MAX_PARTICLES;
const PI_CLAIM_BASE: u32 = MAX_PARTICLES + MAX_PHOTONS;
// How far a body may have moved since the tree was built (at most c·dt), and rounding
const ABSORB_SLOP: f32 = 2.0;
const ABSORB_WG: u32 = 64u;

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read_write> claims: array<atomic<u32>>;

@group(1) @binding(0) var<storage, read_write> particles: array<ParticleState>;
@group(1) @binding(1) var<storage, read_write> particleAux: array<ParticleAux>;
@group(1) @binding(2) var<storage, read_write> nodes: array<u32>;
@group(1) @binding(3) var<storage, read_write> ghostOriginalIdx: array<u32>;

@group(2) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(2) @binding(1) var<storage, read_write> phCount: atomic<u32>;

@group(3) @binding(0) var<storage, read_write> pions: array<Pion>;
@group(3) @binding(1) var<storage, read_write> piCount: atomic<u32>;

fn periodic() -> bool { return u.boundaryMode == BOUND_LOOP; }

// A point anywhere on the cover, mapped into [0, W) × [0, H) by the topology's
// identifications: the torus translates; Klein's y-wrap is the glide (x, y) ~ (W − x, y + H);
// RP² glides on both axes, (x, y) ~ (W − x, y + H) and (x, y) ~ (x + W, H − y).
fn foldIntoDomain(x: f32, y: f32) -> vec2f {
    let W = u.domainW;
    let H = u.domainH;
    var px = x;
    var py = y;
    if (u.topologyMode == TOPO_TORUS) {
        return vec2(px - W * floor(px / W), py - H * floor(py / H));
    }
    let ky = floor(py / H);
    py -= ky * H;
    if ((i32(ky) & 1) != 0) { px = W - px; }
    let kx = floor(px / W);
    px -= kx * W;
    if (u.topologyMode != TOPO_KLEIN && (i32(kx) & 1) != 0) { py = H - py; }
    return vec2(px, py);
}

// The boson's position as the search sees it, and its displacement to body j
fn searchPos(x: f32, y: f32) -> vec2f {
    return select(vec2(x, y), foldIntoDomain(x, y), periodic());
}
fn toBody(p: vec2f, b: ParticleState) -> vec2f {
    if (periodic()) {
        return fullMinImageP(p.x, p.y, b.posX, b.posY, u.domainW, u.domainH, u.topologyMode);
    }
    return vec2(b.posX - p.x, b.posY - p.y);
}

// Whether body p can take four-momentum (energy, px, py) and keep a mass above MIN_MASS
fn canAbsorb(p: ParticleState, energy: f32, px: f32, py: f32) -> bool {
    if (p.mass <= EPSILON || !(energy > EPSILON)) { return false; }
    let e1 = p.mass * sqrt(1.0 + p.velWX * p.velWX + p.velWY * p.velWY) + energy;
    let px1 = p.mass * p.velWX + px;
    let py1 = p.mass * p.velWY + py;
    let mSq = e1 * e1 - px1 * px1 - py1 * py1;
    return mSq > EPSILON && sqrt(mSq) > MIN_MASS;
}

struct Boson { pos: vec2f, emitter: u32, energy: f32, px: f32, py: f32 };

// Squared distance from boson b to body j if j can absorb it, else -1
fn candidate(b: Boson, j: u32) -> f32 {
    let pj = particles[j];
    // A prescribed body is transparent to bosons: it responds to nothing
    if ((pj.flags & (FLAG_ALIVE | FLAG_GHOST | FLAG_PRESCRIBED)) != FLAG_ALIVE) { return -1.0; }
    let aux = particleAux[j];
    if (aux.particleId == b.emitter) { return -1.0; }   // no self-absorption
    let d = toBody(b.pos, pj);
    let dSq = dot(d, d);
    if (!(dSq < aux.radius * aux.radius)) { return -1.0; }
    if (!canAbsorb(pj, b.energy, b.px, b.py)) { return -1.0; }
    return dSq;
}

// The nearest absorber, as slot + 1 (0 for none); ties go to the lower slot either way
fn findAbsorber(b: Boson, useTree: bool) -> u32 {
    var best = 0u;
    var bestSq = 3.4e38;
    if (!useTree) {
        for (var j = 0u; j < u.aliveCount; j++) {
            let dSq = candidate(b, j);
            if (dSq >= 0.0 && dSq < bestSq) { best = j + 1u; bestSq = dSq; }
        }
        return best;
    }

    var stack: array<u32, 48>;
    stack[0] = 0u;
    var top: i32 = 1;
    while (top > 0) {
        top--;
        let nIdx = stack[u32(top)];
        // A body under the node is no further than its largest radius, so a grown hole widens
        // the search near itself only
        let searchR = max(getMaxRadius(nIdx), 0.0) + ABSORB_SLOP;
        if (b.pos.x + searchR < getMinX(nIdx) || b.pos.x - searchR > getMaxX(nIdx) ||
            b.pos.y + searchR < getMinY(nIdx) || b.pos.y - searchR > getMaxY(nIdx)) {
            continue;
        }
        if (getNW(nIdx) == NONE) {
            let pIdx = getParticleIndex(nIdx);
            if (pIdx < 0) { continue; }
            var j = u32(pIdx);
            if (j >= u.aliveCount) {
                // A ghost copy: its original takes the boson, measured by minimum image
                let g = j - u.aliveCount;
                if (g >= u.particleCount - u.aliveCount || (particles[j].flags & FLAG_GHOST) == 0u) { continue; }
                j = ghostOriginalIdx[g];
                if (j >= u.aliveCount) { continue; }
            }
            let dSq = candidate(b, j);
            if (dSq >= 0.0 && (dSq < bestSq || (dSq == bestSq && j + 1u < best))) {
                best = j + 1u;
                bestSq = dSq;
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
    return best;
}

fn claimPhoton(i: u32, useTree: bool) {
    if (i >= min(atomicLoad(&phCount), MAX_PHOTONS)) { return; }
    var absorber = 0u;
    let ph = photons[i];
    if ((ph.flags & 1u) != 0u && ph.lifetime >= BOSON_MIN_AGE_TIME) {
        let b = Boson(searchPos(ph.posX, ph.posY), ph.emitterId,
                      ph.energy, ph.energy * ph.velX, ph.energy * ph.velY);
        absorber = findAbsorber(b, useTree);
        if (absorber != 0u) {
            photons[i].flags = ph.flags & ~1u;
            atomicAdd(&claims[absorber - 1u], 1u);
        }
    }
    atomicStore(&claims[PH_CLAIM_BASE + i], absorber);
}

fn claimPion(i: u32, useTree: bool) {
    if (i >= min(atomicLoad(&piCount), PION_POOL_CAP)) { return; }
    var absorber = 0u;
    let pi = pions[i];
    // Leptons are not absorbed
    if ((pi.flags & 1u) != 0u && pi.kind == 0u && pi.age >= BOSON_MIN_AGE) {
        let energy = pi.mass * sqrt(1.0 + pi.wX * pi.wX + pi.wY * pi.wY);
        let b = Boson(searchPos(pi.posX, pi.posY), pi.emitterId, energy, pi.mass * pi.wX, pi.mass * pi.wY);
        absorber = findAbsorber(b, useTree);
        if (absorber != 0u) {
            pions[i].flags = pi.flags & ~1u;
            atomicAdd(&claims[absorber - 1u], 1u);
        }
    }
    atomicStore(&claims[PI_CLAIM_BASE + i], absorber);
}

@compute @workgroup_size(64)
fn claimPhotons(@builtin(global_invocation_id) gid: vec3u) { claimPhoton(gid.x, false); }

@compute @workgroup_size(64)
fn claimPhotonsTree(@builtin(global_invocation_id) gid: vec3u) { claimPhoton(gid.x, true); }

@compute @workgroup_size(64)
fn claimPions(@builtin(global_invocation_id) gid: vec3u) { claimPion(gid.x, false); }

@compute @workgroup_size(64)
fn claimPionsTree(@builtin(global_invocation_id) gid: vec3u) { claimPion(gid.x, true); }

fn absorptionRadius(m: f32, q: f32, angW: f32) -> f32 {
    let bodyR = pow(m, 1.0 / 3.0);
    let bodyRSq = bodyR * bodyR;
    if ((u.toggles0 & BLACK_HOLE_BIT) == 0u) {
        return bodyR;
    }
    let a = INERTIA_K * bodyRSq * abs(angW);   // a = J/M, J = I·angW
    let disc = m * m - a * a - q * q;
    return select(m, m + sqrt(max(0.0, disc)), disc >= 0.0);
}

var<workgroup> wgAcc: array<vec4f, ABSORB_WG>;
var<workgroup> wgClaims: u32;

// One workgroup per body slot; k = (E, px, py, q) summed over its claims
@compute @workgroup_size(ABSORB_WG)
fn applyAbsorption(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let t = wid.x;
    if (t >= u.aliveCount) { return; }
    if (lid == 0u) { wgClaims = atomicLoad(&claims[t]); }
    if (workgroupUniformLoad(&wgClaims) == 0u) { return; }

    let key = t + 1u;
    var k = vec4f(0.0);
    let nPh = min(atomicLoad(&phCount), MAX_PHOTONS);
    for (var i = lid; i < nPh; i += ABSORB_WG) {
        if (atomicLoad(&claims[PH_CLAIM_BASE + i]) == key) {
            let ph = photons[i];
            k += ph.energy * vec4(1.0, ph.velX, ph.velY, 0.0);
        }
    }
    let nPi = min(atomicLoad(&piCount), PION_POOL_CAP);
    for (var i = lid; i < nPi; i += ABSORB_WG) {
        if (atomicLoad(&claims[PI_CLAIM_BASE + i]) == key) {
            let pi = pions[i];
            k += vec4(pi.mass * sqrt(1.0 + pi.wX * pi.wX + pi.wY * pi.wY), pi.mass * pi.wX, pi.mass * pi.wY, pi.charge);
        }
    }

    wgAcc[lid] = k;
    workgroupBarrier();
    for (var s = ABSORB_WG / 2u; s > 0u; s >>= 1u) {
        if (lid < s) { wgAcc[lid] += wgAcc[lid + s]; }
        workgroupBarrier();
    }
    if (lid != 0u) { return; }
    atomicStore(&claims[t], 0u);

    let sum = wgAcc[0];
    var p = particles[t];
    let e1 = p.mass * sqrt(1.0 + p.velWX * p.velWX + p.velWY * p.velWY) + sum.x;
    let px1 = p.mass * p.velWX + sum.y;
    let py1 = p.mass * p.velWY + sum.z;
    let newMass = sqrt(max(e1 * e1 - px1 * px1 - py1 * py1, 0.0));
    // Each claim was checked against this body, so the sum passes too (see the header)
    if (!(newMass > MIN_MASS)) { return; }

    p.baseMass = p.baseMass * (newMass / p.mass);
    // The spin J = I·angW is kept as the moment of inertia (∝ m^{5/3}) grows
    p.angW = p.angW * pow(p.mass / newMass, 5.0 / 3.0);
    p.mass = newMass;
    p.charge += sum.w;
    p.velWX = px1 / newMass;
    p.velWY = py1 / newMass;
    particles[t] = p;

    var aux = particleAux[t];
    aux.radius = absorptionRadius(newMass, p.charge, p.angW);
    particleAux[t] = aux;
}
