// spacetime-render.wgsl — the spacetime view: world lines, the selected body's past light
// cone, and boson world lines, under the present plane (src/spacetime.js).
//
// The camera's view matrix takes (x, y, h) with h the time before the present (h ≤ 0) to
// clip space, so these passes and the 2D ones share one projection. Lines are ribbons a
// few px wide built in screen space; the fragment draws a hairline core and, along a body's
// world line, a bead at every beadStep of its proper time (bead spacing reads the clock).
//
// World lines read the history ring (worldline.wgsl writes it; layout in
// shared-worldline.wgsl): samples sit on the covering plane, mapped back here through the
// slot's current deck, and on a periodic domain to the image nearest the body now, with a
// break wherever consecutive points jump a seam. A merge records two samples at one time:
// that is a break too.
//
// On screen, consecutive samples are a fraction of a pixel apart, so the lines aren't drawn
// from the ring directly. Three compute passes, recorded before the scene's render pass, keep
// the points the drawing needs and list them (World lines, decimated, below): lineKeep
// projects every sample in the window once and keeps a point where the chord from the last
// kept one would stray from the samples it skips, lineScan lays the slots' lists end to end
// in slot order, and lineWrite writes each kept point's vertex. The events are found and
// listed in the same passes.
//
// Draws (instances × vertices):
//   vs_line    1 × 4·(kept points) (drawIndirect), one triangle strip over every slot's list:
//              the segment from each kept point to the next, unless a break, transparency or
//              the screen's edge ends the run there. In the plane view the same lines, seen
//              from straight above, are the trails
//   vs_cone    (4 rings + 2 generators) × 2·(CONE_SEGS + 1), triangle strip: drawn as a
//              solid, its outline the two generators where its surface turns from the
//              camera, the far halfAng of each ring dashed
//   vs_event   events × 4 (drawIndirect), triangle strip: an open circle at each event on a
//              world line (a birth during the run, a death, a merge, a sudden kick)
//   vs_boson   (MAX_PHOTONS + PION_POOL_CAP) × 4, triangle strip
//   vs_pierce  maxParticles × 4, triangle strip: where each world line crosses the
//              observer's present, while the lab is boosting toward it or shows it tilted
//   vs_future  prescribed bodies × 6·FUTURE_SEGS, triangle list: a prescribed body's known
//              future, from its curve (shared-prescribed.wgsl), above the present, dashed, its
//              beads hollow; seen from above, its path ahead
//   vs_horizon 3 × 4, triangle strip: the accelerated observer's horizons, the null planes through
//              its corner, hatched, and the corner line where they meet
//   vs_seenRay maxParticles × 4, triangle strip: under Seen, tilted, the light in flight from
//              where each world line pierces the observer's past cone to the observer now
//   vs_tickRing  TICKS × 2·(CONE_SEGS + 1), triangle strip: the selected body's ticks' light
//              where it crosses the present, a ring growing at c from each tick
//   vs_tickRay TICKS·RECEIVERS × 4, triangle strip: tilted, the null ray from each tick to where
//              its light reaches another world line; vs_tickMark × 4 marks that event
//   vs_simul   TICKS·RECEIVERS·2 × 2·SIM_PTS, triangle strip: tilted, each tick's simultaneity on
//              each other world line, the rest frame's chord dashed and the radar surface's trace
//              solid (simulTrace solves them first, a compute pass)
//
// In lab coordinates, lines below the sheet of the present are seen through it, lighter.
//
// Coordinates (src/spacetime.js): with an observer moving at u, every event is boosted at
// rapidity ψ = s·atanh|u| about the anchor event A = (t_A, x_A) on the observer's present,
// so s = 0 is the lab's own coordinates and s = 1 the observer's, where its present lies
// flat at h = 0 and A sits at the camera's centre. In the boost frame itself the anchor
// comes from the slicer's FrameState, the same one the bodies were sliced with.

struct CameraUniforms {
    viewMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    zoom: f32,
    canvasWidth: f32,
    canvasHeight: f32,
    isDarkMode: f32,
    relativityOn: f32,
    blackHoleOn: f32,
    _unused: f32,      // once the Clocks overlay; every body's outline is its clock now
    frameOn: f32,
    frameImages: f32,
    dpr: f32,           // device px per CSS px (the uniform sizes are CSS px)
};

struct SpacetimeParams {
    tNow: f32,          // GPU time of the present (the world-line clock)
    depth: f32,         // time shown below the plane
    tilt: f32,          // 0 in the plane view … 1 at the spacetime elevation
    beadStep: f32,      // proper time between beads
    domainW: f32,
    domainH: f32,
    topology: i32,      // TOPO_*, or −1 when the boundary is not periodic
    selected: u32,      // the selected slot, or 0xFFFFFFFF
    scaleA: f32,        // cosmological scale factor (samples are comoving)
    maxParticles: u32,  // slots in use (the alive count's high-water mark)
    s: f32,             // 0 lab coordinates … 1 the observer's
    psi: f32,           // display rapidity, s·atanh|u|
    n: vec2<f32>,       // the observer's direction of motion
    offset: vec2<f32>,  // displayed position = boosted offset from the anchor + this
    tA: f32,            // anchor event: GPU time
    lag: f32,           // now − t_A
    xA: vec2<f32>,      // anchor event: lab position
    aNow: vec2<f32>,    // the observer's lab position now (images are taken nearest it)
    observing: u32,     // 1 when there is an observer to boost toward
    frameOn: u32,       // 1 in the boost frame: read the anchor from the slicer instead
    pierce: f32,        // slice points: 0 none, 1 rings (lab, tilted present), 2 filled (boosting)
    phi: f32,           // the observer's rapidity, atanh|u|
    trails: f32,        // 1: world lines show in the plane view too, as its trails
    lineWindow: u32,    // samples drawn back from each line's newest (0: all); past the depth
                        // the lines fade to nothing, so in the lab's coordinates only these show
    future: f32,        // how far above the present the prescribed bodies' known future is drawn
    seen: f32,          // 1 under Seen: slice points on the observer's past light cone
    _pad1: f32,
    _pad2: f32,
};

// The slicer's observer (frame-slice.wgsl)
struct FrameState {
    u: vec2<f32>,
    gamma: f32,
    tA: f32,
    xA: vec2<f32>,
    aNow: vec2<f32>,
    phi: f32,
    lag: f32,
    lorentz: f32,
    valid: f32,
    omega: f32,
    images: f32,
    domainW: f32,
    domainH: f32,
    topology: f32,
    kind: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> params: SpacetimeParams;
@group(0) @binding(2) var<storage, read> wlData: array<f32>;
@group(0) @binding(3) var<storage, read> wlMeta: array<u32>;
@group(0) @binding(4) var<storage, read> particles: array<ParticleState>;
@group(0) @binding(5) var<storage, read> color: array<u32>;
@group(0) @binding(6) var<storage, read> photonPool: array<Photon>;
@group(0) @binding(7) var<storage, read> phCount: array<u32>;
@group(0) @binding(8) var<storage, read> pionPool: array<Pion>;
@group(0) @binding(9) var<storage, read> piCount: array<u32>;
@group(0) @binding(10) var<storage, read> frameState: FrameState;
@group(0) @binding(11) var<storage, read> particleAux: array<ParticleAux>;

// The decimated lines' lists: written by the compute passes (12–17), read by the draws (18, 19)
struct LineVertex {
    clip: vec2<f32>,    // the point on screen, clip space (z 0 and w 1: the view is orthographic)
    normal: vec2<f32>,  // the ribbon's normal there
    alpha: f32,
    tau: f32,
    pxPerTau: f32,
    tag: u32,           // the slot, and LV_DRAWN when the segment to the next vertex is drawn
};

struct LineEvent {
    clip: vec2<f32>,
    alpha: f32,
    slot: u32,
};

@group(0) @binding(12) var<storage, read_write> lineBits: array<u32>;     // per slot: LINE_BITS words
@group(0) @binding(13) var<storage, read_write> lineCounts: array<atomic<u32>>;  // per slot: kept | events << 16
@group(0) @binding(14) var<storage, read_write> lineOffsets: array<u32>;  // per slot: its first vertex, first event
@group(0) @binding(15) var<storage, read_write> lineArgs: array<u32>;     // drawIndirect: lines at 0, events at 4
@group(0) @binding(16) var<storage, read_write> lineVertsOut: array<LineVertex>;
@group(0) @binding(17) var<storage, read_write> lineEventsOut: array<LineEvent>;
@group(0) @binding(18) var<storage, read> lineVerts: array<LineVertex>;
@group(0) @binding(19) var<storage, read> lineEvents: array<LineEvent>;

const HALF_PX: f32 = 4.0;       // ribbon halfAng-width, room for a bead
const BEAD_PX: f32 = 2.1;       // bead radius
const CONE_SEGS: u32 = 72u;
const CONE_RINGS: u32 = 4u;
const CONE_REACH: f32 = 0.3;    // the cone's depth, as a fraction of the time shown
const NO_TAU: f32 = -1.0;       // no clock along this line (light)
const SEEN: f32 = 0.45;         // opacity of what lies under the sheet of the present
const KICK_DW: f32 = 0.15;      // a jump in proper velocity between samples that marks an event
const EVENT_PX: f32 = 3.6;      // an event circle's radius

struct VOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,      // rgb, alpha
    @location(1) across: f32,           // px from the line's centre
    @location(2) tau: f32,              // proper time here, or NO_TAU
    @location(3) pxPerTau: f32,         // screen px per unit of proper time along the line
    @location(4) @interpolate(flat) core: f32,  // hairline halfAng-width, px
};

fn collapsed() -> VOut {
    var o: VOut;
    o.position = vec4(0.0, 0.0, 0.0, 1.0);
    o.color = vec4(0.0);
    o.across = 0.0;
    o.tau = NO_TAU;
    o.pxPerTau = 0.0;
    o.core = 0.0;
    return o;
}

fn project(p: vec2<f32>, h: f32) -> vec4<f32> {
    return camera.viewMatrix * vec4(p.x, p.y, h, 1.0);
}

fn toPx(c: vec4<f32>) -> vec2<f32> {
    return vec2(c.x * camera.canvasWidth * 0.5, -c.y * camera.canvasHeight * 0.5);
}

fn offsetClip(c: vec4<f32>, px: vec2<f32>) -> vec4<f32> {
    return c + vec4(px.x * 2.0 / camera.canvasWidth, -px.y * 2.0 / camera.canvasHeight, 0.0, 0.0);
}

fn unpack(packed: u32) -> vec3<f32> {
    return vec3(f32(packed & 0xFFu), f32((packed >> 8u) & 0xFFu), f32((packed >> 16u) & 0xFFu)) / 255.0;
}

fn ink() -> vec3<f32> { return select(COLOR_TEXT_LIGHT, COLOR_TEXT_DARK, camera.isDarkMode > 0.5); }
fn ground() -> vec3<f32> { return select(COLOR_CANVAS_LIGHT, COLOR_CANVAS_DARK, camera.isDarkMode > 0.5); }
fn accent() -> vec3<f32> { return select(COLOR_ACCENT_LIGHT, COLOR_ACCENT_DARK, camera.isDarkMode > 0.5); }
fn dark() -> bool { return camera.isDarkMode > 0.5; }

/** Opacity by age: full at the plane, faint deep in the past, gone past the depth. */
fn ageAlpha(h: f32) -> f32 {
    let D = params.depth;
    return (0.2 + 0.75 * clamp(1.0 + h / D, 0.0, 1.0)) * smoothstep(-D, -0.9 * D, h);
}

/** The direction toward the camera in display coordinates (x, y, h): the one direction the
 *  projection collapses, from the null space of the view matrix's first two rows. */
fn towardCamera() -> vec3<f32> {
    let m = camera.viewMatrix;
    let r0 = vec3(m[0].x, m[1].x, m[2].x);
    let r1 = vec3(m[0].y, m[1].y, m[2].y);
    var d = cross(r0, r1);
    if (d.z < 0.0) { d = -d; }
    return normalize(d);
}

/** The sheet of the present (the lab box at h = 0) on screen, in clip space. */
fn sheetQuad() -> array<vec2<f32>, 4> {
    let W = params.domainW;
    let H = params.domainH;
    return array<vec2<f32>, 4>(project(vec2(0.0, 0.0), 0.0).xy, project(vec2(W, 0.0), 0.0).xy,
                               project(vec2(W, H), 0.0).xy, project(vec2(0.0, H), 0.0).xy);
}

