// Tune Up beta — what Tune knows, as plain text, rebuilt before every question. Only data the signed-in person can
// already read through RLS goes in. Things Tune may act on get short references ([C1], [S2], [P4] …); the same call
// returns `refs`, the map from those references back to the real rows, which tuneact.js uses.
// A trainee's Tune reads: their plan, logs, targets, goals, sessions, their answers and the chat with their coach.
// A coach's Tune reads: every active client's day/week, plan, targets, goals, check-ins, chat and the coach's own
// private notes. Neither side ever gets the other's Tune conversation; the coach's notes never reach a trainee.
import { isoDate, addDays, weekdayOf, fmtTime, MOODS, exName, opt, LANG } from './i18n.js';
import * as db from './db.js';
import { S } from './state.js';
import { sumDay, oneOf } from './log.js';
import { statsFor, flagsFor } from './monitor.js';
import { loadSessions, occurrences } from './calendar.js';

// What Tune reads is always in English (days, dates, moods), whatever the app language: Georgian short day names
// (ორშ, სამ, ოთხ… — also the words for 2, 3, 4) made the model put exercises on the wrong day. It still answers in the user's language.
const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayName(d, short) { const n = EN_DAYS[(d - 1) % 7]; return short ? n.slice(0, 3) : n; }
function fmtDay(iso, o) { const d = new Date(iso + 'T00:00:00'); const dm = d.getDate() + ' ' + EN_MON[d.getMonth()]; return o === 'dm' ? dm : dayName(weekdayOf(d), true) + ' ' + dm; }
function mood(v) { return MOODS[v] ? MOODS[v].toLowerCase() : ''; }

