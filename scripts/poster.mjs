// Renders public/poster/hero-drone.webp: the drone's hero hover pose on a transparent page
// (?poster mode), cropped around its projected screen position. Run with the dev server on 3950:
// node --experimental-websocket scripts/poster.mjs
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const PORT = 9800 + Math.floor(Math.random() * 100);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = join(tmpdir(), `velon-poster-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
const sock = new WebSocket(ws); let id = 0; const pend = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
await new Promise((r) => (sock.onopen = r));
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params, sessionId })); });
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await s('Page.navigate', { url: 'http://localhost:3950/?poster' });
  const ev = async (x) => (await s('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  for (let i = 0; i < 80 && !(await ev('!!(window.__velon && window.__velon.flightReady)')); i++) await sleep(250);
  await sleep(5000);
  const p = await ev('({ ...window.__velon.store.screen })');
  const w = p.r * 3.2, h = p.r * 2.2;
  const clip = { x: Math.max(0, p.x - w / 2), y: Math.max(0, p.y - h * 0.55), width: w, height: h, scale: 1 };
  const { data } = await s('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  mkdirSync('public/poster', { recursive: true });
  await sharp(Buffer.from(data, 'base64')).trim({ threshold: 1 }).resize({ width: 900, height: 640, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90 }).toFile('public/poster/hero-drone.webp');
  console.log('poster', p, clip);
} finally { sock.close(); chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
