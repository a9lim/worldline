// ─── The figure caption ───
// One live italic line under the scene saying what you are looking at, with its current
// values: "Fig. 1.", the preset and what it shows now (its own numbers, read from the scene
// snapshot, the stats and the GPU state), or the view, the observer's frame, the selected
// body. Rebuilt a few times a second (shared/colophon.js caption() writes only on change).
import { getLang } from './i18n.js';

const fmt = (x, d = 2) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d));
const speedOf = (b) => { const w2 = b.wx * b.wx + b.wy * b.wy; return { v: Math.sqrt(w2 / (1 + w2)), g: Math.sqrt(1 + w2) }; };

const TEXT = {
    en: {
        fig: 'Fig. 1.',
        paused: 'Paused. ',
        empty: (touch) => `An empty plane. ${touch ? 'Tap' : 'Click'} to place a body, and drag to throw it.`,
        plane: (n, touch) => `Seen from above, the present holds ${n} ${n === 1 ? 'body' : 'bodies'}, each trail the shadow of a world line. ${touch ? 'Spacetime' : 'Alt-drag, W or Spacetime'} tilts the plane into time.`,
        spacetime: (D, B) => `Spacetime, ${D} deep. Each world line climbs to the plane of the present, beaded every ${B} of its own time, so a moving clock beads more sparsely; light runs at 45°.`,
        observer: (v, g, lag) => `In the coordinates of an observer moving at ${v}c (γ = ${g}): the plane is that observer’s present${lag ? `, ${lag} behind the lab` : ''}, and the lab’s rulers shrink by 1/γ.`,
        selected: (v, tau) => ` The red body moves at ${v}c; its clock reads ${tau}.`,
        // The presets, seen from above
        cyclotron: (B, E, d) => `Charges of both signs gyrate in a uniform B of ${B} and drift together across the E of ${E} at E/B = ${d}c, whatever their sign or speed; tilted into spacetime, their world lines are helices of opposite hand leaning the same way.`,
        twinBounce: (v, g, tt, th, d) => `The traveller flies at ${v}c (γ = ${g}) to the far wall and back. Its clock reads ${tt} to home’s ${th}, ${d} younger: a moving clock runs at 1/γ of the rate.`,
        twinSpacetime: (v, g, tt, th, d, B) => `Home’s world line climbs straight up, and the traveller’s leans out to the far wall at ${v}c (γ = ${g}) and back to meet it. Both are beaded every ${B} of their own time, the traveller’s more sparsely: its clock reads ${tt} to home’s ${th}, ${d} younger.`,
        wheel: (v, g, tm, tr) => `The same wheel twice, its rim at 0.9c: at rest, and crossing at ${v}c (γ = ${g}), contracted by 1/γ, its spoke bent because each of its points shows a different moment of the wheel’s own time, and its clock at ${tm} to the other’s ${tr}.`,
        bremsstrahlung: (E) => `Electrons at 0.95c swing past a nucleus of charge 6, and each, bent, sheds light in packets beamed along its path: ${E} radiated so far.`,
        kzBefore: (T, tau) => `The Higgs field sits at φ = 0 in a warm bath while its mass term ramps toward the transition, ${T} from now with a quench time of ${tau}; then each patch falls to +v or −v on its own.`,
        kzOrdering: (T, pct) => `${T} past the transition, φ = 0 is unstable and each patch falls toward +v or −v on its own: ${pct}% of the plane has ordered so far.`,
        kzAfter: (T, pct, n0, n, tau) => `${T} past the transition, ${pct}% of the plane has frozen into domains of +v and −v, with ${n0} of wall per unit area as they formed and ${n} now. The walls straighten and shrink; a quench slower than ${tau} would have formed fewer.`,
        microlensing: (M, thE, beta, mu) => `A mass of ${M} drifts in front of a backdrop star, ${beta} Einstein radii (${thE}) off the line of sight; the star splits in two images${mu ? ` that brighten it ${mu}×` : ''}, along Paczyński’s light curve.`,
    },
    ja: {
        fig: '図1',
        paused: '一時停止中。',
        empty: (touch) => `空の平面。${touch ? 'タップ' : 'クリック'}で物体を置き、ドラッグで投げる。`,
        plane: (n, touch) => `上から見た現在に物体が${n}個。軌跡はそれぞれ世界線の影。${touch ? '「時空」' : 'Alt+ドラッグ、W、または「時空」'}で平面を時間の方へ傾ける。`,
        spacetime: (D, B) => `深さ${D}の時空。世界線は現在の平面まで昇り、固有時${B}ごとに珠を打つ。動く時計ほど珠はまばらで、光は45°に進む。`,
        observer: (v, g, lag) => `速さ${v}c（γ = ${g}）で動く観測者の座標。平面はその観測者の現在${lag ? `で、実験室より${lag}遅れる` : 'で'}、実験室の物差しは1/γに縮む。`,
        selected: (v, tau) => `赤い物体の速さは${v}c、その時計は${tau}。`,
        cyclotron: (B, E, d) => `正負の電荷が一様な磁場${B}のまわりを回り、電場${E}を横切って、符号や速さによらずE/B = ${d}cでそろって漂う。時空に傾けると、世界線は巻きの向きが逆で同じ方へ傾くらせんになる。`,
        twinBounce: (v, g, tt, th, d) => `旅する双子は${v}c（γ = ${g}）で遠い壁まで行って戻る。その時計は${tt}、家の時計は${th}で、${d}だけ若い。動く時計は1/γの速さで進む。`,
        twinSpacetime: (v, g, tt, th, d, B) => `家の双子の世界線はまっすぐ上へ昇り、旅する双子の世界線は${v}c（γ = ${g}）で遠い壁へ傾いて出て、戻ってそれと出会う。どちらも固有時${B}ごとに珠を打ち、旅する側の珠のほうがまばら。その時計は${tt}、家の時計は${th}で、${d}だけ若い。`,
        wheel: (v, g, tm, tr) => `縁が0.9cで回る同じ車輪が二つ。一つは静止し、一つは${v}c（γ = ${g}）で進む。動く車輪は1/γに縮み、スポークは曲がり（各点が車輪の固有時の別の瞬間を示す）、時計は${tm}、静止した方は${tr}。`,
        bremsstrahlung: (E) => `0.95cの電子が電荷6の原子核のそばを次々に通り、曲げられるたびに進行方向へ集中した光の波束を放つ。これまでに放射したエネルギーは${E}。`,
        kzBefore: (T, tau) => `ヒッグス場は温浴の中でφ = 0にとどまり、質量項がクエンチ時間${tau}で転移へ向かって変わっていく。転移まであと${T}。その後、各領域が独立に+vか−vへ落ちる。`,
        kzOrdering: (T, pct) => `転移から${T}。φ = 0は不安定になり、各領域が独立に+vか−vへ落ちていく。これまでに秩序化したのは平面の${pct}%。`,
        kzAfter: (T, pct, n0, n, tau) => `転移から${T}。平面の${pct}%が+vと−vの領域に凍りついた。単位面積あたりの壁の長さは形成時に${n0}、今は${n}で、壁はまっすぐになりながら縮む。クエンチ時間が${tau}より長ければ、できる壁はもっと少なかった。`,
        microlensing: (M, thE, beta, mu) => `質量${M}が背景の星の前を横切る。視線からのずれはアインシュタイン半径（${thE}）の${beta}倍で、星は二つの像に分かれ${mu ? `、明るさは${mu}倍` : ''}。パチンスキーの光度曲線に沿って変わる。`,
    },
};

