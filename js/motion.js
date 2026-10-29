// Tune Up beta — motion (29 Oct 2026). Small movements that answer what the person just did: the macro records fill
// with colour, water rises, ticks spring, the streak chip dances once, numbers roll to their new value, the week grid
// paints itself, the next session counts down. Nothing loops on its own. With "reduce motion" on in the phone's
// settings the same code runs but everything lands instantly.
//
// How it works: screens render their final state as usual (full redraw). Elements that should move carry data-*
// marks; after every redraw ui.render() calls playMotion(), which compares each mark with the value it showed last
// time and animates from there. Marks:
//   data-fill="key" data-to="0.73" [data-dim="h"]   a fill (bar width, record clip width, water height)
//   data-num="1720" data-fmt="i|s|d1|L" [data-nk] [data-entry]   a number that rolls to its value
//   data-ev="name" data-v="…"                       a state whose change triggers a one-off effect
//   data-fid="id" (food rows), .heat (week grid), data-cd="ISO" (countdown), data-mid (Tune replies)
import { t } from './i18n.js';

const RM = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const mem = new Map();   // last value shown for each fill / number
const ev = new Map();    // last seen state for each one-off effect
let ptr = null;          // where the last tap landed (for the water ripple)
if (typeof document !== 'undefined') document.addEventListener('pointerdown', e => { ptr = { x: e.clientX, y: e.clientY, el: e.target, at: Date.now() }; }, true);

