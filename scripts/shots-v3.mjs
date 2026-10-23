// v3 verification over CDP with headless Chrome (no Playwright). WebGL via SwiftShader.
// Run: node scripts/shots-v3.mjs [url] [--sets=desk,tab,phone,rm,low,nogl] [--only=01,05] [--strips] [--out=screenshots/v3]
// Waits for window.__velon.flightReady / badgeReady, shoots named mid-flight frames by section progress
// (same centre-line maths as flight-bridge.ts), optional stitched strips, console + overflow report.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3950/';
const SETS = arg('sets', 'desk,tab,phone,rm,low,nogl').split(',');
const STRIPS = process.argv.includes('--strips');
const OUT = new URL(`../${arg('out', 'screenshots/v3')}/`, import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 400);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = join(tmpdir(), `velon-v3-${Date.now()}`);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  ...(process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return (await r.json()).webSocketDebuggerUrl; } catch { await sleep(200); }
  }
  throw new Error('chrome did not start');
}
function client(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else listeners.forEach((f) => f(m));
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  return { ready, send, on: (f) => listeners.push(f), close: () => ws.close() };
}

const DESK = { w: 1440, h: 900, mobile: false };
const TAB = { w: 834, h: 1112, mobile: true };
const PHONE = { w: 375, h: 812, mobile: true };
// frames: [name, section id, progress]
const FRAMES_DESK = [
  ['01-hero', 'hero', 0], ['02-hero-leave', 'hero', 0.5], ['03-solutions-head', 'solutions', 0.14], ['04-solutions-bento', 'solutions', 0.45], ['04b-solutions-row2', 'solutions', 0.76],
  ['05-process-step2', 'process', 0.32], ['06-numbers-weave-a', 'numbers', 0.4], ['07-numbers-weave-b', 'numbers', 0.62],
  ['08-work-rail', 'work', 0.35], ['09-work-rail-end', 'work', 0.9], ['10-quote', 'quote', 0.45], ['11-contact-behind', 'contact', 0.32], ['12-contact-face', 'contact', 0.55], ['13-footer', 'footer', 0.3],
];
const FRAMES_LOW = [
  ['01-hero', 'hero', 0], ['03-solutions', 'solutions', 0.3], ['05-process', 'process', 0.4],
  ['06-numbers', 'numbers', 0.4], ['08-work', 'work', 0.4], ['10-quote', 'quote', 0.5], ['11-contact', 'contact', 0.4], ['13-footer', 'footer', 0.5],
];
const ONLY = arg('only', '');
const pick = (fr) => (ONLY ? fr.filter((f) => ONLY.split(',').some((o) => f[0].startsWith(o))) : fr);

const report = existsSync(join(OUT, 'report.json')) ? JSON.parse(readFileSync(join(OUT, 'report.json'), 'utf8')) : {};
const cdp = client(await wsUrl());
await cdp.ready;

