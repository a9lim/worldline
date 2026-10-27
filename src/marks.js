// ─── Marks ───
// The plate's own marks as inline SVG, drawn the way the scene draws them, in its inks: the
// key's swatches (scene-key.js), the frames of the margin's ticks, which show a law's mark
// while it is in force, the list of figures' small drawings, the edge diagrams, and the body
// glyphs of the next body and the selected one. Colours are CSS variables, so every mark
// follows the theme without a redraw.

export const ink = (n) => `var(--ink-${n})`;
export const MUTED = 'var(--text-muted)', TEXT = 'var(--text)', ACCENT = 'var(--accent)', GROUND = 'var(--bg-canvas)';
// A body is its ink mixed into the ground inside an outline of the ink, as particle.wgsl draws it
export const fillOf = (c) => `color-mix(in srgb, ${c} var(--key-body), ${GROUND})`;
export const markOf = (c) => `color-mix(in srgb, ${c} 55%, ${TEXT})`;
const faint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const n2 = (x) => +x.toFixed(2);

export const line = (x1, y1, x2, y2, c, w = 1, extra = '') =>
    `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" style="stroke:${c};stroke-width:${w}"${extra}/>`;
export const circle = (cx, cy, r, stroke, fill = 'none', w = 1, extra = '') =>
    `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" style="stroke:${stroke};fill:${fill};stroke-width:${w}"${extra}/>`;
export const path = (d, c, w = 1, extra = '') => `<path d="${d}" style="stroke:${c};fill:none;stroke-width:${w}"${extra}/>`;
const poly = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n2(x)},${n2(y)}`).join('');

/** Hatching across a w × h box at (x, y): lines of constant x + y (rising) or x − y. */
export function hatch(x, y, w, h, rising, c, step = 3.5) {
    let out = '';
    for (let s = -h; s < w + h; s += step) {
        const [x1, x2] = rising ? [x + s, x + s + h] : [x + s + h, x + s];
        out += line(x1, y + h, x2, y, c, 0.9);
    }
    // A nested svg clips to its own box
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${out}</svg>`;
}

/** ⊙ (out of the plane) or ⊗ (into it), as heatmap-render.wgsl draws Bz. */
export function bSymbol(cx, cy, into, c, r = 3.6) {
    const k = r * 0.61;
    return circle(cx, cy, r, c, 'none', 1) + (into
        ? line(cx - k, cy - k, cx + k, cy + k, c) + line(cx - k, cy + k, cx + k, cy - k, c)
        : circle(cx, cy, r * 0.3, 'none', c, 0));
}

/** An arrow from (x1, y1) to (x2, y2) with an open head h long. */
export function arrowTo(x1, y1, x2, y2, c, w = 1.1, h = 3.2) {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    const p = (s, t) => `${n2(x2 - ux * s - uy * t)},${n2(y2 - uy * s + ux * t)}`;
    return line(x1, y1, x2, y2, c, w)
        + `<path d="M${p(h, -h * 0.7)}L${n2(x2)},${n2(y2)}L${p(h, h * 0.7)}" style="stroke:${c};fill:none;stroke-width:${w};stroke-linejoin:round"/>`;
}

/** A short arrow through a 26 × 14 swatch's middle at angle a (radians, y down). */
const arrow = (a, c) => arrowTo(13 - Math.cos(a) * 9, 7 - Math.sin(a) * 9, 13 + Math.cos(a) * 9, 7 + Math.sin(a) * 9, c);

/** A wave packet: a sinusoid under a Gaussian envelope, as boson-render.wgsl draws a photon. */
function packet(c, cx = 13, cy = 7, half = 11, amp = 2.6, wl = 5) {
    const pts = [];
    for (let k = 0; k <= 48; k++) {
        const s = -half + 2 * half * k / 48, env = Math.exp(-((s / half) ** 2) * 2.4);
        pts.push([cx + s, cy - amp * env * Math.sin(2 * Math.PI * s / wl)]);
    }
    return path(poly(pts), c, 1.2);
}

