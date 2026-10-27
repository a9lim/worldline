// compute-stats.wgsl — The stats readback: KE, PE, momentum, angular momentum, the Darwin
// field energy and momentum, the scalar fields' energy and momentum, the particle-field
// interaction, the selected particle and the reference body.
//
// Every sum is spread over workgroups that write partials past the results (STATS_LAYOUT,
// gpu-constants.js), and statsReduce adds them in a fixed order, so the same state reads back
// the same numbers (WebGPU has no float atomics). Dispatched in order, in one encoder:
//   statsBodies (ceil(N/64) × 64): KE, momentum, mass and its first moments, angular momentum
//                about the workgroup's own centre of mass, spin, the particle-field
//                interaction (PQS), and the heaviest body other than the selection
//   statsPE     (ceil(N/OBSERVERS_PER_GROUP) × 256): the pairs j > i, OBSERVERS_PER_GROUP rows
//                a workgroup with the rest of its threads as lanes over the sources (as in
//                pair-force.wgsl), sources tiled through shared memory: PE, the 1PN energies,
//                the Darwin field energy and momentum, peScale
//   statsField  (STATS_FIELD_GROUPS × 256, with Higgs or axion): the fields' energy and
//                momentum, a cell a thread
//   statsBosons (boson-ledger.wgsl, STATS_LEDGER_GROUPS × 64): the pools, pending radiation
//   statsReduce (1 × 256): adds the partials, moves the angular momenta to the total centre of
//                mass, copies the selected particle and the reference body
//
// Partials, f32 words from each base for workgroup g:
//   STATS_LEDGER_PART + 8g: photon E, px, py; pion and lepton E, px, py; pending radiation
//   STATS_BODY_PART + 16g:  linearKE, spinKE, px, py; M, Σmx, Σmy, spin L; higgsPfi, axionPfi,
//                           orbital L about the workgroup's centre of mass, reference mass;
//                           reference index (f32, −1 for none)
//   STATS_PE_PART + 8g:     pe, peScale, darwinE, darwinPx, darwinPy
//   STATS_FIELD_PART + 4g:  higgsE, axionE, fieldMomX, fieldMomY
//
// Constants from wgslConstants: INERTIA_K, SOFTENING_SQ, BH_SOFTENING_SQ, YUKAWA_COUPLING,
//   FLAG_ALIVE, FLAG_ANTIMATTER, ONE_PN_BIT, GRAVITY_BIT, COULOMB_BIT, MAGNETIC_BIT,
//   GRAVITOMAG_BIT, YUKAWA_BIT, HIGGS_BIT, AXION_BIT, BLACK_HOLE_BIT, AXION_COUPLING,
//   OBSERVERS_PER_GROUP, STATS_*

struct StatsUniforms {
    aliveCount: u32,
    selectedIdx: i32,
    toggles0: u32,       // physics toggle bitfield
    domainW: f32,        // 16
    domainH: f32,
    yukawaMu: f32,
    higgsMass: f32,
    axionMass: f32,      // 32
    fieldGridRes: u32,
    boundaryMode: u32,   // BOUND_DESPAWN/BOUND_BOUNCE/BOUND_LOOP
    topologyMode: u32,   // TOPO_TORUS/TOPO_KLEIN/TOPO_RP2
    _pad3: u32,          // 48
};

// Struct definitions (ParticleState, ParticleDerived, AllForces) provided by shared-structs.wgsl.

// Group 0: particle data
@group(0) @binding(0) var<uniform> params: StatsUniforms;
@group(0) @binding(1) var<storage, read> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read> derived: array<ParticleDerived>;
@group(0) @binding(3) var<storage, read> forces: array<AllForces>;
@group(0) @binding(4) var<storage, read_write> stats: array<f32>;
@group(0) @binding(5) var<storage, read> clocks: array<vec4<f32>>;   // τ, ring phase, θ, dτ/dt

// Group 1: scalar field grids (optional — bound to dummy 4-byte buffers when field inactive)
@group(1) @binding(0) var<storage, read> higgsField: array<f32>;
@group(1) @binding(1) var<storage, read> higgsFieldDot: array<f32>;
@group(1) @binding(2) var<storage, read> axionField: array<f32>;
@group(1) @binding(3) var<storage, read> axionFieldDot: array<f32>;

