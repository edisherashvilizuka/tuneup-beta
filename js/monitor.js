// Tune Up beta — coach monitoring: Today tab (needs your eye + everyone today), per-client 7-day stats,
// weight trend, check-in notes and the coach's private notes.
import { t, esc, unit, isoDate, addDays, weekdayOf, fmtDay, firstName, mood, fmtDate } from './i18n.js';
import { SCREENS, A, I, rerender, toast, val, busy, avatar } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

const DAYS_BACK = 13;                       // two weeks of logs for every active client, loaded once with the coach
export async function loadMonitor() {
  const active = (S.clients || []).filter(c => c.status === 'active');
  const today = isoDate(); S.mon = { today, logs: [], items: [], notes: {} };
  if (!active.length) return;
  const [logs, items, targets] = await Promise.all([db.logsForTrainees(active.map(c => c.trainee.id), addDays(today, -DAYS_BACK), today), db.planItemsForPairs(active.map(c => c.id)), db.targetsForPairs(active.map(c => c.id))]);
  S.mon.logs = logs; S.mon.items = items; active.forEach(c => { c.targets = targets.find(x => x.pair_id === c.id) || null; });
}
function sum(L, kind, key) { return L.filter(l => l.kind === kind).reduce((a, l) => a + (Number(l[key || 'value']) || 0), 0); }
function one(L, kind) { return L.find(l => l.kind === kind) || null; }
function n0(v) { return Math.round(Number(v) || 0); }

// stats for one pair over the last 7 days (today included); a plan item counts as planned only from the day it was created
export function statsFor(c) {
  const M = S.mon || { logs: [], items: [] }; const today = M.today || isoDate();
  const logs = M.logs.filter(l => l.trainee_id === c.trainee.id); const items = M.items.filter(i => i.pair_id === c.id);
  const days = [6, 5, 4, 3, 2, 1, 0].map(n => addDays(today, -n));
  const byDay = days.map(d => { const L = logs.filter(l => l.day === d); const planned = items.filter(i => i.day === weekdayOf(new Date(d + 'T00:00:00')) && (!i.created_at || i.created_at.slice(0, 10) <= d)).length; const done = L.filter(l => l.kind === 'exercise').length;
    return { day: d, L, planned, done, kcal: sum(L, 'food'), prot: sum(L, 'food', 'protein_g'), water: sum(L, 'water'), steps: one(L, 'steps'), weight: one(L, 'weight'), ci: one(L, 'checkin'), any: L.length > 0 }; });
  const plannedDays = byDay.filter(x => x.planned), doneDays = plannedDays.filter(x => x.done >= x.planned);
  const foodDays = byDay.filter(x => x.kcal || x.prot), waterDays = byDay.filter(x => x.water), stepDays = byDay.filter(x => x.steps);
  const weights = logs.filter(l => l.kind === 'weight').sort((a, b) => a.day < b.day ? -1 : 1);
  const cis = logs.filter(l => l.kind === 'checkin').sort((a, b) => a.day < b.day ? 1 : -1);
  const td = byDay[6], yd = byDay[5];
  const lastLog = logs.map(l => l.day).sort().pop() || null;
  return { byDay, today: td, yesterday: yd, workouts: [doneDays.length, plannedDays.length],
    avgKcal: foodDays.length ? n0(foodDays.reduce((a, x) => a + x.kcal, 0) / foodDays.length) : 0, avgProt: foodDays.length ? n0(foodDays.reduce((a, x) => a + x.prot, 0) / foodDays.length) : 0,
    avgWater: waterDays.length ? n0(waterDays.reduce((a, x) => a + x.water, 0) / waterDays.length) : 0, avgSteps: stepDays.length ? n0(stepDays.reduce((a, x) => a + Number(x.steps.value), 0) / stepDays.length) : 0,
    weights, lastWeight: weights.length ? weights[weights.length - 1] : null, cis, lastLog };
}
export function flagsFor(c, st) {
  const M = S.mon || {}; const today = M.today || isoDate(); const f = []; const tg = c.targets || null;
  const last = st.byDay.slice(0, 6).filter(x => x.planned).pop();                  // most recent planned day before today
  if (last && last.done < last.planned) f.push({ k: 'missed', label: t('Missed workout'), sub: fmtDay(last.day, 'dm') + ' · ' + last.done + '/' + last.planned });
  if (tg && tg.protein_g && st.yesterday.prot && st.yesterday.prot < tg.protein_g * 0.7) f.push({ k: 'protein', label: t('Low protein'), sub: n0(st.yesterday.prot) + ' / ' + tg.protein_g + ' ' + unit('g') + ' ' + t('yesterday') });
  const ci = st.cis[0];
  if (ci && ci.day >= addDays(today, -2) && Number(ci.value) <= 2) f.push({ k: 'mood', label: t('Low mood'), sub: mood(ci.value) + ' · ' + fmtDay(ci.day, 'dm') });
  if (ci && ci.day >= addDays(today, -2) && ci.note) f.push({ k: 'note', label: t('Wrote a note'), sub: ci.note });
  if (!st.lastLog || st.lastLog < addDays(today, -3)) f.push({ k: 'quiet', label: t('Quiet'), sub: st.lastLog ? t('Last log {date}', { date: fmtDay(st.lastLog, 'dm') }) : t('Nothing logged yet') });
  if (st.weights.length >= 2) { const w0 = st.weights.find(w => w.day <= addDays(today, -6)) || st.weights[0]; const d = Number(st.lastWeight.value) - Number(w0.value); if (Math.abs(d) >= 1 && w0 !== st.lastWeight) f.push({ k: 'weight', label: t('Weight moved'), sub: (d > 0 ? '+' : '') + d.toFixed(1) + ' ' + unit('kg') + ' ' + t('this week') }); }
  return f;
}