/** True when clip-space point c lies within the projected sheet of the present: something
 *  below the plane there is seen through it. */
fn underSheet(c: vec4<f32>) -> bool { return inQuad(c.xy, sheetQuad()); }

fn inQuad(c: vec2<f32>, q: array<vec2<f32>, 4>) -> bool {
    var pos = 0;
    var neg = 0;
    for (var i = 0; i < 4; i++) {
        let a = q[i];
        let b = q[(i + 1) % 4];
        let cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (cr > 0.0) { pos++; } else if (cr < 0.0) { neg++; }
    }
    return pos == 0 || neg == 0;
}

// ─── The observer and the display transform ───

struct Obs {
    observing: bool,
    s: f32,
    phi: f32,
    psi: f32,
    n: vec2<f32>,
    u: vec2<f32>,
    offset: vec2<f32>,
    tA: f32,
    lag: f32,
    xA: vec2<f32>,
    aNow: vec2<f32>,
};

fn observer() -> Obs {
    var o: Obs;
    o.observing = params.observing != 0u;
    o.s = params.s;
    o.phi = params.phi;
    o.psi = params.psi;
    o.n = params.n;
    o.offset = params.offset;
    o.tA = params.tA;
    o.lag = params.lag;
    o.xA = params.xA;
    o.aNow = params.aNow;
    if (params.frameOn != 0u && frameState.valid > 0.5) {
        let su = min(length(frameState.u), MAX_SPEED_RATIO);
        o.s = 1.0;
        o.phi = atanh(su);
        o.psi = o.phi;
        o.n = select(vec2(1.0, 0.0), frameState.u / max(su, 1e-9), su > 1e-6);
        o.offset = vec2(0.0);
        o.tA = frameState.tA;
        o.lag = frameState.lag;
        o.xA = frameState.xA;
        o.aNow = frameState.aNow;
    }
    o.u = o.n * tanh(o.phi);
    return o;
}

/** A lab event in display coordinates (x, y, h): the plane of the present at h = 0. */
fn disp(o: Obs, pos: vec2<f32>, t: f32) -> vec3<f32> {
    if (!o.observing) { return vec3(pos, t - params.tNow); }
    let d = pos - o.xA;
    let dt = t - o.tA;
    let par = dot(d, o.n);
    let ch = cosh(o.psi);
    let sh = sinh(o.psi);
    let par2 = ch * par - sh * dt;
    let dt2 = ch * dt - sh * par;
    let xy = o.offset + (d - par * o.n) + par2 * o.n;
    return vec3(xy, dt2 - (1.0 - o.s) * o.lag);
}

fn projectEvent(o: Obs, pos: vec2<f32>, t: f32) -> vec4<f32> {
    let e = disp(o, pos, t);
    return project(e.xy, e.z);
}

// ─── World lines ───

struct LinePoint {
    pos: vec2<f32>,
    t: f32,
    tau: f32,
};

/** Sample i of slot s (oldest first); i == count is the body now, while it lives. */
fn linePoint(s: u32, i: u32, start: u32, count: u32, deck: vec4<f32>) -> LinePoint {
    var p: LinePoint;
    if (i >= count) {
        let b = particles[s];
        p.pos = vec2(b.posX, b.posY);
        p.t = params.tNow;
        // The clock now: the last sample's τ advanced at that sample's rate
        let last = s * WL_LEN * WL_STRIDE + ((start + count - 1u) & WL_MASK) * WL_STRIDE;
        let w = vec2(wlData[last + 3u], wlData[last + 4u]);
        p.tau = wlData[last + 7u] + (p.t - wlData[last]) * inverseSqrt(1.0 + dot(w, w));
        return p;
    }
    let base = s * WL_LEN * WL_STRIDE + ((start + i) & WL_MASK) * WL_STRIDE;
    let c = vec2(wlData[base + 1u], wlData[base + 2u]);
    // Cover → this image: x = A·(C − b)·a, A the deck's ±1 diagonal
    p.pos = deck.xy * (c - deck.zw) * params.scaleA;
    p.t = wlData[base];
    p.tau = wlData[base + 7u];
    return p;
}

/** On a periodic domain, the image of q nearest a reference point. */
fn nearImage(q: vec2<f32>, anchor: vec2<f32>) -> vec2<f32> {
    if (params.topology < 0) { return q; }
    return anchor + fullMinImageP(anchor.x, anchor.y, q.x, q.y, params.domainW, params.domainH, u32(params.topology));
}

/** True when the segment between consecutive points a, b is not drawn. */
fn isBreak(a: LinePoint, b: LinePoint) -> bool {
    let jump = length(b.pos - a.pos);
    let seam = params.topology >= 0 && jump > 0.45 * min(params.domainW, params.domainH);
    let merge = (b.t - a.t) < 1e-4 && jump > 1e-3;
    return seam || merge;
}

/** A slot's world line as stored: where its ring starts, how many samples, its deck. */
struct Line {
    ok: bool,
    alive: bool,
    start: u32,
    count: u32,
    n: u32,             // samples, plus the body now while it lives
    deck: vec4<f32>,
    anchor: vec2<f32>,  // the image the whole line is drawn through: of the body now
};

fn lineOf(s: u32, o: Obs) -> Line {
    var l: Line;
    l.ok = false;
    if (s >= params.maxParticles) { return l; }
    let flags = particles[s].flags;
    l.alive = (flags & FLAG_ALIVE) != 0u;
    if (!l.alive && (flags & FLAG_RETIRED) == 0u) { return l; }
    let mb = s * WL_META_STRIDE;
    l.count = min(wlMeta[mb + 1u], WL_LEN);
    if (l.count == 0u) { return l; }
    l.start = (wlMeta[mb] + WL_LEN - l.count) & WL_MASK;
    let bits = wlMeta[mb + 4u];
    l.deck = vec4(select(1.0, -1.0, (bits & 1u) != 0u), select(1.0, -1.0, (bits & 2u) != 0u),
                  bitcast<f32>(wlMeta[mb + 5u]), bitcast<f32>(wlMeta[mb + 6u]));
    l.n = l.count + select(0u, 1u, l.alive);
    // The body's latest point, in the image nearest the observer when there is one
    var a = linePoint(s, l.n - 1u, l.start, l.count, l.deck).pos;
    if (o.observing) { a = nearImage(a, o.aNow); }
    l.anchor = a;
    l.ok = true;
    return l;
}

fn pointOf(s: u32, l: Line, i: u32) -> LinePoint {
    var p = linePoint(s, i, l.start, l.count, l.deck);
    p.pos = nearImage(p.pos, l.anchor);
    return p;
}

/** The observer's present through A: g = (t − t_A) − u·(x − x_A), rising along a world line. */
fn sliceG(o: Obs, p: LinePoint) -> f32 {
    return (p.t - o.tA) - dot(o.u, p.pos - o.xA);
}

/** Where slot s's world line crosses the observer's present, if it does in its recorded span. */
struct Pierce {
    found: bool,
    p: LinePoint,
};

fn pierceOf(s: u32, l: Line, o: Obs) -> Pierce {
    var out: Pierce;
    out.found = false;
    let last = pointOf(s, l, l.n - 1u);
    let first = pointOf(s, l, 0u);
    if (sliceG(o, last) < 0.0 || sliceG(o, first) > 0.0) { return out; }
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        if (sliceG(o, pointOf(s, l, mid)) <= 0.0) { lo = mid; } else { hi = mid; }
    }
    let a = pointOf(s, l, lo);
    let b = pointOf(s, l, hi);
    let ga = sliceG(o, a);
    let gb = sliceG(o, b);
    let k = select(0.0, clamp(ga / (ga - gb), 0.0, 1.0), abs(ga - gb) > 1e-9);
    out.p.pos = mix(a.pos, b.pos, k);
    out.p.t = mix(a.t, b.t, k);
    out.p.tau = mix(a.tau, b.tau, k);
    out.found = true;
    return out;
}

/** Where slot s's world line crosses the observer's past light cone at its anchor (Seen):
 *  g = |x − x_A| − (t_A − t) rises along a timelike line. */
fn conePierceOf(s: u32, l: Line, o: Obs) -> Pierce {
    var out: Pierce;
    out.found = false;
    let last = pointOf(s, l, l.n - 1u);
    let first = pointOf(s, l, 0u);
    if (coneSeenG(o, last) < 0.0 || coneSeenG(o, first) > 0.0) { return out; }
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        if (coneSeenG(o, pointOf(s, l, mid)) <= 0.0) { lo = mid; } else { hi = mid; }
    }
    let a = pointOf(s, l, lo);
    let b = pointOf(s, l, hi);
    let ga = coneSeenG(o, a);
    let gb = coneSeenG(o, b);
    let k = select(0.0, clamp(ga / (ga - gb), 0.0, 1.0), abs(ga - gb) > 1e-9);
    out.p.pos = mix(a.pos, b.pos, k);
    out.p.t = mix(a.t, b.t, k);
    out.p.tau = mix(a.tau, b.tau, k);
    out.found = true;
    return out;
}

fn coneSeenG(o: Obs, p: LinePoint) -> f32 {
    return length(p.pos - o.xA) - (o.tA - p.t);
}

/** The slice point a body is drawn at: on the observer's present, or under Seen its past cone. */
fn slicePierce(s: u32, l: Line, o: Obs) -> Pierce {
    if (params.seen > 0.5) { return conePierceOf(s, l, o); }
    return pierceOf(s, l, o);
}

// ─── World lines, decimated before they are drawn ───
//
// lineKeep gives each slot LINE_CHUNKS threads, each over LINE_CHUNK consecutive points of the
// window (the last also takes the body now). A segment between consecutive points is drawn
// unless it is a break, it is transparent at both ends (every fragment would be discarded), or
// both ends lie past the same edge of the screen by more than the ribbon's width. Along each
// run of drawn segments a thread stretches one chord from the last point it kept, and keeps the
// point before the first one the chord can't reach: one past a sample the chord would miss by
// more than DEV_PX device px (a wedge of directions, narrowed by each skipped sample), or whose
// opacity it would miss by ALPHA_TOL, or at which the ribbon's normal has turned past TURN_COS,
// or whose state differs (ahead of the observer's present, under the sheet, above the present,
// beaded, near a bead, twisted). Near a bead the chord must also carry proper time and the bead
// scale closely enough to keep the bead's outline within DEV_PX; between beads, only closely
// enough that none appears. Where a segment's ribbon is skewed() (a cusp, a kink, a direction
// taken across a break) its points are twisted: kept as stored, at the full HALF_PX. Runs' ends
// and each thread's first point are kept, so a thread's decisions need only its own points, and
// each kept point's vertex is the one vs_line drew there before: its normal and bead scale come
// from its neighbours as stored. Elsewhere the ribbon narrows to what its fragments can colour,
// a bead's reach near one and the hairline's otherwise.

const LINE_CHUNK: u32 = 32u;                    // points one lineKeep thread decimates: a word of bits
const LINE_CHUNKS: u32 = WL_LEN / LINE_CHUNK;   // lineKeep threads per slot
const LINE_WORDS: u32 = WL_LEN / 32u + 1u;      // a bit per point of the window, the body now included
const LINE_BITS: u32 = 5u * LINE_WORDS;         // per slot: kept, drawn on from, near a bead, twisted, events
const LV_DRAWN: u32 = 0x80000000u;              // the segment to the next vertex is drawn
const LV_WIDTH: u32 = 28u;                      // the ribbon's width class at the point (widthClass)
const LV_SLOT: u32 = 0x00FFFFFFu;
const CORE_REACH: f32 = 1.75;   // px from a line's centre that its hairline can colour (0.95 + 0.6)
const BEAD_REACH: f32 = 3.0;    // … that a bead can (BEAD_PX + 0.6)
const ZONE_PX: f32 = 3.5;       // px along the line from a bead's centre within which a point is near it
const DEV_PX: f32 = 0.03;       // device px: how far a skipped sample may be from the chord drawn instead
const ALPHA_TOL: f32 = 0.01;    // … how far its opacity from the chord's
const TURN_COS: f32 = 0.9996875; // cos 0.025 rad: the most the ribbon's normal turns along one chord

