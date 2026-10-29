// Tune Up beta — coach monitoring: Today tab (needs your eye + everyone today), per-client 7-day stats,
// weight trend, check-in notes and the coach's private notes.
import { loader, rollNum } from './motion.js';
import { t, esc, unit, isoDate, addDays, weekdayOf, fmtDay, firstName, mood, fmtDate, macroShort } from './i18n.js';
import { SCREENS, A, I, rerender, toast, val, busy, avatar } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { attHtml, attachBlock, saveAttachments, resolveUrls } from './attach.js';
import { effectiveTargets } from './plan.js';
import { tuneButton } from './tune.js';
import { pushCard } from './push.js';
import { guideCard } from './guide.js';

const DAYS_BACK = 13;                       // two weeks of logs for every active client, loaded once with the coach
export async function loadMonitor() {
  const active = (S.clients || []).filter(c => c.status === 'active');
  const today = isoDate(); S.mon = { today, logs: [], items: [], notes: {} };
  if (!active.length) return;
  const [logs, items, targets] = await Promise.all([db.logsForTrainees(active.map(c => c.trainee.id), addDays(today, -DAYS_BACK), today), db.planItemsForPairs(active.map(c => c.id)), db.targetsForPairs(active.map(c => c.id))]);
  S.mon.logs = logs; S.mon.items = items; resolveUrls(logs.filter(l => l.kind === 'checkin')).then(ok => { if (ok) rerender(); }).catch(() => {}); active.forEach(c => { c.targets = targets.find(x => x.pair_id === c.id) || null; });
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
    return { day: d, L, planned, done, kcal: sum(L, 'food'), prot: sum(L, 'food', 'protein_g'), carbs: sum(L, 'food', 'carbs_g'), fat: sum(L, 'food', 'fat_g'), hasMacros: L.some(l => l.kind === 'food' && l.carbs_g != null), water: sum(L, 'water'), steps: one(L, 'steps'), weight: one(L, 'weight'), ci: one(L, 'checkin'), any: L.length > 0 }; });
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
  const M = S.mon || {}; const today = M.today || isoDate(); const f = []; const tg = effectiveTargets(c.targets) || null;
  const last = st.byDay.slice(0, 6).filter(x => x.planned).pop();                  // most recent planned day before today
  if (last && last.done < last.planned) f.push({ k: 'missed', label: t('Missed workout'), sub: fmtDay(last.day, 'dm') + ' · ' + last.done + '/' + last.planned });
  if (tg && tg.protein_g && st.yesterday.prot && st.yesterday.prot < tg.protein_g * 0.7) f.push({ k: 'protein', label: t('Low protein'), sub: n0(st.yesterday.prot) + ' / ' + tg.protein_g + ' ' + unit('g') + ' ' + t('yesterday') });
  if (tg && tg.carbs_g && st.yesterday.carbs && st.yesterday.kcal && st.yesterday.carbs < tg.carbs_g * 0.6) f.push({ k: 'carbs', label: t('Low carbs'), sub: n0(st.yesterday.carbs) + ' / ' + tg.carbs_g + ' ' + unit('g') + ' ' + t('yesterday') });
  if (tg && tg.fat_g && st.yesterday.fat && st.yesterday.fat > tg.fat_g * 1.35) f.push({ k: 'fat', label: t('High fats'), sub: n0(st.yesterday.fat) + ' / ' + tg.fat_g + ' ' + unit('g') + ' ' + t('yesterday') });
  const ci = st.cis[0];
  if (ci && ci.day >= addDays(today, -2) && Number(ci.value) <= 2) f.push({ k: 'mood', label: t('Low mood'), sub: mood(ci.value) + ' · ' + fmtDay(ci.day, 'dm') });
  if (ci && ci.day >= addDays(today, -2) && ci.note) f.push({ k: 'note', label: t('Wrote a note'), sub: ci.note });
  if (!st.lastLog || st.lastLog < addDays(today, -3)) f.push({ k: 'quiet', label: t('Quiet'), sub: st.lastLog ? t('Last log {date}', { date: fmtDay(st.lastLog, 'dm') }) : t('Nothing logged yet') });
  if (st.weights.length >= 2) { const w0 = st.weights.filter(w => w.day <= addDays(today, -6)).pop() || st.weights[0]; const d = Number(st.lastWeight.value) - Number(w0.value); if (Math.abs(d) >= 1 && w0 !== st.lastWeight) f.push({ k: 'weight', label: t('Weight moved'), sub: (d > 0 ? '+' : '') + d.toFixed(1) + ' ' + unit('kg') + ' ' + t('this week') }); }
  return f;
}