/** A body: its fill, outline and, by kind, its sign or its spoke (a 26 × 14 swatch's). */
function body(c, mark) {
    const R = 5.2;
    let out = circle(13, 7, R, c, mark === 'anti' ? GROUND : fillOf(c), 1.25);
    const m = markOf(c), k = R * 0.42;
    if (mark === '+' || mark === '-') {
        out += line(13 - k, 7, 13 + k, 7, m, 1.1);
        if (mark === '+') out += line(13, 7 - k, 13, 7 + k, m, 1.1);
        out += line(13 + R * 0.6 * 0.6, 7 - R * 0.6 * 0.8, 13 + R * 0.6, 7 - R * 0.8, m, 1.1);   // the rim tick
    } else if (mark === 'spoke') {
        out += line(13, 7, 13 + R * 0.6, 7 - R * 0.8, m, 1.1);
    }
    return out;
}

/** A past light cone: its two generators and a ring, the far half dashed. */
function cone(c) {
    return path('M13,1.5 L4,11.5 M13,1.5 L22,11.5', c, 1)
        + path('M4,11.5 A9,2 0 0 0 22,11.5', c, 1)
        + path('M4,11.5 A9,2 0 0 1 22,11.5', c, 1, ' stroke-dasharray="1.5 2"');
}

const SWATCH = {
    pos: () => body(ink('sienna'), '+'),
    neg: () => body(ink('prussian'), '-'),
    neutral: () => body(MUTED, 'spoke'),
    anti: () => body(MUTED, 'anti'),
    hole: () => circle(13, 7, 4.4, 'var(--key-void-edge)', 'var(--key-void)', 0.8)
        + circle(13, 7, 6.4, faint(TEXT, 55), 'none', 1, ' stroke-dasharray="2 2"'),
    selected: () => body(MUTED, 'spoke') + circle(13, 7, 6.6, ACCENT, 'none', 1.25),
    trail: () => line(1, 7, 25, 7, MUTED, 1) + [4, 11, 18, 25].map((x) => circle(x - 0.5, 7, 1.7, 'none', MUTED, 0)).join(''),
    // A body whose outline is its clock, swept heavier from the top (particle.wgsl)
    clock: () => body(MUTED, 'spoke') + path('M13,2.75 A4.25,4.25 0 1 1 8.75,7', markOf(MUTED), 1.7),
    light: () => packet(ink('ochre')),
    cone: (o) => cone(o?.ink ? MUTED : ACCENT),
    event: () => line(13, 0, 13, 14, MUTED, 1) + circle(13, 7, 3.3, TEXT, GROUND, 1),
    // The accelerated observer's horizons: two hatched null planes and their corner line
    horizon: () => hatch(1, 1, 11, 12, true, MUTED) + hatch(14, 1, 11, 12, false, MUTED) + line(13, 0, 13, 14, TEXT, 1.2),
    // The streak plate's tracks: solid approaching, dashed receding (src/streak.js)
    track: (o) => path('M2,11 C9,10 15,6 24,3', MUTED, o?.receding ? 1 : 1.8, o?.receding ? ' stroke-dasharray="3 2.5"' : ''),
    // Under Seen: a world line pierced by the observer's cone, its light running to the apex
    seenLight: () => line(6, 0, 6, 14, MUTED, 1) + circle(6, 9, 2.6, MUTED, GROUND, 1)
        + line(8, 7.5, 22, 1.5, MUTED, 0.8, ' stroke-opacity="0.6"'),
    // A tick's light: the ray from a bead to where it arrives on another line, marked
    tick: () => line(4, 0, 4, 14, ACCENT, 1) + circle(4, 10, 1.7, 'none', ACCENT, 0)
        + line(4, 10, 20, 2, ACCENT, 0.8, ' stroke-opacity="0.6"') + line(20, 0, 20, 14, MUTED, 1)
        + circle(20, 2, 2.2, 'none', ACCENT, 0),
    // The known future: dashed above, hollow beads (spacetime-render.wgsl fs_future)
    future: () => line(1, 7, 25, 7, MUTED, 1, ' stroke-dasharray="3 3"') + [7, 19].map((x) => circle(x, 7, 1.9, MUTED, GROUND, 0.9)).join(''),
    gravity: () => path('M1,10 C7,3 17,3 25,9', ink('umber'), 1.3)
        + line(7.5, 5.6, 8.6, 7.9, ink('umber')) + line(13, 4.3, 13.2, 6.8, ink('umber')) + line(18.6, 4.9, 17.8, 7.3, ink('umber')),
    efield: () => path('M1,10 C8,10 14,4 25,4', ink('prussian'), 1)
        + path('M11.4,4.6 L14.2,6.8 L11.0,8.3', ink('prussian'), 1, ' stroke-linejoin="round"'),
    equi: () => line(1, 4, 25, 4, ink('sienna'), 1.3) + line(1, 10.5, 25, 10.5, ink('prussian'), 1.3, ' stroke-dasharray="4 3"'),
    bz: () => bSymbol(7, 7, false, ink('verdigris')) + bSymbol(19, 7, true, ink('verdigris')),
    yukawa: () => path('M1,9 C8,3 17,3 25,9', ink('viridian'), 1.4, ' stroke-dasharray="0.1 3" stroke-linecap="round"'),
    higgs: () => hatch(1, 1, 11, 12, true, ink('sap')) + hatch(14, 1, 11, 12, false, ink('violet')) + line(13, 0, 13, 14, TEXT, 1.4),
    axion: () => hatch(1, 1, 11, 12, true, ink('ochre')) + hatch(14, 1, 11, 12, false, ink('indigo')) + line(13, 0, 13, 14, TEXT, 1.4),
    extB: (o) => bSymbol(13, 7, o.into, ink('verdigris')),
    extE: (o) => arrow(o.angle, ink('prussian')),
    extG: (o) => arrow(o.angle, ink('umber')),
    lens: () => path('M1,3 C9,3 10,7 13,7 C16,7 17,3 25,3', MUTED, 1) + path('M1,11 C9,11 10,9 13,9 C16,9 17,11 25,11', MUTED, 1),
    star: () => path('M6,9 A7,7 0 0 1 11,2.6', ACCENT, 1.6) + circle(19, 9, 1.6, 'none', ACCENT, 0),
    // The margin's ticks: a force that draws only its arrows, the torque arc, the rulers, the
    // bosons' pools, the fields' damping
    force: (o) => arrow(0, ink(o.ink)),
    torque: (o) => path('M8,10.5 A5.5,5.5 0 1 1 18.5,9', ink(o.ink), 1.1)
        + path('M16.2,7.4 L18.5,9 L19.6,6.4', ink(o.ink), 1.1, ' stroke-linejoin="round"'),
    rulers: () => line(1, 10, 25, 10, MUTED, 1) + [1, 7, 13, 19, 25].map((x, i) => line(x, i % 2 ? 7.5 : 5, x, 10, MUTED, 1)).join(''),
    bosons: () => packet(MUTED, 13, 7, 8, 2.2, 4) + circle(3, 3.5, 1.5, 'none', ink('mulberry'), 0) + circle(23, 10.5, 1.5, 'none', ink('mulberry'), 0),
    damping: () => {
        const pts = [];
        for (let k = 0; k <= 40; k++) { const s = k / 40; pts.push([1 + 24 * s, 7 - 5 * Math.exp(-3 * s) * Math.cos(s * 6 * Math.PI)]); }
        return path(poly(pts), MUTED, 1.1);
    },
    comoving: () => line(1, 7, 25, 7, faint(MUTED, 55), 1) + [4, 10, 16, 22].map((x) => circle(x, 7, 1.6, 'none', MUTED, 0)).join(''),
};

