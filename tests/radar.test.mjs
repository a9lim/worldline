// Radar time and distance (src/radar.js) for an observer whose world line is known: for an
// inertial observer they are its Lorentz coordinates, for the accelerated one Rindler's, and an
// event past the accelerated observer's future horizon has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { radarCoords, inertialLine, acceleratedLine } from '../src/radar.js';

test('an inertial observer’s radar coordinates are its Lorentz coordinates', () => {
    const u = [0.6, 0.2], us = Math.hypot(...u), g = 1 / Math.sqrt(1 - us * us), n = [u[0] / us, u[1] / us];
    const line = inertialLine(0, 0, 0, u[0], u[1]);
    for (const [t, x, y] of [[3, 10, -4], [-7, -12, 9], [20, 5, 30]]) {
        const r = radarCoords(line, t, x, y);
        const par = x * n[0] + y * n[1], perp = Math.hypot(x - par * n[0], y - par * n[1]);
        assert.ok(Math.abs(r.time - g * (t - us * par)) < 1e-6);
        assert.ok(Math.abs(r.distance - Math.hypot(g * (par - us * t), perp)) < 1e-6);
    }
});

test('the accelerated observer’s are Rindler’s, off the axis too, with nothing past its horizon', () => {
    // At rest at x = 1/α at t = 0, accelerating along x: the corner at the origin
    const a = 0.05, line = acceleratedLine(1 / a, 0, 0, a, 1, 0);
    for (const [X, y, t] of [[30, 0, 10], [12, 15, -4], [60, -25, 40]]) {
        const r = radarCoords(line, t, X, y), xi = Math.sqrt(X * X - t * t);
        assert.ok(Math.abs(r.time - Math.atanh(t / X) / a) < 1e-6);
        assert.ok(Math.abs(r.distance - Math.acosh((a * a * (xi * xi + y * y) + 1) / (2 * a * xi)) / a) < 1e-6);
    }
    assert.equal(radarCoords(line, 30, 20, 0).beyond, 'future');   // X < t: past the future horizon
});
