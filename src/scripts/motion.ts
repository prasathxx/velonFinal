// Velon motion: one module. Lenis (desktop, fine pointer), the reveal registry, cursor, nav, menu,
// hero intro, pinned process, counters, marquee, quote scrub/cycle, footer wordmark.
// Rules: transform + opacity only; every reveal fires once and reverts its split; reduced motion
// (html.rm, set inline in <head>) gets the final state with nothing hidden, split or pinned.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { store } from '../three/flight-store';
import {
  armTiles, armWake, decideTier, initPassIdentity, registerCounter, scramble, setActiveStepGetter, startFlight, startPass,
} from './flight-bridge';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.config({ nullTargetWarn: false, force3D: true });
ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,load,resize' });

const html = document.documentElement;
const RM = html.classList.contains('rm');
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const DESK = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';
const EASE = 'expo.out';
const DUR = { fast: 0.35, base: 0.7, slow: 1.1 };
const TIER = decideTier();
const FLIGHT = TIER === 'full' || TIER === 'low';
// pages outside the home page's one-scroll choreography (Base.astro flight={false}) skip the drone
// + HUD entirely; the access pass still shows on every page.
const DRONE_OFF = html.dataset.flight === 'off';

const q = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const qa = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const split = (t: gsap.DOMTarget, v: SplitText.Vars) => SplitText.create(t, { aria: 'none', ...v });
const fontsReady = (): Promise<unknown> =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1200))]);
const show = (el: gsap.TweenTarget) => gsap.set(el, { visibility: 'visible' });

let lenis: Lenis | null = null;

/* ------------------------------------------------------------------ Lenis (desktop only), sleeps at rest */
function startLenis() {
  const l = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
  lenis = l;
  l.on('scroll', ScrollTrigger.update);
  gsap.ticker.lagSmoothing(0);
  // applikation driveLenis(): ride the ticker only while scrolling; a page at rest requests no frames
  const li = l as unknown as { time: number; animate?: { isRunning: boolean } };
  let on = false, rest = 0, fresh = false, frameMs = 1000 / 60;
  const tick = (time: number) => {
    const ms = time * 1000;
    if (fresh) { fresh = false; li.time = ms - frameMs; }
    else if (li.time) frameMs = Math.min(50, Math.max(4, ms - li.time));
    l.raf(ms);
    if (l.isScrolling || li.animate?.isRunning) rest = 0;
    else if (++rest > 60) { gsap.ticker.remove(tick); on = false; }
  };
  const wake = () => { rest = 0; if (on) return; on = true; fresh = true; gsap.ticker.add(tick); };
  const evs = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'scroll'] as const;
  evs.forEach((e) => addEventListener(e, wake, { passive: true, capture: true }));
  const scrollTo0 = l.scrollTo.bind(l);
  l.scrollTo = ((...a: Parameters<Lenis['scrollTo']>) => { wake(); return scrollTo0(...a); }) as Lenis['scrollTo'];
  wake();
  return () => {
    evs.forEach((e) => removeEventListener(e, wake, { capture: true }));
    gsap.ticker.remove(tick);
    l.destroy();
    lenis = null;
  };
}
const stopScroll = () => { lenis ? lenis.stop() : (document.body.style.overflow = 'hidden'); };
const startScroll = () => { lenis?.start(); document.body.style.overflow = ''; };

