// ─── The Measure tab's readouts ───
// The ledger (energy, momentum and angular momentum, each with its drift over the run as a
// sparkline) and the selected body: its glyph, its clock and speed, and the forces on it as
// bars in their inks against the largest.
import { DISPLAY_SCALE, EPSILON } from './config.js';
import { bodyGlyph, sparkline } from './marks.js';

const SPARK_LEN = 120;   // readbacks a sparkline remembers
const fmt = (v) => { v *= DISPLAY_SCALE; return Math.abs(v) > 999 ? v.toExponential(2) : v.toFixed(2); };
const fmtRaw = (v) => Math.abs(v) > 999 ? v.toExponential(2) : v.toFixed(2);
const fmtDrift = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
// R15: Set textContent only when value changed (avoids DOM text node rebuild)
function _set(el, val) { if (el.textContent !== val) el.textContent = val; }

export default class StatsDisplay {
    constructor(dom, selDom) {
        this.dom = dom;
        this.selDom = selDom;
        this.initialEnergy = null;
        this.initialMomentum = null;
        this.initialAngMom = null;
        this._sparks = [
            { el: document.getElementById('spark-energy'), values: [] },
            { el: document.getElementById('spark-momentum'), values: [] },
            { el: document.getElementById('spark-angmom'), values: [] },
        ];
        this._selGlyph = document.getElementById('sel-glyph');
        this._glyphSig = '';
        // R14: Pre-allocate force descriptor array (avoids 11 object allocations per updateSelected)
        this._forceDescs = selDom ? [
            { row: selDom.fbGravity, val: selDom.fbGravityVal, vec: null },
            { row: selDom.fbCoulomb, val: selDom.fbCoulombVal, vec: null },
            { row: selDom.fbMagnetic, val: selDom.fbMagneticVal, vec: null },
            { row: selDom.fbGravitomag, val: selDom.fbGravitomagVal, vec: null },
            { row: selDom.fb1pn, val: selDom.fb1pnVal, vec: null },
            { row: selDom.fbSpincurv, val: selDom.fbSpincurvVal, vec: null },
            { row: selDom.fbRadiation, val: selDom.fbRadiationVal, vec: null },
            { row: selDom.fbYukawa, val: selDom.fbYukawaVal, vec: null },
            { row: selDom.fbExternal, val: selDom.fbExternalVal, vec: null },
            { row: selDom.fbHiggs, val: selDom.fbHiggsVal, vec: null },
            { row: selDom.fbAxion, val: selDom.fbAxionVal, vec: null },
        ] : [];
    }

    resetBaseline() {
        this.initialEnergy = null;
        this.initialMomentum = null;
        this.initialAngMom = null;
        for (const sp of this._sparks) { sp.values.length = 0; if (sp.el) sp.el.innerHTML = ''; }
    }

    /** Each drift's sparkline, from the baseline on. */
    _spark(drifts) {
        drifts.forEach((d, i) => {
            const sp = this._sparks[i];
            if (!sp.el || !Number.isFinite(d)) return;
            sp.values.push(d);
            if (sp.values.length > SPARK_LEN) sp.values.shift();
            sparkline(sp.el, sp.values);
        });
    }

