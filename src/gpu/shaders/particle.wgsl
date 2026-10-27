// Instanced particle rendering — vertex + fragment.
// Each body is its rest-frame disk, carrying one spoke at body angle θ, pushed through
// the Lorentz map of its centre's velocity (with Relativity on):
//   - a lab offset Δ maps to the rest-frame offset Δ + (γ − 1)(Δ·n̂)n̂, so the disk
//     contracts by 1/γ along v;
//   - the same lab instant is rest-frame time t′ − t′_c = −γvΔ∥ (relativity of
//     simultaneity), when the spoke stood at θ + ω·(t′ − t′_c). The spoke bends, by
//     2·v·v_rim across the diameter; a spoke perpendicular to v stays straight.
// ω is the body's rest-frame rotation rate, or the horizon's Ω_H for a black hole.
//
// The glyph, drawn in the rest frame so all of it contracts with the disk:
//   - a lighter body inside a darker 1.25 px outline, both in the charge's ink
//     (update-colors.wgsl): sienna positive, prussian negative, graphite neutral;
//   - the sign of the charge as a + or − at the centre, so it survives in grey;
//   - the spoke from the centre, or, where the centre carries a sign, a tick at the rim;
//   - antimatter hollow: the ground inside the outline;
//   - in black-hole mode, the horizon as a void, its tick in the ground's colour;
//   - the clock: the outline is its face, and the part of it the body's proper time has
//     swept this turn (clockwise from the top, once per CLOCK_PERIOD) is drawn heavier, so a
//     moving clock, or one deep in a well, visibly lags. Each point reads the body's own time
//     there, τ − γvΔ∥ as the spoke does, so a moving clock's face is skewed by the same
//     simultaneity that bends its spoke.
// Marks show only on bodies at least 5 px across their radius; the edge is antialiased.
//
// Under Seen (roadmap §6.9) a body is drawn as the observer sees it, each point at its own
// retarded time: the observer sits at the origin of the view's coordinates and receives now,
// so the point X of the drawing is seen as it was |X| ago, |X| − |X_c| before the centre the
// slicer found on the cone. The body moving uniformly over that while (v its velocity there),
// the drawing at X is the body's lab offset X − X_c − v·Δt, Δt = |X_c| − |X|, and that point's
// rest-frame time is γ(Δt − v·(X − X_c)) from the centre's: the outline, the spoke and the
// clock face all come from it, so a fast body is stretched toward the observer as it
// approaches and squeezed as it recedes, and turned as it crosses (Terrell, Penrose).

struct CameraUniforms {
    viewMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    zoom: f32,
    canvasWidth: f32,
    canvasHeight: f32,
    isDarkMode: f32,   // 0.0 = light, 1.0 = dark
    relativityOn: f32,
    blackHoleOn: f32,
    seen: f32,         // 1 drawing the view under Seen: the observer at the origin, seeing now
    frameOn: f32,      // drawing a frame's view buffers (frame-slice.wgsl)
    frameImages: f32,  // view entries per slot
};

// Struct definitions (ParticleState, ParticleAux, ParticleDerived) provided by shared-structs.wgsl.

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> particles: array<ParticleState>;
@group(0) @binding(2) var<storage, read> particleAux: array<ParticleAux>;
@group(0) @binding(3) var<storage, read> color: array<u32>;
@group(0) @binding(4) var<storage, read> derived: array<ParticleDerived>;
@group(0) @binding(5) var<storage, read> clocks: array<vec4<f32>>;   // y = τ mod CLOCK_PERIOD, z = θ,
                                                                      // w in a frame's view: its lapse there

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) offset: vec2<f32>,                     // lab offset from the centre, world units
    @location(1) particleColor: vec4<f32>,
    @location(2) @interpolate(flat) boost: vec4<f32>,   // n̂.xy, γ, v
    @location(3) @interpolate(flat) body: vec4<f32>,    // radius, θ, ω, drawn radius
    @location(4) @interpolate(flat) kind: vec2<f32>,    // sign of the charge, antimatter (1/0)
    @location(5) @interpolate(flat) clock: f32,         // the clock's phase, τ mod CLOCK_PERIOD
    @location(6) @interpolate(flat) centre: vec2<f32>,  // the body's centre; under Seen the observer is at the origin
};