const PT_AHEAD: u32 = 1u;       // ahead of the observer's present
const PT_DIM: u32 = 2u;         // seen through the sheet of the present
const PT_SHOWN: u32 = 4u;       // at or below the present, or ahead
const PT_BEADS: u32 = 8u;       // beads are drawn here (more than 6 px apart: fs_main's fade)
const PT_NEAR: u32 = 16u;       // a bead's centre is within ZONE_PX, or between it and a neighbour
const PT_TWIST: u32 = 32u;      // a segment to it is skewed(): kept, with its neighbours, at HALF_PX

/** A world-line point as the lines draw it. */
struct LinePt {
    p: LinePoint,
    clip: vec2<f32>,
    px: vec2<f32>,
    alpha: f32,         // opacity, whether its segments are drawn aside
    flags: u32,         // PT_*
};

var<private> sheetQ: array<vec2<f32>, 4>;   // sheetQuad(), once per compute thread

/** Point i of slot s's line, k = show × the selection's emphasis. */
fn linePt(s: u32, l: Line, o: Obs, i: u32, k: f32) -> LinePt {
    var q: LinePt;
    q.p = pointOf(s, l, i);
    let e = disp(o, q.p.pos, q.p.t);
    let h = e.z;
    let c = project(e.xy, h);
    q.clip = c.xy;
    q.px = toPx(c);
    // Ahead of the observer's present is the observer's future: faint, as not yet seen
    let ahead = o.observing && sliceG(o, q.p) > 0.0;
    var a = ageAlpha(h) * k;
    if (ahead) { a = mix(0.3, 0.12, o.s) * max(params.tilt, params.trails); }
    let dim = !o.observing && h < -1e-3 && params.tilt > 0.01 && inQuad(c.xy, sheetQ);
    if (dim) { a *= mix(1.0, SEEN, params.tilt); }
    let shown = h <= 0.0 || ahead;
    q.alpha = select(0.0, a, shown);
    q.flags = select(0u, PT_AHEAD, ahead) | select(0u, PT_DIM, dim) | select(0u, PT_SHOWN, shown);
    return q;
}

/** The ribbon's direction at a point, along its neighbours as stored. */
fn lineDir(prev: LinePt, next: LinePt) -> vec2<f32> {
    var dir = next.px - prev.px;
    if (dot(dir, dir) < 1e-6) { dir = vec2(1.0, 0.0); }
    return normalize(dir);
}

/** Screen px per unit of proper time at a point, for its beads; 0 for none. */
fn linePxPerTau(prev: LinePt, cur: LinePt, next: LinePt) -> f32 {
    let dTau = abs(next.p.tau - prev.p.tau);
    return select(0.0, length(next.px - prev.px) / max(dTau, 1e-5), dTau > 1e-6 && (cur.flags & PT_AHEAD) == 0u);
}

/** PT_BEADS and PT_NEAR at a point, from its proper time and bead scale and its neighbours'
 *  (vs_line interpolates the scale along a segment, so either end's can draw beads on it). A
 *  point beside one with no scale (ahead of the observer's present) is near, as beads fade
 *  along that segment wherever its interpolated scale puts them. */
fn beadFlags(prev: LinePt, cur: LinePt, next: LinePt, pptPrev: f32, ppt: f32, pptNext: f32) -> u32 {
    let step = params.beadStep;
    if (step * max(max(pptPrev, pptNext), ppt) <= 6.0) { return 0u; }
    let least = min(min(pptPrev, pptNext), ppt);
    if (least <= 0.0) { return PT_BEADS | PT_NEAR; }
    let reach = ZONE_PX / least;
    let lo = min(min(prev.p.tau, next.p.tau), cur.p.tau) - reach;
    let hi = max(max(prev.p.tau, next.p.tau), cur.p.tau) + reach;
    return PT_BEADS | select(0u, PT_NEAR, floor(hi / step) >= ceil(lo / step));
}

/** True when the segment between consecutive points a, b can put a fragment on screen. */
fn segDrawn(a: LinePt, b: LinePt) -> bool {
    if (isBreak(a.p, b.p) || (a.alpha < 0.004 && b.alpha < 0.004)) { return false; }
    let m = (HALF_PX + 1.0) * 2.0 / vec2(camera.canvasWidth, camera.canvasHeight);
    return all(max(a.clip, b.clip) > vec2(-1.0) - m) && all(min(a.clip, b.clip) < vec2(1.0) + m);
}

/** True when a segment's ribbon, HALF_PX wide with its ends' normals along da and db, is too
 *  skewed for its across to be a fragment's distance from the line (0.01 px): near a fold, as at a
 *  cusp, a kink, or a direction taken across a break. Only there do HALF_PX's outer px show. */
fn skewed(da: vec2<f32>, db: vec2<f32>, len: f32) -> bool {
    let th = sqrt(max(2.0 - 2.0 * dot(da, db), 0.0));   // 2 sin(θ/2): θ when small, and large when not
    let wt = HALF_PX * th;
    return len < 2.0 * wt || HALF_PX * th * th * len > 0.02 * (len - wt);
}

/** DEV_PX in CSS px, the unit everything on screen is measured in here. */
fn devPx() -> f32 { return DEV_PX / max(camera.dpr, 1.0); }

/** The chord being stretched from the last kept point, and what the samples it skips allow. */
struct Span {
    i: u32,             // the kept point it starts from
    pt: LinePt,
    dir: vec2<f32>,
    ppt: f32,
    closed: bool,       // it skips a point whose state differs: it can't be stretched further
    bounded: bool,      // a skipped sample past DEV_PX has bounded the chord's direction
    lo: vec2<f32>,      // the chord's direction lies between these unit vectors (counterclockwise)
    hi: vec2<f32>,
    rmax: f32,          // the farthest skipped sample, px
    aLo: f32,           // opacity per px along the chord
    aHi: f32,
    tLo: f32,           // proper time per px
    tHi: f32,
    pLo: f32,           // bead scale per px
    pHi: f32,
};

fn spanFrom(i: u32, pt: LinePt, dir: vec2<f32>, ppt: f32) -> Span {
    var sp: Span;
    sp.i = i;
    sp.pt = pt;
    sp.dir = dir;
    sp.ppt = ppt;
    sp.closed = (pt.flags & PT_TWIST) != 0u;   // a twisted point's segments stay as stored
    sp.bounded = false;
    sp.rmax = 0.0;
    sp.aLo = -1e30; sp.aHi = 1e30;
    sp.tLo = -1e30; sp.tHi = 1e30;
    sp.pLo = -1e30; sp.pHi = 1e30;
    return sp;
}

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 { return a.x * b.y - a.y * b.x; }

/** Stretch the span's chord to end at point j, skipping the samples between, if it can pass
 *  them all; then j joins them, so any later end must pass it too. False leaves it as it was. */
fn spanTake(sp: ptr<function, Span>, j: u32, pt: LinePt, dir: vec2<f32>, ppt: f32) -> bool {
    let s0 = *sp;
    let dev = devPx();
    let d = pt.px - s0.pt.px;
    let r = length(d);
    let u = d / max(r, 1e-30);
    let sa = (pt.alpha - s0.pt.alpha) / max(r, 1e-30);
    let st = (pt.p.tau - s0.pt.p.tau) / max(r, 1e-30);
    let sq = (ppt - s0.ppt) / max(r, 1e-30);
    if (j != s0.i + 1u) {
        if (s0.closed || pt.flags != s0.pt.flags || dot(dir, s0.dir) < TURN_COS) { return false; }
        // Between beads the bead scale need only stay close enough that no bead edge reaches in
        if ((pt.flags & (PT_BEADS | PT_NEAR)) == PT_BEADS && abs(ppt - s0.ppt) > 0.2 * s0.ppt) { return false; }
        if (r < s0.rmax - dev) { return false; }        // the line turned back
        if (r > dev) {
            if (s0.bounded && (cross2(s0.lo, u) < 0.0 || cross2(u, s0.hi) < 0.0 || dot(u, s0.lo + s0.hi) <= 0.0)) { return false; }
            if (sa < s0.aLo || sa > s0.aHi || st < s0.tLo || st > s0.tHi || sq < s0.pLo || sq > s0.pHi) { return false; }
        }
    }
    if (pt.flags != s0.pt.flags) { (*sp).closed = true; }
    (*sp).rmax = max(s0.rmax, r);
    if (r <= dev) { return true; }
    // The directions that pass within dev of this sample: u turned by ±asin(dev / r)
    let sn = dev / r;
    let cs = sqrt(max(1.0 - sn * sn, 0.0));
    let lo = vec2(u.x * cs + u.y * sn, u.y * cs - u.x * sn);
    let hi = vec2(u.x * cs - u.y * sn, u.y * cs + u.x * sn);
    if (!s0.bounded) {
        (*sp).bounded = true;
        (*sp).lo = lo;
        (*sp).hi = hi;
    } else {
        if (cross2(s0.lo, lo) > 0.0) { (*sp).lo = lo; }
        if (cross2(hi, s0.hi) > 0.0) { (*sp).hi = hi; }
    }
    (*sp).aLo = max(s0.aLo, sa - ALPHA_TOL / r);
    (*sp).aHi = min(s0.aHi, sa + ALPHA_TOL / r);
    if ((pt.flags & PT_NEAR) != 0u) {
        // The bead's centre within dev / 2 of where it was, and its edge (BEAD_REACH out) within
        // dev / 2 more, so the bead's outline moves by dev at most
        (*sp).tLo = max(s0.tLo, st - 0.5 * dev / (ppt * r));
        (*sp).tHi = min(s0.tHi, st + 0.5 * dev / (ppt * r));
        let tp = 0.5 * ppt * dev / (BEAD_REACH * r);
        (*sp).pLo = max(s0.pLo, sq - tp);
        (*sp).pHi = min(s0.pHi, sq + tp);
    }
    return true;
}

/** Bit b (0 … LINE_CHUNK) of a thread's words: its own points, the last thread's extra in y. */
fn setBit(w: ptr<function, vec2<u32>>, b: u32) {
    if (b < 32u) { (*w).x = (*w).x | (1u << b); } else { (*w).y = (*w).y | 1u; }
}

/** The window of a line: its first point (of l.n), the newest lineWindow in the lab's coordinates. */
fn lineFirst(l: Line) -> u32 {
    return select(0u, l.n - min(l.n, params.lineWindow), params.lineWindow > 0u);
}

/** The events' window: the newest samples (the body now isn't one). */
fn eventFirst(l: Line) -> u32 {
    let win = select(WL_LEN, min(params.lineWindow, WL_LEN), params.lineWindow > 0u);
    return l.count - min(l.count, win);
}

/** LINE_CHUNKS threads a slot, each deciding its chunk's points in order (a thread over 32
 *  points in parallel with every other thread beats sharing the points' work across a
 *  workgroup: the decisions are serial, and only every thread deciding keeps a SIMD group full). */
