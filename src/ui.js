// ─── UI Setup ───
// Wires the colophon, the figure bar and the margin's four tabs (Figure, Laws, World, Measure)
// to the sim. Every control shows the settings store (sim.settings), the modes and the view;
// a control writes the store and calls update(), which applies the laws' prerequisites and the
// mode locks to the store and shows the result everywhere, then pushes it to the GPU.
import { loadPreset, PRESETS, PRESET_ORDER } from './presets.js';
import { startQuench } from './quench.js';
import { DEFAULT_DOMAIN, COL_MERGE, COL_BOUNCE, BOUND_DESPAWN, BOUND_BOUNCE, BOUND_LOOP, TORUS, SPEED_OPTIONS, COL_NAMES, TOPO_NAMES, colFromString, topoFromString } from './config.js';
import { REFERENCE } from './reference.js';
import { quickSave, quickLoad, downloadState, uploadState } from './save-load.js';
import { bindChoice, showChoice, enableChoice, bindPad } from './controls.js';
import { plateGlyph, edgeGlyph, bodyGlyph, fillMarks } from './marks.js';

let antimatterMode = false;
export function getAntimatterMode() { return antimatterMode; }

// The laws' prerequisites, in order, parents before children, so one pass settles the cascade
// (a black hole before the axion it can enable). A law whose prerequisite fails is turned off
// in the store and its tick disabled.
const LAWS = [
    ['gravitomagEnabled', (s) => s.gravityEnabled],
    ['magneticEnabled', (s) => s.coulombEnabled],
    ['radiationEnabled', (s) => s.gravityEnabled || s.coulombEnabled || s.yukawaEnabled],
    ['blackHoleEnabled', (s) => s.relativityEnabled && s.gravityEnabled],
    ['axionEnabled', (s) => s.coulombEnabled || s.yukawaEnabled || s.blackHoleEnabled],
    ['onePNEnabled', (s) => s.relativityEnabled && (s.magneticEnabled || s.gravitomagEnabled || s.yukawaEnabled)],
    ['spinOrbitEnabled', (s) => s.magneticEnabled || s.gravitomagEnabled],
    ['bosonInterEnabled', (s) => s.gravityEnabled || s.coulombEnabled],
];

// The ticks over store keys (relativity and 1PN are the Mechanics choice, expansion the Universe)
const TICKS = {
    'gravity-toggle': 'gravityEnabled', 'gravitomag-toggle': 'gravitomagEnabled',
    'coulomb-toggle': 'coulombEnabled', 'magnetic-toggle': 'magneticEnabled',
    'spinorbit-toggle': 'spinOrbitEnabled', 'yukawa-toggle': 'yukawaEnabled',
    'radiation-toggle': 'radiationEnabled', 'bosoninter-toggle': 'bosonInterEnabled',
    'higgs-toggle': 'higgsEnabled', 'axion-toggle': 'axionEnabled', 'blackhole-toggle': 'blackHoleEnabled',
};

// Edges: open, a wall, or the plane glued into a torus, Klein bottle or projective plane
const EDGE_OF = (sim) => sim.boundaryMode === BOUND_LOOP ? TOPO_NAMES[sim.topology] : sim.boundaryMode === BOUND_BOUNCE ? 'wall' : 'open';

