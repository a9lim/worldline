# Worldline

Worldline is a browser sandbox for relativistic many-body physics. You spawn charged,
spinning particles, choose the laws they obey, and watch orbits precess, charges radiate,
black holes evaporate, and scalar fields ripple, then tilt the plane into spacetime to
see the world lines they trace, with live conservation readouts to check the numbers.

**[Open it](https://a9l.im/worldline)** · part of [a9l.im](https://a9l.im)

The laws, the figures, the controls and what each readout means are in
[about.md](about.md), which is also the sim's about panel. [AGENTS.md](AGENTS.md) maps the
code, and [docs/MODEL.md](docs/MODEL.md) is the physics model with its known limits.

## Running locally

Worldline needs a browser with WebGPU. It has no build step of its own and loads the shared
design system from the parent site by absolute path. From a checkout of
[a9lim.github.io](https://github.com/a9lim/a9lim.github.io) with submodules:

    node tools/sims/serve.mjs        # http://localhost:8790/worldline/

Its checks run with `node --test 'tests/*.test.mjs'` from this directory; the GPU oracles
among them need a WebGPU Chrome named by `CHROME` (see AGENTS.md).

## How it's built

Vanilla JavaScript modules on WebGPU: the physics runs as WGSL compute shaders (up to 4096
bodies, trees built from sorted Morton codes, 128 × 128 field grids) and draws with instanced
rendering. Shared controls, theme and typography come from the parent site, and KaTeX renders
the reference pages.

## License

[AGPL-3.0](LICENSE)
