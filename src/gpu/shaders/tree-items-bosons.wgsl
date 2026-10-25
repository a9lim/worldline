// The bosons as tree items (tree-build.wgsl): the photon pool's live entries, then the pion
// and lepton pool's, item i < phCount the photon i and the rest pion i − phCount. A photon
// weighs its energy; a pion or lepton m·γ and carries its charge. A leaf names its boson as
// the photon's index, or the pion's with BOSON_PION_TAG, since passes after the build add
// photons (annihilation) and the split moves.

// Group 1: the pools and their counts (read_write for encoder compat)
@group(1) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(1) @binding(1) var<storage, read_write> phCount: array<u32>;
@group(1) @binding(2) var<storage, read_write> pions: array<Pion>;
@group(1) @binding(3) var<storage, read_write> piCount: array<u32>;

/** What a leaf weighs and carries. */
struct Leaf {
    mass: f32,
    charge: f32,
    magMoment: f32,
    angMomentum: f32,
    momentum: vec2<f32>,
    radius: f32,        // the body's (its horizon in black-hole mode); the walks prune by it
};

fn photonsLive() -> u32 { return min(phCount[0], MAX_PHOTONS); }

fn itemSlots() -> u32 { return photonsLive() + min(piCount[0], PION_POOL_CAP); }

fn itemActive(i: u32) -> bool {
    let phN = photonsLive();
    if (i < phN) { return (photons[i].flags & 1u) != 0u; }
    return (pions[i - phN].flags & 1u) != 0u;
}

fn itemPos(i: u32) -> vec2<f32> {
    let phN = photonsLive();
    if (i < phN) { return vec2(photons[i].posX, photons[i].posY); }
    return vec2(pions[i - phN].posX, pions[i - phN].posY);
}

fn itemId(i: u32) -> u32 {
    let phN = photonsLive();
    return select(i, BOSON_PION_TAG | (i - phN), i >= phN);
}

fn itemLeaf(i: u32) -> Leaf {
    var l: Leaf;
    let phN = photonsLive();
    if (i < phN) {
        l.mass = photons[i].energy;
        return l;
    }
    let p = pions[i - phN];
    l.mass = p.mass * sqrt(1.0 + p.wX * p.wX + p.wY * p.wY);
    l.charge = p.charge;
    return l;
}
