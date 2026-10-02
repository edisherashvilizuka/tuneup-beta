// Tune Up beta — "Tune", the in-app assistant. Answers from the user's own data and logs what a trainee types.
// The question goes to the `tune` Edge Function with a plain-text summary of what the app already knows; the reply's
// actions (log_food, log_water, …) are written here through the normal RLS-checked queries.
import { t, esc, LANG, firstName, isoDate, addDays, dayName, weekdayOf, fmtDay, fmtTime, mood, exName, unit, opt } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, cur } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { sumDay, oneOf } from './log.js';
import { statsFor, flagsFor } from './monitor.js';
import { loadSessions, occurrences } from './calendar.js';
import { track } from './chat.js';

const n0 = v => Math.round(Number(v) || 0);
function tuneState() { S.tune = S.tune || { msgs: [], busy: false, hist: null }; return S.tune; }

// ---- what Tune knows (plain text; only the signed-in person's own data)
function sessionLines(days) {
  const today = isoDate(); const list = occurrences(today, addDays(today, days)).filter(o => !o.cancelled);
  return list.length ? list.map(o => fmtDay(o.date) + ' ' + fmtTime(o.at) + ' · ' + o.s.minutes + ' min · ' + (o.s.where_kind === 'video' ? 'video call' : (o.s.place || 'in person')) + (S.me.role === 'coach' ? ' · ' + clientName(o.s.pair_id) : '') + (o.moved ? ' (moved)' : '')).join('\n') : 'none planned';
}
function clientName(pairId) { const c = (S.clients || []).find(x => x.id === pairId); return c ? c.trainee.name : ''; }
function traineeContext() {
  const p = S.pair || {}; const coach = p.coach || {}; const tg = (S.plan && S.plan.targets) || {}; const L = (S.today && S.today.logs) || []; const today = isoDate();
  const items = (S.plan ? S.plan.items : []); const td = weekdayOf(); const done = new Set(L.filter(l => l.kind === 'exercise').map(l => l.ref));
  const foods = L.filter(l => l.kind === 'food').map(l => (l.note || 'meal') + ' ' + n0(l.value) + ' kcal' + (l.protein_g ? ' / ' + n0(l.protein_g) + ' g protein' : ''));
  const steps = oneOf(L, 'steps'), weight = oneOf(L, 'weight'), ci = oneOf(L, 'checkin');
  const hist = tuneState().hist || [];
  const days = [6, 5, 4, 3, 2, 1].map(n => addDays(today, -n)).map(d => { const D = hist.filter(l => l.day === d); if (!D.length) return null; const w = oneOf(D, 'weight'), c = oneOf(D, 'checkin'), s = oneOf(D, 'steps'); return fmtDay(d, 'dm') + ': ' + [D.filter(l => l.kind === 'exercise').length ? 'exercises done ' + D.filter(l => l.kind === 'exercise').length : '', sumDay(D, 'food') ? n0(sumDay(D, 'food')) + ' kcal / ' + n0(sumDay(D, 'food', 'protein_g')) + ' g protein' : '', sumDay(D, 'water') ? sumDay(D, 'water') / 1000 + ' L water' : '', s ? n0(s.value) + ' steps' : '', w ? w.value + ' kg' : '', c ? 'mood ' + c.value + '/5' + (c.note ? ' "' + c.note + '"' : '') : ''].filter(Boolean).join(', '); }).filter(Boolean);
  return [
    'Trainee: ' + S.me.name + '. Coach: ' + (coach.name || 'none') + (p.status === 'active' ? '' : ' (coaching ended)') + '. Today: ' + fmtDay(today) + ' (' + dayName(td) + ').',
    'Daily targets: ' + (tg.kcal || '?') + ' kcal, ' + (tg.protein_g || '?') + ' g protein, ' + (tg.water_ml ? tg.water_ml / 1000 + ' L' : '?') + ' water, ' + (tg.steps || '?') + ' steps.',
    "Today's workout: " + (items.filter(i => i.day === td).length ? items.filter(i => i.day === td).map(i => exName(i.exercise) + ' ' + i.sets + '×' + i.reps + (i.load ? ' ' + i.load : '') + (done.has(i.id) ? ' (done)' : ' (not yet)')).join('; ') : 'rest day'),
    'Weekly plan: ' + [1, 2, 3, 4, 5, 6, 7].map(d => dayName(d, true) + ': ' + (items.filter(i => i.day === d).map(i => exName(i.exercise)).join(', ') || 'rest')).join(' | '),
    'Today so far: food ' + (foods.length ? foods.join('; ') : 'nothing logged') + ' — total ' + n0(sumDay(L, 'food')) + ' kcal / ' + n0(sumDay(L, 'food', 'protein_g')) + ' g protein; water ' + sumDay(L, 'water') / 1000 + ' L; steps ' + (steps ? n0(steps.value) : 'not logged') + '; weigh-in ' + (weight ? weight.value + ' kg' : 'not logged') + '; evening check-in ' + (ci ? mood(ci.value) + (ci.note ? ' "' + ci.note + '"' : '') : 'not done').replace(/\n/g, ' '),
    'Last 6 days: ' + (days.length ? days.join(' | ') : 'nothing logged'),
    'Goals: ' + (((S.plan && S.plan.goals) || []).map(g => g.text + (g.done ? ' (done)' : '')).join('; ') || 'none'),
    'Sessions next 14 days:\n' + sessionLines(14),
    'Profile: ' + [S.traineeProfile && S.traineeProfile.experience ? opt('experience', S.traineeProfile.experience) : '', S.traineeProfile && S.traineeProfile.goal ? opt('goal', S.traineeProfile.goal) : '', S.traineeProfile && S.traineeProfile.injuries ? 'injuries: ' + S.traineeProfile.injuries : '', S.traineeProfile && S.traineeProfile.diet ? 'diet: ' + S.traineeProfile.diet : ''].filter(Boolean).join(', ')
  ].join('\n');
}
function coachContext(focusId) {
  const active = (S.clients || []).filter(c => c.status === 'active'); const today = isoDate();
  const rows = active.map(c => { const st = statsFor(c); const f = flagsFor(c, st); const d = st.today; const tp = (c.trainee.trainee_profiles && (Array.isArray(c.trainee.trainee_profiles) ? c.trainee.trainee_profiles[0] : c.trainee.trainee_profiles)) || {}; const note = S.mon && S.mon.notes && S.mon.notes[c.id];
    return '- ' + c.trainee.name + (tp.goal ? ' (goal: ' + opt('goal', tp.goal) + ')' : '') + '. Today: ' + (d.planned ? 'workout ' + d.done + '/' + d.planned : 'rest day') + ', ' + n0(d.kcal) + ' kcal / ' + n0(d.prot) + ' g protein' + (d.water ? ', ' + d.water / 1000 + ' L' : '') + (d.steps ? ', ' + n0(d.steps.value) + ' steps' : '') + (d.ci ? ', check-in ' + mood(d.ci.value) + (d.ci.note ? ' "' + d.ci.note + '"' : '') : '') + '. Last 7 days: workouts ' + st.workouts[0] + '/' + st.workouts[1] + ', avg ' + st.avgKcal + ' kcal / ' + st.avgProt + ' g protein' + (st.lastWeight ? ', weight ' + st.lastWeight.value + ' kg (' + fmtDay(st.lastWeight.day, 'dm') + ')' : '') + (st.cis[0] ? ', last check-in ' + fmtDay(st.cis[0].day, 'dm') + ' ' + mood(st.cis[0].value) + (st.cis[0].note ? ' "' + st.cis[0].note + '"' : '') : '') + (st.lastLog ? ', last log ' + fmtDay(st.lastLog, 'dm') : ', nothing logged yet') + (f.length ? '. Flags: ' + f.map(x => x.label + ' (' + x.sub + ')').join('; ') : '') + (note ? '. Coach\'s private note: "' + note + '"' : ''); });
  const focus = focusId ? active.find(c => c.id === focusId) : null;
  return ['Coach: ' + S.me.name + '. Today: ' + fmtDay(today) + ' (' + dayName(weekdayOf()) + '). Active clients: ' + active.length + '.', (focus ? 'The coach is looking at ' + focus.trainee.name + ' right now.' : ''), rows.join('\n') || 'no clients yet', 'Sessions next 7 days:\n' + sessionLines(7)].filter(Boolean).join('\n');
}