    /**
     * Update energy/momentum display from GPU readback data.
     * All quantities computed on GPU: KE, PE (O(N²)), Darwin field energy/momentum,
     * scalar field energy/momentum, particle-field interaction energy, the boson pools.
     * Radiated is the pools plus the escaped radiation the pool culls removed; under
     * expansion the ledger adds the energy the expansion took (redshift and the stretched
     * potentials), and the momentum drift compares a·P, which expansion conserves.
     */
    updateEnergyGPU(gpuStats, sim) {
        const e = gpuStats;
        const L = e.ledger;
        const angMom = e.orbitalAngMom + e.spinAngMom;
        const pe = e.pe + e.pfiEnergy;
        // A scalar field's energy is the slab's, a·ℓ thick under expansion (cosmology.js)
        const allFieldE = e.fieldEnergy + (e.higgsFieldEnergy + e.axionFieldEnergy) * e.scaleA;
        const radiated = e.photonE + e.pionE + e.pendingRadiation + L.escapedE + L.escapedMatterE;
        this.radiated = radiated;   // for the caption
        this.photonE = e.photonE;   // for the key: light is on the scene
        const total = e.totalMass + e.linearKE + e.spinKE + pe + allFieldE + radiated;
        // Prescribed bodies' agents add energy and momentum from outside (prescribed.wgsl)
        const ledgerTotal = total + L.expansionWork - L.agentE;

        const totalFieldPx = e.fieldPx + e.scalarFieldMomX * e.scaleA;   // the slab's, like its energy
        const totalFieldPy = e.fieldPy + e.scalarFieldMomY * e.scaleA;
        const radPx = e.photonPx + e.pionPx + L.escapedPx;
        const radPy = e.photonPy + e.pionPy + L.escapedPy;
        const totalPx = e.px + totalFieldPx + radPx;
        const totalPy = e.py + totalFieldPy + radPy;
        const pMag = Math.sqrt(totalPx * totalPx + totalPy * totalPy);
        const pComoving = Math.hypot(totalPx * e.scaleA - L.agentPx, totalPy * e.scaleA - L.agentPy);

        // The baseline comes from a readback of the current state, not one in flight before it
        if (this.initialEnergy === null && e.aliveCount > 0 && e.current) {
            this.initialEnergy = ledgerTotal;
            this.initialMomentum = pComoving;
            this.initialAngMom = angMom;
        }

        // Relative to the run's energy scale: under expansion the energy that has flowed through
        // the ledger can dwarf the starting total (a frozen field's slab energy grows as a³)
        const eScale = Math.max(Math.abs(this.initialEnergy ?? 0), Math.abs(total), Math.abs(L.expansionWork), Math.abs(L.agentE), 1e-6);
        const eDrift = this.initialEnergy !== null ? ((ledgerTotal - this.initialEnergy) / eScale * 100) : 0;
        // Relative to the system's momentum scale √(2M·KE) too: a system at rest (zero total
        // momentum) would otherwise divide float noise by nothing
        const pScale = Math.max(Math.abs(this.initialMomentum ?? 0), pComoving, Math.sqrt(2 * e.totalMass * e.linearKE), 1e-6);
        const pDrift = this.initialMomentum !== null ? ((pComoving - this.initialMomentum) / pScale * 100) : 0;
        const aDrift = this.initialAngMom !== null
            ? ((angMom - this.initialAngMom) / Math.max(Math.abs(this.initialAngMom), 1e-6) * 100) : 0;

        _set(this.dom.linearKE, fmt(e.linearKE));
        _set(this.dom.spinKE, fmt(e.spinKE));
        _set(this.dom.massE, fmt(e.totalMass));
        _set(this.dom.potentialE, fmt(pe));
        _set(this.dom.totalE, fmt(total));
        _set(this.dom.energyDrift, fmtDrift(eDrift));
        _set(this.dom.fieldE, fmt(allFieldE));
        _set(this.dom.radiatedE, fmt(radiated));
        const showWork = L.expansionWork !== 0;
        if (this.dom.expansionWorkRow.hidden === showWork) this.dom.expansionWorkRow.hidden = !showWork;
        if (showWork) _set(this.dom.expansionWork, fmt(L.expansionWork));
        const showAgent = L.agentE !== 0;
        if (this.dom.agentWorkRow.hidden === showAgent) this.dom.agentWorkRow.hidden = !showAgent;
        if (showAgent) _set(this.dom.agentWork, fmt(L.agentE));
        _set(this.dom.momentum, fmt(pMag));
        _set(this.dom.particleMom, fmt(Math.sqrt(e.px * e.px + e.py * e.py)));
        _set(this.dom.fieldMom, fmt(Math.sqrt(totalFieldPx * totalFieldPx + totalFieldPy * totalFieldPy)));
        _set(this.dom.radiatedMom, fmt(Math.sqrt(radPx * radPx + radPy * radPy)));
        _set(this.dom.momentumDrift, fmtDrift(pDrift));
        _set(this.dom.angularMomentum, fmt(angMom));
        _set(this.dom.orbitalAngMom, fmt(e.orbitalAngMom));
        _set(this.dom.spinAngMom, fmt(e.spinAngMom));
        _set(this.dom.angMomDrift, fmtDrift(aDrift));
        if (this.initialEnergy !== null) this._spark([eDrift, pDrift, aDrift]);

        // How the forces are summed (GPUPhysics._chooseForceSum: pairwise, or the tree past a count)
        const fs = sim._gpuPhysics?.forceSum, el = this.dom.forceSum;
        if (fs && el) {
            const t = (k, fb) => (window._i18n ? window._i18n.t(k, fb) : fb);
            _set(el, fs.tree ? t('stats.byTree', 'by tree, θ {t}').replace('{t}', fs.theta.toFixed(2)) : t('stats.pairwise', 'pairwise'));
        }
    }

