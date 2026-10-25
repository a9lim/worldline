// ─── GPU Quadtree Build: sorted, deterministic ───
// A quadtree over a set of items: the bodies (alive, retired, and ghosts), which the
// Barnes–Hut walk, collisions, hit tests, the heatmap and boson absorption read, or the
// bosons, which boson gravity, pion Coulomb and kugelblitz read (node layout below, read-only
// accessors in shared-tree-nodes.wgsl). The items come from an include prepended to this
// file, tree-items-bodies.wgsl or tree-items-bosons.wgsl, which binds group 1 and defines
// itemSlots(), itemActive(i), itemPos(i) and itemLeaf(i). Built from sorted Morton codes, so
// the tree depends only on the positions, never on thread timing:
//   1. computeBounds    parallel min/max reduction (fixed-point atomics)
//   2. initRoot         one thread: the padded root box
//   3. mortonKeys       one thread per item slot: (Morton code, slot), or (NO_KEY, slot)
//   4. sortLocal        bitonic sort of each block of SORT_BLOCK keys in workgroup memory;
//      sortGlobal       the network's steps wider than a block, one dispatch each;
//      sortMerge        then the steps within a block, for one width k (both after k > block)
//   5. radixBuild       one thread per internal node of the binary radix tree (Karras 2012)
//   6. quadLink         one thread per binary node that starts a quadtree cell: its children
//   7. aggregate        one thread per item: its leaf, then up the tree, the last child to
//                       arrive at a node summing it from its children in slot order
//
// The quadtree is compressed: a cell exists where its bodies split among two or more of its
// quadrants, so a node has two to four children, at any deeper level. They fill the child
// slots in Morton order, the rest NONE; walks take children generically, and a node is a
// leaf when its first slot is NONE. Every cell a CAS-built quadtree would have and this one
// lacks holds the same bodies as a cell this one has, so Barnes–Hut sees the same aggregates.
// Internal nodes carry their cell's bounds; leaves carry their body's position as a point.
//
// Morton codes are 15 bits per axis (30 bits, y above x per level). Equal codes split by
// sorted position, as further bits below the code (Karras's tie-break), so every key is
// distinct; cells past level 15 keep the level-15 bounds.
//
// Node indices: binary internal node i is quadtree node i (only the ones that start a cell
// are used; node 0, the root, always is; the others weigh nothing and hold no bodies, for the
// kugelblitz scan over every node), and sorted item k is leaf nActive − 1 + k. With a single
// item the leaf is node 0.

// Constants provided by generated wgslConstants block.
const NONE: i32 = -1;
const NO_KEY: u32 = 0xFFFFFFFFu;
const LEAF_BIT: u32 = 0x80000000u;
const SORT_BLOCK: u32 = 1024u;
const MORTON_BITS: u32 = 15u;
const MORTON_SCALE: f32 = 32768.0;

// Fixed-point scale for atomic min/max (f32 → i32: multiply by 2^16)
const FP_SCALE: f32 = 65536.0;
const FP_INV_SCALE: f32 = 0.0000152587890625; // 1/65536

// Struct definitions (ParticleState, ParticleDerived, SimUniforms) provided by shared-structs.wgsl.

// Node layout in flat buffer: 20 u32 words per node
// [0..3]: minX, minY, maxX, maxY (as f32 reinterpreted)
// [4..5]: comX, comY
// [6]: totalMass
// [7]: totalCharge
// [8]: totalMagMoment
// [9]: totalAngMomentum
// [10]: totalMomentumX
// [11]: totalMomentumY
// [12..15]: children (i32), the first two to four used, the rest NONE
// [16]: particleIndex (i32, leaves; NONE on internal nodes)
// [17]: particleCount: items under the node (during aggregate, the arrival counter)
// [18]: parentIndex (i32)
// [19]: maxRadius: the largest body radius under the node (f32), which searches prune by

@group(0) @binding(0) var<storage, read_write> nodes: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> nActive: atomic<u32>;
// [0..3] the fixed-point reduction; [4..7] the padded root box (minX, minY, width, height)
@group(0) @binding(2) var<storage, read_write> bounds: array<atomic<i32>>;
// Children per quadtree node: how many arrivals aggregate waits for
@group(0) @binding(3) var<storage, read_write> visitorFlags: array<atomic<u32>>;

@group(2) @binding(0) var<uniform> uniforms: SimUniforms;

