// The bodies as tree items (tree-build.wgsl): the alive slots and their ghosts, and the
// retired slots still sourcing forces through signal delay, up to uniforms.particleCount.

// Group 1: packed particle state + derived + aux (read_write for encoder compat)
@group(1) @binding(0) var<storage, read_write> particleState: array<ParticleState>;
@group(1) @binding(1) var<storage, read_write> derived_in: array<ParticleDerived>;
@group(1) @binding(2) var<storage, read_write> particleAux: array<ParticleAux>;

/** What a leaf weighs and carries. */
struct Leaf {
    mass: f32,
    charge: f32,
    magMoment: f32,
    angMomentum: f32,
    momentum: vec2<f32>,
    radius: f32,        // the body's (its horizon in black-hole mode); the walks prune by it
};

fn itemSlots() -> u32 { return uniforms.particleCount; }

fn itemActive(i: u32) -> bool {
    let flags = particleState[i].flags;
    let aliveOrGhost = (flags & (FLAG_ALIVE | FLAG_GHOST)) != 0u;
    let retired = (flags & FLAG_RETIRED) != 0u && (flags & FLAG_ALIVE) == 0u;
    return aliveOrGhost || retired;
}

fn itemPos(i: u32) -> vec2<f32> { return vec2(particleState[i].posX, particleState[i].posY); }

fn itemLeaf(i: u32) -> Leaf {
    let ps = particleState[i];
    var l: Leaf;
    if ((ps.flags & FLAG_GHOST) != 0u) {
        // Ghosts stay in the tree for seam collisions and hit tests, but weigh nothing:
        // every tree walk takes minimum-image displacements, so the original already
        // supplies the nearest image and a weighted ghost would count the pair twice.
        l.radius = particleAux[i].radius;
        return l;
    }
    if ((ps.flags & FLAG_ALIVE) == 0u) {
        // Retired particles weigh their death mass and spin (their mass is zeroed on merge)
        let aux = particleAux[i];
        let m = aux.deathMass;
        let bodyRadSq = pow(m, 2.0 / 3.0);
        let dAngW = aux.deathAngVel;
        let dAngVel = dAngW / sqrt(1.0 + dAngW * dAngW * bodyRadSq);
        l.mass = m;
        l.charge = ps.charge;
        l.magMoment = MAG_MOMENT_K * ps.charge * dAngVel * bodyRadSq;
        l.angMomentum = INERTIA_K * m * dAngVel * bodyRadSq;
        return l;
    }
    let drvd = derived_in[i];
    l.radius = particleAux[i].radius;
    l.mass = ps.mass;
    l.charge = ps.charge;
    l.magMoment = drvd.magMoment;
    l.angMomentum = drvd.angMomentum;
    l.momentum = ps.mass * vec2(ps.velWX, ps.velWY);
    return l;
}