@compute @workgroup_size(64)
fn lineKeep(@builtin(global_invocation_id) gid: vec3<u32>) {
    let s = gid.x / LINE_CHUNKS;
    let c = gid.x % LINE_CHUNKS;
    if (s >= params.maxParticles) { return; }
    var keep = vec2(0u);
    var drawn = vec2(0u);
    var near = vec2(0u);
    var twist = vec2(0u);
    var events = vec2(0u);
    let o = observer();
    let l = lineOf(s, o);
    sheetQ = sheetQuad();
    // Seen from above, the world lines are the plane view's trails
    let show = max(params.tilt, params.trails);

    if (l.ok && show >= 0.002) {
        let n = l.n;
        let first = lineFirst(l);
        let m = n - first;
        let r0 = c * LINE_CHUNK;
        if (r0 < m) {
            let i0 = first + r0;
            let iOwn = first + select(min(r0 + LINE_CHUNK, m), m, c == LINE_CHUNKS - 1u);  // the next thread's first
            let k = show * select(0.85, 1.0, s == params.selected);
            // A window of four points around point i: before it, it, after it and the one after
            // that, for the directions at i and i + 1 (as stored: a line's end is its own neighbour)
            var pm = linePt(s, l, o, select(i0, i0 - 1u, i0 > 0u), k);
            var pc = linePt(s, l, o, i0, k);
            var pn = pc;
            if (i0 + 1u < n) { pn = linePt(s, l, o, i0 + 1u, k); }
            var dir = lineDir(pm, pn);
            var dirM = dir;
            var ppt = linePxPerTau(pm, pc, pn);
            var pptM = ppt;
            // The segment into the point (none into the window's first), and whether it is skewed
            var dIn = false;
            var skewIn = false;
            if (i0 > first) {
                let pmm = linePt(s, l, o, select(i0 - 1u, i0 - 2u, i0 > 1u), k);
                dirM = lineDir(pmm, pc);
                pptM = linePxPerTau(pmm, pm, pc);
                dIn = segDrawn(pm, pc);
                skewIn = dIn && skewed(dirM, dir, length(pc.px - pm.px));
            }
            var sp: Span;
            var inRun = false;
            for (var i = i0; i <= min(iOwn, n - 1u); i++) {
                var pnn = pn;
                if (i + 2u < n) { pnn = linePt(s, l, o, i + 2u, k); }
                let dirN = lineDir(pc, pnn);
                let dOut = i + 1u < n && segDrawn(pc, pn);
                let skewOut = dOut && skewed(dir, dirN, length(pn.px - pc.px));
                let pptN = linePxPerTau(pc, pn, pnn);
                pc.flags |= beadFlags(pm, pc, pn, pptM, ppt, pptN) | select(0u, PT_TWIST, skewIn || skewOut);
                let b = i - i0;
                if (i == iOwn) {
                    // The next thread keeps its first point; the chord into it must still reach it
                    var t = sp;
                    if (inRun && !spanTake(&t, i, pc, dir, ppt)) { setBit(&keep, b - 1u); setBit(&drawn, b - 1u); }
                    break;
                }
                if ((pc.flags & PT_NEAR) != 0u) { setBit(&near, b); }
                if ((pc.flags & PT_TWIST) != 0u) { setBit(&twist, b); }
                if (!inRun) {
                    if (dOut) {
                        setBit(&keep, b);
                        setBit(&drawn, b);
                        sp = spanFrom(i, pc, dir, ppt);
                        inRun = true;
                    } else if (dIn) {
                        setBit(&keep, b);       // the end of a run the previous thread drew into its first
                    }
                } else {
                    if (!spanTake(&sp, i, pc, dir, ppt)) {
                        setBit(&keep, b - 1u);
                        setBit(&drawn, b - 1u);
                        sp = spanFrom(i - 1u, pm, dirM, pptM);
                        _ = spanTake(&sp, i, pc, dir, ppt);     // the segment as stored: always
                    }
                    if (!dOut) {
                        setBit(&keep, b);
                        inRun = false;
                    }
                }
                pm = pc;
                pc = pn;
                pn = pnn;
                dirM = dir;
                dir = dirN;
                pptM = ppt;
                ppt = pptN;
                dIn = dOut;
                skewIn = skewOut;
            }
        }
    }

    // Events: a birth during the run (the first sample of a ring that never wrapped; preset and
    // loaded bodies are created at −∞ and have none), a death (the last sample of a retired line),
    // a merge (two samples at one time), a kick (the largest jump in a run of large jumps)
    if (l.ok && params.tilt >= 0.05) {
        let e0 = eventFirst(l);
        let r0 = c * LINE_CHUNK;
        if (e0 + r0 < l.count) {
            let mb = s * WL_META_STRIDE;
            let born = wlMeta[mb + 1u] < WL_LEN && bitcast<f32>(wlMeta[mb + 2u]) > -1e30;
            let i0 = e0 + r0;
            var prev = pointOf(s, l, select(i0, i0 - 1u, i0 > 0u));
            var kPrev = kickAt(s, l, i0 - 1u);
            var kCur = kickAt(s, l, i0);
            for (var i = i0; i < min(i0 + LINE_CHUNK, l.count); i++) {
                let cur = pointOf(s, l, i);
                let kNext = kickAt(s, l, i + 1u);
                var isEvent = (i == 0u && born) || (!l.alive && i == l.count - 1u);
                if (i > 0u && cur.t - prev.t < 1e-4 && length(cur.pos - prev.pos) > 1e-3) { isEvent = true; }
                if (kCur > KICK_DW && kCur >= kPrev && kCur > kNext) { isEvent = true; }
                if (isEvent) {
                    let z = disp(o, cur.pos, cur.t).z;
                    if (z <= 1e-3 && z >= -params.depth) { setBit(&events, i - i0); }
                }
                prev = cur;
                kPrev = kCur;
                kCur = kNext;
            }
        }
    }

    // Every word is written every frame, so nothing needs clearing
    let base = s * LINE_BITS + c;
    lineBits[base] = keep.x;
    lineBits[base + LINE_WORDS] = drawn.x;
    lineBits[base + 2u * LINE_WORDS] = near.x;
    lineBits[base + 3u * LINE_WORDS] = twist.x;
    lineBits[base + 4u * LINE_WORDS] = events.x;
    if (c == LINE_CHUNKS - 1u) {
        let last = s * LINE_BITS + LINE_WORDS - 1u;
        lineBits[last] = keep.y;
        lineBits[last + LINE_WORDS] = drawn.y;
        lineBits[last + 2u * LINE_WORDS] = near.y;
        lineBits[last + 3u * LINE_WORDS] = twist.y;
        lineBits[last + 4u * LINE_WORDS] = 0u;
    }
    // Integer sums don't depend on the order the threads add in (the renderer clears these first)
    atomicAdd(&lineCounts[s], (countOneBits(keep.x) + countOneBits(keep.y)) | (countOneBits(events.x) << 16u));
}

var<workgroup> scanPart: array<vec2<u32>, 256>;

/** Slot s's kept points and events. */
fn slotCounts(s: u32) -> vec2<u32> {
    let w = atomicLoad(&lineCounts[s]);
    return vec2(w & 0xFFFFu, w >> 16u);
}

/** One workgroup: each slot's offsets in the lists, in slot order (the order the strips were
 *  drawn in, which blending makes the pixels' order), the totals after the last slot's, the two
 *  draws' arguments and lineWrite's workgroups. */
@compute @workgroup_size(256)
fn lineScan(@builtin(local_invocation_index) t: u32) {
    let slots = params.maxParticles;
    let per = (slots + 255u) / 256u;
    let s0 = min(t * per, slots);
    let s1 = min(s0 + per, slots);
    var sum = vec2(0u);
    for (var s = s0; s < s1; s++) { sum += slotCounts(s); }
    scanPart[t] = sum;
    workgroupBarrier();
    if (t == 0u) {
        var acc = vec2(0u);
        for (var k = 0u; k < 256u; k++) {
            let v = scanPart[k];
            scanPart[k] = acc;
            acc += v;
        }
        let nEvents = min(acc.y, arrayLength(&lineEventsOut));   // 64 a slot of the store (gpu-renderer.js)
        lineOffsets[2u * slots] = acc.x;
        lineOffsets[2u * slots + 1u] = nEvents;
        lineArgs[0] = 4u * acc.x;       // vs_line: one strip, four vertices a point
        lineArgs[1] = 1u;
        lineArgs[2] = 0u;
        lineArgs[3] = 0u;
        lineArgs[4] = 4u;               // vs_event: an instance an event
        lineArgs[5] = nEvents;
        lineArgs[6] = 0u;
        lineArgs[7] = 0u;
        lineArgs[8] = min((acc.x + nEvents + 255u) / 256u, 65535u);
        lineArgs[9] = 1u;
        lineArgs[10] = 1u;
    }
    workgroupBarrier();
    var at = scanPart[t];
    for (var s = s0; s < s1; s++) {
        lineOffsets[2u * s] = at.x;
        lineOffsets[2u * s + 1u] = at.y;
        at += slotCounts(s);
    }
}

/** The slot whose list (0: vertices, 1: events) holds entry j. */
fn slotOf(j: u32, which: u32) -> u32 {
    var lo = 0u;
    var hi = params.maxParticles;
    while (hi - lo > 1u) {
        let mid = (lo + hi) >> 1u;
        if (lineOffsets[2u * mid + which] <= j) { lo = mid; } else { hi = mid; }
    }
    return lo;
}

/** The index of the rank-th set bit among LINE_WORDS words of lineBits from base. */
fn nthBit(base: u32, rank: u32) -> u32 {
    var r = rank;
    var w = 0u;
    loop {
        let c = countOneBits(lineBits[base + w]);
        if (r < c || w + 1u >= LINE_WORDS) { break; }
        r -= c;
        w++;
    }
    var bits = lineBits[base + w];
    for (var k = 0u; k < r; k++) { bits &= bits - 1u; }
    return 32u * w + firstTrailingBit(bits);
}

fn bitAt(base: u32, b: u32) -> bool {
    return b < 32u * LINE_WORDS && ((lineBits[base + (b >> 5u)] >> (b & 31u)) & 1u) != 0u;
}

/** A point's ribbon width class: 2 twisted (HALF_PX), 1 near a bead (BEAD_REACH: ZONE_PX
 *  leaves room for the taper to the next point to clear the bead), 0 CORE_REACH. */
fn widthClass(base: u32, b: u32) -> u32 {
    if (bitAt(base + 3u * LINE_WORDS, b)) { return 2u; }
    return select(0u, 1u, bitAt(base + 2u * LINE_WORDS, b));
}

/** A thread per entry of the lists (lineScan sizes the dispatch): the vertex of a kept point,
 *  computed as vs_line computed it before, or an event. */
@compute @workgroup_size(256)
fn lineWrite(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slots = params.maxParticles;
    let nVerts = lineOffsets[2u * slots];
    let isEvent = gid.x >= nVerts;
    let j = select(gid.x, gid.x - nVerts, isEvent);
    if (isEvent && j >= lineOffsets[2u * slots + 1u]) { return; }
    let which = select(0u, 1u, isEvent);
    let s = slotOf(j, which);
    let base = s * LINE_BITS;
    let rank = j - lineOffsets[2u * s + which];
    let o = observer();
    let l = lineOf(s, o);
    sheetQ = sheetQuad();

    if (isEvent) {
        let cur = pointOf(s, l, eventFirst(l) + nthBit(base + 4u * LINE_WORDS, rank));
        let e = disp(o, cur.pos, cur.t);
        let c = project(e.xy, e.z);
        var a = ageAlpha(e.z) * params.tilt;
        if (!o.observing && e.z < -1e-3 && inQuad(c.xy, sheetQ)) { a *= mix(1.0, SEEN, params.tilt); }
        lineEventsOut[j] = LineEvent(c.xy, a, s);
        return;
    }

    let b = nthBit(base, rank);
    let i = lineFirst(l) + b;
    let k = max(params.tilt, params.trails) * select(0.85, 1.0, s == params.selected);
    let cur = linePt(s, l, o, i, k);
    var prev = cur;
    var next = cur;
    if (i > 0u) { prev = linePt(s, l, o, i - 1u, k); }
    if (i + 1u < l.n) { next = linePt(s, l, o, i + 1u, k); }
    let dir = lineDir(prev, next);
    var tag = s | (widthClass(base, b) << LV_WIDTH);
    if (bitAt(base + LINE_WORDS, b)) { tag |= LV_DRAWN; }
    var v: LineVertex;
    v.clip = cur.clip;
    v.normal = vec2(-dir.y, dir.x);
    v.alpha = cur.alpha;
    v.tau = cur.p.tau;
    v.pxPerTau = linePxPerTau(prev, cur, next);
    v.tag = tag;
    lineVertsOut[j] = v;
}

/** One triangle strip over every kept point, four vertices each: the pair into it and the pair
 *  out of it, at one place, so the segment to the next point is the strip between them. Where
 *  no segment leaves a point (a run's end) the out pair is degenerate, its first vertex on the
 *  in pair's + side and its second on the next point's − side, which carries the strip to the
 *  next run without a triangle of any area. The ribbon's half-width is the point's: BEAD_REACH
 *  near a bead, HALF_PX at a twisted point, and CORE_REACH elsewhere, past which every fragment
 *  would be transparent; between two points it tapers, which keeps across a fragment's
 *  distance from the line (one width per point keeps the pairs' vertices identical). */