/** An inline swatch: the scene's mark for `kind` (SWATCH), 26 × 14 px. */
export function swatch(kind, o = {}, cls = '') {
    return `<svg class="${cls}" viewBox="0 0 26 14" width="26" height="14" aria-hidden="true">${kind ? SWATCH[kind](o) : ''}</svg>`;
}

/** Fill every `[data-mark]` frame under root with its mark (`data-mark-ink` names an ink). */
export function fillMarks(root = document) {
    for (const el of root.querySelectorAll('[data-mark]')) {
        if (el.firstElementChild) continue;
        el.innerHTML = swatch(el.dataset.mark, { ink: el.dataset.markInk });
    }
}

// ─── The list of figures: each preset's experiment in a 48 × 32 drawing ───
const PLATES = {
    // Charges of both signs gyrating while they drift: two trochoids of opposite hand
    cyclotron: () => {
        const troch = (y0, s, c) => {
            const pts = [];
            for (let i = 0; i <= 64; i++) { const t = i / 64 * 4 * Math.PI; pts.push([5 + t * 2.6 - s * 3.3 * Math.sin(t), y0 + s * 3.3 * Math.cos(t)]); }
            return path(poly(pts), c, 1);
        };
        return troch(10, 1, ink('sienna')) + troch(22.5, -1, ink('prussian'));
    },
    // Home's world line straight up, the traveller's out and back, both beaded by proper time
    twinBounce: () => line(10, 30, 10, 2, MUTED, 1) + path('M10,30 L37,16 L10,2', MUTED, 1)
        + [24.5, 19, 13.5, 8].map((y) => circle(10, y, 1.3, 'none', MUTED, 0)).join('')
        + [[20.8, 24.4], [31.6, 18.8], [31.6, 13.2], [20.8, 7.6]].map(([x, y]) => circle(x, y, 1.3, 'none', MUTED, 0)).join(''),
    // The wheel at rest, and moving: contracted, its spoke bent
    wheel: () => circle(12, 16, 8.5, MUTED, fillOf(MUTED), 1.1) + line(12, 16, 17.5, 9.5, markOf(MUTED), 1.1)
        + `<ellipse cx="36" cy="16" rx="4.2" ry="8.5" style="stroke:${MUTED};fill:${fillOf(MUTED)};stroke-width:1.1"/>`
        + path('M36,16 Q38.4,12.2 35.4,8.6', markOf(MUTED), 1.1),
    // An electron bent past the nucleus, shedding a packet along its path
    bremsstrahlung: () => circle(24, 20, 5.5, ink('sienna'), fillOf(ink('sienna')), 1.1)
        + path('M2,10 C14,10 19,11 26,9.5 C33,8 38,4 46,1.5', ink('prussian'), 1)
        + packet(ink('ochre'), 40, 13.5, 6, 1.8, 3.2),
    // Domains of +v and −v hatched each their own way, a wall between
    kibbleZurek: () => hatch(1, 1, 22, 30, true, ink('sap')) + hatch(23, 1, 24, 30, false, ink('violet'))
        + path('M23,1 C18,10 29,20 22,31', TEXT, 1.3),
    // A star split into two arcs on the Einstein ring around the lens
    microlensing: () => circle(24, 16, 9.5, faint(MUTED, 55), 'none', 0.8, ' stroke-dasharray="1.5 2"')
        + path('M16.5,10.2 A9.5,9.5 0 0 1 31.5,10.2', ACCENT, 1.6) + path('M21.2,25.1 A9.5,9.5 0 0 0 26.8,25.1', ACCENT, 1.6)
        + circle(24, 16, 2.6, MUTED, fillOf(MUTED), 1),
};

