// Tune Up beta — what Tune can do. Each action Tune returns is first PREPARED here: its references are resolved to
// real rows (from the refs map of tunectx.js — only data this person can already see), the input is checked, and a
// card is written in the reader's language. INSTANT actions (logging, ticking, the coach's private note) then run at
// once; everything else waits for the person's Yes. RUN writes through the same RLS-checked queries the screens use.
import { t, isoDate, addDays, dayName, weekdayOf, fmtDay, fmtTime, mood, exName, opt, unit, firstName } from './i18n.js';
import * as db from './db.js';
import { S } from './state.js';
import { loadSessions } from './calendar.js';
import { loadPlan } from './plan.js';
import { loadMonitor } from './monitor.js';

export const INSTANT = new Set(['log_food', 'log_water', 'log_steps', 'log_weight', 'log_checkin', 'tick_exercise', 'add_private_note']);
const TRAINEE = ['log_food', 'log_water', 'log_steps', 'log_weight', 'log_checkin', 'tick_exercise', 'remove_log', 'send_message', 'update_my_answers', 'send_feedback'];
const COACH = ['send_message', 'add_session', 'move_session', 'cancel_session', 'set_targets', 'add_goal', 'set_goal_done', 'remove_goal', 'add_plan_items', 'update_plan_item', 'remove_plan_items', 'add_private_note', 'send_feedback'];

const n0 = v => Math.round(Number(v) || 0);
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
class Bad extends Error {}
const bad = (msg, vars) => { throw new Bad(t(msg, vars)); };
function ref(refs, key, type) { const r = refs[String(key || '').trim().toUpperCase()]; return r && r.type === type ? r : null; }
function client(refs, key) { const r = ref(refs, key, 'client'); if (!r) bad('Tune pointed to a client that is not in your list.'); if (r.c.status !== 'active') bad('Coaching with {name} has ended.', { name: firstName(r.c.trainee.name) }); return r.c; }
function when(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{1,2}:\d{2}$/.test(String(time || ''))) bad('Tune did not give a clear date and time.');
  const at = new Date(date + 'T' + String(time).padStart(5, '0')); if (isNaN(at.getTime())) bad('Tune did not give a clear date and time.');
  if (at.getTime() < Date.now() - 10 * 60000) bad('That time has already passed — pick a later one.');
  if (at.getTime() > Date.now() + 366 * 86400000) bad('That date is more than a year away.');
  return at;
}
const whenText = at => fmtDay(isoDate(at)) + ' · ' + fmtTime(at);
const itemText = (name, x) => name + ' ' + [x.sets + '×' + x.reps, x.load].filter(Boolean).join(' · ') + (x.note ? ' — ' + x.note : '');
function findExercise(name) {
  const k = str(name, 80).toLowerCase(); if (!k) return null;
  return (S.exercises || []).find(x => x.name.toLowerCase() === k || (x.name_ka && x.name_ka.toLowerCase() === k)) || null;
}
function planOf(pairId) { return S.plan && S.plan.pairId === pairId ? S.plan : null; }
async function afterPlanChange(pairId) { if (S.me.role !== 'coach') return; try { if (planOf(pairId)) await loadPlan(pairId); await loadMonitor(); } catch (e) {} }

