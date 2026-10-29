// Tune Up beta — screens, router, overlays. Screens are functions returning {title, sub, body, footer, header, tabs, center, actions, after}.
import { t, esc, LANG } from './i18n.js';
import { S } from './state.js';
import { playMotion, fxLayer } from './motion.js';

export const I = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  plan: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/></svg>',
  chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M6 15l4-5 4 3 5-7"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  gear: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2-7z"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>',
  link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4l8.4-5.2z" fill="currentColor"/></svg>',
  video: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  spark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 18l.7 1.8L7.5 20.5l-1.8.7L5 23l-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
  dot: '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  clip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5l-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9 9a1.5 1.5 0 0 1-2.1-2.1l8.3-8.3"/></svg>',
  file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  stop: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  dots: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  mic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  thumb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2v4h5a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7"/></svg>'
};

export const SCREENS = {};
export const NAV = { stack: [], tab: null, tabs: [] };
export const A = {};                      // actions reachable from inline onclick="A.name()"
window.A = A;

export function go(name, params, opts) { NAV.stack.push({ name, params: params || {} }); render((opts && opts.anim) || 'enter'); track('screen', { name }); }

// usage events (no personal data): screen names, log kinds, feedback, tune
export function track(event, props) {
  const C = window.TUNE_CFG || {}; if (!C.posthog) return;
  try { fetch((C.posthogHost || 'https://eu.i.posthog.com') + '/capture/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: C.posthog, event, distinct_id: S.me ? S.me.id : 'anon', properties: Object.assign({ role: S.me ? S.me.role : null, lang: document.documentElement.lang }, props || {}) }) }).catch(() => {}); } catch (e) {}
}
export function back() { if (NAV.stack.length > 1) { NAV.stack.pop(); render('enter-back'); } }
export function replace(name, params) { NAV.stack[NAV.stack.length - 1] = { name, params: params || {} }; render('fade'); }
export function root(name, params) { NAV.tab = name; NAV.stack = [{ name, params: params || {} }]; render('fade'); }
export function setTabs(tabs) { NAV.tabs = tabs || []; }
export function cur() { return NAV.stack[NAV.stack.length - 1]; }
export function rerender() { render(null); }
A.go = go; A.back = back; A.setTab = root;

function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// A redraw of the SAME screen (rerender, anim = null) keeps the person where they were: the scroll position of the
// screen and of any scrolling row, the open sheet (untouched, so it does not slide in again) and the focused field.
// Before 27 Oct every button that changed something threw the screen back to the top (most visible on phones).
function keepView(app) {
  const body = document.getElementById('body'); const sig = e => e.tagName + '.' + [...e.classList].sort().join('.');
  const rows = []; if (body) body.querySelectorAll('*').forEach(e => { if (e.scrollLeft > 0 || e.scrollTop > 0) { const s = sig(e); rows.push({ id: e.id, s, i: [...body.querySelectorAll('*')].filter(x => sig(x) === s).indexOf(e), left: e.scrollLeft, top: e.scrollTop }); } });
  const f = document.activeElement; const focus = f && f.id && body && body.contains(f) ? { id: f.id, s: f.selectionStart, e: f.selectionEnd } : null;
  const ov = document.getElementById('overlay'); return { top: body ? body.scrollTop : 0, rows, focus, overlay: ov && ov.firstChild ? ov : null, sig };
}
function restoreView(k) {
  const body = document.getElementById('body'); if (!body) return;
  body.scrollTop = k.top;
  for (const r of k.rows) { const e = r.id ? document.getElementById(r.id) : [...body.querySelectorAll('*')].filter(x => k.sig(x) === r.s)[r.i]; if (e) { e.scrollLeft = r.left; e.scrollTop = r.top; } }
  if (k.focus) { const e = document.getElementById(k.focus.id); if (e && e.focus) { e.focus({ preventScroll: true }); try { if (k.focus.s != null) e.setSelectionRange(k.focus.s, k.focus.e); } catch (err) {} } }
}

export function render(anim) {
  const app = document.getElementById('app');
  const keep = anim == null && app.querySelector('.screen') ? keepView(app) : null;
  app.setAttribute('lang', LANG.cur);
  const c = cur(); if (!c) return;
  const scr = SCREENS[c.name];
  if (!scr) { app.innerHTML = '<div class="body center">Missing screen ' + esc(c.name) + '</div>'; return; }
  const v = scr(c.params) || {};
  let hdr = '';
  if (v.header !== false) {
    hdr = '<div class="hdr">' + (v.back !== false && NAV.stack.length > 1 ? '<button class="back" onclick="A.back()" aria-label="Back">' + I.back + '</button>' : '') +
      (v.lead || '') + '<div class="grow"><div class="title">' + esc(v.title || '') + '</div>' + (v.sub ? '<div class="sub">' + esc(v.sub) + '</div>' : '') + '</div>' + (v.actions || '') + (v.bell !== false && NAV.tabs.length && NAV.stack.length === 1 ? bell() : '') + '</div>';
  }
  const tabs = v.tabs !== false && NAV.tabs.length ? tabbar() : '';
  const html = '<div class="status"><span>' + nowHM() + '</span><span class="sig">' + I.dot + I.dot + I.dot + '</span></div>' +
    '<div class="screen-wrap"><div class="screen ' + (anim || '') + '">' + hdr + '<div class="body ' + (v.center ? 'center' : '') + '" id="body">' + (v.body || '') + '</div>' + (v.footer || '') + '</div></div>' + tabs;
  if (keep && keep.overlay) { [...app.children].forEach(c => { if (c !== keep.overlay) c.remove(); }); keep.overlay.insertAdjacentHTML('beforebegin', html); }   // the open sheet stays as it is
  else app.innerHTML = html + '<div id="overlay"></div>';
  if (keep) restoreView(keep);
  try { playMotion(c.name, !!anim, toast); } catch (e) { console.warn('motion', e); }
  if (v.after) v.after();
}

function tabbar() {
  return '<div class="tabbar">' + NAV.tabs.map(tb => '<button class="' + (NAV.tab === tb.id ? 'on' : '') + '" onclick="A.setTab(\'' + tb.id + '\')"><span class="ico">' + I[tb.ico] + '</span>' + esc(t(tb.label)) +
    (tb.badge && tb.badge() ? '<span class="badge">' + tb.badge() + '</span>' : '') + '</button>').join('') + '</div>';
}
// new notifications / unread counts arrived in the background: update the bell dot and the tab badges only, so whatever
// the person is reading or typing stays exactly as it is
export function refreshBadges() {
  const app = document.getElementById('app'); if (!app) return;
  const tb = app.querySelector('.tabbar'); if (tb) tb.outerHTML = tabbar();
  const b = app.querySelector('.hdr button[aria-label="Notifications"]'); if (b) b.outerHTML = bell();
}
export function bell() { return '<button class="act" onclick="A.go(\'notifs\')" aria-label="Notifications">' + I.bell + (S.unread ? '<span class="dot"></span>' : '') + '</button>'; }
export function sheet(html) {
  const o = document.getElementById('overlay'); if (!o) return;
  // a sheet that is already open is redrawn in place: no second slide-in, and the same sheet keeps its scroll position
  const old = o.querySelector('.sheet'); let sh, keepTop = null;
  if (old) {
    const h2 = s => { const m = /<div class="h2">([\s\S]*?)<\/div>/.exec(s); return m ? m[1] : null; };
    const oldH2 = old.querySelector('.h2'); if (oldH2 && h2(html) != null && oldH2.innerHTML === h2(html)) keepTop = old.scrollTop;
    if (keepTop == null) { old._maxH = 0; old.style.minHeight = ''; }   // another sheet: its own height
    old.innerHTML = html; old.style.transform = ''; sh = old;
  } else {
    o.innerHTML = '<div class="sheet-bg" onclick="if(event.target===this)A.closeSheet()"><div class="sheet">' + html + '</div></div>';
    sh = o.querySelector('.sheet'); swipeToClose(sh); holdHeight(sh);
  }
  // the trailing buttons go into a footer that stays at the bottom while the form above it scrolls
  const tail = [];
  for (let c = sh.lastElementChild; c && (c.matches('button.btn, .btn-row')); c = c.previousElementSibling) tail.unshift(c);
  if (tail.length) { const f = document.createElement('div'); f.className = 'sheet-foot'; tail.forEach(c => f.appendChild(c)); sh.appendChild(f); if (sh.scrollHeight <= sh.clientHeight + 1) f.classList.add('flat'); }
  sh.scrollTop = keepTop || 0;
}
// drag a panel down (from its top, or anywhere while it is scrolled to the top) to close it
function swipeToClose(sh) {
  let y0 = null, dy = 0;
  sh.addEventListener('touchstart', e => { if (e.target.closest('input, textarea, select') || sh.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  const end = () => { if (y0 == null) return; y0 = null; if (dy > 90) { closeSheet(); return; } sh.style.transition = 'transform .2s ease'; sh.style.transform = ''; };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}
// an open sheet only grows: when its content changes (suggestions appear while typing, a chip is toggled) the top edge
// stays put instead of jumping up and down. Capped at the sheet's own maximum (88 %), so it still fits above the keyboard.
function holdHeight(sh) {
  if (!window.ResizeObserver) return;
  new ResizeObserver(() => { const h = sh.offsetHeight; if (h > (sh._maxH || 0) + 1) { sh._maxH = h; sh.style.minHeight = 'min(' + h + 'px, 88%)'; } }).observe(sh);
}
export function closeSheet() {
  const o = document.getElementById('overlay'); if (!o) return;
  const f = document.activeElement; if (f && o.contains(f) && f.blur) f.blur();   // let the phone keyboard go down first
  // the panel glides down: a copy slides out on top while the real overlay is already empty (a new sheet can open at once)
  const bg = o.querySelector('.sheet-bg'); const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } })();
  if (bg && !reduce) { const g = bg.cloneNode(true); g.classList.add('closing'); g.removeAttribute('onclick'); g.setAttribute('aria-hidden', 'true'); g.querySelectorAll('[id]').forEach(x => x.removeAttribute('id')); const sh = bg.querySelector('.sheet'); const gs = g.querySelector('.sheet'); (fxLayer() || o.parentNode).appendChild(g); if (sh && gs) { gs.style.transform = sh.style.transform; gs.scrollTop = sh.scrollTop; } setTimeout(() => g.remove(), 260); }
  o.innerHTML = '';
}
A.closeSheet = closeSheet;

let toastT;
export function toast(msg, kind) {
  const app = document.getElementById('app');
  let el = app.querySelector('.toast'); if (el) el.remove();
  el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = '<span style="color:' + (kind === 'err' ? 'var(--a-red)' : 'var(--a-amber)') + '">' + (kind === 'err' ? I.x : I.check) + '</span>' + esc(msg);
  app.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), kind === 'err' ? 3600 : 2200);
}
export function empty(icon, text) { return '<div class="empty"><div class="ico">' + (I[icon] || I.home) + '</div><div>' + esc(text) + '</div></div>'; }
export function avatar(name, id, cls) { return '<div class="avatar ' + (cls || '') + '" style="background:' + hueOf(id) + '">' + esc(initialsOf(name)) + '</div>'; }
function initialsOf(n) { return String(n || '?').trim().split(' ').map(x => x[0] || '').slice(0, 2).join('').toUpperCase() || '?'; }
function hueOf(id) { const H = ['#E8632B', '#2A9A90', '#8E6FD6', '#D9A520', '#D9456A', '#7E8A2E']; let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return H[h % H.length]; }