export function buzz(p) { try { if (!RM() && navigator.vibrate) navigator.vibrate(p || 12); } catch (e) {} }
function tween(dur, fn, done) {
  if (RM() || dur <= 0) { fn(1); if (done) done(); return; }
  const t0 = performance.now();
  (function s(now) { const k = Math.max(0, Math.min(1, (now - t0) / dur)); fn(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(s); else if (done) done(); })(t0);
}
function replay(el, cls, ms, sel) {
  if (!el || RM()) return; el.style.removeProperty('--ad'); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  if (ms) setTimeout(() => { if (el.isConnected) el.classList.remove(cls); }, ms);
  if (sel && ms) carry.push({ sel, cls, t0: Date.now(), ms });
}
// a redraw replaces the whole screen; an effect that is still playing is put back on the new element and carries on
// from where it was (a negative delay), so a save that returns mid-animation does not cut it off
const carry = [];
function recarry(body) {
  const now = Date.now();
  for (let i = carry.length - 1; i >= 0; i--) { const c = carry[i]; const el = now - c.t0;
    if (el >= c.ms) { carry.splice(i, 1); continue; }
    body.querySelectorAll(c.sel).forEach(x => { if (x.classList.contains(c.cls)) return; x.style.setProperty('--ad', -el + 'ms'); x.classList.add(c.cls); setTimeout(() => { if (x.isConnected) x.classList.remove(c.cls); }, c.ms - el); }); }
}
// effects that must outlive a redraw (ripples, sparks, a closing panel) are drawn on a layer over the app
export function fxLayer() {
  const app = document.getElementById('app'); if (!app || !app.parentNode) return null;
  let l = app.parentNode.querySelector(':scope > .fxlayer'); if (!l) { l = document.createElement('div'); l.className = 'fxlayer'; l.setAttribute('aria-hidden', 'true'); app.parentNode.appendChild(l); }
  l.style.left = app.offsetLeft + 'px'; l.style.top = app.offsetTop + 'px'; l.style.width = app.offsetWidth + 'px'; l.style.height = app.offsetHeight + 'px';
  return l;
}
function at(el) { const l = fxLayer(); if (!l) return null; const a = document.getElementById('app').getBoundingClientRect(), r = el.getBoundingClientRect(); return { l, x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height, ax: a.left, ay: a.top }; }

// ---- numbers
export function fmtNum(v, f) {
  v = Number(v) || 0;
  if (f === 's') return Math.round(v).toLocaleString('en-US');
  if (f === 'd1') return v.toFixed(1);
  if (f === 'L') return (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '') || '0';
  return String(Math.round(v));
}
// a number that rolls: <span data-num=…>formatted</span>. entry = also roll up from 0 when the screen opens.
export function rollNum(v, fmt, key, entry) {
  if (v == null || v === '' || isNaN(Number(v))) return String(v == null ? '' : v);
  return '<span data-num="' + Number(v) + '" data-fmt="' + (fmt || 'i') + '"' + (key ? ' data-nk="' + key + '"' : '') + (entry ? ' data-entry="1"' : '') + '>' + fmtNum(v, fmt) + '</span>';
}

// ---- the record stack: one plate per macro, coloured in from the left by how much of the target is eaten
let stackN = 0;
const YS = [36, 60, 84, 108];
function darker(hex) { const n = parseInt(hex.slice(1), 16); const f = c => Math.round(c * .72); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
const HEX = { 'var(--c-kcal)': '#E8632B', 'var(--c-protein)': '#D9456A', 'var(--c-carbs)': '#D9A520', 'var(--c-fat)': '#7E8A2E' };
export function recordStack(rows, label, opts) {
  const id = 'rs' + (++stackN); const o = opts || {};
  const plates = rows.slice(0, 4).map((m, i) => {
    const y = YS[i]; const has = !!m.max; const frac = has ? Math.max(0, m.v / m.max) : 1;
    const over = has && m.key !== 'protein_g' && frac > 1.05; const col = over ? darker(HEX[m.color] || '#16130F') : m.color;
    const w = (4 + 120 * Math.min(1, frac)).toFixed(1);
    return '<g class="plate" data-plate="' + m.key + '"><ellipse cx="64" cy="' + y + '" rx="60" ry="15" fill="#E6DCC8"/>' +
      '<clipPath id="' + id + i + '"><rect x="4" y="' + (y - 18) + '" width="' + w + '" height="36" data-fill="disc:' + m.key + '" data-to="' + (has ? Math.min(1.2, frac).toFixed(3) : 1) + '" data-dim="disc"/></clipPath>' +
      '<ellipse cx="64" cy="' + y + '" rx="60" ry="15" fill="' + col + '" clip-path="url(#' + id + i + ')"/>' +
      '<rect class="glint" x="0" y="' + (y - 12) + '" width="2.5" height="24" rx="1.2" fill="#fff" opacity="0"/>' +
      '<ellipse cx="64" cy="' + y + '" rx="40" ry="10" fill="none" stroke="#16130F" stroke-opacity=".18"/></g>';
  }).reverse().join('');
  return '<svg class="discs' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 150 140" width="128" height="120" role="img" aria-label="' + label + '"><g transform="translate(12 8)">' + plates + '<ellipse cx="64" cy="36" rx="5" ry="1.5" fill="#16130F"/></g></svg>';
}

// ---- the small lilac equaliser (Tune thinking) and the spinning record (loading)
export function thinking(label) { return '<div class="msg them think" role="status"><span class="eqz" aria-hidden="true"><b></b><b></b><b></b><b></b></span><span class="sr">' + label + '</span></div>'; }
export function loader(label, lines) {
  const n = lines == null ? 3 : lines;
  return '<div class="loading" role="status"><span class="vinyl" aria-hidden="true"></span>' + (n ? '<div class="skels" aria-hidden="true">' + [70, 92, 54].slice(0, n).map(w => '<i style="width:' + w + '%"></i>').join('') + '</div>' : '') + '<span class="sr">' + label + '</span></div>';
}

// ---- optimistic feedback, called by the tap handlers before the save goes out
export function tickNow(id, on) {
  ev.set('tick:' + id, on ? '1' : '0');
  document.querySelectorAll('.trow[data-id="' + id + '"]').forEach(r => {
    r.classList.toggle('done', on); const c = r.querySelector('.check'); if (c) { c.classList.toggle('on', on); c.innerHTML = on ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : ''; }
    if (on) replay(r, 'burst', 700, '.trow[data-id="' + id + '"]');
  });
  if (on) buzz();
}
export function moodNow(k) {
  ev.set('mood', String(k));
  const grid = document.querySelector('#body .moodgrid'); if (!grid) return;
  grid.querySelectorAll('.md').forEach((b, i) => { b.classList.toggle('on', i + 1 === k); b.classList.remove('burst'); });
  const on = grid.querySelectorAll('.md')[k - 1]; if (on) { replay(on, 'burst', 700, '#body .moodgrid .md:nth-child(' + k + ')'); tintMood(grid.closest('.card'), on); }
  buzz();
}
function tintMood(card, on) { if (!card || !on) return; const i = on.querySelector('i'); if (i) card.style.background = 'color-mix(in srgb, ' + i.style.background + ' 10%, var(--a-card))'; }
export function rippleNow(sel) {
  if (!ptr || Date.now() - ptr.at > 1500 || RM()) return;
  const tile = ptr.el && ptr.el.closest && ptr.el.closest(sel); if (!tile) return;
  ripple(tile, ptr.x, ptr.y); buzz();
}
function ripple(tile, x, y) {
  const p = at(tile); if (!p) return; const w = document.createElement('div'); w.className = 'fxclip';
  Object.assign(w.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', borderRadius: getComputedStyle(tile).borderRadius });
  const s = document.createElement('i'); s.className = 'ripple'; s.style.left = (x - p.ax - p.x) + 'px'; s.style.top = (y - p.ay - p.y) + 'px';
  w.appendChild(s); p.l.appendChild(w); setTimeout(() => w.remove(), 750);
}

// ---- the celebration: plates drop in, sparks in the four macro colours, a short line
function celebrate(card, toastFn) {
  const svg = card && card.querySelector('.discs'); if (!svg) return;
  try { const k = 'tu-tuned-' + (card.getAttribute('data-day') || ''); if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) {}
  if (toastFn) toastFn(t('Day tuned up!'));
  buzz([12, 60, 12]);
  if (RM()) return;
  // the records may be scrolled out of sight (the meal was added from further down): bring them into view first
  const body = document.getElementById('body'); let wait = 0;
  if (body) { const b = body.getBoundingClientRect(), r = svg.getBoundingClientRect(); if (r.top < b.top + 10 || r.bottom > b.bottom - 10) { body.scrollTo({ top: Math.max(0, body.scrollTop + r.top - b.top - 90), behavior: 'smooth' }); wait = 450; } }
  setTimeout(() => party(svg), wait);
}
function party(svg0) {
  const svg = document.querySelector('#body .card.hero .discs') || svg0; if (!svg) return;
  replay(svg, 'drop', 900, '.card.hero .discs');
  const cols = ['#E8632B', '#D9456A', '#D9A520', '#7E8A2E'];
  setTimeout(() => { const now = document.querySelector('#body .card.hero .discs') || svg; if (!now.isConnected) return; const p = at(now); if (!p) return; const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (let n = 0; n < 18; n++) { const s = document.createElement('i'); s.className = 'spark'; const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 60;
    s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.background = cols[n % 4]; s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px'); s.style.setProperty('--dy', (Math.sin(a) * d - 10).toFixed(0) + 'px');
    p.l.appendChild(s); setTimeout(() => s.remove(), 1000); } }, 380);
}

// ---- Tune's reply appears word by word
function wordIn(el) {
  if (RM()) return; let i = 0;
  const walk = (n) => { [...n.childNodes].forEach(c => {
    if (c.nodeType === 3 && c.textContent.trim()) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach(w => { if (!w) return; if (/^\s+$/.test(w)) { f.appendChild(document.createTextNode(w)); return; } const s = document.createElement('span'); s.className = 'wi'; s.style.animationDelay = Math.min(1600, (i++) * 22) + 'ms'; s.textContent = w; f.appendChild(s); }); c.replaceWith(f); }
    else if (c.nodeType === 1 && !/^(BUTTON|IMG|VIDEO|SVG)$/.test(c.tagName)) walk(c); }); };
  walk(el);
}

// ---- the next session countdown
let cdTimer = null;
function countdowns(root) {
  const els = [...root.querySelectorAll('[data-cd]')]; if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } if (!els.length) return;
  const upd = () => {
    let alive = 0;
    els.forEach(el => { if (!el.isConnected) return; alive++;
      const mins = Math.round((new Date(el.getAttribute('data-cd')).getTime() - Date.now()) / 60000);
      const h = Math.floor(mins / 60), m = mins % 60;
      el.textContent = mins <= 0 ? t('starting now') : h ? t('in {h} h {m} min', { h, m }) : t('in {m} min', { m });
      const ring = el.closest('.cdrow') && el.closest('.cdrow').querySelector('[data-cdring]');
      if (ring) { const frac = Math.max(0, Math.min(1, 1 - mins / (24 * 60))); ring.setAttribute('stroke-dasharray', (144.5 * frac).toFixed(1) + ' 144.5'); }
    });
    if (!alive && cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  };
  upd(); cdTimer = setInterval(upd, 30000);
}

// ---- after every redraw
export function playMotion(screen, entered, toastFn) {
  const root = document.getElementById('app'); if (!root) return;
  const body = root.querySelector('.screen') || root;
  recarry(body);

  // fills
  let bi = 0;
  body.querySelectorAll('[data-fill], .bar i').forEach(el => {
    let key = el.getAttribute('data-fill'), to;
    if (key) to = Number(el.getAttribute('data-to')) || 0;
    else { key = screen + ':bar:' + (bi++); to = (parseFloat(el.style.width) || 0) / 100; }
    const dim = el.getAttribute('data-dim') || 'w';
    const mk = 'f:' + key; const from = entered ? 0 : (mem.has(mk) ? mem.get(mk) : 0); mem.set(mk, to);
    if (Math.abs(from - to) < 0.001) return;
    const plate = dim === 'disc' ? el.closest('svg').querySelector('.plate[data-plate="' + key.slice(5) + '"]') : null;
    const glint = plate && plate.querySelector('.glint');
    const set = (f) => {
      if (dim === 'disc') { const w = 4 + 120 * Math.min(1, f); el.setAttribute('width', w.toFixed(1)); if (glint) { glint.setAttribute('x', Math.min(122, w - 2).toFixed(1)); } }
      else if (dim === 'h') el.style.height = (Math.min(1, f) * 100).toFixed(1) + '%';
      else el.style.width = (Math.min(1, f) * 100).toFixed(1) + '%';
    };
    set(from);
    if (glint && !RM()) glint.setAttribute('opacity', '.85');
    if (dim === 'h') { const tile = el.closest('.dtile'); if (tile && !RM()) { tile.classList.add('flow'); clearTimeout(tile._flow); tile._flow = setTimeout(() => tile.classList.remove('flow'), 2600); } }
    tween(dim === 'disc' ? 950 : 800, k => set(from + (to - from) * k), () => {
      if (glint) glint.setAttribute('opacity', '0');
      if (plate && from < 1 && to >= 1 && !entered) { replay(plate, 'pop', 600, '.plate[data-plate="' + plate.getAttribute('data-plate') + '"]'); buzz(); }
    });
  });

  // numbers
  let ni = 0;
  body.querySelectorAll('[data-num]').forEach(el => {
    const key = 'n:' + (el.getAttribute('data-nk') || screen + ':num:' + (ni++)); const to = Number(el.getAttribute('data-num')); const f = el.getAttribute('data-fmt');
    const from = entered && el.hasAttribute('data-entry') ? 0 : (mem.has(key) ? mem.get(key) : (el.hasAttribute('data-entry') ? 0 : to)); mem.set(key, to);
    if (from === to) return;
    tween(700, k => { el.textContent = fmtNum(from + (to - from) * k, f); });
  });

  // one-off effects on a change of state (never on the first sight of a value)
  body.querySelectorAll('[data-ev]').forEach(el => {
    const name = el.getAttribute('data-ev'), v = el.getAttribute('data-v'); const had = ev.has(name); const prev = ev.get(name); ev.set(name, v);
    if (!had || prev === v) return;
    if (name === 'tuned' && v === '1') celebrate(el, toastFn);
    else if (name === 'streak' && Number(v) > Number(prev)) replay(el, 'dance', 1700, '.streak');
    else if (name === 'wdone' && v === '1') { replay(el.querySelector('.donebar'), 'in', 600, '.donebar'); replay(body.querySelector('.wd.today i'), 'pulse', 2200, '.wd.today i'); buzz([12, 50, 12]); }
    else if (name === 'mood' && v !== '0') { const on = el.querySelector('.md.on'); replay(on, 'burst', 700, '[data-ev="mood"] .md.on'); buzz(); }
    else if (name === 'steps' && v === '1') replay(el, 'goal', 1100, '[data-ev="steps"]');
  });
  // a mood card carries a faint tint of the chosen mood
  body.querySelectorAll('[data-ev="mood"]').forEach(c => { const on = c.querySelector('.md.on'); if (on) tintMood(c, on); });
  // ticks: rows that just became done (tick-all, or a tick from Tune) spring in one after another
  let tn = 0;
  body.querySelectorAll('.trow[data-id]').forEach(r => {
    const k = 'tick:' + r.getAttribute('data-id'), v = r.classList.contains('done') ? '1' : '0'; const had = ev.has(k), prev = ev.get(k); ev.set(k, v);
    if (had && prev === '0' && v === '1') { const sel = '.trow[data-id="' + r.getAttribute('data-id') + '"]'; setTimeout(() => replay(document.querySelector('#body ' + sel) || r, 'burst', 700, sel), (tn++) * 90); }
  });
  // food that was just logged drops into the list
  body.querySelectorAll('[data-fids]').forEach(list => {
    const k = 'foods:' + screen; const ids = [...list.querySelectorAll('[data-fid]')].map(x => x.getAttribute('data-fid')); const prev = ev.get(k); ev.set(k, ids);
    if (!prev) return; ids.filter(id => !prev.includes(id)).forEach(id => replay(list.querySelector('[data-fid="' + id + '"]'), 'land', 1700, '[data-fid="' + id + '"]'));
  });
  // the week grid paints itself, column by column
  body.querySelectorAll('.heat').forEach((h, hi) => {
    const cells = [...h.querySelectorAll('.c')]; const cols = h.querySelectorAll('.d').length || 7;
    const sig = cells.map(c => c.className).join(); const k = 'heat:' + screen + ':' + hi; const prev = ev.get(k); ev.set(k, sig);
    if (!entered && prev === sig) return;
    cells.forEach((c, i) => c.style.setProperty('--i', (i % cols) * 60 + Math.floor(i / cols) * 30));
    replay(h, 'sweep');
  });
  // Tune: a new reply comes in word by word
  // (only a reply that replaces the thinking bubble — not the history loading in)
  if (screen === 'tune') {
    const replies = body.querySelectorAll('.msg[data-mid]'); const last = replies[replies.length - 1]; const id = last ? last.getAttribute('data-mid') : '';
    const wasThinking = ev.get('tunethink'); const prev = ev.get('tune'); ev.set('tune', id); ev.set('tunethink', !!body.querySelector('.msg.think'));
    if (last && wasThinking && prev !== id && !entered) wordIn(last);
  }
  countdowns(body);
}