async function run(tag, size, query, frames, { rm = false } = {}) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const logs = [];
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)}`);
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400)}`);
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) logs.push(`log ${m.params.entry.level}: ${m.params.entry.text.slice(0, 300)} ${m.params.entry.url || ''}`);
  });
  await s('Runtime.enable'); await s('Log.enable'); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
  if (size.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: rm ? 'reduce' : 'no-preference' }] });
  await s('Page.navigate', { url: BASE + query });
  const ev = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(250); } return false; };
  await sleep(1500);
  if (size.mobile && !rm) { await ev('window.scrollBy(0, 1); window.scrollBy(0, -1); 1'); } // phones mount on first intent
  const flight = await waitFor('window.__velon && window.__velon.flightReady', 20000);
  const pass = rm ? false : await waitFor('window.__velon && window.__velon.badgeReady', 20000);
  await sleep(3600); // entry flight + hero lines + the pass drop
  const shot = async (name) => {
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${tag}-${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file.replace(OUT, '');
  };
  const scrollFor = (id, p) => `(() => { const el = document.querySelector('[data-flight="${id}"]'); const vh = innerHeight;
    const top = el.getBoundingClientRect().top + scrollY; const h = el.offsetHeight; const st = '${id}' === 'hero' ? 0 : top - vh / 2; const en = top + h - vh / 2;
    return Math.max(0, Math.min(document.documentElement.scrollHeight - vh, st + (en - st) * ${p})); })()`;
  const files = [];
  for (const [name, id, p] of frames) {
    const y = await ev(scrollFor(id, p));
    // creep in small steps (lets scrubs, pins and the drone damp like a reader's scroll)
    const from = await ev('scrollY');
    const steps = 6;
    if (process.env.WHEEL) {
      // real wheel input (what Lenis and the pins' snap see from a reader)
      const t0 = Date.now();
      // coarse steps, then small settled ones (Lenis carries momentum, so wait before each correction)
      let calm = 0;
      while (Date.now() - t0 < 40000 && calm < 2) {
        const cy = await ev('scrollY'); const gap = y - cy;
        if (Math.abs(gap) < 40) { calm++; await sleep(500); continue; }
        calm = 0;
        const d = Math.abs(gap) > 600 ? Math.sign(gap) * 240 : gap * 0.5;
        await s('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: d });
        await sleep(Math.abs(gap) > 600 ? 70 : 450);
      }
    } else for (let i = 1; i <= steps; i++) { await ev(`window.scrollTo(0, ${from + ((y - from) * i) / steps}); 1`); await sleep(90); }
    await sleep(2600);
    if (process.env.DBG2) console.log(await ev(`(() => { const b = document.querySelector('.bento'); const cs = getComputedStyle(b, '::before'); const c = getComputedStyle(b); return JSON.stringify({ content: cs.content, bf: cs.backdropFilter, bg: cs.backgroundColor, z: cs.zIndex, pos: cs.position, w: cs.width, iso: c.isolation, bz: c.zIndex, bpos: c.position, flt: document.getElementById('flight') && document.getElementById('flight').style.filter }); })()`));
    if (process.env.DBG) console.log(name, Math.round(y), await ev('Math.round(scrollY)'), await ev(`(() => { const h = document.querySelector('[data-hud]'); return h ? getComputedStyle(h).display + '/' + h.className + '/op=' + getComputedStyle(h).opacity : 'no-hud'; })()`));
    files.push(await shot(name));
  }
  const info = await ev(`({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight, tier: document.documentElement.dataset.tier,
    canvases: document.querySelectorAll('canvas').length, badge: !!(window.__velon && window.__velon.badgeReady) })`);
  if (STRIPS) {
    await ev('window.scrollTo(0, 0); 1'); await sleep(800);
    const chunks = []; const H = size.h; const total = await ev('document.documentElement.scrollHeight');
    for (let y = 0; y < total; y += H) {
      await ev(`window.scrollTo(0, ${y}); 1`); await sleep(1300);
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      chunks.push({ buf: Buffer.from(data, 'base64'), y: await ev('scrollY') });
      if (y + H >= total) break;
    }
    const comp = chunks.map((c) => ({ input: c.buf, top: Math.min(c.y, total - H), left: 0 }));
    const f = join(OUT, `${tag}-full.png`);
    await sharp({ create: { width: size.w, height: total, channels: 3, background: '#ffffff' } }).composite(comp).png().toFile(f);
    // a small preview strip for quick review
    await sharp(f).resize({ width: Math.round(size.w / 3) }).png().toFile(join(OUT, `${tag}-full-small.png`));
    files.push(`${tag}-full.png`);
  }
  const overflow = await ev(`[...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.logos__vp, .footer__giant, .cases__vp, .pass'); }).slice(0, 8).map((e) => e.className || e.tagName)`);
  report[tag] = { ...info, flightReady: flight, passReady: pass, horizontalScroll: info.sw > info.iw, overflow, logs, files };
  await cdp.send('Target.disposeBrowserContext', { browserContextId });
  console.log(tag, JSON.stringify({ flight, pass, ...info, overflow, logs: logs.slice(0, 6) }));
}

try {
  if (SETS.includes('desk')) await run('1440', DESK, '', pick(FRAMES_DESK));
  if (SETS.includes('idle')) await run('1440-idle', DESK, '', []);
  if (SETS.includes('tab')) await run('834', TAB, '', pick(FRAMES_LOW));
  if (SETS.includes('phone')) await run('375', PHONE, '', pick(FRAMES_LOW));
  if (SETS.includes('rm')) { await run('1440-rm', DESK, '?tier=rm', FRAMES_DESK.filter((f) => /^(01|04|06|08|11)/.test(f[0])), { rm: true }); await run('375-rm', PHONE, '?tier=rm', FRAMES_LOW.filter((f) => /^(01|11)/.test(f[0])), { rm: true }); }
  if (SETS.includes('low')) await run('1440-low', DESK, '?tier=low', FRAMES_DESK.filter((f) => /^(01|04|06|11)/.test(f[0])));
  if (SETS.includes('nogl')) await run('1440-nogl', DESK, '?tier=nogl', FRAMES_DESK.filter((f) => /^(01|11)/.test(f[0])));
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  cdp.close(); chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
