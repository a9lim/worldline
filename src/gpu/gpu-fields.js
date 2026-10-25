/**
 * The scalar fields' half of GPUPhysics: the Higgs and axion grids' deposition, their joint
 * Störmer–Verlet step, the forces they put on the bodies, grid gravity (the Φ convolution by
 * FFT), merge excitations, Hubble friction, the Langevin bath and the field ledger, and the
 * presets' handles on them (setField, setHiggsQuench, readHiggsField).
 *
 * The methods share GPUPhysics' state through `this`, and installFieldMethods() defines them on
 * its prototype, so a call reads the same either side of the file boundary.
 */
import { createExcitationBuffers, FIELD_GRID_RES } from './gpu-buffers.js';
import { SHEET_THICKNESS_SQ, HIGGS_MASS_FLOOR, HIGGS_MASS_MAX_DELTA } from '../config.js';
import { fft2d } from '../fft.js';

const _fieldUniformData = new ArrayBuffer(256);
const _fieldUniformF32 = new Float32Array(_fieldUniformData);
const _fieldUniformU32 = new Uint32Array(_fieldUniformData);
const _fgUniformData = new ArrayBuffer(32);  // FGUniforms: domainW, domainH, aliveCount, boundaryMode, topologyMode, _pad×3
const _fgUniformF32 = new Float32Array(_fgUniformData);
const _fgUniformU32 = new Uint32Array(_fgUniformData);
const _fieldLedgerData = new ArrayBuffer(48);       // field-ledger.wgsl LedgerUniforms
const _fieldLedgerF32 = new Float32Array(_fieldLedgerData);
const _fieldLedgerU32 = new Uint32Array(_fieldLedgerData);
const FFT_PARAM_STRIDE = 256;
const _excitationEventData = new Float32Array(64 * 4);
const _excitationCountData = new Uint32Array(1);
const _FIELD_GRID_SQ = 128 * 128; // GPU_SCALAR_GRID² (max supported)
const _vacuumFieldData = new Float32Array(_FIELD_GRID_SQ); // Higgs VEV=1 upload
const _greenHatUploadData = new Float32Array(_FIELD_GRID_SQ * 2);

