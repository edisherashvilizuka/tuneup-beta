// Tune Up beta — food round C, trainee side: protein streak, the Monday weekly recap, the reminders switch
// and the grocery list from saved meals. Pure reads over logs the app already has.
import { streakBars } from './theme.js';
import { t, esc, unit, isoDate, addDays, weekOf, fmtDay, LANG } from './i18n.js';
import { A, I, rerender, toast, sheet, closeSheet, busy, track } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { effectiveTargets } from './plan.js';
import { itemMacros, fmtServing, foodName, unitLabel } from './food.js';
import { FOODS } from './foods.js';

const n0 = v => Math.round(Number(v) || 0);
function sum(L, kind, key) { return L.filter(l => l.kind === kind).reduce((a, l) => a + (Number(l[key || 'value']) || 0), 0); }

// ---- history (last 35 days) loaded once per session; today's logs come from S.today so the streak is live
export async function loadHistory() {
  if (S.hist35) return S.hist35;
  try { S.hist35 = await db.logsBetween(S.me.id, addDays(isoDate(), -35), addDays(isoDate(), -1)); } catch (e) { S.hist35 = []; }
  return S.hist35;
}
function logsOn(day) { return day === S.today.day ? (S.today.logs || []) : (S.hist35 || []).filter(l => l.day === day); }
function proteinHit(day, target) { return target && sum(logsOn(day), 'food', 'protein_g') >= target * 0.9; }

// consecutive days (ending today or yesterday) with at least 90 % of the protein target
export function proteinStreak() {
  const T = effectiveTargets((S.plan && S.plan.targets) || null); if (!T || !T.protein_g) return 0;
  let d = S.today.day, n = 0;
  if (!proteinHit(d, T.protein_g)) d = addDays(d, -1);   // today may still be in progress
  while (n < 60 && proteinHit(d, T.protein_g)) { n++; d = addDays(d, -1); }
  return n;
}
export function streakChip() {
  const n = proteinStreak(); if (n < 2) return '';
  return '<span class="streak" data-ev="streak" data-v="' + n + '" title="' + esc(t('Days in a row at your protein target')) + '">' + streakBars() + esc(t('{n}-day protein streak', { n })) + '</span>';
}

// ---- weekly recap: shown Monday and Tuesday for last week (Mon–Sun), dismissable
export function recapCard() {
  const wd = new Date(S.today.day + 'T00:00:00').getDay(); if (!(wd === 1 || wd === 2)) return '';
  const T = effectiveTargets((S.plan && S.plan.targets) || null) || {};
  const days = weekOf(addDays(S.today.day, wd === 1 ? -1 : -2));
  const key = 'tuneup-recap-' + days[0]; try { if (localStorage.getItem(key)) return ''; } catch (e) {}
  const L = (S.hist35 || []).filter(l => l.day >= days[0] && l.day <= days[6]);
  if (!L.some(l => l.kind === 'food')) return '';
  const foodDays = days.filter(d => L.some(l => l.day === d && l.kind === 'food'));
  const hit = T.protein_g ? days.filter(d => sum(L.filter(l => l.day === d), 'food', 'protein_g') >= T.protein_g * 0.9).length : null;
  const avgK = foodDays.length ? n0(sum(L, 'food') / foodDays.length) : 0;
  const byFood = {}; L.filter(l => l.kind === 'food' && l.note).forEach(l => { const k = l.note.split(',')[0].trim(); byFood[k] = (byFood[k] || 0) + (Number(l.protein_g) || 0); });
  const best = Object.entries(byFood).sort((a, b) => b[1] - a[1])[0];
  const exercises = L.filter(l => l.kind === 'exercise').length;
  const lines = [
    hit != null ? t('Protein target reached {hit} of 7 days', { hit }) : t('Food logged {n} of 7 days', { n: foodDays.length }),
    avgK ? t('Average {k} kcal a day', { k: avgK }) + (T.kcal ? ' · ' + t('target {k}', { k: T.kcal }) : '') : '',
    best && best[1] >= 10 ? t('Best protein source: {f} ({g} g of protein over the week)', { f: best[0], g: n0(best[1]) }) : '',
    exercises ? (exercises === 1 ? t('1 exercise ticked') : t('{n} exercises ticked', { n: exercises })) : ''
  ].filter(Boolean);
  return '<div class="card soft" id="recap"><div class="row between"><div class="h3">' + t('Last week') + '</div><span class="mute small">' + esc(fmtDay(days[0], 'dm') + ' – ' + fmtDay(days[6], 'dm')) + '</span></div>' +
    '<div class="col" style="gap:4px">' + lines.map(x => '<div>' + esc(x) + '</div>').join('') + '</div>' +
    '<div class="row between"><span class="link" onclick="A.go(\'week\')">' + t('This week') + ' ›</span><span class="link" style="color:var(--a-mute)" onclick="A.recapDone(\'' + key + '\')">' + t('Got it') + '</span></div></div>';
}
A.recapDone = (key) => { try { localStorage.setItem(key, '1'); } catch (e) {} rerender(); };