export default class Caption {
    constructor(sim) {
        this.sim = sim;
        this.titleEl = document.getElementById('caption-title');
        this.set = _colophon.caption(document.getElementById('caption-text'), 250);
        this._force = true;
        this._touch = window.matchMedia('(pointer: coarse)').matches;
        this._preset = document.getElementById('preset-select');
    }

    /** Rewrite on the next update, without waiting out the throttle. */
    refresh() { this._force = true; }

    /** The bead step of the spacetime view: a power of 2 near a 14th of its depth (scene-key.js too). */
    _beadStep() { return 2 ** Math.round(Math.log2(this.sim.spacetime.depth() / 14)); }

    /**
     * What the preset shows now, from its live values; '' when the scene no longer fits it.
     * Tilted, only a preset whose state reads in spacetime answers (the twin's clocks, the
     * quench's domains); the rest leave the plate to the spacetime text.
     */
    _presetText(L, key, tilted = false) {
        const sim = this.sim, gp = sim._gpuPhysics, ph = sim.settings;
        const bodies = sim.scene ? sim.scene.bodies : [];
        const body = (i) => (bodies[i] && bodies[i].alive ? bodies[i] : null);
        switch (key) {
            case 'cyclotron': {
                if (tilted) return '';
                const B = Math.abs(ph.extBz), E = Math.abs(ph.extElectric);
                return B > 0 && E < B ? L.cyclotron(fmt(B), fmt(E), fmt(E / B)) : '';
            }
            case 'twinBounce': {
                const home = body(0), trav = body(1);
                if (!home || !trav) return '';
                const { v, g } = speedOf(trav);
                const clocks = [fmt(trav.tau, 1), fmt(home.tau, 1), fmt(Math.max(0, home.tau - trav.tau), 1)];
                return tilted ? L.twinSpacetime(fmt(v), fmt(g), ...clocks, this._beadStep()) : L.twinBounce(fmt(v), fmt(g), ...clocks);
            }
            case 'wheel': {
                if (tilted) return '';
                const rest = body(0), moving = body(1);
                if (!rest || !moving) return '';
                const { v, g } = speedOf(moving);
                return L.wheel(fmt(v), fmt(g), fmt(moving.tau, 1), fmt(rest.tau, 1));
            }
            case 'bremsstrahlung':
                return tilted ? '' : L.bremsstrahlung(fmt(sim.stats.radiated || 0));
            case 'kibbleZurek': {
                // Before the transition, the time to it; after, what the field measures
                // (quench.js): frozen into domains once most of the plane is near ±v and the
                // walls have been counted, as the Kibble–Zurek oracle counts them
                const q = gp && gp._higgsQuench;
                if (!q || !ph.higgsEnabled) return '';
                const left = q.tau - (gp.simTime - q.t0), tau = fmt(q.tau, 0);
                if (left > 0) return L.kzBefore(fmt(left, 0), tau);
                const m = sim.quench && sim.quench.summary;
                const pct = m ? Math.round(100 * m.ordered) : 0;
                if (!m || !m.formed || m.ordered < 0.5) return L.kzOrdering(fmt(-left, 0), pct);
                return L.kzAfter(fmt(-left, 0), pct, m.formed.walls.toPrecision(2), m.walls.toPrecision(2), tau);
            }
            case 'microlensing': {
                if (tilted) return '';
                const lens = body(0), star = sim.lens.star;
                if (!lens || !star || !sim.lens.on) return '';
                const thE = Math.sqrt(4 * lens.m * sim.lens.distance);
                const wrap = (d, L) => d - L * Math.round(d / L);
                const beta = Math.hypot(wrap(lens.x - star.x, sim.domainW), wrap(lens.y - star.y, sim.domainH)) / thE;
                const hits = gp && gp.lensHits;
                const mu = hits && hits.generation === sim.lens.gen && hits.magnification > 0 ? fmt(hits.magnification) : '';
                return L.microlensing(fmt(lens.m, 0), fmt(thE, 1), fmt(beta), mu);
            }
        }
        return '';
    }