const FieldMethods = {
    /**
     * Initialize field buffers to vacuum values.
     * Higgs VEV = 1.0, Axion vacuum = 0.0. All other arrays zeroed.
     */
    _initFieldToVacuum(which) {
        const gridSq = FIELD_GRID_RES * FIELD_GRID_RES;
        const fb = which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
        if (!fb) return;

        // G15: Use encoder.clearBuffer() for zero-fills (8 writeBuffer calls → 1 encoder submit).
        // clearBuffer() executes within the command buffer timeline (no queue-time ordering issues).
        const enc = this.device.createCommandEncoder({ label: `${which}-field-reset` });
        enc.clearBuffer(fb.fieldDot);
        enc.clearBuffer(fb.gradX);
        enc.clearBuffer(fb.gradY);
        enc.clearBuffer(fb.source);
        enc.clearBuffer(fb.thermal);
        this.device.queue.submit([enc.finish()]);
        this._resetGravityGrid();

        // Write non-zero vacuum value for the main field array (Higgs VEV=1, Axion=0).
        // Axion vacuum is zero — covered by clearBuffer above, so skip the writeBuffer.
        if (which === 'higgs') {
            _vacuumFieldData.fill(1.0, 0, gridSq);
            this.device.queue.writeBuffer(fb.field, 0, _vacuumFieldData, 0, gridSq);
        } else {
            // Axion field vacuum = 0 — use a second encoder clearBuffer to stay consistent
            const enc2 = this.device.createCommandEncoder({ label: 'axion-field-clear' });
            enc2.clearBuffer(fb.field);
            this.device.queue.submit([enc2.finish()]);
        }
    },

    /** Zero the gravity grid and forget the previous metric potential. */
    _resetGravityGrid() {
        const g = this._gravGrid;
        if (!g) return;
        const enc = this.device.createCommandEncoder({ label: 'grav-grid-reset' });
        for (const key of ['phiF', 'phiFGradX', 'phiFGradY', 'phiP', 'metricPhi', 'metricPhiPrev', 'metricPhiDot', 'massGrid']) {
            enc.clearBuffer(g[key]);
        }
        this.device.queue.submit([enc.finish()]);
        this._metricPrimed = false;
    },

    /**
     * Write FieldUniforms to a target buffer.
     * When fieldType >= 0, writes to per-field buffer (higgs=0, axion=1).
     * When fieldType < 0, writes to shared field uniform buffer (fieldType defaults to 0).
     * @param {number} dt
     * @param {number} [fieldType=-1] - -1=shared buffer, 0=higgs, 1=axion
     */
    _writeFieldUniforms(dt, fieldType = -1) {
        const buf = fieldType < 0
            ? this._fieldUniformBuffer
            : (fieldType === 0 ? this._higgsUniformBuffer : this._axionUniformBuffer);
        if (!buf) return;
        const f = _fieldUniformF32;
        const u = _fieldUniformU32;
        // Must match FieldUniforms struct in field-common.wgsl exactly:
        f[0] = dt;
        f[1] = this.domainW;
        f[2] = this.domainH;
        u[3] = this.boundaryMode;
        u[4] = this.topologyMode;
        f[5] = this._higgsMass;
        f[6] = this._higgsCoupling;
        f[7] = HIGGS_MASS_FLOOR;
        f[8] = HIGGS_MASS_MAX_DELTA;
        f[9] = this._axionMass;
        f[10] = this._axionCoupling;
        u[11] = this._higgsEnabled ? 1 : 0;
        u[12] = this._axionEnabled ? 1 : 0;
        u[13] = this._coulombEnabled ? 1 : 0;
        u[14] = this._yukawaEnabled ? 1 : 0;
        u[15] = this._gravityEnabled ? 1 : 0;
        u[16] = this._relativityEnabled ? 1 : 0;
        u[17] = this._blackHoleEnabled ? 1 : 0;
        u[18] = this.aliveCount;
        // gravAccumulate: the axion's energy adds to the Higgs's in the gravity FFT input
        u[19] = fieldType === 1 && this._higgsEnabled ? 1 : 0;
        u[20] = fieldType < 0 ? 0 : fieldType;
        // Precomputed cell dimensions (G17: avoids per-thread division in shaders)
        const cellW = this.domainW / FIELD_GRID_RES;
        const cellH = this.domainH / FIELD_GRID_RES;
        f[21] = cellW;
        f[22] = cellH;
        f[23] = 1 / (cellW * cellW);
        f[24] = 1 / (cellH * cellH);
        f[25] = this._frameH ?? 0;
        f[26] = this.scaleA;
        f[27] = 1 / this.scaleA;
        u[28] = this._fieldDamping ? 1 : 0;
        const q = this._higgsQuench;
        f[29] = q ? Math.min(1, Math.max(-1, (this.simTime - q.t0) / q.tau - 1)) : 1;
        f[30] = q ? q.noise : 0;
        u[31] = this._noiseSeed;
        f[32] = Math.exp(-1.5 * (this._frameH ?? 0) * dt);
        this.device.queue.writeBuffer(buf, 0, _fieldUniformData);
    },

    /**
     * Ensure deposit bind groups exist for a given field.
     */
    _ensureDepositBindGroups(which) {
        if (this._fieldDepositBGs[which]) return;
        const fb = which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
        if (!fb || !this._fieldDeposit) return;
        const b = this.buffers;
        const dep = this._fieldDeposit;

        // Group 0: packed particle state + aux metadata
        const g0 = this.device.createBindGroup({
            label: `fieldDeposit_g0_${which}`,
            layout: dep.bindGroupLayouts[0],
            entries: [
                { binding: 0, resource: { buffer: b.particleState } },
                { binding: 1, resource: { buffer: b.particleAux } },
            ],
        });

        // Use per-field uniform buffer
        const uBuf = which === 'higgs' ? this._higgsUniformBuffer : this._axionUniformBuffer;

        // Group 1: atomicGrid + target grid + uniforms (for source deposition)
        const g1Source = this.device.createBindGroup({
            label: `fieldDeposit_g1_source_${which}`,
            layout: dep.bindGroupLayouts[1],
            entries: [
                { binding: 0, resource: { buffer: this._atomicGrid } },
                { binding: 1, resource: { buffer: fb.source } },
                { binding: 2, resource: { buffer: uBuf } },
            ],
        });

        // Group 1 for thermal (Higgs only, but create for both for simplicity)
        const g1Thermal = this.device.createBindGroup({
            label: `fieldDeposit_g1_thermal_${which}`,
            layout: dep.bindGroupLayouts[1],
            entries: [
                { binding: 0, resource: { buffer: this._atomicGrid } },
                { binding: 1, resource: { buffer: fb.thermal } },
                { binding: 2, resource: { buffer: uBuf } },
            ],
        });

        // Group 1 for superradiance fieldDot impulse (axion only)
        const g1FieldDot = this.device.createBindGroup({
            label: `fieldDeposit_g1_fieldDot_${which}`,
            layout: dep.bindGroupLayouts[1],
            entries: [
                { binding: 0, resource: { buffer: this._atomicGrid } },
                { binding: 1, resource: { buffer: fb.fieldDot } },
                { binding: 2, resource: { buffer: uBuf } },
            ],
        });

        // Group 2: axYukMod (read-only, for superradiance stimulated amplification)
        const g2 = this.device.createBindGroup({
            label: `fieldDeposit_g2_${which}`,
            layout: dep.bindGroupLayouts[2],
            entries: [
                { binding: 0, resource: { buffer: b.axYukMod } },
            ],
        });

        this._fieldDepositBGs[which] = { g0, g1Source, g1Thermal, g1FieldDot, g2 };
    },

    /**
     * Ensure evolve bind groups exist for a given field.
     */
    _ensureEvolveBindGroups(which) {
        if (this._fieldEvolveBGs[which]) return;
        const fb = which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
        if (!fb || !this._fieldEvolve) return;

        // Use per-field uniform buffer to avoid encoder split when both fields active
        const uBuf = which === 'higgs' ? this._higgsUniformBuffer : this._axionUniformBuffer;

        // Other field's buffer for portal coupling (or dummy zeros if not allocated)
        const otherFb = which === 'higgs' ? this._axionBuffers : this._higgsBuffers;
        const otherFieldBuf = otherFb ? otherFb.field : this._dummyFieldBuffer;

        const g = this._gravGrid;
        const entries = [
            fb.field, fb.fieldDot, otherFieldBuf, fb.source, fb.thermal,
            g.metricPhi, g.metricPhiDot, fb.gradX, fb.gradY, uBuf,
        ].map((buffer, binding) => ({ binding, resource: { buffer } }));
        this._fieldEvolveBGs[which] = this.device.createBindGroup({
            label: `fieldEvolve_${which}`,
            layout: this._fieldEvolve.evolveBindGroupLayouts[0],
            entries,
        });
        this._fieldGradBGs[which] = this.device.createBindGroup({
            label: `fieldGrad_${which}`,
            layout: this._fieldEvolve.gradBindGroupLayouts[0],
            entries,
        });
    },

    /** Gravity-grid bind groups: the full grid group, the per-field pack groups, and FFT. */
    _ensureGravityBindGroups() {
        if (this._gravBGs) return;
        const g = this._gravGrid;
        const grav = this._fieldGravity;
        const fft = this._fftPipelines;
        if (!g || !grav || !fft) return;
        const bg = (label, layout, buffers) => this.device.createBindGroup({
            label, layout,
            entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
        });

        const fieldBG = (fb) => fb ? bg('grav_field', grav.fieldLayout, [fb.field, fb.fieldDot, fb.gradX, fb.gradY]) : null;
        this._gravBGs = {
            grid: bg('grav_grid', grav.gridLayout, [
                this._fieldUniformBuffer, g.fftA, g.phiF, g.phiFGradX, g.phiFGradY,
                g.phiP, g.metricPhi, g.metricPhiPrev, g.metricPhiDot, g.massGrid,
            ]),
            packHiggs: bg('grav_pack_higgs', grav.packLayout, [this._higgsUniformBuffer, g.fftA]),
            packAxion: bg('grav_pack_axion', grav.packLayout, [this._axionUniformBuffer, g.fftA]),
            higgs: fieldBG(this._higgsBuffers),
            axion: fieldBG(this._axionBuffers),
            massDeposit: bg('grav_mass_deposit', this._fieldDeposit.bindGroupLayouts[1],
                [this._atomicGrid, g.massGrid, this._fieldUniformBuffer]),
        };

        if (!this._fftParamsBuffer) {
            // Every butterfly stage's parameters, written once. Selected per pass by
            // dynamic offset, so all stages in one encoder see their own values.
            const N = FIELD_GRID_RES;
            const logN = Math.log2(N);
            const data = new ArrayBuffer(4 * logN * FFT_PARAM_STRIDE);
            for (let inv = 0; inv < 2; inv++) {
                for (let axis = 0; axis < 2; axis++) {
                    for (let st = 0; st < logN; st++) {
                        const base = ((inv * 2 + axis) * logN + st) * FFT_PARAM_STRIDE;
                        const u32 = new Uint32Array(data, base, 8);
                        const i32 = new Int32Array(data, base, 8);
                        const f32 = new Float32Array(data, base, 8);
                        u32[0] = 1 << st;                  // stageLen
                        i32[1] = inv ? 1 : -1;             // direction
                        u32[2] = axis;
                        u32[3] = N;
                        f32[4] = 1 / N;                    // invN
                        u32[5] = inv && st === logN - 1 ? 1 : 0; // normalize on each axis's last stage
                    }
                }
            }
            this._fftParamsBuffer = this.device.createBuffer({
                label: 'fftParams', size: data.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this._fftParamsBuffer, 0, data);
        }
        const paramsBinding = { buffer: this._fftParamsBuffer, size: 32 };
        this._fftBGs = {
            g0_AB: this.device.createBindGroup({
                label: 'fft_g0_AB', layout: fft.bindGroupLayouts[0],
                entries: [
                    { binding: 0, resource: { buffer: g.fftA } },
                    { binding: 1, resource: { buffer: g.fftB } },
                    { binding: 2, resource: paramsBinding },
                ],
            }),
            g0_BA: this.device.createBindGroup({
                label: 'fft_g0_BA', layout: fft.bindGroupLayouts[0],
                entries: [
                    { binding: 0, resource: { buffer: g.fftB } },
                    { binding: 1, resource: { buffer: g.fftA } },
                    { binding: 2, resource: paramsBinding },
                ],
            }),
            g1Green: this.device.createBindGroup({
                label: 'fft_g1_green', layout: fft.bindGroupLayouts[1],
                entries: [{ binding: 0, resource: { buffer: g.greenHat } }],
            }),
        };
    },

    /**
     * Upload the sheet Green's function Ĝ for G(r) = -1/√(r² + ℓ²), once per domain. It is
     * built on the comoving grid (field-gravity.wgsl scales by 1/a), and while the universe
     * expands it drops k = 0: the mean density is the background's.
     */
    _uploadGreenHat() {
        const expanding = this.expanding;
        const key = `${this.comovingW},${this.comovingH},${expanding}`;
        if (this._greenHatKey === key) return;
        this._greenHatKey = key;
        this._metricPrimed = false; // the potential's scale just changed

        const N = FIELD_GRID_RES;
        const N2 = N * N;
        const re = new Float64Array(N2);
        const im = new Float64Array(N2);
        const cellW = this.comovingW / N;
        const cellH = this.comovingH / N;

        // Wrapped indices: the circular convolution treats the grid as periodic
        for (let iy = 0; iy < N; iy++) {
            for (let ix = 0; ix < N; ix++) {
                const dx = (ix <= N / 2 ? ix : ix - N) * cellW;
                const dy = (iy <= N / 2 ? iy : iy - N) * cellH;
                re[iy * N + ix] = -1 / Math.sqrt(dx * dx + dy * dy + SHEET_THICKNESS_SQ);
            }
        }
        fft2d(re, im, N, false);
        if (expanding) { re[0] = 0; im[0] = 0; }
        for (let i = 0; i < N2; i++) {
            _greenHatUploadData[i * 2] = re[i];
            _greenHatUploadData[i * 2 + 1] = im[i];
        }
        this.device.queue.writeBuffer(this._gravGrid.greenHat, 0, _greenHatUploadData, 0, N2 * 2);
    },

    /** FFT convolution of gravGrid.fftA with Ĝ, in place (result back in fftA). */
    _dispatchFFTConvolve(encoder) {
        const fft = this._fftPipelines;
        const bgs = this._fftBGs;
        const N = FIELD_GRID_RES;
        const logN = Math.log2(N);
        const elemWG = Math.ceil(N * N / 256);
        let inA = true;
        const butterfly = (inv, axis, st) => {
            const p = encoder.beginComputePass({ label: `fft_${inv ? 'inv' : 'fwd'}_${axis}_${st}` });
            p.setPipeline(fft.fftButterfly);
            p.setBindGroup(0, inA ? bgs.g0_AB : bgs.g0_BA, [((inv * 2 + axis) * logN + st) * FFT_PARAM_STRIDE]);
            p.dispatchWorkgroups(elemWG);
            p.end();
            inA = !inA;
        };
        for (let axis = 0; axis < 2; axis++) for (let st = 0; st < logN; st++) butterfly(0, axis, st);
        {
            // 2·logN stages is even, so the spectrum is back in fftA
            const p = encoder.beginComputePass({ label: 'fft_complexMul' });
            p.setPipeline(fft.complexMultiply);
            p.setBindGroup(0, bgs.g0_AB, [0]);
            p.setBindGroup(1, bgs.g1Green);
            p.dispatchWorkgroups(elemWG);
            p.end();
        }
        for (let axis = 0; axis < 2; axis++) for (let st = 0; st < logN; st++) butterfly(1, axis, st);
    },

    _gravPass(encoder, label, pipeline, groups) {
        const gridWG = Math.ceil(FIELD_GRID_RES / 8);
        const p = encoder.beginComputePass({ label });
        p.setPipeline(pipeline);
        groups.forEach((g, i) => p.setBindGroup(i, g));
        p.dispatchWorkgroups(gridWG, gridWG);
        p.end();
    },

    /**
     * Solve the metric potential the fields evolve in.
     * 'pre' (before the first half-kick): Φ_F from the current fields, Φ_P from the
     * particles, metricPhi = Φ_F + Φ_P. 'mid' (after the field drift): Φ_F again,
     * then metricPhi and Φ̇ (backward difference against the previous 'mid').
     */
    _dispatchGridPotential(encoder, stage) {
        const grav = this._fieldGravity;
        const bgs = this._gravBGs;
        this._uploadGreenHat();

        // Φ_F: field energy of every active field
        if (this._higgsEnabled) this._gravPass(encoder, `packHiggs_${stage}`, grav.packFieldEnergy, [bgs.packHiggs, bgs.higgs]);
        if (this._axionEnabled) this._gravPass(encoder, `packAxion_${stage}`, grav.packFieldEnergy, [bgs.packAxion, bgs.axion]);
        this._dispatchFFTConvolve(encoder);
        this._gravPass(encoder, `unpackPhiF_${stage}`, grav.unpackPhiF, [bgs.grid]);

        if (stage === 'pre') {
            // Φ_P: particles don't move during the field step, so once per substep
            if (this.aliveCount > 0) {
                const p = encoder.beginComputePass({ label: 'depositMass' });
                p.setPipeline(this._fieldDeposit.depositMass);
                p.setBindGroup(0, this._fieldDepositBGs[this._higgsEnabled ? 'higgs' : 'axion'].g0);
                p.setBindGroup(1, bgs.massDeposit);
                p.dispatchWorkgroups(Math.ceil(this.aliveCount / 256));
                p.end();
            }
            {
                const gridWG = Math.ceil(FIELD_GRID_RES / 8);
                const p = encoder.beginComputePass({ label: 'finalizeMass' });
                p.setPipeline(this._fieldDeposit.finalizeDeposit);
                p.setBindGroup(0, this._fieldDepositBGs[this._higgsEnabled ? 'higgs' : 'axion'].g0);
                p.setBindGroup(1, bgs.massDeposit);
                p.dispatchWorkgroups(gridWG, gridWG);
                p.end();
            }
            this._gravPass(encoder, 'packMass', grav.packMass, [bgs.grid]);
            this._dispatchFFTConvolve(encoder);
            this._gravPass(encoder, 'unpackPhiP', grav.unpackPhiP, [bgs.grid]);
            this._gravPass(encoder, 'combineMetric', grav.combineMetric, [bgs.grid]);
            if (!this._metricPrimed) {
                // No previous potential yet: start from this one with Φ̇ = 0.
                const g = this._gravGrid;
                encoder.copyBufferToBuffer(g.metricPhi, 0, g.metricPhiPrev, 0, g.metricPhi.size);
                encoder.clearBuffer(g.metricPhiDot);
                this._metricPrimed = true;
            }
        } else {
            this._gravPass(encoder, 'combineMetricDot', grav.combineMetricDot, [bgs.grid]);
        }
    },

    /**
     * Ensure field forces bind groups exist (shared for both Higgs and Axion).
     */
    _ensureFieldForcesBGs() {
        if (this._fieldForcesBGs) return;
        if (!this._fieldForces || !this._higgsBuffers || !this._axionBuffers) return;
        // Need both field buffers — use dummy if one missing
        const hb = this._higgsBuffers;
        const ab = this._axionBuffers;
        // If one field is missing, we can't create force BGs yet
        // They'll be created when both are available, or on first use with dummies
        if (!hb || !ab) return;
        const b = this.buffers;
        const ff = this._fieldForces;

        const g0 = this.device.createBindGroup({
            label: 'fieldForces_g0',
            layout: ff.bindGroupLayouts[0],
            entries: [
                { binding: 0, resource: { buffer: b.particleState } },
                { binding: 1, resource: { buffer: b.derived } },
            ],
        });

        const g1 = this.device.createBindGroup({
            label: 'fieldForces_g1',
            layout: ff.bindGroupLayouts[1],
            entries: [
                { binding: 0, resource: { buffer: hb.field } },
                { binding: 1, resource: { buffer: hb.gradX } },
                { binding: 2, resource: { buffer: hb.gradY } },
                { binding: 3, resource: { buffer: ab.field } },
                { binding: 4, resource: { buffer: ab.gradX } },
                { binding: 5, resource: { buffer: ab.gradY } },
            ],
        });

        const g2 = this.device.createBindGroup({
            label: 'fieldForces_g2',
            layout: ff.bindGroupLayouts[2],
            entries: [
                { binding: 0, resource: { buffer: b.allForces } },
                { binding: 1, resource: { buffer: b.axYukMod } },
            ],
        });

        const g3 = this.device.createBindGroup({
            label: 'fieldForces_g3',
            layout: ff.bindGroupLayouts[3],
            entries: [
                { binding: 0, resource: { buffer: this._fieldUniformBuffer } },
            ],
        });

        this._fieldForcesBGs = { g0, g1, g2, g3 };
    },

    /**
     * Dispatch one substep of scalar-field evolution for every active field, as a
     * joint Störmer–Verlet KDK so the Higgs–axion portal and the shared metric are
     * evaluated at matching times:
     * sources → [metric 'pre'] → half-kick → drift → [gradients, metric 'mid'] →
     * half-kick → gradients.
     */
    _dispatchFieldStep(encoder, dt) {
        if (!this._phase5Ready || !this._fieldDeposit || !this._fieldEvolve) return;
        const active = [];
        if (this._higgsEnabled && this._higgsBuffers) active.push('higgs');
        if (this._axionEnabled && this._axionBuffers) active.push('axion');
        if (active.length === 0) return;

        const dep = this._fieldDeposit;
        const evo = this._fieldEvolve;
        const gridWG = Math.ceil(FIELD_GRID_RES / 8); // 8x8 workgroup
        const particleWG = Math.ceil(this.aliveCount / 256);
        const pass = (label, pipeline, groups, x, y = 1) => {
            const p = encoder.beginComputePass({ label });
            p.setPipeline(pipeline);
            groups.forEach((g, i) => p.setBindGroup(i, g));
            p.dispatchWorkgroups(x, y);
            p.end();
        };

        for (const which of active) {
            this._ensureDepositBindGroups(which);
            this._ensureEvolveBindGroups(which);
            const depBGs = this._fieldDepositBGs[which];

            // Atomic source deposit, then finalize (atomic i32 → f32, clears the atomic grid)
            if (this.aliveCount > 0) {
                pass(`deposit_${which}`, which === 'axion' ? dep.depositAxionSource : dep.depositHiggsSource,
                    [depBGs.g0, depBGs.g1Source], particleWG);
            }
            pass(`finalizeSource_${which}`, dep.finalizeDeposit, [depBGs.g0, depBGs.g1Source], gridWG, gridWG);

            // Superradiance: spinning BH deposits an energy-normalized axion fieldDot impulse
            if (which === 'axion' && this._blackHoleEnabled && this.aliveCount > 0) {
                pass('depositSuperradiance', dep.depositSuperradiance, [depBGs.g0, depBGs.g1FieldDot, depBGs.g2], particleWG);
                pass('finalizeSuperradiance', dep.finalizeDepositAdd, [depBGs.g0, depBGs.g1FieldDot], gridWG, gridWG);
            }

            // Higgs thermal deposition
            if (which === 'higgs') {
                if (this.aliveCount > 0) pass('depositThermal', dep.depositThermal, [depBGs.g0, depBGs.g1Thermal], particleWG);
                pass('finalizeThermal', dep.finalizeDeposit, [depBGs.g0, depBGs.g1Thermal], gridWG, gridWG);
            }
        }

        const gravity = this._gravityEnabled;
        if (gravity) {
            this._ensureGravityBindGroups();
            this._dispatchGridPotential(encoder, 'pre');
        }
        const kick = (which, tag) => pass(`halfKick${tag}_${which}`,
            which === 'higgs' ? evo.higgsHalfKick : evo.axionHalfKick, [this._fieldEvolveBGs[which]], gridWG, gridWG);
        const gradients = (which, tag) => pass(`gridGradients${tag}_${which}`,
            evo.computeGridGradients, [this._fieldGradBGs[which]], gridWG, gridWG);

        for (const which of active) kick(which, 1);
        for (const which of active) pass(`fieldDrift_${which}`, evo.fieldDrift, [this._fieldEvolveBGs[which]], gridWG, gridWG);
        if (gravity) {
            // The drifted fields' energy needs their gradients first
            for (const which of active) gradients(which, 'Mid');
            this._dispatchGridPotential(encoder, 'mid');
        }
        for (const which of active) kick(which, 2);
        for (const which of active) gradients(which, '');
    },

    /**
     * Dispatch scalar field force application (Pass 16).
     * Applies Higgs mass modulation + gradient force, Axion axMod/yukMod + gradient force.
     */
    _dispatchFieldForces(encoder) {
        if (!this._fieldForces || this.aliveCount === 0) return;
        if (!this._higgsEnabled && !this._axionEnabled) return;

        // Ensure both field buffers exist for the shared bind group
        // If only one is enabled, the other's arrays are at vacuum (zero/VEV) — safe.
        if (this._higgsEnabled && !this._axionBuffers) {
            this._ensureFieldBuffers('axion');
        }
        if (this._axionEnabled && !this._higgsBuffers) {
            this._ensureFieldBuffers('higgs');
        }
        this._ensureFieldForcesBGs();
        if (!this._fieldForcesBGs) return;

        const workgroups = Math.ceil(this.aliveCount / 256);
        const fg = this._fieldForcesBGs;
        const ff = this._fieldForces;

        if (this._higgsEnabled) {
            const p = encoder.beginComputePass({ label: 'applyHiggsForces' });
            p.setPipeline(ff.applyHiggsForces);
            p.setBindGroup(0, fg.g0);
            p.setBindGroup(1, fg.g1);
            p.setBindGroup(2, fg.g2);
            p.setBindGroup(3, fg.g3);
            p.dispatchWorkgroups(workgroups);
            p.end();
        }

        if (this._axionEnabled) {
            const p = encoder.beginComputePass({ label: 'applyAxionForces' });
            p.setPipeline(ff.applyAxionForces);
            p.setBindGroup(0, fg.g0);
            p.setBindGroup(1, fg.g1);
            p.setBindGroup(2, fg.g2);
            p.setBindGroup(3, fg.g3);
            p.dispatchWorkgroups(workgroups);
            p.end();
        }
    },

    /**
     * Dispatch particle-field gravity: F = -m∇Φ_F from the fields' energy (O(N × 16)).
     * Uses Φ_F from the previous substep's field step.
     */
    _dispatchFieldParticleGrav(encoder) {
        if (!this._fieldParticleGrav || !this._gravityEnabled || this.aliveCount === 0) return;
        if (!this._higgsEnabled && !this._axionEnabled) return;

        // Create uniform buffer once
        if (!this._fieldParticleGravUniform) {
            this._fieldParticleGravUniform = this.device.createBuffer({
                label: 'fieldParticleGrav_uniform',
                size: 32, // FGUniforms: domainW, domainH, aliveCount, boundaryMode, topologyMode, _pad×3
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        }

        // Write uniforms (FGUniforms struct)
        _fgUniformF32[0] = this.domainW;
        _fgUniformF32[1] = this.domainH;
        _fgUniformU32[2] = this.aliveCount;
        _fgUniformU32[3] = this.boundaryMode;
        _fgUniformU32[4] = this.topologyMode;
        _fgUniformU32[5] = 0;
        _fgUniformU32[6] = 0;
        _fgUniformU32[7] = 0;
        this.device.queue.writeBuffer(this._fieldParticleGravUniform, 0, _fgUniformData, 0, 32);

        const pg = this._fieldParticleGrav;
        const g = this._gravGrid;
        if (!g) return;
        const b = this.buffers;
        if (!this._fieldParticleGravBGs) {
            this._fieldParticleGravBGs = {
                g0: this.device.createBindGroup({
                    label: 'fieldParticleGrav_g0',
                    layout: pg.bindGroupLayouts[0],
                    entries: [
                        { binding: 0, resource: { buffer: this._fieldParticleGravUniform } },
                        { binding: 1, resource: { buffer: b.particleState } },
                        { binding: 2, resource: { buffer: b.allForces } },
                    ],
                }),
                g1: this.device.createBindGroup({
                    label: 'fieldParticleGrav_g1',
                    layout: pg.bindGroupLayouts[1],
                    entries: [
                        { binding: 0, resource: { buffer: g.phiFGradX } },
                        { binding: 1, resource: { buffer: g.phiFGradY } },
                    ],
                }),
            };
        }

        const p = encoder.beginComputePass({ label: 'fieldParticleGrav' });
        p.setPipeline(pg.pipeline);
        p.setBindGroup(0, this._fieldParticleGravBGs.g0);
        p.setBindGroup(1, this._fieldParticleGravBGs.g1);
        p.dispatchWorkgroups(Math.ceil(this.aliveCount / 256));
        p.end();
    },

    /**
     * Dispatch field excitation deposits (Pass 19).
     * Deposits Gaussian wave packets from merge events into active field(s).
     */
    _dispatchFieldExcitations(encoder) {
        if (!this._fieldExcitation) return;
        if (!this._higgsEnabled && !this._axionEnabled) return;

        // Excitation events come from merge results, consumed once (they used to replay every
        // substep until the next readback). Annihilation energy is all in its photons
        // (merge-photons.wgsl); an inelastic merge's lost kinetic energy is shared among the
        // active fields, not given whole to each.
        const events = this._pendingMergeEvents;
        this._pendingMergeEvents = [];
        const mergeCount = events.length;
        if (mergeCount === 0) return;
        const nFields = (this._higgsEnabled ? 1 : 0) + (this._axionEnabled ? 1 : 0);

        if (!this._excitationBuffers) {
            this._excitationBuffers = createExcitationBuffers(this.device);
        }

        // Upload compacted excitation events from pending merge/annihilation events.
        const maxEvents = 64;
        let eventCount = 0;
        for (let i = 0; i < mergeCount && eventCount < maxEvents; i++) {
            const me = events[i];
            if (me.energy <= 0 || me.type === 'annihilation') continue;
            const base = eventCount * 4;
            _excitationEventData[base] = me.x;
            _excitationEventData[base + 1] = me.y;
            _excitationEventData[base + 2] = me.energy / (nFields * this.scaleA);   // the slab is a·ℓ thick
            _excitationEventData[base + 3] = 0; // padding
            eventCount++;
        }
        if (eventCount === 0) return;
        this.device.queue.writeBuffer(this._excitationBuffers.events, 0, _excitationEventData, 0, eventCount * 4);
        _excitationCountData[0] = eventCount;
        this.device.queue.writeBuffer(this._excitationBuffers.counter, 0, _excitationCountData);

        const exc = this._fieldExcitation;

        const dispatchForField = (which) => {
            const fb = which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
            if (!fb) return;

            if (!this._fieldExcitationBGs[which]) {
                const uBuf = which === 'higgs' ? this._higgsUniformBuffer : this._axionUniformBuffer;
                this._fieldExcitationBGs[which] = this.device.createBindGroup({
                    label: `fieldExcitation_${which}`,
                    layout: exc.bindGroupLayouts[0],
                    entries: [
                        { binding: 0, resource: { buffer: fb.fieldDot } },
                        { binding: 1, resource: { buffer: this._excitationBuffers.events } },
                        { binding: 2, resource: { buffer: uBuf } },
                        { binding: 3, resource: { buffer: this._excitationBuffers.counter } },
                    ],
                });
            }

            const p = encoder.beginComputePass({ label: `depositExcitations_${which}` });
            p.setPipeline(exc.pipeline);
            p.setBindGroup(0, this._fieldExcitationBGs[which]);
            p.dispatchWorkgroups(1);
            p.end();
        };

        if (this._higgsEnabled) dispatchForField('higgs');
        if (this._axionEnabled) dispatchForField('axion');
    },

    /**
     * Book the fields' share of the expansion's work (field-ledger.wgsl): modes 0 and 2 bracket a
     * substep's Hubble friction, mode 1 is the stretch by `ratio` from scale factor `aOld`, with
     * the domain as it is when the pass is encoded.
     */
    _dispatchFieldLedger(encoder, mode, ratio, dt, aOld = this.scaleA) {
        const pl = this._ledgerPipelines;
        const hb = this._higgsEnabled ? this._higgsBuffers : null;
        const ab = this._axionEnabled ? this._axionBuffers : null;
        if (!pl || !pl.field || (!hb && !ab)) return;
        // One uniform buffer and bind group per mode: modes 0 and 2 share an encoder, and a
        // queue.writeBuffer lands before the whole encoder runs
        if (!this._fieldLedgerUniforms) {
            this._fieldLedgerUniforms = [0, 1, 2].map(m => this.device.createBuffer({
                label: `fieldLedgerUniforms${m}`, size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }));
            this._fieldLedgerDummy = this.device.createBuffer({ label: 'fieldLedgerDummy', size: 16, usage: GPUBufferUsage.STORAGE });
        }
        if (this._fieldLedgerBuffers !== hb || this._fieldLedgerAxion !== ab || !this._fieldLedgerBGs) {
            const dummy = this._fieldLedgerDummy;
            this._fieldLedgerBuffers = hb;
            this._fieldLedgerAxion = ab;
            this._fieldLedgerBGs = this._fieldLedgerUniforms.map((uniform, m) => this.device.createBindGroup({
                label: `fieldLedger${m}`,
                layout: pl.fieldLayout,
                entries: [
                    { binding: 0, resource: { buffer: uniform } },
                    { binding: 1, resource: { buffer: hb ? hb.field : dummy } },
                    { binding: 2, resource: { buffer: hb ? hb.fieldDot : dummy } },
                    { binding: 3, resource: { buffer: ab ? ab.field : dummy } },
                    { binding: 4, resource: { buffer: ab ? ab.fieldDot : dummy } },
                    { binding: 5, resource: { buffer: this._cosmoAccum } },
                ],
            }));
        }
        const cellW = this.domainW / FIELD_GRID_RES, cellH = this.domainH / FIELD_GRID_RES;
        const u = _fieldLedgerU32, f = _fieldLedgerF32;
        u[0] = mode; u[1] = hb ? 1 : 0; u[2] = ab ? 1 : 0; u[3] = 0;
        f[4] = aOld; f[5] = ratio; f[6] = 0;
        f[7] = cellW * cellH; f[8] = 1 / (cellW * cellW); f[9] = 1 / (cellH * cellH);
        f[10] = this._higgsMass; f[11] = this._axionMass;
        this.device.queue.writeBuffer(this._fieldLedgerUniforms[mode], 0, _fieldLedgerData);
        const p = encoder.beginComputePass({ label: 'fieldLedger' });
        p.setPipeline(pl.field);
        p.setBindGroup(0, this._fieldLedgerBGs[mode]);
        p.dispatchWorkgroups(1);
        p.end();
    },

    /**
     * φ̇ ← φ̇·e^{−3H dt/2} for each active field (field-evolve.wgsl hubbleFriction), metered by
     * the ledger on either side.
     */
    _dispatchHubbleFriction(encoder) {
        const evo = this._fieldEvolve;
        if (!evo || !evo.hubbleFriction) return;
        this._dispatchFieldLedger(encoder, 0, 1, 0);
        const gridWG = Math.ceil(FIELD_GRID_RES / 8);
        for (const which of ['higgs', 'axion']) {
            if (!(which === 'higgs' ? this._higgsEnabled && this._higgsBuffers : this._axionEnabled && this._axionBuffers)) continue;
            this._ensureEvolveBindGroups(which);
            const p = encoder.beginComputePass({ label: `hubbleFriction_${which}` });
            p.setPipeline(evo.hubbleFriction);
            p.setBindGroup(0, this._fieldEvolveBGs[which]);
            p.dispatchWorkgroups(gridWG, gridWG);
            p.end();
        }
        this._dispatchFieldLedger(encoder, 2, 1, 0);
    },

    /** The Higgs's Langevin bath during a quench (field-evolve.wgsl higgsLangevin). */
    _dispatchHiggsLangevin(encoder) {
        const evo = this._fieldEvolve;
        const q = this._higgsQuench;
        if (!evo || !evo.higgsLangevin || !q || !(q.noise > 0) || !this._fieldDamping) return;
        if (!this._higgsEnabled || !this._higgsBuffers || !this._phase5Ready) return;
        this._ensureEvolveBindGroups('higgs');
        const gridWG = Math.ceil(FIELD_GRID_RES / 8);
        const p = encoder.beginComputePass({ label: 'higgsLangevin' });
        p.setPipeline(evo.higgsLangevin);
        p.setBindGroup(0, this._fieldEvolveBGs.higgs);
        p.dispatchWorkgroups(gridWG, gridWG);
        p.end();
    },

    /** Expose field buffers for renderer overlay drawing */
    getFieldBuffers(which) {
        return which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
    },

    /**
     * Quench the Higgs through its symmetry-breaking transition (the Kibble–Zurek preset): the
     * mass term becomes ε·μ² with ε = −1 + t/τ_Q, clamped to [−1, 1], so it crosses the critical
     * point τ_Q after the call; `noise` is the Langevin bath's temperature on the Higgs damping.
     * tau ≤ 0 ends the quench.
     */
    setHiggsQuench(tau, noise = 0) {
        this._higgsQuench = tau > 0 ? { tau, t0: this.simTime, noise } : null;
    },

    /** The quench parameter ε now (1 without a quench). */
    get higgsQuenchEpsilon() {
        const q = this._higgsQuench;
        return q ? Math.min(1, Math.max(-1, (this.simTime - q.t0) / q.tau - 1)) : 1;
    },

    /**
     * The Higgs field φ over the FIELD_GRID_RES² grid, as it stands after the work already
     * submitted (quench.js reads it a few times a second); null without the field.
     */
    async readHiggsField() {
        if (!this._higgsBuffers) return null;
        const N = FIELD_GRID_RES;
        return new Float32Array(await this._readRanges([[this._higgsBuffers.field, 0, N * N * 4]], 'higgsField'));
    },

    /**
     * Set a field ('higgs' or 'axion') at rest: `value` is a number (uniform) or a function
     * (ix, iy) → φ over the FIELD_GRID_RES² grid. Presets use it for initial conditions.
     */
    setField(which, value) {
        const fb = which === 'higgs' ? this._higgsBuffers : this._axionBuffers;
        if (!fb) return;
        const N = FIELD_GRID_RES;
        const data = new Float32Array(N * N);
        for (let iy = 0; iy < N; iy++) {
            for (let ix = 0; ix < N; ix++) data[iy * N + ix] = typeof value === 'function' ? value(ix, iy) : value;
        }
        this.device.queue.writeBuffer(fb.field, 0, data);
        const enc = this.device.createCommandEncoder({ label: `${which}-field-set` });
        enc.clearBuffer(fb.fieldDot);
        this.device.queue.submit([enc.finish()]);
    }
};

/** Define the field methods (getters included) on GPUPhysics.prototype. */
export function installFieldMethods(cls) {
    Object.defineProperties(cls.prototype, Object.getOwnPropertyDescriptors(FieldMethods));
}
