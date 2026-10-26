// Tune Up beta — trainee food tools (round B): the Foods explorer (foods ranked best→worst for one macro, with
// filters), the meal builder (a tray that shows today's remaining targets closing, "Fill the gap" suggestions,
// saved meals) and the food preferences used by all of them. Logging itself stays in log.js.
import { t, esc, unit, isoDate, LANG, macroShort } from './i18n.js';
import { SCREENS, A, I, go, back, rerender, toast, sheet, closeSheet, busy, track, field, val } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { FOODS, UNITS } from './foods.js';
import { macroTotals, reloadTodayLogs } from './log.js';
import { effectiveTargets } from './plan.js';

const n0 = v => Math.round(Number(v) || 0);
const r1 = v => Math.round(Number(v) * 10) / 10;
export const MACROS = { protein_g: 'p', carbs_g: 'c', fat_g: 'f', kcal: 'k' };
const FILTERS = ['geo', 'cheap', 'nocook', 'quick', 'veg'];
const FILTER_LABEL = { geo: 'Georgian', cheap: 'Cheap', nocook: 'No cooking', quick: 'Quick', veg: 'Vegetarian', mine: 'Logged before' };
const NEVER = ['sweet', 'alcohol'];   // never ranked as a "source" of anything

export function foodName(f) { return LANG.cur === 'ka' ? f.ka : f.en; }
export function unitLabel(u) { const x = UNITS[u] || UNITS.piece; return x[LANG.cur === 'ka' ? 'ka' : 'en']; }
// one usual serving of a table food as an item the logging code understands
export function servingOf(f, mult) {
  const m = mult || 1;
  if (f.unit === 'g') return { id: f.id, name: foodName(f), qty: Math.round(f.g * m), unit: unitLabel('g'), unit_kind: 'g', grams: 1, per: { kcal: f.k / 100, protein_g: f.p / 100, carbs_g: f.c / 100, fat_g: f.f / 100 }, source: 'table' };
  return { id: f.id, name: foodName(f), qty: m, unit: unitLabel(f.unit), unit_kind: 'count', grams: f.g, per: { kcal: r1(f.k * f.g / 100), protein_g: r1(f.p * f.g / 100), carbs_g: r1(f.c * f.g / 100), fat_g: r1(f.f * f.g / 100) }, source: 'table' };
}
export function itemMacros(it) { const q = Number(it.qty) || 0; return { kcal: (Number(it.per.kcal) || 0) * q, protein_g: (Number(it.per.protein_g) || 0) * q, carbs_g: (Number(it.per.carbs_g) || 0) * q, fat_g: (Number(it.per.fat_g) || 0) * q }; }
function sumItems(items) { return items.reduce((a, it) => { const m = itemMacros(it); for (const k in m) a[k] += m[k]; return a; }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }); }
export function targets() { return (S.plan && effectiveTargets(S.plan.targets)) || {}; }
export function leftToday(extra) {
  const T = targets(), eaten = macroTotals(S.today ? S.today.logs || [] : []), add = extra ? sumItems(extra) : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const out = {}; for (const k of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) out[k] = T[k] ? T[k] - eaten[k] - add[k] : null; return out;
}

// ---- preferences: what the trainee cannot or does not eat (My answers) → a filter over the table
export function prefs() { const tp = S.traineeProfile || {}; return { style: tp.eating_style || '', avoid: String(tp.allergies || '').toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 1) }; }
export function allowed(f, P) {
  P = P || prefs(); const tags = f.tags || [];
  if (P.style === 'vegetarian' && !tags.includes('veg')) return false;
  if (P.style === 'vegan' && !tags.includes('vegan')) return false;
  if (P.style === 'nopork' && tags.includes('pork')) return false;
  const hay = (f.en + ' ' + f.ka + ' ' + f.id + ' ' + tags.join(' ')).toLowerCase();
  const GROUPS = { nuts: 'nuts', walnut: 'nuts', ნიგოზი: 'nuts', dairy: 'dairy', milk: 'dairy', lactose: 'dairy', რძე: 'dairy', gluten: 'gluten', wheat: 'gluten', bread: 'gluten', egg: 'egg', კვერცხი: 'egg', fish: 'fish', თევზი: 'fish', pork: 'pork', ღორი: 'pork', meat: 'meat', ხორცი: 'meat' };
  for (const a of P.avoid) { const g = GROUPS[a]; if ((g && tags.includes(g)) || hay.includes(a)) return false; }
  return true;
}