@vertex
fn vs_line(@builtin(vertex_index) vid: u32) -> VOut {
    let j = vid >> 2u;
    let outPair = (vid & 2u) != 0u;
    var v = lineVerts[j];
    var side = select(-1.0, 1.0, (vid & 1u) != 0u);
    if (outPair && (v.tag & LV_DRAWN) == 0u) {
        if ((vid & 1u) != 0u) { v = lineVerts[j + 1u]; side = -1.0; }
        else { side = 1.0; }
    }
    let wc = (v.tag >> LV_WIDTH) & 3u;
    let w = select(select(CORE_REACH, BEAD_REACH, wc == 1u), HALF_PX, wc == 2u);
    let s = v.tag & LV_SLOT;
    let selected = s == params.selected;
    var rgb = mix(unpack(color[s]), ink(), 0.35);
    if (selected) { rgb = accent(); }
    var out: VOut;
    out.position = offsetClip(vec4(v.clip, 0.0, 1.0), v.normal * side * w);
    out.color = vec4(rgb, v.alpha);
    out.across = side * w;
    out.tau = v.tau;
    out.pxPerTau = v.pxPerTau;
    out.core = select(0.6, 0.95, selected);
    return out;
}

// ─── The selected body's past light cone ───
// Drawn as a solid: four lab-time rings, invariant as a set so they boost like everything
// else; the surface |x − a| = h_a − h faces the camera where (û, 1)·d > 0 (û the ring's
// outward direction, d toward the camera), so its outline runs where cos(φ − β) = −d_h/|d_xy|
// and the far halfAng of each ring, behind it, is dashed. Seen from above d_xy is 0: no outline.

@vertex
fn vs_cone(@builtin(vertex_index) vid: u32, @builtin(instance_index) k: u32) -> VOut {
    let sel = params.selected;
    let seen = params.seen > 0.5;
    if (params.tilt < 0.002 || (sel >= params.maxParticles && !seen)) { return collapsed(); }
    let o = observer();
    var apex: LinePoint;
    if (seen) {
        // Under Seen, the observer's own past cone, which the world lines pierce
        apex.pos = o.xA;
        apex.t = o.tA;
    } else {
        let l = lineOf(sel, o);
        if (!l.ok || !l.alive) { return collapsed(); }
        // The apex: the body where the observer sees it now (its lab present without a boost)
        apex = pointOf(sel, l, l.n - 1u);
        if (o.observing) {
            let pc = pierceOf(sel, l, o);
            if (!pc.found) { return collapsed(); }
            apex = pc.p;
        }
    }
    // Under Seen the cone reaches back as far as the light of the farthest body nearest it
    let reach = select(CONE_REACH * params.depth,
                       min(params.depth, 0.5 * length(vec2(params.domainW, params.domainH))), seen);
    // The accent is the selection's: under Seen the cone is the observer's, in the accent only
    // when the observer is the red body
    let coneInk = select(accent(), select(ink(), accent(), abs(frameState.kind - 2.0) < 0.5), seen);
    let d = towardCamera();
    let m = length(d.xy);
    let outline = m > 1e-4 && d.z < m;
    let beta = atan2(d.y, d.x);
    let halfAng = acos(clamp(-d.z / max(m, 1e-6), -1.0, 1.0));
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    var out: VOut;
    out.tau = 0.0;
    out.pxPerTau = 0.0;

    if (k >= CONE_RINGS) {
        // The two generators of the outline, from the apex to the deepest ring; vertices past
        // the fourth repeat it, so the rest of the strip is degenerate rather than a sliver
        if (!outline) { return collapsed(); }
        let phi = beta + select(-halfAng, halfAng, k == CONE_RINGS);
        let c0 = projectEvent(o, apex.pos, apex.t);
        let c1 = projectEvent(o, apex.pos + reach * vec2(cos(phi), sin(phi)), apex.t - reach);
        var dir = toPx(c1) - toPx(c0);
        if (dot(dir, dir) < 1e-8) { return collapsed(); }
        dir = normalize(dir);
        let v = min(vid, 3u);
        out.position = offsetClip(select(c0, c1, (v & 2u) != 0u), vec2(-dir.y, dir.x) * select(-1.0, 1.0, (v & 1u) != 0u) * 2.0);
        out.color = vec4(coneInk, 0.4 * params.tilt);
        out.across = select(-1.0, 1.0, (v & 1u) != 0u) * 2.0;
        out.core = 0.5;
        return out;
    }

    let r = reach * f32(k + 1u) / f32(CONE_RINGS);
    let j = vid >> 1u;
    let ang = f32(j) * TWO_PI / f32(CONE_SEGS);
    let e = 0.01;
    let c = projectEvent(o, apex.pos + r * vec2(cos(ang), sin(ang)), apex.t - r);
    let ahead = toPx(projectEvent(o, apex.pos + r * vec2(cos(ang + e), sin(ang + e)), apex.t - r));
    let behind = toPx(projectEvent(o, apex.pos + r * vec2(cos(ang - e), sin(ang - e)), apex.t - r));
    var dir = ahead - behind;
    if (dot(dir, dir) < 1e-8) { dir = vec2(1.0, 0.0); }
    dir = normalize(dir);
    let back = outline && dot(vec3(cos(ang), sin(ang), 1.0), d) < 0.0;
    out.position = offsetClip(c, vec2(-dir.y, dir.x) * side * 2.0);
    out.color = vec4(coneInk, 0.42 * (1.0 - 0.18 * f32(k)) * params.tilt * select(1.0, 0.75, back));
    out.across = side * 2.0;
    // Dashes, about 7 px a period: the ring's angle, and its dash count around
    let rPx = length(ahead - behind) / (2.0 * e);
    out.tau = ang;
    out.pxPerTau = max(round(TWO_PI * rPx / 7.0), 4.0);
    out.core = select(0.5, -0.5, back);
    return out;
}

/** The cone's fragment: a hairline, dashed where core < 0 (the far side of a ring). */
@fragment
fn fs_cone(in: VOut) -> @location(0) vec4<f32> {
    if (in.color.a < 0.004) { discard; }
    let aa = 0.6 / max(camera.dpr, 1.0);
    let w = abs(in.core);
    var cover = 1.0 - smoothstep(w - aa, w + aa, abs(in.across));
    if (in.core < 0.0) {
        let f = fract(in.tau * in.pxPerTau / TWO_PI);
        cover *= 1.0 - smoothstep(0.48, 0.56, f);
    }
    let a = in.color.a * cover;
    if (a < 0.003) { discard; }
    return vec4(in.color.rgb * a, a);
}

// ─── Bosons: light on 45° lines, pions and leptons on timelike ones ───

@vertex
fn vs_boson(@builtin(vertex_index) vid: u32, @builtin(instance_index) idx: u32) -> VOut {
    if (params.tilt < 0.002) { return collapsed(); }
    var pos: vec2<f32>;
    var vel: vec2<f32>;
    var age: f32;
    var rgb: vec3<f32>;
    var invGamma = 0.0;             // dτ/dt; 0 for light
    var strength = 0.7;
    let dk = dark();
    if (idx < MAX_PHOTONS) {
        if (idx >= phCount[0]) { return collapsed(); }
        let ph = photonPool[idx];
        if ((ph.flags & 1u) == 0u) { return collapsed(); }
        pos = vec2(ph.posX, ph.posY);
        vel = vec2(ph.velX, ph.velY);
        age = ph.lifetime;
        let grav = (ph.flags & 2u) != 0u;
        // Light in the displayed coordinates takes its Doppler factor γψ(1 − uψ·v̂)
        let ob = observer();
        let uPsi = ob.n * tanh(ob.psi);
        let D = (1.0 - dot(uPsi, vel)) / sqrt(max(1.0 - dot(uPsi, uPsi), 1e-6));
        var light = select(INK_OCHRE_L, INK_OCHRE_D, dk);
        if (D < 1.0) { light = mix(light, select(INK_SIENNA_L, INK_SIENNA_D, dk), clamp((1.0 - D) / 0.3, 0.0, 1.0)); }
        else { light = mix(light, select(INK_INDIGO_L, INK_INDIGO_D, dk), clamp((D - 1.0) / 0.45, 0.0, 1.0)); }
        rgb = select(light, select(INK_MADDER_L, INK_MADDER_D, dk), grav);
        strength = 0.55;
    } else {
        let k = idx - MAX_PHOTONS;
        if (k >= piCount[0]) { return collapsed(); }
        let p = pionPool[k];
        if ((p.flags & 1u) == 0u) { return collapsed(); }
        pos = vec2(p.posX, p.posY);
        let w = vec2(p.wX, p.wY);
        invGamma = inverseSqrt(1.0 + dot(w, w));
        vel = w * invGamma;
        age = f32(p.age) * PHYSICS_DT;
        let lepton = p.kind == 1u;
        rgb = select(select(INK_MULBERRY_L, INK_MULBERRY_D, dk), select(INK_VERDIGRIS_L, INK_VERDIGRIS_D, dk), lepton);
        strength = 0.8;
    }
    let o = observer();
    if (o.observing) { pos = nearImage(pos, o.aNow); }
    // Back along its straight path to where it was emitted, or to the depth
    let L = min(age, params.depth * 1.6);
    if (L <= 0.0) { return collapsed(); }
    let end = (vid & 2u) != 0u;           // 0, 1: the past end; 2, 3: now
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    let e0 = disp(o, pos - vel * L, params.tNow - L);
    let e1 = disp(o, pos, params.tNow);
    let c0 = project(e0.xy, e0.z);
    let c1 = project(e1.xy, e1.z);
    var dir = toPx(c1) - toPx(c0);
    let lenPx = length(dir);
    if (lenPx < 1e-4) { return collapsed(); }
    dir = dir / lenPx;
    let c = select(c0, c1, end);
    let h = select(e0.z, e1.z, end);
    var out: VOut;
    out.position = offsetClip(c, vec2(-dir.y, dir.x) * side * HALF_PX);
    var a = strength * ageAlpha(min(h, 0.0)) * params.tilt * select(1.0, 0.0, h > 0.5);
    if (!o.observing && h < -1e-3 && underSheet(c)) { a *= mix(1.0, SEEN, params.tilt); }
    out.color = vec4(rgb, a);
    out.across = side * HALF_PX;
    // Proper time from the emission: L/γ in all, for the beads of a massive boson
    out.tau = select(NO_TAU, select(0.0, L * invGamma, end), invGamma > 0.0);
    out.pxPerTau = select(0.0, lenPx / max(L * invGamma, 1e-5), invGamma > 0.0);
    out.core = 0.55;
    return out;
}

// ─── Slice points: the bodies where the observer's present cuts their world lines ───

struct POut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) @interpolate(flat) ring: f32,     // 1: a ring, 0: filled
    @location(3) @interpolate(flat) px: f32,       // radius in px, for the ring's width
};

@vertex
fn vs_pierce(@builtin(vertex_index) vid: u32, @builtin(instance_index) s: u32) -> POut {
    var out: POut;
    out.position = vec4(0.0, 0.0, 0.0, 1.0);
    out.color = vec4(0.0);
    out.uv = vec2(0.0);
    out.ring = 0.0;
    out.px = 1.0;
    if (params.pierce < 0.5) { return out; }
    let o = observer();
    if (!o.observing) { return out; }
    let l = lineOf(s, o);
    if (!l.ok) { return out; }
    let pc = slicePierce(s, l, o);
    if (!pc.found) { return out; }
    let e = disp(o, pc.p.pos, pc.p.t);
    let r = max(particleAux[s].radius, 2.5 / camera.zoom);
    let corner = vec2(select(-1.0, 1.0, (vid & 1u) != 0u), select(-1.0, 1.0, (vid & 2u) != 0u));
    out.position = project(e.xy + corner * r * 1.25, e.z);
    let selected = s == params.selected;
    out.color = vec4(select(unpack(color[s]), accent(), selected), 1.0);
    out.uv = corner * 1.25;
    out.ring = select(0.0, 1.0, params.pierce < 1.5);
    out.px = r * camera.zoom;
    return out;
}

// ─── The accelerated observer's horizons (roadmap §6.6) ───
// Its world line is the hyperbola about a corner 1/α behind it (frame-slice.wgsl, kind 6:
// FrameState.omega is α, phi n̂'s angle). The null planes through the corner, (x − c)·n̂ = ±(t − t_c),
// bound what it can ever see (the future one: events beyond it never send it light) and what it
// can ever signal; both are drawn, hatched, over the time shown and across the domain. Null
// planes are null in any frame, so the observer's coordinates show them at 45° too.