    /**
     * Update selected particle display from GPU readback data.
     * @param {Object} sel - GPU readback selected particle object, or null.
     * @param {Object} settings - for the relativityEnabled check.
     * @returns {Object|null}
     */
    updateSelectedGPU(sel, settings) {
        const dom = this.selDom;
        if (!sel || sel.mass <= 0) {
            this.selected = null;
            dom.details.hidden = true;
            dom.hint.hidden = false;
            dom.phaseSection.hidden = true;
            if (dom.effPotSection) dom.effPotSection.hidden = true;
            return null;
        }

        dom.details.hidden = false;
        dom.hint.hidden = true;
        dom.phaseSection.hidden = false;
        if (dom.effPotSection) dom.effPotSection.hidden = false;
        const speed = Math.sqrt(sel.velX * sel.velX + sel.velY * sel.velY);
        const wSq = sel.velWX * sel.velWX + sel.velWY * sel.velWY;
        const gamma = settings.relativityEnabled ? Math.sqrt(1 + wSq) : 1;
        const totalFx = sel.forceGravity.x + sel.forceCoulomb.x + sel.forceMagnetic.x + sel.forceGravitomag.x + sel.force1PN.x + sel.forceSpinCurv.x + sel.forceRadiation.x + sel.forceYukawa.x + sel.forceExternal.x + sel.forceHiggs.x + sel.forceAxion.x;
        const totalFy = sel.forceGravity.y + sel.forceCoulomb.y + sel.forceMagnetic.y + sel.forceGravitomag.y + sel.force1PN.y + sel.forceSpinCurv.y + sel.forceRadiation.y + sel.forceYukawa.y + sel.forceExternal.y + sel.forceHiggs.y + sel.forceAxion.y;
        const forceMag = Math.sqrt(totalFx * totalFx + totalFy * totalFy);

        _set(dom.mass, fmtRaw(sel.mass) + (sel.antimatter ? ' (anti)' : ''));
        // The body as the scene draws it, redrawn when its look changes
        const rim = sel.angVel * sel.radius;
        const look = { m: sel.mass, q: sel.charge, s: rim, anti: !!sel.antimatter, hole: !!settings.blackHoleEnabled, selected: true };
        const sig = [Math.round(sel.mass * 20), Math.sign(Math.round(sel.charge * 20)), Math.round(rim * 20), look.anti, look.hole].join();
        if (sig !== this._glyphSig && this._selGlyph) { this._glyphSig = sig; bodyGlyph(this._selGlyph, look, 7); }
        _set(dom.charge, fmtRaw(sel.charge));
        const surfaceV = sel.angVel * sel.radius;
        _set(dom.spin, surfaceV.toFixed(4) + 'c');
        _set(dom.speed, speed.toFixed(4) + 'c');
        _set(dom.gamma, gamma.toFixed(3));
        if (dom.tau) _set(dom.tau, fmtRaw(sel.tau));
        if (dom.lapse) _set(dom.lapse, sel.lapse.toFixed(4));
        _set(dom.force, fmt(forceMag));
        // For the figure caption (src/caption.js)
        this.selected = { speed, gamma, tau: sel.tau, mass: sel.mass, charge: sel.charge };

        const forces = this._forceDescs;
        forces[0].vec = sel.forceGravity;
        forces[1].vec = sel.forceCoulomb;
        forces[2].vec = sel.forceMagnetic;
        forces[3].vec = sel.forceGravitomag;
        forces[4].vec = sel.force1PN;
        forces[5].vec = sel.forceSpinCurv;
        forces[6].vec = sel.forceRadiation;
        forces[7].vec = sel.forceYukawa;
        forces[8].vec = sel.forceExternal;
        forces[9].vec = sel.forceHiggs;
        forces[10].vec = sel.forceAxion;
        // Each force's bar, against the largest
        let most = EPSILON;
        for (const f of forces) {
            f.mag = Math.sqrt(f.vec.x * f.vec.x + f.vec.y * f.vec.y);
            if (f.mag > most) most = f.mag;
        }
        for (const f of forces) {
            if (!f.row) continue;
            if (f.mag > EPSILON) {
                f.row.hidden = false;
                _set(f.val, fmt(f.mag));
                f.bar ??= f.row.querySelector('.force-bar i');
                const w = (100 * f.mag / most).toFixed(1) + '%';
                if (f.bar && f.bar.style.getPropertyValue('--w') !== w) f.bar.style.setProperty('--w', w);
            } else {
                f.row.hidden = true;
            }
        }

        return sel;
    }
}