    update() {
        const sim = this.sim;
        const L = TEXT[getLang()] || TEXT.en;
        if (this.titleEl.textContent !== L.fig) this.titleEl.textContent = L.fig;
        const key = this._preset.value;
        const opt = this._preset.selectedOptions[0];
        const name = key !== 'none' && opt ? opt.textContent.trim() + (getLang() === 'ja' ? '。' : '. ') : '';

        const n = sim.gpu ? sim.gpu.physics.aliveCount : 0;
        let text = sim.running ? '' : L.paused;
        if (n === 0) {
            text += L.empty(this._touch);
        } else if (sim.frames.active) {
            const st = sim.frames.state;
            const v = st && st.valid ? Math.hypot(st.ux, st.uy) : sim.frames.boostSpeed;
            const g = 1 / Math.sqrt(1 - Math.min(v * v, 0.9999));
            text += name + L.observer(fmt(v), fmt(g), st && st.valid && st.lag > 0.05 ? fmt(st.lag, 1) : '');
        } else if (sim.spacetime.tilt > 0.5) {
            const desc = key !== 'none' ? this._presetText(L, key, true) : '';
            text += name + (desc || L.spacetime(Math.round(sim.spacetime.depth()), this._beadStep()));
        } else if (key !== 'none') {
            // Seen from above, a preset says what it shows, with its numbers. Until the first
            // snapshot of its bodies it gives its description; once the scene no longer fits
            // it (bodies changed by hand), the plain view
            let desc = this._presetText(L, key);
            if (!desc && (!sim.scene || sim.scene.bodies.length === 0)) {
                const k = 'preset.' + key + '.desc';
                const d = window._i18n ? window._i18n.t(k, '') : '';
                if (d && d !== k) desc = d + (getLang() === 'ja' ? '。' : '.');
            }
            text += desc ? name + desc : L.plane(n, this._touch);
        } else {
            text += L.plane(n, this._touch);
        }
        const sel = sim.selectedIdx >= 0 ? sim.stats.selected : null;
        if (sel) text += L.selected(fmt(sel.speed), fmt(sel.tau, 1));
        this.set(text, this._force);
        this._force = false;
    }
}