// ---- reminders switch (More): the afternoon protein nudge and the evening "nothing logged" nudge, max one a day
export function nudgeRow() {
  const on = !(S.traineeProfile && S.traineeProfile.nudges === false);
  return '<div class="lrow"><div class="grow"><div class="t">' + t('Food reminders') + '</div><div class="s">' + esc(on ? t('At most one a day: afternoon protein check, evening if nothing is logged') : t('Off')) + '</div></div><button class="btn ' + (on ? 'sec ' : '') + 'xs" onclick="A.nudges(' + (on ? 'false' : 'true') + ')">' + (on ? t('Turn off') : t('Turn on')) + '</button></div>';
}
A.nudges = async (on) => {
  try { await db.updateTraineeProfile(S.me.id, { nudges: on }); S.traineeProfile = Object.assign({}, S.traineeProfile, { nudges: on }); rerender(); toast(on ? t('Reminders on') : t('Reminders off')); }
  catch (e) { toast(t('Could not save — try again'), 'err'); }
};

// ---- grocery list from the saved meals, for N days, copy or share as text
const GR = () => (S.grocery = S.grocery || { days: 5, picked: null });
export function grocerySheet() {
  const G = GR(); const meals = S.meals || [];
  if (!meals.length) { sheet('<div class="h2">' + t('Grocery list') + '</div><div class="mute">' + t('Save a meal first (Build a meal → Save as a meal) — the list is made from your saved meals.') + '</div>'); return; }
  const ids = meals.map(m => m.id);
  if (!G.picked || G.known !== ids.join()) { G.picked = (G.picked || []).filter(id => ids.includes(id)).concat(ids.filter(id => !(G.known || '').split(',').includes(id))); G.known = ids.join(); }   // a newly saved meal starts ticked
  const rows = aggregate(meals.filter(m => G.picked.includes(m.id)), G.days);
  sheet('<div class="h2">' + t('Grocery list') + '</div><div class="mute">' + t('Your saved meals, multiplied for the days you pick.') + '</div>' +
    '<div class="chips">' + [3, 5, 7].map(d => '<button class="chip ' + (G.days === d ? 'on' : '') + '" onclick="A.groceryDays(' + d + ')">' + d + ' ' + t('days') + '</button>').join('') + '</div>' +
    '<div class="chips">' + meals.map(m => '<button class="chip ' + (G.picked.includes(m.id) ? 'on' : '') + '" onclick="A.groceryPick(\'' + m.id + '\')">' + esc(m.name) + '</button>').join('') + '</div>' +
    '<div class="card" style="gap:0;padding:4px 14px" id="grocery">' + (rows.length ? rows.map(r => '<div class="food"><div class="grow"><div class="n">' + esc(r.name) + '</div></div><div class="kc">' + esc(r.amount) + '</div></div>').join('') : '<div class="mute">' + t('Pick at least one meal.') + '</div>') + '</div>' +
    '<div class="btn-row"><button class="btn sec" onclick="A.groceryCopy()">' + I.copy + ' ' + t('Copy') + '</button>' + (navigator.share ? '<button class="btn" onclick="A.groceryShare()">' + t('Share') + '</button>' : '') + '</div>');
}
function aggregate(meals, days) {
  const acc = {};
  for (const m of meals) for (const it of (m.items || [])) {
    const f = it.id ? FOODS.find(x => x.id === it.id) : null;   // table foods are named in the reader's language, whatever language the meal was saved in
    const k = f ? f.id : it.name; const a = acc[k] || (acc[k] = { name: f ? foodName(f) : it.name, qty: 0, unit: f ? (it.unit_kind === 'g' ? unit('g') : unitLabel(f.unit)) : it.unit, unit_kind: it.unit_kind, grams: it.grams });
    a.qty += (Number(it.qty) || 0) * days;
  }
  return Object.values(acc).map(a => ({ name: a.name, amount: a.unit_kind === 'g' ? Math.round(a.qty) + ' ' + a.unit : (Math.round(a.qty * 10) / 10) + ' ' + a.unit + (a.grams ? ' (' + Math.round(a.grams * a.qty) + ' ' + unit('g') + ')' : '') }));
}
function groceryText() { const G = GR(); const rows = aggregate((S.meals || []).filter(m => G.picked.includes(m.id)), G.days); return t('Grocery list') + ' · ' + G.days + ' ' + t('days') + '\n' + rows.map(r => '• ' + r.name + ' — ' + r.amount).join('\n'); }
A.groceryDays = (d) => { GR().days = d; grocerySheet(); };
A.groceryPick = (id) => { const G = GR(); G.picked = G.picked.includes(id) ? G.picked.filter(x => x !== id) : G.picked.concat([id]); grocerySheet(); };
A.groceryCopy = async () => { try { await navigator.clipboard.writeText(groceryText()); toast(t('Copied')); track('food', { what: 'grocery' }); } catch (e) { toast(t('Could not copy'), 'err'); } };
A.groceryShare = async () => { try { await navigator.share({ text: groceryText() }); track('food', { what: 'grocery' }); } catch (e) {} };
A.grocerySheet = grocerySheet;