// Output layout (the first 128 f32, 512 bytes, which are read back):
// [0]  linearKE      [1]  spinKE       [2]  px           [3]  py
// [4]  orbAngMom     [5]  spinAngMom   [6]  comX         [7]  comY
// [8]  totalMass     [9]  aliveCount   [10] pe           [11] darwinFieldE
// [12] darwinFieldPx [13] darwinFieldPy [14] higgsFieldE [15] axionFieldE
//      (pe holds the 1PN energies too: EIH, Bažański, scalar Breit)
// [16] higgsPfiE     [17] axionPfiE    [18] fieldMomX    [19] fieldMomY
// [20-25] boson pools (boson-ledger.wgsl): photon E, px, py; pion and lepton E, px, py
// [26] peScale = dE/d(ln a) of [10] and [11] for a uniform stretch (expansion's ledger)
// [27] radiation lost by bodies but not yet emitted (boson-ledger.wgsl)
// [96-103] cosmoAccum since the last readback: [96] expansion work; [97] escaped energy that
//          redshifts (photons, leptons' kinetic), [98-100] its comoving a·(E, px, py) with all
//          escaped momentum; [101] escaped leptons' rest mass
// Selected particle [32-75]: [32] posX .. [69] axion force, [70-72] unused, [73-75] τ, dτ/dt, θ
// Reference body [80-91]: heaviest other alive particle (mass [84] = -1 when none)

fn toggle(bit: u32) -> bool { return (params.toggles0 & bit) != 0u; }

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

// ─── Workgroup reductions ───
// Tree sums in a fixed order. Every invocation of the workgroup must call them, with the
// workgroup's size; each returns the total to every invocation.

var<workgroup> red4: array<vec4<f32>, 256>;
var<workgroup> redRef: array<vec2<f32>, 256>;

fn reduce4(lid: u32, v: vec4<f32>, size: u32) -> vec4<f32> {
    red4[lid] = v;
    workgroupBarrier();
    for (var s = size >> 1u; s > 0u; s >>= 1u) {
        if (lid < s) { red4[lid] += red4[lid + s]; }
        workgroupBarrier();
    }
    let total = red4[0];
    workgroupBarrier();
    return total;
}

/** The heavier of two reference candidates (mass, index; none is (0, −1)), ties to the lower index */
fn heavier(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    if (b.y < 0.0) { return a; }
    if (a.y < 0.0 || b.x > a.x || (b.x == a.x && b.y < a.y)) { return b; }
    return a;
}

fn reduceHeaviest(lid: u32, v: vec2<f32>, size: u32) -> vec2<f32> {
    redRef[lid] = v;
    workgroupBarrier();
    for (var s = size >> 1u; s > 0u; s >>= 1u) {
        if (lid < s) { redRef[lid] = heavier(redRef[lid], redRef[lid + s]); }
        workgroupBarrier();
    }
    let best = redRef[0];
    workgroupBarrier();
    return best;
}

