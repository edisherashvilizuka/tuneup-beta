// Tune Up beta — Tune Up Solo (Launch 1, decided 2026-10-31): training without a coach. A ready-made program (drafted by
// Tune, confirmed by the partner coach in admin) is adapted to the person — their days, gym or home, experience,
// injuries — and written week by week into the plan of their solo pair, so Today / Plan / Foods work exactly as with a
// coach. Targets come from the confirmed nutrition rules. Every week Tune proposes the next step on a card the person
// taps (Apply / Keep). A coach can be added at any time; ending coaching brings the person back here.
import { t, esc, LANG, isoDate, addDays, weekdayOf, dayName, exName, unit, fmtDay, firstName, opt } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, busy, empty, val } from './ui.js';
import * as db from './db.js';
import { S, isSolo } from './state.js';
import { splitFor } from './plan.js';

// ---- data
export async function loadSolo() {
  if (!S.solo) S.solo = {};
  const [progs, rules, exs] = await Promise.all([S.solo.programs ? Promise.resolve(S.solo.programs) : db.programs(false), S.solo.rules ? Promise.resolve(S.solo.rules) : db.rules(), S.exercises ? Promise.resolve(S.exercises) : db.listExercises()]);
  S.solo.programs = progs || []; S.solo.rules = {}; (rules || []).forEach(r => { S.solo.rules[r.key] = r; }); S.exercises = exs;
  if (S.pair && S.pair.kind === 'solo') { try { S.solo.proposals = await db.proposals(S.pair.id); } catch (e) { S.solo.proposals = []; } }
}
const GOAL_MAP = { lose: 'lose', gain: 'gain', tone: 'tone', health: 'tone', sport: 'strength', strength: 'strength' };
const LEVEL_MAP = { beginner: 'beginner', some: 'some', regular: 'some' };
export function progTitle(p) { return (LANG.cur === 'ka' && p.title_ka) ? p.title_ka : p.title; }
export function progSummary(p) { return (LANG.cur === 'ka' && p.summary_ka) ? p.summary_ka : p.summary; }
export function pickProgram(tp, progs) {
  progs = progs || (S.solo && S.solo.programs) || []; tp = tp || {};
  const goal = GOAL_MAP[tp.goal] || 'tone', level = LEVEL_MAP[tp.experience] || 'beginner', place = tp.place || 'gym';
  const score = p => (p.goal === goal ? 4 : 0) + (p.level === level ? 2 : 0) + (p.place === place ? 1 : 0);
  return progs.slice().sort((a, b) => score(b) - score(a))[0] || null;
}
// week N of a program — the same arithmetic as tools/programs.py week_items(): reps grow every `reps_every` weeks, one
// set is added from `add_set_from`, the last week is a lighter deload; `fixed` items never change, `cardio` grows in minutes
function bumpReps(reps, k) {
  const m = /^(\d+)(?:\s*(s|min))?$/.exec(reps); if (!m) return reps; const n = +m[1], u = m[2];
  if (u === 's') return (n + 10 * k) + ' s'; if (u === 'min') return (n + 2 * k) + ' min';
  return String(n >= 5 ? n + Math.min(k, 4) : n + Math.min(k, 2));
}
export function expandWeek(program, w) {
  const b = program.body || {}; const r = b.rules || {}; const weeks = program.weeks; const deload = r.deload_last !== false && w === weeks;
  return (b.days || []).map(day => ({ name: day.name, name_ka: day.name_ka, items: (day.items || []).map(it => {
    if (it.fixed) return { ex: it.ex, sets: it.sets, reps: it.reps, load: it.load || '' };
    const k = Math.floor((w - 1) / (r.reps_every || 2));
    if (it.cardio) return { ex: it.ex, sets: 1, reps: bumpReps(it.reps, k), load: it.load || '' };
    const numeric = /^\d+$/.test(it.reps);
    const addSet = (w >= (r.add_set_from || 4) && it.sets >= 3 && !/min|s$/.test(it.reps)) ? 1 : 0;
    const sets = deload ? it.sets : it.sets + addSet; const reps = deload ? it.reps : bumpReps(it.reps, k);
    let load = it.load || '';
    if (r.load_note && !deload && w % 2 === 0 && numeric && !load) load = t('+2.5 kg when every rep is clean');
    if (deload && numeric) load = (load ? load + ' · ' : '') + t('lighter week');
    return { ex: it.ex, sets, reps, load };
  }) }));
}
// injuries → swaps. The free text is matched on EN/KA keywords; the swap lists live in app_rules 'swaps' (gym / home).
export const INJ = { knee: /knee|მუხლ/i, back: /\bback|spine|lower back|წელ|ზურგ/i, shoulder: /shoulder|მხარ|მხრ/i, wrist: /wrist|მაჯ/i, ankle: /ankle|კოჭ/i };
export function injuryKeys(text) { return Object.keys(INJ).filter(k => INJ[k].test(text || '')); }
export function adaptDays(days, tp) {
  const keys = injuryKeys(tp.injuries); const sw = ((S.solo && S.solo.rules && S.solo.rules.swaps && S.solo.rules.swaps.value) || {})[tp.place || 'gym'] || [];
  const notes = []; const seen = new Set();
  const out = days.map(day => ({ name: day.name, name_ka: day.name_ka, items: day.items.map(it => {
    for (const rule of sw) { if (keys.includes(rule.when) && rule.from.includes(it.ex)) { const key = it.ex + '>' + rule.to; if (!seen.has(key)) { seen.add(key); notes.push({ when: rule.when, from: it.ex, to: rule.to }); } return Object.assign({}, it, { ex: rule.to, swapped: it.ex }); } }
    return it;
  }) }));
  // no duplicate exercise on one day after a swap
  out.forEach(day => { const names = new Set(); day.items = day.items.filter(it => { if (names.has(it.ex)) return false; names.add(it.ex); return true; }); });
  return { days: out, notes, keys };
}
// which weekday gets which day template: the person's days, spread; more days than templates → templates repeat
export function mapDays(templates, days) {
  const D = (days || []).map(Number).filter(x => x >= 1 && x <= 7).sort((a, b) => a - b);
  const n = templates.length; if (!n) return [];
  if (!D.length) return templates.map((tpl, i) => ({ day: [1, 3, 5, 2, 4, 6][i] || 7, tpl }));
  if (D.length <= n) return D.map((d, i) => ({ day: d, tpl: templates[i % n] }));
  const picks = []; for (let i = 0; i < n; i++) picks.push(D[Math.round(i * (D.length - 1) / Math.max(1, n - 1))]);
  return [...new Set(picks)].map((d, i) => ({ day: d, tpl: templates[i] }));
}
export function exByName(name) { const L = S.exercises || []; return L.find(x => !x.owner_id && x.name === name) || L.find(x => x.name === name) || null; }
// targets from the confirmed rules (Mifflin-St Jeor → activity → goal; protein per kg; water per kg; steps by goal)
export function targetsFor(tp) {
  const R = (S.solo && S.solo.rules && S.solo.rules.nutrition && S.solo.rules.nutrition.value) || {}; tp = tp || {};
  const w = Number(tp.weight_kg) || 70, h = Number(tp.height_cm) || 170, a = Number(tp.age) || 30, sex = tp.sex === 'm' ? 'm' : 'f';
  const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'm' ? 5 : -161);
  const days = (tp.days || []).length || 3; const act = (R.activity || {})[String(Math.min(6, Math.max(1, days)))] || 1.4;
  const goal = GOAL_MAP[tp.goal] || 'tone'; const adj = (R.goal_kcal || {})[tp.goal] != null ? R.goal_kcal[tp.goal] : (R.goal_kcal || {})[goal] || 0;
  let kcal = Math.round(bmr * act * (1 + adj) / 10) * 10;
  kcal = Math.max((R.kcal_floor || {})[sex] || 1300, Math.min(R.kcal_ceiling || 3600, kcal));
  const ppk = (R.protein_per_kg || {})[tp.goal] || (R.protein_per_kg || {})[goal] || 1.6;
  const protein = Math.max(R.protein_min || 60, Math.min(R.protein_max || 220, Math.round(w * ppk / 5) * 5));
  const water = Math.max(R.water_min || 1500, Math.min(R.water_max || 4000, Math.round(w * (R.water_ml_per_kg || 35) / 250) * 250));
  const steps = (R.steps || {})[tp.goal] || (R.steps || {})[goal] || 8000;
  const sp = splitFor(kcal, protein, R.split || 'balanced') || {};
  return { kcal, protein_g: protein, carbs_g: sp.carbs_g || null, fat_g: sp.fat_g || null, water_ml: water, steps, split: R.split || 'balanced' };
}
// write week N into the solo pair's plan (+ targets when none yet)
export async function materialize(pair, program, week, opts) {
  const tp = S.traineeProfile || {}; const days = expandWeek(program, week); const ad = adaptDays(days, tp); const map = mapDays(ad.days, tp.days);
  const items = []; map.forEach(m => { m.tpl.items.forEach((it, i) => { const x = exByName(it.ex); if (!x) return; items.push({ day: m.day, exercise_id: x.id, sets: Math.max(1, Math.min(20, it.sets)), reps: String(it.reps), load: it.load || '', note: it.swapped ? t('instead of {name}', { name: exName(exByName(it.swapped) || { name: it.swapped }) }) : '', position: i }); }); });
  await db.replacePlanWeek(pair.id, items);
  if ((opts || {}).targets !== false) { const cur = await db.getTargets(pair.id); if (!cur || !cur.kcal) await db.saveTargets(pair.id, targetsFor(tp)); }
  return { items, notes: ad.notes, map };
}
export async function startProgram(program) {
  const pair = S.pair; if (!pair || pair.kind !== 'solo') return;
  const tp = S.traineeProfile || {}; const ad = adaptDays(expandWeek(program, 1), tp);
  const vars = { days: (tp.days || []).map(Number), place: tp.place || 'gym', swaps: ad.notes, injuries: ad.keys };
  await db.startProgram(pair.id, program.id, vars);
  Object.assign(pair, { program_id: program.id, program_started: isoDate(), program_week: 1, program_vars: vars });
  await materialize(pair, program, 1);
}
export function myProgram() { const id = S.pair && S.pair.program_id; return id ? ((S.solo && S.solo.programs) || []).find(p => p.id === id) || null : null; }
function weekOfProgram() { const p = S.pair; if (!p || !p.program_started) return 0; return Math.floor((new Date(isoDate() + 'T00:00:00') - new Date(p.program_started + 'T00:00:00')) / 86400000 / 7) + 1; }
window.__solo = { programLine: () => programLine() };
export function programLine() { const pg = myProgram(); if (!pg) return ''; return progTitle(pg) + ' · ' + t('week {n} of {m}', { n: S.pair.program_week || 1, m: pg.weeks }); }