function scrollToTarget(target: HTMLElement | number) {
  if (lenis) { lenis.scrollTo(target, { duration: 1.2 }); return; }
  const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY;
  scrollTo({ top, behavior: RM ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------------ anchors, back to top */
function setupAnchors() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    const el = id === 'top' ? null : document.getElementById(id);
    if (id !== 'top' && !el) return;
    e.preventDefault();
    if (menuOpen) toggleMenu(false, true);
    scrollToTarget(el ?? 0);
    history.replaceState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`);
    const focusEl = el ?? q('#main');
    if (focusEl) {
      if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
      focusEl.focus({ preventScroll: true });
    }
  });
  q('[data-to-top]')?.addEventListener('click', () => {
    scrollToTarget(0);
    q<HTMLElement>('.nav__brand')?.focus({ preventScroll: true });
  });
}

/* ------------------------------------------------------------------ nav: hide on scroll down, show on up */
function setupNav() {
  const nav = q('[data-nav]')!;
  let hidden = false;
  const set = (h: boolean) => {
    if (h === hidden) return; hidden = h;
    gsap.to(nav, { yPercent: h ? -100 : 0, duration: RM ? 0 : 0.5, ease: EASE, overwrite: true });
  };
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('is-scrolled', y > 8);
      if (menuOpen) return set(false);
      if (self.direction === 1 && y > innerHeight * 0.5) set(true);
      else if (self.direction === -1) set(false);
    },
  });
  nav.addEventListener('focusin', () => set(false));
}

/* ------------------------------------------------------------------ nav + HUD glass tone: dark glass over black bands */
function setupNavTone() {
  const nav = q('[data-nav]')!;
  const hud = q('[data-hud]');
  const darks = qa('.band.tone-dark');
  const at = Math.round(32);
  const active = new Set<Element>();
  const activeLow = new Set<Element>();
  darks.forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: `top ${at}px`, end: `bottom ${at}px`,
      onToggle: (self) => { self.isActive ? active.add(el) : active.delete(el); nav.classList.toggle('is-dark', active.size > 0); },
    });
    if (hud) ScrollTrigger.create({
      trigger: el, start: 'top bottom-=30', end: 'bottom bottom-=30',
      onToggle: (self) => { self.isActive ? activeLow.add(el) : activeLow.delete(el); hud.classList.toggle('is-dark', activeLow.size > 0); },
    });
  });
}

/* ------------------------------------------------------------------ menu (phone) */
const menu = q('[data-menu]')!;
const menuBtn = q<HTMLButtonElement>('[data-menu-btn]')!;
const menuLabel = q('[data-menu-label]')!;
let menuOpen = false;
function focusables() {
  return [menuBtn, ...qa<HTMLElement>('a[href]', menu)];
}
function toggleMenu(force?: boolean, instant = false) {
  const open = force ?? !menuOpen;
  if (open === menuOpen) return;
  menuOpen = open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuLabel.textContent = open ? 'Close' : 'Menu';
  const quick = RM || instant;
  if (open) {
    menu.removeAttribute('inert'); menu.setAttribute('aria-hidden', 'false');
    menu.classList.add('is-open'); stopScroll();
    gsap.killTweensOf(menu);
    if (quick) gsap.set(menu, { autoAlpha: 1 });
    else {
      gsap.fromTo(menu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
      gsap.fromTo(qa('.menu__t, .menu__n', menu), { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: EASE, stagger: 0.05, delay: 0.08 });
      gsap.fromTo(qa('.menu__foot > *, .menu__k', menu), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: EASE, stagger: 0.06, delay: 0.25 });
    }
  } else {
    startScroll();
    menu.setAttribute('inert', ''); menu.setAttribute('aria-hidden', 'true');
    gsap.killTweensOf(menu);
    const done = () => { menu.classList.remove('is-open'); gsap.set(menu, { clearProps: 'opacity,visibility' }); };
    if (quick) done();
    else gsap.to(menu, { autoAlpha: 0, duration: 0.3, ease: 'power2.in', onComplete: done });
  }
}
function setupMenu() {
  menuBtn.addEventListener('click', () => toggleMenu());
  // real routes unload the page anyway, but close explicitly too (defensive, and instant for same-page anchors)
  qa('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', () => toggleMenu(false, true)));
  document.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') { toggleMenu(false); menuBtn.focus(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) toggleMenu(false, true); });
}

/* ------------------------------------------------------------------ link roll + button fill + magnetic */
function setupRoll(el: HTMLElement) {
  const [a, b] = qa('.lk', el).map((l) => qa('.ch', l));
  if (!a || !b) return;
  el.addEventListener('mouseenter', () => {
    gsap.to(b, { yPercent: 0, duration: 0.5, ease: 'power2.inOut', stagger: 0.025, overwrite: true });
    gsap.to(a, { yPercent: -105, duration: 0.5, delay: 0.025, ease: 'power2.inOut', stagger: 0.025, overwrite: true });
  });
  el.addEventListener('mouseleave', () => {
    gsap.to(a, { yPercent: 0, duration: 0.5, ease: 'power2.inOut', stagger: 0.025, overwrite: true });
    gsap.to(b, { yPercent: 105, duration: 0.5, delay: 0.025, ease: 'power2.inOut', stagger: 0.025, overwrite: true });
  });
  gsap.set(b, { y: 0, yPercent: 105 });
}
function setupBtn(el: HTMLElement) {
  const label = q('.btn__t', el);
  const dir = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    return Math.abs(dx) > Math.abs(dy) * 2.2 ? { x: dx < 0 ? '-101%' : '101%', y: '0%' } : { x: '0%', y: dy < 0 ? '-101%' : '101%' };
  };
  const hop = (on: boolean) => {
    if (!label) { el.classList.toggle('is-on', on); return; }
    gsap.killTweensOf(label);
    gsap.timeline()
      .to(label, { yPercent: -120, duration: 0.16, ease: 'power3.in' })
      .add(() => el.classList.toggle('is-on', on))
      .fromTo(label, { yPercent: 120 }, { yPercent: 0, duration: 0.26, ease: 'power3.out' });
  };
  el.addEventListener('mouseenter', (e) => {
    const d = dir(e);
    gsap.killTweensOf(el, '--posX,--posY');
    gsap.fromTo(el, { '--posX': d.x, '--posY': d.y }, { '--posX': '0%', '--posY': '0%', duration: 0.3, ease: 'power3.out' });
    hop(true);
  });
  el.addEventListener('mouseleave', (e) => {
    const d = dir(e);
    gsap.killTweensOf(el, '--posX,--posY');
    gsap.to(el, { '--posX': d.x, '--posY': d.y, duration: 0.3, ease: 'power3.in' });
    hop(false);
  });
}
function setupMagnetic(el: HTMLElement) {
  const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: EASE });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: EASE });
  let r: DOMRect | null = null;
  el.addEventListener('pointerenter', () => { r = el.getBoundingClientRect(); });
  el.addEventListener('pointermove', (e) => {
    if (!r) return;
    xTo((e.clientX - (r.left + r.width / 2)) * 0.18);
    yTo((e.clientY - (r.top + r.height / 2)) * 0.18);
  });
  el.addEventListener('pointerleave', () => { r = null; xTo(0); yTo(0); });
}

/* ------------------------------------------------------------------ cursor (desktop) */
function startCursor() {
  const cursor = q('#cursor')!, dot = q('.cur__dot', cursor)!, label = q('.cur__label', cursor)!;
  html.classList.add('cursor-on');
  const pos = { x: -100, y: -100 }, m = { x: -100, y: -100 };
  const xs = gsap.quickSetter(cursor, 'x', 'px'), ys = gsap.quickSetter(cursor, 'y', 'px');
  let running = false, seen = false;
  const tick = () => {
    const k = 1 - Math.pow(1 - 0.2, gsap.ticker.deltaRatio());
    pos.x += (m.x - pos.x) * k; pos.y += (m.y - pos.y) * k;
    xs(pos.x); ys(pos.y);
    if (Math.abs(m.x - pos.x) < 0.1 && Math.abs(m.y - pos.y) < 0.1) { gsap.ticker.remove(tick); running = false; }
  };
  const onMove = (e: PointerEvent) => {
    m.x = e.clientX; m.y = e.clientY;
    if (!seen) { seen = true; pos.x = m.x; pos.y = m.y; gsap.to(cursor, { autoAlpha: 1, duration: 0.2 }); }
    if (!running) { running = true; gsap.ticker.add(tick); }
  };
  gsap.set(cursor, { autoAlpha: 0 });
  gsap.set(dot, { scale: 0.14 });
  const grow = gsap.timeline({ paused: true })
    .to(dot, { scale: 1, duration: 0.25, ease: 'back.out(1.7)' }, 0)
    .to(label, { opacity: 1, duration: 0.3, ease: 'none' }, 0.05);
  let current: Element | null = null, off = false;
  const onOver = (e: PointerEvent) => {
    const t = (e.target as Element).closest('[data-cursor], [data-cursor-off]');
    if (t === current) return;
    current = t;
    const isOff = !!t && t.hasAttribute('data-cursor-off');
    if (t && !isOff) { label.textContent = t.getAttribute('data-cursor') || ''; grow.play(); }
    else grow.reverse();
    if (isOff !== off) { off = isOff; gsap.to(dot, { autoAlpha: isOff ? 0 : 1, duration: 0.2, overwrite: 'auto' }); }
  };
  const onLeave = () => { gsap.to(cursor, { autoAlpha: 0, duration: 0.2 }); seen = false; };
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver);
  document.documentElement.addEventListener('pointerleave', onLeave);
  return () => {
    removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerover', onOver);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    gsap.ticker.remove(tick); grow.kill();
    html.classList.remove('cursor-on');
    gsap.set(cursor, { autoAlpha: 0 });
  };
}

/* ------------------------------------------------------------------ reveal registry */
const trig = (el: Element, start = 'top 88%') => ({ trigger: el, start, once: true });
const delayOf = (el: HTMLElement, d = 0) => Number(el.dataset.delay ?? d);
const lineTargets = (el: HTMLElement) => { const lns = qa('.ln', el); return lns.length ? lns : el; };

const MODES: Record<string, (el: HTMLElement) => void> = {
  lines(el) {
    const s = split(lineTargets(el), { type: 'lines', mask: 'lines', linesClass: 'rv-line' });
    show(el);
    gsap.from(s.lines, { yPercent: 112, duration: DUR.slow, ease: EASE, stagger: 0.06, delay: delayOf(el), scrollTrigger: trig(el), onComplete: () => s.revert() });
  },
  words(el) {
    const s = split(el, { type: 'words', wordsClass: 'rv-word' });
    show(el);
    gsap.from(s.words, { opacity: 0, y: 10, duration: 0.9, ease: 'power3.out', stagger: 0.022, delay: delayOf(el, 0.1), scrollTrigger: trig(el), onComplete: () => s.revert() });
  },
  fade(el) {
    show(el);
    const lt = el.classList.contains('label') ? q('.label__t', el) : null;
    const text = lt?.textContent ?? '';
    gsap.from(el, {
      opacity: 0, y: 28, duration: DUR.base, ease: EASE, delay: delayOf(el), scrollTrigger: trig(el), clearProps: 'transform,opacity',
      onStart: () => { if (lt && text) scramble(lt, text, 0.35); },
    });
  },
  stagger(el) {
    show(el);
    gsap.from(el.children, { opacity: 0, y: 32, duration: DUR.slow, ease: EASE, stagger: 0.08, delay: delayOf(el), scrollTrigger: trig(el), clearProps: 'transform,opacity' });
  },
  rule(el) {
    show(el);
    gsap.from(el, { scaleX: 0, transformOrigin: '0% 50%', duration: 1.3, ease: EASE, scrollTrigger: trig(el, 'top 94%'), clearProps: 'transform' });
  },
};
function initReveals() {
  qa('[data-reveal]').forEach((el) => {
    const fn = MODES[el.dataset.reveal || ''];
    if (!fn || el.dataset.armed) return;
    el.dataset.armed = '1';
    try { fn(el); } catch { show(el); }
  });
}

/* ------------------------------------------------------------------ preloader (first visit) */
async function preloader() {
  if (!html.classList.contains('is-loading')) return;
  const loader = q('.loader')!;
  const tl = gsap.timeline();
  tl.from(qa('.loader__mark .ch', loader), { xPercent: 120, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05 }, 0.05)
    .to(q('.loader__bar', loader), { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, 0)
    .to(loader, { autoAlpha: 0, duration: 0.4, ease: 'power1.inOut' }, 0.68);
  tl.eventCallback('onComplete', () => html.classList.remove('is-loading'));
  try { sessionStorage.setItem('velon-seen', '1'); } catch { /* storage unavailable */ }
  await new Promise<void>((r) => { tl.call(r, undefined, 0.78); }); // the hero starts as the veil lifts
}

/* ------------------------------------------------------------------ hero intro */
function buildHero() {
  // inner pages (products, contact, legal…) have no hero: skip its intro instead of failing the whole boot
  const title = q('[data-hero-title]');
  const lead = q('[data-hero-lead]');
  if (!title || !lead) return null;
  const fades = qa('[data-hero-fade]');
  const s = split(qa('.ln', title), { type: 'lines', mask: 'lines', linesClass: 'rv-line' });
  const w = split(lead, { type: 'words', wordsClass: 'rv-word' });
  const tl = gsap.timeline({ paused: true, onComplete: () => { s.revert(); w.revert(); } });
  tl.set([title, lead, ...fades], { visibility: 'visible' }, 0)
    .from(s.lines, { yPercent: 112, duration: 1.2, ease: EASE, stagger: 0.09 }, 0.15)
    .from(fades.slice(0, 2), { opacity: 0, y: 12, duration: DUR.base, ease: EASE, stagger: 0.06 }, 0.2)
    .from(w.words, { opacity: 0, y: 10, duration: 0.9, ease: 'power3.out', stagger: 0.022 }, 0.55)
    .from(fades.slice(2), { opacity: 0, y: 28, duration: DUR.base, ease: EASE, stagger: 0.08, clearProps: 'transform,opacity' }, 0.75);
  return tl;
}

/* ------------------------------------------------------------------ parallax */
function setupParallax() {
  qa('[data-parallax]').forEach((el) => {
    const v = parseFloat(el.dataset.parallax || '4');
    gsap.fromTo(el, { yPercent: 0 }, { yPercent: v * 2, ease: 'none', scrollTrigger: { trigger: el.closest('section') || el, start: 'top top', end: 'bottom top', scrub: 0.5 } });
  });
}

/* ------------------------------------------------------------------ marquee (kpr useMarquee port) */
function setupMarquee() {
  const vp = q('[data-marquee]'); const track = q('[data-marquee-track]');
  if (!vp || !track) return;
  const first = track.children[0] as HTMLElement;
  let tween: gsap.core.Tween | undefined;
  let visible = false;
  const build = () => {
    const prog = tween?.progress() ?? 0;
    tween?.kill();
    const dist = first.offsetWidth;
    if (!dist) return;
    const wrap = gsap.utils.wrap(-dist, 0);
    tween = gsap.fromTo(track, { x: 0 }, {
      x: -dist, duration: dist / 60, ease: 'none', repeat: -1,
      modifiers: { x: (x: string) => `${wrap(parseFloat(x))}px` },
    });
    tween.progress(prog);
    if (!visible) tween.pause();
  };
  build();
  new ResizeObserver(() => build()).observe(first);
  const speedTo = (v: number) => tween && gsap.to(tween, { timeScale: v, duration: 0.6, ease: 'power2.out', overwrite: true });
  vp.addEventListener('pointerenter', () => speedTo(0));
  vp.addEventListener('pointerleave', () => speedTo(1));
  ScrollTrigger.create({ trigger: vp, start: 'top bottom', end: 'bottom top', onToggle: (self) => { visible = self.isActive; if (visible) { tween?.play(); } else tween?.pause(); } });
}

/* ------------------------------------------------------------------ counters (kpr useCounter port) */
function setupCounters() {
  qa('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const dec = Number(el.dataset.decimals || 0);
    const nf = new Intl.NumberFormat('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const final = nf.format(target);
    el.style.minWidth = `${el.getBoundingClientRect().width}px`; // reserve the final width: the suffix never moves
    el.setAttribute('aria-label', final + (el.nextElementSibling?.textContent || ''));
    el.textContent = nf.format(0);
    const o = { v: 0 };
    const tw = gsap.to(o, {
      v: target, duration: 1.6, ease: 'power1.out', paused: true,
      onUpdate: () => { el.textContent = nf.format(o.v); },
      onComplete: () => { el.textContent = final; },
    });
    let started = false;
    const start = () => { if (started) return; started = true; tw.play(); };
    registerCounter(el, start);
    ScrollTrigger.create({
      trigger: el, start: 'top 70%', once: true,
      onEnter: () => (FLIGHT && store.ready ? gsap.delayedCall(1.1, start) : start()),
    });
    ScrollTrigger.create({ trigger: el, start: 'top 15%', once: true, onEnter: start });
  });
}

/* ------------------------------------------------------------------ process: pinned steps (desktop) */
function startProcessPin() {
  const sec = q('[data-process]');
  if (!sec) return;
  const steps = qa('[data-step]', sec);
  const nums = qa('[data-step-num]', sec);
  const idx = qa('[data-step-idx]', sec);
  const bar = q('[data-process-bar]', sec);
  const N = steps.length;
  if (N < 2) return;
  sec.classList.add('is-pinned');
  const digits = (i: number) => qa('.d > span', nums[i]);
  gsap.set(steps.slice(1), { autoAlpha: 0 });
  nums.forEach((_, i) => { if (i) gsap.set(digits(i), { yPercent: 110 }); });
  let active = -1;
  setActiveStepGetter(() => (active >= 0 ? q('.step__title', steps[active]) : null));
  const mark = (i: number) => {
    if (i === active) return;
    if (active >= 0) gsap.to(store, { dip: -0.08, duration: 0.3, ease: 'power2.inOut', yoyo: true, repeat: 1, overwrite: true });
    active = i;
    idx.forEach((li, k) => li.classList.toggle('is-active', k === i));
    steps.forEach((s, k) => s.setAttribute('aria-hidden', k === i ? 'false' : 'true'));
  };
  mark(0);
  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  const times: number[] = [0];
  tl.addLabel('s0', 0);
  for (let i = 1; i < N; i++) {
    const t0 = tl.duration() + 0.35;
    const prev = steps[i - 1], next = steps[i];
    tl.to(digits(i - 1), { yPercent: -110, duration: 0.35, ease: 'power3.in', stagger: 0.04 }, t0)
      .fromTo(digits(i), { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: EASE, stagger: 0.05 }, t0 + 0.25)
      .to(prev, { autoAlpha: 0, y: -24, duration: 0.3, ease: 'power3.in' }, t0)
      .fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t0 + 0.3)
      .fromTo(qa('[data-step-part]', next), { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE, stagger: 0.08 }, t0 + 0.3);
    tl.addLabel(`s${i}`, t0 + 0.85);
    times.push(t0 + 0.85);
  }
  tl.to({}, { duration: 0.35 }, '>');
  if (bar) tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: tl.duration(), ease: 'none' }, 0);
  ScrollTrigger.create({
    animation: tl,
    trigger: sec,
    start: 'top top',
    end: () => `+=${innerHeight * 0.6 * N}`,
    pin: q('.process__pin', sec),
    scrub: 0.6,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    refreshPriority: 1,
    snap: { snapTo: 'labelsDirectional', duration: { min: 0.2, max: 0.6 }, ease: 'power1.inOut', delay: 0.05 },
    onUpdate: () => {
      const t = tl.time();
      let best = 0;
      times.forEach((x, k) => { if (Math.abs(x - t) < Math.abs(times[best] - t)) best = k; });
      mark(best);
    },
  });
  return () => {
    setActiveStepGetter(() => null);
    sec.classList.remove('is-pinned');
    steps.forEach((s) => s.removeAttribute('aria-hidden'));
    idx.forEach((li) => li.classList.remove('is-active'));
  };
}
function stackedSteps() {
  qa('[data-step]').forEach((s) => {
    gsap.from(s, { opacity: 0, y: 28, duration: DUR.base, ease: EASE, scrollTrigger: { trigger: s, start: 'top 88%', once: true }, clearProps: 'transform,opacity' });
  });
}

/* ------------------------------------------------------------------ cases: pinned horizontal rail (desktop) */
function startRail() {
  const sec = q('[data-rail-sec]');
  const vp = q('[data-rail-vp]');
  const track = q('[data-rail-track]');
  if (!sec || !vp || !track) return;
  const cards = qa('[data-rail-card]', track);
  const N = cards.length;
  if (N < 2) return;
  html.classList.add('rail');
  const bar = q('[data-rail-bar]', sec);
  const idx = q('[data-rail-i]', sec);
  const dist = () => Math.max(0, track.scrollWidth - vp.clientWidth);
  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  tl.fromTo(track, { x: 0 }, { x: () => -dist(), duration: 1 }, 0);
  if (bar) tl.fromTo(bar, { scaleX: 1 / N }, { scaleX: 1, duration: 1 }, 0);
  // one label per card, at the scroll position that brings it to the left edge (clamped to the end)
  const labels = () => {
    const d = dist() || 1;
    cards.forEach((c, i) => tl.addLabel(`c${i}`, Math.min(1, c.offsetLeft - cards[0].offsetLeft) / d));
  };
  labels();
  let cur = -1;
  const st = ScrollTrigger.create({
    animation: tl,
    trigger: sec,
    start: 'top top',
    end: () => `+=${dist()}`,
    pin: q('.cases__pin', sec),
    scrub: 0.6,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onRefresh: labels,
    snap: { snapTo: 'labelsDirectional', duration: { min: 0.2, max: 0.6 }, ease: 'power1.inOut', delay: 0.05 },
    onUpdate: (self) => {
      const i = Math.min(N - 1, Math.round(self.progress * (N - 1)));
      if (i !== cur && idx) { cur = i; idx.textContent = String(i + 1).padStart(2, '0'); }
    },
  });
  return () => {
    st.kill(); tl.kill();
    gsap.set(track, { clearProps: 'transform' });
    html.classList.remove('rail');
  };
}

/* ------------------------------------------------------------------ TiltCard (Solutions, fine pointer) */
function setupTilt(el: HTMLElement) {
  gsap.set(el, { transformPerspective: 1200 });
  const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
  const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
  let r: DOMRect | null = null;
  const enter = () => { r = el.getBoundingClientRect(); };
  const move = (e: PointerEvent) => {
    if (!r) r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
    ry(nx * 12); rx(-ny * 12);
    el.style.setProperty('--sx', `${((nx + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--sy', `${((ny + 0.5) * 100).toFixed(1)}%`);
  };
  const leave = () => { r = null; rx(0); ry(0); };
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointerenter', enter);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    gsap.set(el, { clearProps: 'transform' });
  };
}

/* ------------------------------------------------------------------ quote: scrubbed brightening + cycle */
function setupQuote() {
  const sec = q('[data-quotes]');
  if (!sec) return;
  const items = qa('[data-quote]', sec);
  const stack = q('[data-quote-stack]', sec)!;
  qa('[data-quote-text] p', sec).forEach((p) => {
    split(p, {
      type: 'lines', linesClass: 'q-line', autoSplit: true,
      onSplit: (self: SplitText) => gsap.fromTo(self.lines, { opacity: 0.42 }, {
        opacity: 1, stagger: 0.1, ease: 'none',
        scrollTrigger: { trigger: stack, start: 'top 80%', end: 'bottom 55%', scrub: 0 },
      }),
    });
  });
  if (items.length < 2) return;
  const counter = q('[data-quote-i]', sec);
  let i = 0, timer = 0, inView = false, held = false;
  const go = (n: number) => {
    const cur = items[i], nxt = items[n];
    gsap.to(cur, { autoAlpha: 0, y: -16, duration: 0.45, ease: 'power3.in', onComplete: () => { cur.classList.remove('is-active'); } });
    gsap.fromTo(nxt, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: EASE, delay: 0.4, onStart: () => { nxt.classList.add('is-active'); } });
    cur.setAttribute('aria-hidden', 'true'); nxt.removeAttribute('aria-hidden');
    if (counter) counter.textContent = String(n + 1).padStart(2, '0');
    i = n;
  };
  const arm = () => { clearInterval(timer); if (inView && !held) timer = window.setInterval(() => go((i + 1) % items.length), 7000); };
  ScrollTrigger.create({ trigger: sec, start: 'top 75%', end: 'bottom 25%', onToggle: (s) => { inView = s.isActive; arm(); } });
  stack.addEventListener('pointerenter', () => { held = true; arm(); });
  stack.addEventListener('pointerleave', () => { held = false; arm(); });
  sec.addEventListener('focusin', () => { held = true; arm(); });
  sec.addEventListener('focusout', () => { held = false; arm(); });
}

/* ------------------------------------------------------------------ footer giant wordmark */
function setupGiant() {
  const g = q('[data-giant]');
  if (!g) return;
  const chars = qa('.g', g);
  show(chars);
  gsap.from(chars, { yPercent: 100, duration: 1, ease: EASE, stagger: 0.03, scrollTrigger: { trigger: g, start: 'top 95%', once: true }, clearProps: 'transform' });
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  html.classList.add('motion-ready');
  html.dataset.tier = TIER;
  initPassIdentity(); // updates the static SVG pass on every page, before anything 3D mounts
  setupAnchors();
  setupMenu();
  setupNavTone();
  if (RM) { if (!DRONE_OFF) startFlight(TIER, Promise.resolve()); return; } // final state is the resting state: poster + static pass

  let heroDoneResolve: () => void = () => {};
  const heroDone = new Promise<void>((r) => { heroDoneResolve = r; });

  if (FINE) {
    html.classList.add('fx');
    qa('[data-roll]').forEach(setupRoll);
    qa('[data-btn]').forEach(setupBtn);
    qa('[data-magnetic]').forEach(setupMagnetic);
  }
  setupNav();

  const intro = preloader();
  await fontsReady();
  const hero = buildHero();

  // breakpoint flips swap pinned ↔ stacked layouts (different heights): keep the reader on the same
  // section at the same relative depth instead of whatever raw scrollY the new layout lands on
  let anchor: { el: HTMLElement; f: number } | null = null;
  const saveAnchor = () => {
    const mid = innerHeight / 2;
    const el = qa('[data-flight]').find((e) => { const r = e.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    if (el && scrollY > 0) { const r = el.getBoundingClientRect(); anchor = { el, f: (mid - r.top) / r.height }; }
  };
  const restoreAnchor = () => {
    const a = anchor; anchor = null;
    if (!a) return;
    ScrollTrigger.refresh();
    const r = a.el.getBoundingClientRect();
    const y = Math.max(0, r.top + scrollY + a.f * r.height - innerHeight / 2);
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
    ScrollTrigger.update();
  };
  let booted = false;
  const mm = gsap.matchMedia();
  mm.add({ desk: DESK, rest: `not all and ${DESK}` }, (ctx) => {
    const { desk } = ctx.conditions as { desk: boolean };
    if (booted) requestAnimationFrame(restoreAnchor);
    booted = true;
    // the flight re-mounts with the right path/tier whenever the breakpoint flips (no duplicate canvases)
    const stopFlight = DRONE_OFF ? () => {} : startFlight(desk ? TIER : TIER === 'full' ? 'low' : TIER, heroDone);
    if (!desk) { stackedSteps(); return () => { saveAnchor(); stopFlight(); }; }
    const stopLenis = startLenis();
    const stopCursor = startCursor();
    const stopPin = startProcessPin();
    const stopRail = startRail();
    const stopTilt = qa('[data-tilt]').map(setupTilt);
    return () => { saveAnchor(); stopTilt.forEach((f) => f()); stopRail?.(); stopPin?.(); stopCursor(); stopLenis(); stopFlight(); };
  });
  startPass(TIER, heroDone);
  armWake(FLIGHT);

  setupParallax();
  setupMarquee();
  initReveals();
  setupCounters();
  armTiles();
  setupQuote();
  setupGiant();
  ScrollTrigger.refresh();

  await intro;
  hero?.play();
  // the drone is cleared to mount as the statement lines land (it lands ≈0.2 s after them)
  gsap.delayedCall(1.2, heroDoneResolve);
  // after the veil: re-measure once (the loader locked body overflow)
  gsap.delayedCall(1, () => ScrollTrigger.refresh());
}

boot().catch(() => html.classList.add('reveal-fallback'));