struct HOut {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) which: f32,
    @location(1) alpha: f32,
};

@vertex
fn vs_horizon(@builtin(vertex_index) vid: u32, @builtin(instance_index) k: u32) -> HOut {
    var out: HOut;
    out.position = vec4(0.0, 0.0, 0.0, 1.0);
    out.which = f32(k);
    out.alpha = 0.0;
    if (params.frameOn == 0u || abs(frameState.kind - 6.0) > 0.5 || frameState.valid < 0.5) { return out; }
    if (params.tilt < 0.05 && k != 2u) { return out; }
    let o = observer();
    let a = max(frameState.omega, 1e-6);
    let n = vec2(cos(frameState.phi), sin(frameState.phi));
    let m = vec2(-n.y, n.x);
    let uA = frameState.u;
    let wA = dot(uA, n) / sqrt(max(1.0 - dot(uA, uA), 1e-6));
    let xc = frameState.xA - n * (sqrt(1.0 + wA * wA) / a);
    let tc = frameState.tA - wA / a;
    let Y = 0.6 * max(params.domainW, params.domainH);
    if (k == 2u) {
        // The corner line: on every one of the observer's slices, 1/α behind it, so seen from
        // above it is where the horizon stands in the observer's space
        let c0 = projectEvent(o, xc - m * Y, tc);
        let c1 = projectEvent(o, xc + m * Y, tc);
        var dir = toPx(c1) - toPx(c0);
        if (dot(dir, dir) < 1e-6) { return out; }
        dir = normalize(dir);
        out.position = offsetClip(select(c0, c1, (vid & 2u) != 0u), vec2(-dir.y, dir.x) * select(-0.7, 0.7, (vid & 1u) != 0u));
        out.alpha = 0.6 * max(params.tilt, 0.75);
        return out;
    }
    let t = select(params.tNow - params.depth, params.tNow + params.future, (vid & 2u) != 0u);
    let y = select(-1.0, 1.0, (vid & 1u) != 0u) * Y;
    let side = select(1.0, -1.0, k == 1u);
    let pos = xc + n * (side * (t - tc)) + m * y;
    out.position = projectEvent(o, pos, t);
    out.alpha = 0.14 * params.tilt;
    return out;
}

/** Hatching in screen space, the future horizon's one way and the past's the other. */
@fragment
fn fs_horizon(in: HOut) -> @location(0) vec4<f32> {
    if (in.which > 1.5) { return vec4(ink() * in.alpha, in.alpha); }
    let px = in.position.xy / max(camera.dpr, 1.0);
    let u = select(px.x + px.y, px.x - px.y, in.which > 0.5);
    let f = abs(fract(u / 9.0) - 0.5) * 9.0;
    let cover = 1.0 - smoothstep(0.35, 0.95, f);
    let a = in.alpha * cover;
    if (a < 0.003) { discard; }
    return vec4(ink() * a, a);
}

/** Under Seen, tilted: the light in flight, from where slot s pierces the cone to the observer now. */
@vertex
fn vs_seenRay(@builtin(vertex_index) vid: u32, @builtin(instance_index) s: u32) -> VOut {
    if (params.seen < 0.5 || params.tilt < 0.05) { return collapsed(); }
    let o = observer();
    let l = lineOf(s, o);
    if (!l.ok) { return collapsed(); }
    let pc = conePierceOf(s, l, o);
    if (!pc.found) { return collapsed(); }
    let c0 = projectEvent(o, pc.p.pos, pc.p.t);
    let c1 = projectEvent(o, o.xA, o.tA);
    var dir = toPx(c1) - toPx(c0);
    if (dot(dir, dir) < 1e-6) { return collapsed(); }
    dir = normalize(dir);
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    var out: VOut;
    out.position = offsetClip(select(c0, c1, (vid & 2u) != 0u), vec2(-dir.y, dir.x) * side * 1.5);
    let rgb = select(mix(unpack(color[s]), ink(), 0.35), accent(), s == params.selected);
    out.color = vec4(rgb, 0.3 * params.tilt);
    out.across = side * 1.5;
    out.tau = NO_TAU;
    out.pxPerTau = 0.0;
    out.core = 0.45;
    return out;
}

@fragment
fn fs_pierce(in: POut) -> @location(0) vec4<f32> {
    let d = length(in.uv);
    let aa = 1.0 / max(in.px, 1.0);
    var a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
    if (in.ring > 0.5) {
        let w = max(1.2 / max(in.px, 1.0), 0.12);
        a *= smoothstep(1.0 - w - aa, 1.0 - w + aa, d) * 0.9;
    }
    a *= in.color.a;
    if (a < 0.003) { discard; }
    return vec4(in.color.rgb * a, a);
}

// ─── Events: an open circle where a world line starts or ends during the run, merges, or
// takes a sudden kick (a bounce, a collision, a close pass) ───

/** |Δw| between samples i − 1 and i of slot s's ring (stored order), 0 at the ends. */
fn kickAt(s: u32, l: Line, i: u32) -> f32 {
    if (i == 0u || i >= l.count) { return 0.0; }
    let a = s * WL_LEN * WL_STRIDE + ((l.start + i - 1u) & WL_MASK) * WL_STRIDE;
    let b = s * WL_LEN * WL_STRIDE + ((l.start + i) & WL_MASK) * WL_STRIDE;
    return length(vec2(wlData[b + 3u] - wlData[a + 3u], wlData[b + 4u] - wlData[a + 4u]));
}

/** An event lineKeep found and lineWrite listed. */
@vertex
fn vs_event(@builtin(vertex_index) vid: u32, @builtin(instance_index) idx: u32) -> POut {
    let ev = lineEvents[idx];
    let corner = vec2(select(-1.0, 1.0, (vid & 1u) != 0u), select(-1.0, 1.0, (vid & 2u) != 0u));
    var out: POut;
    // The quad reaches the ring's outer edge (its 0.6 px half-width and a 0.6 px edge): past it
    // fs_event's every fragment is transparent
    out.position = offsetClip(vec4(ev.clip, 0.0, 1.0), corner * (EVENT_PX + 1.2));
    out.uv = corner * (EVENT_PX + 1.2);
    out.ring = 1.0;
    out.px = EVENT_PX;
    let selected = ev.slot == params.selected;
    out.color = vec4(select(mix(unpack(color[ev.slot]), ink(), 0.35), accent(), selected), ev.alpha);
    return out;
}

/** An open circle: the ground inside a hairline ring, so it reads over the line it marks. */
@fragment
fn fs_event(in: POut) -> @location(0) vec4<f32> {
    let d = length(in.uv);
    let aa = 0.6 / max(camera.dpr, 1.0);
    let ring = 1.0 - smoothstep(0.6 - aa, 0.6 + aa, abs(d - in.px));
    let fill = 1.0 - smoothstep(in.px - aa, in.px + aa, d);
    let a = max(ring, fill) * in.color.a;
    if (a < 0.003) { discard; }
    let rgb = mix(ground(), in.color.rgb, ring / max(max(ring, fill), 1e-4));
    return vec4(rgb * a, a);
}

// ─── The known future (roadmap §6.2) ───
// A prescribed body's world line is given, so its future is known: drawn from its curve above
// the present, up to params.future, faint and dashed, a hollow bead at each beadStep of its
// proper time, fading as it rises. Free bodies' futures stay blank. Each segment is its own quad,
// so one that jumps a seam on a periodic domain simply isn't drawn.

@group(0) @binding(20) var<storage, read> curves: array<vec4<f32>>;
@group(0) @binding(21) var<storage, read> prescribedList: array<u32>;

const FUTURE_SEGS: u32 = 96u;
const DASH_PX: f32 = 6.0;       // the least dash and gap drawn as dashes

/** Slot s's curve at GPU time t, through its deck, in the image nearest `anchor`. */
fn futurePoint(c: Curve, deck: vec4<f32>, t: f32, anchor: vec2<f32>) -> LinePoint {
    let cp = curveAt(c, t);
    var p: LinePoint;
    p.pos = nearImage(deck.xy * (cp.pos - deck.zw) * params.scaleA, anchor);
    p.t = t;
    p.tau = cp.tau;
    return p;
}

@vertex
fn vs_future(@builtin(vertex_index) vid: u32, @builtin(instance_index) k: u32) -> VOut {
    if (params.future <= 0.0 || k >= prescribedList[0]) { return collapsed(); }
    let s = prescribedList[1u + k];
    let b = particles[s];
    if ((b.flags & (FLAG_ALIVE | FLAG_PRESCRIBED)) != (FLAG_ALIVE | FLAG_PRESCRIBED)) { return collapsed(); }
    let o = observer();
    let cb = s * CURVE_VEC4S;
    let c = curveFrom(curves[cb], curves[cb + 1u], curves[cb + 2u], curves[cb + 3u]);
    if (c.kind == CURVE_HELD) { return collapsed(); }   // the hand's future isn't known
    let mb = s * WL_META_STRIDE;
    let bits = wlMeta[mb + 4u];
    let deck = vec4(select(1.0, -1.0, (bits & 1u) != 0u), select(1.0, -1.0, (bits & 2u) != 0u),
                    bitcast<f32>(wlMeta[mb + 5u]), bitcast<f32>(wlMeta[mb + 6u]));
    var anchor = vec2(b.posX, b.posY);
    if (o.observing) { anchor = nearImage(anchor, o.aNow); }

    // Segment j of the future, and this vertex's end (0 or 1) and side of it
    let j = vid / 6u;
    let corner = vid % 6u;
    let end = select(0u, 1u, corner == 1u || corner == 4u || corner == 5u);
    let side = select(-1.0, 1.0, corner == 2u || corner == 3u || corner == 5u);
    let step = params.future / f32(FUTURE_SEGS);
    let p0 = futurePoint(c, deck, params.tNow + step * f32(j), anchor);
    let p1 = futurePoint(c, deck, params.tNow + step * f32(j + 1u), anchor);
    if (isBreak(p0, p1)) { return collapsed(); }
    let c0 = projectEvent(o, p0.pos, p0.t);
    let c1 = projectEvent(o, p1.pos, p1.t);
    var dir = toPx(c1) - toPx(c0);
    let len = length(dir);
    dir = select(vec2(1.0, 0.0), dir / max(len, 1e-6), len > 1e-6);
    var at = p0;
    if (end == 1u) { at = p1; }
    let rgb = select(mix(unpack(color[s]), ink(), 0.35), accent(), s == params.selected);
    // Faint, and fading toward the top of what is shown; seen from above, faint throughout
    let rise = (at.t - params.tNow) / params.future;
    var out: VOut;
    out.position = offsetClip(select(c0, c1, end == 1u), vec2(-dir.y, dir.x) * side * BEAD_REACH);
    out.color = vec4(rgb, 0.55 * (1.0 - 0.7 * rise));
    out.across = side * BEAD_REACH;
    out.tau = at.tau;
    out.pxPerTau = len / max(abs(p1.tau - p0.tau), 1e-6);
    out.core = select(0.6, 0.95, s == params.selected);
    return out;
}

/**
 * The future's fragment: a hairline dashed in proper time, four dashes to a bead, solid where
 * they would be under DASH_PX apart; hollow beads.
 */
@fragment
fn fs_future(in: VOut) -> @location(0) vec4<f32> {
    if (in.color.a < 0.004) { discard; }
    let d = abs(in.across);
    let aa = 0.6 / max(camera.dpr, 1.0);
    var cover = 1.0 - smoothstep(in.core - aa, in.core + aa, d);
    let period = params.beadStep * 0.25;
    let dashPx = max(period * in.pxPerTau, 1e-3);
    let dash = 1.0 - smoothstep(0.5, 0.5 + aa / dashPx, fract(in.tau / period));
    cover *= mix(1.0, dash, smoothstep(DASH_PX * 0.5, DASH_PX, dashPx));
    if (in.pxPerTau > 0.0) {
        let spacing = params.beadStep * in.pxPerTau;
        let k = round(in.tau / params.beadStep);
        let bd = length(vec2((in.tau - k * params.beadStep) * in.pxPerTau, in.across));
        let ring = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, abs(bd - BEAD_PX + 0.3));
        cover = max(cover, ring * smoothstep(6.0, 10.0, spacing));
    }
    let a = in.color.a * cover;
    if (a < 0.003) { discard; }
    return vec4(in.color.rgb * a, a);
}