// Group 3: the sort and the radix tree
// keys: (Morton code, slot) pairs, M of them (a power of 2, at least SORT_BLOCK)
@group(3) @binding(0) var<storage, read_write> keys: array<vec2<u32>>;
// radix: binary internal node i at [6i, 6i + 6): left, right (LEAF_BIT on a sorted body),
// prefix length δ, first and last sorted position, parent
@group(3) @binding(1) var<storage, read_write> radix: array<u32>;
// One sort step's network width k and step j, picked by dynamic offset
struct SortParams { k: u32, j: u32, _p0: u32, _p1: u32 };
@group(3) @binding(2) var<uniform> sortParams: SortParams;

// ── Node accessors ──
const NODE_STRIDE: u32 = 20u;

fn nodeOffset(idx: u32) -> u32 { return idx * NODE_STRIDE; }

fn ldF(idx: u32, w: u32) -> f32 { return bitcast<f32>(atomicLoad(&nodes[nodeOffset(idx) + w])); }
fn stF(idx: u32, w: u32, v: f32) { atomicStore(&nodes[nodeOffset(idx) + w], bitcast<u32>(v)); }
fn ldI(idx: u32, w: u32) -> i32 { return bitcast<i32>(atomicLoad(&nodes[nodeOffset(idx) + w])); }
fn stI(idx: u32, w: u32, v: i32) { atomicStore(&nodes[nodeOffset(idx) + w], bitcast<u32>(v)); }

// ─── 1: computeBounds ───
// bounds[0..3] = (minX, minY, maxX, maxY) as fixed-point i32, reset to ±MAX before dispatch.

var<workgroup> wgMinX: atomic<i32>;
var<workgroup> wgMinY: atomic<i32>;
var<workgroup> wgMaxX: atomic<i32>;
var<workgroup> wgMaxY: atomic<i32>;

@compute @workgroup_size(256)
fn computeBounds(@builtin(global_invocation_id) gid: vec3<u32>,
                 @builtin(local_invocation_id) lid: vec3<u32>) {
    let idx = gid.x;
    let n = itemSlots();

    if (lid.x == 0u) {
        atomicStore(&wgMinX, 2147483647);
        atomicStore(&wgMinY, 2147483647);
        atomicStore(&wgMaxX, -2147483647);
        atomicStore(&wgMaxY, -2147483647);
    }
    workgroupBarrier();

    if (idx < n && itemActive(idx)) {
        let p = itemPos(idx);
        {
            let px = i32(p.x * FP_SCALE);
            let py = i32(p.y * FP_SCALE);
            atomicMin(&wgMinX, px);
            atomicMin(&wgMinY, py);
            atomicMax(&wgMaxX, px);
            atomicMax(&wgMaxY, py);
        }
    }

    workgroupBarrier();

    if (lid.x == 0u) {
        atomicMin(&bounds[0], atomicLoad(&wgMinX));
        atomicMin(&bounds[1], atomicLoad(&wgMinY));
        atomicMax(&bounds[2], atomicLoad(&wgMaxX));
        atomicMax(&bounds[3], atomicLoad(&wgMaxY));
    }
}

// ─── 2: initRoot ───
// The root box, padded by 10% and a unit like the CPU tree; nActive counts from zero.

@compute @workgroup_size(1)
fn initRoot() {
    let minX = f32(atomicLoad(&bounds[0])) * FP_INV_SCALE;
    let minY = f32(atomicLoad(&bounds[1])) * FP_INV_SCALE;
    let maxX = f32(atomicLoad(&bounds[2])) * FP_INV_SCALE;
    let maxY = f32(atomicLoad(&bounds[3])) * FP_INV_SCALE;
    let padX = (maxX - minX) * 0.1 + 1.0;
    let padY = (maxY - minY) * 0.1 + 1.0;
    atomicStore(&bounds[4], bitcast<i32>(minX - padX));
    atomicStore(&bounds[5], bitcast<i32>(minY - padY));
    atomicStore(&bounds[6], bitcast<i32>(maxX - minX + 2.0 * padX));
    atomicStore(&bounds[7], bitcast<i32>(maxY - minY + 2.0 * padY));
    atomicStore(&nActive, 0u);
}

fn rootBox() -> vec4<f32> {
    return vec4(bitcast<f32>(atomicLoad(&bounds[4])), bitcast<f32>(atomicLoad(&bounds[5])),
                bitcast<f32>(atomicLoad(&bounds[6])), bitcast<f32>(atomicLoad(&bounds[7])));
}

// ─── 3: mortonKeys ───