// ---- the screen
SCREENS.tune = (params) => {
  const st = tuneState(); const client = params && params.client; const name = client ? clientName(client) : '';
  const intro = S.me.role === 'coach' ? t('Ask who missed, what is on today, or how a client is doing.') : t("Ask about today's workout, what is left to eat, or tell me what you ate — I will log it.");
  const body = '<div class="chat">' + '<div class="msg them">' + esc(intro) + '</div>' + st.msgs.map(m => '<div class="msg ' + (m.role === 'user' ? 'me' : 'them') + '">' + esc(m.content).replace(/\n/g, '<br>') + '</div>').join('') + (st.busy ? '<div class="msg them mute">' + t('Tune is thinking…') + '</div>' : '') + '</div>';
  return { title: 'Tune', sub: name ? t('about {name}', { name: firstName(name) }) : t('Your assistant'), tabs: false, body,
    footer: '<div class="composer"><input id="tq" placeholder="' + esc(t('Write to Tune')) + '" autocomplete="off" maxlength="1000"><button onclick="A.askTune(' + (client ? "'" + client + "'" : '') + ')" aria-label="Send">' + I.send + '</button></div>',
    after: async () => {
      const inp = document.getElementById('tq'); if (inp) { inp.addEventListener('keydown', e => { if (e.key === 'Enter') A.askTune(client); }); if (!st.busy) inp.focus(); }
      const b = document.getElementById('body'); if (b) b.scrollTop = b.scrollHeight;
      if (S.me.role === 'trainee' && !st.hist) { try { st.hist = await db.logsBetween(S.me.id, addDays(isoDate(), -6), addDays(isoDate(), -1)); } catch (e) { st.hist = []; } }
      if (!S.cal) { try { await loadSessions(); } catch (e) {} }
    } };
};

