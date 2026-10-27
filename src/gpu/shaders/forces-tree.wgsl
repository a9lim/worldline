// ─── Barnes-Hut Tree Walk Force Computation ───
// A group walk: each workgroup takes GROUP bodies consecutive in the tree's sorted (Morton)
// order, so close together, walks the tree once for all of them against their bounding box
// into an interaction list in workgroup memory, and then sums the list for every body, LANES
// threads a body, a tile of entries at a time. The nodes waiting to be judged sit in a ring:
// each round takes a batch from the front, breadth first, sized so its children fit above a
// reserve, and once the ring reaches the reserve it takes one node a round from the back, a
// depth-first descent the reserve always holds, so no tree, however deep or crowded,
// overflows it. A node is taken whole when it
// is far from the whole box (size < θ · distance to the box), and on a periodic domain only
// when its cell and the box lie within half a domain of each other, so every body sees all of
// it in one image. One thread walking per body left the GPU waiting on each walk's node reads
// in series. Lists and frontiers are filled in a fixed order (prefix sums, not atomics) and the
// lanes add in lane order, so the sums are the same every run.
//
// The walk runs only without Relativity: with it every force acts from the sources' world
// lines, pairwise (pair-force.wgsl), and a node's aggregate has no world line to take.
// Accumulates into the same force buffers as the pairwise path.

// Constants provided by generated wgslConstants block.
// Shader-specific constants:
const NONE: i32 = -1;
const GROUP: u32 = 32u;            // bodies per workgroup
const LANES: u32 = 8u;             // threads per body: each sums every LANES-th list entry
const WG_SIZE: u32 = GROUP * LANES;
const JUDGE: u32 = WG_SIZE;        // nodes judged a round, at most
const TILE: u32 = 32u;             // list entries loaded into workgroup memory at a time
const RING: u32 = 2304u;           // nodes waiting to be judged
// Kept free for a depth-first descent: three more waiting nodes a level, over the 31 internal
// levels a compressed quadtree of 30-bit codes and sorted positions can have
const RING_RESERVE: u32 = 100u;
const LIST_MAX: u32 = 512u;        // list entries summed at a time

// Node layout accessors from shared-tree-nodes.wgsl (prepended)

@group(0) @binding(0) var<storage, read_write> nodes: array<u32>;
@group(0) @binding(1) var<uniform> uniforms: SimUniforms;

// Group 1: packed particle structs (read_write for encoder compat), the tree's sorted keys
// (Morton code, slot) and its body count (tree-build.wgsl)
@group(1) @binding(0) var<storage, read_write> particleState: array<ParticleState>;
@group(1) @binding(1) var<storage, read_write> treeKeys: array<vec2<u32>>;
@group(1) @binding(2) var<storage, read_write> derived_in: array<ParticleDerived>;
@group(1) @binding(3) var<storage, read_write> treeCount: array<u32>;

// Group 2: force accumulators + maxAccel — 2 bindings (radiationState removed, jerk now in AllForces)
@group(2) @binding(0) var<storage, read_write> allForces: array<AllForces>;
@group(2) @binding(1) var<storage, read_write> maxAccel: array<atomic<u32>>;

// Group 3: world lines (shared-worldline.wgsl)
@group(3) @binding(0) var<storage, read_write> wlData: array<f32>;
@group(3) @binding(1) var<storage, read_write> wlMeta: array<u32>;

// Shared pairForce function (from pair-force.wgsl, imported or inlined)
// This function accumulates E-like forces and B-field contributions
// for one source acting on one receiver particle.
// For the tree walk, sources are either individual leaf particles
// or aggregate node data (mass, charge, CoM, etc.).

// Inline the core force accumulation (matches pairForce in forces.js):
// jerkOut: function-scope pointer for accumulating analytical jerk (radiation)
fn bhSourceRadius(m: f32, charge: f32, angMomentum: f32) -> f32 {
    if (m <= EPSILON) { return 0.0; }
    let a = abs(angMomentum) / m;   // the Kerr parameter a = J/M, J = I·angW
    let disc = m * m - a * a - charge * charge;
    return select(m, m + sqrt(max(0.0, disc)), disc >= 0.0);
}

