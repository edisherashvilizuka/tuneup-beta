// Tune Up beta — coach side: adding exercises to a plan day by muscle group (29 Oct 2026).
// Add to Monday → a grid of muscle groups (body figure lit in coral) + gym favourites + search → a group page with its
// parts (the figure follows the chosen part) and equipment → tap several exercises → "Review & add": sets × reps already
// filled in for each kind of exercise, load optional → all added in one go. The coach's own exercises carry a group too.
import { t, esc, dayName, exName } from './i18n.js';
import { SCREENS, A, I, NAV, render, cur, rerender, toast, sheet, closeSheet, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { GROUP_KEYS, SUBS, groupName, subName, EQUIP_KEYS, equipName, EQ_ICON, defaultsFor, inGroup, exLine, howUrl, searchEx, byOrder,
  groupFigure, hotFor, viewsOf, groupsLine } from './exlib.js';

const nEx = n => n === 1 ? t('1 exercise') : t('{n} exercises', { n });
const itemsFor = day => (S.plan ? S.plan.items : []).filter(i => i.day === day);
const lib = () => S.exercises || [];
const mine = () => lib().filter(x => x.owner_id && S.me && x.owner_id === S.me.id);
const byId = id => lib().find(x => x.id === id);
const SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

// the picking state belongs to one day of one client's plan; opening another day starts fresh
function P(day) {
  const key = (S.plan ? S.plan.pairId : '') + ':' + day;
  if (!S.pick || S.pick.key !== key) S.pick = { key, day, sel: [], rx: {}, q: '', sub: {}, eq: {} };
  return S.pick;
}
function dayIds(day) { return new Set(itemsFor(day).map(i => i.exercise && i.exercise.id).filter(Boolean)); }

// ---- one exercise row: equipment, name, part · equipment, badges, How-to, the pick toggle
function exRow(x, day) {
  const p = P(day), on = p.sel.includes(x.id), inDay = dayIds(day).has(x.id), how = howUrl(x);
  const badges = (x.pop ? '<span class="xbadge pop">' + t('Gym favourite') + '</span>' : '') + (inDay ? '<span class="xbadge in">' + I.check + ' ' + esc(t('On {day}', { day: dayName(day) })) + '</span>' : '');
  return '<div class="xrow' + (on ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + on + '" onclick="A.pickToggle(\'' + x.id + '\')" onkeydown="if(event.key===\'Enter\')this.click()">' +
    '<span class="xeq">' + (EQ_ICON[x.equip] || EQ_ICON.other) + '</span>' +
    '<div class="grow" style="min-width:0"><div class="t">' + esc(exName(x)) + '</div><div class="s">' + esc(exLine(x) || t('My exercise')) + '</div>' + (badges ? '<div class="xbadges">' + badges + '</div>' : '') + '</div>' +
    (how ? '<a class="vdot" href="' + esc(how) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="' + esc(t('How to do it')) + '">' + I.play + '</a>' : '') +
    '<span class="xsel" aria-hidden="true">' + (on ? I.check : I.plus) + '</span></div>';
}
function tray(day) {
  const p = P(day); if (!p.sel.length) return '';
  const exs = p.sel.map(byId).filter(Boolean);
  return '<div class="tray xtray" role="button" tabindex="0" onclick="A.pickReview()"><div class="grow" style="min-width:0"><div class="small" style="color:#C9C5BC">' +
    esc(p.sel.length === 1 ? t('1 picked for {day}', { day: dayName(day) }) : t('{n} picked for {day}', { n: p.sel.length, day: dayName(day) })) + '</div>' +
    '<div class="xtray-g">' + esc(groupsLine(exs) || t('My exercises')) + '</div></div><span class="btn sm" style="width:auto">' + t('Review & add') + '</span></div>';
}

// ---- Add to <day>: search + muscle groups + gym favourites
SCREENS.pickExercise = ({ day }) => {
  const p = P(day), n = itemsFor(day).length;
  return { title: t('Add to {day}', { day: dayName(day) }), sub: n ? t('{n} already on this day', { n }) : t('Pick a muscle group or search'),
    body: '<label class="xsearch">' + SEARCH + '<input class="input" id="exq" type="search" enterkeyhint="search" autocomplete="off" placeholder="' + esc(t('Search 200+ exercises')) + '" value="' + esc(p.q) + '" oninput="A.exSearch(this.value)"></label>' +
      '<div id="exlist">' + (p.q ? results(day) : home(day)) + '</div>',
    footer: tray(day) };
};
function home(day) {
  const have = itemsFor(day).map(i => i.exercise).filter(Boolean);
  const tiles = GROUP_KEYS.map(g => {
    const cnt = lib().filter(x => !x.owner_id && inGroup(x, g)).length; if (!cnt) return '';
    const onDay = have.filter(x => x.grp === g).length, picked = P(day).sel.map(byId).filter(x => x && x.grp === g).length;
    return '<button class="mtile" data-g="' + g + '" onclick="A.pickGroup(' + day + ',\'' + g + '\')"><span class="mt-fig">' + groupFigure(g, '', 'sm') + '</span>' +
      '<span class="mt-name">' + esc(groupName(g)) + '</span><span class="mt-n">' + esc(nEx(cnt)) + '</span>' +
      (picked ? '<span class="mt-pick">' + picked + '</span>' : onDay ? '<span class="mt-on" title="' + esc(t('On {day}', { day: dayName(day) })) + '">' + I.check + onDay + '</span>' : '') + '</button>';
  }).join('');
  const m = mine();
  const own = '<button class="mtile own" onclick="A.pickGroup(' + day + ',\'mine\')"><span class="mt-fig own">' + (m.length ? EQ_ICON.body : I.plus) + '</span><span class="mt-name">' + esc(t('My exercises')) + '</span><span class="mt-n">' + esc(m.length ? nEx(m.length) : t('Add your own with a video')) + '</span></button>';
  const fav = lib().filter(x => !x.owner_id && x.pop).sort(byOrder).slice(0, 12);
  return '<div class="mgrid">' + tiles + own + '</div>' +
    (fav.length ? '<div class="section-title"><span class="eyebrow">' + t('Gym favourites') + '</span><span class="mute small">' + t('most logged in gyms') + '</span></div><div class="xlist">' + fav.map(x => exRow(x, day)).join('') + '</div>' : '') +
    '<button class="btn sec sm" style="margin-top:12px" onclick="A.newExercise(' + day + ')">' + I.plus + ' ' + t('New exercise with my video link') + '</button>';
}
function results(day) {
  const r = searchEx(lib(), P(day).q).slice(0, 60);
  if (!r.length) return '<div class="card flat"><div class="mute">' + t('Nothing found') + '</div><button class="btn sec sm" style="margin-top:10px" onclick="A.newExercise(' + day + ')">' + I.plus + ' ' + esc(t('Make “{q}” one of my exercises', { q: P(day).q })) + '</button></div>';
  return '<div class="mute small" style="margin:2px 2px 8px">' + esc(r.length === 1 ? t('1 exercise') : t('{n} exercises', { n: r.length })) + '</div><div class="xlist">' + r.map(x => exRow(x, day)).join('') + '</div>';
}
// typing only redraws the list under the box — the box keeps focus and the phone keyboard stays up
A.exSearch = (v) => { const c = cur(); if (!c || c.name !== 'pickExercise') return; const p = P(c.params.day); p.q = v; const el = document.getElementById('exlist'); if (el) el.innerHTML = p.q.trim() ? results(c.params.day) : home(c.params.day); else rerender(); };

// ---- one muscle group: figure + parts + equipment + the list
A.pickGroup = (day, g) => A.go('pickGroup', { day, g });
function groupList(day, g) { return g === 'mine' ? mine() : lib().filter(x => !x.owner_id && inGroup(x, g)).concat(mine().filter(x => inGroup(x, g))); }
SCREENS.pickGroup = ({ day, g }) => {
  const p = P(day), all = groupList(day, g), sel = p.sub[g] || '';
  const subs = g === 'mine' ? [] : (SUBS[g] || []).filter(s => all.some(x => inGroup(x, g, s)));
  const hero = g === 'mine' ? '' : '<div class="mhero"><div class="mh-figs" id="mh_figs">' + groupFigure(g, sel, 'big') + '</div>' +
    '<div class="mh-side"><div class="eyebrow">' + esc(t('Trains')) + '</div><div class="mh-part" id="mh_part">' + esc(sel ? subName(g, sel, true) : subs.map(s => subName(g, s)).join(' · ')) + '</div>' +
    '<div class="mute small">' + esc(nEx(all.length)) + '</div></div></div>';
  const subChips = subs.length > 1 ? '<div class="chips hs" id="mh_subs">' + subChipsHtml(g, subs, sel, all) + '</div>' : '';
  return { title: g === 'mine' ? t('My exercises') : groupName(g), sub: t('Tap to pick · {day}', { day: dayName(day) }),
    body: hero + subChips + '<div class="chips hs eqchips" id="mh_eq">' + eqChipsHtml(day, g) + '</div><div id="xlist">' + groupRows(day, g) + '</div>' +
      (g === 'mine' ? '<button class="btn sec sm" style="margin-top:12px" onclick="A.newExercise(' + day + ')">' + I.plus + ' ' + t('New exercise with my video link') + '</button>' : ''),
    footer: tray(day) };
};
function subChipsHtml(g, subs, sel, all) {
  return '<button class="chip ' + (!sel ? 'on' : '') + '" onclick="A.pickSub(\'\')">' + t('All') + ' <b>' + all.length + '</b></button>' +
    subs.map(s => '<button class="chip ' + (sel === s ? 'on' : '') + '" onclick="A.pickSub(\'' + s + '\')">' + esc(subName(g, s)) + ' <b>' + all.filter(x => inGroup(x, g, s)).length + '</b></button>').join('');
}
function filtered(day, g) {
  const p = P(day), sel = p.sub[g] || '', eq = p.eq[g] || '';
  return groupList(day, g).filter(x => (!sel || inGroup(x, g, sel)) && (!eq || x.equip === eq));
}
function eqChipsHtml(day, g) {
  const p = P(day), sel = p.sub[g] || '', eq = p.eq[g] || '';
  const base = groupList(day, g).filter(x => !sel || inGroup(x, g, sel));
  const have = EQUIP_KEYS.filter(e => base.some(x => x.equip === e));
  if (have.length < 2) return '';
  return '<button class="chip sm ' + (!eq ? 'on' : '') + '" onclick="A.pickEq(\'\')">' + t('Any equipment') + '</button>' +
    have.map(e => '<button class="chip sm ' + (eq === e ? 'on' : '') + '" onclick="A.pickEq(\'' + e + '\')">' + EQ_ICON[e] + esc(equipName(e)) + '</button>').join('');
}
function groupRows(day, g) {
  const p = P(day), sel = p.sub[g] || '', eq = p.eq[g] || '', list = filtered(day, g);
  if (!list.length) return '<div class="card flat mute">' + (g === 'mine' ? t('None yet.') : t('Nothing matches these filters.')) + '</div>';
  if (g === 'mine' || sel) return '<div class="xlist">' + list.sort(byOrder).map(x => exRow(x, day)).join('') + '</div>';
  // "All": one block per part, so the coach scans upper → middle → lower (an exercise can sit in two parts)
  return (SUBS[g] || []).map(s => { const L = list.filter(x => inGroup(x, g, s)).sort(byOrder); return L.length ? '<div class="section-title"><span class="eyebrow">' + esc(subName(g, s, true)) + '</span><span class="mute small">' + L.length + '</span></div><div class="xlist">' + L.map(x => exRow(x, day)).join('') + '</div>' : ''; }).join('') + (eq ? '' : '');
}
// choosing a part or equipment redraws only the chips and the list; the figure's muscles change colour in place (smoothly)
function refreshGroup() {
  const c = cur(); if (!c || c.name !== 'pickGroup') return rerender();
  const { day, g } = c.params, p = P(day), sel = p.sub[g] || '', all = groupList(day, g);
  const subs = (SUBS[g] || []).filter(s => all.some(x => inGroup(x, g, s)));
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('mh_subs', subChipsHtml(g, subs, sel, all)); set('mh_eq', eqChipsHtml(day, g)); set('xlist', groupRows(day, g));
  set('mh_part', esc(sel ? subName(g, sel, true) : subs.map(s => subName(g, s)).join(' · ')));
  const figs = document.getElementById('mh_figs');
  if (figs && SUBS[g] && viewsOf(g)) {
    const keys = SUBS[g].map(s => g + '.' + s), H = sel ? hotFor([g + '.' + sel], keys) : hotFor(keys);
    [...figs.querySelectorAll('svg.fig')].forEach((svg, i) => { const v = viewsOf(g)[i]; svg.querySelectorAll('path[data-k]').forEach(el => { el.setAttribute('class', 'mz l' + ((H[v] || {})[el.getAttribute('data-k')] || 0)); }); });
  }
}
A.pickSub = (s) => { const c = cur(); if (!c || c.name !== 'pickGroup') return; const p = P(c.params.day); p.sub[c.params.g] = s; p.eq[c.params.g] = p.eq[c.params.g] && filtered(c.params.day, c.params.g).length ? p.eq[c.params.g] : ''; refreshGroup(); };
A.pickEq = (e) => { const c = cur(); if (!c || c.name !== 'pickGroup') return; P(c.params.day).eq[c.params.g] = e; refreshGroup(); };

// ---- picking, then one review sheet for all of them
A.pickToggle = (id) => {
  const c = cur(); if (!c || !c.params.day) return; const p = P(c.params.day);
  p.sel = p.sel.includes(id) ? p.sel.filter(x => x !== id) : p.sel.concat([id]);
  if (p.sel.includes(id) && !p.rx[id]) { const d = defaultsFor(byId(id)); p.rx[id] = { sets: d.sets, reps: d.reps, load: '' }; }
  rerender();
};
const TIMED = new Set(['h', 't', 'x', 's', 'f', 'w']);
A.pickReview = () => {
  const c = cur(); if (!c || !c.params.day) return; const day = c.params.day, p = P(day);
  if (!p.sel.length) { closeSheet(); return; }
  const rows = p.sel.map(id => {
    const x = byId(id); if (!x) return ''; const r = p.rx[id] || (p.rx[id] = Object.assign({ load: '' }, defaultsFor(x)));
    return '<div class="rvrow"><div class="row" style="gap:10px"><span class="xeq">' + (EQ_ICON[x.equip] || EQ_ICON.other) + '</span><div class="grow" style="min-width:0"><div class="t">' + esc(exName(x)) + '</div><div class="s">' + esc(exLine(x)) + '</div></div>' +
      '<button class="act rx" onclick="A.pickDrop(\'' + id + '\')" aria-label="' + esc(t('Remove')) + '">' + I.x + '</button></div>' +
      '<div class="rvx"><input class="input" id="rv_s_' + id + '" type="number" inputmode="numeric" min="1" max="20" value="' + esc(r.sets) + '" aria-label="' + esc(t('Sets')) + '" oninput="A.pickRx(\'' + id + '\',\'sets\',this.value)"><span>×</span>' +
      '<input class="input" id="rv_r_' + id + '" value="' + esc(r.reps) + '" aria-label="' + esc(t('Reps')) + '" oninput="A.pickRx(\'' + id + '\',\'reps\',this.value)">' +
      '<input class="input" id="rv_l_' + id + '" value="' + esc(r.load) + '" placeholder="' + esc(TIMED.has(x.kind) ? t('optional') : t('e.g. 20 kg')) + '" aria-label="' + esc(t('Load')) + '" oninput="A.pickRx(\'' + id + '\',\'load\',this.value)"></div></div>';
  }).join('');
  sheet('<div class="h2">' + esc(t('Add to {day}', { day: dayName(day) })) + '</div><div class="mute small">' + t('Sets × reps are filled in for each kind of exercise. Change any number, or set them all at once:') + '</div>' +
    '<div class="chips" style="margin:2px 0 6px">' + ['4 × 8', '3 × 10', '3 × 12', '3 × 15', '5 × 5'].map(k => '<button class="chip sm" onclick="A.pickPreset(\'' + k + '\')">' + k + '</button>').join('') + '</div>' +
    '<div class="rvlist">' + rows + '</div>' +
    '<button class="btn" onclick="A.pickAdd()">' + esc(p.sel.length === 1 ? t('Add 1 exercise to {day}', { day: dayName(day) }) : t('Add {n} exercises to {day}', { n: p.sel.length, day: dayName(day) })) + '</button>');
};
A.pickRx = (id, k, v) => { const c = cur(); if (!c) return; const p = P(c.params.day); p.rx[id] = p.rx[id] || {}; p.rx[id][k] = v; };
A.pickPreset = (k) => {
  const c = cur(); if (!c) return; const p = P(c.params.day); const [s, r] = k.split('×').map(x => x.trim());
  p.sel.forEach(id => { const x = byId(id); if (x && !TIMED.has(x.kind)) { p.rx[id] = Object.assign(p.rx[id] || {}, { sets: s, reps: r }); } });
  A.pickReview();
};
A.pickDrop = (id) => { const c = cur(); if (!c) return; const p = P(c.params.day); p.sel = p.sel.filter(x => x !== id); rerender(); if (p.sel.length) A.pickReview(); else closeSheet(); };
A.pickAdd = async () => {
  const c = cur(); if (!c || !S.plan) return; const day = c.params.day, p = P(day); const ids = p.sel.slice(); if (!ids.length) return;
  busy(true); let ok = 0;
  try {
    for (const id of ids) {
      const r = p.rx[id] || {}; const sets = Math.max(1, Math.min(20, parseInt(r.sets, 10) || 3));
      const it = await db.addPlanItem({ pair_id: S.plan.pairId, day, exercise_id: id, position: itemsFor(day).length, sets, reps: String(r.reps || '').trim() || '10', load: String(r.load || '').trim(), note: '' });
      S.plan.items.push(it); if (S.mon) S.mon.items.push({ id: it.id, pair_id: it.pair_id, day: it.day, created_at: it.created_at }); ok++;
      p.sel = p.sel.filter(x => x !== id);
    }
    closeSheet(); toast(ok === 1 ? t('Added') : t('{n} exercises added', { n: ok }));
    while (NAV.stack.length > 1 && cur().name !== 'planDay') NAV.stack.pop();
    render('enter-back');
  } catch (e) { busy(false); rerender(); toast(ok ? t('Only {n} of {m} exercises were added.', { n: ok, m: ids.length }) : t('Could not add — try again'), 'err'); }
};

// ---- one exercise straight away (Tune's single-item path and older links still use it)
export function itemFields(i) {
  return '<div class="input-row">' + field(t('Sets'), 'f_sets', i.sets, { type: 'number', ph: '3' }) + field(t('Reps'), 'f_reps', i.reps, { ph: '10 / 8-12 / 30 s' }) + '</div>' +
    field(t('Load'), 'f_load', i.load, { ph: t('e.g. 20 kg, bodyweight') }) + field(t('Note for the client'), 'f_note', i.note, { ph: t('e.g. slow on the way down') });
}
export function readItemFields() { return { sets: Math.max(1, Math.min(20, parseInt(val('f_sets') || '3', 10) || 3)), reps: val('f_reps') || '10', load: val('f_load'), note: val('f_note') }; }
A.addItemFor = (day, exId) => {
  const x = byId(exId); if (!x) return; const d = defaultsFor(x);
  sheet('<div class="h2">' + esc(exName(x)) + '</div><div class="mute">' + esc(exLine(x)) + '</div>' + itemFields({ sets: d.sets, reps: d.reps, load: '', note: '' }) +
    '<button class="btn" onclick="A.confirmAdd(' + day + ',\'' + exId + '\')">' + t('Add to plan') + '</button>');
};
A.confirmAdd = async (day, exId) => {
  const f = readItemFields(); busy(true);
  try {
    const it = await db.addPlanItem({ pair_id: S.plan.pairId, day, exercise_id: exId, position: itemsFor(day).length, ...f });
    S.plan.items.push(it); if (S.mon) S.mon.items.push({ id: it.id, pair_id: it.pair_id, day: it.day, created_at: it.created_at }); closeSheet(); toast(t('Added'));
    while (NAV.stack.length > 1 && cur().name !== 'planDay') NAV.stack.pop(); render('enter-back');
  } catch (e) { busy(false); toast(t('Could not add — try again'), 'err'); }
};

// ---- the coach's own exercises: name, muscle group + part, equipment, video link
function nxDraft() { S.draft.nx = S.draft.nx || { grp: '', sub: '', equip: '' }; return S.draft.nx; }
function nxSnap() { const d = nxDraft(); ['name', 'video', 'note'].forEach(k => { const el = document.getElementById('x_' + k); if (el) d[k] = el.value; }); return d; }
function exSheet(day, id) {
  const d = nxDraft(), x = id ? byId(id) : null;
  const gch = '<div class="chips">' + GROUP_KEYS.map(g => '<button type="button" class="chip sm ' + (d.grp === g ? 'on' : '') + '" onclick="A.nxSet(\'grp\',\'' + g + '\')">' + esc(groupName(g)) + '</button>').join('') + '</div>';
  const sch = d.grp ? '<div class="chips">' + SUBS[d.grp].map(s => '<button type="button" class="chip sm ' + (d.sub === s ? 'on' : '') + '" onclick="A.nxSet(\'sub\',\'' + s + '\')">' + esc(subName(d.grp, s)) + '</button>').join('') + '</div>' : '';
  const ech = '<div class="chips">' + EQUIP_KEYS.map(e => '<button type="button" class="chip sm ' + (d.equip === e ? 'on' : '') + '" onclick="A.nxSet(\'equip\',\'' + e + '\')">' + EQ_ICON[e] + esc(equipName(e)) + '</button>').join('') + '</div>';
  sheet('<div class="h2">' + (x ? t('Edit exercise') : t('New exercise')) + '</div>' + field(t('Name'), 'x_name', d.name != null ? d.name : (x ? x.name : ''), { ph: t('e.g. Box squat (my cue)') }) +
    '<div class="field"><label>' + t('Muscle group') + '</label>' + gch + (d.grp && SUBS[d.grp].length > 1 ? '<div class="mute small" style="margin:8px 0 4px">' + t('Which part (optional)') + '</div>' + sch : '') + '</div>' +
    '<div class="field"><label>' + t('Equipment') + '</label>' + ech + '</div>' +
    field(t('Video link (YouTube, Drive…)'), 'x_video', d.video != null ? d.video : (x ? x.video_url : ''), { ph: 'https://', attrs: ' inputmode="url"', voice: false }) + field(t('Note'), 'x_note', d.note != null ? d.note : (x ? x.note : ''), { ph: t('optional') }) +
    '<button class="btn" onclick="A.saveExercise(' + (day || 0) + (id ? ',\'' + id + '\'' : '') + ')">' + t('Save exercise') + '</button>');
}
A.newExercise = (day) => { const c = cur(); const q = c && c.name === 'pickExercise' && S.pick ? S.pick.q.trim() : ''; S.draft.nx = { grp: (c && c.name === 'pickGroup' && c.params.g !== 'mine') ? c.params.g : '', sub: '', equip: '', name: q || null, nxDay: day || 0 }; exSheet(day); };
A.editExercise = (id) => { const x = byId(id); if (!x) return; S.draft.nx = { grp: x.grp || '', sub: x.sub || '', equip: x.equip || '', name: null, nxId: id }; exSheet(0, id); };
A.nxSet = (k, v) => { const d = nxSnap(); d[k] = d[k] === v ? '' : v; if (k === 'grp') d.sub = ''; exSheet(d.nxDay || 0, d.nxId); };
A.saveExercise = async (day, id) => {
  const name = val('x_name'); if (name.length < 2) { toast(t('Please enter a name.'), 'err'); return; }
  let video = val('x_video'); if (video && !/^https?:\/\//i.test(video) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(video)) video = 'https://' + video;   // youtube.com/… → https://youtube.com/…
  if (video && !/^https?:\/\//i.test(video)) { toast(t('The video link must start with https://'), 'err'); return; }
  const d = nxDraft(); const sub = d.grp ? (d.sub || (SUBS[d.grp].length === 1 ? SUBS[d.grp][0] : SUBS[d.grp][0])) : '';
  const kind = d.grp === 'cardio' ? 't' : d.grp === 'mobility' ? 's' : '';
  const row = { name, muscle: d.grp ? subName(d.grp, sub, true) : '', video_url: video, note: val('x_note'), grp: d.grp, sub: d.grp ? sub : '', equip: d.equip, kind };
  busy(true);
  try {
    if (id) { await db.updateExercise(id, row); Object.assign(byId(id), row); closeSheet(); toast(t('Saved')); rerender(); return; }
    const x = await db.addExercise(S.me.id, row); S.exercises.push(x); S.exercises.sort((a, b) => a.name.localeCompare(b.name)); closeSheet(); toast(t('Saved'));
    const c = cur(); if (day && c && (c.name === 'pickExercise' || c.name === 'pickGroup')) { const p = P(day); if (!p.sel.includes(x.id)) { p.sel.push(x.id); const df = defaultsFor(x); p.rx[x.id] = { sets: df.sets, reps: df.reps, load: '' }; } if (S.pick) S.pick.q = ''; rerender(); }
    else if (day) A.addItemFor(day, x.id); else rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
SCREENS.myExercises = () => {
  const m = mine().slice().sort((a, b) => (GROUP_KEYS.indexOf(a.grp) + 1 || 99) - (GROUP_KEYS.indexOf(b.grp) + 1 || 99) || a.name.localeCompare(b.name));
  const vb = x => x.video_url ? '<a class="btn xs sec" href="' + esc(x.video_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.video + ' ' + t('Video') + '</a>' : '';
  return { title: t('My exercises'), body:
    '<div class="mute">' + t('Your own moves and video links. Clients see them inside their plan.') + '</div>' +
    (m.length ? '<div class="card">' + m.map(x => '<div class="lrow" style="cursor:pointer" onclick="A.editExercise(\'' + x.id + '\')"><span class="xeq">' + (EQ_ICON[x.equip] || EQ_ICON.other) + '</span><div class="grow"><div class="t">' + esc(x.name) + '</div><div class="s">' + esc([exLine(x) || t('No muscle group yet'), x.video_url ? t('video') : ''].filter(Boolean).join(' · ')) + '</div></div>' + vb(x) + '<button class="act" onclick="event.stopPropagation();A.deleteExercise(\'' + x.id + '\')" aria-label="Delete">' + I.x + '</button></div>').join('') + '</div>' : '<div class="card flat mute">' + t('None yet.') + '</div>') +
    '<button class="btn" onclick="A.newExercise(0)">' + I.plus + ' ' + t('New exercise') + '</button>',
    after: async () => { if (!S.exercises) { S.exercises = await db.listExercises(); rerender(); } } };
};
A.deleteExercise = async (id) => { try { await db.deleteExercise(id); S.exercises = S.exercises.filter(x => x.id !== id); rerender(); toast(t('Removed')); } catch (e) { toast(t('Could not remove — it may be in a plan'), 'err'); } };