// Quad vertices: 2 triangles forming a [-1,1] square
const QUAD_POS = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0),  vec2(1.0, -1.0), vec2(1.0, 1.0),
);

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
    var out: VertexOut;

    let p = particles[instanceIndex];
    // Skip non-alive particles by pushing off-screen
    if ((p.flags & 1u) == 0u) {
        out.position = vec4(0.0, 0.0, -2.0, 1.0);
        return out;
    }

    let r = particleAux[instanceIndex].radius;
    let d = derived[instanceIndex];

    var n = vec2<f32>(1.0, 0.0);
    var gamma = 1.0;
    var speed = 0.0;
    if (camera.relativityOn > 0.5) {
        speed = min(length(vec2(d.velX, d.velY)), MAX_SPEED_RATIO);
        if (speed > 1e-4) {
            n = vec2(d.velX, d.velY) / length(vec2(d.velX, d.velY));
            gamma = 1.0 / sqrt(1.0 - speed * speed);
        }
    }

    var omega = d.angVel;
    if (camera.blackHoleOn > 0.5) {
        let a = abs(d.angMomentum) * d.invMass;   // a = J/M
        omega = sign(d.angVel) * a / max(r * r + a * a, EPSILON);
    }

    // At least 2 px across, as before the contraction; the quad leaves a pixel for the edge
    let drawR = max(r, 2.0 / camera.zoom);
    let quadR = drawR + 1.0 / camera.zoom;
    let corner = QUAD_POS[vertexIndex];
    let perp = vec2(-n.y, n.x);
    var offset = n * corner.x * max(quadR / gamma, 2.0 / camera.zoom) + perp * corner.y * quadR;
    let centre = vec2(p.posX, p.posY);
    if (camera.seen > 0.5 && camera.frameOn > 0.5 && speed > 1e-4) {
        // Seen: the box around where the rim is seen, from 16 of its points
        let v = n * speed;
        var lo = vec2(1e30);
        var hi = vec2(-1e30);
        for (var k = 0u; k < 16u; k++) {
            let ang = f32(k) * TWO_PI / 16.0;
            let rim = (n * cos(ang) / gamma + perp * sin(ang)) * quadR;
            let at = seenAt(centre, rim, v) - centre;
            lo = min(lo, at);
            hi = max(hi, at);
        }
        let mid = 0.5 * (hi + lo);
        let half = 0.5 * (hi - lo) * 1.04 + vec2(1.0 / camera.zoom);
        offset = mid + corner * half;
    }

    out.position = camera.viewMatrix * vec4(p.posX + offset.x, p.posY + offset.y, 0.0, 1.0);
    out.offset = offset;
    out.boost = vec4(n, gamma, speed);
    out.body = vec4(r, clocks[instanceIndex].z, omega, drawR);
    out.clock = clocks[instanceIndex].y;
    out.centre = centre;
    let q = select(0.0, sign(p.charge), abs(p.charge) > 0.5 * BOSON_CHARGE);
    out.kind = vec2(q, select(0.0, 1.0, (p.flags & FLAG_ANTIMATTER) != 0u));

    // Unpack RGBA from u32 (ABGR packed); colors stay per slot in a frame's view
    let slot = select(instanceIndex, instanceIndex / u32(max(camera.frameImages, 1.0)), camera.frameOn > 0.5);
    let packed = color[slot];
    // In a frame's view a body fades with the frame's lapse at it: toward the accelerated
    // observer's horizon, where its clock freezes, to faint beyond it
    let fade = select(1.0, mix(0.12, 1.0, smoothstep(0.0, 0.25, clocks[instanceIndex].w)), camera.frameOn > 0.5);
    out.particleColor = vec4(
        f32(packed & 0xFFu) / 255.0,
        f32((packed >> 8u) & 0xFFu) / 255.0,
        f32((packed >> 16u) & 0xFFu) / 255.0,
        f32((packed >> 24u) & 0xFFu) / 255.0 * fade,
    );

    return out;
}

/**
 * Under Seen, where the point of a body at lab offset `rim` from its centre (at the centre's
 * time) is seen, the body moving uniformly at v: on the observer's past cone at the origin,
 * |P + vτ| = |X_c| − τ for the point P = X_c + rim, the earlier root.
 */
fn seenAt(centre: vec2<f32>, rim: vec2<f32>, v: vec2<f32>) -> vec2<f32> {
    let P = centre + rim;
    let c0 = length(centre);
    let a = max(1.0 - dot(v, v), 1e-4);
    let b = dot(P, v) + c0;
    let c = dot(P, P) - c0 * c0;
    let tau = (b - sqrt(max(b * b + a * c, 0.0))) / a;
    return P + v * tau;
}