fn bhInvPotential(rawRSq: f32, m: f32, charge: f32, angMomentum: f32) -> f32 {
    let rawR = sqrt(max(rawRSq, EPSILON));
    let gap = max(rawR - bhSourceRadius(m, charge, angMomentum), BH_PW_MIN_GAP);
    return 1.0 / gap;
}

fn accumulateForce(
    af: ptr<function, AllForces>,
    rx: f32, ry: f32,            // source − observer, image resolved
    pMass: f32, pCharge: f32,
    pMagMoment: f32, pAngMomentum: f32,
    pAngVel: f32, pVelX: f32, pVelY: f32,
    svx: f32, svy: f32,
    sMass: f32, sCharge: f32,
    sAngVel: f32, sMagMoment: f32, sAngMomentum: f32,
    pRi5: f32,
    jerkOut: ptr<function, vec2<f32>>,
    useAberration: bool,
    // Hoisted toggle booleans (G9: avoids re-reading uniforms.toggles0 per call)
    gravOn: bool, coulOn: bool, magOn: bool, gmOn: bool,
    yukOn: bool, onePNOn: bool, bazOn: bool, radOn: bool, bhOn: bool,
    relOn: bool,
) {
    let softeningSq = uniforms.softeningSq;
    let rawRSq = rx * rx + ry * ry;
    let rSq = rawRSq + softeningSq;
    let invRSq = 1.0 / rSq;
    let invR = sqrt(invRSq);
    let invR3 = invR * invRSq;
    let invR5 = invR3 * invRSq;

    // Toy signal-delay aberration: not a full moving-source field reconstruction.
    var aberr: f32 = 1.0;
    if (useAberration) {
        let nDotV = -(rx * svx + ry * svy) * invR;
        let denom = max(1.0 - nDotV, ABERRATION_CLAMP_MIN);
        aberr = min(1.0 / (denom * denom * denom), ABERRATION_CLAMP_MAX);
    }
    let invR3a = invR3 * aberr;
    let invR5a = invR5 * aberr;

    // Relative velocity for jerk computation
    let vrx = svx - pVelX;
    let vry = svy - pVelY;
    let rDotVr = rx * vrx + ry * vry;

    // Gravity: +m1*m2/r^2 (attractive)
    if (gravOn) {
        let k = pMass * sMass;
        var fDir = k * invR3a;
        var pwJerkFactor = 0.0;
        if (bhOn) {
            let rawR = sqrt(max(rawRSq, EPSILON));
            let invRawR = 1.0 / rawR;
            let invGap = bhInvPotential(rawRSq, sMass, sCharge, sAngMomentum);
            let pwForceScale = invRawR * invGap * invGap;
            fDir = k * pwForceScale * aberr;
            pwJerkFactor = pwForceScale * (invRawR * invRawR + 2.0 * invRawR * invGap) * aberr;
        }
        let fx = rx * fDir;
        let fy = ry * fDir;
        (*af).f0.x += fx;
        (*af).f0.y += fy;
        (*af).totalForce.x += fx;
        (*af).totalForce.y += fy;

        // Analytical jerk for Larmor radiation
        if (radOn) {
            let jRadial = select(-3.0 * rDotVr * k * invRSq * invR3a,
                                 -k * rDotVr * pwJerkFactor,
                                 bhOn);
            (*jerkOut).x += vrx * fDir + rx * jRadial;
            (*jerkOut).y += vry * fDir + ry * jRadial;
        }

        // Tidal locking torque
        let crossRV = rx * (svy - pVelY) - ry * (svx - pVelX);
        let wOrbit = crossRV * invRSq;
        let dw = pAngVel - wOrbit;
        var coupling = sMass;
        if (coulOn && pMass > EPSILON) {
            coupling += pCharge * sCharge / pMass;
        }
        let invR6 = invRSq * invRSq * invRSq;
        (*af).torques.z += -TIDAL_STRENGTH * coupling * coupling * pRi5 * invR6 * dw;
    }

    // Coulomb: -q1*q2/r^2 (like repels)
    if (coulOn) {
        let k = -(pCharge * sCharge);
        let fDir = k * invR3;
        let fx = rx * fDir;
        let fy = ry * fDir;
        (*af).f0.z += fx;
        (*af).f0.w += fy;
        (*af).totalForce.x += fx;
        (*af).totalForce.y += fy;

        // Analytical jerk for Larmor radiation
        if (radOn) {
            let jRadial = -3.0 * rDotVr * k * invRSq * invR3;
            (*jerkOut).x += vrx * fDir + rx * jRadial;
            (*jerkOut).y += vry * fDir + ry * jRadial;
        }
    }

    // (v_s × r)_z for the moving-source fields
    let crossSV = svx * ry - svy * rx;

    // Magnetic: dipole-dipole + Bz field
    if (magOn) {
        // Dipole-dipole radial: F = -3*mu1*mu2/r^4 (aligned dipoles repel)
        let fDir = -3.0 * (pMagMoment * sMagMoment) * invR5a;
        let fx = rx * fDir;
        let fy = ry * fDir;
        (*af).f1.x += fx;
        (*af).f1.y += fy;
        (*af).totalForce.x += fx;
        (*af).totalForce.y += fy;

        // Analytical jerk: F = 3μ₁μ₂·r/r⁵, d/dt(1/r⁵) = -5·rDotVr/r⁷
        if (radOn) {
            let invR7a = invR5a * invRSq;
            let jRadial = 15.0 * (pMagMoment * sMagMoment) * rDotVr * invR7a;
            (*jerkOut).x += vrx * fDir + rx * jRadial;
            (*jerkOut).y += vry * fDir + ry * jRadial;
        }

        // Biot–Savart from the moving charge, Bz = −q (v_s × r)_z/r³, and its gradient
        let cq = -sCharge;
        let BzMoving = cq * crossSV * invR3;
        (*af).bFields.x += BzMoving;
        (*af).bFieldGrads.x += 3.0 * BzMoving * rx * invRSq + cq * svy * invR3;
        (*af).bFieldGrads.y += 3.0 * BzMoving * ry * invRSq - cq * svx * invR3;

        // In-plane dipole field, −μ/r³ (no gradient: spin-spin is the direct term above)
        (*af).bFields.x -= sMagMoment * invR3;
    }

    // Gravitomagnetic: dipole + Bgz field (F = 4m v × Bg; parallel mass currents repel)
    if (gmOn) {
        let fDir = 3.0 * (pAngMomentum * sAngMomentum) * invR5a;
        let fx = rx * fDir;
        let fy = ry * fDir;
        (*af).f1.z += fx;
        (*af).f1.w += fy;
        (*af).totalForce.x += fx;
        (*af).totalForce.y += fy;

        // Analytical jerk: F = 3L₁L₂·r/r⁵, d/dt(1/r⁵) = -5·rDotVr/r⁷
        if (radOn) {
            let invR7a = invR5a * invRSq;
            let jRadial = -15.0 * (pAngMomentum * sAngMomentum) * rDotVr * invR7a;
            (*jerkOut).x += vrx * fDir + rx * jRadial;
            (*jerkOut).y += vry * fDir + ry * jRadial;
        }

        // Moving mass: Bg = +m (v_s × r)_z/r³, and its gradient
        let BgzMoving = sMass * crossSV * invR3;
        (*af).bFields.y += BgzMoving;
        (*af).bFieldGrads.z += 3.0 * BgzMoving * rx * invRSq + sMass * svy * invR3;
        (*af).bFieldGrads.w += 3.0 * BgzMoving * ry * invRSq - sMass * svx * invR3;

        // Spin: +J/(2r³) in the plane (no gradient)
        (*af).bFields.y += 0.5 * sAngMomentum * invR3;

        // Frame-dragging torque
        let fdTorque = 2.0 * sAngMomentum * (sAngVel - pAngVel) * invR3;
        (*af).torques.y += fdTorque;
    }

    // Yukawa
    let mu = uniforms.yukawaMu;
    var yukInRange = false;
    if (yukOn) {
        let cutoffSq = (6.0 / max(mu, EPSILON)) * (6.0 / max(mu, EPSILON));
        yukInRange = rawRSq < cutoffSq;
        if (yukInRange) {
            let r = 1.0 / invR;
            let muR = mu * r;
            let expMuR = select(0.0, exp(-muR), muR < 80.0);
            let yukInvRa = invR * aberr;
            let fDir = uniforms.yukawaCoupling * pMass * sMass * expMuR * (invRSq + mu * invR) * yukInvRa;
            let fx = rx * fDir;
            let fy = ry * fDir;
            (*af).f3.z += fx;
            (*af).f3.w += fy;
            (*af).totalForce.x += fx;
            (*af).totalForce.y += fy;

            // Analytical jerk for pion emission radiation
            if (radOn) {
                let jRadial = -(3.0 * invRSq + 3.0 * mu * invR + mu * mu)
                              * rDotVr * uniforms.yukawaCoupling * pMass * sMass
                              * expMuR * invRSq * yukInvRa;
                (*jerkOut).x += vrx * fDir + rx * jRadial;
                (*jerkOut).y += vry * fDir + ry * jRadial;
            }
        }
    }

    // 1PN: EIH remainder, Bažański, scalar Breit (shared-1pn.wgsl)
    if (onePNOn) {
        let f = pair1PN(vec2(rx, ry), invR, invRSq,
                        vec2(pVelX, pVelY), vec2(svx, svy),
                        pMass, sMass, pCharge, sCharge,
                        gmOn, bazOn, yukInRange, relOn,
                        mu, uniforms.yukawaCoupling);
        (*af).f2.x += f.x;
        (*af).f2.y += f.y;
        (*af).totalForce.x += f.x;
        (*af).totalForce.y += f.y;
    }
}