/** The list of figures' drawing for a preset. */
export function plateGlyph(key) {
    const draw = PLATES[key];
    return `<svg viewBox="0 0 48 32" width="48" height="32" aria-hidden="true">${draw ? draw() : ''}</svg>`;
}

// ─── Edges: open, a wall, and the plane glued into a torus, Klein bottle or projective plane ───
// The gluings are the identification diagrams, matching topology.js: Klein glues left to right
// straight and top to bottom reversed ((x, y) ~ (W − x, y + H)); RP² reverses both.
function glued(c, top, bottom, left, right) {
    const head = (x, y, dx, dy, dbl) => {
        const one = (ox, oy) => path(`M${n2(x + ox - dx * 3 - dy * 2.4)},${n2(y + oy - dy * 3 + dx * 2.4)} L${n2(x + ox)},${n2(y + oy)} L${n2(x + ox - dx * 3 + dy * 2.4)},${n2(y + oy - dy * 3 - dx * 2.4)}`, c, 1, ' stroke-linejoin="round"');
        return dbl ? one(-dx * 1.9, -dy * 1.9) + one(dx * 1.9, dy * 1.9) : one(0, 0);
    };
    return `<rect x="6" y="6" width="26" height="26" style="fill:none;stroke:${c};stroke-width:1"/>`
        + head(19, 6, top, 0, false) + head(19, 32, bottom, 0, false)
        + head(6, 19, 0, -left, true) + head(32, 19, 0, -right, true);
}
const EDGES = {
    open: (c) => `<rect x="6" y="6" width="26" height="26" style="fill:none;stroke:${c};stroke-width:1;stroke-dasharray:3 2.5"/>`
        + arrowTo(19, 19, 36, 19, c, 1, 2.6),
    wall: (c) => `<rect x="8" y="8" width="22" height="22" style="fill:none;stroke:${c};stroke-width:1.4"/>`
        + [0, 1, 2, 3, 4].map((i) => line(8 + i * 5.5, 8, 5 + i * 5.5, 5, c, 0.8) + line(8 + i * 5.5, 30, 5 + i * 5.5, 33, c, 0.8)
            + line(8, 8 + i * 5.5, 5, 5 + i * 5.5, c, 0.8) + line(30, 8 + i * 5.5, 33, 5 + i * 5.5, c, 0.8)).join(''),
    torus: (c) => glued(c, 1, 1, 1, 1),
    klein: (c) => glued(c, 1, -1, 1, 1),
    rp2: (c) => glued(c, 1, -1, 1, -1),
};