// ---- "Your program" screen: first time = preview + Start; later = status, adaptations, targets, change / find a coach
SCREENS.program = () => {
  if (!isSolo()) return { title: t('Your program'), body: empty('plan', t('You train with a coach — your plan lives in the Plan tab.')) };
  if (!S.solo || !S.solo.programs) return { title: t('Your program'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { await loadSolo(); } catch (e) {} rerender(); } };
  const tp = S.traineeProfile || {}; const cur = myProgram(); const pg = cur || S.draft.pickedProgram || pickProgram(tp);
  if (!pg) return { title: t('Your program'), body: empty('plan', t('No programs are published yet — check back soon, or find a coach.')) + '<button class="btn" onclick="A.go(\'findCoach\')">' + t('Find a coach') + '</button>' };
  const ad = adaptDays(expandWeek(pg, 1), tp); const map = mapDays(ad.days, tp.days); const tg = cur ? (S.plan && S.plan.targets) || targetsFor(tp) : targetsFor(tp);
  const who = pg.author_id ? t('Contributed by a Tune Up coach') : t('Drafted by Tune');
  const head = '<div class="card accent"><div class="eyebrow">' + esc(progTitle(pg)) + '</div><div class="h2" style="font-size:22px">' + esc(t('{w} weeks · {d} days a week · about 45 min', { w: pg.weeks, d: pg.days_per_week })) + '</div>' + (cur ? '<div class="s" style="color:rgba(255,255,255,.85)">' + esc(t('Week {n} of {m} · started {date}', { n: S.pair.program_week || 1, m: pg.weeks, date: fmtDay(S.pair.program_started, 'dm') })) + '</div>' : '') +
    '<div class="s" style="color:rgba(255,255,255,.85)">' + esc(progSummary(pg)) + '</div><div class="s" style="color:rgba(255,255,255,.85)">' + I.shield + ' ' + esc(pg.confirmed_at ? t('Confirmed by a Tune Up coach') : who) + '</div></div>';
  const adapted = '<div class="card tune"><div class="row" style="gap:8px"><span style="color:var(--c-tune)">' + I.spark + '</span><div class="h3">' + t('Adapted for you') + '</div></div><div class="col" style="gap:8px">' +
    '<div class="row" style="gap:8px"><span class="check sm on">' + I.check + '</span><span>' + esc(t('{n} days: {days}', { n: map.length, days: map.map(m => dayName(m.day, true)).join(' · ') })) + (tp.time_of_day && tp.time_of_day.length ? ', ' + esc(tp.time_of_day.map(x => t({ morning: 'mornings', day: 'daytime', evening: 'evenings' }[x] || x)).join(' / ')) : '') + '</span></div>' +
    '<div class="row" style="gap:8px"><span class="check sm on">' + I.check + '</span><span>' + esc(tp.place === 'home' ? t('At home — bodyweight, bands, a chair') : t('In the gym')) + '</span></div>' +
    ad.notes.map(n => '<div class="row" style="gap:8px"><span class="check sm on">' + I.check + '</span><span>' + esc(t({ knee: 'Knee', back: 'Back', shoulder: 'Shoulder', wrist: 'Wrist', ankle: 'Ankle' }[n.when]) + ': ' + exName(exByName(n.from) || { name: n.from }) + ' → ' + exName(exByName(n.to) || { name: n.to })) + '</span></div>').join('') +
    (tp.eating_style && tp.eating_style !== 'normal' ? '<div class="row" style="gap:8px"><span class="check sm on">' + I.check + '</span><span>' + esc(t('Food ideas follow your eating style ({style})', { style: opt('eating_style', tp.eating_style) })) + '</span></div>' : '') + '</div></div>';
  const kpi = (v, c) => '<div class="kpi" style="background:var(--a-bg)"><div class="num" style="font-size:20px;color:var(' + c + ')">' + esc(v) + '</div></div>';
  const targets = '<div class="card"><div class="h3">' + t('Your targets') + '</div><div class="kpis">' + kpi(tg.kcal + ' ' + unit('kcal'), '--c-kcal') + kpi(tg.protein_g + ' ' + unit('g') + ' ' + t('protein'), '--c-protein') + kpi((tg.water_ml / 1000) + ' ' + unit('L') + ' ' + t('water'), '--c-water') + kpi(tg.steps + ' ' + t('steps'), '--c-kcal') + '</div><div class="s">' + t('From Tune Up\'s rules, confirmed by a coach. Tune explains every number if you ask.') + '</div></div>';
  const week1 = '<div class="card"><div class="row between"><div class="h3">' + (cur ? t('This week') : t('Week 1')) + '</div><span class="mute small">' + esc(map.length + ' ' + t('days')) + '</span></div>' + map.map(m => '<div class="lrow"><div class="grow"><div class="t">' + esc(dayName(m.day)) + ' · ' + esc(LANG.cur === 'ka' && m.tpl.name_ka ? m.tpl.name_ka : m.tpl.name) + '</div><div class="s">' + esc(m.tpl.items.filter(i => !/Stretching|Cat-cow|Brisk walk|treadmill/.test(i.ex)).map(i => exName(exByName(i.ex) || { name: i.ex }) + ' ' + i.sets + '×' + i.reps).join(' · ')) + '</div></div></div>').join('') + '</div>';
  const foot = cur ? '<button class="btn sec" onclick="A.changeProgram()">' + t('Change program') + '</button><button class="btn sec" onclick="A.go(\'findCoach\')">' + I.users + ' ' + t('Find a coach') + '</button>'
    : '<button class="btn" onclick="A.startProgram()">' + t('Start the program') + '</button><button class="btn sec" onclick="A.changeProgram()">' + t('Pick another program') + '</button>';
  return { title: t('Your program'), back: !!cur, tabs: !!cur, body: head + adapted + targets + week1 + foot };
};
A.startProgram = async () => {
  const pg = S.draft.pickedProgram || pickProgram(S.traineeProfile); if (!pg) return; busy(true);
  try { await startProgram(pg); S.draft.pickedProgram = null; const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Program started — see you on Today')); root('home'); }
  catch (e) { busy(false); console.error(e); toast(t('Could not start — try again'), 'err'); }
};
A.changeProgram = () => {
  const tp = S.traineeProfile || {}; const all = (S.solo.programs || []); const place = S.draft.pgPlace || tp.place || 'gym';
  const list = all.filter(p => p.place === place);
  sheet('<div class="h2">' + t('Programs') + '</div><div class="segc"><button class="' + (place === 'gym' ? 'on' : '') + '" onclick="A.pgPlace(\'gym\')">' + t('Gym') + '</button><button class="' + (place === 'home' ? 'on' : '') + '" onclick="A.pgPlace(\'home\')">' + t('Home') + '</button></div>' +
    (list.length ? '<div class="slist">' + list.map(p => '<div class="srow" style="cursor:pointer" onclick="A.pickProgram(\'' + p.id + '\')"><div class="grow" style="min-width:0"><div class="t wrap">' + esc(progTitle(p)) + '</div><div class="s wrap">' + esc(t('{w} weeks · {d} days a week', { w: p.weeks, d: p.days_per_week })) + ' · ' + esc(progSummary(p)) + '</div></div>' + (S.pair.program_id === p.id ? '<span class="tag ok">' + t('current') + '</span>' : I.chev) + '</div>').join('') + '</div>' : '<div class="card flat mute">' + t('Nothing here yet.') + '</div>'));
};
A.pgPlace = (p) => { S.draft.pgPlace = p; A.changeProgram(); };
A.pickProgram = async (id) => {
  const pg = (S.solo.programs || []).find(p => p.id === id); if (!pg) return;
  if (!myProgram()) { S.draft.pickedProgram = pg; closeSheet(); rerender(); return; }
  closeSheet(); busy(true);
  try { await startProgram(pg); const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Program changed')); rerender(); } catch (e) { busy(false); toast(t('Could not change — try again'), 'err'); }
};

// ---- the weekly card (Monday, or whenever the current week has run its course): Tune looks at the week and proposes
function lastWeekStats() {
  const p = S.pair; const items = (S.plan && S.plan.items) || []; const H = S.hist35 || []; const tg = (S.plan && S.plan.targets) || {};
  const start = addDays(p.program_started, 7 * ((p.program_week || 1) - 1)); const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(start, i)).filter(d => d < isoDate() || d === isoDate());
  const planned = days.filter(d => items.some(i => i.day === weekdayOf(new Date(d + 'T00:00:00')))).length;
  const done = days.filter(d => { const its = items.filter(i => i.day === weekdayOf(new Date(d + 'T00:00:00'))); if (!its.length) return false; const L = (d === isoDate() ? (S.today.logs || []) : H.filter(l => l.day === d)); const refs = new Set(L.filter(l => l.kind === 'exercise').map(l => l.ref)); return its.every(i => refs.has(i.id)); }).length;
  const protDays = tg.protein_g ? days.filter(d => { const L = (d === isoDate() ? (S.today.logs || []) : H.filter(l => l.day === d)); const g = L.filter(l => l.kind === 'food').reduce((a, l) => a + (Number(l.protein_g) || 0), 0); return g >= tg.protein_g * 0.9; }).length : null;
  return { planned, done, protDays, days: days.length };
}
export function proposalDue() {
  const p = S.pair; const pg = myProgram(); if (!p || !pg || !p.program_started) return null;
  const w = p.program_week || 1; const endOfWeek = addDays(p.program_started, 7 * w);     // first day after week w
  if (isoDate() < endOfWeek) return null;
  return { week: w, next: w + 1, finished: w >= pg.weeks };
}
export function weeklyCard() {
  if (!isSolo()) return ''; const due = proposalDue(); if (!due) return '';
  const pg = myProgram(); const st = lastWeekStats();
  if (due.finished) return '<div class="card tune"><div class="row" style="gap:8px"><span style="color:var(--c-tune)">' + I.spark + '</span><div class="grow"><div class="eyebrow" style="color:var(--c-tune)">' + t('Program complete') + '</div><div class="h3">' + esc(t('{w} weeks done — well played', { w: pg.weeks })) + '</div></div></div><div class="s" style="color:var(--a-ink2)">' + esc(t('Pick the next program (the intermediate one, if this was beginner) or repeat this one a notch heavier.')) + '</div><div class="btn-row"><button class="btn tune" onclick="A.changeProgram()">' + t('Next program') + '</button><button class="btn sec" onclick="A.go(\'findCoach\')">' + t('Find a coach') + '</button></div></div>';
  const prop = (S.solo.proposals || []).find(x => x.week === due.next);
  if (prop && prop.status !== 'pending') return '';
  const good = st.planned === 0 || st.done >= Math.ceil(st.planned * 2 / 3);
  const nextDays = adaptDays(expandWeek(pg, due.next), S.traineeProfile || {}).days; const curDays = adaptDays(expandWeek(pg, due.week), S.traineeProfile || {}).days;
  const diffs = []; nextDays.forEach((d, i) => { (d.items || []).forEach((it, j) => { const o = ((curDays[i] || {}).items || [])[j]; if (o && o.ex === it.ex && (o.sets !== it.sets || o.reps !== it.reps)) diffs.push(exName(exByName(it.ex) || { name: it.ex }) + ' ' + o.sets + '×' + o.reps + ' → ' + it.sets + '×' + it.reps); }); });
  const uniq = [...new Set(diffs)].slice(0, 4);
  const sum = t('{done} of {planned} workouts done', { done: st.done, planned: st.planned }) + (st.protDays != null ? ', ' + t('protein on target {n} of {m} days', { n: st.protDays, m: st.days }) : '') + '.';
  const text = good ? sum + ' ' + t('For week {n} I suggest: {changes}', { n: due.next, changes: uniq.length ? uniq.join(', ') : t('the next step of the program') }) + (S.pair.program_vars && (S.pair.program_vars.injuries || []).length ? ' ' + t('Still no moves that load the {part}.', { part: (S.pair.program_vars.injuries || []).map(k => t({ knee: 'knee', back: 'back', shoulder: 'shoulder', wrist: 'wrist', ankle: 'ankle' }[k])).join(', ') }) : '')
    : sum + ' ' + t('A lighter week behind us — I\'d repeat week {n} before moving on, but it\'s your call.', { n: due.week });
  return '<div class="card tune" data-prop="' + due.next + '"><div class="row" style="gap:8px"><span style="color:var(--c-tune)">' + I.spark + '</span><div class="grow"><div class="eyebrow" style="color:var(--c-tune)">' + t('Next week') + '</div><div class="h3">' + t('Tune looked at your week') + '</div></div></div><div style="font-size:15px;line-height:1.4">' + esc(text) + '</div>' +
    '<div class="btn-row"><button class="btn tune" onclick="A.propApply(' + due.next + ')">' + esc(t('Apply for week {n}', { n: due.next })) + '</button><button class="btn sec" onclick="A.propKeep(' + due.next + ')">' + esc(good ? t('Keep as is') : t('Repeat week {n}', { n: due.week })) + '</button></div></div>';
}
async function saveProp(week, status, text) { try { const row = await db.saveProposal({ pair_id: S.pair.id, week, text: text || '', status, answered_at: new Date().toISOString() }); S.solo.proposals = [row].concat((S.solo.proposals || []).filter(x => x.week !== week)); } catch (e) {} }
A.propApply = async (week) => {
  const pg = myProgram(); if (!pg) return; busy(true);
  try { await materialize(S.pair, pg, week, { targets: false }); await db.setProgramWeek(S.pair.id, week, null); S.pair.program_week = week; await saveProp(week, 'applied'); const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Week {n} is on your plan', { n: week })); rerender(); }
  catch (e) { busy(false); toast(t('Could not apply — try again'), 'err'); }
};
A.propKeep = async (week) => {
  // "keep" / "repeat": the same items stay; the program's clock moves on so next Monday brings the next proposal
  busy(true);
  try { await db.setProgramWeek(S.pair.id, S.pair.program_week || 1, null); await saveProp(week, 'kept'); S.pair.program_started = addDays(S.pair.program_started, 7); busy(false); toast(t('Kept — same week again')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// ---- Solo pieces on Today and More
export function programCard() {
  if (!isSolo()) return ''; const pg = myProgram();
  if (!pg) return '<div class="card soft tap" onclick="A.go(\'program\')"><div class="row"><div class="grow"><div class="h3">' + t('Your program is ready') + '</div><div class="s" style="color:var(--a-ink2)">' + t('Made for you from your answers — open it and press start.') + '</div></div>' + I.chev + '</div></div>';
  return '';
}
export function findCoachCard() {
  if (!isSolo() || S.trial) return ''; const tp = S.traineeProfile || {}; const req = S.match && S.match.request;
  if (req && req.status === 'pending') return '';
  const twoWeeks = S.pair.program_started && isoDate() >= addDays(S.pair.program_started, 14);
  if (tp.mode !== 'later' && !twoWeeks) return '';
  const from = S.match && S.match.cheapest ? ' ' + t('from {n} ₾ a month', { n: S.match.cheapest }) : '';
  return '<div class="card soft"><div class="h3">' + t('Want someone in your corner?') + '</div><div class="s" style="color:var(--a-ink2)">' + esc(t('Tbilisi coaches{from}. Free trial session, no card.', { from })) + '</div><button class="btn sm" style="background:var(--a-card);color:var(--a-ink)" onclick="A.go(\'findCoach\')">' + t('Find a coach') + ' ' + I.chev + '</button></div>';
}
export function soloMoreRows(row) {
  if (!isSolo()) return '';
  return row('--c-tune', "A.go('program')", t('Your program'), esc(programLine() || t('Not started yet'))) + row('--c-water', "A.go('findCoach')", t('Find a coach'), t('Ranked matches, free trial'));
}
// a solo pair with no program yet gets one on first load (Today shows the "ready" card); after a coach pair ends the
// person lands here too
export async function ensureSolo() {
  if (!isSolo()) return; if (!S.solo || !S.solo.programs) await loadSolo();
}