// Workgroup memory, 16 KB in all: the walk's ring and list share one pool, which the lanes'
// partial sums reuse once the walk is done
const RING_AT: u32 = 0u;
const LIST_AT: u32 = RING;
var<workgroup> wgPool: array<u32, 2816>;          // RING + LIST_MAX
var<workgroup> wgTile: array<TileSource, TILE>;
var<workgroup> wgScan: array<u32, 512>;           // two WG_SIZE halves, read one, write the other
var<workgroup> wgLo: array<vec2<f32>, GROUP>;
var<workgroup> wgHi: array<vec2<f32>, GROUP>;
var<workgroup> wgHead: u32;      // the ring's front and back, counted up (mod RING to index)
var<workgroup> wgTail: u32;
var<workgroup> wgLCount: u32;
var<workgroup> wgBodies: u32;

/** A list entry as a source: a body, or a far node's aggregate at its centre of mass. */
struct TileSource {
    pos: vec2<f32>,
    vel: vec2<f32>,
    mass: f32,
    charge: f32,
    angVel: f32,
    magMoment: f32,
    angMomentum: f32,
    slot: u32,          // the body's slot, or NO_SLOT for a node (and for none)
    _p0: u32, _p1: u32, _p2: u32,
};
const NO_SLOT: u32 = 0xFFFFFFFFu;