// ---- prepare: {name, input, status:'auto'|'pending'|'invalid', card:{icon,title,body,who}, data, err, sum}
export function prepare(a, refs) {
  const name = a && a.name; const x = (a && a.input) || {}; const role = S.me.role;
  const p = { name, input: x, status: INSTANT.has(name) ? 'auto' : 'pending', card: { icon: 'check', title: '', body: '', who: '' }, data: {} };
  p.sum = name + ' ' + JSON.stringify(x).slice(0, 400);
  try {
    if (!(role === 'coach' ? COACH : TRAINEE).includes(name)) bad('Tune tried something it cannot do here.');
    PREP[name](p, x, refs || {});
  } catch (e) { p.status = 'invalid'; p.err = e instanceof Bad ? e.message : t('Something went wrong — try again'); if (!p.card.title) p.card.title = t('Could not prepare this'); }
  return p;
}
const PREP = {
  log_food(p, x) { const kcal = n0(x.kcal), pr = num(x.protein_g); if (kcal < 0 || kcal > 10000) bad('Check the numbers: calories 0–10000, protein 0–1000 g.'); p.data = { kcal, protein_g: pr == null ? null : n0(pr), note: str(x.note, 120) }; p.card.title = t('Food') + ': ' + (p.data.note || t('Meal')); p.card.body = kcal + ' ' + unit('kcal') + (p.data.protein_g != null ? ' · ' + p.data.protein_g + ' ' + unit('g') + ' ' + t('protein') : ''); },
  log_water(p, x) { const ml = n0(x.ml); if (ml < 50 || ml > 5000) bad('Check the number: water 50–5000 ml.'); p.data = { ml }; p.card.title = t('Water') + ' +' + ml + ' ' + unit('ml'); },
  log_steps(p, x) { const v = n0(x.steps); if (v < 0 || v > 100000) bad('Check the number: at most 100000 steps.'); p.data = { v }; p.card.title = t('Steps today') + ': ' + v; },
  log_weight(p, x) { const v = Math.round(Number(x.kg) * 10) / 10; if (!(v >= 20 && v <= 400)) bad('Check the number: weight in kg, 20–400.'); p.data = { v }; p.card.title = t('Weigh-in') + ': ' + v + ' ' + unit('kg'); },
  log_checkin(p, x) { const m = Math.min(5, Math.max(1, n0(x.mood))); p.data = { m, note: str(x.note, 300) }; p.card.title = t('Evening check-in') + ': ' + mood(m); p.card.body = p.data.note; if (p.data.note) p.card.who = t('Your coach sees the note.'); },
  tick_exercise(p, x, R) { const r = ref(R, x.item, 'exercise'); if (!r || !r.item) bad('Tune pointed to an exercise that is not in today’s workout.'); p.data = { id: r.item.id, done: x.done !== false }; p.card.title = exName(r.item.exercise) + ': ' + (p.data.done ? t('done') : t('not done')); },
  remove_log(p, x, R) { const r = ref(R, x.log, 'log'); if (!r) bad('Tune pointed to a log entry that is not in today’s list.'); const l = r.log; p.data = { id: l.id }; p.card.icon = 'x'; p.card.title = t('Remove from today’s log');
    p.card.body = l.kind === 'food' ? (l.note || t('Meal')) + ' · ' + n0(l.value) + ' ' + unit('kcal') : l.kind === 'water' ? t('Water') + ' ' + n0(l.value) + ' ' + unit('ml') : l.kind === 'steps' ? n0(l.value) + ' ' + t('steps') : l.kind === 'weight' ? t('Weigh-in') + ' ' + l.value + ' ' + unit('kg') : t('Evening check-in') + ': ' + mood(l.value); },
  send_message(p, x, R) {
    const text = String(x.text || '').trim().slice(0, 2000); if (!text) bad('The message is empty.');
    let pairId, to;
    if (S.me.role === 'coach') { const c = client(R, x.client); pairId = c.id; to = c.trainee.name; }
    else { if (!S.pair || S.pair.status !== 'active') bad('You have no active coach to write to.'); pairId = S.pair.id; to = (S.pair.coach || {}).name || t('Your coach'); }
    p.data = { pairId, text }; p.card = { icon: 'chat', title: t('Message to {name}', { name: to }), body: text, who: t('Sent as you, in your chat with {name}.', { name: firstName(to) }) };
  },
  update_my_answers(p, x) {
    const patch = {}; const lines = [];
    if (x.weight_kg != null) { const w = Math.round(Number(x.weight_kg) * 10) / 10; if (!(w >= 20 && w <= 400)) bad('Check the number: weight in kg, 20–400.'); patch.weight_kg = w; lines.push(t('Weight') + ': ' + w + ' ' + unit('kg')); }
    if (x.height_cm != null) { const h = n0(x.height_cm); if (h < 100 || h > 250) bad('Check the number: height in cm, 100–250.'); patch.height_cm = h; lines.push(t('Height') + ': ' + h + ' ' + unit('cm')); }
    for (const [k, g, label] of [['experience', 'experience', 'Experience'], ['goal', 'goal', 'Main goal'], ['format', 'format', 'How you want to train']]) if (x[k] != null) { if (!['beginner', 'some', 'regular', 'lose', 'gain', 'tone', 'health', 'sport', 'inperson', 'online', 'either'].includes(x[k])) bad('Tune gave an answer the form does not have.'); patch[k] = x[k]; lines.push(t(label) + ': ' + opt(g, x[k])); }
    for (const [k, n, label] of [['goal_detail', 300, 'Anything specific?'], ['injuries', 300, 'Injuries or limits'], ['diet', 200, 'Diet']]) if (x[k] != null) { patch[k] = str(x[k], n); lines.push(t(label) + ': ' + (patch[k] || '—')); }
    if (!lines.length) bad('Tune did not say what to change.');
    p.data = { patch }; p.card = { icon: 'edit', title: t('Update my answers'), body: lines.join('\n'), who: t('Your coach sees the changes.') };
  },
  send_feedback(p, x) { const text = String(x.text || '').trim().slice(0, 2000); if (!text) bad('Write a few words first.'); p.data = { text }; p.card = { icon: 'mail', title: t('Feedback to the Tune Up team'), body: text, who: '' }; },
  add_session(p, x, R) {
    const c = client(R, x.client); const at = when(x.date, x.time); const minutes = Math.min(240, Math.max(15, n0(x.minutes || 60)));
    const where = x.where === 'video' ? 'video' : 'gym'; let place = str(x.place, 300);
    if (where === 'video' && !/^https?:\/\//i.test(place)) bad('A video session needs the call link (starts with https://). Paste it to Tune or add the session in Calendar.');
    if (where === 'gym' && !place) place = (S.coachProfile && S.coachProfile.gym) || '';
    const repeat = x.repeat === 'weekly' ? 'weekly' : 'none'; const note = str(x.note, 300);
    p.data = { row: { pair_id: c.id, starts_at: at.toISOString(), minutes, where_kind: where, place, note, repeat, created_by: S.me.id } };
    p.card = { icon: 'cal', title: t('New session with {name}', { name: c.trainee.name }), body: whenText(at) + ' · ' + minutes + ' ' + t('min') + '\n' + (where === 'video' ? t('Video call') : (place || t('In person'))) + (repeat === 'weekly' ? '\n' + t('every {day}', { day: dayName(weekdayOf(at)) }) : '') + (note ? '\n' + note : ''), who: t('{name} is notified.', { name: firstName(c.trainee.name) }) };
  },
  move_session(p, x, R) {
    const r = ref(R, x.session, 'session'); if (!r) bad('Tune pointed to a session that is not in your calendar.'); const o = r.o; const at = when(x.date, x.time); const note = str(x.note, 300); const nm = r.c ? r.c.trainee.name : '';
    p.data = { id: o.s.id, weekly: o.s.repeat === 'weekly', onDate: o.origDate || o.date, at: at.toISOString(), note };
    p.card = { icon: 'cal', title: t('Move the session with {name}', { name: nm }), body: whenText(o.at) + ' → ' + whenText(at) + (p.data.weekly ? '\n' + t('Only this week; the weekly session stays.') : '') + (note ? '\n' + note : ''), who: t('{name} is notified.', { name: firstName(nm) }) };
  },
  cancel_session(p, x, R) {
    const r = ref(R, x.session, 'session'); if (!r) bad('Tune pointed to a session that is not in your calendar.'); const o = r.o; const note = str(x.note, 300); const nm = r.c ? r.c.trainee.name : '';
    p.data = { id: o.s.id, weekly: o.s.repeat === 'weekly', onDate: o.origDate || o.date, note };
    p.card = { icon: 'x', title: t('Cancel the session with {name}', { name: nm }), body: whenText(o.at) + ' · ' + o.s.minutes + ' ' + t('min') + (p.data.weekly ? '\n' + t('Only this week; the weekly session stays.') : '') + (note ? '\n' + note : ''), who: t('{name} is notified.', { name: firstName(nm) }) };
  },
  set_targets(p, x, R) {
    const c = client(R, x.client); const old = c.targets || {}; const next = { kcal: old.kcal || null, protein_g: old.protein_g || null, water_ml: old.water_ml || null, steps: old.steps || null }; const lines = [];
    const lim = { kcal: [800, 6000, unit('kcal'), 'Calories'], protein_g: [20, 400, unit('g'), 'Protein'], water_ml: [500, 8000, unit('ml'), 'Water'], steps: [1000, 40000, '', 'Steps'] };
    for (const k of Object.keys(lim)) if (x[k] != null) { const v = n0(x[k]); if (v < lim[k][0] || v > lim[k][1]) bad('Check the numbers: calories 800–6000, protein 20–400 g, water 500–8000 ml, steps 1000–40000.'); lines.push(t(lim[k][3]) + ': ' + (old[k] ? old[k] + ' → ' : '') + v + (lim[k][2] ? ' ' + lim[k][2] : '')); next[k] = v; }
    if (!lines.length) bad('Tune did not say which target to change.');
    p.data = { pairId: c.id, next }; p.card = { icon: 'chart', title: t('Daily targets for {name}', { name: c.trainee.name }), body: lines.join('\n'), who: t('{name} sees them on Today.', { name: firstName(c.trainee.name) }) };
  },
  add_goal(p, x, R) { const c = client(R, x.client); const text = str(x.text, 200); if (text.length < 2) bad('The goal is empty.'); p.data = { pairId: c.id, text }; p.card = { icon: 'check', title: t('New goal for {name}', { name: c.trainee.name }), body: text, who: t('{name} sees it on Today.', { name: firstName(c.trainee.name) }) }; },
  set_goal_done(p, x, R) { const r = ref(R, x.goal, 'goal'); if (!r) bad('Tune pointed to a goal that is not in the list.'); const done = x.done !== false; p.data = { id: r.g.id, pairId: r.c.id, done }; p.card = { icon: 'check', title: (done ? t('Goal reached') : t('Goal not reached yet')) + ' · ' + r.c.trainee.name, body: r.g.text, who: '' }; },
  remove_goal(p, x, R) { const r = ref(R, x.goal, 'goal'); if (!r) bad('Tune pointed to a goal that is not in the list.'); p.data = { id: r.g.id, pairId: r.c.id }; p.card = { icon: 'x', title: t('Remove goal · {name}', { name: r.c.trainee.name }), body: r.g.text, who: '' }; },
  add_plan_items(p, x, R) {
    const c = client(R, x.client); const list = Array.isArray(x.items) ? x.items.slice(0, 40) : []; if (!list.length) bad('Tune did not list any exercises.');
    const rows = list.map(it => {
      const day = n0(it.day); if (day < 1 || day > 7) bad('Tune gave a day that does not exist.');
      let ex = it.exercise ? ref(R, it.exercise, 'exercise') : null; ex = ex ? ex.x : findExercise(it.exercise_name); const newName = ex ? '' : str(it.exercise_name, 80);
      if (!ex && newName.length < 2) bad('Tune pointed to an exercise that is not in the library.');
      return { day, ex, newName, sets: Math.min(20, Math.max(1, n0(it.sets) || 3)), reps: str(it.reps, 20) || '10', load: str(it.load, 40), note: str(it.note, 120) };
    });
    p.data = { pairId: c.id, rows };
    const news = rows.filter(r => r.newName).map(r => r.newName);
    p.card = { icon: 'plan', title: t('Add to {name}’s plan', { name: c.trainee.name }) + ' · ' + (rows.length === 1 ? t('1 exercise') : t('{n} exercises', { n: rows.length })),
      body: [1, 2, 3, 4, 5, 6, 7].filter(d => rows.some(r => r.day === d)).map(d => dayName(d) + ':\n' + rows.filter(r => r.day === d).map(r => '• ' + itemText(r.ex ? exName(r.ex) : r.newName, r)).join('\n')).join('\n') + (news.length ? '\n' + t('New in My exercises: {list}', { list: [...new Set(news)].join(', ') }) : ''),
      who: t('{name} sees the plan right away.', { name: firstName(c.trainee.name) }) };
  },
  update_plan_item(p, x, R) {
    const r = ref(R, x.item, 'item'); if (!r) bad('Tune pointed to a plan exercise that does not exist.'); const it = r.it; const patch = {};
    if (x.day != null) { const d = n0(x.day); if (d < 1 || d > 7) bad('Tune gave a day that does not exist.'); patch.day = d; }
    if (x.sets != null) patch.sets = Math.min(20, Math.max(1, n0(x.sets)));
    if (x.reps != null) patch.reps = str(x.reps, 20) || it.reps; if (x.load != null) patch.load = str(x.load, 40); if (x.note != null) patch.note = str(x.note, 120);
    if (!Object.keys(patch).length) bad('Tune did not say what to change.');
    const after = Object.assign({}, it, patch); const nm = it.exercise ? exName(it.exercise) : '';
    p.data = { id: it.id, pairId: r.c.id, patch };
    p.card = { icon: 'plan', title: t('Change in {name}’s plan', { name: r.c.trainee.name }), body: dayName(it.day) + ': ' + itemText(nm, it) + '\n→ ' + dayName(after.day) + ': ' + itemText(nm, after), who: t('{name} sees the plan right away.', { name: firstName(r.c.trainee.name) }) };
  },
  remove_plan_items(p, x, R) {
    const list = (Array.isArray(x.items) ? x.items : []).map(k => ref(R, k, 'item')); if (!list.length || list.some(r => !r)) bad('Tune pointed to a plan exercise that does not exist.');
    const names = [...new Set(list.map(r => r.c.trainee.name))];
    p.data = { ids: list.map(r => r.it.id), pairIds: [...new Set(list.map(r => r.c.id))] };
    p.card = { icon: 'x', title: t('Remove from {name}’s plan', { name: names.join(', ') }) + ' · ' + (list.length === 1 ? t('1 exercise') : t('{n} exercises', { n: list.length })), body: list.slice().sort((a, b) => a.it.day - b.it.day).map(r => '• ' + dayName(r.it.day, true) + ' — ' + (r.it.exercise ? exName(r.it.exercise) : '')).join('\n'), who: '' };
  },
  add_private_note(p, x, R) { const c = client(R, x.client); const text = str(x.text, 500); if (!text) bad('The note is empty.'); p.data = { pairId: c.id, text }; p.card = { icon: 'edit', title: t('Private note about {name}', { name: c.trainee.name }), body: text, who: t('Only you see your notes.') }; }
};

// ---- run (after Yes, or at once for INSTANT). Throws a readable Error when it cannot be done.
export async function run(p) {
  const d = p.data; const uid = S.me.id; const day = S.today ? S.today.day : isoDate();
  try { await RUN[p.name](d, uid, day); }
  catch (e) { if (e instanceof Bad) throw e; console.warn('tune action', p.name, e); throw new Error(t('Could not save — try again')); }
}
async function todayReload() { if (S.today) { try { S.today.logs = await db.logsForDay(S.me.id, S.today.day); } catch (e) {} } }
const RUN = {
  async log_food(d, uid, day) { await db.addLog(uid, day, 'food', d.kcal, { protein_g: d.protein_g, note: d.note }); await todayReload(); },
  async log_water(d, uid, day) { await db.addLog(uid, day, 'water', d.ml); await todayReload(); },
  async log_steps(d, uid, day) { await db.setDayLog(uid, day, 'steps', d.v); await todayReload(); },
  async log_weight(d, uid, day) { await db.setDayLog(uid, day, 'weight', d.v); await todayReload(); try { const r = await db.updateTraineeProfile(uid, { weight_kg: d.v }); S.traineeProfile = Object.assign({}, S.traineeProfile, { weight_kg: d.v }, r || {}); } catch (e) {} },
  async log_checkin(d, uid, day) { await db.setDayLog(uid, day, 'checkin', d.m, d.note); await todayReload(); },
  async tick_exercise(d, uid, day) { await db.setExerciseDone(uid, day, d.id, d.done); await todayReload(); },
  async remove_log(d) { await db.deleteLog(d.id); await todayReload(); },
  async send_message(d, uid) {
    const m = await db.sendMessage(d.pairId, uid, d.text);
    if (S.chat && S.chat.threads && S.chat.threads[d.pairId]) S.chat.threads[d.pairId].list.push(m);
    if (S.chat && S.chat.index && S.chat.index[d.pairId]) S.chat.index[d.pairId].last = m;
  },
  async update_my_answers(d, uid) { const r = await db.updateTraineeProfile(uid, d.patch); S.traineeProfile = Object.assign({}, S.traineeProfile, d.patch, r || {}); },
  async send_feedback(d, uid) { await db.sendFeedback(uid, S.me.role || '', 'tune', d.text); },
  async add_session(d) { await db.addSession(d.row); await loadSessions(); },
  async move_session(d) { if (d.weekly) await db.addSessionException({ session_id: d.id, on_date: d.onDate, moved_to: d.at, note: d.note }); else await db.updateSession(d.id, { starts_at: d.at, status: 'planned', cancel_note: d.note }); await loadSessions(); },
  async cancel_session(d) { if (d.weekly) await db.addSessionException({ session_id: d.id, on_date: d.onDate, moved_to: null, note: d.note }); else await db.updateSession(d.id, { status: 'cancelled', cancel_note: d.note }); await loadSessions(); },
  async set_targets(d) { await db.saveTargets(d.pairId, d.next); const c = (S.clients || []).find(x => x.id === d.pairId); if (c) c.targets = Object.assign({ pair_id: d.pairId }, d.next); if (planOf(d.pairId)) S.plan.targets = Object.assign({ pair_id: d.pairId }, d.next); },
  async add_goal(d) { const pl = planOf(d.pairId); const g = await db.addGoal(d.pairId, d.text, pl ? pl.goals.length : 50); if (pl) pl.goals.push(g); },
  async set_goal_done(d) { await db.updateGoal(d.id, { done: d.done }); const pl = planOf(d.pairId); const g = pl && pl.goals.find(x => x.id === d.id); if (g) g.done = d.done; },
  async remove_goal(d) { await db.deleteGoal(d.id); const pl = planOf(d.pairId); if (pl) pl.goals = pl.goals.filter(x => x.id !== d.id); },
  async add_plan_items(d) {
    const cur = await db.planItemsFull([d.pairId]); const pos = {}; cur.forEach(i => { pos[i.day] = (pos[i.day] || 0) + 1; });
    const made = {}; let ok = 0;
    try {
      for (const r of d.rows) {
        let ex = r.ex;
        if (!ex) { ex = findExercise(r.newName) || made[r.newName.toLowerCase()]; if (!ex) { ex = await db.addExercise(S.me.id, { name: r.newName, muscle: '', video_url: '', note: '' }); made[r.newName.toLowerCase()] = ex; if (S.exercises) S.exercises.push(ex); } }
        await db.addPlanItem({ pair_id: d.pairId, day: r.day, exercise_id: ex.id, position: pos[r.day] = (pos[r.day] || 0) + 1, sets: r.sets, reps: r.reps, load: r.load, note: r.note }); ok++;
      }
    } finally { await afterPlanChange(d.pairId); }
    if (ok < d.rows.length) throw new Bad(t('Only {n} of {m} exercises were added.', { n: ok, m: d.rows.length }));
  },
  async update_plan_item(d) { await db.updatePlanItem(d.id, d.patch); await afterPlanChange(d.pairId); },
  async remove_plan_items(d) { try { for (const id of d.ids) await db.deletePlanItem(id); } finally { for (const p of d.pairIds) await afterPlanChange(p); } },
  async add_private_note(d) {
    const cur = await db.getCoachNote(d.pairId); const old = (cur && cur.text) || ''; const line = fmtDay(isoDate(), 'dm') + ': ' + d.text;
    const text = (old ? old.replace(/\s+$/, '') + '\n' : '') + line; await db.saveCoachNote(d.pairId, text); if (S.mon && S.mon.notes) S.mon.notes[d.pairId] = { text };
  }
};