// ─── Ticks' light (roadmap §6.4) ───
// The selected body's beads are its clock's ticks, and each tick's light is drawn: where its
// future light cone crosses the present, a ring growing at c, and tilted, the null ray to the
// event where it reaches each other world line (h = (t − t_k) − |x(t) − x_k| rises along a
// timelike line, so the event is bisected as the slicer's), which is marked. A prescribed
// receiver's future is known, so a reception still to come is found on its curve, above the
// present. The light interacts with nothing: it is the tick seen, not a signal sent. Rays and
// marks only while the scene has at most RECEIVERS bodies; the newest TICKS ticks within the depth.

const TICKS: u32 = 32u;
const RECEIVERS: u32 = 24u;

/** The point on line l where its proper time is tau (between samples, linearly). */
fn pointAtTau(s: u32, l: Line, tau: f32) -> LinePoint {
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        if (pointOf(s, l, mid).tau <= tau) { lo = mid; } else { hi = mid; }
    }
    let a = pointOf(s, l, lo);
    let b = pointOf(s, l, hi);
    let k = select(0.0, clamp((tau - a.tau) / (b.tau - a.tau), 0.0, 1.0), abs(b.tau - a.tau) > 1e-9);
    var p: LinePoint;
    p.pos = mix(a.pos, b.pos, k);
    p.t = mix(a.t, b.t, k);
    p.tau = tau;
    return p;
}

/** The point on line l at lab time t (between samples, linearly). */
fn pointAtT(s: u32, l: Line, t: f32) -> LinePoint {
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        if (pointOf(s, l, mid).t <= t) { lo = mid; } else { hi = mid; }
    }
    let a = pointOf(s, l, lo);
    let b = pointOf(s, l, hi);
    let k = select(0.0, clamp((t - a.t) / (b.t - a.t), 0.0, 1.0), abs(b.t - a.t) > 1e-9);
    var p: LinePoint;
    p.pos = mix(a.pos, b.pos, k);
    p.t = t;
    p.tau = mix(a.tau, b.tau, k);
    return p;
}

/** Tick k back from the newest of the selected body's line (k = 0 the newest), if within the depth. */
struct Tick {
    ok: bool,
    e: LinePoint,
};

fn tickOf(sel: u32, l: Line, k: u32) -> Tick {
    var out: Tick;
    out.ok = false;
    let now = pointOf(sel, l, l.n - 1u);
    let first = pointOf(sel, l, 0u);
    let step = params.beadStep;
    let tau = (floor(now.tau / step) - f32(k)) * step;
    if (tau < first.tau) { return out; }
    out.e = pointAtTau(sel, l, tau);
    out.ok = out.e.t >= params.tNow - params.depth;
    return out;
}

/**
 * What a tick asks of each point of another world line, a function that rises along any timelike
 * line: PROBE_LIGHT, has the tick's light reached it; PROBE_REST, is it past the tick's
 * rest-frame plane t − t_k = u·(x − x_k); PROBE_RADAR, is its radar time past the tick's.
 */
const PROBE_LIGHT: u32 = 0u;
const PROBE_REST: u32 = 1u;
const PROBE_RADAR: u32 = 2u;

struct Probe {
    mode: u32,
    e: LinePoint,       // the tick
    u: vec2<f32>,       // the body's velocity there (PROBE_REST)
};

fn probeG(pr: Probe, p: LinePoint) -> f32 {
    switch pr.mode {
        case 0u: { return (p.t - pr.e.t) - length(p.pos - pr.e.pos); }
        case 1u: { return (p.t - pr.e.t) - dot(pr.u, p.pos - pr.e.pos); }
        default: { return radarTime(p) - pr.e.tau; }
    }
}

/** Where probe pr crosses slot j's world line: in its recorded past, or on a prescribed body's
 *  known future up to params.future. */
fn crossingOf(pr: Probe, j: u32, o: Obs) -> Tick {
    var out: Tick;
    out.ok = false;
    let l = lineOf(j, o);
    if (!l.ok || !l.alive) { return out; }
    let last = pointOf(j, l, l.n - 1u);
    if (probeG(pr, last) >= 0.0) {
        var lo = 0u;
        var hi = l.n - 1u;
        if (probeG(pr, pointOf(j, l, 0u)) >= 0.0) { return out; }
        for (var it = 0; it < 12; it++) {
            if (hi - lo <= 1u) { break; }
            let mid = (lo + hi) >> 1u;
            if (probeG(pr, pointOf(j, l, mid)) < 0.0) { lo = mid; } else { hi = mid; }
        }
        let a = pointOf(j, l, lo);
        let b = pointOf(j, l, hi);
        let ha = probeG(pr, a);
        let hb = probeG(pr, b);
        let k = select(0.0, clamp(ha / (ha - hb), 0.0, 1.0), abs(ha - hb) > 1e-9);
        out.e.pos = mix(a.pos, b.pos, k);
        out.e.t = mix(a.t, b.t, k);
        out.e.tau = mix(a.tau, b.tau, k);
        out.ok = true;
        return out;
    }
    // Still to come: on a prescribed body's known curve
    if ((particles[j].flags & FLAG_PRESCRIBED) == 0u || params.future <= 0.0) { return out; }
    let cb = j * CURVE_VEC4S;
    let c = curveFrom(curves[cb], curves[cb + 1u], curves[cb + 2u], curves[cb + 3u]);
    if (c.kind == CURVE_HELD) { return out; }
    var lo = params.tNow;
    var hi = params.tNow + params.future;
    if (probeG(pr, futurePoint(c, l.deck, hi, l.anchor)) < 0.0) { return out; }
    for (var it = 0; it < 24; it++) {
        let mid = 0.5 * (lo + hi);
        if (probeG(pr, futurePoint(c, l.deck, mid, l.anchor)) < 0.0) { lo = mid; } else { hi = mid; }
    }
    out.e = futurePoint(c, l.deck, hi, l.anchor);
    out.ok = true;
    return out;
}

/** The selected body's line, when its ticks' light is drawn. */
fn tickLine(o: Obs) -> Line {
    var l: Line;
    l.ok = false;
    let sel = params.selected;
    if (sel >= params.maxParticles) { return l; }
    l = lineOf(sel, o);
    if (!l.alive || l.n < 2u) { l.ok = false; }
    return l;
}

/** Where tick e's light crosses the present now, in direction phi: the lab's present, or the
 *  observer's once its coordinates are shown. */
fn tickFront(o: Obs, e: LinePoint, phi: f32) -> LinePoint {
    let n = vec2(cos(phi), sin(phi));
    var lam = params.tNow - e.t;
    if (o.observing && o.s > 0.5) {
        lam = (o.tA - e.t + dot(o.u, e.pos - o.xA)) / max(1.0 - dot(o.u, n), 1e-4);
    }
    var p: LinePoint;
    p.pos = e.pos + max(lam, 0.0) * n;
    p.t = e.t + max(lam, 0.0);
    p.tau = NO_TAU;
    return p;
}

@vertex
fn vs_tickRing(@builtin(vertex_index) vid: u32, @builtin(instance_index) k: u32) -> VOut {
    let o = observer();
    let l = tickLine(o);
    if (!l.ok) { return collapsed(); }
    let tk = tickOf(params.selected, l, k);
    if (!tk.ok) { return collapsed(); }
    let j = vid >> 1u;
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    let ang = f32(j) * TWO_PI / f32(CONE_SEGS);
    let e = 0.01;
    let p = tickFront(o, tk.e, ang);
    let r = p.t - tk.e.t;
    if (r <= 0.0) { return collapsed(); }
    let c = projectEvent(o, p.pos, p.t);
    let ahead = toPx(projectEvent(o, tickFront(o, tk.e, ang + e).pos, tickFront(o, tk.e, ang + e).t));
    let behind = toPx(projectEvent(o, tickFront(o, tk.e, ang - e).pos, tickFront(o, tk.e, ang - e).t));
    var dir = ahead - behind;
    if (dot(dir, dir) < 1e-8) { dir = vec2(1.0, 0.0); }
    dir = normalize(dir);
    var out: VOut;
    out.position = offsetClip(c, vec2(-dir.y, dir.x) * side * 1.5);
    // Fainter as it spreads: gone once it has crossed the domain (or the depth)
    let reach = min(length(vec2(params.domainW, params.domainH)), params.depth);
    let fade = clamp(1.0 - r / reach, 0.0, 1.0);
    if (fade <= 0.0) { return collapsed(); }
    out.color = vec4(accent(), 0.45 * fade * fade);
    out.across = side * 1.5;
    out.tau = NO_TAU;
    out.pxPerTau = 0.0;
    out.core = 0.5;
    return out;
}

@vertex
fn vs_tickRay(@builtin(vertex_index) vid: u32, @builtin(instance_index) idx: u32) -> VOut {
    if (params.tilt < 0.05) { return collapsed(); }
    let o = observer();
    let l = tickLine(o);
    if (!l.ok) { return collapsed(); }
    let j = idx % RECEIVERS;
    if (j == params.selected || j >= params.maxParticles) { return collapsed(); }
    let tk = tickOf(params.selected, l, idx / RECEIVERS);
    if (!tk.ok) { return collapsed(); }
    var pr: Probe;
    pr.mode = PROBE_LIGHT;
    pr.e = tk.e;
    let r = crossingOf(pr, j, o);
    if (!r.ok) { return collapsed(); }
    let c0 = projectEvent(o, tk.e.pos, tk.e.t);
    let c1 = projectEvent(o, r.e.pos, r.e.t);
    var dir = toPx(c1) - toPx(c0);
    if (dot(dir, dir) < 1e-8) { return collapsed(); }
    dir = normalize(dir);
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    var out: VOut;
    out.position = offsetClip(select(c0, c1, (vid & 2u) != 0u), vec2(-dir.y, dir.x) * side * 1.5);
    out.color = vec4(accent(), 0.32 * params.tilt);
    out.across = side * 1.5;
    out.tau = NO_TAU;
    out.pxPerTau = 0.0;
    out.core = 0.45;
    return out;
}

@vertex
fn vs_tickMark(@builtin(vertex_index) vid: u32, @builtin(instance_index) idx: u32) -> POut {
    var out: POut;
    out.position = vec4(0.0, 0.0, 0.0, 1.0);
    out.color = vec4(0.0);
    out.uv = vec2(0.0);
    out.ring = 0.0;
    out.px = 1.0;
    if (params.tilt < 0.05) { return out; }
    let o = observer();
    let l = tickLine(o);
    if (!l.ok) { return out; }
    let j = idx % RECEIVERS;
    if (j == params.selected || j >= params.maxParticles) { return out; }
    let tk = tickOf(params.selected, l, idx / RECEIVERS);
    if (!tk.ok) { return out; }
    var pr: Probe;
    pr.mode = PROBE_LIGHT;
    pr.e = tk.e;
    let r = crossingOf(pr, j, o);
    if (!r.ok) { return out; }
    let corner = vec2(select(-1.0, 1.0, (vid & 1u) != 0u), select(-1.0, 1.0, (vid & 2u) != 0u));
    let R = 2.2;
    out.position = offsetClip(projectEvent(o, r.e.pos, r.e.t), corner * (R + 1.0));
    out.uv = corner * (R + 1.0) / R;
    out.px = R;
    out.color = vec4(accent(), 0.9 * params.tilt);
    return out;
}

// ─── Simultaneity at the ticks (roadmap §6.4) ───
// Each of the selected body's ticks has two nows on every other world line: its rest frame's,
// the plane t − t_k = u_k·(x − x_k), and radar's, the events whose radar time (τ₁ + τ₂)/2 is the
// tick's, τ₁ when the body's light leaves to reach the event and τ₂ when the event's light comes
// back. Tilted, from each tick to each other world line, as for its light: the rest frame's chord
// straight and dashed, and the radar surface's trace solid, over the straight path between the
// tick and the event it reaches (each point between the tick's light cones, where radar time
// rises with t). They agree for a body that moves uniformly; for the travelling twin the rest
// frame's sweep across home's line at the turn, and radar's stay even. Radar needs the body's
// future: a prescribed body's curve has it, and a free body's radar events appear once their
// light has come back. An open domain only (§6.1).
//
// simulTrace, a workgroup per tick and receiver, solves them into simul once a frame: SIM_PTS
// points of the radar trace (x, y, t, 1), the tick first and the event last, then the rest
// frame's event; w = 0 where there is none. vs_simul draws them.