/** The body one thread sums forces for. */
struct Observer {
    valid: bool,
    idx: u32,
    pos: vec2<f32>,
    vel: vec2<f32>,
    mass: f32,
    charge: f32,
    magMoment: f32,
    angMomentum: f32,
    angVel: f32,
    ri5: f32,
};

/** The toggles, read once. */
struct Laws {
    gravOn: bool, coulOn: bool, magOn: bool, gmOn: bool, yukOn: bool, onePNOn: bool,
    bazOn: bool, radOn: bool, bhOn: bool,
    periodic: bool, domW: f32, domH: f32, topo: u32,
};

/** Load list entry nodeIdx as a source. Ghosts and retired bodies never reach the list. */
fn loadSource(nodeIdx: u32) -> TileSource {
    var t: TileSource;
    if (getNW(nodeIdx) == NONE) {
        let sIdx = u32(getParticleIndex(nodeIdx));
        let sPs = particleState[sIdx];
        let sD = derived_in[sIdx];
        t.pos = vec2(sPs.posX, sPs.posY);
        t.vel = vec2(sD.velX, sD.velY);
        t.mass = sPs.mass;
        t.charge = sPs.charge;
        t.angVel = sD.angVel;
        t.magMoment = sD.magMoment;
        t.angMomentum = sD.angMomentum;
        t.slot = sIdx;
        return t;
    }
    let m = getTotalMass(nodeIdx);
    t.pos = vec2(getComX(nodeIdx), getComY(nodeIdx));
    t.vel = vec2(getTotalMomX(nodeIdx), getTotalMomY(nodeIdx)) / m;
    t.mass = m;
    t.charge = getTotalCharge(nodeIdx);
    t.angVel = 0.0;   // for aggregate
    t.magMoment = getTotalMagMoment(nodeIdx);
    t.angMomentum = getTotalAngMomentum(nodeIdx);
    t.slot = NO_SLOT;
    return t;
}

