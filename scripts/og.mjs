// Renders public/og.jpg (1200x630): black ground, white wordmark + tagline, set in the real fonts.
// Headless Chrome screenshots a tiny HTML page; sharp converts it to JPEG.
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
const font = (p) => pathToFileURL(join(root, 'node_modules/@fontsource-variable', p)).href;
const html = `<!doctype html><html><head><style>
@font-face{font-family:J;src:url(${font('plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')});font-weight:100 900}
@font-face{font-family:M;src:url(${font('jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2')});font-weight:100 900}
*{margin:0}body{width:1200px;height:630px;background:#0a0a0a;color:#fff;font-family:J;display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;box-sizing:border-box}
.top{display:flex;justify-content:space-between;font:500 15px M;letter-spacing:.14em;text-transform:uppercase;color:#a1a1aa}
.mark{display:flex;align-items:center;gap:22px;font-weight:700;font-size:64px;letter-spacing:-.05em}
h1{font-weight:700;font-size:92px;line-height:.9;letter-spacing:-.05em;text-transform:uppercase}
</style></head><body>
<div class="top"><span>Software, delivered as solutions</span><span>velon</span></div>
<h1>We build<br>the systems<br>you run on.</h1>
<div class="mark"><svg width="52" height="52" viewBox="0 0 24 24"><path d="M1.5 3h5.6L12 15.2 16.9 3h5.6l-8.1 18h-4.8z" fill="#fff"/><path d="M9.2 3h5.6L12 9.6z" fill="#fff"/></svg>Velon</div>
</body></html>`;
const tmpHtml = join(tmpdir(), 'velon-og.html'), tmpPng = join(tmpdir(), 'velon-og.png');
writeFileSync(tmpHtml, html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--hide-scrollbars', '--window-size=1200,630', `--screenshot=${tmpPng}`, '--virtual-time-budget=2000', pathToFileURL(tmpHtml).href,
], { stdio: 'ignore' });
await sharp(tmpPng).resize(1200, 630).jpeg({ quality: 88, mozjpeg: true }).toFile(join(root, 'public/og.jpg'));
rmSync(tmpHtml); rmSync(tmpPng);
console.log('public/og.jpg written');
