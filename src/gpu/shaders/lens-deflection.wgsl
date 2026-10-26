// ─── Gravitational lensing of the backdrop ───
// The background grid is a sheet behind the slab, seen along z through the slab's masses as
// a thin lens. Positions are physical lab coordinates in the lens plane (x = D_L·θ), so a
// point x sees the backdrop at
//   y = x − α(x),  α(x) = Σᵢ 4Mᵢ·𝒟·(x − xᵢ)/(|x − xᵢ|² + s²ᵢ),
// the gradient of the 2D log potential, with 𝒟 = D_L·D_LS/D_S the projected-distance knob
// (a lone mass's Einstein radius is R_E = √(4M𝒟)). The core s²ᵢ = 10⁻⁴·4Mᵢ𝒟 keeps a ray
// through a body finite; it makes each lens a tiny extended mass (ring radius² R_E² − s²). A sum per
// cell of a LENS_RES² map over the visible rectangle writes (αx, αy, shadow, 0); grid-render.wgsl samples it.
//
// Black holes: the weak thin-lens formula has no shadow, so cells within the photon-capture
// radius 3√3·M of a hole are flagged, an imposed and labelled disk (3.0's ray tracing would
// find it); 3√3·M is the Schwarzschild capture impact parameter, without Kerr–Newman spin or
// charge. On a periodic domain each lens sits at its image nearest one reference point (the
// view's centre, for both the map and the probe), not the nearest image per pixel: the 1/x
// deflection decays too slowly for a minimum-image seam, which would tear the backdrop.
// One image per lens is a finite-patch approximation, not periodic lensing.
//
// The microlensing probe is a backdrop star of radius r_s at β_s: a cell whose ray lands
// inside it adds to `hits`, so the magnification is hits·cellArea/(π r_s²) (inverse ray
// shooting: Σ over images of |det A|⁻¹, for any number of lenses). The probe runs as a
// second pass on its own window around the star (countOnly: no map write), so its
// resolution doesn't depend on the zoom.

struct LensParams {
    viewLeft: f32,
    viewTop: f32,
    cellW: f32,
    cellH: f32,
    res: u32,
    aliveCount: u32,
    deflect: f32,       // 4·𝒟
    coreFrac: f32,      // s² = coreFrac·4M𝒟 per lens
    starX: f32,
    starY: f32,
    starRSq: f32,
    probeOn: u32,
    periodic: u32,
    topology: u32,
    domainW: f32,
    domainH: f32,
    blackHole: u32,
    countOnly: u32,     // the probe's pass: count, don't write the map
    refX: f32,          // periodic: each lens's image nearest this point
    refY: f32,
    mapOffset: u32,     // where the map pass writes in `lensMap` (a reduced map sits past the full one)
    fineRes: u32,       // the full map's side, which `lensExpand` fills from a reduced map of side `res`
    pad0: u32,
    pad1: u32,
};

@group(0) @binding(0) var<uniform> lp: LensParams;
@group(0) @binding(1) var<storage, read> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read_write> lensMap: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> hits: atomic<u32>;
@group(0) @binding(4) var<storage, read_write> lenses: array<vec4<f32>>;   // x, y, 4𝒟M, shadow radius² (−1: none)
@group(0) @binding(5) var<storage, read_write> lensCount: u32;

// Set when every lens is a black hole (the pipeline is built twice), so the sum without them
// spends nothing on the capture test
override LENS_SHADOWS: bool = false;

const COMPACT_THREADS: u32 = 256u;
const LENS_TILE: u32 = 256u;    // the workgroup is 16 × 16, one lens a thread

var<workgroup> scanBuf: array<u32, 256>;
var<workgroup> tile: array<vec4<f32>, 256>;
var<workgroup> tileCount: u32;

fn isLens(p: ParticleState) -> bool {
    return (p.flags & FLAG_ALIVE) != 0u && p.mass > 0.0;
}

// Each thread takes a contiguous run of slots, counts its lenses, and an inclusive scan over the
// threads' counts gives where each run's lenses start: slot order, and no atomics.
@compute @workgroup_size(256)
fn lensCompact(@builtin(local_invocation_index) t: u32) {
    let n = lp.aliveCount;
    let run = (n + COMPACT_THREADS - 1u) / COMPACT_THREADS;
    let lo = min(t * run, n);
    let hi = min(lo + run, n);
    var count = 0u;
    for (var i = lo; i < hi; i++) {
        if (isLens(particles[i])) { count++; }
    }
    scanBuf[t] = count;
    workgroupBarrier();
    for (var off = 1u; off < COMPACT_THREADS; off <<= 1u) {
        var add = 0u;
        if (t >= off) { add = scanBuf[t - off]; }
        workgroupBarrier();
        scanBuf[t] += add;
        workgroupBarrier();
    }
    var out = scanBuf[t] - count;
    if (t == COMPACT_THREADS - 1u) { lensCount = scanBuf[t]; }
    for (var i = lo; i < hi; i++) {
        let p = particles[i];
        if (!isLens(p)) { continue; }
        var pos = vec2(p.posX, p.posY);
        if (lp.periodic != 0u) {
            pos = vec2(lp.refX, lp.refY) + fullMinImageP(lp.refX, lp.refY, p.posX, p.posY, lp.domainW, lp.domainH, lp.topology);
        }
        var shadowSq = -1.0;
        if (lp.blackHole != 0u) { shadowSq = 27.0 * p.mass * p.mass; }
        lenses[out] = vec4(pos, lp.deflect * p.mass, shadowSq);
        out++;
    }
}