// ---- ranking
function score(f, macro) { if (macro === 'kcal') return -f.k; return f.k ? f[MACROS[macro]] / f.k * 100 : 0; }
export function ranked(macro, filters, recents) {
  const P = prefs(); const F = new Set(filters || []);
  return FOODS.filter(f => !f.tags.some(x => NEVER.includes(x)) && !(macro !== 'kcal' && f.tags.includes('drink')) && allowed(f, P))
    .filter(f => [...F].every(x => x === 'mine' ? (recents || new Set()).has(f.id) : f.tags.includes(x)))
    .filter(f => macro === 'kcal' || f[MACROS[macro]] > 0)
    .sort((a, b) => score(b, macro) - score(a, macro));
}
// table foods the trainee logged in the last weeks (by name match)
export function recentIds() {
  const notes = (S.foodRecents || []).map(l => String(l.note || '').toLowerCase());
  return new Set(FOODS.filter(f => notes.some(n => n.includes(f.en.toLowerCase().split(' (')[0]) || n.includes(f.ka.split(' (')[0]))).map(f => f.id));
}

// ---- the explorer screen
const EX = () => (S.explore = S.explore || { macro: 'protein_g', filters: [] });
export function trayItems() { S.meal = S.meal || { items: [] }; return S.meal.items; }
SCREENS.foods = ({ macro }) => {
  const E = EX(); if (macro) E.macro = macro;
  const list = ranked(E.macro, E.filters, recentIds()).slice(0, 40); const best = list.length ? score(list[0], E.macro) : 1;
  const left = leftToday(trayItems());
  const CAP = { protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fats', kcal: 'Light' };
  const seg = '<div class="segc" style="margin-bottom:10px">' + ['protein_g', 'carbs_g', 'fat_g', 'kcal'].map(k => '<button class="' + (E.macro === k ? 'on' : '') + '" onclick="A.exMacro(\'' + k + '\')">' + esc(macroShort(CAP[k])) + '</button>').join('') + '</div>';
  const sub = E.macro === 'kcal' ? t('Lightest foods — fewest calories per 100 g') : t('ranked by {m} per 100 kcal', { m: macroShort(E.macro) });
  const chipsHtml = '<div class="chips">' + FILTERS.concat(['mine']).map(x => '<button class="chip ' + (E.filters.includes(x) ? 'on' : '') + '" onclick="A.exFilter(\'' + x + '\')">' + esc(t(FILTER_LABEL[x])) + '</button>').join('') + '</div>';
  const rows = list.map((f, i) => {
    const it = servingOf(f); const m = itemMacros(it); const v = E.macro === 'kcal' ? f.k : f[MACROS[E.macro]]; const pct = E.macro === 'kcal' ? Math.max(6, Math.round(100 - Math.min(100, f.k / 4))) : Math.max(6, Math.round(score(f, E.macro) / best * 100));
    const inTray = trayItems().some(x => x.id === f.id);
    return '<div class="frow"><div class="rank">' + (i + 1) + '</div><div class="grow" style="min-width:0"><div class="row between"><div class="t">' + esc(foodName(f)) + '</div><div class="mono small" style="color:var(--a-accent)">' + (E.macro === 'kcal' ? n0(f.k) + ' ' + unit('kcal') + ' / 100 ' + unit('g') : r1(score(f, E.macro)) + ' ' + unit('g') + ' / 100 ' + unit('kcal')) + '</div></div>' +
      '<div class="bar" style="height:5px;margin-top:5px"><i style="width:' + pct + '%"></i></div>' +
      '<div class="mute small" style="margin-top:4px">' + esc(fmtServing(it)) + ' · ' + n0(m.protein_g) + ' ' + unit('g') + ' ' + t('P') + ' · ' + n0(m.kcal) + ' ' + unit('kcal') + (f.tags.includes('nocook') ? ' · ' + t('no cooking') : '') + '</div></div>' +
      '<button class="act" aria-label="' + esc(t('Add to meal')) + '" onclick="A.exAdd(\'' + f.id + '\')" style="' + (inTray ? 'background:var(--a-accent);color:#fff;border-color:var(--a-accent)' : '') + '">' + (inTray ? I.check : I.plus) + '</button></div>';
  }).join('');
  const tray = trayItems().length ? '<div class="tray" onclick="A.go(\'meal\')"><div class="grow"><div class="small" style="color:#C9C5BC">' + (trayItems().length === 1 ? t('Your meal · 1 food') : t('Your meal · {n} foods', { n: trayItems().length })) + '</div><div style="font-weight:700;font-size:14px">' + leftLine(left) + '</div></div><span class="btn sm" style="width:auto">' + t('Build a meal') + '</span></div>' : '';
  return { title: t('Foods'), sub, body: seg + chipsHtml + '<div class="col" style="gap:6px;margin-top:10px">' + (rows || '<div class="card flat mute">' + t('Nothing matches these filters.') + '</div>') + '</div>', footer: tray };
};
function leftLine(left) {
  if (left.protein_g == null) return t('No targets set yet');
  return left.protein_g > 0 ? t('{g} g protein still left after this', { g: n0(left.protein_g) }) : t('Protein target reached ✓');
}
export function fmtServing(it) { return (it.unit_kind === 'g' ? it.qty + ' ' + it.unit : String(Math.round(it.qty * 100) / 100) + ' ' + it.unit + (it.grams ? ' · ' + t('about {g} g', { g: Math.round(it.grams * it.qty) }) : '')); }
A.exMacro = (k) => { EX().macro = k; rerender(); };
A.exFilter = (x) => { const E = EX(); E.filters = E.filters.includes(x) ? E.filters.filter(y => y !== x) : E.filters.concat([x]); rerender(); };
A.exAdd = (id) => {
  const items = trayItems(); const f = FOODS.find(x => x.id === id); if (!f) return;
  const i = items.findIndex(x => x.id === id); if (i >= 0) items.splice(i, 1); else items.push(servingOf(f));
  track('food', { what: 'tray' }); rerender();
};

// ---- the meal builder
SCREENS.meal = () => {
  const items = trayItems(); const T = targets(); const eaten = macroTotals(S.today ? S.today.logs || [] : []); const add = sumItems(items);
  const bars = ['kcal', 'protein_g', 'carbs_g', 'fat_g'].map(k => {
    const tg = T[k]; const col = k === 'kcal' ? 'var(--a-ink)' : k === 'protein_g' ? 'var(--a-accent)' : k === 'carbs_g' ? 'var(--a-carb)' : 'var(--a-fat)';
    const pe = tg ? Math.min(100, eaten[k] / tg * 100) : 0, pa = tg ? Math.min(100 - pe, add[k] / tg * 100) : 0; const left = tg ? n0(tg - eaten[k] - add[k]) : null;
    const u = k === 'kcal' ? unit('kcal') : unit('g');
    return '<div class="gauge2"><div class="row between small"><span style="font-weight:700;color:' + col + '">' + esc(macroShort({ kcal: 'Calories', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fats' }[k])) + '</span><span class="mono mute">+' + n0(add[k]) + ' ' + u + (tg ? ' · <b style="color:var(--a-ink)">' + (left >= 0 ? left + ' ' + u + ' ' + t('left') : t('{n} over', { n: -left + ' ' + u })) + '</b>' : '') + '</span></div>' +
      '<div class="gb"><i style="width:' + pe.toFixed(1) + '%;background:' + col + '"></i><i style="width:' + pa.toFixed(1) + '%;background:' + col + ';opacity:.45"></i></div></div>';
  }).join('');
  const rows = items.map((it, i) => { const m = itemMacros(it); return '<div class="food"><div class="grow" style="min-width:0"><div class="n">' + esc(it.name) + ' · ' + esc(fmtServing(it)) + '</div><div class="m">' + n0(m.kcal) + ' ' + unit('kcal') + ' · ' + t('P') + ' ' + n0(m.protein_g) + ' · ' + t('C') + ' ' + n0(m.carbs_g) + ' · ' + t('F') + ' ' + n0(m.fat_g) + ' ' + unit('g') + '</div></div>' +
    '<div class="stepper"><button type="button" aria-label="' + t('Less') + '" onclick="A.mealStep(' + i + ',-1)">−</button><button type="button" aria-label="' + t('More') + '" onclick="A.mealStep(' + i + ',1)">+</button></div><button class="act" style="width:28px;height:28px;border:0" onclick="A.mealDrop(' + i + ')" aria-label="' + t('Remove') + '">' + I.x + '</button></div>'; }).join('');
  const sugg = suggestions(items).map((s, i) => '<button class="sug" onclick="A.mealSuggest(' + i + ')"><div class="grow" style="min-width:0"><div class="t">' + esc(s.label) + '</div><div class="mute small">' + esc(s.sub) + '</div></div><span class="small" style="font-weight:700;white-space:nowrap;color:' + (s.ok === 'all' || s.ok === 'protein' ? 'var(--a-green)' : 'var(--a-mute)') + '">' + esc(s.ok === 'all' ? t('all targets ✓') : s.ok === 'protein' ? t('protein ✓') : s.ok) + '</span></button>').join('');
  S.mealSugg = suggestions(items);
  const body = '<div class="card">' + '<div class="h3">' + t('What is left today, with this meal') + '</div>' + bars + '<div class="mute small">' + t('Solid = eaten today · light = this meal') + '</div></div>' +
    '<div class="card">' + (rows || '<div class="mute">' + t('Nothing in the meal yet.') + '</div>') + '<span class="link" style="align-self:flex-start" onclick="A.go(\'foods\')">' + I.plus + ' ' + t('Add from Foods') + '</span></div>' +
    (T.protein_g ? '<div class="section-title"><span class="eyebrow">' + t('Fill the gap') + '</span><span class="mute small">' + t('Tune suggests') + '</span></div>' + (sugg ? '<div class="col" style="gap:6px">' + sugg + '</div>' : '<div class="card flat mute">' + t('Targets are covered — nothing to add.') + '</div>') : '') +
    (items.length ? '<div class="btn-row" style="margin-top:12px"><button class="btn sec" onclick="A.mealSaveSheet()">' + t('Save as a meal') + '</button><button class="btn" onclick="A.mealLog()">' + t('Log this meal') + '</button></div>' : '');
  return { title: t('Build a meal'), sub: items.length ? n0(add.kcal) + ' ' + unit('kcal') + ' · ' + n0(add.protein_g) + ' ' + unit('g') + ' ' + t('protein') : '', body };
};
A.mealStep = (i, d) => { const it = trayItems()[i]; if (!it) return; const step = it.unit_kind === 'g' ? (it.qty >= 100 ? 25 : 10) : (it.qty >= 2 ? 1 : 0.5); it.qty = Math.max(it.unit_kind === 'g' ? 10 : 0.5, r1(it.qty + d * step)); rerender(); };
A.mealDrop = (i) => { trayItems().splice(i, 1); rerender(); };
A.mealSuggest = (i) => { const s = (S.mealSugg || [])[i]; if (!s) return; const items = trayItems(); const j = items.findIndex(x => x.id === s.item.id); if (j >= 0 && s.replace) items[j] = s.item; else if (j >= 0) items[j].qty = r1(items[j].qty + s.item.qty); else items.push(s.item); rerender(); };
A.mealLog = async () => {
  const items = trayItems(); if (!items.length) return; busy(true);
  try {
    for (const it of items) { const m = itemMacros(it); await db.addLog(S.me.id, S.today.day, 'food', Math.round(m.kcal), { protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, note: (it.name + ', ' + fmtServing(it).split(' · ')[0]).slice(0, 120) }); }
    track('log', { kind: 'food', how: 'meal', n: items.length }); S.meal = { items: [] }; await reloadTodayLogs(); toast(t('Logged {n} foods', { n: items.length })); A.setTab('home');
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.mealSaveSheet = () => sheet('<div class="h2">' + t('Save as a meal') + '</div><div class="mute">' + t('You can log it again with one tap from Add food.') + '</div>' + field(t('Name'), 'meal_name', '', { ph: t('e.g. Post-gym plate') }) + '<button class="btn" onclick="A.mealSave()">' + t('Save') + '</button>');
A.mealSave = async () => {
  const name = val('meal_name').slice(0, 60); if (!name) { toast(t('Give the meal a name.'), 'err'); return; }
  const items = trayItems(); const m = sumItems(items); busy(true);
  try { await db.saveMeal(S.me.id, name, items, m); S.meals = null; closeSheet(); toast(t('Saved')); busy(false); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// ---- "Fill the gap": table foods (allowed by the preferences) whose usual serving closes what is left, protein first
export function suggestions(items) {
  const left = leftToday(items); if (left.protein_g == null) return [];
  if (left.protein_g <= 5 && (left.kcal == null || left.kcal <= 80)) return [];
  const P = prefs(); const rec = recentIds(); const out = [];
  for (const f of FOODS) {
    if (f.tags.some(x => NEVER.includes(x) || x === 'drink') || !allowed(f, P)) continue;
    for (const mult of (f.unit === 'g' ? [0.5, 1, 1.5, 2] : [0.5, 1, 2, 3])) {
      const it = servingOf(f, mult); const m = itemMacros(it);
      if (m.kcal < 40) continue;
      const overK = left.kcal != null ? Math.max(0, m.kcal - left.kcal) : 0;
      const pGap = Math.abs(left.protein_g - m.protein_g) / Math.max(20, left.protein_g);
      const cPen = left.carbs_g != null ? Math.max(0, m.carbs_g - Math.max(0, left.carbs_g)) / 60 : 0, fPen = left.fat_g != null ? Math.max(0, m.fat_g - Math.max(0, left.fat_g)) / 25 : 0;
      const cost = pGap * 2 + overK / 150 * 3 + cPen + fPen + (mult > 2 ? 0.4 : 0) - (rec.has(f.id) ? 0.35 : 0) - (f.tags.includes('geo') ? 0.1 : 0);
      out.push({ f, it, m, cost, overK });
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  const picked = []; const seen = new Set();
  for (const s of out) { if (seen.has(s.f.id)) continue; seen.add(s.f.id); picked.push(s); if (picked.length === 3) break; }
  return picked.map(s => {
    const after = leftToday(items.concat([s.it]));
    const ok = after.protein_g <= Math.max(5, left.protein_g * 0.1) && (after.kcal == null || after.kcal >= -80) && (after.carbs_g == null || after.carbs_g >= -25) && (after.fat_g == null || after.fat_g >= -12) ? 'all' : after.protein_g <= Math.max(5, left.protein_g * 0.1) ? 'protein' : t('{g} g short', { g: n0(after.protein_g) });
    return { item: s.it, label: t('Add {what}', { what: s.it.name + ' · ' + fmtServing(s.it).split(' · ')[0] }), sub: '+' + n0(s.m.kcal) + ' ' + unit('kcal') + ' · +' + n0(s.m.protein_g) + ' ' + unit('g') + ' ' + t('protein') + (s.m.carbs_g >= 15 ? ' · +' + n0(s.m.carbs_g) + ' ' + unit('g') + ' ' + t('carbs') : '') + (s.m.fat_g >= 10 ? ' · +' + n0(s.m.fat_g) + ' ' + unit('g') + ' ' + t('fats') : ''), ok };
  });
}

// ---- saved meals (used by the Add food sheet in log.js)
export async function loadMeals() { if (S.meals) return S.meals; try { S.meals = await db.listMeals(S.me.id); } catch (e) { S.meals = []; } return S.meals; }
A.mealUse = async (id) => {
  const m = (S.meals || []).find(x => x.id === id); if (!m) return; busy(true);
  try {
    for (const it of m.items || []) { const x = itemMacros(it); await db.addLog(S.me.id, S.today.day, 'food', Math.round(x.kcal), { protein_g: x.protein_g, carbs_g: x.carbs_g, fat_g: x.fat_g, note: (it.name + ', ' + fmtServing(it).split(' · ')[0]).slice(0, 120) }); }
    db.touchMeal(id).catch(() => {}); track('log', { kind: 'food', how: 'saved-meal' }); closeSheet(); await reloadTodayLogs(); toast(t('Logged {n} foods', { n: (m.items || []).length }));
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.mealForget = async (id, el) => { if (el && !el.dataset.armed) { el.dataset.armed = '1'; el.textContent = t('Remove?'); setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = t('Remove'); } }, 4000); return; } try { await db.deleteMeal(id); S.meals = (S.meals || []).filter(x => x.id !== id); A.foodSheet(); } catch (e) { toast(t('Could not remove'), 'err'); } };
// open the meal builder with one table food already in (from Tune or from Today)
export function openFoods(macro) { go('foods', { macro: macro || 'protein_g' }); }
A.openFoods = openFoods;
