// Tune Up beta — coach side: weekly plan builder, exercise library, targets, goals (per client).
import { t, esc, dayName, exName, unit } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, sheet, closeSheet, field, val, busy, empty } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { itemFields, readItemFields } from './picker.js';
import { EQ_ICON, exLine, howUrl, dayFigure, groupsLine } from './exlib.js';

// S.plan = { pairId, items, targets, goals }; S.exercises = library (loaded once per session)
export async function loadPlan(pairId) {
  const [items, targets, goals] = await Promise.all([db.planItems(pairId), db.getTargets(pairId), db.listGoals(pairId)]);
  S.plan = { pairId, items, targets, goals };
  if (!S.exercises) S.exercises = await db.listExercises();
  return S.plan;
}
function itemsFor(day) { return (S.plan ? S.plan.items : []).filter(i => i.day === day); }
export function nEx(n) { return n === 1 ? t('1 exercise') : t('{n} exercises', { n }); }
function itemLine(i) { return [i.sets + ' × ' + i.reps, i.load].filter(Boolean).join(' · '); }
function videoBtn(x) { return x && x.video_url ? '<a class="btn xs sec" href="' + esc(x.video_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.video + ' ' + t('Video') + '</a>' : ''; }

// ---- plan overview card (used inside the client screen)
export function planCard(pairId) {
  const p = S.plan && S.plan.pairId === pairId ? S.plan : null;
  if (!p) return '';
  const days = [1, 2, 3, 4, 5, 6, 7].map(d => { const n = itemsFor(d).length; return '<div class="lrow" style="cursor:pointer" onclick="A.go(\'planDay\',{day:' + d + '})"><div class="grow"><div class="t">' + esc(dayName(d)) + '</div><div class="s">' + (n ? esc([nEx(n), groupsLine(itemsFor(d).map(i => i.exercise))].filter(Boolean).join(' · ')) : t('Rest day')) + '</div></div>' + I.chev + '</div>'; }).join('');
  const tg = p.targets;
  const tgLine = targetsLine(tg);
  const goals = p.goals.length ? p.goals.map(g => '<div class="row" style="gap:8px"><span class="check ' + (g.done ? 'on' : '') + '" style="width:20px;height:20px">' + (g.done ? I.check : '') + '</span><span class="grow gtx ' + (g.done ? 'mute' : '') + '">' + esc(g.text) + '</span></div>').join('') : '<div class="mute">' + t('No goals yet') + '</div>';
  return '<div class="section-title"><span class="eyebrow">' + t('Weekly plan') + '</span></div><div class="card">' + days + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Daily targets') + '</span><span class="link" onclick="A.targetsSheet()">' + t('Edit') + '</span></div><div class="card"><div class="lead">' + esc(tgLine) + '</div></div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Goals') + '</span><span class="link" onclick="A.goalsScreen()">' + t('Edit') + '</span></div><div class="card">' + goals + '</div>';
}

// ---- one day of the plan: which muscles it trains (the figure), then the exercises
SCREENS.planDay = ({ day }) => {
  const items = itemsFor(day), exs = items.map(i => i.exercise).filter(Boolean);
  const sets = items.reduce((n, i) => n + (parseInt(i.sets, 10) || 0), 0);
  const hero = items.length ? '<div class="card dayhero"><div class="dh-figs">' + dayFigure(exs, 'sm') + '</div><div class="grow" style="min-width:0"><div class="eyebrow">' + t('Trains') + '</div><div class="h3">' + esc(groupsLine(exs) || t('My exercises')) + '</div><div class="mute small">' + esc(nEx(items.length) + ' · ' + (sets === 1 ? t('1 set') : t('{n} sets', { n: sets }))) + '</div></div></div>' : '';
  const body = hero + (items.length ? '<div class="col" style="gap:8px">' + items.map(i => '<div class="task" onclick="A.editItem(\'' + i.id + '\')"><span class="xeq">' + (EQ_ICON[(i.exercise || {}).equip] || EQ_ICON.other) + '</span><div class="grow" style="min-width:0"><div class="t">' + esc(exName(i.exercise)) + '</div><div class="s">' + esc(itemLine(i)) + (i.note ? ' · ' + esc(i.note) : '') + '</div>' + (i.exercise && exLine(i.exercise) ? '<div class="s mute">' + esc(exLine(i.exercise)) + '</div>' : '') + '</div>' + videoBtn(i.exercise) + I.chev + '</div>').join('') + '</div>' : empty('plan', t('Rest day — add an exercise to make it a training day'))) +
    '<button class="btn" onclick="A.go(\'pickExercise\',{day:' + day + '})">' + I.plus + ' ' + t('Add exercise') + '</button>';
  return { title: dayName(day), sub: nEx(items.length), body };
};

A.editItem = (id) => {
  const i = S.plan.items.find(x => x.id === id); if (!i) return; const how = howUrl(i.exercise);
  sheet('<div class="h2">' + esc(exName(i.exercise)) + '</div><div class="row" style="gap:10px"><span class="mute small grow">' + esc(exLine(i.exercise || {})) + '</span>' + (how ? '<a class="link small" href="' + esc(how) + '" target="_blank" rel="noopener">' + I.play + ' ' + t('How to do it') + '</a>' : '') + '</div>' + itemFields(i) +
    '<button class="btn" onclick="A.saveItem(\'' + id + '\')">' + t('Save') + '</button><button class="btn sec" onclick="A.removeItem(\'' + id + '\')">' + t('Remove from this day') + '</button>');
};
A.saveItem = async (id) => {
  const patch = readItemFields(); busy(true);
  try { await db.updatePlanItem(id, patch); Object.assign(S.plan.items.find(x => x.id === id), patch); closeSheet(); toast(t('Saved')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.removeItem = async (id) => {
  try { await db.deletePlanItem(id); S.plan.items = S.plan.items.filter(x => x.id !== id); if (S.mon) S.mon.items = S.mon.items.filter(x => x.id !== id); closeSheet(); rerender(); }
  catch (e) { toast(t('Could not remove — try again'), 'err'); }
};

// ---- targets. Calories and protein are typed; carbs and fats follow the coach's chosen split of the remaining
// calories (balanced 55/45, higher-carb 65/35, lower-carb 40/60) and can be overridden by hand (→ custom).
export const SPLITS = { balanced: [0.55, 0.45], highcarb: [0.65, 0.35], lowcarb: [0.40, 0.60] };
export const SPLIT_NAMES = { balanced: 'Balanced', highcarb: 'High-carb', lowcarb: 'Low-carb', custom: 'Custom' };
export function splitFor(kcal, protein, split) {
  const r = SPLITS[split]; if (!r || !kcal || !protein) return null;
  const rem = Math.max(0, kcal - protein * 4); return { carbs_g: Math.max(10, Math.round(rem * r[0] / 4)), fat_g: Math.max(10, Math.round(rem * r[1] / 9)) };
}
// targets as the trainee should see them: carbs/fats missing on an older row follow the split (balanced by default)
export function effectiveTargets(tg) {
  if (!tg) return tg;
  if ((tg.carbs_g && tg.fat_g) || tg.split === 'custom') return tg;
  const r = splitFor(tg.kcal, tg.protein_g, tg.split || 'balanced'); if (!r) return tg;
  return Object.assign({}, tg, { carbs_g: tg.carbs_g || r.carbs_g, fat_g: tg.fat_g || r.fat_g });
}
export function targetsLine(tg) {
  tg = effectiveTargets(tg);
  return tg ? [tg.kcal ? tg.kcal + ' ' + unit('kcal') : '', tg.protein_g ? tg.protein_g + ' ' + unit('g') + ' ' + t('protein') : '', tg.carbs_g ? tg.carbs_g + ' ' + unit('g') + ' ' + t('carbs') : '', tg.fat_g ? tg.fat_g + ' ' + unit('g') + ' ' + t('fats') : '', tg.water_ml ? (tg.water_ml / 1000) + ' ' + unit('L') : '', tg.steps ? tg.steps + ' ' + t('steps') : ''].filter(Boolean).join(' · ') : t('Not set yet');
}
A.targetsSheet = () => {
  const tg = (S.plan && S.plan.targets) || {}; S.draft.split = tg.split || 'balanced';
  sheet('<div class="h2">' + t('Daily targets') + '</div><div class="mute">' + t('Leave empty what you do not track.') + '</div>' +
    '<div class="input-row">' + field(t('Calories'), 'tg_kcal', tg.kcal || '', { type: 'number', unit: unit('kcal'), ph: '1800', attrs: ' oninput="A.tgRecalc()"' }) + field(t('Protein'), 'tg_protein', tg.protein_g || '', { type: 'number', unit: unit('g'), ph: '120', attrs: ' oninput="A.tgRecalc()"' }) + '</div>' +
    '<div class="field"><label>' + t('Carbs and fats') + '</label><div class="segc" id="tg_split">' + splitButtons() + '</div><div class="mute small" style="margin-top:6px">' + t('Filled from calories and protein. Change a number to set your own.') + '</div></div>' +
    '<div class="input-row">' + field(t('Carbs'), 'tg_carbs', tg.carbs_g || '', { type: 'number', unit: unit('g'), ph: '200', attrs: ' oninput="A.tgCustom()"' }) + field(t('Fats'), 'tg_fat', tg.fat_g || '', { type: 'number', unit: unit('g'), ph: '60', attrs: ' oninput="A.tgCustom()"' }) + '</div>' +
    '<div class="mute small" id="tg_sum" aria-live="polite"></div>' +
    '<div class="input-row">' + field(t('Water'), 'tg_water', tg.water_ml || '', { type: 'number', unit: unit('ml'), ph: '2000' }) + field(t('Steps'), 'tg_steps', tg.steps || '', { type: 'number', ph: '8000' }) + '</div>' +
    '<button class="btn" onclick="A.saveTargets()">' + t('Save') + '</button>');
  if (!tg.carbs_g && !tg.fat_g) A.tgRecalc(); else A.tgSum();
};
function splitButtons() { return Object.keys(SPLIT_NAMES).map(k => '<button type="button" class="' + (S.draft.split === k ? 'on' : '') + '" onclick="A.tgSplit(\'' + k + '\')">' + esc(t(SPLIT_NAMES[k])) + '</button>').join(''); }
A.tgSplit = (k) => { S.draft.split = k; const el = document.getElementById('tg_split'); if (el) el.innerHTML = splitButtons(); A.tgRecalc(); };
A.tgRecalc = () => {
  if (S.draft.split === 'custom') return;
  const r = splitFor(parseInt(val('tg_kcal'), 10), parseInt(val('tg_protein'), 10), S.draft.split);
  const c = document.getElementById('tg_carbs'), f = document.getElementById('tg_fat');
  if (c) c.value = r ? r.carbs_g : ''; if (f) f.value = r ? r.fat_g : '';
  A.tgSum();
};
// the check line under carbs/fats: what protein + carbs + fats add up to, and a warning when protein alone is over the calories
A.tgSum = () => {
  const el = document.getElementById('tg_sum'); if (!el) return;
  const n = id => { const v = parseInt(val(id), 10); return isNaN(v) ? 0 : v; };
  const k = n('tg_kcal'), p = n('tg_protein'), sum = p * 4 + n('tg_carbs') * 4 + n('tg_fat') * 9;
  if (k && p * 4 > k) { el.innerHTML = '<span style="color:var(--a-red)">' + esc(t('Protein alone is {k} kcal — more than the calorie target.', { k: p * 4 })) + '</span>'; return; }
  const pk = p * 4, ck = n('tg_carbs') * 4, fk = n('tg_fat') * 9;
  const bar = sum ? '<div class="mixbar" aria-hidden="true"><i style="flex:' + pk + ';background:var(--c-protein)"></i><i style="flex:' + ck + ';background:var(--c-carbs)"></i><i style="flex:' + fk + ';background:var(--c-fat)"></i></div>' : '';
  el.innerHTML = bar + (sum && k ? esc(t('Protein, carbs and fats add up to {k} kcal (target {t}).', { k: sum, t: k })) : '');
};
A.tgCustom = () => { if (S.draft.split !== 'custom') { S.draft.split = 'custom'; const el = document.getElementById('tg_split'); if (el) el.innerHTML = splitButtons(); } A.tgSum(); };
A.saveTargets = async () => {
  const n = id => { const v = parseInt(val(id), 10); return isNaN(v) ? null : v; };
  const patch = { kcal: n('tg_kcal'), protein_g: n('tg_protein'), carbs_g: n('tg_carbs'), fat_g: n('tg_fat'), water_ml: n('tg_water'), steps: n('tg_steps'), split: S.draft.split || 'balanced' };
  busy(true);
  try { await db.saveTargets(S.plan.pairId, patch); S.plan.targets = { pair_id: S.plan.pairId, ...patch }; const c = (S.clients || []).find(x => x.id === S.plan.pairId); if (c) c.targets = S.plan.targets; closeSheet(); toast(t('Saved')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — check the numbers'), 'err'); }
};

// ---- goals
A.goalsScreen = () => go('goals');
SCREENS.goals = () => {
  const gs = (S.plan && S.plan.goals) || [];
  return { title: t('Goals'), body:
    (gs.length ? '<div class="card">' + gs.map(g => '<div class="lrow"><button class="check ' + (g.done ? 'on' : '') + '" onclick="A.toggleGoal(\'' + g.id + '\')">' + (g.done ? I.check : '') + '</button><div class="grow ' + (g.done ? 'mute' : '') + '">' + esc(g.text) + '</div><button class="act" onclick="A.deleteGoal(\'' + g.id + '\')" aria-label="Delete">' + I.x + '</button></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No goals yet') + '</div>') +
    field(t('New goal'), 'goal_text', '', { ph: t('e.g. Run 5 km without stopping') }) + '<button class="btn" onclick="A.addGoal()">' + I.plus + ' ' + t('Add goal') + '</button>' };
};
A.addGoal = async () => {
  const text = val('goal_text'); if (!text) return; busy(true);
  try { const g = await db.addGoal(S.plan.pairId, text, S.plan.goals.length); S.plan.goals.push(g); rerender(); }
  catch (e) { busy(false); toast(t('Could not add — try again'), 'err'); }
};
A.toggleGoal = async (id) => { const g = S.plan.goals.find(x => x.id === id); try { await db.updateGoal(id, { done: !g.done }); g.done = !g.done; rerender(); } catch (e) { toast(t('Could not save — try again'), 'err'); } };
A.deleteGoal = async (id) => { try { await db.deleteGoal(id); S.plan.goals = S.plan.goals.filter(x => x.id !== id); rerender(); } catch (e) { toast(t('Could not remove — try again'), 'err'); } };