fn cellCentre(c: vec2u) -> vec2<f32> {
    return vec2(lp.viewLeft + (f32(c.x) + 0.5) * lp.cellW, lp.viewTop + (f32(c.y) + 0.5) * lp.cellH);
}

// A workgroup is 16 × 16 threads on a 32 × 32 block of cells, each thread four cells 16 apart
// (so a row of threads still writes a row of cells), which spends each tile entry on four sums.
@compute @workgroup_size(16, 16)
fn lensDeflection(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u,
                  @builtin(local_invocation_index) li: u32) {
    // Every thread meets the tile loop's barriers, so the count is read uniformly
    if (li == 0u) { tileCount = lensCount; }
    let n = workgroupUniformLoad(&tileCount);
    let c00 = vec2u(wg.x * 32u + lid.x, wg.y * 32u + lid.y);
    let t00 = cellCentre(c00);
    let t10 = cellCentre(c00 + vec2u(16u, 0u));
    let t01 = cellCentre(c00 + vec2u(0u, 16u));
    let t11 = cellCentre(c00 + vec2u(16u, 16u));
    var a00 = vec2(0.0); var a10 = vec2(0.0); var a01 = vec2(0.0); var a11 = vec2(0.0);
    var s00 = 0.0; var s10 = 0.0; var s01 = 0.0; var s11 = 0.0;
    for (var base = 0u; base < n; base += LENS_TILE) {
        if (base + li < n) { tile[li] = lenses[base + li]; }
        workgroupBarrier();
        let m = min(LENS_TILE, n - base);
        for (var s = 0u; s < m; s++) {
            let l = tile[s];
            let kc = lp.coreFrac * l.z;
            let d00 = t00 - l.xy;
            let d10 = t10 - l.xy;
            let d01 = t01 - l.xy;
            let d11 = t11 - l.xy;
            let r00 = dot(d00, d00);
            let r10 = dot(d10, d10);
            let r01 = dot(d01, d01);
            let r11 = dot(d11, d11);
            a00 += (l.z / (r00 + kc)) * d00;
            a10 += (l.z / (r10 + kc)) * d10;
            a01 += (l.z / (r01 + kc)) * d01;
            a11 += (l.z / (r11 + kc)) * d11;
            if (LENS_SHADOWS) {
                s00 = select(s00, 1.0, r00 < l.w);
                s10 = select(s10, 1.0, r10 < l.w);
                s01 = select(s01, 1.0, r01 < l.w);
                s11 = select(s11, 1.0, r11 < l.w);
            }
        }
        workgroupBarrier();
    }
    lensCell(c00, t00, a00, s00);
    lensCell(c00 + vec2u(16u, 0u), t10, a10, s10);
    lensCell(c00 + vec2u(0u, 16u), t01, a01, s01);
    lensCell(c00 + vec2u(16u, 16u), t11, a11, s11);
}

/** One cell's result: the map entry, and the probe's count of rays that land on the star. */
fn lensCell(c: vec2u, theta: vec2<f32>, alpha: vec2<f32>, shadow: f32) {
    if (c.x >= lp.res || c.y >= lp.res) { return; }
    if (lp.countOnly == 0u) { lensMap[lp.mapOffset + c.y * lp.res + c.x] = vec4(alpha, shadow, 0.0); }
    if (lp.probeOn != 0u && shadow == 0.0) {
        let beta = theta - alpha - vec2(lp.starX, lp.starY);
        if (dot(beta, beta) < lp.starRSq) { atomicAdd(&hits, 1u); }
    }
}

// Past a few hundred lenses the map is computed on a coarser grid (cost goes as res² × lenses) and
// this pass refills the full map from it, bilinearly, so everything that reads the map sees one
// resolution. The coarse cell centres sit at (k + ½)/res of the rectangle, the fine ones at (i + ½)/fineRes.
@compute @workgroup_size(16, 16)
fn lensExpand(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= lp.fineRes || gid.y >= lp.fineRes) { return; }
    let n = i32(lp.res);
    let g = (vec2<f32>(gid.xy) + 0.5) * (f32(lp.res) / f32(lp.fineRes)) - 0.5;
    let i0 = vec2<i32>(floor(g));
    let f = g - floor(g);
    let a = clamp(i0, vec2(0), vec2(n - 1));
    let b = clamp(i0 + vec2(1), vec2(0), vec2(n - 1));
    let q00 = lensMap[lp.mapOffset + u32(a.y * n + a.x)];
    let q10 = lensMap[lp.mapOffset + u32(a.y * n + b.x)];
    let q01 = lensMap[lp.mapOffset + u32(b.y * n + a.x)];
    let q11 = lensMap[lp.mapOffset + u32(b.y * n + b.x)];
    lensMap[gid.y * lp.fineRes + gid.x] = mix(mix(q00, q10, f.x), mix(q01, q11, f.x), f.y);
}
