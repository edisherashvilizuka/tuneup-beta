// Tune Up beta — trainee daily logging (food, water, steps, weight, evening check-in) + the week view.
import { t, esc, unit, dayName, weekOf, isoDate, weekdayOf, fmtDay, mood, MOODS, exName, addDays, LANG, macroShort } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, sheet, closeSheet, field, val, busy, track } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { effectiveTargets } from './plan.js';
import { loadMeals } from './food.js';

// ---- helpers over S.today.logs (today) or any list of logs
export function sumDay(logs, kind, key) { return logs.filter(l => l.kind === kind).reduce((a, l) => a + (Number(l[key || 'value']) || 0), 0); }
export function oneOf(logs, kind) { return logs.find(l => l.kind === kind) || null; }
function tg(k) { const T = S.plan && effectiveTargets(S.plan.targets); return (T && T[k]) || 0; }
function bar(v, max, cls) { const pct = max ? Math.min(100, Math.round(v / max * 100)) : 0; return '<div class="bar"><i class="' + (cls || '') + '" style="width:' + pct + '%"></i></div>'; }
function n0(v) { return Math.round(Number(v) || 0); }
async function reloadToday() { S.today.logs = await db.logsForDay(S.me.id, S.today.day); rerender(); }
export const reloadTodayLogs = reloadToday;
function fail(e) { toast(t('Could not save — try again'), 'err'); }
// two-tap confirm for small destructive buttons: the first tap asks, the second (within 4 s) does it
export function armed(el, label) {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1'; const old = el.innerHTML; el.innerHTML = '<span class="small" style="font-weight:700;color:var(--a-red);white-space:nowrap">' + esc(label) + '</span>'; el.style.width = 'auto';
  setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.innerHTML = old; el.style.width = ''; } }, 4000);
  return false;
}
// the last weigh-in before today (for the "are you sure?" check)
async function lastWeight() {
  const from = addDays(S.today.day, -60), to = addDays(S.today.day, -1);
  const L = (await db.logsBetween(S.me.id, from, to)).filter(l => l.kind === 'weight').sort((a, b) => a.day < b.day ? -1 : 1);
  const w = L.pop(); if (w) return { v: Number(w.value), day: w.day };
  const tp = S.traineeProfile; return tp && tp.weight_kg ? { v: Number(tp.weight_kg), day: (tp.updated_at || S.today.day).slice(0, 10) } : null;
}

