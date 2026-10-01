// Tune Up beta — screens, router, overlays. Screens are functions returning {title, sub, body, footer, header, tabs, center, actions, after}.
import { t, esc, LANG } from './i18n.js';
import { S } from './state.js';

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
  video: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  dot: '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>'
};

export const SCREENS = {};
export const NAV = { stack: [], tab: null, tabs: [] };
export const A = {};                      // actions reachable from inline onclick="A.name()"
window.A = A;

export function go(name, params, opts) { NAV.stack.push({ name, params: params || {} }); render((opts && opts.anim) || 'enter'); }
export function back() { if (NAV.stack.length > 1) { NAV.stack.pop(); render('enter-back'); } }
export function replace(name, params) { NAV.stack[NAV.stack.length - 1] = { name, params: params || {} }; render('fade'); }
export function root(name, params) { NAV.tab = name; NAV.stack = [{ name, params: params || {} }]; render('fade'); }
export function setTabs(tabs) { NAV.tabs = tabs || []; }
export function cur() { return NAV.stack[NAV.stack.length - 1]; }
export function rerender() { render(null); }
A.go = go; A.back = back; A.setTab = root;

function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

export function render(anim) {
  const app = document.getElementById('app');
  app.setAttribute('lang', LANG.cur);
  const c = cur(); if (!c) return;
  const scr = SCREENS[c.name];
  if (!scr) { app.innerHTML = '<div class="body center">Missing screen ' + esc(c.name) + '</div>'; return; }
  const v = scr(c.params) || {};
  let hdr = '';
  if (v.header !== false) {
    hdr = '<div class="hdr">' + (v.back !== false && NAV.stack.length > 1 ? '<button class="back" onclick="A.back()" aria-label="Back">' + I.back + '</button>' : '') +
      '<div class="grow"><div class="title">' + esc(v.title || '') + '</div>' + (v.sub ? '<div class="sub">' + esc(v.sub) + '</div>' : '') + '</div>' + (v.actions || '') + (v.bell !== false && NAV.tabs.length && NAV.stack.length === 1 ? bell() : '') + '</div>';
  }
  const tabs = v.tabs !== false && NAV.tabs.length ? '<div class="tabbar">' + NAV.tabs.map(tb =>
    '<button class="' + (NAV.tab === tb.id ? 'on' : '') + '" onclick="A.setTab(\'' + tb.id + '\')"><span class="ico">' + I[tb.ico] + '</span>' + esc(t(tb.label)) +
    (tb.badge && tb.badge() ? '<span class="badge">' + tb.badge() + '</span>' : '') + '</button>').join('') + '</div>' : '';
  app.innerHTML = '<div class="status"><span>' + nowHM() + '</span><span class="sig">' + I.dot + I.dot + I.dot + '</span></div>' +
    '<div class="screen-wrap"><div class="screen ' + (anim || '') + '">' + hdr + '<div class="body ' + (v.center ? 'center' : '') + '" id="body">' + (v.body || '') + '</div>' + (v.footer || '') + '</div></div>' +
    tabs + '<div id="overlay"></div>';
  if (v.after) v.after();
}

export function bell() { return '<button class="act" onclick="A.go(\'notifs\')" aria-label="Notifications">' + I.bell + (S.unread ? '<span class="dot"></span>' : '') + '</button>'; }
export function sheet(html) { const o = document.getElementById('overlay'); if (o) o.innerHTML = '<div class="sheet-bg" onclick="if(event.target===this)A.closeSheet()"><div class="sheet">' + html + '</div></div>'; }
export function closeSheet() { const o = document.getElementById('overlay'); if (o) o.innerHTML = ''; }
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
function hueOf(id) { const H = ['#9C3B08', '#4A6B8A', '#4F7A4A', '#C2960E', '#7A2E06', '#6F6B64']; let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return H[h % H.length]; }

// small form helpers — values live in a draft object the screen owns
export function field(label, id, value, opts) {
  opts = opts || {};
  const inp = opts.textarea
    ? '<textarea class="input" id="' + id + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value || '') + '</textarea>'
    : '<input class="input" id="' + id + '" type="' + (opts.type || 'text') + '" inputmode="' + (opts.inputmode || (opts.type === 'number' ? 'decimal' : 'text')) + '" placeholder="' + esc(opts.ph || '') + '" value="' + esc(value == null ? '' : value) + '"' + (opts.attrs || '') + '>';
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + (opts.unit ? '<div class="unit">' + inp + '<span>' + esc(opts.unit) + '</span></div>' : inp) + '</div>';
}
export function chips(options, selected, onPick, multi) {
  // options: {key: label}; selected: string or array; onPick: name of an A.* action receiving the key
  const sel = Array.isArray(selected) ? selected : [selected];
  return '<div class="chips">' + Object.keys(options).map(k => '<button class="chip ' + (sel.includes(k) ? 'on' : '') + '" onclick="A.' + onPick + '(\'' + k + '\')">' + esc(t(options[k])) + '</button>').join('') + '</div>';
}
export function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
export function busy(on) { document.querySelectorAll('.btn').forEach(b => { b.disabled = !!on; }); }
export function langToggle(action) {
  return '<div class="segc" style="width:110px;background:var(--a-card);border:1px solid var(--a-line)"><button class="' + (LANG.cur === 'en' ? 'on' : '') + '" onclick="A.' + action + '(\'en\')">EN</button><button class="' + (LANG.cur === 'ka' ? 'on' : '') + '" onclick="A.' + action + '(\'ka\')">ქარ</button></div>';
}
