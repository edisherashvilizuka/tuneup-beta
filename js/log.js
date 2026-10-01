// Tune Up beta — trainee daily logging (food, water, steps, weight, evening check-in) + the week view.
import { t, esc, unit, dayName, weekOf, isoDate, weekdayOf, fmtDay, mood, MOODS, exName } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, sheet, closeSheet, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

// ---- helpers over S.today.logs (today) or any list of logs
export function sumDay(logs, kind, key) { return logs.filter(l => l.kind === kind).reduce((a, l) => a + (Number(l[key || 'value']) || 0), 0); }
export function oneOf(logs, kind) { return logs.find(l => l.kind === kind) || null; }
function tg(k) { return (S.plan && S.plan.targets && S.plan.targets[k]) || 0; }
function bar(v, max, cls) { const pct = max ? Math.min(100, Math.round(v / max * 100)) : 0; return '<div class="bar"><i class="' + (cls || '') + '" style="width:' + pct + '%"></i></div>'; }
function n0(v) { return Math.round(Number(v) || 0); }
async function reloadToday() { S.today.logs = await db.logsForDay(S.me.id, S.today.day); rerender(); }
function fail(e) { toast(t('Could not save — try again'), 'err'); }

// ---- today's log cards (shown on the Today tab under the workout)
export function logCards() {
  const L = S.today.logs || [];
  const kcal = sumDay(L, 'food'), prot = sumDay(L, 'food', 'protein_g'), water = sumDay(L, 'water');
  const steps = oneOf(L, 'steps'), weight = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
  const foods = L.filter(l => l.kind === 'food');
  const food = '<div class="card"><div class="row between"><div class="h3">' + t('Food') + '</div><span class="mute small">' + n0(kcal) + (tg('kcal') ? ' / ' + tg('kcal') : '') + ' ' + unit('kcal') + ' · ' + n0(prot) + (tg('protein_g') ? ' / ' + tg('protein_g') : '') + ' ' + unit('g') + ' ' + t('protein') + '</span></div>' +
    (tg('kcal') ? bar(kcal, tg('kcal')) : '') + (tg('protein_g') ? bar(prot, tg('protein_g'), 'grn') : '') +
    (foods.length ? '<div>' + foods.map(f => '<div class="food"><div><div class="n">' + esc(f.note || t('Meal')) + '</div><div class="m">' + (f.protein_g ? n0(f.protein_g) + ' ' + unit('g') + ' ' + t('protein') : '') + '</div></div><div class="kc">' + n0(f.value) + '</div><button class="act" style="width:28px;height:28px;border:0" onclick="A.delLog(\'' + f.id + '\')" aria-label="Remove">' + I.x + '</button></div>').join('') + '</div>' : '') +
    '<button class="btn sec sm" onclick="A.foodSheet()">' + I.plus + ' ' + t('Add food') + '</button></div>';
  const wat = '<div class="card"><div class="row between"><div class="h3">' + t('Water') + '</div><span class="mute small">' + (water / 1000).toFixed(water % 1000 ? 2 : 1).replace(/\.?0+$/, '') + (tg('water_ml') ? ' / ' + (tg('water_ml') / 1000) : '') + ' L</span></div>' + (tg('water_ml') ? bar(water, tg('water_ml'), 'blue') : '') +
    '<div class="btn-row"><button class="btn sec sm" onclick="A.addWater(250)">+ 250 ' + unit('ml') + '</button><button class="btn sec sm" onclick="A.addWater(500)">+ 500 ' + unit('ml') + '</button>' + (water ? '<button class="btn sec sm" onclick="A.undoWater()" aria-label="Undo">' + I.x + '</button>' : '') + '</div></div>';
  const tiles = '<div class="grid2"><div class="tile" style="cursor:pointer" onclick="A.numSheet(\'steps\')"><div class="stat"><div class="v">' + (steps ? n0(steps.value) : '—') + '</div><div class="k">' + t('steps') + (tg('steps') ? ' · ' + t('goal') + ' ' + tg('steps') : '') + '</div></div>' + (tg('steps') && steps ? bar(steps.value, tg('steps'), 'amb') : '') + '</div>' +
    '<div class="tile" style="cursor:pointer" onclick="A.numSheet(\'weight\')"><div class="stat"><div class="v">' + (weight ? Number(weight.value) : '—') + '</div><div class="k">' + unit('kg') + ' · ' + t('weigh-in') + '</div></div></div></div>';
  const chk = ci
    ? '<div class="card soft"><div class="row between"><div class="h3">' + t('Evening check-in') + '</div><span class="link" onclick="A.checkinSheet()">' + t('Edit') + '</span></div><div><span class="chip sm">' + esc(mood(ci.value)) + '</span>' + (ci.note ? ' <span class="mute">' + esc(ci.note) + '</span>' : '') + '</div></div>'
    : '<div class="card soft tap" onclick="A.checkinSheet()"><div class="h3">' + t('Evening check-in') + '</div><div class="mute">' + t('How was your day? One tap and a line for your coach.') + '</div></div>';
  return '<div class="section-title"><span class="eyebrow">' + t('Today\'s log') + '</span><span class="link" onclick="A.go(\'week\')">' + t('This week') + ' ›</span></div>' + food + wat + tiles + chk;
}

