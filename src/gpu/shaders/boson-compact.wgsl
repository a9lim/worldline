// ─── Boson pool compaction ───
// Every emitter appends to a pool (atomicAdd on its count), and a culled, absorbed, decayed,
// annihilated or collapsed boson only clears its flag, so without this the counts were
// high-water marks and a pool filled for good after its capacity in emissions. Once a frame,
// right after the culls (so the frame's decays and emissions find room; what dies later is
// packed the next frame), one workgroup packs each pool's live entries to its front in their
// order (so the result is the same every run), clears the stale tail and sets
// the count to the live number. No boson state outlives a frame by index (the claim buffers
// are cleared before each use and the trees rebuilt), so moving entries is safe.
//
// Each thread takes a contiguous chunk: it counts its live entries, a workgroup scan gives
// each chunk its offset, the live entries go to the scratch pool at their offsets, and after a
// storage barrier the packed range is copied back.

@group(0) @binding(0) var<storage, read_write> photons: array<Photon>;
@group(0) @binding(1) var<storage, read_write> pions: array<Pion>;
@group(0) @binding(2) var<storage, read_write> phCount: atomic<u32>;
@group(0) @binding(3) var<storage, read_write> piCount: atomic<u32>;
@group(0) @binding(4) var<storage, read_write> photonScratch: array<Photon>;
@group(0) @binding(5) var<storage, read_write> pionScratch: array<Pion>;

const CW: u32 = 256u;
var<workgroup> wgScan: array<u32, CW>;

/** Inclusive Hillis–Steele scan of each thread's count; returns this thread's exclusive offset. */
fn exclusiveOffset(lid: u32, count: u32) -> u32 {
    wgScan[lid] = count;
    workgroupBarrier();
    for (var s = 1u; s < CW; s <<= 1u) {
        var v = wgScan[lid];
        if (lid >= s) { v += wgScan[lid - s]; }
        workgroupBarrier();
        wgScan[lid] = v;
        workgroupBarrier();
    }
    return wgScan[lid] - count;
}

@compute @workgroup_size(CW)
fn compactBosons(@builtin(local_invocation_index) lid: u32) {
    // Photons
    let nPh = min(atomicLoad(&phCount), arrayLength(&photons));
    let cPh = (nPh + CW - 1u) / CW;
    let aPh = min(lid * cPh, nPh);
    let bPh = min(aPh + cPh, nPh);
    var live = 0u;
    for (var i = aPh; i < bPh; i++) { if ((photons[i].flags & 1u) != 0u) { live++; } }
    var at = exclusiveOffset(lid, live);
    let totalPh = wgScan[CW - 1u];
    for (var i = aPh; i < bPh; i++) {
        if ((photons[i].flags & 1u) != 0u) { photonScratch[at] = photons[i]; at++; }
    }
    storageBarrier();
    workgroupBarrier();
    for (var i = lid; i < nPh; i += CW) {
        if (i < totalPh) { photons[i] = photonScratch[i]; } else { photons[i].flags = 0u; }
    }
    workgroupBarrier();

    // Pions and leptons
    let nPi = min(atomicLoad(&piCount), arrayLength(&pions));
    let cPi = (nPi + CW - 1u) / CW;
    let aPi = min(lid * cPi, nPi);
    let bPi = min(aPi + cPi, nPi);
    live = 0u;
    for (var i = aPi; i < bPi; i++) { if ((pions[i].flags & 1u) != 0u) { live++; } }
    at = exclusiveOffset(lid, live);
    let totalPi = wgScan[CW - 1u];
    for (var i = aPi; i < bPi; i++) {
        if ((pions[i].flags & 1u) != 0u) { pionScratch[at] = pions[i]; at++; }
    }
    storageBarrier();
    workgroupBarrier();
    for (var i = lid; i < nPi; i += CW) {
        if (i < totalPi) { pions[i] = pionScratch[i]; } else { pions[i].flags = 0u; }
    }

    if (lid == 0u) {
        atomicStore(&phCount, totalPh);
        atomicStore(&piCount, totalPi);
    }
}