// small form helpers — values live in a draft object the screen owns
export function field(label, id, value, opts) {
  opts = opts || {};
  const inp = opts.textarea
    ? '<textarea class="input" id="' + id + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value || '') + '</textarea>'
    : '<input class="input" id="' + id + '" type="' + (opts.type || 'text') + '" inputmode="' + (opts.inputmode || (opts.type === 'number' ? 'decimal' : 'text')) + '" placeholder="' + esc(opts.ph || '') + '" value="' + esc(value == null ? '' : value) + '"' + (opts.attrs || '') + '>';
  // every free-text field gets a small mic (voice note → words); numbers, dates, e-mail and codes do not
  const voice = opts.voice !== false && !opts.unit && (opts.textarea || !opts.type || opts.type === 'text');
  const box = voice ? '<div class="vwrap' + (opts.textarea ? ' ta' : '') + '">' + inp + '<button type="button" class="vmic" id="' + id + '_mic" onclick="A.voice(\'' + id + '\')" aria-label="' + esc(t('Voice note')) + '">' + I.mic + '</button></div>' : inp;
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (opts.unit ? '<div class="unit">' + inp + '<span>' + esc(opts.unit) + '</span></div>' : box) + '</div>';
}
export function chips(options, selected, onPick, multi) {
  // options: {key: label}; selected: string or array; onPick: name of an A.* action receiving the key
  const sel = Array.isArray(selected) ? selected : [selected];
  return '<div class="chips">' + Object.keys(options).map(k => '<button class="chip ' + (sel.includes(k) ? 'on' : '') + '" onclick="A.' + onPick + '(\'' + k + '\')">' + esc(t(options[k])) + '</button>').join('') + '</div>';
}
export function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
export function busy(on) { document.querySelectorAll('.btn').forEach(b => { b.disabled = !!on; }); }
export const THEME = { cur: 'light' };
try { if (localStorage.getItem('tuneup-theme') === 'dark') THEME.cur = 'dark'; } catch (e) {}
export function setTheme(v) {
  THEME.cur = v === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem('tuneup-theme', THEME.cur); } catch (e) {}
  document.documentElement.setAttribute('data-theme', THEME.cur);
}
export function themeToggle(action) {
  return '<div class="segc" style="width:132px"><button class="' + (THEME.cur === 'light' ? 'on' : '') + '" onclick="A.' + action + '(\'light\')">' + esc(t('Light')) + '</button><button class="' + (THEME.cur === 'dark' ? 'on' : '') + '" onclick="A.' + action + '(\'dark\')">' + esc(t('Dark')) + '</button></div>';
}
export function langToggle(action) {
  return '<div class="segc" style="width:110px"><button class="' + (LANG.cur === 'en' ? 'on' : '') + '" onclick="A.' + action + '(\'en\')">EN</button><button class="' + (LANG.cur === 'ka' ? 'on' : '') + '" onclick="A.' + action + '(\'ka\')">ქარ</button></div>';
}