/** The edge diagram named `key` (open, wall, torus, klein, rp2), 38 × 38 px, in colour c. */
export function edgeGlyph(key, c = MUTED) {
    return `<svg viewBox="0 0 38 38" width="38" height="38" aria-hidden="true">${EDGES[key](c)}</svg>`;
}

/**
 * A body as particle.wgsl draws it, in an svg centred on 0: its radius from ∛m² (the rest
 * radius, scaled), its ink from the sign of its charge, its sign or spoke, hollow for
 * antimatter, a void with its ergosphere dashed for a black hole, ringed in the accent when
 * selected; the spin as an arc beside it, its length the rim speed.
 */
export function bodyGlyph(svg, { m = 1, q = 0, s = 0, anti = false, hole = false, selected = false }, scale = 6.5) {
    const half = svg.viewBox.baseVal.width / 2;
    const room = half - (selected ? 4 : 1.5) - (Math.abs(s) > 0.01 ? 4 : 0);
    const R = Math.min(room, Math.max(2.5, Math.cbrt(m * m) * scale));
    let out = '';
    if (hole) {
        out = circle(0, 0, R * 0.75, 'var(--key-void-edge)', 'var(--key-void)', 0.8)
            + circle(0, 0, R, faint(TEXT, 55), 'none', 1, ' stroke-dasharray="2 2"');
    } else {
        const c = q > 0.05 ? ink('sienna') : q < -0.05 ? ink('prussian') : MUTED;
        out = circle(0, 0, R, c, anti ? GROUND : fillOf(c), 1.25);
        const mk = markOf(c), k = R * 0.42;
        if (Math.abs(q) > 0.05) {
            out += line(-k, 0, k, 0, mk, 1.2);
            if (q > 0) out += line(0, -k, 0, k, mk, 1.2);
            out += line(R * 0.36, -R * 0.48, R * 0.6, -R * 0.8, mk, 1.2);
        } else {
            out += line(0, 0, R * 0.6, -R * 0.8, mk, 1.2);
        }
    }
    if (Math.abs(s) > 0.01) {
        // The spin's arc, its sweep the rim speed (a full turn would be c), arrowed its way
        const r = R + 3, a0 = -Math.PI / 2, a1 = a0 + Math.sign(s) * Math.max(0.35, Math.PI * 1.6 * Math.abs(s));
        const P = (a) => `${n2(r * Math.cos(a))},${n2(r * Math.sin(a))}`;
        out += path(`M${P(a0)} A${r},${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${s > 0 ? 1 : 0} ${P(a1)}`, ink('violet'), 1);
    }
    if (selected) out += circle(0, 0, R + 3.2, ACCENT, 'none', 1.25);
    svg.innerHTML = out;
}

/** A sparkline of `values` in a w × h svg: zero dashed, the line in graphite, the last value marked. */
export function sparkline(svg, values, w = 64, h = 14) {
    values = values.filter(Number.isFinite);
    if (!values.length) { svg.innerHTML = ''; return; }
    let lo = 0, hi = 0;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1, n = values.length;
    const X = (i) => 1 + (w - 3) * (n > 1 ? i / (n - 1) : 1), Y = (v) => h - 2 - (h - 4) * (v - lo) / span;
    svg.innerHTML = line(1, Y(0), w - 1, Y(0), 'var(--border-strong)', 1, ' stroke-dasharray="2 2"')
        + path(poly(values.map((v, i) => [X(i), Y(v)])), MUTED, 1)
        + circle(X(n - 1), Y(values[n - 1]), 1.7, 'none', TEXT, 0);
}