export function setupUI(sim) {
    const S = sim.settings;
    const $ = (id) => document.getElementById(id);
    const panel = $('control-panel');
    const panelToggle = $('panelToggle');

    // i18n helper bound to global runtime; falls back to passed default.
    const _T = (k, fb) => (window._i18n ? window._i18n.t(k, fb) : (fb != null ? fb : k));
    const syncGPU = () => { if (sim.gpu) sim.gpu.applySettings(sim); };
    const syncModes = () => { if (sim.gpu) sim.gpu.syncModes(sim); };

    // ─── The margin: the controls column, opened by Controls and closed by its × ───
    // On a wide window it opens beside the scene, which shrinks to make room; on a narrow
    // one it rises over the scene as a sheet.
    const setMargin = (open) => {
        document.body.classList.toggle('margin-open', open);
        panelToggle.setAttribute('aria-expanded', String(open));
        _haptics.trigger('light');
    };
    const toggleMargin = () => setMargin(!document.body.classList.contains('margin-open'));
    panelToggle.addEventListener('click', toggleMargin);
    $('panelClose').addEventListener('click', () => setMargin(false));
    panel.querySelector('.sheet-handle').addEventListener('click', () => setMargin(false));
    if (window.innerWidth > 900) setMargin(true);

    // ─── A phone keeps the scene's top to one row: Controls beside the colophon, speed and
    // language at the sheet's foot, and the (touch-only) antimatter switch in the figure bar ───
    const narrow = window.matchMedia('(max-width: 600px)');
    const placeTools = () => {
        const tools = document.querySelector('.scene-tools');
        const foot = document.querySelector('.margin-foot');
        const bar = document.querySelector('.scene-controls');
        const [mode, speed, lang] = ['mode-btn', 'speedBtn', 'lang-btn'].map($);
        if (narrow.matches) {
            bar.append(mode);
            foot.append(speed, lang);
        } else {
            tools.prepend(mode, speed, lang);
        }
    };
    placeTools();
    narrow.addEventListener('change', placeTools);

    // ─── Antimatter mode (touch: a tap spawns antimatter while it is on) ───
    const modeBtn = $('mode-btn');
    const syncModeBtn = () => {
        modeBtn.title = antimatterMode ? _T('topbar.modeAntimatterTitle') : _T('topbar.modeNormalTitle');
        drawNextBody();
    };
    modeBtn.addEventListener('click', () => {
        antimatterMode = !antimatterMode;
        modeBtn.setAttribute('aria-pressed', String(antimatterMode));
        syncModeBtn();
    });

    // ═══ Figure ═══

    // ─── The list of figures, and the active figure's knobs ───
    // A figure is a preset: its row loads it (or re-runs it, keeping its knobs), keys 1–6 too.
    // Its knobs (presets.js) sit under its row as scales and in the caption as numbers you
    // drag (caption.js), one value: a knob over a store key reads and writes the store live; a
    // knob of its own holds a value the figure's spawn and tick read from `run.knobs`, and one
    // marked `rerun` runs the figure again when it settles.
    const figureList = $('figure-list');
    const figureRows = {};
    const knobBox = document.createElement('div');
    knobBox.className = 'figure-knobs';
    PRESET_ORDER.forEach((key, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'figure-row';
        row.setAttribute('aria-pressed', 'false');
        row.innerHTML = `<span class="figure-no">${i + 1}</span>${plateGlyph(key)}`
            + `<span class="figure-name" data-i18n="preset.${key}.name">${_T('preset.' + key + '.name', PRESETS[key].name)}</span>`;
        row.addEventListener('click', () => loadFigure(key, { keep: sim.figure === key }));
        figureList.append(row);
        figureRows[key] = row;
    });

    sim.figure = 'none';
    sim.knobValues = {};
    sim.knobs = [];
    const knobScales = [];

    /** The active figure's knobs: { key, def, get, input, commit } for the caption and the scales. */
    const makeKnobs = (fig) => {
        const defs = PRESETS[fig]?.knobs || {};
        return Object.entries(defs).map(([key, def]) => {
            const get = def.store ? () => S[def.store] : () => sim.knobValues[key];
            const input = (v) => {
                if (def.store) { S[def.store] = v; syncGPU(); sim.syncControls(); }
                else sim.knobValues[key] = v;
                showKnobs();
                sim.caption?.refresh();
                sim._dirty = true;
            };
            const commit = () => {
                if (def.rerun) loadFigure(fig, { keep: true });
                else def.commit?.(sim);
            };
            return { key, def, get, input, commit, label: _T(def.label, key) };
        });
    };
    const showKnobs = () => {
        for (const { k, el, out } of knobScales) {
            const v = k.get();
            el.value = k.def.log ? Math.log10(v) : v;
            out.textContent = k.def.fmt(v);
        }
        sim.caption?.syncKnobs();
    };
    const buildKnobs = () => {
        knobBox.replaceChildren();
        knobScales.length = 0;
        for (const k of sim.knobs) {
            const row = document.createElement('div');
            row.className = 'scale-row';
            const id = 'knob-' + k.key;
            const d = k.def;
            const ink = d.ink ? `var(--ink-${d.ink})` : 'var(--text-muted)';
            row.innerHTML = `<label for="${id}">${k.label}</label>`
                + `<input type="range" class="scale" id="${id}" min="${d.log ? Math.log10(d.min) : d.min}" max="${d.log ? Math.log10(d.max) : d.max}" step="${d.log ? 0.01 : d.step}" style="--ink: ${ink}">`
                + `<output for="${id}"></output>`;
            const el = row.querySelector('input'), out = row.querySelector('output');
            el.addEventListener('input', () => { k.input(d.log ? 10 ** +el.value : +el.value); _haptics.trigger('selection'); });
            el.addEventListener('change', () => k.commit());
            knobScales.push({ k, el, out });
            knobBox.append(row);
        }
        knobBox.hidden = !sim.knobs.length;
        const row = figureRows[sim.figure];
        if (row) row.after(knobBox); else knobBox.remove();
        showKnobs();
    };
    const showFigure = () => {
        for (const [key, row] of Object.entries(figureRows)) row.setAttribute('aria-pressed', String(key === sim.figure));
    };

    /** Load a figure ('none' clears); `keep` re-runs it with its knobs as they are. */
    const loadFigure = (key, { keep = false } = {}) => {
        const preset = PRESETS[key];
        if (!preset) { clearScene(); return; }
        if (!keep || sim.figure !== key) {
            sim.knobValues = {};
            for (const [k, d] of Object.entries(preset.knobs || {})) if (!d.store) sim.knobValues[k] = d.value;
        }
        // A store knob's value survives a re-run: the preset writes its default, then the knob
        const kept = keep ? Object.fromEntries(Object.entries(preset.knobs || {}).filter(([, d]) => d.store).map(([, d]) => [d.store, S[d.store]])) : null;
        sim.figure = key;
        loadPreset(key, sim, { quiet: sim._openingScene || keep, knobs: sim.knobValues, settings: kept });
        sim.knobs = makeKnobs(key);
        buildKnobs();
        showFigure();
        sim.caption?.rebuildKnobs();
        sim._dirty = true;
        _haptics.trigger('medium');
    };
    sim.loadFigure = loadFigure;

    // ─── Clear ───
    const clearScene = () => {
        sim.reset();
        sim.setDomain(DEFAULT_DOMAIN, DEFAULT_DOMAIN);
        sim.stats.resetBaseline();
        sim.figure = 'none';
        sim.knobs = [];
        buildKnobs();
        showFigure();
        sim.caption?.rebuildKnobs();
        sim._dirty = true;
        showToast(_T('toast.cleared', 'Simulation cleared'));
        _haptics.trigger('warning');
    };
    $('clearBtn').addEventListener('click', clearScene);

    // ─── The observer: the lab or another frame (frame-panel.js owns its parameters) ───
    const observerChoice = $('observer-choice');
    bindChoice(observerChoice, (key) => {
        if (key === 'lab') { coordsLab.click(); return; }
        // A moving observer is eased into, as the figure bar's observer does
        sim.observerKind = key;
        if (key === 'boost' && !sim.frames.active) toObserver();
        else sim.framePanel?.choose(key);
    });

    // ─── Layers: the Fields overlay, the arrows, the rulers and key ───
    const fieldChoice = $('field-choice');
    bindChoice(fieldChoice, (v) => {
        sim.heatmap.enabled = v !== 'none';
        if (v !== 'none') {
            sim.heatmap.mode = v;
            if (sim._gpuPhysics) sim._gpuPhysics._heatmapMode = v;
        }
        syncGPU();
        sim.sceneKey?.refresh();
        sim._dirty = true;
    });
    const arrowChoice = $('arrow-choice');
    bindChoice(arrowChoice, (key, on) => {
        sim.view[key] = on;
        sim._dirty = true;
    }, { multi: true });
    const toggleArrow = (key) => {
        sim.view[key] = !sim.view[key];
        showChoice(arrowChoice, (k) => !!sim.view[k]);
        sim._dirty = true;
    };
    const gridToggle = $('gridToggle');
    _forms.bindToggle(gridToggle, (v) => { sim.view.grid = v; sim._dirty = true; });

    // ═══ Laws ═══

    // ─── Mechanics: Newton, relativity (signal delay), or relativity with the 1PN forces ───
    const mechChoice = $('mechanics-choice');
    const mechHint = $('mechanics-hint');
    const mechOf = () => S.relativityEnabled ? (S.onePNEnabled ? 'onepn' : 'relativity') : 'newton';
    bindChoice(mechChoice, (v) => {
        S.relativityEnabled = v !== 'newton';
        S.onePNEnabled = v === 'onepn';
        update();
        sim._dirty = true;
    });

    // ─── The ticks over the store ───
    for (const [id, key] of Object.entries(TICKS)) {
        $(id).addEventListener('change', (e) => {
            S[key] = e.target.checked;
            update();
            sim._dirty = true;
            _haptics.trigger('light');
        });
    }

    // ─── Scales over the store ───
    // `{id}Input` holds to(value) and `{id}Value` shows it; input writes from(control) to the
    // store, and show() puts the store back in the control without firing its handler.
    // Hubble is logarithmic (log₁₀ H, from 10⁻⁴, effectively none, to 0.5)
    const fmt2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
    const LOG = { to: (v) => Math.log10(Math.max(v, 1e-4)), from: (v) => 10 ** v };
    const storeScales = [
        { prop: 'bounceFriction', id: 'friction' },
        { prop: 'yukawaMu', id: 'yukawaMu' },
        { prop: 'axionMass', id: 'axionMass' },
        { prop: 'hubbleParam', id: 'hubble', ...LOG, fmt: (v) => (10 ** v).toPrecision(2) },
        { prop: 'higgsMass', id: 'higgsMass' },
        { prop: 'extBz', id: 'extBz' },
    ].map(({ prop, id, to = (v) => v, from = (v) => v, fmt = fmt2 }) => {
        const el = $(id + 'Input');
        const out = $(id + 'Value');
        _forms.bindSlider(el, out, (v) => {
            S[prop] = from(v);
            syncGPU();
            if (prop === 'extBz') { sim.caption?.syncKnobs(); showKnobs(); }
            _haptics.trigger('selection');
        }, fmt);
        return {
            show() {
                el.value = to(S[prop]);
                el.setAttribute('aria-valuenow', el.value);
                out.textContent = fmt(parseFloat(el.value));
            },
        };
    });

    // ═══ World ═══

    // ─── The next body: its scales, and the glyph of what a click will place ───
    const nextGlyph = $('next-body-glyph');
    const nextInputs = ['mass', 'charge', 'spin'].map((k) => $(k + 'Input'));
    function drawNextBody() {
        const [m, q, s] = nextInputs.map((el) => +el.value);
        bodyGlyph(nextGlyph, { m, q: antimatterMode ? -q : q, s: antimatterMode ? -s : s, anti: antimatterMode && !S.blackHoleEnabled, hole: S.blackHoleEnabled }, 9);
    }
    _forms.bindSlider($('massInput'), $('massValue'), () => { drawNextBody(); _haptics.trigger('selection'); }, (v) => v.toFixed(2));
    _forms.bindSlider($('chargeInput'), $('chargeValue'), () => { drawNextBody(); _haptics.trigger('selection'); }, fmt2);
    _forms.bindSlider($('spinInput'), $('spinValue'), () => { drawNextBody(); _haptics.trigger('selection'); }, (v) => fmt2(v) + 'c');

    // ─── Bodies: collisions; black holes lock them to merging ───
    const collisionChoice = $('collision-choice');
    bindChoice(collisionChoice, (v) => {
        sim.collisionMode = colFromString(v);
        update();
    });

    // ─── Edges ───
    const edgeChoice = $('edge-choice');
    for (const g of edgeChoice.querySelectorAll('.edge-glyph')) g.innerHTML = edgeGlyph(g.dataset.edge, 'currentColor');
    const edgeHint = $('edge-hint');
    bindChoice(edgeChoice, (v) => {
        if (v === 'open') sim.boundaryMode = BOUND_DESPAWN;
        else if (v === 'wall') sim.boundaryMode = BOUND_BOUNCE;
        else { sim.boundaryMode = BOUND_LOOP; sim.topology = topoFromString(v); }
        update();
    });

    // ─── Universe: static, or expanding (expansion locks the edges to the torus, decision 3:
    // the universe is the periodic domain, and only the torus is homogeneous, so only there
    // does the mean density's minimum-image pull cancel) ───
    const universeChoice = $('universe-choice');
    bindChoice(universeChoice, (v) => {
        S.expansionEnabled = v === 'expanding';
        update();
        sim._dirty = true;
    });
    // The history; the scale is H₀ for the imposed schedules, the vacuum H_Λ for the closure
    const scheduleSelect = $('cosmo-schedule');
    const hubbleName = $('hubbleLabel');
    const labelSchedule = () => {
        const key = S.cosmoSchedule === 0 ? 'sim.hubbleVacuum' : 'sim.hubble';
        hubbleName.setAttribute('data-i18n', key);
        hubbleName.textContent = _T(key);
    };
    scheduleSelect.addEventListener('change', () => {
        S.cosmoSchedule = parseInt(scheduleSelect.value, 10) || 0;
        labelSchedule();
        syncGPU();
        sim._dirty = true;
    });
    labelSchedule();
    _forms.bindToggle($('comovingToggle'), (v) => sim.setComovingView(v));

    // ─── Applied fields: g and E as arrows, B_z as a scale ───
    const describe = (m, a) => m < 0.005 ? _T('ext.none', 'none')
        : _T('ext.at', '{m} at {a}°').replace('{m}', m.toFixed(2)).replace('{a}', String(Math.round(((a * 180 / Math.PI) % 360 + 360) % 360)));
    const showPads = ['extGravity', 'extElectric'].map((name) => {
        const svg = $(name + 'Pad');
        svg.addEventListener('pointerup', () => _haptics.trigger('selection'));
        return bindPad(svg, {
            inkVar: name === 'extGravity' ? '--ink-umber' : '--ink-prussian',
            get: () => ({ m: S[name], a: S[name + 'Angle'] }),
            set: (m, a) => {
                S[name] = m;
                S[name + 'Angle'] = a;
                syncGPU();
                showKnobs();   // the cyclotron's E is this field
                sim.sceneKey?.refresh();
                sim._dirty = true;
            },
            describe,
            out: $(name + 'Value'),
        });
    });

    // The fields' ether damping (Higgs 2m_H, axion g·m_a); Hubble friction applies regardless
    const dampingToggle = $('fieldDampingToggle');
    _forms.bindToggle(dampingToggle, (v) => { S.fieldDamping = v ? 1 : 0; syncGPU(); });

    // ─── One pass over the store: prerequisites, locks, and every control shown ───
    const edgeHints = { open: 'edge.hint.open', wall: 'edge.hint.wall', torus: 'edge.hint.torus', klein: 'edge.hint.klein', rp2: 'edge.hint.rp2' };
    function update() {
        // Prerequisites, in order
        const ok = {};
        for (const [key, rule] of LAWS) {
            ok[key] = rule(S);
            if (!ok[key]) S[key] = false;
        }
        // The locks: black holes merge; expansion is the torus
        if (S.blackHoleEnabled) sim.collisionMode = COL_MERGE;
        if (S.expansionEnabled) { sim.boundaryMode = BOUND_LOOP; sim.topology = TORUS; }
        // Lensing is what mass does to the backdrop: it follows Gravity
        sim.lens.on = S.gravityEnabled;
        if (!S.gravityEnabled && sim.lens.star) sim.lensPanel?.setProbe(false);

        for (const [id, key] of Object.entries(TICKS)) {
            const el = $(id);
            el.checked = !!S[key];
            el.disabled = ok[key] === false;
            el.closest('.tick').classList.toggle('ctrl-disabled', el.disabled);
        }
        showChoice(mechChoice, mechOf());
        enableChoice(mechChoice, 'onepn', S.magneticEnabled || S.gravitomagEnabled || S.yukawaEnabled);
        mechHint.textContent = _T('mech.hint.' + mechOf());

        showChoice(collisionChoice, COL_NAMES[sim.collisionMode]);
        for (const v of COL_NAMES) enableChoice(collisionChoice, v, !S.blackHoleEnabled || v === 'merge');
        const edge = EDGE_OF(sim);
        showChoice(edgeChoice, edge);
        for (const v of ['open', 'wall', 'torus', 'klein', 'rp2']) enableChoice(edgeChoice, v, !S.expansionEnabled || v === 'torus');
        edgeHint.textContent = _T(edgeHints[edge]);
        showChoice(universeChoice, S.expansionEnabled ? 'expanding' : 'static');

        $('yukawa-sliders').hidden = !S.yukawaEnabled;
        $('axion-sliders').hidden = !S.axionEnabled;
        $('higgs-sliders').hidden = !S.higgsEnabled;
        $('field-damping-group').hidden = !(S.axionEnabled || S.higgsEnabled);
        $('backdrop-section').hidden = !S.gravityEnabled;
        $('friction-group').hidden = !(sim.collisionMode === COL_BOUNCE || sim.boundaryMode === BOUND_BOUNCE);
        $('cosmo-schedule-group').hidden = !S.expansionEnabled;
        sim.framePanel?.syncAvailable();
        drawNextBody();

        syncGPU();
        syncModes();
        sim.sceneKey?.refresh();
    }

    // ─── Controls from the store ───
    // A preset or a save writes sim.settings, the modes, the speed and the view
    // (physics-settings.js applyConfig), then calls this: every control shows its value
    // without firing its handler, the prerequisites and the locks run once (which may turn
    // more off, in the store too), and the result goes to the GPU
    sim.syncControls = () => {
        for (const s of storeScales) s.show();
        scheduleSelect.value = String(S.cosmoSchedule);
        labelSchedule();
        dampingToggle.checked = !!S.fieldDamping;
        showChoice(fieldChoice, sim.heatmap.enabled ? sim.heatmap.mode : 'none');
        showChoice(arrowChoice, (k) => !!sim.view[k]);
        gridToggle.checked = !!sim.view.grid;
        $('comovingToggle').checked = !!sim.view.comoving;
        for (const draw of showPads) draw();
        sim.lensPanel?.sync();
        sim.syncSpeed?.();
        update();
        sim._dirty = true;
    };

    // ─── Pause / Resume (the colophon's play button; mounted below with the theme) ───
    let colophon = null;
    const togglePause = () => {
        sim.running = !sim.running;
        _haptics.trigger(sim.running ? 'medium' : 'light');
        if (colophon) colophon.setPlaying(sim.running);
        sim.caption?.refresh();
        sim.framePanel?.update();
        return sim.running;
    };

    // ─── Speed: a text button reading the multiple of real time ───
    const speedBtn = $('speedBtn');
    const speedLabel = speedBtn.querySelector('.speed-label');
    const syncSpeed = () => {
        const x = sim.speedScale / 16;
        speedLabel.textContent = x + '×';
        speedBtn.title = _T('topbar.speedTitle', 'Speed') + ': ' + x + '× (, .)';
    };
    const stepSpeed = (d) => {
        sim.speedIndex = (sim.speedIndex + d + SPEED_OPTIONS.length) % SPEED_OPTIONS.length;
        sim.speedScale = SPEED_OPTIONS[sim.speedIndex];
        syncSpeed();
        _haptics.trigger('selection');
    };
    speedBtn.addEventListener('click', () => stepSpeed(1));
    speedBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); stepSpeed(-1); });
    sim.syncSpeed = syncSpeed;
    syncSpeed();

    // ─── Step button ───
    const stepSim = () => {
        if (!sim.running && sim.gpu) {
            sim.gpu.stepOnce(sim);
            sim._statsDirty = true;
            sim._dirty = true;
        }
    };

    // ─── Theme, and the colophon ───
    const syncRendererTheme = () => {
        const isLight = document.documentElement.dataset.theme !== 'dark';
        sim.overlay.setTheme(isLight);
        // The renderer's pipelines and the bodies' inks (GPUBackend.setTheme)
        if (sim.gpu) sim.gpu.setTheme(isLight);
        sim._dirty = true;
    };
    let _aboutHandle = null;
    colophon = _colophon.mount({
        themeKey: 'geon-theme',
        onTheme: syncRendererTheme,
        playing: sim.running,
        onPlay: togglePause,
        onStep: stepSim,
        onHelp: () => _aboutHandle && _aboutHandle.show(),
        labels: () => ({
            play: _T('topbar.play'), pause: _T('topbar.pause'), step: _T('topbar.step'),
            theme: _T('topbar.theme'), help: _T('topbar.about'),
        }),
    });
    syncRendererTheme();
    sim.colophon = colophon;
    const toggleTheme = () => $('themeToggleBtn').click();

    // ─── The view: plane or spacetime (src/spacetime.js) ───
    const viewPlane = $('view-plane');
    const viewSpacetime = $('view-spacetime');
    const syncView = (tilted) => {
        viewPlane.setAttribute('aria-pressed', String(!tilted));
        viewSpacetime.setAttribute('aria-pressed', String(tilted));
        sim.caption?.refresh();
    };
    sim.spacetime.onChange = syncView;
    const toPlane = () => { sim.spacetime.toPlane(); syncView(false); };
    const toSpacetime = () => { sim.spacetime.toSpacetime(); syncView(true); };
    viewPlane.addEventListener('click', toPlane);
    viewSpacetime.addEventListener('click', toSpacetime);
    const toggleView = () => (sim.spacetime.tilted ? toPlane() : toSpacetime());

    // ─── Coordinates: the lab's, or the observer's ───
    // Observer means the Figure tab's observer: a moving one is reached by easing the boost
    // (spacetime.js toCoords), any other directly. The Boost scale reads the moving observer's
    // velocity along x, which the Figure tab's speed and direction also set: one setting
    const boostInput = $('boost-input');
    const boostOut = $('boost-out');
    const coordsLab = $('coords-lab');
    const coordsObserver = $('coords-observer');
    sim.observerKind = 'boost';   // the observer `observer` switches to
    const syncCoords = () => {
        const obs = sim.frames.active || sim.spacetime._sTo === 1;
        coordsLab.setAttribute('aria-pressed', String(!obs));
        coordsObserver.setAttribute('aria-pressed', String(obs));
        $('boost-row').hidden = sim.observerKind !== 'boost';
        sim.framePanel?.showObserver();
        sim.caption?.refresh();
    };
    const showBoost = () => {
        const v = sim.frames.boostSpeed * Math.sign(Math.cos(sim.frames.direction) || 1);
        boostInput.value = v;
        boostOut.textContent = (v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'c';
        sim.caption?.refresh();
    };
    const setBoost = (v) => {
        sim.frames.rapidity = Math.atanh(Math.min(Math.abs(v), 0.99));
        sim.frames.direction = v < 0 ? Math.PI : 0;
        showBoost();
        sim.framePanel?.syncBoost();
        sim.framePanel?.update();
        sim._dirty = true;
    };
    boostInput.addEventListener('input', () => setBoost(+boostInput.value));
    coordsLab.addEventListener('click', () => {
        sim.spacetime.toCoords(false);
        if (sim.frames.active) sim.framePanel?.choose('lab');
        syncCoords();
    });
    const toObserver = () => {
        if (sim.observerKind === 'boost') {
            // An observer at rest is the lab: give it somewhere to go
            if (sim.frames.boostSpeed < 0.01) setBoost(0.5);
            sim.spacetime.toCoords(true);
        } else {
            sim.framePanel?.choose(sim.observerKind);
        }
        syncCoords();
    };
    coordsObserver.addEventListener('click', toObserver);
    sim.spacetime.onCoords = syncCoords;
    // Words drawn on the canvas
    const labelCanvas = () => {
        sim.overlay._labels = {
            now: _T('canvas.now', 'now'),
            ago: (n) => _T('canvas.ago', '{n} ago').replace('{n}', n),
            observer: _T('canvas.observerPresent'),
            lab: _T('canvas.labPresent'),
            length: _T('canvas.length', 'length, c = 1'),
        };
    };
    labelCanvas();
    sim.syncCoords = syncCoords;
    sim.syncBoost = showBoost;
    setBoost(+boostInput.value);

    // ─── Tab cycling ([ and ]) ───
    const tabBtns = [...document.querySelectorAll('.tab-btn')];
    const cycleTab = (d) => {
        const i = tabBtns.findIndex((b) => b.classList.contains('active'));
        tabBtns[(i + d + tabBtns.length) % tabBtns.length].click();
    };

    // ─── Zoom helpers ───
    const canvas = sim.canvas || $('simCanvas');
    const zoomIn = () => sim.camera.zoomBy(1.25, canvas.width / 2, canvas.height / 2);
    const zoomOut = () => sim.camera.zoomBy(0.8, canvas.width / 2, canvas.height / 2);
    const zoomReset = () => sim.fitCamera();

    // ─── Keyboard shortcuts ───
    // Built as a function so labels/groups can be re-resolved through _i18n
    // each time the language changes (initShortcuts captures by value).
    const G_SIM = () => _T('shortcut.group.simulation', 'Simulation');
    const G_VIEW = () => _T('shortcut.group.view', 'View');
    const G_SL = () => _T('shortcut.group.saveload', 'Save / load');
    const G_PRES = () => _T('shortcut.group.presets', 'Figures');
    const _buildShortcuts = () => [
        { key: 'Space', label: _T('shortcut.pausePlay', 'Pause / play'), group: G_SIM(), action: togglePause },
        { key: 'R', label: _T('shortcut.resetSim', 'Reset simulation'), group: G_SIM(), action: clearScene },
        { key: '.', label: _T('shortcut.speedUp', 'Speed up'), group: G_SIM(), action: () => stepSpeed(1) },
        { key: ',', label: _T('shortcut.slowDown', 'Slow down'), group: G_SIM(), action: () => stepSpeed(-1) },
        { key: '/', label: _T('shortcut.stepForward', 'Step forward'), group: G_SIM(), action: stepSim },
        ...PRESET_ORDER.slice(0, 9).map((key, i) => ({
            key: String(i + 1),
            label: _T('preset.' + key + '.name', PRESETS[key].name),
            group: G_PRES(),
            action: () => loadFigure(key, { keep: sim.figure === key }),
        })),
        { key: 'V', label: _T('shortcut.toggleVel', 'Velocity arrows'), group: G_VIEW(), action: () => toggleArrow('showVelocity') },
        { key: 'F', label: _T('shortcut.toggleAccel', 'Acceleration arrows'), group: G_VIEW(), action: () => toggleArrow('showForce') },
        { key: 'C', label: _T('shortcut.toggleAccelComp', 'Arrows by force'), group: G_VIEW(), action: () => toggleArrow('showForceComponents') },
        { key: 'G', label: _T('shortcut.toggleGrid', 'Rulers and key'), group: G_VIEW(), action: () => gridToggle.click() },
        { key: 'B', label: _T('shortcut.cycleFrame', 'Next observer'), group: G_VIEW(), action: () => sim.framePanel?.cycle() },
        { key: 'L', label: _T('shortcut.labFrame', 'Back to the lab'), group: G_VIEW(), action: () => coordsLab.click() },
        { key: 'T', label: _T('shortcut.toggleTheme', 'Toggle theme'), group: G_VIEW(), action: toggleTheme },
        { key: 'W', label: _T('shortcut.toggleSpacetime', 'Plane or spacetime'), group: G_VIEW(), action: toggleView },
        { key: 'O', label: _T('shortcut.toggleCoords', 'Lab or observer coordinates'), group: G_VIEW(), action: () => (sim.frames.active || sim.spacetime._sTo === 1 ? coordsLab : coordsObserver).click() },
        { key: 'S', label: _T('shortcut.toggleSidebar', 'Toggle margin'), group: G_VIEW(), action: toggleMargin },
        { key: 'Escape', label: _T('shortcut.closePanel', 'Close margin'), group: G_VIEW(), action: () => setMargin(false) },
        { key: '[', label: _T('shortcut.prevTab', 'Previous tab'), group: G_VIEW(), action: () => cycleTab(-1) },
        { key: ']', label: _T('shortcut.nextTab', 'Next tab'), group: G_VIEW(), action: () => cycleTab(1) },
        { key: '=', label: _T('shortcut.zoomIn', 'Zoom in'), group: G_VIEW(), action: zoomIn },
        { key: '-', label: _T('shortcut.zoomOut', 'Zoom out'), group: G_VIEW(), action: zoomOut },
        { key: '0', label: _T('shortcut.zoomReset', 'Reset zoom'), group: G_VIEW(), action: zoomReset },
        { key: 'X', label: _T('shortcut.toggleAntimatter', 'Toggle antimatter mode'), group: G_SIM(), action: () => modeBtn.click() },
        { key: 'Ctrl+S', label: _T('shortcut.quickSave', 'Quick save'), group: G_SL(), action: () => quickSave(sim) },
        { key: 'Ctrl+L', label: _T('shortcut.quickLoad', 'Quick load'), group: G_SL(), action: () => { quickLoad(sim); sim._dirty = true; } },
        { key: 'Ctrl+Shift+S', label: _T('shortcut.downloadState', 'Download state'), group: G_SL(), action: () => downloadState(sim) },
        { key: 'Ctrl+Shift+L', label: _T('shortcut.uploadState', 'Upload state'), group: G_SL(), action: () => { uploadState(sim); sim._dirty = true; } },
    ];
    let shortcuts = _buildShortcuts();

    let _shortcutHandle = null;
    if (typeof initShortcuts === 'function') {
        _shortcutHandle = initShortcuts(shortcuts, { helpTitle: _T('shortcut.help.title', 'Keyboard shortcuts') });
    }

    // ─── About panel ───
    const _buildAboutConfig = () => ({
        title: _T('about.title', 'Worldline'),
        lastUpdated: '2026-10-26',
        description: _T('about.description'),
        controls: [
            { label: _T('about.controls.addParticle'), value: _T('about.controls.addParticleVal') },
            { label: _T('about.controls.fling'), value: _T('about.controls.flingVal') },
            { label: _T('about.controls.spawnAntimatter'), value: _T('about.controls.spawnAntimatterVal') },
            { label: _T('about.controls.pan'), value: _T('about.controls.panVal') },
            { label: _T('about.controls.zoom'), value: _T('about.controls.zoomVal') },
            { label: _T('about.controls.select'), value: _T('about.controls.selectVal') },
            { label: _T('about.controls.orbit'), value: _T('about.controls.orbitVal') },
            { label: _T('about.controls.knob'), value: _T('about.controls.knobVal') },
        ],
        shortcuts: shortcuts,
        repo: 'https://github.com/a9lim/worldline',
    });
    if (typeof initAboutPanel === 'function') {
        _aboutHandle = initAboutPanel(_buildAboutConfig());
    }

    // ─── Info tips (hover a law's formula, or a section's ?) ───
    const INFO_KEYS = [
        'energy', 'conserved', 'spin', 'gravity', 'coulomb', 'magnetic',
        'gravitomag', 'relativity', 'radiation', 'spinorbit',
        'barneshut', 'collision', 'boundary', 'topology', 'charge', 'blackhole',
        'onepn', 'yukawa', 'axion', 'expansion', 'higgs', 'external', 'pion',
        'fieldExcitation', 'bosoninter', 'frames', 'lensing',
    ];
    const _buildInfoData = () => {
        const data = {};
        for (const k of INFO_KEYS) data[k] = { title: _T('info.' + k + '.title'), body: _T('info.' + k + '.body') };
        return data;
    };

    // createInfoTip directly (not registerInfoTips), so each trigger's cleanup is tracked and
    // the popovers rebuild on a language change without piling up listeners
    let _infoCleanups = [];
    const _registerInfoTipsLocal = () => {
        for (const c of _infoCleanups) { try { c(); } catch (e) { /* ignore */ } }
        _infoCleanups = [];
        const data = _buildInfoData();
        for (const trigger of document.querySelectorAll('.info-trigger[data-info]')) {
            const d = data[trigger.dataset.info];
            if (!d) continue;
            const cleanup = createInfoTip(trigger, d);
            if (typeof cleanup === 'function') _infoCleanups.push(cleanup);
        }
    };
    _registerInfoTipsLocal();

    // ─── Reference overlay (Shift+click / long-press on info buttons) ───
    const openReference = initReferenceOverlay(
        $('reference-overlay'), $('reference-title'), $('reference-body'), $('reference-close'), REFERENCE);
    bindReferenceTriggers(openReference);

    // The ticks' frames show the laws' marks; the next body's glyph
    fillMarks($('control-panel'));
    update();

    // ─── Language change handler ───
    // Re-translate dynamic content not covered by data-i18n attributes.
    if (window._i18n) {
        window._i18n.onChange(() => {
            _registerInfoTipsLocal();
            if (typeof openReference.clearCache === 'function') openReference.clearCache();
            // Rebuild shortcuts (labels reread through _T on rebuild) and
            // re-register the keydown handler so the keyMap is fresh too.
            shortcuts = _buildShortcuts();
            if (_shortcutHandle && typeof _shortcutHandle.destroy === 'function' && typeof initShortcuts === 'function') {
                _shortcutHandle.destroy();
                _shortcutHandle = initShortcuts(shortcuts, { helpTitle: _T('shortcut.help.title', 'Keyboard shortcuts') });
            }
            colophon.relabel();
            labelCanvas();
            syncSpeed();
            syncModeBtn();
            labelSchedule();
            sim.knobs = makeKnobs(sim.figure);
            buildKnobs();
            sim.caption?.rebuildKnobs();
            for (const draw of showPads) draw();
            update();
            if (_aboutHandle && typeof _aboutHandle.destroy === 'function' && typeof initAboutPanel === 'function') {
                _aboutHandle.destroy();
                _aboutHandle = initAboutPanel(_buildAboutConfig());
            }
        });
    }
}
