// Verification screenshots with headless Chrome over CDP (no Playwright).
// Run: node --experimental-websocket scripts/shots.mjs [url] [--rm]
// For each width: section-by-section viewport shots (reveals have played), mid-pin frames on desktop,
// a stitched full-page strip, console errors/warnings and a horizontal-overflow check -> screenshots/report.json
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const URL_ = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3950/';
const ONLY_RM = process.argv.includes('--rm');
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const sizes = [
  { w: 375, h: 812, mobile: true },
  { w: 834, h: 1112, mobile: true },
  { w: 1440, h: 900, mobile: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = join(tmpdir(), `velon-shots-${Date.now()}`);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu-vsync', 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 50; i++) {
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

const report = {};
const cdp = client(await wsUrl());
await cdp.ready;

async function run(size, rm) {
  const tag = `${size.w}${rm ? '-rm' : ''}`;
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const logs = [];
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) logs.push(`log ${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  await s('Runtime.enable'); await s('Log.enable'); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
  if (size.mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: rm ? 'reduce' : 'no-preference' }] });
  await s('Page.navigate', { url: URL_ });
  await sleep(3200);
  const ev = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const shot = async (name) => {
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${tag}-${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };
  const files = [];
  files.push(await shot('01-hero'));
  const info = await ev(`({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight,
    fine: matchMedia('(hover: hover) and (pointer: fine)').matches, cls: document.documentElement.className })`);
  // walk the page by viewport, letting reveals play, and stitch a full strip
  const chunks = [];
  let y = 0; const H = size.h;
  const total = await ev('document.documentElement.scrollHeight');
  while (y < total) {
    await ev(`window.scrollTo(0, ${y}); window.__lenis?.scrollTo?.(${y}, { immediate: true }); 1`);
    await sleep(1500);
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    const realY = await ev('scrollY');
    chunks.push({ buf: Buffer.from(data, 'base64'), y: realY });
    if (realY + H >= total) break;
    y += H;
  }
  const full = await ev('document.documentElement.scrollHeight');
  const comp = chunks.map((c) => ({ input: c.buf, top: Math.min(c.y, full - H), left: 0 }));
  await sharp({ create: { width: size.w, height: full, channels: 3, background: '#ffffff' } }).composite(comp).png().toFile(join(OUT, `${tag}-full.png`));
  files.push(join(OUT, `${tag}-full.png`));
  // named section shots
  const secs = [['02-solutions', '#solutions'], ['03-process', '#process'], ['04-numbers', '.numbers'], ['05-work', '#work'], ['06-quote', '.quote'], ['07-cta', '#contact'], ['08-footer', '.footer']];
  for (const [name, sel] of secs) {
    await ev(`(() => { const el = document.querySelector('${sel}'); const t = el.getBoundingClientRect().top + scrollY; window.scrollTo(0, t); return t; })()`);
    await sleep(1600);
    files.push(await shot(name));
  }
  if (!size.mobile && !rm) {
    // mid-pin frames: the pinned process at 1/3 and 2/3 of its scroll
    const st = await ev(`(() => { const el = document.querySelector('#process'); const t = el.getBoundingClientRect().top + scrollY; window.scrollTo(0, t - 400); return t; })()`);
    await sleep(800);
    for (const [k, f] of [['a', 0.2], ['b', 0.5], ['c', 0.8]]) {
      // creep forward so directional snapping settles on the next label, as a reader's scroll would
      const goal = await ev(`${st} + innerHeight * 0.6 * 4 * ${f}`);
      for (let k2 = 0; k2 < 10; k2++) { const d = goal - (await ev('scrollY')); await s('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: d / 3 }); await sleep(80); }
      await sleep(2000);
      files.push(await shot(`03-process-pin-${k}`));
    }
    // hover states: first solution card and second case row
    for (const [name, sel] of [['09-hover-card', '.card'], ['10-hover-case', '.case__row[data-case="1"]']]) {
      const pt = await ev(`(() => { const el = document.querySelector('${sel}'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height / 2 }; })()`);
      await sleep(900);
      const p2 = await ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width * 0.3, y: r.top + r.height / 2 }; })()`);
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x - 40, y: p2.y });
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x, y: p2.y });
      await sleep(900);
      files.push(await shot(name));
      void pt;
    }
  }
  if (size.w === 375 && !rm) {
    await ev('window.scrollTo(0, 0); 1'); await sleep(600);
    await ev(`document.querySelector('[data-menu-btn]').click(); 1`); await sleep(1300);
    files.push(await shot('11-menu-open'));
  }
  const overflow = await ev(`[...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.logos__vp, .footer__giant'); }).slice(0, 8).map((e) => e.className || e.tagName)`);
  report[tag] = { ...info, horizontalScroll: info.sw > info.iw, overflowingElements: overflow, logs, files: files.map((f) => f.replace(OUT, 'screenshots/')) };
  await cdp.send('Target.disposeBrowserContext', { browserContextId });
}

try {
  for (const size of sizes) {
    if (!ONLY_RM) await run(size, false);
    await run(size, true);
  }
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { hscroll: v.horizontalScroll, overflow: v.overflowingElements, logs: v.logs, fine: v.fine, cls: v.cls }])), null, 2));
  cdp.close(); chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