const SIM_PTS: u32 = 17u;
const SIM_STRIDE: u32 = 18u;    // SIM_PTS, then the rest frame's event
const BIG: f32 = 1e30;

@group(0) @binding(22) var<storage, read_write> simulOut: array<vec4<f32>>;
@group(0) @binding(23) var<storage, read> simul: array<vec4<f32>>;

/** The selected body as the observer whose radar time is taken: its curve when prescribed (its
 *  whole line, the future too), else its recorded line. */
struct ObsLine {
    known: bool,
    c: Curve,
    l: Line,
};

var<private> obsLine: ObsLine;

fn obsLineOf(l: Line) -> ObsLine {
    var ol: ObsLine;
    ol.l = l;
    ol.known = false;
    let sel = params.selected;
    if ((particles[sel].flags & FLAG_PRESCRIBED) != 0u) {
        let cb = sel * CURVE_VEC4S;
        ol.c = curveFrom(curves[cb], curves[cb + 1u], curves[cb + 2u], curves[cb + 3u]);
        ol.known = ol.c.kind != CURVE_HELD;
    }
    return ol;
}

/**
 * The selected body's radar time of event p, (τ₁ + τ₂)/2: on its curve by bisection, or on its
 * recorded samples. −BIG when even its oldest light reaches p too late (τ₁ before its history),
 * BIG while p's light hasn't come back (τ₂ still to come).
 */
fn radarTime(p: LinePoint) -> f32 {
    if (obsLine.known) {
        let reach = params.depth + params.future + params.domainW + params.domainH;
        var lo = p.t - reach;
        var hi = p.t;
        for (var it = 0; it < 24; it++) {
            let mid = 0.5 * (lo + hi);
            let q = futurePoint(obsLine.c, obsLine.l.deck, mid, obsLine.l.anchor);
            if ((p.t - q.t) - length(q.pos - p.pos) >= 0.0) { lo = mid; } else { hi = mid; }
        }
        let tau1 = futurePoint(obsLine.c, obsLine.l.deck, 0.5 * (lo + hi), obsLine.l.anchor).tau;
        lo = p.t;
        hi = p.t + reach;
        for (var it = 0; it < 24; it++) {
            let mid = 0.5 * (lo + hi);
            let q = futurePoint(obsLine.c, obsLine.l.deck, mid, obsLine.l.anchor);
            if ((q.t - p.t) - length(q.pos - p.pos) < 0.0) { lo = mid; } else { hi = mid; }
        }
        let tau2 = futurePoint(obsLine.c, obsLine.l.deck, 0.5 * (lo + hi), obsLine.l.anchor).tau;
        return 0.5 * (tau1 + tau2);
    }
    let s = params.selected;
    let l = obsLine.l;
    let first = pointOf(s, l, 0u);
    let last = pointOf(s, l, l.n - 1u);
    if ((p.t - first.t) - length(first.pos - p.pos) < 0.0) { return -BIG; }
    if ((last.t - p.t) - length(last.pos - p.pos) < 0.0) { return BIG; }
    // τ₁: (t_p − t) − |x(t) − x_p| falls along the line
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        let q = pointOf(s, l, mid);
        if ((p.t - q.t) - length(q.pos - p.pos) >= 0.0) { lo = mid; } else { hi = mid; }
    }
    var a = pointOf(s, l, lo);
    var b = pointOf(s, l, hi);
    var fa = (p.t - a.t) - length(a.pos - p.pos);
    var fb = (p.t - b.t) - length(b.pos - p.pos);
    let tau1 = mix(a.tau, b.tau, select(0.0, clamp(fa / (fa - fb), 0.0, 1.0), abs(fa - fb) > 1e-9));
    // τ₂: (t − t_p) − |x(t) − x_p| rises along it
    lo = 0u;
    hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        let q = pointOf(s, l, mid);
        if ((q.t - p.t) - length(q.pos - p.pos) < 0.0) { lo = mid; } else { hi = mid; }
    }
    a = pointOf(s, l, lo);
    b = pointOf(s, l, hi);
    fa = (a.t - p.t) - length(a.pos - p.pos);
    fb = (b.t - p.t) - length(b.pos - p.pos);
    let tau2 = mix(a.tau, b.tau, select(0.0, clamp(fa / (fa - fb), 0.0, 1.0), abs(fa - fb) > 1e-9));
    return 0.5 * (tau1 + tau2);
}

/** The selected body's velocity at lab time t: its curve's, or between its samples there. */
fn obsVelocity(t: f32) -> vec2<f32> {
    if (obsLine.known) {
        let w = curveAt(obsLine.c, t).w;
        return obsLine.l.deck.xy * w * inverseSqrt(1.0 + dot(w, w));
    }
    let s = params.selected;
    let l = obsLine.l;
    var lo = 0u;
    var hi = l.n - 1u;
    for (var it = 0; it < 12; it++) {
        if (hi - lo <= 1u) { break; }
        let mid = (lo + hi) >> 1u;
        if (pointOf(s, l, mid).t <= t) { lo = mid; } else { hi = mid; }
    }
    let a = pointOf(s, l, lo);
    let b = pointOf(s, l, hi);
    return (b.pos - a.pos) / max(b.t - a.t, 1e-6);
}

// The tick (x, y, t, 1), the radar event, the rest frame's event, and (τ_k, 0, 0, 0)
var<workgroup> wgEnds: array<vec4<f32>, 4>;

@compute @workgroup_size(32)
fn simulTrace(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) i: u32) {
    let chord = wg.x;
    let k = chord / RECEIVERS;
    let j = chord % RECEIVERS;
    let o = observer();
    let l = tickLine(o);
    if (l.ok) { obsLine = obsLineOf(l); }
    if (i == 0u) {
        var ends = array<vec4<f32>, 4>(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0));
        if (l.ok && params.topology < 0 && j != params.selected && j < params.maxParticles) {
            let tk = tickOf(params.selected, l, k);
            if (tk.ok) {
                ends[0] = vec4(tk.e.pos, tk.e.t, 1.0);
                ends[3] = vec4(tk.e.tau, 0.0, 0.0, 0.0);
                var pr: Probe;
                pr.e = tk.e;
                pr.mode = PROBE_RADAR;
                let radar = crossingOf(pr, j, o);
                if (radar.ok) { ends[1] = vec4(radar.e.pos, radar.e.t, 1.0); }
                pr.mode = PROBE_REST;
                pr.u = obsVelocity(tk.e.t);
                let rest = crossingOf(pr, j, o);
                if (rest.ok) { ends[2] = vec4(rest.e.pos, rest.e.t, 1.0); }
            }
        }
        wgEnds = ends;
    }
    let ends = workgroupUniformLoad(&wgEnds);
    if (i >= SIM_STRIDE) { return; }
    let at = chord * SIM_STRIDE + i;
    if (i == SIM_PTS) { simulOut[at] = select(vec4(0.0), ends[2], ends[0].w > 0.5); return; }
    if (ends[0].w < 0.5 || ends[1].w < 0.5) { simulOut[at] = vec4(0.0); return; }
    if (i == 0u) { simulOut[at] = ends[0]; return; }
    if (i == SIM_PTS - 1u) { simulOut[at] = ends[1]; return; }
    // Above a point P between the tick and the event: the tick's past cone there has radar time
    // under τ_k (its light reaches the body at the tick) and its future cone over it
    let P = mix(ends[0].xy, ends[1].xy, f32(i) / f32(SIM_PTS - 1u));
    let D = length(P - ends[0].xy);
    var lo = ends[0].z - D;
    var hi = ends[0].z + D;
    var p: LinePoint;
    p.pos = P;
    for (var it = 0; it < 24; it++) {
        p.t = 0.5 * (lo + hi);
        if (radarTime(p) < ends[3].x) { lo = p.t; } else { hi = p.t; }
    }
    simulOut[at] = vec4(P, 0.5 * (lo + hi), 1.0);
}

struct SOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) across: f32,
    @location(2) along: f32,                        // px from the tick
    @location(3) @interpolate(flat) dashed: f32,
};

/** Point i of a chord: the radar trace's, or the rest frame's straight chord's. */
fn simulPoint(base: u32, radar: bool, i: u32) -> vec3<f32> {
    if (radar) { return simul[base + i].xyz; }
    return mix(simul[base].xyz, simul[base + SIM_PTS].xyz, f32(i) / f32(SIM_PTS - 1u));
}

@vertex
fn vs_simul(@builtin(vertex_index) vid: u32, @builtin(instance_index) idx: u32) -> SOut {
    var out: SOut;
    out.position = vec4(0.0, 0.0, 0.0, 1.0);
    out.color = vec4(0.0);
    out.across = 0.0;
    out.along = 0.0;
    out.dashed = 0.0;
    if (params.tilt < 0.05) { return out; }
    let radar = (idx & 1u) == 1u;
    let base = (idx >> 1u) * SIM_STRIDE;
    if (simul[base].w < 0.5) { return out; }
    if (radar) {
        for (var i = 1u; i < SIM_PTS; i++) { if (simul[base + i].w < 0.5) { return out; } }
    } else if (simul[base + SIM_PTS].w < 0.5) { return out; }
    let o = observer();
    let i = vid >> 1u;
    let p = simulPoint(base, radar, i);
    let c = projectEvent(o, p.xy, p.z);
    let prev = simulPoint(base, radar, max(i, 1u) - 1u);
    let next = simulPoint(base, radar, min(i + 1u, SIM_PTS - 1u));
    var dir = toPx(projectEvent(o, next.xy, next.z)) - toPx(projectEvent(o, prev.xy, prev.z));
    if (dot(dir, dir) < 1e-8) { return out; }
    dir = normalize(dir);
    let side = select(-1.0, 1.0, (vid & 1u) != 0u);
    let tick = simul[base].xyz;
    out.position = offsetClip(c, vec2(-dir.y, dir.x) * side * 1.5);
    out.color = vec4(ink(), 0.42 * params.tilt * ageAlpha(min(disp(o, p.xy, p.z).z, 0.0)));
    out.across = side * 1.5;
    out.along = length(toPx(c) - toPx(projectEvent(o, tick.xy, tick.z)));
    out.dashed = select(1.0, 0.0, radar);
    return out;
}

/** A hairline: the rest frame's dashed, radar's solid. */
@fragment
fn fs_simul(in: SOut) -> @location(0) vec4<f32> {
    let aa = 0.6 / max(camera.dpr, 1.0);
    var cover = 1.0 - smoothstep(0.45 - aa, 0.45 + aa, abs(in.across));
    if (in.dashed > 0.5) {
        let f = fract(in.along / 6.0) * 6.0;
        cover *= 1.0 - smoothstep(3.5 - aa, 3.5 + aa, f);
    }
    let a = in.color.a * cover;
    if (a < 0.003) { discard; }
    return vec4(in.color.rgb * a, a);
}

// ─── Shared fragment: hairline core, proper-time beads ───

@fragment
fn fs_main(in: VOut) -> @location(0) vec4<f32> {
    if (in.color.a < 0.004) { discard; }
    let d = abs(in.across);
    let aa = 0.6 / max(camera.dpr, 1.0);   // a one-device-px edge (across is CSS px)
    var cover = 1.0 - smoothstep(in.core - aa, in.core + aa, d);
    if (in.tau >= 0.0 && in.pxPerTau > 0.0) {
        let spacing = params.beadStep * in.pxPerTau;
        let k = round(in.tau / params.beadStep);
        let along = (in.tau - k * params.beadStep) * in.pxPerTau;
        let bd = length(vec2(along, in.across));
        // Beads closer than ~8 px would read as a thick line, not a clock: fade them out
        let show = smoothstep(6.0, 10.0, spacing);
        cover = max(cover, (1.0 - smoothstep(BEAD_PX - aa, BEAD_PX + aa, bd)) * show);
    }
    let a = in.color.a * cover;
    if (a < 0.003) { discard; }
    return vec4(in.color.rgb * a, a);
}
