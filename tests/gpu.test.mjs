// The GPU oracles (tests/physics-validation.html) in a headless Chrome, one subtest per case,
// with nothing to install: a static server for /worldline/ and the parent's /shared/, and the
// DevTools protocol over Node's own WebSocket.
//
//   CHROME=/path/to/chrome node --test 'tests/*.test.mjs'                      the machine's GPU
//   CHROME=/path/to/chrome WEBGPU=swiftshader node --test 'tests/*.test.mjs'   a software adapter
//
// CHROME_FLAGS adds flags. Without CHROME, or without a WebGPU adapter, the test skips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WL = fileURLToPath(new URL('..', import.meta.url));
const SHARED = join(WL, '..', '..', 'shared');
const CHROME = process.env.CHROME;
const skip = !CHROME ? 'set CHROME to a WebGPU-capable Chrome to run the GPU oracles'
    : !existsSync(join(SHARED, 'tokens.js')) ? 'needs the a9l.im repository’s shared/ two levels up' : false;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
                '.wgsl': 'text/plain', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
    const server = createServer(async (req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const [top, ...rest] = path.split('/').filter(Boolean);
        const root = top === 'worldline' ? WL : top === 'shared' ? SHARED : null;
        try {
            if (!root || path.includes('..')) throw new Error();
            const body = await readFile(join(root, ...rest));
            res.writeHead(200, { 'Content-Type': (TYPES[extname(path)] || 'application/octet-stream') + '; charset=utf-8' }).end(body);
        } catch { res.writeHead(404).end(); }
    });
    return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function devtools(profile) {
    // The mock keychain: on macOS the page's storage otherwise waits on a keychain prompt
    const flags = ['--headless', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
                   `--user-data-dir=${profile}`, '--use-mock-keychain', '--password-store=basic',
                   '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-unsafe-webgpu'];
    if (process.env.WEBGPU === 'swiftshader') flags.push('--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader');
    if (process.platform === 'linux') flags.push('--no-sandbox', '--enable-features=Vulkan');
    flags.push(...(process.env.CHROME_FLAGS || '').split(' ').filter(Boolean), 'about:blank');
    const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
    for (let i = 0; i < 300; i++) {
        try {
            const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
            const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = pages.find((p) => p.type === 'page');
            if (page) return { chrome, ws: page.webSocketDebuggerUrl };
        } catch { /* not up yet */ }
        await sleep(100);
    }
    chrome.kill();
    throw new Error('Chrome did not open its DevTools port');
}

function connect(url) {
    const ws = new WebSocket(url), pending = new Map();
    let id = 0;
    ws.onmessage = (e) => {
        const m = JSON.parse(e.data), p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    };
    return new Promise((r) => { ws.onopen = () => r({ ws, send, evaluate }); });
}

test('GPU oracles (tests/physics-validation.html)', { skip, timeout: 30 * 60e3 }, async (t) => {
    const server = await serve(), profile = await mkdtemp(join(tmpdir(), 'worldline-chrome-'));
    let chrome, cdp;
    try {
        const d = await devtools(profile);
        chrome = d.chrome;
        cdp = await connect(d.ws);
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/worldline/tests/physics-validation.html` });
        for (let i = 0; i < 300 && !(await cdp.evaluate('window.__ready === true').catch(() => false)); i++) await sleep(100);
        const out = await cdp.evaluate('window.__run()');
        if (out.skipped) { t.skip(out.skipped); return; }
        for (const r of out.results) {
            await t.test(r.name, () => assert.ok(r.pass, r.error || `expected ${r.expected}; measured ${r.measured}; ${r.metric}`));
        }
    } finally {
        cdp?.ws.close();
        chrome?.kill();
        server.close();
        await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
});
