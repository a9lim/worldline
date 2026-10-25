/**
 * GPU pass scheduling predicates.
 *
 * This is intentionally small and data-oriented: GPUPhysics owns the actual
 * dispatches, while this module decides which feature passes are meaningful for
 * the current physics contract. Keep conditions aligned with shader guards so
 * the JS side can skip whole compute passes instead of paying dispatch overhead
 * for shaders that immediately return.
 */

export function createGPUDispatchPlan() {
    return {
        spinOrbit: false,
        applyTorques: false,
        radiation: false,
        larmorRadiation: false,
        hawkingRadiation: false,
        pionEmission: false,
        schwingerDischarge: false,
        bosonInteraction: false,
        kugelblitzReadback: false,
    };
}

export function updateGPUDispatchPlan(gpu, plan = createGPUDispatchPlan()) {
    // Boson passes are not planned here: bosons outlive the switches that emit them, so they
    // step every substep, sized by their pools' counts (GPUPhysics._dispatchBosonUpdate)
    plan.spinOrbit = gpu._spinOrbitEnabled &&
        (gpu._magneticEnabled || gpu._gravitomagEnabled);
    plan.applyTorques = (gpu._gravitomagEnabled && gpu._relativityEnabled) ||
        gpu._gravityEnabled;

    plan.radiation = gpu._radiationEnabled;
    plan.larmorRadiation = gpu._radiationEnabled && gpu._coulombEnabled;
    plan.hawkingRadiation = gpu._radiationEnabled && gpu._blackHoleEnabled;
    plan.pionEmission = gpu._radiationEnabled && gpu._yukawaEnabled;
    plan.schwingerDischarge = gpu._radiationEnabled &&
        gpu._blackHoleEnabled && gpu._coulombEnabled;

    plan.bosonInteraction = gpu._bosonInterEnabled;
    plan.kugelblitzReadback = gpu._bosonInterEnabled && gpu._gravityEnabled && !!gpu._kbBuffers;

    return plan;
}