const n0 = v => Math.round(Number(v) || 0);
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const q = s => '"' + cut(s, 300).replace(/"/g, "'") + '"';
function tpOf(c) { const p = c.trainee && c.trainee.trainee_profiles; return (Array.isArray(p) ? p[0] : p) || {}; }
function stamp(ts) { const d = new Date(ts); return fmtDay(isoDate(d), 'dm') + ' ' + fmtTime(d); }
function itemLine(i) { return [i.sets + '×' + i.reps, i.load, i.note ? q(i.note) : ''].filter(Boolean).join(' '); }
function todayLine() { const d = isoDate(); return d + ', ' + dayName(weekdayOf(), false) + ' (' + fmtDay(d) + ')'; }
function answers(p) { return ['weight ' + (p.weight_kg ? p.weight_kg + ' kg' : '—'), 'height ' + (p.height_cm ? p.height_cm + ' cm' : '—'), 'experience ' + (p.experience || '—'), 'goal ' + (p.goal || '—'), p.goal_detail ? 'goal detail ' + q(p.goal_detail) : '', 'injuries ' + (p.injuries ? q(p.injuries) : 'none given'), 'diet ' + (p.diet ? q(p.diet) : '—'), 'trains ' + (p.format || '—')].filter(Boolean).join(', '); }
function chatLines(list, nameOf) { return list.length ? list.map(m => '  [' + stamp(m.created_at) + '] ' + nameOf(m) + ': ' + q(m.text)).join('\n') : '  (no messages yet)'; }
function targetsLine(tg) { return tg && (tg.kcal || tg.protein_g || tg.water_ml || tg.steps) ? [tg.kcal ? tg.kcal + ' kcal' : '', tg.protein_g ? tg.protein_g + ' g protein' : '', tg.water_ml ? tg.water_ml / 1000 + ' L water' : '', tg.steps ? tg.steps + ' steps' : ''].filter(Boolean).join(', ') : 'not set'; }

// ---- load fresh data before each question (cheap: a few small queries)
export async function loadTuneData(focus) {
  const D = {};
  if (!S.cal) { try { await loadSessions(); } catch (e) {} }
  if (S.me.role === 'trainee') {
    const today = isoDate(); const p = S.pair;
    const [hist, msgs] = await Promise.all([db.logsBetween(S.me.id, addDays(today, -6), addDays(today, -1)).catch(() => []), p && p.status === 'active' ? db.messages(p.id, 24).catch(() => []) : []]);
    D.hist = hist; D.msgs = (msgs || []).slice().reverse();
    if (S.today) { try { S.today.logs = await db.logsForDay(S.me.id, S.today.day); } catch (e) {} }
  } else {
    const ids = (S.clients || []).filter(c => c.status === 'active').map(c => c.id);
    const [items, goals, notes, msgs] = await Promise.all([db.planItemsFull(ids), db.goalsForPairs(ids), db.coachNotesFor(ids), ids.length ? db.recentMessages(ids) : []]);
    D.items = items; D.goals = goals; D.notes = notes; D.msgs = msgs || [];
    if (!S.exercises) S.exercises = await db.listExercises();
  }
  D.focus = focus || null;
  return D;
}

// ---- trainee
export function traineeContext(D) {
  const R = {}; const p = S.pair || {}; const coach = p.coach || {}; const tg = (S.plan && S.plan.targets) || {}; const L = (S.today && S.today.logs) || []; const today = isoDate();
  const items = S.plan ? S.plan.items : []; const td = weekdayOf(); const done = new Set(L.filter(l => l.kind === 'exercise').map(l => l.ref));
  let e = 0; const workout = items.filter(i => i.day === td).map(i => { const ref = 'E' + (++e); R[ref] = { type: 'exercise', item: i }; return '[' + ref + '] ' + exName(i.exercise) + ' ' + itemLine(i) + (done.has(i.id) ? ' — done' : ' — not done yet'); });
  let l = 0; const logs = L.filter(x => x.kind !== 'exercise').sort((a, b) => (a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1 : 0).map(x => { const ref = 'L' + (++l); R[ref] = { type: 'log', log: x };
    const what = x.kind === 'food' ? 'food ' + q(x.note || 'meal') + ' ' + n0(x.value) + ' kcal' + (x.protein_g ? ' / ' + n0(x.protein_g) + ' g protein' : '') : x.kind === 'water' ? 'water ' + n0(x.value) + ' ml' : x.kind === 'steps' ? 'steps ' + n0(x.value) : x.kind === 'weight' ? 'weigh-in ' + x.value + ' kg' : x.kind === 'checkin' ? 'evening check-in ' + mood(x.value) + (x.note ? ' ' + q(x.note) : '') : x.kind;
    return '[' + ref + '] ' + what; });
  const steps = oneOf(L, 'steps'), weight = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
  const days = [6, 5, 4, 3, 2, 1].map(n => addDays(today, -n)).map(d => { const X = (D.hist || []).filter(x => x.day === d); if (!X.length) return null; const w = oneOf(X, 'weight'), c = oneOf(X, 'checkin'), s = oneOf(X, 'steps'); return d + ': ' + [X.filter(x => x.kind === 'exercise').length ? 'exercises done ' + X.filter(x => x.kind === 'exercise').length : '', sumDay(X, 'food') ? n0(sumDay(X, 'food')) + ' kcal / ' + n0(sumDay(X, 'food', 'protein_g')) + ' g protein' : '', sumDay(X, 'water') ? sumDay(X, 'water') / 1000 + ' L water' : '', s ? n0(s.value) + ' steps' : '', w ? w.value + ' kg' : '', c ? 'mood ' + mood(c.value) + (c.note ? ' ' + q(c.note) : '') : ''].filter(Boolean).join(', '); }).filter(Boolean);
  const sess = occurrences(today, addDays(today, 14)).filter(o => !o.cancelled).map(o => isoDate(o.at) + ' ' + fmtDay(o.date) + ' ' + fmtTime(o.at) + ', ' + o.s.minutes + ' min, ' + (o.s.where_kind === 'video' ? 'video call' : (o.s.place || 'in person')) + (o.s.repeat === 'weekly' ? ', weekly' : '') + (o.moved ? ' (moved)' : '') + (o.s.note ? ' ' + q(o.s.note) : ''));
  const text = [
    'Trainee: ' + S.me.name + '. Coach: ' + (coach.name || 'none') + (coach.lang ? ' (app language ' + (coach.lang === 'ka' ? 'Georgian' : 'English') + ')' : '') + (p.status === 'active' ? '' : ' (coaching ended — no messages possible)') + '. Today: ' + todayLine() + '.',
    'Daily targets (set by the coach): ' + targetsLine(tg) + '.',
    "TODAY'S WORKOUT: " + (workout.length ? workout.join('; ') : items.length ? 'rest day' : 'none — the coach has not made a plan yet'),
    'Weekly plan: ' + (!items.length ? 'not made yet (the coach builds it; logging food, water, steps and weight works already)' : '') + (!items.length ? '' : [1, 2, 3, 4, 5, 6, 7].map(d => dayName(d, true) + ': ' + (items.filter(i => i.day === d).map(i => exName(i.exercise) + ' ' + i.sets + '×' + i.reps).join(', ') || 'rest')).join(' | ')),
    "TODAY'S LOGS: " + (logs.length ? logs.join('; ') : 'nothing logged yet'),
    'Totals today: ' + n0(sumDay(L, 'food')) + ' kcal / ' + n0(sumDay(L, 'food', 'protein_g')) + ' g protein; water ' + sumDay(L, 'water') / 1000 + ' L; steps ' + (steps ? n0(steps.value) : 'not logged') + '; weigh-in ' + (weight ? weight.value + ' kg' : 'not logged') + '; evening check-in ' + (ci ? mood(ci.value) : 'not done') + '.',
    'Last 6 days: ' + (days.length ? days.join(' | ') : 'nothing logged'),
    'Goals (set by the coach): ' + (((S.plan && S.plan.goals) || []).map(g => g.text + (g.done ? ' (reached)' : '')).join('; ') || 'none'),
    'Sessions next 14 days (only the coach can add, move or cancel): ' + (sess.length ? sess.join('; ') : 'none planned'),
    'MY ANSWERS (the trainee can change these): ' + answers(S.traineeProfile || {}),
    'CHAT with the coach (latest last):\n' + chatLines(D.msgs || [], m => m.sender_id === S.me.id ? S.me.name + ' (the user)' : (coach.name || 'Coach') + ' (coach)')
  ].join('\n');
  return { text, refs: R };
}

// ---- coach
export function coachContext(D) {
  const R = {}; const active = (S.clients || []).filter(c => c.status === 'active'); const today = isoDate();
  let gN = 0, pN = 0;
  const blocks = active.map((c, i) => {
    const ref = 'C' + (i + 1); R[ref] = { type: 'client', c }; const tp = tpOf(c); const st = statsFor(c); const f = flagsFor(c, st); const d = st.today;
    const goals = D.goals.filter(g => g.pair_id === c.id).map(g => { const r = 'G' + (++gN); R[r] = { type: 'goal', g, c }; return '[' + r + '] ' + q(g.text) + (g.done ? ' (reached)' : ''); });
    const its = D.items.filter(x => x.pair_id === c.id);
    const plan = [1, 2, 3, 4, 5, 6, 7].map(dd => { const L = its.filter(x => x.day === dd).map(x => { const r = 'P' + (++pN); R[r] = { type: 'item', it: x, c }; return '[' + r + '] ' + (x.exercise ? x.exercise.name : '?') + ' ' + itemLine(x); }); return dayName(dd, true) + ': ' + (L.join('; ') || 'rest'); }).join(' | ');
    const note = D.notes.find(n => n.pair_id === c.id);
    const chat = D.msgs.filter(m => m.pair_id === c.id).slice(0, D.focus === c.id ? 30 : 10).reverse();
    return '[' + ref + '] ' + c.trainee.name + ' (app language ' + (c.trainee.lang === 'ka' ? 'Georgian' : 'English') + ')' + (D.focus === c.id ? ' ← the coach is looking at this client right now (default client)' : '') + '\n' +
      '  Answers: ' + answers(tp) + '. Coaching since ' + String(c.started_at || '').slice(0, 10) + ', format ' + (c.format || '—') + '.\n' +
      '  Today: ' + (d.planned ? 'workout ' + d.done + '/' + d.planned : 'rest day') + ', ' + n0(d.kcal) + ' kcal / ' + n0(d.prot) + ' g protein' + (d.water ? ', ' + d.water / 1000 + ' L' : '') + (d.steps ? ', ' + n0(d.steps.value) + ' steps' : '') + (d.ci ? ', check-in ' + mood(d.ci.value) + (d.ci.note ? ' ' + q(d.ci.note) : '') : '') + '.\n' +
      '  Last 7 days: workouts ' + st.workouts[0] + '/' + st.workouts[1] + ', avg ' + st.avgKcal + ' kcal / ' + st.avgProt + ' g protein, avg ' + st.avgSteps + ' steps' + (st.lastWeight ? ', weight ' + st.lastWeight.value + ' kg (' + st.lastWeight.day + ')' : '') + (st.lastLog ? ', last log ' + st.lastLog : ', nothing logged yet') + (f.length ? '. Flags: ' + f.map(x => x.label + ' (' + x.sub + ')').join('; ') : '') + '.\n' +
      '  CHECK-INS: ' + (st.cis.slice(0, 5).map(x => x.day + ' ' + mood(x.value) + (x.note ? ' ' + q(x.note) : '')).join('; ') || 'none') + '\n' +
      '  Targets: ' + targetsLine(c.targets) + '\n' +
      '  Goals: ' + (goals.join('; ') || 'none') + '\n' +
      '  Plan: ' + plan + '\n' +
      "  Coach's private NOTES (only the coach sees them): " + (note && note.text ? q(note.text) : 'none') + '\n' +
      '  CHAT (latest last):\n' + chatLines(chat, m => m.sender_id === S.me.id ? S.me.name + ' (the coach, the user)' : c.trainee.name + ' (client)');
  });
  let sN = 0;
  const sess = occurrences(today, addDays(today, 21)).filter(o => !o.cancelled && o.at.getTime() > Date.now() - 3600000).map(o => { const r = 'S' + (++sN); const c = active.find(x => x.id === o.s.pair_id); R[r] = { type: 'session', o, c }; const cref = Object.keys(R).find(k => R[k].type === 'client' && R[k].c === c);
    return '[' + r + '] ' + isoDate(o.at) + ' ' + dayName(weekdayOf(o.at), true) + ' ' + fmtTime(o.at) + ', ' + o.s.minutes + ' min, ' + (c ? c.trainee.name + ' [' + cref + ']' : '?') + ', ' + (o.s.where_kind === 'video' ? 'video call' : (o.s.place || 'in person')) + (o.s.repeat === 'weekly' ? ', weekly (moving/cancelling changes only this week)' : '') + (o.moved ? ', moved' : ''); });
  let xN = 0;
  const lib = (S.exercises || []).slice().sort((a, b) => (a.owner_id ? 0 : 1) - (b.owner_id ? 0 : 1) || a.name.localeCompare(b.name)).map(x => { const r = 'X' + (++xN); R[r] = { type: 'exercise', x }; return '[' + r + '] ' + x.name + (LANG.cur === 'ka' && x.name_ka ? ' / ' + x.name_ka : '') + (x.muscle ? ' — ' + x.muscle : '') + (x.owner_id ? ' (own' + (x.video_url ? ', video' : '') + ')' : ''); });
  const cp = S.coachProfile || {};
  const text = [
    'Coach: ' + S.me.name + '. Today: ' + todayLine() + '. Active clients: ' + active.length + '.' + (D.focus ? '' : ' No client is open; if a request could mean more than one client, ask which.'),
    "Coach's gym (default place for gym sessions): " + (cp.gym || 'not set') + '. Online coaching: ' + (cp.online ? 'yes' : 'no') + '.',
    'CLIENTS:\n' + (blocks.join('\n') || 'no active clients yet'),
    'SESSIONS next 3 weeks:\n' + (sess.join('\n') || 'none planned'),
    'LIBRARY (exercises for plans):\n' + lib.join('\n')
  ].join('\n');
  return { text, refs: R };
}