// ---- food
A.foodSheet = () => sheet('<div class="h2">' + t('Add food') + '</div>' + field(t('What'), 'fd_note', '', { ph: t('e.g. chicken, rice, salad') }) +
  '<div class="input-row">' + field(t('Calories'), 'fd_kcal', '', { type: 'number', unit: unit('kcal'), ph: '450' }) + field(t('Protein'), 'fd_prot', '', { type: 'number', unit: unit('g'), ph: '30' }) + '</div>' +
  '<button class="btn" onclick="A.saveFood()">' + t('Add') + '</button>');
A.saveFood = async () => {
  const kcal = parseInt(val('fd_kcal'), 10), prot = parseFloat(val('fd_prot'));
  if (isNaN(kcal) && isNaN(prot)) { toast(t('Enter calories or protein.'), 'err'); return; }
  busy(true);
  try { await db.addLog(S.me.id, S.today.day, 'food', isNaN(kcal) ? 0 : kcal, { protein_g: isNaN(prot) ? null : prot, note: val('fd_note') }); closeSheet(); await reloadToday(); }
  catch (e) { busy(false); fail(e); }
};
A.delLog = async (id) => { try { await db.deleteLog(id); await reloadToday(); } catch (e) { fail(e); } };

// ---- water
A.addWater = async (ml) => { try { await db.addLog(S.me.id, S.today.day, 'water', ml); await reloadToday(); } catch (e) { fail(e); } };
A.undoWater = async () => { const w = (S.today.logs || []).filter(l => l.kind === 'water').pop(); if (!w) return; try { await db.deleteLog(w.id); await reloadToday(); } catch (e) { fail(e); } };

// ---- steps / weight (one value per day)
A.numSheet = (kind) => {
  const cur = oneOf(S.today.logs || [], kind); const isW = kind === 'weight';
  sheet('<div class="h2">' + (isW ? t('Weigh-in') : t('Steps today')) + '</div>' + (isW ? '<div class="mute">' + t('Best in the morning, before breakfast.') + '</div>' : '') +
    field(isW ? t('Weight') : t('Steps'), 'num_v', cur ? Number(cur.value) : '', { type: 'number', unit: isW ? unit('kg') : '', ph: isW ? '70.5' : '8000', attrs: isW ? ' step="0.1"' : '' }) +
    '<button class="btn" onclick="A.saveNum(\'' + kind + '\')">' + t('Save') + '</button>' + (cur ? '<button class="btn sec" onclick="A.saveNum(\'' + kind + '\',true)">' + t('Clear') + '</button>' : ''));
};
A.saveNum = async (kind, clear) => {
  const v = clear ? null : parseFloat(val('num_v'));
  if (!clear && (isNaN(v) || v < 0)) { toast(t('Enter a number.'), 'err'); return; }
  busy(true);
  try { await db.setDayLog(S.me.id, S.today.day, kind, v); closeSheet(); await reloadToday(); }
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
A.pickMood = (k) => { S.draft.mood = k; const el = document.getElementById('moods'); if (el) el.innerHTML = moodChips(); };
A.saveCheckin = async () => {
  if (!S.draft.mood) { toast(t('Pick how your day was.'), 'err'); return; }
  busy(true);
  try { await db.setDayLog(S.me.id, S.today.day, 'checkin', S.draft.mood, val('ci_note')); closeSheet(); toast(t('Saved — see you tomorrow')); await reloadToday(); }
  catch (e) { busy(false); fail(e); }
};

// ---- this week
SCREENS.week = () => ({ title: t('This week'), sub: t('Mon–Sun'), body: '<div class="card" id="weekbody"><div class="mute">' + t('Loading…') + '</div></div>',
  after: async () => {
    const days = weekOf(S.today.day); const items = (S.plan && S.plan.items) || [];
    try {
      const logs = await db.logsBetween(S.me.id, days[0], days[6]);
      const rows = days.filter(d => d <= S.today.day).map((d, i) => {
        const L = logs.filter(l => l.day === d); const planned = items.filter(x => x.day === i + 1 && (!x.created_at || x.created_at.slice(0, 10) <= d)).length, done = L.filter(l => l.kind === 'exercise').length;
        const kcal = sumDay(L, 'food'), prot = sumDay(L, 'food', 'protein_g'), water = sumDay(L, 'water'), st = oneOf(L, 'steps'), w = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
        const bits = [planned ? t('workout') + ' ' + done + '/' + planned : t('rest'), kcal ? n0(kcal) + ' ' + unit('kcal') : '', prot ? n0(prot) + ' ' + unit('g') : '', water ? (water / 1000) + ' L' : '', st ? n0(st.value) + ' ' + t('steps') : '', w ? Number(w.value) + ' ' + unit('kg') : ''].filter(Boolean).join(' · ');
        return '<div class="lrow"><div class="grow"><div class="t">' + esc(dayName(i + 1)) + (d === S.today.day ? ' · ' + t('today') : '') + '</div><div class="s">' + esc(bits || t('Nothing logged')) + (ci ? ' · ' + esc(mood(ci.value)) : '') + '</div>' + (ci && ci.note ? '<div class="s">' + esc(ci.note) + '</div>' : '') + '</div></div>';
      }).join('');
      const el = document.getElementById('weekbody'); if (el) el.innerHTML = rows;
    } catch (e) { const el = document.getElementById('weekbody'); if (el) el.innerHTML = '<div class="err">' + t('Could not load — try again') + '</div>'; }
  } });