/** Coverage of a band |x| < w with an antialiased edge aa wide. */
fn band(x: f32, w: f32, aa: f32) -> f32 {
    return 1.0 - smoothstep(w - aa, w + aa, abs(x));
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let n = in.boost.xy;
    let gamma = in.boost.z;
    let speed = in.boost.w;
    let r = in.body.x;
    let drawR = in.body.w;

    // This point's lab offset from the centre at the centre's time, and its rest-frame time
    // against the centre's: the same lab instant, or under Seen its own retarded time
    var rel = in.offset;
    var toff = -gamma * speed * dot(in.offset, n);
    if (camera.seen > 0.5 && camera.frameOn > 0.5) {
        let dt = length(in.centre) - length(in.centre + in.offset);
        rel = in.offset - n * speed * dt;
        toff = gamma * (dt - speed * dot(in.offset, n));
    }
    // Rest-frame offset of this lab point (pure boost along n̂)
    let par = dot(rel, n);
    let rest = rel + (gamma - 1.0) * par * n;
    let dist = length(rest);
    let aa = max(fwidth(dist), 1e-6);
    let cover = 1.0 - smoothstep(drawR - aa, drawR + aa, dist);
    if (cover <= 0.001) { discard; }

    let px = 1.0 / camera.zoom;                  // one CSS px in world units
    let dk = camera.isDarkMode > 0.5;
    let ground = select(COLOR_CANVAS_LIGHT, COLOR_CANVAS_DARK, dk);
    let ink = in.particleColor.rgb;
    let q = in.kind.x;
    let hole = camera.blackHoleOn > 0.5;
    let rPx = drawR * camera.zoom;

    var rgb: vec3<f32>;
    // Marks a step darker than the outline, so a spoke reads on a graphite body too
    var markInk = mix(ink, select(COLOR_TEXT_LIGHT, COLOR_TEXT_DARK, dk), 0.45);
    if (hole) {
        rgb = select(COLOR_TEXT_LIGHT, COLOR_VOID_DARK, dk);
        // On the dark ground the void needs its edge drawn: a faint hairline at the horizon
        let edge = smoothstep(drawR - 1.0 * px - aa, drawR - 1.0 * px + aa, dist);
        rgb = mix(rgb, mix(COLOR_VOID_DARK, COLOR_TEXT_DARK, 0.3), select(0.0, edge, dk));
        markInk = ground;
    } else {
        // Lighter body, darker outline; antimatter keeps only the outline
        let body = select(mix(ink, ground, select(0.52, 0.38, dk)), ground, in.kind.y > 0.5);
        let outline = smoothstep(drawR - 1.25 * px - aa, drawR - 1.25 * px + aa, dist);
        rgb = mix(body, ink, select(outline, 1.0, rPx < 2.5));
    }

    // The clock: the swept part of the face, a band 3 px in from the rim, its end where
    // this point's own time has reached; antialiased along the rim at both of its ends
    var mark = 0.0;
    if (rPx >= 5.0) {
        let swept = fract((in.clock + toff) / CLOCK_PERIOD);
        let at = fract(atan2(rest.x, -rest.y) / TWO_PI);
        let rim = TWO_PI * dist;
        let arc = smoothstep(-aa, aa, (swept - at) * rim) * smoothstep(-aa, aa, at * rim);
        let face = smoothstep(drawR - 3.0 * px - aa, drawR - 3.0 * px + aa, dist);
        mark = arc * face * select(1.0, 0.6, hole);
    }

    // The sign at the centre, upright in the rest frame
    let hw = 0.55 * px;
    if (!hole && q != 0.0 && rPx >= 5.0) {
        let k = 0.42 * drawR;
        mark = max(mark, band(rest.y, hw, aa) * band(rest.x, k, aa));
        if (q > 0.0) { mark = max(mark, band(rest.x, hw, aa) * band(rest.y, k, aa)); }
    }

    // The spoke, a radius at the angle it held at this point's rest-frame time: from the
    // centre on a neutral body, a tick at the rim where the centre carries a mark
    if (rPx >= 4.0) {
        let spokeAngle = in.body.y + in.body.z * toff;
        let dir = vec2(cos(spokeAngle), sin(spokeAngle));
        let along = dot(rest, dir);
        let across = rest.x * dir.y - rest.y * dir.x;
        let startR = select(0.0, 0.6 * drawR, hole || q != 0.0);
        let spoke = band(across, clamp(0.02 * r, hw, 1.5 * px), aa) * smoothstep(startR - aa, startR + aa, along);
        mark = max(mark, spoke * select(1.0, 0.6, hole));
    }
    rgb = mix(rgb, markInk, mark);

    let alpha = in.particleColor.a * cover;
    // Premultiplied alpha output (required by alphaMode: 'premultiplied').
    return vec4(rgb * alpha, alpha);
}