// ---- coach Today tab
SCREENS.ctoday = () => {
  const active = (S.clients || []).filter(c => c.status === 'active');
  if (!active.length) return { title: t('Today'), sub: fmtDate(Date.now(), 'full'), body: '<div class="card soft"><div class="h3">' + t('No clients yet') + '</div><div class="mute">' + t('Create an invite link and send it to a client. They sign up through it and land here.') + '</div><button class="btn sm" onclick="A.newInvite()">' + I.link + ' ' + t('Invite a client') + '</button></div>' };
  const rows = active.map(c => { const st = statsFor(c); return { c, st, flags: flagsFor(c, st) }; });
  const eye = rows.filter(r => r.flags.length);
  const chip = f => '<span class="chip sm ' + (f.k === 'note' ? 'blue' : f.k === 'weight' ? 'amb' : f.k === 'quiet' ? '' : 'red') + '" title="' + esc(f.sub) + '">' + esc(f.label) + '</span>';
  const todayLine = r => { const d = r.st.today; const bits = [d.planned ? t('workout') + ' ' + d.done + '/' + d.planned : t('rest day'), d.kcal ? n0(d.kcal) + ' ' + unit('kcal') : '', d.water ? (d.water / 1000) + ' L' : '', d.steps ? n0(d.steps.value) + ' ' + t('steps') : '', d.ci ? mood(d.ci.value) : ''].filter(Boolean); return bits.join(' · '); };
  return { title: t('Today'), sub: fmtDate(Date.now(), 'full'), body:
    '<div class="section-title"><span class="eyebrow">' + t('Needs your eye') + '</span></div>' +
    (eye.length ? eye.map(r => '<div class="card tap" onclick="A.go(\'client\',{id:\'' + r.c.id + '\'})"><div class="row">' + avatar(r.c.trainee.name, r.c.trainee.id) + '<div class="grow"><div class="t">' + esc(r.c.trainee.name) + '</div><div class="chips" style="margin-top:4px">' + r.flags.map(chip).join('') + '</div>' + (r.flags.find(f => f.k === 'note') ? '<div class="mute small" style="margin-top:4px">“' + esc(r.flags.find(f => f.k === 'note').sub) + '”</div>' : '') + '</div>' + I.chev + '</div></div>').join('') : '<div class="card flat mute">' + t('All quiet — nobody needs attention right now.') + '</div>') +
    '<div class="section-title"><span class="eyebrow">' + t('Everyone today') + '</span></div><div class="card">' +
    rows.map(r => '<div class="lrow" style="cursor:pointer" onclick="A.go(\'client\',{id:\'' + r.c.id + '\'})">' + avatar(r.c.trainee.name, r.c.trainee.id) + '<div class="grow"><div class="t">' + esc(r.c.trainee.name) + '</div><div class="s">' + esc(todayLine(r) || t('Nothing logged yet')) + '</div></div>' + I.chev + '</div>').join('') + '</div>' +
    '<div class="row" style="justify-content:center"><button class="btn sec sm" onclick="A.refreshMon()">' + t('Refresh') + '</button></div>' };
};
A.refreshMon = async () => { try { await loadMonitor(); rerender(); toast(t('Updated')); } catch (e) { toast(t('Could not refresh'), 'err'); } };