// ---- coach Today tab
SCREENS.ctoday = () => {
  const active = (S.clients || []).filter(c => c.status === 'active');
  if (!active.length) return { title: t('Today'), sub: fmtDate(Date.now(), 'full'), body: guideCard() + '<div class="card soft"><div class="h3">' + t('No clients yet') + '</div><div class="mute">' + t('Create an invite link and send it to a client. They sign up through it and land here.') + '</div><button class="btn sm" onclick="A.newInvite()">' + I.link + ' ' + t('Invite a client') + '</button></div>' };
  const rows = active.map(c => { const st = statsFor(c); return { c, st, flags: flagsFor(c, st) }; });
  const eye = rows.filter(r => r.flags.length);
  const chip = f => '<span class="chip sm ' + (f.k === 'note' ? 'blue' : f.k === 'weight' ? 'amb' : f.k === 'quiet' ? 'amb' : 'red') + '">' + esc(f.label) + (f.k !== 'note' && f.sub ? ' · ' + esc(f.sub) : '') + '</span>';   // details visible on phones too (no hover)
  const todayLine = r => { const d = r.st.today; const bits = [d.planned ? t('workout') + ' ' + d.done + '/' + d.planned : t('rest day'), d.kcal ? n0(d.kcal) + ' ' + unit('kcal') : '', d.water ? (d.water / 1000) + ' ' + unit('L') : '', d.steps ? n0(d.steps.value) + ' ' + t('steps') : '', d.ci ? mood(d.ci.value) : ''].filter(Boolean); return bits.join(' · '); };
  const logged = rows.filter(r => r.st.today.L.length).length, wk = rows.reduce((a, r) => a + r.st.today.done, 0), wkp = rows.reduce((a, r) => a + r.st.today.planned, 0);
  const kpis = '<div class="kpis"><div class="kpi"><span class="eyebrow" style="color:var(--c-kcal)">' + t('Clients') + '</span><span class="num">' + rollNum(rows.length, 'i', null, true) + '</span><small>' + (eye.length ? t('{n} need your eye', { n: eye.length }) : t('All quiet')) + '</small></div>' +
    '<div class="kpi"><span class="eyebrow" style="color:var(--c-water)">' + t('Logged today') + '</span><span class="num">' + rollNum(logged, 'i', null, true) + '<small style="font-family:var(--font-body)"> / ' + rows.length + '</small></span><small>' + (wkp ? t('{n} of {m} exercises ticked', { n: wk, m: wkp }) : t('rest day for everyone')) + '</small></div></div>';
  return { title: t('Today'), sub: fmtDate(Date.now(), 'full'), actions: tuneButton(), body: (guideCard() || pushCard()) + kpis +
    '<div class="section-title"><span class="eyebrow">' + t('Needs your eye') + '</span></div>' +
    (eye.length ? eye.map(r => '<div class="card tap" onclick="A.go(\'client\',{id:\'' + r.c.id + '\'})"><div class="row">' + avatar(r.c.trainee.name, r.c.trainee.id) + '<div class="grow"><div class="t">' + esc(r.c.trainee.name) + '</div><div class="chips" style="margin-top:4px">' + r.flags.map(chip).join('') + '</div>' + (r.flags.find(f => f.k === 'note') ? '<div class="mute small" style="margin-top:4px">“' + esc(r.flags.find(f => f.k === 'note').sub) + '”</div>' : '') + '</div>' + I.chev + '</div></div>').join('') : '<div class="card flat mute">' + t('All quiet — nobody needs attention right now.') + '</div>') +
    '<div class="section-title"><span class="eyebrow">' + t('Everyone today') + '</span></div><div class="card">' +
    rows.map(r => { return '<div class="lrow" style="cursor:pointer" onclick="A.go(\'client\',{id:\'' + r.c.id + '\'})">' + avatar(r.c.trainee.name, r.c.trainee.id) + '<div class="grow"><div class="t">' + esc(r.c.trainee.name) + '</div><div class="s">' + esc(todayLine(r) || t('Nothing logged yet')) + '</div></div>' + I.chev + '</div>'; }).join('') + '</div>' +
    '<div class="row" style="justify-content:center"><button class="btn sec sm" onclick="A.refreshMon()">' + t('Refresh') + '</button></div>' };
};
A.refreshMon = async () => { try { await loadMonitor(); rerender(); toast(t('Updated')); } catch (e) { toast(t('Could not refresh'), 'err'); } };