/** Spread the low 15 bits of v to the even bits. */
fn spreadBits(v: u32) -> u32 {
    var x = v & 0x7FFFu;
    x = (x | (x << 8u)) & 0x00FF00FFu;
    x = (x | (x << 4u)) & 0x0F0F0F0Fu;
    x = (x | (x << 2u)) & 0x33333333u;
    x = (x | (x << 1u)) & 0x55555555u;
    return x;
}

/** The even bits of v, gathered into the low bits. */
fn gatherBits(v: u32) -> u32 {
    var x = v & 0x55555555u;
    x = (x | (x >> 1u)) & 0x33333333u;
    x = (x | (x >> 2u)) & 0x0F0F0F0Fu;
    x = (x | (x >> 4u)) & 0x00FF00FFu;
    x = (x | (x >> 8u)) & 0x0000FFFFu;
    return x;
}

fn quantize(v: f32, lo: f32, size: f32) -> u32 {
    let q = (v - lo) / max(size, EPSILON) * MORTON_SCALE;
    if (!(q > 0.0)) { return 0u; }   // also NaN
    return min(u32(q), 32767u);
}

@compute @workgroup_size(256)
fn mortonKeys(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= arrayLength(&keys)) { return; }
    var k = vec2(NO_KEY, i);
    if (i < itemSlots() && itemActive(i)) {
        let p = itemPos(i);
        {
            let root = rootBox();
            let qx = quantize(p.x, root.x, root.z);
            let qy = quantize(p.y, root.y, root.w);
            k.x = (spreadBits(qy) << 1u) | spreadBits(qx);
            atomicAdd(&nActive, 1u);
        }
    }
    keys[i] = k;
}

// ─── 4: the bitonic sort, ascending by (code, slot) ───

fn keyLess(a: vec2<u32>, b: vec2<u32>) -> bool {
    return a.x < b.x || (a.x == b.x && a.y < b.y);
}

var<workgroup> block: array<vec2<u32>, SORT_BLOCK>;

/** Compare-exchange step j of width k inside the workgroup's block (base: its first index). */
fn blockStep(lid: u32, base: u32, k: u32, j: u32) {
    for (var c = lid; c < SORT_BLOCK / 2u; c += 256u) {
        let i = (c / j) * 2u * j + (c % j);
        let l = i + j;
        let up = ((base + i) & k) == 0u;
        let a = block[i];
        let b = block[l];
        if (keyLess(b, a) == up) {
            block[i] = b;
            block[l] = a;
        }
    }
    workgroupBarrier();
}

/** Sort each block whole: every width up to SORT_BLOCK. */
@compute @workgroup_size(256)
fn sortLocal(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let base = wid.x * SORT_BLOCK;
    for (var e = lid.x; e < SORT_BLOCK; e += 256u) { block[e] = keys[base + e]; }
    workgroupBarrier();
    for (var k = 2u; k <= SORT_BLOCK; k <<= 1u) {
        for (var j = k >> 1u; j > 0u; j >>= 1u) { blockStep(lid.x, base, k, j); }
    }
    for (var e = lid.x; e < SORT_BLOCK; e += 256u) { keys[base + e] = block[e]; }
}

/** One step wider than a block: j ≥ SORT_BLOCK, one compare-exchange per thread. */
@compute @workgroup_size(256)
fn sortGlobal(@builtin(global_invocation_id) gid: vec3<u32>) {
    let c = gid.x;
    let k = sortParams.k;
    let j = sortParams.j;
    if (c >= arrayLength(&keys) / 2u) { return; }
    let i = (c / j) * 2u * j + (c % j);
    let l = i + j;
    let up = (i & k) == 0u;
    let a = keys[i];
    let b = keys[l];
    if (keyLess(b, a) == up) {
        keys[i] = b;
        keys[l] = a;
    }
}

/** The steps of width k (> SORT_BLOCK) that fall within a block: j < SORT_BLOCK. */
@compute @workgroup_size(256)
fn sortMerge(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let base = wid.x * SORT_BLOCK;
    let k = sortParams.k;
    for (var e = lid.x; e < SORT_BLOCK; e += 256u) { block[e] = keys[base + e]; }
    workgroupBarrier();
    for (var j = SORT_BLOCK >> 1u; j > 0u; j >>= 1u) { blockStep(lid.x, base, k, j); }
    for (var e = lid.x; e < SORT_BLOCK; e += 256u) { keys[base + e] = block[e]; }
}

// ─── 5: radixBuild (Karras 2012, "Maximizing parallelism in the construction of BVHs,
// octrees, and k-d trees") ───