/**
 * Sum the first count list entries, TILE at a time through workgroup memory: each thread
 * takes every LANES-th entry of a tile for its own body. Every thread of the workgroup calls
 * this (it has barriers).
 */
fn sumList(lid: u32, lane: u32, count: u32, o: Observer, L: Laws,
           af: ptr<function, AllForces>, jerk: ptr<function, vec2<f32>>) {
    for (var base = 0u; base < count; base += TILE) {
        if (lid < TILE && base + lid < count) { wgTile[lid] = loadSource(wgPool[LIST_AT + base + lid]); }
        workgroupBarrier();
        if (o.valid) {
            let n = min(TILE, count - base);
            for (var j = lane; j < n; j += LANES) {
                let t = wgTile[j];
                if (t.slot == o.idx) { continue; }
                var d = t.pos - o.pos;
                if (L.periodic) { d = fullMinImageP(o.pos.x, o.pos.y, t.pos.x, t.pos.y, L.domW, L.domH, L.topo); }
                accumulateForce(
                    af, d.x, d.y, o.mass, o.charge,
                    o.magMoment, o.angMomentum, o.angVel, o.vel.x, o.vel.y,
                    t.vel.x, t.vel.y,
                    t.mass, t.charge,
                    t.angVel, t.magMoment, t.angMomentum,
                    o.ri5,
                    jerk,
                    false, // no aberration: the walk runs without Relativity
                    L.gravOn, L.coulOn, L.magOn, L.gmOn, L.yukOn, L.onePNOn, L.bazOn, L.radOn, L.bhOn,
                    false,
                );
            }
        }
        workgroupBarrier();
    }
}

/**
 * Inclusive prefix sum of v over the workgroup (Hillis–Steele), in thread order, each step
 * reading one half of wgScan and writing the other, so it takes one barrier a step. After the
 * eight steps the last half written is the first, so the total is wgScan[WG_SIZE − 1].
 */
fn groupScan(lid: u32, v: u32) -> u32 {
    var x = v;
    wgScan[lid] = x;
    workgroupBarrier();
    var src = 0u;
    for (var off = 1u; off < WG_SIZE; off <<= 1u) {
        if (lid >= off) { x += wgScan[src + lid - off]; }
        wgScan[(WG_SIZE - src) + lid] = x;
        workgroupBarrier();
        src = WG_SIZE - src;
    }
    return x;
}

