// Tune Up beta — the coach's side of matching (Launch 1): requests (accept / decline), trial pairs, after-the-trial
// confirmation, the chosen plan on the client page (with session counts), "Contribute a program", and the trainee's
// own "Your plan" block.
import { t, esc, LANG, opt, isoDate, addDays, fmtDay, fmtTime, firstName, dayName, exName, unit } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, field, val, busy, empty, avatar } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { componentLines, CADENCE } from './plans.js';
import { DISTRICTS } from './onboard.js';
import { planPayLine } from './billing.js';

export async function loadRequests() { try { S.requests = await db.coachRequests(); } catch (e) { S.requests = S.requests || []; } }
export function pendingCount() { return (S.requests || []).filter(r => r.status === 'pending').length; }
const tpOf = c => { const p = c.trainee && c.trainee.trainee_profiles; return (Array.isArray(p) ? p[0] : p) || {}; };

// ---- requests on coach Today (above the KPIs) and the trial pairs
export function requestsBlock() {
  const pend = (S.requests || []).filter(r => r.status === 'pending');
  const trials = (S.clients || []).filter(c => c.status === 'trial' && !c.gone);
  if (!pend.length && !trials.length) return '';
  const ans = r => r.answers || {};
  const card = r => { const a = ans(r); const line = [opt('goal', a.goal), opt('experience', a.experience), DISTRICTS[a.district] ? t(DISTRICTS[a.district]) : a.district, opt('format', r.format), a.budget_max ? (a.budget_min ? a.budget_min + '–' : '') + a.budget_max + ' ₾' : ''].filter(Boolean).join(' · ');
    return '<div class="card" style="box-shadow:inset 0 0 0 2px var(--a-amber)"><div class="row">' + avatar(r.name, r.trainee_id) + '<div class="grow" style="min-width:0"><div class="t">' + esc(r.name) + (a.age ? ', ' + a.age : '') + '</div><div class="s wrap">' + esc(line) + '</div></div></div>' +
      (r.note ? '<div class="lead" style="font-size:14px;font-style:italic">“' + esc(r.note) + '”</div>' : '') +
      (a.injuries ? '<div class="s">' + esc(t('Injuries') + ': ' + a.injuries) + '</div>' : '') + (a.days && a.days.length ? '<div class="s">' + esc(t('Days') + ': ' + a.days.map(d => dayName(d, true)).join(' · ') + (a.time_of_day && a.time_of_day.length ? ' · ' + a.time_of_day.map(x => t({ morning: 'mornings', day: 'daytime', evening: 'evenings' }[x] || x)).join(' / ') : '')) + '</div>' : '') +
      '<div class="btn-row"><button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.answerRequest(\'' + r.id + '\',true)">' + t('Accept') + '</button><button class="btn sec" onclick="A.answerRequest(\'' + r.id + '\',false)">' + t('Decline') + '</button></div></div>'; };
  const trow = c => { const u = c.trainee; const ses = c.trialSession; const at = ses ? new Date(ses.starts_at) : null; const over = at && at.getTime() + 60 * 60000 < Date.now();
    const sub = !ses ? t('Accepted — waiting for them to book the free trial') : over ? (c.trial_coach_ok == null ? t('Trial done — continue?') : c.trial_coach_ok ? (c.trial_trainee_ok ? t('Both said yes — they are choosing a plan') : t('Waiting for their answer')) : '') : t('Free trial {when}', { when: fmtDay(isoDate(at), 'dm') + ' · ' + fmtTime(at) + ' · ' + (ses.where_kind === 'video' ? t('Video call') : ses.place || t('In person')) });
    const act = over && c.trial_coach_ok == null ? '<button class="btn xs" style="background:var(--a-green);color:#16130F" onclick="event.stopPropagation();A.coachTrialSheet(\'' + c.id + '\')">' + t('Answer') + '</button>' : '<span class="pill warn">' + t('Trial') + '</span>';
    return '<div class="srow" style="cursor:pointer" onclick="A.go(\'client\',{id:\'' + c.id + '\'})">' + avatar(u.name, u.id) + '<div class="grow" style="min-width:0"><div class="t">' + esc(u.name) + '</div><div class="s wrap">' + esc(sub) + '</div></div>' + act + '</div>'; };
  return (pend.length ? '<div class="row between"><div class="h3">' + t('Requests') + '</div><span class="pill warn">' + pend.length + '</span></div>' + pend.map(card).join('') : '') +
    (trials.length ? '<div class="section-title"><span class="eyebrow">' + t('Trials') + '</span></div><div class="slist">' + trials.map(trow).join('') + '</div>' : '');
}
A.answerRequest = async (id, accept) => {
  busy(true);
  try { await db.answerRequest(id, accept); const { loadCoach } = await import('./coach.js'); await loadCoach(); toast(accept ? t('Accepted — the chat is open') : t('Declined politely')); rerender(); }
  catch (e) { busy(false); const m = (e && e.message) || ''; toast(/already paired/.test(m) ? t('They found a coach in the meantime.') : t('Could not save — try again'), 'err'); }
};
A.coachTrialSheet = (pairId) => {
  const c = (S.clients || []).find(x => x.id === pairId); if (!c) return; const ses = c.trialSession; const at = ses ? new Date(ses.starts_at) : null;
  sheet('<div class="row" style="gap:12px">' + avatar(c.trainee.name, c.trainee.id, 'lg') + '<div class="grow"><div class="h2">' + esc(t('Trial with {name} — continue?', { name: firstName(c.trainee.name) })) + '</div><div class="s">' + esc((at ? fmtDay(isoDate(at), 'dm') + ' · ' + fmtTime(at) : '') + (c.trial_trainee_ok === true ? ' · ' + t('They chose "Continue".') : c.trial_trainee_ok === false ? ' · ' + t('They chose "Not for me".') : '')) + '</div></div></div>' +
    '<button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.coachTrial(\'' + pairId + '\',true)">' + t('Continue') + '</button><button class="btn sec" onclick="A.coachTrial(\'' + pairId + '\',false)">' + t('Not a fit') + '</button>' +
    '<div class="s" style="text-align:center">' + esc(t('If you continue, {name} picks one of your plans.', { name: firstName(c.trainee.name) })) + '</div>');
};
A.coachTrial = async (pairId, ok) => {
  busy(true);
  try { const r = await db.trialAnswer(pairId, ok); closeSheet(); const { loadCoach } = await import('./coach.js'); await loadCoach(); toast(r === 'both' ? t('Both said yes — they are choosing a plan') : r === 'ended' ? t('Ended politely') : t('Saved — waiting for their answer')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// ---- the chosen plan on the client page (coach) and in More (trainee), with live counts
function monthRange() { const d = new Date(); const from = isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); const to = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return [from, to]; }
export function sessionsUsed(pairId, kind) {
  const C = S.cal; if (!C) return null; const [from, to] = monthRange(); const now = Date.now();
  return C.sessions.filter(s => s.pair_id === pairId && s.status === 'planned' && (!kind || s.where_kind === kind) && s.repeat === 'none').filter(s => { const d = isoDate(new Date(s.starts_at)); return d >= from && d <= to && new Date(s.starts_at).getTime() < now; }).length;
}
export function planBlock(p, opts) {
  opts = opts || {}; if (!p || p.kind !== 'coach') return '';
  const c = p.plan_components || {}; const isCoach = S.me.role === 'coach';
  if (!p.plan_id) return isCoach ? '<div class="card"><div class="row between"><div class="eyebrow">' + t('Plan') + '</div><span class="link small" onclick="A.clientPlanSheet(\'' + p.id + '\')">' + t('Assign') + '</span></div><div class="s">' + t('Existing client — no plan assigned yet. Assign one so both of you see what is included.') + '</div></div>' : '';
  const rows = [];
  const tag = (ok, txt) => '<span class="tag ' + (ok ? 'ok' : 'warn') + '">' + esc(txt) + '</span>';
  const gymUsed = sessionsUsed(p.id, 'gym'), vidUsed = sessionsUsed(p.id, 'video');
  if (c.gym > 0) rows.push([t('{n} gym sessions / month', { n: c.gym }), gymUsed == null ? '' : tag(gymUsed <= c.gym, t('{n} used', { n: gymUsed }))]);
  if (c.video > 0) rows.push([t('{n} video calls / month', { n: c.video }), vidUsed == null ? '' : tag(vidUsed <= c.video, t('{n} used', { n: vidUsed }))]);
  if (c.form > 0) rows.push([t('Form checks {n} / week', { n: c.form }), '']);
  if (c.checkin) rows.push([t('Check-in replies {c}', { c: t(CADENCE[c.checkin] || c.checkin) }), '']);
  if (c.review) rows.push([t('Monthly progress review'), p.plan_since ? tag(true, t('due {date}', { date: fmtDay(addDays(String(p.plan_since).slice(0, 10), 30), 'dm') })) : '']);
  if (c.plan) rows.push([t('Training plan'), '']); if (c.nutrition) rows.push([t('Nutrition coaching'), '']); if (c.content) rows.push([t('Coach\'s video content'), '']); if (c.custom) rows.push([c.custom, '']);
  const change = isCoach ? '<span class="link small" onclick="A.clientPlanSheet(\'' + p.id + '\')">' + t('Change plan') + '</span>' : '<span class="link small" onclick="A.go(\'choosePlan\')">' + t('Change plan') + '</span>';
  return '<div class="card"><div class="row between"><div class="eyebrow">' + t('Plan') + '</div>' + change + '</div><div class="h3">' + esc(p.plan_name + ' · ' + p.plan_price + ' ₾ ' + t('/ month') + (p.plan_since ? ' · ' + t('since {date}', { date: fmtDay(String(p.plan_since).slice(0, 10), 'dm') }) : '')) + '</div>' +
    '<div style="display:flex;flex-direction:column">' + rows.map(r => '<div class="lrow" style="padding:9px 0;min-height:0"><div class="grow"><div class="t" style="font-weight:600">' + esc(r[0]) + '</div></div>' + r[1] + '</div>').join('') + '</div>' +
    (!isCoach ? '<div class="s">' + esc(planPayLine() || t('You pay your coach directly.')) + '</div>' : '') + '</div>';
}
A.clientPlanSheet = async (pairId) => {
  if (!S.coachPlans) { try { S.coachPlans = await db.myPlans(S.me.id); } catch (e) { S.coachPlans = []; } }
  const c = (S.clients || []).find(x => x.id === pairId); const ps = (S.coachPlans || []).filter(p => p.status === 'active');
  sheet('<div class="h2">' + esc(t('Plan for {name}', { name: firstName(c.trainee.name) })) + '</div>' + (ps.length ? ps.map(p => '<div class="srow" style="cursor:pointer" onclick="A.setClientPlan(\'' + pairId + '\',\'' + p.id + '\')"><div class="grow"><div class="t">' + esc(p.name) + '</div><div class="s wrap">' + esc(componentLines(p.components).join(' · ')) + '</div></div><div class="r" style="font-weight:800">' + p.price_gel + ' ₾</div>' + (c.plan_id === p.id ? '<span class="tag ok">' + I.check + '</span>' : I.chev) + '</div>').join('') : '<div class="card flat mute">' + t('No plans yet — add them in More → My plans.') + '</div>') +
    (c.plan_id ? '<button class="btn sec" onclick="A.setClientPlan(\'' + pairId + '\',null)">' + t('No plan') + '</button>' : ''));
};
A.setClientPlan = async (pairId, planId) => {
  busy(true);
  try { await db.setClientPlan(pairId, planId); closeSheet(); const { loadCoach } = await import('./coach.js'); await loadCoach(); toast(t('Saved — the client sees it too')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// ---- Contribute a program (approved coaches; the partner confirms in admin before it is published)
SCREENS.contribute = () => {
  const d = S.draft.ctr = S.draft.ctr || { goal: 'strength', level: 'beginner', place: 'gym', weeks: 6, from: null };
  const active = (S.clients || []).filter(c => c.status === 'active' && !c.gone);
  return { title: t('Contribute a program'), body:
    '<div class="s">' + t('Published programs show your name and link to your profile — people training on their own can find you from there.') + '</div>' +
    field(t('Program name'), 'ctr_name', d.name || '', { ph: t('e.g. Strong legs in 6 weeks') }) +
    '<div class="field"><label>' + t('Goal') + '</label><div class="chips">' + ['lose', 'gain', 'tone', 'strength'].map(k => '<button class="chip ' + (d.goal === k ? 'on' : '') + '" onclick="A.ctrPick(\'goal\',\'' + k + '\')">' + esc(t({ lose: 'Fat loss', gain: 'Muscle', tone: 'General fitness', strength: 'Strength' }[k])) + '</button>').join('') + '</div></div>' +
    '<div class="field"><label>' + t('Level') + '</label><div class="segc"><button class="' + (d.level === 'beginner' ? 'on' : '') + '" onclick="A.ctrPick(\'level\',\'beginner\')">' + t('Beginner') + '</button><button class="' + (d.level === 'some' ? 'on' : '') + '" onclick="A.ctrPick(\'level\',\'some\')">' + t('Intermediate') + '</button></div></div>' +
    '<div class="field"><label>' + t('Place') + '</label><div class="segc"><button class="' + (d.place === 'gym' ? 'on' : '') + '" onclick="A.ctrPick(\'place\',\'gym\')">' + t('Gym') + '</button><button class="' + (d.place === 'home' ? 'on' : '') + '" onclick="A.ctrPick(\'place\',\'home\')">' + t('Home') + '</button></div></div>' +
    field(t('Weeks'), 'ctr_weeks', d.weeks, { type: 'number', ph: '6' }) +
    '<div class="card"><div class="t">' + t('Build from a client\'s plan') + '</div><div class="s">' + t('The weekly plan of one of your clients becomes the day templates (names removed, library exercises only).') + '</div>' +
    (active.length ? '<div class="chips" style="margin-top:6px">' + active.map(c => '<button class="chip ' + (d.from === c.id ? 'on' : '') + '" onclick="A.ctrPick(\'from\',\'' + c.id + '\')">' + esc(firstName(c.trainee.name)) + '</button>').join('') + '</div>' : '<div class="s">' + t('No active clients yet.') + '</div>') + '</div>' +
    field(t('One line about it'), 'ctr_summary', d.summary || '', { textarea: true, ph: t('Who it is for and how it progresses') }) +
    '<div class="err" id="err"></div><button class="btn" onclick="A.ctrSubmit()">' + t('Submit for review') + '</button>' };
};
A.ctrPick = (k, v) => { const d = S.draft.ctr; d.name = val('ctr_name'); d.summary = val('ctr_summary'); d.weeks = val('ctr_weeks'); d[k] = d[k] === v && k === 'from' ? null : v; rerender(); };
A.ctrSubmit = async () => {
  const d = S.draft.ctr; d.name = val('ctr_name'); d.summary = val('ctr_summary'); const weeks = parseInt(val('ctr_weeks'), 10); const err = document.getElementById('err');
  if (!d.name.trim()) { err.textContent = t('Give the program a name.'); return; }
  if (isNaN(weeks) || weeks < 2 || weeks > 16) { err.textContent = t('Weeks: 2–16.'); return; }
  if (!d.from) { err.textContent = t('Pick the client whose plan is the template.'); return; }
  busy(true);
  try {
    const items = await db.planItems(d.from); const byDay = {};
    items.forEach(i => { const x = i.exercise; if (!x || x.owner_id) return; (byDay[i.day] = byDay[i.day] || []).push({ ex: x.name, sets: i.sets, reps: i.reps, load: i.load || '' }); });
    const days = Object.keys(byDay).sort().map((dd, k) => ({ name: t('Day {n}', { n: k + 1 }), name_ka: 'დღე ' + (k + 1), items: byDay[dd] }));
    if (!days.length) { busy(false); err.textContent = t('That plan has no library exercises yet.'); return; }
    await db.saveProgram({ title: d.name.trim().slice(0, 80), goal: d.goal, level: d.level, place: d.place, weeks, days_per_week: days.length, summary: d.summary.slice(0, 300), body: { days, rules: { reps_every: 2, add_set_from: 4, deload_last: true, load_note: d.goal !== 'lose' } }, status: 'submitted', author_id: S.me.id });
    S.draft.ctr = null; toast(t('Submitted — the Tune Up team reviews it')); back();
  } catch (e) { busy(false); err.textContent = t('Could not submit — try again.'); }
};