/** Common prefix length of sorted keys a and b in bits, or −1 out of range. */
fn delta(a: i32, b: i32, n: i32) -> i32 {
    if (b < 0 || b >= n) { return -1; }
    let ka = keys[u32(a)].x;
    let kb = keys[u32(b)].x;
    if (ka == kb) { return 30 + i32(countLeadingZeros(u32(a) ^ u32(b))); }
    return i32(countLeadingZeros(ka ^ kb)) - 2;
}

const R_STRIDE: u32 = 6u;

@compute @workgroup_size(256)
fn radixBuild(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(atomicLoad(&nActive));
    let i = i32(gid.x);
    if (i == 0 && n == 0) {
        // No bodies: an empty root
        for (var w = 0u; w < 12u; w++) { stF(0u, w, 0.0); }
        for (var w = 12u; w < 17u; w++) { stI(0u, w, NONE); }
        stI(0u, 17u, 0);
        stI(0u, 18u, NONE);
        return;
    }
    if (i >= n - 1) { return; }

    // Direction of the node's range from i, and its other end j
    let d = select(-1, 1, delta(i, i + 1, n) - delta(i, i - 1, n) > 0);
    let dMin = delta(i, i - d, n);
    var lMax = 2;
    while (delta(i, i + lMax * d, n) > dMin) { lMax *= 2; }
    var l = 0;
    for (var t = lMax / 2; t >= 1; t /= 2) {
        if (delta(i, i + (l + t) * d, n) > dMin) { l += t; }
    }
    let j = i + l * d;
    let dNode = delta(i, j, n);

    // The split: the last key sharing more than dNode bits with i
    var s = 0;
    var div = 2;
    loop {
        let t = (l + div - 1) / div;
        if (delta(i, i + (s + t) * d, n) > dNode) { s += t; }
        if (t <= 1) { break; }
        div *= 2;
    }
    let g = u32(i + s * d + min(d, 0));
    let first = u32(min(i, j));
    let last = u32(max(i, j));
    let leftLeaf = first == g;
    let rightLeaf = last == g + 1u;

    let b = u32(i) * R_STRIDE;
    radix[b] = select(g, g | LEAF_BIT, leftLeaf);
    radix[b + 1u] = select(g + 1u, (g + 1u) | LEAF_BIT, rightLeaf);
    radix[b + 2u] = u32(dNode);
    radix[b + 3u] = first;
    radix[b + 4u] = last;
    if (i == 0) { radix[5u] = 0xFFFFFFFFu; }
    // The internal children's parent (quadLink finds the leaves' own)
    if (!leftLeaf) { radix[g * R_STRIDE + 5u] = u32(i); }
    if (!rightLeaf) { radix[(g + 1u) * R_STRIDE + 5u] = u32(i); }
}

// ─── 6: quadLink ───

/** The quadtree level of binary internal node i: its prefix in 2-bit steps. */
fn levelOf(i: u32) -> u32 { return radix[i * R_STRIDE + 2u] / 2u; }

fn leafNode(k: u32, n: u32) -> u32 { return n - 1u + k; }

/** The node a binary child names: a leaf, or the internal node itself. */
fn childNode(c: u32, n: u32) -> u32 {
    return select(c, leafNode(c & ~LEAF_BIT, n), (c & LEAF_BIT) != 0u);
}

/** Bounds of the level-l cell (l ≤ 15) holding Morton code key. */
fn cellBounds(key: u32, l: u32) -> vec4<f32> {
    let root = rootBox();
    let lv = min(l, MORTON_BITS);
    let prefix = key >> (2u * (MORTON_BITS - lv));
    let ix = f32(gatherBits(prefix));
    let iy = f32(gatherBits(prefix >> 1u));
    let cells = f32(1u << lv);
    let w = root.z / cells;
    let h = root.w / cells;
    return vec4(root.x + ix * w, root.y + iy * h, root.x + (ix + 1.0) * w, root.y + (iy + 1.0) * h);
}