/** The 24 accumulator words the walk touches, round r (0–2) of 8. */
fn partial(a: AllForces, j: vec2<f32>, r: u32) -> array<f32, 8> {
    if (r == 0u) { return array<f32, 8>(a.f0.x, a.f0.y, a.f0.z, a.f0.w, a.f1.x, a.f1.y, a.f1.z, a.f1.w); }
    if (r == 1u) { return array<f32, 8>(a.f2.x, a.f2.y, a.f3.z, a.f3.w, a.torques.y, a.torques.z, a.bFields.x, a.bFields.y); }
    return array<f32, 8>(a.bFieldGrads.x, a.bFieldGrads.y, a.bFieldGrads.z, a.bFieldGrads.w, a.totalForce.x, a.totalForce.y, j.x, j.y);
}

@compute @workgroup_size(WG_SIZE)
fn main(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lidv: vec3<u32>) {
    let lid = lidv.x;
    let member = lid % GROUP;      // the body within the group
    let lane = lid / GROUP;
    let k = wid.x * GROUP + member;
    let n = treeCount[0];

    // This thread's body: an alive, non-ghost slot of the tree in sorted order
    var o: Observer;
    o.valid = false;
    o.idx = 0u;
    if (k < n) {
        let pIdx = treeKeys[k].y;
        let ps = particleState[pIdx];
        if ((ps.flags & FLAG_ALIVE) != 0u && (ps.flags & FLAG_GHOST) == 0u) {
            o.valid = true;
            o.idx = pIdx;
            o.pos = vec2(ps.posX, ps.posY);
            o.mass = ps.mass;
            o.charge = ps.charge;
            let pDerived = derived_in[pIdx];
            o.vel = vec2(pDerived.velX, pDerived.velY);
            o.angVel = pDerived.angVel;
            o.magMoment = pDerived.magMoment;
            o.angMomentum = pDerived.angMomentum;
            // Pre-hoist ri5 = mass^(5/3) for tidal locking (avoids pow() per pair in accumulateForce)
            let pBodyRadiusSq = pDerived.bodyRSq;
            o.ri5 = pBodyRadiusSq * pBodyRadiusSq * sqrt(pBodyRadiusSq);
        }
    }

    // G9: Hoist toggle reads before the tree walk loop (avoids repeated uniform reads per call)
    let t0 = uniforms.toggles0;
    var L: Laws;
    L.gravOn  = (t0 & GRAVITY_BIT)     != 0u;
    L.coulOn  = (t0 & COULOMB_BIT)     != 0u;
    L.magOn   = (t0 & MAGNETIC_BIT)    != 0u;
    L.gmOn    = (t0 & GRAVITOMAG_BIT)  != 0u;
    L.yukOn   = (t0 & YUKAWA_BIT)      != 0u;
    L.onePNOn = (t0 & ONE_PN_BIT)      != 0u;
    L.bazOn   = L.gmOn && L.coulOn;
    L.radOn   = (t0 & RADIATION_BIT)   != 0u;
    L.bhOn    = (t0 & BLACK_HOLE_BIT)  != 0u;
    L.periodic = uniforms.boundaryMode == BOUND_LOOP;
    L.domW = uniforms.domainW;
    L.domH = uniforms.domainH;
    L.topo = uniforms.topologyMode;
    let thetaSq = uniforms.bhTheta * uniforms.bhTheta;

    // The group's bounding box, over the bodies that take forces
    if (lane == 0u) {
        wgLo[member] = select(vec2(3.4e38), o.pos, o.valid);
        wgHi[member] = select(vec2(-3.4e38), o.pos, o.valid);
    }
    workgroupBarrier();
    for (var off = GROUP / 2u; off > 0u; off >>= 1u) {
        if (lid < off) {
            wgLo[lid] = min(wgLo[lid], wgLo[lid + off]);
            wgHi[lid] = max(wgHi[lid], wgHi[lid + off]);
        }
        workgroupBarrier();
    }
    let bodies = groupScan(lid, select(0u, 1u, o.valid && lane == 0u));
    if (lid == WG_SIZE - 1u) {
        wgBodies = bodies;
        wgPool[RING_AT] = 0u;
        wgHead = 0u;
        wgTail = 1u;
        wgLCount = 0u;
    }
    if (workgroupUniformLoad(&wgBodies) == 0u) { return; }
    let boxLo = wgLo[0];
    let boxHi = wgHi[0];
    let boxC = 0.5 * (boxLo + boxHi);
    let boxHalf = 0.5 * (boxHi - boxLo);

    // Lane 0 starts from the accumulators (zeroed by resetForces), the others from zero
    var localAF: AllForces;
    if (o.valid && lane == 0u) { localAF = allForces[o.idx]; }
    var localJerk = vec2<f32>(0.0, 0.0);

    // Each round a batch comes off the ring, a thread judging each, and prefix sums place each
    // one's list entry or its children at the back
    loop {
        let head = workgroupUniformLoad(&wgHead);
        let tail = workgroupUniformLoad(&wgTail);
        let waiting = tail - head;
        if (waiting == 0u) { break; }
        // A full list is summed and emptied first
        let lcount = workgroupUniformLoad(&wgLCount);
        if (lcount + JUDGE > LIST_MAX) {
            sumList(lid, lane, lcount, o, L, &localAF, &localJerk);
            if (lid == 0u) { wgLCount = 0u; }
            workgroupBarrier();
        }
        // From the front, a batch whose children fit above the reserve; within it, one node
        // from the back, whose children take its place: that deepens the ring by at most three
        // a level
        let free = RING - min(waiting + RING_RESERVE, RING);
        let deep = free < 3u;
        let batch = select(min(min(JUDGE, waiting), free / 3u), 1u, deep);
        let takeAt = select(head, tail - 1u, deep);
        let pushAt = select(tail, tail - 1u, deep);

        var node = 0u;
        var take = 0u;   // 1: into the list
        var open = 0u;   // children to push
        if (lid < batch) {
            node = wgPool[RING_AT + (takeAt + lid) % RING];
            if (getTotalMass(node) >= EPSILON) {
                if (getNW(node) == NONE) {
                    // A body; retired bodies act only with Relativity, and the walk runs without
                    let pi = getParticleIndex(node);
                    take = select(0u, 1u, pi >= 0 && (particleState[u32(pi)].flags & FLAG_ALIVE) != 0u);
                } else {
                    let lo = vec2(getMinX(node), getMinY(node));
                    let hi = vec2(getMaxX(node), getMaxY(node));
                    let size = max(hi.x - lo.x, hi.y - lo.y);
                    let com = vec2(getComX(node), getComY(node));
                    var dc = com - boxC;
                    if (L.periodic) { dc = fullMinImageP(boxC.x, boxC.y, com.x, com.y, L.domW, L.domH, L.topo); }
                    let gap = max(abs(dc) - boxHalf, vec2(0.0));
                    var far = size * size < thetaSq * dot(gap, gap);
                    if (far && L.periodic) {
                        let cc = 0.5 * (lo + hi);
                        let dcc = fullMinImageP(boxC.x, boxC.y, cc.x, cc.y, L.domW, L.domH, L.topo);
                        let reach = abs(dcc) + 0.5 * (hi - lo) + boxHalf;
                        far = reach.x < 0.5 * L.domW && reach.y < 0.5 * L.domH;
                    }
                    if (far) {
                        take = 1u;
                    } else {
                        open = select(0u, 1u, getNW(node) != NONE) + select(0u, 1u, getNE(node) != NONE)
                             + select(0u, 1u, getSW(node) != NONE) + select(0u, 1u, getSE(node) != NONE);
                    }
                }
            }
        }

        let incl = groupScan(lid, take | (open << 16u));
        let excl = incl - (take | (open << 16u));
        let total = wgScan[WG_SIZE - 1u];
        let lBase = wgLCount;
        // Every thread has read its node before any child overwrites it (from the back)
        workgroupBarrier();
        if (take == 1u) { wgPool[LIST_AT + lBase + (excl & 0xFFFFu)] = node; }
        if (open > 0u) {
            var at = pushAt + (excl >> 16u);
            for (var c = 0u; c < 4u; c++) {
                let child = getChild(node, c);
                if (child != NONE) { wgPool[RING_AT + at % RING] = u32(child); at += 1u; }
            }
        }
        workgroupBarrier();
        if (lid == 0u) {
            wgLCount = lBase + (total & 0xFFFFu);
            wgHead = select(head + batch, head, deep);
            wgTail = pushAt + (total >> 16u);
        }
        workgroupBarrier();
    }
    sumList(lid, lane, workgroupUniformLoad(&wgLCount), o, L, &localAF, &localJerk);

    // Add the lanes' sums, in lane order, a third of the touched words per round, through the pool
    var out = localAF;
    var outJerk = localJerk;
    for (var r = 0u; r < 3u; r++) {
        let mine = partial(localAF, localJerk, r);
        for (var w = 0u; w < 8u; w++) { wgPool[lid * 8u + w] = bitcast<u32>(mine[w]); }
        workgroupBarrier();
        if (lane == 0u) {
            var sum = mine;
            for (var l = 1u; l < LANES; l++) {
                for (var w = 0u; w < 8u; w++) { sum[w] += bitcast<f32>(wgPool[(l * GROUP + member) * 8u + w]); }
            }
            if (r == 0u) {
                out.f0 = vec4(sum[0], sum[1], sum[2], sum[3]);
                out.f1 = vec4(sum[4], sum[5], sum[6], sum[7]);
            } else if (r == 1u) {
                out.f2 = vec4(sum[0], sum[1], out.f2.z, out.f2.w);
                out.f3 = vec4(out.f3.x, out.f3.y, sum[2], sum[3]);
                out.torques = vec4(out.torques.x, sum[4], sum[5], out.torques.w);
                out.bFields = vec4(sum[6], sum[7], out.bFields.z, out.bFields.w);
            } else {
                out.bFieldGrads = vec4(sum[0], sum[1], sum[2], sum[3]);
                out.totalForce = vec2(sum[4], sum[5]);
                outJerk = vec2(sum[6], sum[7]);
            }
        }
        workgroupBarrier();
    }
    if (!o.valid || lane != 0u) { return; }

    // Write accumulated jerk to AllForces (NaN guard)
    out.jerk += vec2(
        select(outJerk.x, 0.0, outJerk.x != outJerk.x),
        select(outJerk.y, 0.0, outJerk.y != outJerk.y)
    );

    // NaN guard on B-field accumulators — corruption propagates to Boris rotation + spin-orbit
    out.bFields = vec4(
        select(out.bFields.x, 0.0, out.bFields.x != out.bFields.x),
        select(out.bFields.y, 0.0, out.bFields.y != out.bFields.y),
        out.bFields.z, out.bFields.w);
    out.bFieldGrads = vec4(
        select(out.bFieldGrads.x, 0.0, out.bFieldGrads.x != out.bFieldGrads.x),
        select(out.bFieldGrads.y, 0.0, out.bFieldGrads.y != out.bFieldGrads.y),
        select(out.bFieldGrads.z, 0.0, out.bFieldGrads.z != out.bFieldGrads.z),
        select(out.bFieldGrads.w, 0.0, out.bFieldGrads.w != out.bFieldGrads.w));

    // Write accumulated forces back to global memory ONCE
    allForces[o.idx] = out;

    // Adaptive substepping: atomicMax of |F/m| as fixed-point u32
    let totalFSq = out.totalForce.x * out.totalForce.x + out.totalForce.y * out.totalForce.y;
    let invMass = derived_in[o.idx].invMass;
    let accelSq = totalFSq * invMass * invMass;
    if (accelSq == accelSq && accelSq < 1e20) {
        let accelBits = bitcast<u32>(sqrt(accelSq));
        atomicMax(&maxAccel[0], accelBits);
    }
}