// ---- cards inside the client screen (coach side)
export function monitorCards(c) {
  if (!S.mon) return '';
  const st = statsFor(c); const flags = flagsFor(c, st); const tg = c.targets || {};
  const d = st.today;
  const todayBits = [d.planned ? t('workout') + ' ' + d.done + '/' + d.planned : t('rest day'), d.kcal ? n0(d.kcal) + ' ' + unit('kcal') : '', d.prot ? n0(d.prot) + ' ' + unit('g') : '', d.water ? (d.water / 1000) + ' L' : '', d.steps ? n0(d.steps.value) + ' ' + t('steps') : '', d.weight ? Number(d.weight.value) + ' ' + unit('kg') : '', d.ci ? mood(d.ci.value) : ''].filter(Boolean).join(' · ');
  const stat = (v, k) => '<div class="tile"><div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div></div>';
  const week = '<div class="grid2">' + stat(st.workouts[0] + '/' + st.workouts[1], t('workouts done')) + stat(st.avgKcal ? st.avgKcal + (tg.kcal ? ' / ' + tg.kcal : '') : '—', unit('kcal') + ' ' + t('avg')) + stat(st.avgProt ? st.avgProt + (tg.protein_g ? ' / ' + tg.protein_g : '') : '—', unit('g') + ' ' + t('protein avg')) + stat(st.avgSteps ? st.avgSteps : '—', t('steps avg')) + '</div>';
  const dots = '<div class="row" style="gap:6px;justify-content:space-between">' + st.byDay.map(x => '<div style="text-align:center;flex:1"><div class="check ' + (x.planned ? (x.done >= x.planned ? 'on' : (x.done ? 'on' : '')) : '') + '" style="margin:0 auto;width:22px;height:22px;' + (x.planned && x.done && x.done < x.planned ? 'background:var(--a-amber);border-color:var(--a-amber)' : '') + (!x.planned ? 'border-style:dashed' : '') + '">' + (x.planned && x.done ? I.check : '') + '</div><div class="mute small">' + fmtDay(x.day, 'dm').split(' ')[0] + '</div></div>').join('') + '</div>';
  const chip = f => '<span class="chip sm ' + (f.k === 'note' ? 'blue' : f.k === 'weight' ? 'amb' : f.k === 'quiet' ? '' : 'red') + '">' + esc(f.label) + ' · ' + esc(f.sub) + '</span>';
  const ciList = st.cis.slice(0, 5).map(ci => '<div class="lrow"><div class="grow"><div class="t">' + esc(mood(ci.value)) + ' <span class="mute small">' + fmtDay(ci.day, 'dm') + '</span></div>' + (ci.note ? '<div class="s">' + esc(ci.note) + '</div>' : '') + '</div></div>').join('');
  const note = S.mon.notes[c.id];
  return (flags.length ? '<div class="chips">' + flags.map(chip).join('') + '</div>' : '') +
    '<div class="section-title"><span class="eyebrow">' + t('Today') + '</span></div><div class="card"><div class="lead">' + esc(todayBits || t('Nothing logged yet')) + '</div>' + (d.ci && d.ci.note ? '<div class="mute">“' + esc(d.ci.note) + '”</div>' : '') + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Last 7 days') + '</span></div>' + week + '<div class="card">' + dots + '</div>' +
    (st.weights.length ? '<div class="section-title"><span class="eyebrow">' + t('Weight') + '</span><span class="mute small">' + Number(st.lastWeight.value) + ' ' + unit('kg') + ' · ' + fmtDay(st.lastWeight.day, 'dm') + '</span></div><div class="card">' + spark(st.weights) + '</div>' : '') +
    (ciList ? '<div class="section-title"><span class="eyebrow">' + t('Check-ins') + '</span></div><div class="card">' + ciList + '</div>' : '') +
    '<div class="section-title"><span class="eyebrow">' + t('Private notes') + '</span><span class="mute small">' + t('only you see these') + '</span></div><div class="card">' +
    (note == null ? '<div class="mute">' + t('Loading…') + '</div>' : '<textarea class="input" id="cnote" placeholder="' + esc(t('e.g. knee — avoid deep squats; check weight weekly')) + '">' + esc(note.text || '') + '</textarea><button class="btn sec sm" onclick="A.saveCoachNote(\'' + c.id + '\')">' + t('Save note') + '</button>') + '</div>';
}
function spark(ws) {
  const vals = ws.map(w => Number(w.value)); const min = Math.min(...vals), max = Math.max(...vals); const span = (max - min) || 1;
  const W = 300, H = 70, pad = 6; const pts = vals.map((v, i) => [pad + (vals.length > 1 ? i / (vals.length - 1) : 0.5) * (W - 2 * pad), H - pad - (v - min) / span * (H - 2 * pad)]);
  return '<svg class="sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--a-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' + pts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="var(--a-accent)"/>').join('') + '</svg>' +
    '<div class="row between mute small"><span>' + fmtDay(ws[0].day, 'dm') + ' · ' + vals[0] + '</span><span>' + min + '–' + max + ' ' + unit('kg') + '</span><span>' + fmtDay(ws[ws.length - 1].day, 'dm') + ' · ' + vals[vals.length - 1] + '</span></div>';
}
export async function loadClientExtras(c) {       // the private note, fetched when the client screen opens
  const note = await db.getCoachNote(c.id); S.mon.notes[c.id] = note || { text: '' };
}
A.saveCoachNote = async (pairId) => {
  const text = val('cnote'); busy(true);
  try { await db.saveCoachNote(pairId, text); S.mon.notes[pairId] = { text }; toast(t('Saved')); busy(false); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