@compute @workgroup_size(256)
fn quadLink(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = atomicLoad(&nActive);
    let i = gid.x;
    if (n < 2u || i >= n - 1u) { return; }
    let lvl = levelOf(i);
    let parent = radix[i * R_STRIDE + 5u];
    // A binary node in its parent's cell is part of the parent's quadtree node; its own node
    // goes unused, and weighs nothing
    if (i != 0u && levelOf(parent) == lvl) {
        stF(i, 6u, 0.0);
        stI(i, 17u, 0);
        stF(i, 19u, 0.0);
        return;
    }

    // The cell's children: each binary child that starts a deeper cell or is a body, looking
    // through a child in this same cell to its own two (whose cells are deeper still)
    var kids: array<u32, 4>;
    var count = 0u;
    for (var side = 0u; side < 2u; side++) {
        let c = radix[i * R_STRIDE + side];
        if ((c & LEAF_BIT) == 0u && levelOf(c) == lvl) {
            kids[count] = childNode(radix[c * R_STRIDE], n);
            kids[count + 1u] = childNode(radix[c * R_STRIDE + 1u], n);
            count += 2u;
        } else {
            kids[count] = childNode(c, n);
            count += 1u;
        }
    }

    let cb = cellBounds(keys[radix[i * R_STRIDE + 3u]].x, lvl);
    stF(i, 0u, cb.x);
    stF(i, 1u, cb.y);
    stF(i, 2u, cb.z);
    stF(i, 3u, cb.w);
    for (var s = 0u; s < 4u; s++) {
        stI(i, 12u + s, select(NONE, i32(kids[s]), s < count));
        if (s < count) { stI(kids[s], 18u, i32(i)); }
    }
    stI(i, 16u, NONE);
    stI(i, 17u, 0);
    if (i == 0u) { stI(0u, 18u, NONE); }
    atomicStore(&visitorFlags[i], count);
}

// ─── 7: aggregate ───

@compute @workgroup_size(256)
fn aggregate(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = atomicLoad(&nActive);
    let k = gid.x;
    if (k >= n) { return; }
    let pIdx = keys[k].y;
    let leaf = leafNode(k, n);
    let p = itemPos(pIdx);
    let d = itemLeaf(pIdx);

    stF(leaf, 0u, p.x);
    stF(leaf, 1u, p.y);
    stF(leaf, 2u, p.x);
    stF(leaf, 3u, p.y);
    stF(leaf, 4u, p.x);
    stF(leaf, 5u, p.y);
    stF(leaf, 6u, d.mass);
    stF(leaf, 7u, d.charge);
    stF(leaf, 8u, d.magMoment);
    stF(leaf, 9u, d.angMomentum);
    stF(leaf, 10u, d.momentum.x);
    stF(leaf, 11u, d.momentum.y);
    for (var w = 12u; w < 16u; w++) { stI(leaf, w, NONE); }
    stI(leaf, 16u, i32(pIdx));
    stI(leaf, 17u, 1);
    stF(leaf, 19u, d.radius);
    if (n == 1u) { stI(leaf, 18u, NONE); }

    // Up the tree: the last child to arrive sums the node, so each node is summed once,
    // from all its children, in slot order
    var cur = select(ldI(leaf, 18u), NONE, n == 1u);
    loop {
        if (cur < 0) { break; }
        let node = u32(cur);
        let expected = atomicLoad(&visitorFlags[node]);
        let prev = atomicAdd(&nodes[nodeOffset(node) + 17u], 1u);
        if (prev + 1u < expected) { break; }

        var tm = 0.0;
        var tq = 0.0;
        var tmm = 0.0;
        var tam = 0.0;
        var tpx = 0.0;
        var tpy = 0.0;
        var cx = 0.0;
        var cy = 0.0;
        var bodies = 0u;
        var rMax = 0.0;
        for (var s = 0u; s < expected; s++) {
            let c = u32(ldI(node, 12u + s));
            let cm = ldF(c, 6u);
            tm += cm;
            tq += ldF(c, 7u);
            tmm += ldF(c, 8u);
            tam += ldF(c, 9u);
            tpx += ldF(c, 10u);
            tpy += ldF(c, 11u);
            cx += ldF(c, 4u) * cm;
            cy += ldF(c, 5u) * cm;
            bodies += atomicLoad(&nodes[nodeOffset(c) + 17u]);
            rMax = max(rMax, ldF(c, 19u));
        }
        stF(node, 19u, rMax);
        stF(node, 6u, tm);
        stF(node, 7u, tq);
        stF(node, 8u, tmm);
        stF(node, 9u, tam);
        stF(node, 10u, tpx);
        stF(node, 11u, tpy);
        // A node of weightless items (ghosts) weighs nothing; its centre is its cell's
        let invM = select(0.0, 1.0 / tm, tm > 0.0);
        stF(node, 4u, select(0.5 * (ldF(node, 0u) + ldF(node, 2u)), cx * invM, tm > 0.0));
        stF(node, 5u, select(0.5 * (ldF(node, 1u) + ldF(node, 3u)), cy * invM, tm > 0.0));
        atomicStore(&nodes[nodeOffset(node) + 17u], bodies);
        cur = ldI(node, 18u);
    }
}