// ---- today's log cards (shown on the Today tab under the workout)
const MAC = [['kcal', 'kcal', 'Calories', 'var(--a-ink)'], ['protein_g', 'g', 'Protein', 'var(--a-accent)'], ['carbs_g', 'g', 'Carbs', 'var(--a-carb)'], ['fat_g', 'g', 'Fats', 'var(--a-fat)']];
export function macroTotals(L) { const F = L.filter(l => l.kind === 'food'); const sum = k => F.reduce((a, l) => a + (Number(l[k]) || 0), 0); return { kcal: sum('value'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') }; }
// the fuel gauge: one ring per macro; a ring fills towards the coach's target and shows what is left inside
function ring(key, uni, label, color, v, max) {
  const C = 2 * Math.PI * 26; const pct = max ? Math.min(1, v / max) : 0; const left = max ? Math.max(0, Math.round(max - v)) : null;
  const inner = max ? '<text x="32" y="30" text-anchor="middle" class="rv">' + (left > 0 ? left : I_CHECK) + '</text><text x="32" y="42" text-anchor="middle" class="rs">' + (left > 0 ? esc(t('left')) : esc(t('done'))) + '</text>'
    : '<text x="32" y="36" text-anchor="middle" class="rv">' + n0(v) + '</text>';
  return '<div class="f1" role="button" tabindex="0" onclick="A.openFoods(\'' + key + '\')" onkeydown="if(event.key===\'Enter\')this.click()" aria-label="' + esc(t(label)) + ' ' + n0(v) + (max ? ' / ' + max : '') + ' ' + esc(unit(uni)) + '">' +
    '<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--a-line2)" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (C * pct).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 32 32)"' + (max && pct >= 1 ? ' opacity=".55"' : '') + '/>' + inner + '</svg>' +
    '<div class="k" style="color:' + color + '">' + esc(macroShort(label)) + '</div><div class="s">' + n0(v) + (max ? ' / ' + max : '') + ' ' + esc(unit(uni)) + '</div></div>';
}
const I_CHECK = '✓';
export function fuelGauge(L) {
  const m = macroTotals(L); const any = MAC.some(x => tg(x[0]));
  return '<div class="fuel">' + MAC.map(x => ring(x[0], x[1], x[2], x[3], m[x[0]], tg(x[0]))).join('') + '</div>' +
    '<div class="mute small" style="text-align:center">' + (any ? t('Tap a ring to see the best foods for it') : t('Your coach has not set daily targets yet.')) + '</div>';
}
function macroLine(f, sep) { return [f.protein_g != null && f.protein_g !== '' ? t('P') + ' ' + n0(f.protein_g) : '', f.carbs_g != null && f.carbs_g !== '' ? t('C') + ' ' + n0(f.carbs_g) : '', f.fat_g != null && f.fat_g !== '' ? t('F') + ' ' + n0(f.fat_g) : ''].filter(Boolean).join(sep || ' · '); }
export function logCards() {
  const L = S.today.logs || [];
  const water = sumDay(L, 'water');
  const steps = oneOf(L, 'steps'), weight = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
  const foods = L.filter(l => l.kind === 'food');
  const food = '<div class="card"><div class="row between"><div class="h3">' + t('Food') + '</div><span class="mute small">' + (foods.length ? (foods.length === 1 ? t('1 entry') : t('{n} entries', { n: foods.length })) : '') + '</span></div>' + fuelGauge(L) +
    (foods.length ? '<div>' + foods.map(f => '<div class="food"><div><div class="n">' + esc(f.note || t('Meal')) + (f.reaction === 'up' ? ' <span title="' + esc(t('Your coach liked this')) + '">👍</span>' : '') + '</div><div class="m">' + esc(macroLine(f)) + (macroLine(f) ? ' ' + unit('g') : '') + '</div></div><div class="kc">' + n0(f.value) + '</div><button class="act" style="width:28px;height:28px;border:0" onclick="A.delLog(\'' + f.id + '\',this)" aria-label="' + t('Remove') + '">' + I.x + '</button></div>').join('') + '</div>' : '') +
    '<button class="btn sec sm" onclick="A.foodSheet()">' + I.plus + ' ' + t('Add food') + '</button></div>';
  const wat = '<div class="card"><div class="row between"><div class="h3">' + t('Water') + '</div><span class="mute small">' + (water / 1000).toFixed(water % 1000 ? 2 : 1).replace(/\.?0+$/, '') + (tg('water_ml') ? ' / ' + (tg('water_ml') / 1000) : '') + ' ' + unit('L') + '</span></div>' + (tg('water_ml') ? bar(water, tg('water_ml'), 'blue') : '') +
    '<div class="btn-row"><button class="btn sec sm" onclick="A.addWater(250)">+ 250 ' + unit('ml') + '</button><button class="btn sec sm" onclick="A.addWater(500)">+ 500 ' + unit('ml') + '</button>' + (water ? '<button class="btn sec sm" onclick="A.undoWater()" aria-label="Undo">' + I.x + '</button>' : '') + '</div></div>';
  const tiles = '<div class="grid2"><div class="tile" role="button" tabindex="0" style="cursor:pointer" onclick="A.numSheet(\'steps\')" onkeydown="if(event.key===\'Enter\')this.click()"><div class="stat"><div class="v">' + (steps ? n0(steps.value) : '—') + '</div><div class="k">' + t('steps') + (tg('steps') ? ' · ' + t('goal') + ' ' + tg('steps') : '') + '</div></div>' + (tg('steps') && steps ? bar(steps.value, tg('steps'), 'amb') : '') + '</div>' +
    '<div class="tile" role="button" tabindex="0" style="cursor:pointer" onclick="A.numSheet(\'weight\')" onkeydown="if(event.key===\'Enter\')this.click()"><div class="stat"><div class="v">' + (weight ? Number(weight.value) : '—') + '</div><div class="k">' + unit('kg') + ' · ' + t('weigh-in') + '</div></div></div></div>';
  // evening check-in: the moods sit on the card, one tap saves; the line for the coach is optional, after
  const moods = '<div class="chips mood-row">' + Object.keys(MOODS).map(k => '<button class="chip ' + (ci && Number(ci.value) === Number(k) ? 'on' : '') + '" onclick="A.quickMood(' + k + ')" aria-pressed="' + (ci && Number(ci.value) === Number(k) ? 'true' : 'false') + '">' + esc(t(MOODS[k])) + '</button>').join('') + '</div>';
  const chk = '<div class="card soft"><div class="h3">' + t('Evening check-in') + '</div>' + (ci ? '' : '<div class="mute">' + t('How was your day? Tap one.') + '</div>') + moods +
    (ci ? (ci.note ? '<div class="row between" style="gap:10px;align-items:flex-start"><span class="mute grow">' + esc(ci.note) + '</span><span class="link" onclick="A.checkinSheet()">' + t('Edit') + '</span></div>' : '<span class="link" style="align-self:flex-start" onclick="A.checkinSheet()">' + I.plus + ' ' + t('Add a line for your coach') + '</span>') : '') + '</div>';
  return '<div class="section-title"><span class="eyebrow">' + t('Today\'s log') + '</span><span class="link" onclick="A.go(\'week\')">' + t('This week') + ' ›</span></div>' + food + wat + tiles + chk;
}

// ---- food: smart entry. The trainee types what they ate; the estimator (built-in table first, AI for the rest)
// fills calories, protein, carbs and fats per food with a portion they can adjust; one tap logs it all.
const FD = () => (S.draft.food = S.draft.food || { items: [], state: 'idle', text: '', recents: null });
const r1 = v => Math.round(Number(v) * 10) / 10;
const r3 = v => Math.round(Number(v) * 1000) / 1000;   // per-gram values keep more precision
function fmtQty(q) { return String(Math.round(q * 100) / 100); }
function itemTotals(it) { const q = Number(it.qty) || 0; const m = {}; ['kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(k => { m[k] = r1((Number(it.per[k]) || 0) * q); }); return m; }
function sourceChip(src) { return src === 'table' ? '<span class="chip sm grn">' + t('from table') + '</span>' : src === 'recent' ? '<span class="chip sm">' + t('logged before') + '</span>' : '<span class="chip sm amb">' + t('estimate') + '</span>'; }
A.foodSheet = () => {
  S.draft.food = { items: [], state: 'idle', text: '', recents: null };
  sheet('<div class="h2">' + t('Add food') + '</div>' +
    '<div class="row" style="gap:8px;align-items:flex-end">' + field(t('What did you eat?'), 'fd_text', '', { ph: t('e.g. 5 khinkali, chicken with rice, coffee with milk'), attrs: ' autocomplete="off" enterkeyhint="done" oninput="A.foodTyped()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();A.foodTyped(true)}"' }).replace('<div class="field">', '<div class="field grow">') +
    '<button class="act camera" onclick="document.getElementById(\'fd_photo\').click()" aria-label="' + esc(t('Photo of your plate')) + '">' + I.camera + '</button><input type="file" id="fd_photo" accept="image/*" capture="environment" style="display:none" onchange="A.foodPhoto(this)"></div>' +
    '<div class="mute small">' + t('Type it, or take a photo of the plate — the numbers fill in by themselves.') + '</div>' +
    '<div id="fd_sug"></div><div id="fd_recent"></div>' +
    '<div class="row between" style="flex-wrap:wrap;gap:8px 16px"><span class="link" onclick="A.foodManual()">' + t('Enter the numbers myself') + '</span><span class="link" onclick="A.closeSheet();A.openFoods(\'protein_g\')">' + t('Browse foods') + ' ›</span></div>');
  const el = document.getElementById('fd_text'); if (el) el.focus();
  loadRecents();
};
async function loadRecents() {
  const D = FD();
  try {
    const L = (await db.logsBetween(S.me.id, addDays(S.today.day, -21), S.today.day)).filter(l => l.kind === 'food' && l.note).sort((a, b) => a.day < b.day ? 1 : -1);
    S.foodRecents = L; D.meals = await loadMeals();
    const seen = new Set(); D.recents = [];
    for (const l of L) { const k = l.note.toLowerCase(); if (seen.has(k)) continue; seen.add(k); D.recents.push(l); if (D.recents.length >= 6) break; }
  } catch (e) { D.recents = []; }
  renderRecents();
}
function renderRecents() {
  const D = FD(); const el = document.getElementById('fd_recent'); if (!el) return;
  if (D.items.length || ((!D.recents || !D.recents.length) && !(D.meals && D.meals.length))) { el.innerHTML = ''; return; }
  const meals = (D.meals && D.meals.length) ? '<div class="section-title"><span class="eyebrow">' + t('My meals') + '</span></div><div class="card" style="padding:4px 14px;gap:0">' + D.meals.map(m => '<div class="food"><div class="grow" style="min-width:0;cursor:pointer" onclick="A.mealUse(\'' + m.id + '\')"><div class="n">' + esc(m.name) + '</div><div class="m">' + esc((m.items || []).map(x => x.name).join(', ')) + '</div></div><div class="kc" style="cursor:pointer" onclick="A.mealUse(\'' + m.id + '\')">' + n0(m.kcal) + '</div><span class="link small" onclick="A.mealForget(\'' + m.id + '\',this)">' + t('Remove') + '</span></div>').join('') + '</div>' : '';
  if (!D.recents || !D.recents.length) { el.innerHTML = meals; return; }
  el.innerHTML = meals + '<div class="section-title"><span class="eyebrow">' + t('Logged before') + '</span></div><div class="card" style="padding:4px 14px;gap:0">' +
    D.recents.map((l, i) => '<div class="food" style="cursor:pointer" onclick="A.foodRecent(' + i + ')"><div><div class="n">' + esc(l.note) + '</div><div class="m">' + esc(macroLine(l)) + (macroLine(l) ? ' ' + unit('g') : '') + '</div></div><div class="kc">' + n0(l.value) + '</div><span class="mute">' + I.plus + '</span></div>').join('') + '</div>';
}
A.foodRecent = (i) => {
  const D = FD(); const l = (D.recents || [])[i]; if (!l) return;
  D.items = [{ name: l.note, qty: 1, unit: t('serving'), unit_kind: 'count', grams: null, per: { kcal: Number(l.value) || 0, protein_g: Number(l.protein_g) || 0, carbs_g: l.carbs_g == null ? null : Number(l.carbs_g), fat_g: l.fat_g == null ? null : Number(l.fat_g) }, source: 'recent' }];
  D.state = 'ready'; const el = document.getElementById('fd_text'); if (el) el.value = l.note; renderSug(); renderRecents();
};
// photo of the plate → the estimator (vision) → the same cards. The picture is shrunk in the phone and never stored.
A.foodPhoto = async (input) => {
  const file = input.files && input.files[0]; if (!file) return; input.value = '';
  const D = FD(); const n = ++lookupN; D.state = 'looking'; D.items = []; renderSug();
  try {
    const dataUrl = await shrink(file, 1024, 0.72);
    const r = await db.lookupFoodImage(dataUrl, LANG.cur); if (n !== lookupN) return;
    D.items = (r.items || []).map(x => Object.assign({}, x, { per: Object.assign({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, x.per || {}) })); D.state = D.items.length ? 'ready' : 'none'; D.error = r.error || (D.items.length ? '' : t('No food found in the photo — try again closer, or type it.'));
    const el = document.getElementById('fd_text'); if (el && D.items.length) el.value = D.items.map(x => x.name).join(', ');
    track('food', { what: 'photo', n: D.items.length });
  } catch (e) { if (n !== lookupN) return; D.items = []; D.state = 'none'; D.error = e.message || ''; }
  renderSug(); renderRecents();
};
function shrink(file, max, q) {
  return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(t('Could not read the photo'))); }; img.src = url; });
}
let typedT = null, lookupN = 0;
A.foodTyped = (now) => {
  const D = FD(); const text = val('fd_text'); D.text = text; clearTimeout(typedT);
  if (text.length < 2) { D.items = []; D.state = 'idle'; renderSug(); renderRecents(); return; }
  D.state = 'typing'; renderSug();
  typedT = setTimeout(() => lookup(text), now ? 0 : 550);
}
async function lookup(text) {
  const D = FD(); const n = ++lookupN; D.state = 'looking'; renderSug();
  try {
    const r = await db.lookupFood(text, LANG.cur); if (n !== lookupN) return;   // a newer lookup is running
    D.items = (r.items || []).map(x => Object.assign({}, x, { per: Object.assign({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, x.per || {}) })); D.state = D.items.length ? 'ready' : 'none'; D.error = r.error || '';
  } catch (e) { if (n !== lookupN) return; D.items = []; D.state = 'none'; D.error = e.message || ''; }
  renderSug(); renderRecents();
}
function itemCard(it, i) {
  const m = itemTotals(it); const gramsToggle = it.unit_kind === 'count' && it.grams ? '<button class="chip sm" onclick="A.foodGrams(' + i + ')">' + t('in grams') + '</button>' : it.unit_kind === 'g' && it.fromCount ? '<button class="chip sm" onclick="A.foodCount(' + i + ')">' + esc(it.fromCount.unit) + '</button>' : '';
  const stepBig = it.unit_kind === 'g' ? (Number(it.qty) >= 100 ? 25 : 10) : 1;
  const mac = (k, uni, label, color) => '<div class="mac"><div class="v" style="color:' + color + '">' + (m[k] == null || (it.per[k] == null && k !== 'kcal') ? '—' : n0(m[k])) + '<span>' + (k === 'kcal' ? '' : ' ' + esc(unit('g'))) + '</span></div><div class="k">' + esc(macroShort(k)) + '</div></div>';
  return '<div class="card fcard"><div class="row between" style="align-items:flex-start;gap:8px"><div class="grow"><div class="h3">' + esc(it.name) + '</div><div class="mute small">' + esc(fmtQty(it.qty) + ' ' + it.unit) + (it.unit_kind === 'count' && it.grams ? ' · ' + t('about {g} g', { g: Math.round(it.grams * it.qty) }) : '') + '</div></div>' + sourceChip(it.source) + '</div>' +
    '<div class="row between"><div class="chips" style="gap:6px">' + gramsToggle + '</div><div class="stepper"><button type="button" aria-label="' + t('Less') + '" onclick="A.foodStep(' + i + ',-' + stepBig + ')">−</button><input class="input" inputmode="decimal" value="' + esc(fmtQty(it.qty)) + '" onchange="A.foodQty(' + i + ',this.value)" aria-label="' + t('Amount') + '"><span class="mute small">' + esc(it.unit) + '</span><button type="button" aria-label="' + t('More') + '" onclick="A.foodStep(' + i + ',' + stepBig + ')">+</button></div></div>' +
    '<div class="macs">' + mac('kcal', 'kcal', 'kcal', 'var(--a-ink)') + mac('protein_g', 'g', 'protein', 'var(--a-accent)') + mac('carbs_g', 'g', 'carbs', 'var(--a-carb)') + mac('fat_g', 'g', 'fats', 'var(--a-fat)') + '</div>' +
    '<div class="row between"><span class="link" onclick="A.foodEditItem(' + i + ')">' + t('Edit numbers') + '</span><span class="link" style="color:var(--a-mute)" onclick="A.foodDrop(' + i + ')">' + t('Remove') + '</span></div></div>';
}
function renderSug() {
  const D = FD(); const el = document.getElementById('fd_sug'); if (!el) return;
  if (D.state === 'typing') { el.innerHTML = '<div class="mute small">' + t('…') + '</div>'; return; }
  if (D.state === 'looking') { el.innerHTML = '<div class="mute small">' + t('Looking it up…') + '</div>'; return; }
  if (D.state === 'none') { el.innerHTML = '<div class="card flat"><div class="mute">' + (D.error ? esc(D.error) : t('Could not work that one out — try another wording, or enter the numbers yourself.')) + '</div></div>'; return; }
  if (D.state !== 'ready' || !D.items.length) { el.innerHTML = ''; return; }
  const tot = D.items.reduce((a, it) => { const m = itemTotals(it); a.kcal += m.kcal; a.p += m.protein_g || 0; return a; }, { kcal: 0, p: 0 });
  const left = tg('protein_g') ? Math.max(0, tg('protein_g') - macroTotals(S.today.logs || []).protein_g - tot.p) : null;
  el.innerHTML = D.items.map(itemCard).join('') +
    (left != null ? '<div class="mute small">' + (left > 0 ? t('After this: {g} g protein left today.', { g: n0(left) }) : t('After this your protein target is reached.')) + '</div>' : '') +
    '<button class="btn" onclick="A.saveFoodItems()">' + (D.items.length === 1 ? t('Use this') : t('Log all {n}', { n: D.items.length })) + ' · ' + n0(tot.kcal) + ' ' + unit('kcal') + '</button>';
}
A.foodStep = (i, d) => { const it = FD().items[i]; if (!it) return; it.qty = Math.max(it.unit_kind === 'g' ? 5 : 0.5, r1(Number(it.qty) + d)); renderSug(); };
A.foodQty = (i, v) => { const it = FD().items[i]; if (!it) return; const q = parseFloat(String(v).replace(',', '.')); if (q > 0 && q <= 5000) it.qty = q; renderSug(); };
A.foodGrams = (i) => { const it = FD().items[i]; if (!it || !it.grams) return; it.fromCount = { unit: it.unit, grams: it.grams, per: it.per }; it.per = { kcal: r3(it.per.kcal / it.grams), protein_g: r3(it.per.protein_g / it.grams), carbs_g: it.per.carbs_g == null ? null : r3(it.per.carbs_g / it.grams), fat_g: it.per.fat_g == null ? null : r3(it.per.fat_g / it.grams) }; it.qty = Math.round(it.qty * it.grams); it.unit = unit('g'); it.unit_kind = 'g'; it.grams = 1; renderSug(); };
A.foodCount = (i) => { const it = FD().items[i]; if (!it || !it.fromCount) return; const c = it.fromCount; it.qty = r1(it.qty / c.grams); it.per = c.per; it.unit = c.unit; it.unit_kind = 'count'; it.grams = c.grams; delete it.fromCount; renderSug(); };
A.foodDrop = (i) => { const D = FD(); D.items.splice(i, 1); if (!D.items.length) D.state = 'idle'; renderSug(); renderRecents(); };
A.foodEditItem = (i) => { const it = FD().items[i]; if (!it) return; const m = itemTotals(it); A.foodManual({ note: it.name + (it.qty !== 1 || it.unit_kind === 'g' ? ', ' + fmtQty(it.qty) + ' ' + it.unit : ''), kcal: n0(m.kcal), protein_g: it.per.protein_g == null ? '' : n0(m.protein_g), carbs_g: it.per.carbs_g == null ? '' : n0(m.carbs_g), fat_g: it.per.fat_g == null ? '' : n0(m.fat_g) }); };
A.saveFoodItems = async () => {
  const D = FD(); if (!D.items.length) return;
  busy(true);
  try {
    for (const it of D.items) {
      const m = itemTotals(it); const note = it.name + (it.qty !== 1 || it.unit_kind === 'g' ? ', ' + fmtQty(it.qty) + ' ' + it.unit : '');
      await db.addLog(S.me.id, S.today.day, 'food', Math.round(m.kcal), { protein_g: it.per.protein_g == null ? null : m.protein_g, carbs_g: it.per.carbs_g == null ? null : m.carbs_g, fat_g: it.per.fat_g == null ? null : m.fat_g, note: note.slice(0, 120) });
      track('log', { kind: 'food', how: it.source });
    }
    closeSheet(); await reloadToday(); toast(D.items.length === 1 ? t('Logged') : t('Logged {n} foods', { n: D.items.length }));
  } catch (e) { busy(false); fail(e); }
};
// manual entry (also "Edit numbers" on a suggestion)
A.foodManual = (pre) => {
  pre = pre || {};
  sheet('<div class="h2">' + t('Add food') + '</div>' + field(t('What'), 'fd_note', pre.note || val('fd_text') || '', { ph: t('e.g. chicken, rice, salad') }) +
    '<div class="input-row">' + field(t('Calories'), 'fd_kcal', pre.kcal, { type: 'number', unit: unit('kcal'), ph: '450' }) + field(t('Protein'), 'fd_prot', pre.protein_g, { type: 'number', unit: unit('g'), ph: '30' }) + '</div>' +
    '<div class="input-row">' + field(t('Carbs'), 'fd_carb', pre.carbs_g, { type: 'number', unit: unit('g'), ph: '50' }) + field(t('Fats'), 'fd_fat', pre.fat_g, { type: 'number', unit: unit('g'), ph: '15' }) + '</div>' +
    '<span class="link" style="align-self:flex-start" onclick="A.foodSheet()">' + t('Let the app work it out') + '</span>' +
    '<button class="btn" onclick="A.saveFood()">' + t('Add') + '</button>');
};
A.saveFood = async () => {
  const kcal = parseInt(val('fd_kcal'), 10), prot = parseFloat(val('fd_prot')), carb = parseFloat(val('fd_carb')), fat = parseFloat(val('fd_fat'));
  if (isNaN(kcal) && isNaN(prot) && isNaN(carb) && isNaN(fat)) { toast(t('Enter calories or protein.'), 'err'); return; }
  if ((!isNaN(kcal) && (kcal < 0 || kcal > 10000)) || (!isNaN(prot) && (prot < 0 || prot > 1000)) || (!isNaN(carb) && (carb < 0 || carb > 2000)) || (!isNaN(fat) && (fat < 0 || fat > 1000))) { toast(t('Check the numbers: calories 0–10000, protein 0–1000 g.'), 'err'); return; }
  busy(true);
  try { await db.addLog(S.me.id, S.today.day, 'food', isNaN(kcal) ? 0 : kcal, { protein_g: isNaN(prot) ? null : prot, carbs_g: isNaN(carb) ? null : carb, fat_g: isNaN(fat) ? null : fat, note: val('fd_note') }); track('log', { kind: 'food', how: 'manual' }); closeSheet(); await reloadToday(); }
  catch (e) { busy(false); fail(e); }
};
A.delLog = async (id, el) => { if (el && !armed(el, t('Remove?'))) return; try { await db.deleteLog(id); await reloadToday(); } catch (e) { fail(e); } };

// ---- water
A.addWater = async (ml) => { try { await db.addLog(S.me.id, S.today.day, 'water', ml); track('log', { kind: 'water' }); await reloadToday(); } catch (e) { fail(e); } };
A.undoWater = async () => { const w = (S.today.logs || []).filter(l => l.kind === 'water').pop(); if (!w) return; try { await db.deleteLog(w.id); await reloadToday(); } catch (e) { fail(e); } };

// ---- steps / weight (one value per day)
A.numSheet = (kind) => {
  S.draft.wOk = null; const cur = oneOf(S.today.logs || [], kind); const isW = kind === 'weight';
  sheet('<div class="h2">' + (isW ? t('Weigh-in') : t('Steps today')) + '</div>' + (isW ? '<div class="mute">' + t('Best in the morning, before breakfast.') + '</div>' : '') +
    field(isW ? t('Weight') : t('Steps'), 'num_v', cur ? Number(cur.value) : '', { type: 'number', unit: isW ? unit('kg') : '', ph: isW ? '70.5' : '8000', attrs: isW ? ' step="0.1"' : '' }) +
    '<div class="err" id="num_warn"></div><button class="btn" onclick="A.saveNum(\'' + kind + '\')">' + t('Save') + '</button>' + (cur ? '<button class="btn sec" onclick="A.saveNum(\'' + kind + '\',true)">' + t('Clear') + '</button>' : ''));
};
A.saveNum = async (kind, clear) => {
  const v = clear ? null : parseFloat(val('num_v'));
  if (!clear && (isNaN(v) || v < 0)) { toast(t('Enter a number.'), 'err'); return; }
  if (!clear && kind === 'weight' && (v < 20 || v > 400)) { toast(t('Check the number: weight in kg, 20–400.'), 'err'); return; }
  if (!clear && kind === 'steps' && v > 100000) { toast(t('Check the number: at most 100000 steps.'), 'err'); return; }
  if (!clear && kind === 'weight' && S.draft.wOk !== v) {
    let prev = null; try { prev = await lastWeight(); } catch (e) {}
    if (prev && Math.abs(v - prev.v) >= 3) {
      S.draft.wOk = v; const el = document.getElementById('num_warn');
      if (el) el.textContent = t('That is {d} kg away from your last weigh-in ({w} kg, {date}). Tap Save again if it is right.', { d: Math.abs(v - prev.v).toFixed(1), w: prev.v, date: fmtDay(prev.day, 'dm') });
      return;
    }
  }
  busy(true);
  try {
    await db.setDayLog(S.me.id, S.today.day, kind, v); track('log', { kind }); closeSheet(); await reloadToday();
    if (kind === 'weight' && v) { try { const r = await db.updateTraineeProfile(S.me.id, { weight_kg: v }); S.traineeProfile = Object.assign({}, S.traineeProfile, { weight_kg: v }, r || {}); } catch (e) {} }   // "My answers" shows the latest weight
  }
  catch (e) { busy(false); toast(t('Could not save — check the number'), 'err'); }
};

// ---- evening check-in (mood 1–5 + note)
A.checkinSheet = () => {
  const cur = oneOf(S.today.logs || [], 'checkin'); S.draft.mood = cur ? Number(cur.value) : 0;
  sheet('<div class="h2">' + t('Evening check-in') + '</div><div class="field"><label>' + t('How was your day?') + '</label><div class="chips" id="moods">' + moodChips() + '</div></div>' +
    field(t('A line for your coach (optional)'), 'ci_note', cur ? cur.note : '', { textarea: true, ph: t('e.g. slept badly, knee felt fine') }) +
    '<button class="btn" onclick="A.saveCheckin()">' + t('Save') + '</button>');
};
function moodChips() { return Object.keys(MOODS).map(k => '<button class="chip ' + (S.draft.mood === Number(k) ? 'on' : '') + '" onclick="A.pickMood(' + k + ')">' + esc(t(MOODS[k])) + '</button>').join(''); }
A.quickMood = async (k) => {
  const cur = oneOf(S.today.logs || [], 'checkin'); const first = !cur;
  try { await db.setDayLog(S.me.id, S.today.day, 'checkin', k, cur ? cur.note : ''); track('log', { kind: 'checkin' }); await reloadToday(); toast(t('Saved')); }
  catch (e) { fail(e); }
};
A.pickMood = (k) => { S.draft.mood = k; const el = document.getElementById('moods'); if (el) el.innerHTML = moodChips(); };
A.saveCheckin = async () => {
  if (!S.draft.mood) { toast(t('Pick how your day was.'), 'err'); return; }
  busy(true);
  try { await db.setDayLog(S.me.id, S.today.day, 'checkin', S.draft.mood, val('ci_note')); track('log', { kind: 'checkin' }); closeSheet(); toast(t('Saved — see you tomorrow')); await reloadToday(); }
  catch (e) { busy(false); fail(e); }
};

// ---- this week
SCREENS.week = () => ({ title: t('This week'), sub: t('Mon–Sun'), body: '<div class="card" id="weekbody"><div class="mute">' + t('Loading…') + '</div></div>',
  after: async () => {
    const days = weekOf(S.today.day); const items = (S.plan && S.plan.items) || [];
    try {
      const logs = await db.logsBetween(S.me.id, days[0], days[6]);
      const rows = days.map((d, i) => {
        if (d > S.today.day) { const pl = items.filter(x => x.day === i + 1).length; return '<div class="lrow" style="opacity:.6"><div class="grow"><div class="t">' + esc(dayName(i + 1)) + '</div><div class="s">' + esc(pl ? (pl === 1 ? t('1 exercise planned') : t('{n} exercises planned', { n: pl })) : t('rest')) + '</div></div></div>'; }
        const L = logs.filter(l => l.day === d); const planned = items.filter(x => x.day === i + 1 && (!x.created_at || x.created_at.slice(0, 10) <= d)).length, done = L.filter(l => l.kind === 'exercise').length;
        const kcal = sumDay(L, 'food'), prot = sumDay(L, 'food', 'protein_g'), water = sumDay(L, 'water'), st = oneOf(L, 'steps'), w = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
        const bits = [planned ? t('workout') + ' ' + done + '/' + planned : t('rest'), kcal ? n0(kcal) + ' ' + unit('kcal') : '', prot ? n0(prot) + ' ' + unit('g') : '', water ? (water / 1000) + ' ' + unit('L') : '', st ? n0(st.value) + ' ' + t('steps') : '', w ? Number(w.value) + ' ' + unit('kg') : ''].filter(Boolean).join(' · ');
        return '<div class="lrow"><div class="grow"><div class="t">' + esc(dayName(i + 1)) + (d === S.today.day ? ' · ' + t('today') : '') + '</div><div class="s">' + esc(bits || t('Nothing logged')) + (ci ? ' · ' + esc(mood(ci.value)) : '') + '</div>' + (ci && ci.note ? '<div class="s">' + esc(ci.note) + '</div>' : '') + '</div></div>';
      }).join('');
      const el = document.getElementById('weekbody'); if (el) el.innerHTML = rows;
    } catch (e) { const el = document.getElementById('weekbody'); if (el) el.innerHTML = '<div class="err">' + t('Could not load — try again') + '</div>'; }
  } });