A.askTune = async (client) => {
  const st = tuneState(); const inp = document.getElementById('tq'); const q = (inp ? inp.value : '').trim(); if (!q || st.busy) return;
  inp.value = ''; st.msgs.push({ role: 'user', content: q }); st.busy = true; rerender();
  try {
    const context = S.me.role === 'coach' ? coachContext(client) : traineeContext();
    const res = await db.askTune({ context, lang: LANG.cur, messages: st.msgs.slice(-10).map(m => ({ role: m.role, content: m.content })) });
    const applied = await applyActions(res.actions || []); st.lastLogged = applied.join(', ');
    const text = res.text || (applied.length ? t('Logged') + ': ' + applied.join(', ') : t('Tune could not answer — try again'));
    st.msgs.push({ role: 'assistant', content: text }); if (st.msgs.length > 40) st.msgs = st.msgs.slice(-40);
    track('tune', { role: S.me.role, logged: applied.length });
  } catch (e) { st.msgs.push({ role: 'assistant', content: (e && e.message) || t('Tune could not answer — try again') }); }
  st.busy = false; if (cur().name === 'tune') rerender();
  if (st.lastLogged) { toast(t('Logged') + ': ' + st.lastLogged); st.lastLogged = ''; }
};

// trainee-only: write what Tune was asked to log, through the same queries the Today screen uses
async function applyActions(actions) {
  const out = []; if (S.me.role !== 'trainee' || !S.today) return out; const uid = S.me.id, day = S.today.day;
  for (const a of actions) {
    const x = a.input || {};
    try {
      if (a.name === 'log_food' && x.kcal != null) { await db.addLog(uid, day, 'food', n0(x.kcal), { protein_g: x.protein_g != null ? n0(x.protein_g) : null, note: String(x.note || '').slice(0, 120) }); out.push(t('Food') + ' ' + n0(x.kcal) + ' ' + unit('kcal')); }
      else if (a.name === 'log_water' && x.ml) { await db.addLog(uid, day, 'water', n0(x.ml)); out.push(t('Water') + ' ' + n0(x.ml) + ' ' + unit('ml')); }
      else if (a.name === 'log_steps' && x.steps != null) { await db.setDayLog(uid, day, 'steps', n0(x.steps)); out.push(n0(x.steps) + ' ' + t('steps')); }
      else if (a.name === 'log_weight' && x.kg) { await db.setDayLog(uid, day, 'weight', Math.round(Number(x.kg) * 10) / 10); out.push(t('Weigh-in') + ' ' + x.kg + ' ' + unit('kg')); }
      else if (a.name === 'log_checkin' && x.mood) { await db.setDayLog(uid, day, 'checkin', Math.min(5, Math.max(1, n0(x.mood))), String(x.note || '').slice(0, 300)); out.push(t('Evening check-in') + ': ' + mood(Math.min(5, Math.max(1, n0(x.mood))))); }
    } catch (e) { toast(t('Could not save — try again'), 'err'); }
  }
  if (out.length) { try { S.today.logs = await db.logsForDay(uid, day); } catch (e) {} }
  return out;
}
export function tuneButton(client) { return '<button class="act" onclick="A.go(\'tune\'' + (client ? ",{client:'" + client + "'}" : '') + ')" aria-label="Tune">' + I.spark + '</button>'; }