// Particle-field interaction energy of one body (PQS interpolation): Higgs, axion
fn particleFieldEnergy(p: ParticleState, FGRID: u32, higgsOn: bool, axionOn: bool,
                       coulOn: bool, yukOn: bool) -> vec2<f32> {
    let cellW = params.domainW / f32(FGRID);
    let cellH = params.domainH / f32(FGRID);
    let invCellW = 1.0 / cellW;
    let invCellH = 1.0 / cellH;
    // PQS grid coords
    let gx = p.posX * invCellW - 0.5;
    let gy = p.posY * invCellH - 0.5;
    let ix0 = i32(floor(gx));
    let iy0 = i32(floor(gy));
    let fx = gx - f32(ix0);
    let fy = gy - f32(iy0);

    // PQS (cubic B-spline) weights
    var wx: array<f32, 4>;
    var wy: array<f32, 4>;
    let fx2 = fx * fx; let fx3 = fx2 * fx;
    wx[0] = (1.0 - 3.0*fx + 3.0*fx2 - fx3) / 6.0;
    wx[1] = (4.0 - 6.0*fx2 + 3.0*fx3) / 6.0;
    wx[2] = (1.0 + 3.0*fx + 3.0*fx2 - 3.0*fx3) / 6.0;
    wx[3] = fx3 / 6.0;
    let fy2 = fy * fy; let fy3 = fy2 * fy;
    wy[0] = (1.0 - 3.0*fy + 3.0*fy2 - fy3) / 6.0;
    wy[1] = (4.0 - 6.0*fy2 + 3.0*fy3) / 6.0;
    wy[2] = (1.0 + 3.0*fy + 3.0*fy2 - 3.0*fy3) / 6.0;
    wy[3] = fy3 / 6.0;

    // Interpolate field values
    var higgsVal: f32 = 0.0;
    var axionVal: f32 = 0.0;
    for (var dy = 0; dy < 4; dy++) {
        let ny = clamp(iy0 + dy - 1, 0, i32(FGRID) - 1);
        let wwy = wy[dy];
        for (var dx = 0; dx < 4; dx++) {
            let nx = clamp(ix0 + dx - 1, 0, i32(FGRID) - 1);
            let w = wx[dx] * wwy;
            let ci = u32(ny) * FGRID + u32(nx);
            if (higgsOn) { higgsVal += higgsField[ci] * w; }
            if (axionOn) { axionVal += axionField[ci] * w; }
        }
    }

    var e = vec2(0.0);
    // Higgs PFI: -baseMass * (|phi| - 1)
    if (higgsOn) {
        e.x -= p.baseMass * (abs(higgsVal) - 1.0);
    }
    // Axion PFI: -g*q²*a (EM channel) - g*m*sign*a (PQ channel)
    if (axionOn) {
        let isAnti = (p.flags & FLAG_ANTIMATTER) != 0u;
        if (coulOn) {
            e.y -= AXION_COUPLING * p.charge * p.charge * axionVal;
        }
        if (yukOn) {
            let sign = select(1.0, -1.0, isAnti);
            e.y -= AXION_COUPLING * p.mass * sign * axionVal;
        }
    }
    return e;
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry 1: statsBodies — a body a thread: KE, momentum, mass moments, angular momentum about
// the workgroup's centre of mass, spin, the particle-field interaction, the reference body
// ═══════════════════════════════════════════════════════════════════════════

const BODY_WG: u32 = 64u;

@compute @workgroup_size(BODY_WG)
fn statsBodies(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let n = params.aliveCount;
    let i = wid.x * BODY_WG + lid;
    let relOn = toggle(RELATIVITY_BIT);
    // Without Relativity, EIH's kinetic energy carries its ⅜mv⁴ (statsPE)
    let eihKinetic = !relOn && toggle(ONE_PN_BIT) && toggle(GRAVITOMAG_BIT);
    let holes = toggle(BLACK_HOLE_BIT);
    let higgsOn = toggle(HIGGS_BIT);
    let axionOn = toggle(AXION_BIT);
    let FGRID = params.fieldGridRes;
    let pfiOn = (higgsOn || axionOn) && FGRID > 0u;

    var kin = vec4(0.0);     // linearKE, spinKE, px, py
    var mom = vec4(0.0);     // M, Σmx, Σmy, spin L
    var pfi = vec2(0.0);     // Higgs, axion
    var best = vec2(0.0, -1.0);
    var alive = false;
    var pos = vec2(0.0);
    if (i < n) {
        let p = particles[i];
        if ((p.flags & FLAG_ALIVE) != 0u) {
            alive = true;
            let d = derived[i];
            let m = p.mass;
            if (relOn) {
                let wSq = p.velWX * p.velWX + p.velWY * p.velWY;
                let gamma = sqrt(1.0 + wSq);
                kin.x = wSq / (gamma + 1.0) * m;
                let srSq = p.angW * p.angW * d.bodyRSq;
                let gammaRot = sqrt(1.0 + srSq);
                kin.y = INERTIA_K * m * srSq / (gammaRot + 1.0);
            } else {
                let vSq = d.velX * d.velX + d.velY * d.velY;
                kin.x = 0.5 * m * vSq;
                if (eihKinetic) { kin.x += 0.375 * m * vSq * vSq; }
                kin.y = 0.5 * INERTIA_K * m * d.bodyRSq * d.angVel * d.angVel;
            }
            // A hole's mass is its whole energy, its rotation included (Kerr), so its spin
            // adds no kinetic energy of its own
            if (holes) { kin.y = 0.0; }
            kin.z = m * p.velWX;
            kin.w = m * p.velWY;
            mom = vec4(m, m * p.posX, m * p.posY, INERTIA_K * m * d.bodyRSq * p.angW);
            pos = vec2(p.posX, p.posY);
            if (pfiOn) {
                pfi = particleFieldEnergy(p, FGRID, higgsOn, axionOn, toggle(COULOMB_BIT), toggle(YUKAWA_BIT));
            }
            if (i32(i) != params.selectedIdx && m > 0.0) { best = vec2(m, f32(i)); }
        }
    }

    let kinT = reduce4(lid, kin, BODY_WG);
    let momT = reduce4(lid, mom, BODY_WG);
    // Orbital angular momentum about this workgroup's centre of mass; statsReduce moves it
    var c = vec2(momT.y, momT.z);
    if (momT.x > 0.0) { c /= momT.x; }
    var orb = 0.0;
    if (alive) { orb = (pos.x - c.x) * kin.w - (pos.y - c.y) * kin.z; }
    let restT = reduce4(lid, vec4(pfi, orb, 0.0), BODY_WG);
    let refT = reduceHeaviest(lid, best, BODY_WG);

    if (lid == 0u) {
        let b = STATS_BODY_PART + wid.x * 16u;
        stats[b] = kinT.x;       stats[b + 1u] = kinT.y;
        stats[b + 2u] = kinT.z;  stats[b + 3u] = kinT.w;
        stats[b + 4u] = momT.x;  stats[b + 5u] = momT.y;
        stats[b + 6u] = momT.z;  stats[b + 7u] = momT.w;
        stats[b + 8u] = restT.x; stats[b + 9u] = restT.y;
        stats[b + 10u] = restT.z;
        stats[b + 11u] = refT.x; stats[b + 12u] = refT.y;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry 2: statsPE — O(N²) pairwise PE, the velocity-dependent energies, Darwin momentum
// Each workgroup takes PE_OBSERVERS rows i, PE_LANES threads to a row, over the pairs j > i;
// the sources pass through shared memory PE_TILE at a time.
// ═══════════════════════════════════════════════════════════════════════════

const PE_OBSERVERS: u32 = OBSERVERS_PER_GROUP;
const PE_LANES: u32 = 256u / PE_OBSERVERS;
const PE_WG: u32 = PE_OBSERVERS * PE_LANES;
const PE_TILE: u32 = 128u;   // at most PE_WG

struct PEBody {
    posX: f32, posY: f32, mass: f32, charge: f32,
    velX: f32, velY: f32, angVel: f32, angMomentum: f32,
    magMoment: f32,
    alive: u32,
};

var<workgroup> peTile: array<PEBody, PE_TILE>;

fn loadPEBody(i: u32, n: u32) -> PEBody {
    var b: PEBody;
    if (i >= n) { return b; }
    let p = particles[i];
    if ((p.flags & FLAG_ALIVE) == 0u) { return b; }
    let d = derived[i];
    b.posX = p.posX;          b.posY = p.posY;
    b.mass = p.mass;          b.charge = p.charge;
    b.velX = d.velX;          b.velY = d.velY;
    b.angVel = d.angVel;      b.angMomentum = d.angMomentum;
    b.magMoment = d.magMoment;
    b.alive = 1u;
    return b;
}

@compute @workgroup_size(PE_WG)
fn statsPE(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let n = params.aliveCount;
    let gravOn = toggle(GRAVITY_BIT);
    let coulOn = toggle(COULOMB_BIT);
    let magOn = toggle(MAGNETIC_BIT);
    let gmOn = toggle(GRAVITOMAG_BIT);
    let onePNOn = toggle(ONE_PN_BIT);
    let yukOn = toggle(YUKAWA_BIT);
    let bhOn = toggle(BLACK_HOLE_BIT);
    let softeningSq = select(SOFTENING_SQ, BH_SOFTENING_SQ, bhOn);
    let yukMu = params.yukawaMu;

    let relOn = toggle(RELATIVITY_BIT);
    let darwinOn = relOn && coulOn;
    let eihOn = onePNOn && gmOn;
    // EIH's ⅜mv⁴ is in statsBodies' kinetic energy without Relativity; it redshifts as v⁴
    let eihKinetic = eihOn && !relOn;

    let lane = lid / PE_OBSERVERS;
    let i = wid.x * PE_OBSERVERS + lid % PE_OBSERVERS;
    let pi = loadPEBody(i, n);
    let rowAlive = pi.alive != 0u;

    var pe: f32 = 0.0;
    // dE/d(ln a) of the interaction energies for a uniform stretch, peculiar velocities ∝ 1/a:
    // d·∂V/∂d for a static potential, and two more powers of 1/a for each v² factor
    var peScale: f32 = 0.0;
    var darwinE: f32 = 0.0;
    var darwinPx: f32 = 0.0;
    var darwinPy: f32 = 0.0;

    if (rowAlive && lane == 0u && eihKinetic) {
        let viSq = pi.velX * pi.velX + pi.velY * pi.velY;
        peScale -= 1.5 * pi.mass * viSq * viSq;
    }

    // The first source any row here pairs with is the workgroup's first row + 1
    for (var t0 = (wid.x * PE_OBSERVERS + 1u) / PE_TILE * PE_TILE; t0 < n; t0 += PE_TILE) {
        if (lid < PE_TILE) { peTile[lid] = loadPEBody(t0 + lid, n); }
        workgroupBarrier();
        for (var k = lane; rowAlive && k < PE_TILE; k += PE_LANES) {
            let j = t0 + k;
            if (j <= i) { continue; }
            let pj = peTile[k];
            if (pj.alive == 0u) { continue; }

            var dx = pj.posX - pi.posX;
            var dy = pj.posY - pi.posY;
            if (params.boundaryMode == BOUND_LOOP) {
                let mi = fullMinImageP(pi.posX, pi.posY, pj.posX, pj.posY,
                                       params.domainW, params.domainH, params.topologyMode);
                dx = mi.x; dy = mi.y;
            }
            let rawRSq = dx * dx + dy * dy;
            let rSq = rawRSq + softeningSq;
            let invR = 1.0 / sqrt(rSq);
            let r = rSq * invR; // = sqrt(rSq)
            let invR3 = invR * invR * invR;
            let rx = dx * invR;
            let ry = dy * invR;
            // d·∂/∂d of a (d² + ε²)^(−n/2) potential is −n·V·d²/(d² + ε²)
            let stretch = rawRSq * invR * invR;

            // Gravity PE
            if (gravOn) {
                if (bhOn) {
                    let invPi = bhInvPotential(rawRSq, pi.mass, pi.charge, pi.angMomentum);
                    let invPj = bhInvPotential(rawRSq, pj.mass, pj.charge, pj.angMomentum);
                    pe -= 0.5 * pi.mass * pj.mass * (invPi + invPj);
                    peScale += 0.5 * pi.mass * pj.mass * (invPi + invPj) * stretch;
                } else {
                    pe -= pi.mass * pj.mass * invR;
                    peScale += pi.mass * pj.mass * invR * stretch;
                }
            }

            // Coulomb PE
            if (coulOn) {
                let v = pi.charge * pj.charge * invR;
                pe += v;
                peScale -= v * stretch;
            }

            // Magnetic dipole PE
            if (magOn) {
                let v = pi.magMoment * pj.magMoment * invR3;
                pe += v;
                peScale -= 3.0 * v * stretch;
            }

            // GM dipole PE
            if (gmOn) {
                let v = -pi.angMomentum * pj.angMomentum * invR3;
                pe += v;
                peScale -= 3.0 * v * stretch;
            }

            // ─── Velocity-dependent energies ───
            // Each is the conserved energy of the force as applied, E = Σ v·∂L/∂v − L of its
            // Lagrangian: a term of degree 2 in the velocities enters as +L, a static one as −L.
            // The magnetic and gravitomagnetic Lorentz forces do no work, so without Relativity
            // or 1PN the energy is T + V alone. n̂ = r/r with the forces' softened r.
            let viSq = pi.velX * pi.velX + pi.velY * pi.velY;
            let vjSq = pj.velX * pj.velX + pj.velY * pj.velY;
            let viDotVj = pi.velX * pj.velX + pi.velY * pj.velY;
            let viDotN = pi.velX * rx + pi.velY * ry;
            let vjDotN = pj.velX * rx + pj.velY * ry;

            // Darwin (Relativity + Coulomb): Liénard–Wiechert's field about the present position
            // is Darwin's to O(v²), so E = T + V + L_D with L_D = (q₁q₂/2r)[v₁·v₂ + (n̂·v₁)(n̂·v₂)],
            // whether or not the bodies feel B (it does no work, and the induction field's
            // source-acceleration terms cancel in dE/dt identically). The field momentum
            // q₁A₂(x₁) + q₂A₁(x₂) goes with it.
            if (darwinOn) {
                let qqInvR = pi.charge * pj.charge * invR;
                let e2 = 0.5 * qqInvR * (viDotVj + viDotN * vjDotN);
                darwinE += e2;
                peScale -= (stretch + 2.0) * e2;
                let sumVx = pi.velX + pj.velX;
                let sumVy = pi.velY + pj.velY;
                let svDotN = sumVx * rx + sumVy * ry;
                darwinPx += 0.5 * qqInvR * (sumVx + rx * svDotN);
                darwinPy += 0.5 * qqInvR * (sumVy + ry * svDotN);
            }

            // EIH (Gravitomagnetic + 1PN): Newton, the 4m v × Bg rotation and shared-1pn.wgsl's
            // remainder are harmonic-gauge EIH together, whose energy is
            // (m₁m₂/2r)[3(v₁² + v₂²) − 7v₁·v₂ − (n̂·v₁)(n̂·v₂)] + m₁m₂(m₁ + m₂)/(2r²) beyond
            // Newton, with Σ⅜mv⁴ in the kinetic energy ((γ − 1)m carries it with Relativity on)
            if (eihOn) {
                let mmInvR = pi.mass * pj.mass * invR;
                let e2 = 0.5 * mmInvR * (3.0 * (viSq + vjSq) - 7.0 * viDotVj - viDotN * vjDotN);
                let e0 = 0.5 * mmInvR * invR * (pi.mass + pj.mass);
                pe += e2 + e0;
                peScale -= (stretch + 2.0) * e2 + 2.0 * stretch * e0;
            }

            // Bažański's static Gq² term (Gravitomagnetic + Coulomb + 1PN): the test charge in
            // Reissner–Nordström (harmonic r = R − M), symmetrized,
            // L = [q₁q₂(m₁ + m₂) − ½(m₁q₂² + m₂q₁²)]/r². With EIH's static term this vanishes
            // for extremal like charges q = m at rest, the Majumdar–Papapetrou balance.
            if (eihOn && coulOn) {
                let e0 = (0.5 * (pi.mass * pj.charge * pj.charge + pj.mass * pi.charge * pi.charge)
                    - pi.charge * pj.charge * (pi.mass + pj.mass)) * invR * invR;
                pe += e0;
                peScale -= 2.0 * stretch * e0;
            }

            // Yukawa PE
            if (yukOn) {
                let mur = yukMu * r;
                if (mur < 6.0) {
                    let yukPE = -YUKAWA_COUPLING * pi.mass * pj.mass * exp(-mur) * invR;
                    pe += yukPE;
                    peScale -= yukPE * (1.0 + mur) * stretch;
                    // Scalar Breit (Yukawa + 1PN), from shared-1pn.wgsl's Lagrangian
                    // L = (K e^{−μr}/r)[1 + ½(−v₁² − v₂² + v₁·v₂ − α(n̂·v₁)(n̂·v₂))], α = 1 + μr
                    if (onePNOn) {
                        let nn = viDotN * vjDotN;
                        let e2 = -0.5 * yukPE * (-viSq - vjSq + viDotVj - (1.0 + mur) * nn);
                        pe += e2;
                        // α = 1 + μr stretches too
                        peScale -= ((1.0 + mur) * stretch + 2.0) * e2 - 0.5 * yukPE * mur * stretch * nn;
                    }
                }
            }
        }
        workgroupBarrier();
    }

    let sumA = reduce4(lid, vec4(pe, peScale, darwinE, darwinPx), PE_WG);
    let sumB = reduce4(lid, vec4(darwinPy, 0.0, 0.0, 0.0), PE_WG);
    if (lid == 0u) {
        let b = STATS_PE_PART + wid.x * 8u;
        stats[b] = sumA.x;      stats[b + 1u] = sumA.y;
        stats[b + 2u] = sumA.z; stats[b + 3u] = sumA.w;
        stats[b + 4u] = sumB.x;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry 3: statsField — Scalar field energy + momentum, a cell a thread
// Dispatched only with Higgs or axion on (statsReduce reads it under the same test).
// ═══════════════════════════════════════════════════════════════════════════

const FLD_WG: u32 = 256u;

@compute @workgroup_size(FLD_WG)
fn statsField(@builtin(global_invocation_id) gid: vec3u, @builtin(workgroup_id) wid: vec3u,
              @builtin(local_invocation_index) lid: u32) {
    let higgsOn = toggle(HIGGS_BIT);
    let axionOn = toggle(AXION_BIT);
    let FGRID = params.fieldGridRes;
    let FGRID_SQ = FGRID * FGRID;

    var localHiggsE: f32 = 0.0;
    var localAxionE: f32 = 0.0;
    var localFmx: f32 = 0.0;
    var localFmy: f32 = 0.0;

    if ((higgsOn || axionOn) && FGRID > 0u) {
        let cellW = params.domainW / f32(FGRID);
        let cellH = params.domainH / f32(FGRID);
        let cellArea = cellW * cellH;
        let invCellWSq = 1.0 / (cellW * cellW);
        let invCellHSq = 1.0 / (cellH * cellH);
        let mH = params.higgsMass;
        let muSqH = 0.5 * mH * mH;
        let vacOffsetH = 0.25 * muSqH;
        let mA = params.axionMass;
        let mASq = mA * mA;
        let scaleX = cellH * 0.5;
        let scaleY = cellW * 0.5;

        // A cell a thread (strided, should the grid outgrow the dispatch)
        for (var idx = gid.x; idx < FGRID_SQ; idx += STATS_FIELD_GROUPS * FLD_WG) {
            let ix = idx % FGRID;
            let iy = idx / FGRID;
            let ixp = min(ix + 1u, FGRID - 1u);
            let iyp = min(iy + 1u, FGRID - 1u);
            let ixm = select(ix - 1u, 0u, ix == 0u);
            let iym = select(iy - 1u, 0u, iy == 0u);

            // Higgs field energy
            if (higgsOn) {
                let phi = higgsField[idx];
                let phiDot = higgsFieldDot[idx];
                let dfx = higgsField[iyp * FGRID + ix] - higgsField[iym * FGRID + ix];
                let dfy = higgsField[iy * FGRID + ixp] - higgsField[iy * FGRID + ixm];
                let ke = 0.5 * phiDot * phiDot;
                let grad = 0.5 * (dfx * dfx * invCellHSq + dfy * dfy * invCellWSq) * 0.25;
                let pot = muSqH * (-0.5 * phi * phi + 0.25 * phi * phi * phi * phi) + vacOffsetH;
                localHiggsE += (ke + grad + pot) * cellArea;
                localFmx -= phiDot * dfy * scaleX;
                localFmy -= phiDot * dfx * scaleY;
            }

            // Axion field energy
            if (axionOn) {
                let a = axionField[idx];
                let aDot = axionFieldDot[idx];
                let dfx = axionField[iyp * FGRID + ix] - axionField[iym * FGRID + ix];
                let dfy = axionField[iy * FGRID + ixp] - axionField[iy * FGRID + ixm];
                let ke = 0.5 * aDot * aDot;
                let grad = 0.5 * (dfx * dfx * invCellHSq + dfy * dfy * invCellWSq) * 0.25;
                let pot = 0.5 * mASq * a * a;
                localAxionE += (ke + grad + pot) * cellArea;
                localFmx -= aDot * dfy * scaleX;
                localFmy -= aDot * dfx * scaleY;
            }

            // Portal coupling energy: ½λφ²a² (counted in Higgs to match CPU)
            if (higgsOn && axionOn) {
                let phi = higgsField[idx];
                let a = axionField[idx];
                localHiggsE += 0.5 * HIGGS_AXION_COUPLING * phi * phi * a * a * cellArea;
            }
        }
    }

    let total = reduce4(lid, vec4(localHiggsE, localAxionE, localFmx, localFmy), FLD_WG);
    if (lid == 0u) {
        let b = STATS_FIELD_PART + wid.x * 4u;
        stats[b] = total.x;      stats[b + 1u] = total.y;
        stats[b + 2u] = total.z; stats[b + 3u] = total.w;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry 4: statsReduce — the partials in a fixed order, then the selected particle and the
// reference body. One workgroup, after every other stats pass (statsBosons included).
// ═══════════════════════════════════════════════════════════════════════════

const RED_WG: u32 = 256u;

@compute @workgroup_size(RED_WG)
fn statsReduce(@builtin(local_invocation_index) lid: u32) {
    let n = params.aliveCount;
    let bodyGroups = (n + BODY_WG - 1u) / BODY_WG;
    let peGroups = (n + PE_OBSERVERS - 1u) / PE_OBSERVERS;
    let fieldsOn = (toggle(HIGGS_BIT) || toggle(AXION_BIT)) && params.fieldGridRes > 0u;
    let fieldGroups = select(0u, STATS_FIELD_GROUPS, fieldsOn);

    // ─── Bodies ───
    var kin = vec4(0.0);     // linearKE, spinKE, px, py
    var mom = vec4(0.0);     // M, Σmx, Σmy, spin L
    var pfi = vec2(0.0);
    var best = vec2(0.0, -1.0);
    for (var g = lid; g < bodyGroups; g += RED_WG) {
        let b = STATS_BODY_PART + g * 16u;
        kin += vec4(stats[b], stats[b + 1u], stats[b + 2u], stats[b + 3u]);
        mom += vec4(stats[b + 4u], stats[b + 5u], stats[b + 6u], stats[b + 7u]);
        pfi += vec2(stats[b + 8u], stats[b + 9u]);
        best = heavier(best, vec2(stats[b + 11u], stats[b + 12u]));
    }
    // ─── Pairs ───
    var peA = vec4(0.0);     // pe, peScale, darwinE, darwinPx
    var darwinPy = 0.0;
    for (var g = lid; g < peGroups; g += RED_WG) {
        let b = STATS_PE_PART + g * 8u;
        peA += vec4(stats[b], stats[b + 1u], stats[b + 2u], stats[b + 3u]);
        darwinPy += stats[b + 4u];
    }
    // ─── Fields ───
    var fld = vec4(0.0);     // higgsE, axionE, fieldMomX, fieldMomY
    for (var g = lid; g < fieldGroups; g += RED_WG) {
        let b = STATS_FIELD_PART + g * 4u;
        fld += vec4(stats[b], stats[b + 1u], stats[b + 2u], stats[b + 3u]);
    }
    // ─── Bosons and pending radiation (boson-ledger.wgsl) ───
    var ph = vec4(0.0);
    var pn = vec4(0.0);
    var pending = 0.0;
    for (var g = lid; g < STATS_LEDGER_GROUPS; g += RED_WG) {
        let b = STATS_LEDGER_PART + g * 8u;
        ph += vec4(stats[b], stats[b + 1u], stats[b + 2u], 0.0);
        pn += vec4(stats[b + 3u], stats[b + 4u], stats[b + 5u], 0.0);
        pending += stats[b + 6u];
    }

    let kinT = reduce4(lid, kin, RED_WG);
    let momT = reduce4(lid, mom, RED_WG);
    let peT = reduce4(lid, peA, RED_WG);
    let miscT = reduce4(lid, vec4(darwinPy, pfi, pending), RED_WG);
    let fldT = reduce4(lid, fld, RED_WG);
    let phT = reduce4(lid, ph, RED_WG);
    let pnT = reduce4(lid, pn, RED_WG);
    let refT = reduceHeaviest(lid, best, RED_WG);

    // Orbital angular momentum about the centre of mass: each workgroup's about its own, plus
    // its momentum at its centre of mass about the total's
    let tm = momT.x;
    var com = vec2(momT.y, momT.z);
    if (tm > 0.0) { com /= tm; }
    var orb = 0.0;
    for (var g = lid; g < bodyGroups; g += RED_WG) {
        let b = STATS_BODY_PART + g * 16u;
        let mg = stats[b + 4u];
        if (mg > 0.0) {
            let cg = vec2(stats[b + 5u], stats[b + 6u]) / mg;
            orb += stats[b + 10u] + (cg.x - com.x) * stats[b + 3u] - (cg.y - com.y) * stats[b + 2u];
        }
    }
    let orbT = reduce4(lid, vec4(orb, 0.0, 0.0, 0.0), RED_WG);

    if (lid != 0u) { return; }
    stats[0] = kinT.x;  stats[1] = kinT.y;
    stats[2] = kinT.z;  stats[3] = kinT.w;
    stats[4] = orbT.x;  stats[5] = momT.w;
    stats[6] = com.x;   stats[7] = com.y;
    stats[8] = tm;      stats[9] = f32(n);
    stats[10] = peT.x;  stats[26] = peT.y;
    stats[11] = peT.z;  stats[12] = peT.w;  stats[13] = miscT.x;
    stats[14] = fldT.x; stats[15] = fldT.y;
    stats[16] = miscT.y; stats[17] = miscT.z;
    stats[18] = fldT.z; stats[19] = fldT.w;
    stats[20] = phT.x;  stats[21] = phT.y;  stats[22] = phT.z;
    stats[23] = pnT.x;  stats[24] = pnT.y;  stats[25] = pnT.z;
    stats[27] = miscT.w;

    // ─── Selected particle data (offset 32) ───
    let selIdx = params.selectedIdx;
    if (selIdx >= 0 && u32(selIdx) < n) {
        let si = u32(selIdx);
        let p = particles[si];
        let d = derived[si];
        let af = forces[si];
        stats[32] = p.posX;    stats[33] = p.posY;
        stats[34] = p.velWX;   stats[35] = p.velWY;
        stats[36] = p.mass;    stats[37] = p.charge;
        stats[38] = p.angW;    stats[39] = p.baseMass;
        stats[40] = bitcast<f32>(p.flags);
        stats[41] = sqrt(d.radiusSq);
        stats[42] = d.velX;    stats[43] = d.velY;
        stats[44] = d.angVel;
        stats[45] = d.magMoment;
        stats[46] = d.angMomentum;
        stats[47] = select(0.0, 1.0, (p.flags & FLAG_ANTIMATTER) != 0u);
        stats[48] = af.f0.x; stats[49] = af.f0.y;
        stats[50] = af.f0.z; stats[51] = af.f0.w;
        stats[52] = af.f1.x; stats[53] = af.f1.y;
        stats[54] = af.f1.z; stats[55] = af.f1.w;
        stats[56] = af.f2.x; stats[57] = af.f2.y;
        stats[58] = af.f2.z; stats[59] = af.f2.w;
        stats[60] = af.f3.x; stats[61] = af.f3.y;
        stats[62] = af.f3.z; stats[63] = af.f3.w;
        stats[64] = af.f4.x; stats[65] = af.f4.y;
        stats[66] = af.f4.z; stats[67] = af.f4.w;
        stats[68] = af.f5.x; stats[69] = af.f5.y;
        let clk = clocks[si];
        stats[73] = clk.x; stats[74] = clk.w; stats[75] = clk.z;   // τ, dτ/dt, θ
    } else {
        stats[36] = -1.0; // mass = -1 signals no selected particle
    }

    // ─── Reference body (offset 80): the heaviest alive particle other than the selected ───
    // one, which the phase plot and effective potential measure against; ties to the lower slot
    if (refT.y >= 0.0) {
        let ri = u32(refT.y);
        let p = particles[ri];
        let d = derived[ri];
        stats[80] = p.posX;  stats[81] = p.posY;
        stats[82] = d.velX;  stats[83] = d.velY;
        stats[84] = p.mass;  stats[85] = p.charge;
        stats[86] = d.angVel;
        stats[87] = d.magMoment;
        stats[88] = d.angMomentum;
        stats[89] = sqrt(d.radiusSq);
        stats[91] = bitcast<f32>(ri);
    } else {
        stats[84] = -1.0; // no reference body
    }
}