// ---- cards inside the client screen (coach side)
export function monitorCards(c, part) {   // part: 'overview' | 'notes' | undefined (both)
  if (!S.mon) return '';
  const st = statsFor(c); const flags = flagsFor(c, st); const tg = effectiveTargets(c.targets) || {};
  const d = st.today;
  const todayBits = [d.planned ? t('workout') + ' ' + d.done + '/' + d.planned : t('rest day'), d.kcal ? n0(d.kcal) + ' ' + unit('kcal') : '', d.prot ? n0(d.prot) + ' ' + unit('g') + ' ' + t('P') : '', d.carbs ? n0(d.carbs) + ' ' + unit('g') + ' ' + t('C') : '', d.fat ? n0(d.fat) + ' ' + unit('g') + ' ' + t('F') : '', d.water ? (d.water / 1000) + ' ' + unit('L') : '', d.steps ? n0(d.steps.value) + ' ' + t('steps') : '', d.weight ? Number(d.weight.value) + ' ' + unit('kg') : '', d.ci ? mood(d.ci.value) : ''].filter(Boolean).join(' · ');
  const stat = (v, k) => '<div class="tile"><div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div></div>';
  const week = '<div class="grid2">' + stat(st.workouts[0] + '/' + st.workouts[1], t('workouts done')) + stat(st.avgKcal ? st.avgKcal + (tg.kcal ? ' / ' + tg.kcal : '') : '—', unit('kcal') + ' ' + t('avg')) + stat(st.avgProt ? st.avgProt + (tg.protein_g ? ' / ' + tg.protein_g : '') : '—', unit('g') + ' ' + t('protein avg')) + stat(st.avgSteps ? st.avgSteps : '—', t('steps avg')) + '</div>';
  const dots = '<div class="row" style="gap:6px;justify-content:space-between">' + st.byDay.map(x => '<div style="text-align:center;flex:1"><div class="check ' + (x.planned ? (x.done >= x.planned ? 'on' : (x.done ? 'on' : '')) : '') + '" style="margin:0 auto;width:22px;height:22px;' + (x.planned && x.done && x.done < x.planned ? 'background:var(--a-amber);border-color:var(--a-amber)' : '') + (!x.planned ? 'border-style:dashed' : '') + '">' + (x.planned && x.done ? I.check : '') + '</div><div class="mute small">' + fmtDay(x.day, 'dm').split(' ')[0] + '</div></div>').join('') + '</div>';
  const chip = f => '<span class="chip sm ' + (f.k === 'note' ? 'blue' : f.k === 'weight' ? 'amb' : f.k === 'quiet' ? '' : 'red') + '">' + esc(f.label) + ' · ' + esc(f.sub) + '</span>';
  const ciList = st.cis.slice(0, 5).map(ci => '<div class="lrow"><div class="grow"><div class="t">' + esc(mood(ci.value)) + ' <span class="mute small">' + fmtDay(ci.day, 'dm') + '</span></div>' + (ci.note ? '<div class="s">' + esc(ci.note) + '</div>' : '') + attHtml(ci.attachments) + '</div></div>').join('');
  const note = S.mon.notes[c.id];
  const streak = (() => { if (!tg.protein_g) return 0; let n = 0; const days = st.byDay.slice().reverse(); if (days[0].prot < tg.protein_g * 0.9) days.shift(); for (const x of days) { if (x.prot >= tg.protein_g * 0.9) n++; else break; } return n; })();
  const overview = (flags.length || streak >= 2 ? '<div class="chips">' + flags.map(chip).join('') + (streak >= 2 ? '<span class="chip sm soft">' + I.spark + ' ' + esc(t('{n}-day protein streak', { n: streak >= 7 ? '7+' : streak })) + '</span>' : '') + '</div>' : '') +
    '<div class="section-title"><span class="eyebrow">' + t('Today') + '</span></div><div class="card"><div class="lead">' + esc(todayBits || t('Nothing logged yet')) + '</div>' + (d.ci && d.ci.note ? '<div class="mute">“' + esc(d.ci.note) + '”</div>' : '') + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Last 7 days') + '</span></div>' + week + '<div class="card">' + dots + '</div>' +
    (tg.kcal || tg.protein_g ? '<div class="section-title"><span class="eyebrow">' + t('Food vs targets') + '</span><span class="mute small heatkey"><i class="sw g"></i>' + t('on target') + '</span></div><div class="card">' + heatmap(st, tg) + '</div>' : '') +
    foodList(c, st) +
    (st.weights.length ? '<div class="section-title"><span class="eyebrow">' + t('Weight') + '</span><span class="mute small">' + Number(st.lastWeight.value) + ' ' + unit('kg') + ' · ' + fmtDay(st.lastWeight.day, 'dm') + '</span></div><div class="card">' + spark(st.weights) + '</div>' : '');
  const notes = (ciList ? '<div class="section-title"><span class="eyebrow">' + t('Check-ins') + '</span></div><div class="card">' + ciList + '</div>' : '') +
    '<div class="section-title"><span class="eyebrow">' + t('Private notes') + '</span><span class="mute small">' + t('only you see these') + '</span></div><div class="card">' +
    (note == null ? loader(t('Loading…'), 2) : '<div class="vwrap ta"><textarea class="input" id="cnote" oninput="A.noteDraft(\'' + c.id + '\',this.value)" placeholder="' + esc(t('e.g. knee — avoid deep squats; check weight weekly')) + '">' + esc(noteDraft(c.id, note.text)) + '</textarea><button type="button" class="vmic" id="cnote_mic" onclick="A.voice(\'cnote\')" aria-label="' + esc(t('Voice note')) + '">' + I.mic + '</button></div>' + attachBlock('cn_att', note.attachments || [], { keep: c.id }) + '<button class="btn sec sm" onclick="A.saveCoachNote(\'' + c.id + '\')">' + t('Save note') + '</button>') + '</div>';
  return part === 'overview' ? overview : part === 'notes' ? notes : overview + notes;
}
// 7 days × 4 macros; a cell is green within 85–115 % of the target, amber 60–85 / 115–135, red beyond, grey when nothing was logged that day
export function heatmap(st, tg) {
  const rows = [['kcal', 'Calories'], ['prot', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fats']].map(([k, label]) => { const T = tg[{ kcal: 'kcal', prot: 'protein_g', carbs: 'carbs_g', fat: 'fat_g' }[k]]; if (!T) return '';
    return '<div class="lab">' + esc(k === 'kcal' ? unit('kcal') : macroShort(label)) + '</div>' + st.byDay.map(x => { if (!x.kcal || ((k === 'carbs' || k === 'fat') && !x.hasMacros)) return '<div class="c" title="' + esc(fmtDay(x.day, 'dm')) + '"></div>'; const r = x[k] / T; let cls = r >= 0.85 && r <= 1.15 ? 'g' : (r >= 0.6 && r <= 1.35) ? 'a' : 'r'; if (x === st.today && r < 0.85) cls = 'p';   // today is still in progress: not judged until it is on target or over
      return '<div class="c ' + cls + '" role="button" tabindex="0" onclick="A.heatTip(this)" title="' + esc(fmtDay(x.day, 'dm') + ' · ' + t(label) + ' ' + n0(x[k]) + ' / ' + T) + '"></div>'; }).join(''); }).join('');
  return '<div class="heat"><div></div>' + st.byDay.map(x => '<div class="d">' + esc(fmtDay(x.day, 'dm').split(' ')[0]) + '</div>').join('') + rows + '</div>' +
    '<div class="mute small">' + t('Dashed = today so far. Tap a square for the numbers.') + '</div>';
}
A.heatTip = (el) => { if (el && el.title) toast(el.title); };
// today's and yesterday's food entries with a one-tap 👍 (the client is notified once)
function foodList(c, st) {
  const days = [st.today, st.yesterday].filter(Boolean);
  const rows = days.map(d => { const F = d.L.filter(l => l.kind === 'food'); if (!F.length) return ''; return '<div class="mute small" style="margin-top:4px">' + esc(d === st.today ? t('Today') : t('Yesterday')) + '</div>' + F.map(f => '<div class="food"><div class="grow" style="min-width:0"><div class="n">' + esc(f.note || t('Meal')) + '</div><div class="m">' + n0(f.value) + ' ' + unit('kcal') + (f.protein_g != null ? ' · ' + t('P') + ' ' + n0(f.protein_g) : '') + (f.carbs_g != null ? ' · ' + t('C') + ' ' + n0(f.carbs_g) : '') + (f.fat_g != null ? ' · ' + t('F') + ' ' + n0(f.fat_g) : '') + '</div></div><button class="rx ' + (f.reaction === 'up' ? 'on' : '') + '" onclick="A.reactLog(\'' + f.id + '\',' + (f.reaction === 'up' ? 'false' : 'true') + ')" aria-label="' + esc(t('Like')) + '" aria-pressed="' + (f.reaction === 'up' ? 'true' : 'false') + '">' + I.thumb + '</button></div>').join(''); }).join('');
  return rows ? '<div class="section-title"><span class="eyebrow">' + t('Food log') + '</span><span class="mute small">' + t('tap 👍 to encourage') + '</span></div><div class="card" style="gap:0">' + rows + '</div>' : '';
}
A.reactLog = async (id, on) => {
  try { await db.reactToLog(id, on); const l = (S.mon.logs || []).find(x => x.id === id); if (l) l.reaction = on ? 'up' : null; rerender(); if (on) toast(t('Sent 👍')); }
  catch (e) { toast(t('Could not save — try again'), 'err'); }
};
function spark(ws) {
  if (ws.length < 2) return '<div class="mute">' + t('One weigh-in so far: {kg} kg on {day}. The trend shows from the second one.', { kg: Number(ws[0].value), day: fmtDay(ws[0].day, 'dm') }) + '</div>';
  const vals = ws.map(w => Number(w.value)); const min = Math.min(...vals), max = Math.max(...vals); const span = (max - min) || 1;
  const W = 300, H = 70, pad = 6; const pts = vals.map((v, i) => [pad + (vals.length > 1 ? i / (vals.length - 1) : 0.5) * (W - 2 * pad), H - pad - (v - min) / span * (H - 2 * pad)]);
  return '<svg class="sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--a-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' + pts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="var(--a-accent)"/>').join('') + '</svg>' +
    '<div class="row between mute small"><span>' + fmtDay(ws[0].day, 'dm') + ' · ' + vals[0] + '</span><span>' + min + '–' + max + ' ' + unit('kg') + '</span><span>' + fmtDay(ws[ws.length - 1].day, 'dm') + ' · ' + vals[vals.length - 1] + '</span></div>';
}
// a private note being typed survives redraws and tab switches until it is saved (the screen is rebuilt on many taps)
const DRAFT = {}; const noteDraft = (id, saved) => DRAFT[id] != null ? DRAFT[id] : (saved || ''); A.noteDraft = (id, v) => { DRAFT[id] = v; };
export async function loadClientExtras(c) {       // the private note, fetched when the client screen opens
  const note = await db.getCoachNote(c.id); S.mon.notes[c.id] = note || { text: '', attachments: [] }; await resolveUrls([note || {}]);
}
A.saveCoachNote = async (pairId) => {
  const text = val('cnote'); busy(true);
  try { const atts = await saveAttachments('cn_att', 'tune/' + S.me.id + '/notes'); await db.saveCoachNote(pairId, text, atts); S.mon.notes[pairId] = { text, attachments: atts }; delete DRAFT[pairId]; toast(t('Saved')); busy(false); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
