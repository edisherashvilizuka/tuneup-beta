// Tune Up beta — trainee screens: Today (workout + log), Plan, Coach, More. Logging itself lives in log.js.
import { t, esc, opt, OPTS, fmtDate, firstName, unit, dayName, weekdayOf, isoDate, exName, exMuscle, weekOf } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, setTabs, bell, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { howUrl } from './exlib.js';
import { resolveUrls } from './attach.js';
import { foodCard, dayTiles, checkinCard } from './log.js';
import { pushCard, pushRow } from './push.js';
import { guideCard, guideRow } from './guide.js';
import { loadUnread, loadChatIndex } from './chat.js';
import { tuneButton } from './tune.js';
import { loadHistory, streakChip, recapCard, nudgeRow } from './habits.js';
import { tickNow } from './motion.js';

export const TRAINEE_TABS = [{ id: 'home', label: 'Today', ico: 'home' }, { id: 'plan', label: 'Plan', ico: 'plan' }, { id: 'chat', label: 'Chat', ico: 'chat' }, { id: 'sessions', label: 'Sessions', ico: 'cal' }, { id: 'more', label: 'More', ico: 'gear' }];

export async function loadTrainee() {
  S.pair = await db.myCoachPair(S.me.id);
  S.traineeProfile = await db.myTraineeProfile(S.me.id);
  S.today = { day: isoDate(), logs: [] };
  if (S.pair && S.pair.status === 'active') {
    const [items, targets, goals, logs] = await Promise.all([db.planItems(S.pair.id), db.getTargets(S.pair.id), db.listGoals(S.pair.id), db.logsForDay(S.me.id, S.today.day)]);
    S.plan = { pairId: S.pair.id, items, targets, goals }; S.today.logs = logs; resolveUrls(logs).then(ok => { if (ok) rerender(); }).catch(() => {}); S.hist35 = null; loadHistory().then(() => rerender()).catch(() => {});
  } else S.plan = null;
  S.cal = null; S.chat = null; S.notifs = null; await Promise.all([loadUnread(), loadChatIndex().catch(() => {})]);
}
function itemsFor(day) { return (S.plan ? S.plan.items : []).filter(i => i.day === day); }
function doneSet() { return new Set((S.today.logs || []).filter(l => l.kind === 'exercise').map(l => l.ref)); }
function itemLine(i) { return [i.sets + ' × ' + i.reps, i.load].filter(Boolean).join(' · '); }
function videoBtn(x) { return x && x.video_url ? '<a class="btn xs sec" href="' + esc(x.video_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.video + ' ' + t('Video') + '</a>' : ''; }
function videoDot(x) { const u = howUrl(x); return u ? '<a class="vdot" href="' + esc(u) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="' + esc(x.video_url ? t('Video') : t('How to do it')) + '">' + I.play + '</a>' : ''; }
function trkRow(i, done, tickable) {
  return '<div class="trow' + (done ? ' done' : '') + '"' + (tickable ? ' data-id="' + esc(i.id) + '"' : '') + (tickable ? ' role="button" tabindex="0" onclick="A.tick(\'' + i.id + '\')" onkeydown="if(event.key===\'Enter\')this.click()"' : '') + '>' +
    (tickable ? '<span class="check ' + (done ? 'on' : '') + '">' + (done ? I.check : '') + '</span>' : '') +
    '<div class="grow"><div class="t">' + esc(exName(i.exercise)) + '</div>' + (i.note || i.load ? '<div class="s">' + esc([i.load, i.note].filter(Boolean).join(' · ')) + '</div>' : '') + '</div><span class="reps">' + esc(i.sets + ' × ' + i.reps) + '</span>' + videoDot(i.exercise) + '</div>';
}
function workoutCard() {
  const items = itemsFor(weekdayOf()); const done = doneSet();
  if (!items.length) return '<div class="card"><div class="h3">' + t('Rest day') + '</div><div class="mute">' + t('Nothing planned for today — recover well.') + '</div></div>';
  const n = items.filter(i => done.has(i.id)).length;
  return '<div class="card" data-ev="wdone" data-v="' + (n === items.length ? 1 : 0) + '"><div class="row between"><div class="h3">' + t('Today\'s workout') + '</div><span class="mute small">' + t('{n} of {m}', { n, m: items.length }) + '</span></div>' +
    '<div class="tlist">' + items.map(i => trkRow(i, done.has(i.id), true)).join('') + '</div>' +
    (n === items.length ? '<div class="donebar">' + I.check + ' ' + t('Workout done — nice work!') + '</div>' : '') + '</div>';
}
function goalsCard() {
  const gs = (S.plan && S.plan.goals) || []; if (!gs.length) return '';
  const cols = ['--c-carbs', '--c-water', '--c-kcal', '--c-protein'];
  return '<div class="card"><div class="eyebrow">' + t('Goals from {name}', { name: firstName(((S.pair || {}).coach || {}).name) }) + '</div>' + gs.map((g, i) => '<div class="goal' + (g.done ? ' done' : '') + '"><span class="gdot" style="background:var(' + (g.done ? '--c-water' : cols[i % cols.length]) + ')"></span><span class="grow">' + esc(g.text) + '</span>' + (g.done ? '<span class="tag ok">' + t('done') + '</span>' : '') + '</div>').join('') + '</div>';
}
A.tick = async (id) => {
  const done = doneSet(); const now = !done.has(id); tickNow(id, now);
  try { await db.setExerciseDone(S.me.id, S.today.day, id, now); S.today.logs = await db.logsForDay(S.me.id, S.today.day); rerender(); }
  catch (e) { tickNow(id, !now); rerender(); toast(t('Could not save — try again'), 'err'); }
};

function coachCard() {
  const p = S.pair; if (!p || p.status !== 'active') return '';
  const c = p.coach || {}; const cp = (c.coach_profiles && (Array.isArray(c.coach_profiles) ? c.coach_profiles[0] : c.coach_profiles)) || {};
  return '<div class="card tap" onclick="A.go(\'coach\')"><div class="row">' + avatar(c.name, c.id) + '<div class="grow"><div class="eyebrow">' + t('Your coach') + '</div><div class="h3">' + esc(c.name) + '</div><div class="mute">' + esc([cp.gym, cp.district].filter(Boolean).join(' · ') || (cp.online ? t('Online') : '')) + '</div></div>' + I.chev + '</div></div>';
}

function greeting() { const h = new Date().getHours(); return h < 5 ? 'Good evening, {name}' : h < 12 ? 'Good morning, {name}' : h < 18 ? 'Good afternoon, {name}' : 'Good evening, {name}'; }
SCREENS.home = () => {
  const p = S.pair; const active = p && p.status === 'active';
  const head = '<div class="tophead"><div class="grow"><div class="eyebrow">' + fmtDate(Date.now(), 'full') + '</div><div class="h1">' + t(greeting(), { name: firstName(S.me.name) }) + '</div></div>' + (active ? tuneButton() : '') + bell() + '</div>';
  const body = head + (active ? (guideCard() || pushCard()) : '') +
    (active ? foodCard(streakChip()) + dayTiles() + (S.plan && S.plan.items.length ? workoutCard() : coachCard() + '<div class="card soft"><div class="h3">' + t('You are paired with {name}', { name: firstName((p.coach || {}).name) }) + '</div><div class="mute">' + t('Your weekly plan will appear here as soon as your coach sets it up. You can already log your day below.') + '</div></div>') + checkinCard() + goalsCard()
      : '<div class="card amber"><div class="h3">' + (p ? (p.coach && p.coach.name ? t('Your coaching with {name} has ended', { name: firstName(p.coach.name) }) : t('Your coaching has ended')) : t('No coach yet')) + '</div>' + (p && p.end_note ? '<div style="margin:6px 0">' + t('Note from your coach') + ': ' + esc(p.end_note) + '</div>' : '') + '<div class="mute">' + t('Open a new invite link from a coach to start again.') + '</div></div>');
  return { title: '', header: false, body };
};

A.planDay = (d) => { S.planDay = d; rerender(); };
A.tickAll = async () => {
  const done = doneSet(); const todo = itemsFor(weekdayOf()).filter(i => !done.has(i.id)); if (!todo.length) return;
  try { for (const i of todo) await db.setExerciseDone(S.me.id, S.today.day, i.id, true); S.today.logs = await db.logsForDay(S.me.id, S.today.day); rerender(); toast(t('Workout done — nice work!')); }
  catch (e) { toast(t('Could not save — try again'), 'err'); }
};
SCREENS.plan = () => {
  if (!S.plan) return { title: t('Plan'), body: empty('plan', t('No plan yet')) };
  if (!(S.plan.items || []).length) return { title: t('Weekly plan'), sub: t('Your coach has not set up your plan yet'), body: empty('plan', t('Your weekly plan will appear here as soon as your coach sets it up.')) + goalsCard() };
  const td = weekdayOf(); const sel = S.planDay || td; const days = weekOf(S.today.day); const done = doneSet();
  const hist = S.hist35 || [];
  const dayDone = (d) => { const its = itemsFor(d); if (!its.length) return false; const iso = days[d - 1]; const L = iso === S.today.day ? (S.today.logs || []) : hist.filter(l => l.day === iso); const refs = new Set(L.filter(l => l.kind === 'exercise').map(l => l.ref)); return its.every(i => refs.has(i.id)); };
  const strip = '<div class="wstrip">' + [1, 2, 3, 4, 5, 6, 7].map(d => { const its = itemsFor(d).length; const cls = (d === sel ? ' sel' : '') + (d === td ? ' today' : '') + (!its ? ' rest' : ''); return '<button class="wd' + cls + '" onclick="A.planDay(' + d + ')" aria-pressed="' + (d === sel) + '"><span>' + esc(dayName(d, true)) + '</span><b>' + Number(days[d - 1].slice(8)) + '</b><i class="' + (its ? (dayDone(d) ? 'ok' : 'on') : '') + '"></i></button>'; }).join('') + '</div>';
  const items = itemsFor(sel); const isToday = sel === td; const n = items.filter(i => done.has(i.id)).length;
  const dayCard = !items.length ? '<div class="card"><div class="h3">' + esc(dayName(sel)) + (isToday ? ' · ' + t('today') : '') + '</div><div class="mute">' + t('Rest day') + ' — ' + t('Nothing planned for today — recover well.') + '</div></div>'
    : '<div class="card"' + (isToday ? ' data-ev="wdone" data-v="' + (n === items.length ? 1 : 0) + '"' : '') + '><div class="row between"><div class="h2">' + esc(dayName(sel)) + (isToday ? ' · ' + t('today') : '') + '</div><span class="mute small">' + (isToday ? t('{n} of {m}', { n, m: items.length }) : items.length + ' ' + (items.length === 1 ? t('exercise') : t('exercises'))) + '</span></div>' +
      '<div class="tlist">' + items.map(i => trkRow(i, isToday && done.has(i.id), isToday)).join('') + '</div>' +
      (isToday && n < items.length ? '<button class="btn" onclick="A.tickAll()">' + t('Tick all done') + '</button>' : isToday ? '<div class="donebar">' + I.check + ' ' + t('Workout done — nice work!') + '</div>' : '') + '</div>';
  const trained = [1, 2, 3, 4, 5, 6, 7].filter(d => itemsFor(d).length); const doneDays = trained.filter(d => d <= td && dayDone(d)).length;
  let nd = 0; for (let k = 1; k <= 7 && !nd; k++) { const d = ((sel - 1 + k) % 7) + 1; if (itemsFor(d).length) nd = d; }
  const next = nd && nd !== sel ? '<div class="card"><div class="row between"><span class="eyebrow">' + t('Up next') + ' · ' + esc(dayName(nd)) + '</span><span class="link small" onclick="A.planDay(' + nd + ')">' + t('Open') + ' ›</span></div>' + itemsFor(nd).map(i => '<div class="goal"><span class="gdot" style="background:var(--a-line)"></span><span class="grow">' + esc(exName(i.exercise)) + '</span><span class="mute small">' + esc(i.sets + ' × ' + i.reps) + '</span></div>').join('') + '</div>' : '';
  return { title: t('Weekly plan'), sub: t('This week · {n} of {m} done', { n: doneDays, m: trained.length }), body: strip + dayCard + next + goalsCard(), after: () => { if (!S.hist35) loadHistory().then(() => rerender()).catch(() => {}); } };
};

SCREENS.coach = () => {
  const p = S.pair; if (!p || p.status !== 'active') return { title: t('Coach'), body: empty('users', t('No coach yet')) };
  const c = p.coach || {}; const cp = (c.coach_profiles && (Array.isArray(c.coach_profiles) ? c.coach_profiles[0] : c.coach_profiles)) || {};
  const fmt = cp.inperson && cp.online ? t('In person or online') : cp.online ? t('Online') : t('In person');
  return { title: t('Your coach'), body:
    '<div class="card"><div class="row">' + avatar(c.name, c.id, 'lg') + '<div class="grow"><div class="h2">' + esc(c.name) + '</div><div class="mute">' + esc(fmt) + '</div></div></div>' +
    (cp.pitch ? '<p class="lead">' + esc(cp.pitch) + '</p>' : '') +
    (cp.specialties && cp.specialties.length ? '<div class="chips">' + cp.specialties.map(s => '<span class="chip sm soft">' + esc(opt('specialty', s)) + '</span>').join('') + '</div>' : '') +
    (cp.gym || cp.district ? '<div class="mute">' + I.pin + ' ' + esc([cp.gym, cp.district].filter(Boolean).join(', ')) + '</div>' : '') +
    (cp.availability_text ? '<div class="mute">' + I.cal + ' ' + esc(cp.availability_text) + '</div>' : '') +
    '</div>' +
    '<div class="card flat mute small">' + t('Together since {date}', { date: fmtDate(p.started_at, 'dm') }) + ' · ' + esc(opt('format', p.format)) + '</div>' };
};

function dotted(html, c) { return html.split('<div class="lrow"').join('<div class="lrow" style="--dot:var(' + c + ')"'); }
SCREENS.more = () => {
  const c = (S.pair || {}).coach; const active = S.pair && S.pair.status === 'active'; const email = (S.session.user && S.session.user.email) || '';
  const head = '<div class="tophead">' + avatar(S.me.name, S.me.id, 'lg') + '<div class="grow" style="min-width:0"><div class="h1 sm">' + esc(S.me.name) + '</div><div class="eyebrow">' + esc(active && c ? t('Coached by {name} since {date}', { name: firstName(c.name), date: fmtDate(S.pair.started_at, 'dm') }) : email) + '</div></div></div>';
  const row = (c2, on, title, sub) => '<div class="lrow" style="--dot:var(' + c2 + ');cursor:pointer" onclick="' + on + '"><div class="grow"><div class="t">' + title + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>' + I.chev + '</div>';
  const you = row('--c-carbs', "A.go('myProfile')", t('My answers'), t('Weight, goal, injuries, diet')) + row('--c-water', "A.go('coach')", t('Your coach'), esc((c || {}).name || t('No coach yet'))) + row('--c-tune', "A.go('tune')", t('Ask Tune'), t('Your assistant')) + (active ? dotted(nudgeRow(), '--c-kcal') : '');
  const app = '<div class="lrow" style="--dot:var(--c-kcal)"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div>' + dotted(pushRow(), '--c-tune') + dotted(guideRow(), '--a-mute') + row('--a-mute', 'A.feedbackSheet()', t('Send feedback'), t('What is confusing, missing or great?'));
  return { title: '', header: false, body: head +
    '<div class="eyebrow grp">' + t('You') + '</div><div class="card menu">' + you + '</div>' +
    '<div class="eyebrow grp">' + t('App') + '</div><div class="card menu">' + app + '</div>' +
    '<div class="card menu plain"><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div>' +
    '<div class="lrow" style="cursor:pointer" onclick="A.deleteAccountAsk()"><div class="grow"><div class="t" style="color:var(--a-red)">' + t('Delete account') + '</div><div class="s">' + t('Removes all your data') + '</div></div></div></div>' +
    '<div class="mute small" style="text-align:center">Tune Up · ' + t('closed beta') + '</div>' };
};

A.setLangSave = async (l) => { A.lang(l); try { await db.updateProfile(S.me.id, { lang: l }); S.me.lang = l; } catch (e) {} };

SCREENS.myProfile = () => {
  const tp = S.traineeProfile || {};
  const rows = [[t('Weight'), tp.weight_kg ? tp.weight_kg + ' ' + unit('kg') : '—'], [t('Height'), tp.height_cm ? tp.height_cm + ' ' + unit('cm') : '—'], [t('Experience'), opt('experience', tp.experience)], [t('Main goal'), opt('goal', tp.goal)], [t('Anything specific?'), tp.goal_detail || '—'], [t('Injuries or limits'), tp.injuries || '—'], [t('Diet'), tp.diet || '—'], [t('Eating style'), opt('eating_style', tp.eating_style || '')], [t('Allergies or foods I avoid'), tp.allergies || '—'], [t('How you want to train'), opt('format', tp.format)]];
  return { title: t('My answers'), body: '<div class="card">' + rows.map(r => '<div class="lrow"><div class="grow"><div class="s">' + esc(r[0]) + '</div><div class="t">' + esc(r[1]) + '</div></div></div>').join('') + '</div>' +
    '<button class="btn sec" onclick="A.go(\'editAnswers\')">' + I.edit + ' ' + t('Edit my answers') + '</button><div class="mute small">' + t('Your coach sees the changes. Your weigh-ins update the weight here.') + '</div>' };
};

// ---- edit my answers (same fields as the sign-up form)
function sel(id, group, cur) { return '<select class="input" id="' + id + '">' + Object.keys(OPTS[group]).map(k => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(t(OPTS[group][k])) + '</option>').join('') + '</select>'; }
SCREENS.editAnswers = () => {
  const tp = S.traineeProfile || {};
  return { title: t('Edit my answers'), body:
    '<div class="input-row">' + field(t('Weight'), 'ea_w', tp.weight_kg || '', { type: 'number', unit: unit('kg'), ph: '70', attrs: ' step="0.1"' }) + field(t('Height'), 'ea_h', tp.height_cm || '', { type: 'number', unit: unit('cm'), ph: '170' }) + '</div>' +
    '<div class="field"><label for="ea_exp">' + t('Experience') + '</label>' + sel('ea_exp', 'experience', tp.experience) + '</div>' +
    '<div class="field"><label for="ea_goal">' + t('Main goal') + '</label>' + sel('ea_goal', 'goal', tp.goal) + '</div>' +
    field(t('Anything specific?'), 'ea_gd', tp.goal_detail || '', { textarea: true }) +
    field(t('Injuries or limits'), 'ea_inj', tp.injuries || '') + field(t('Diet'), 'ea_diet', tp.diet || '') +
    '<div class="field"><label for="ea_style">' + t('Eating style') + '</label>' + sel('ea_style', 'eating_style', tp.eating_style || '') + '</div>' +
    field(t('Allergies or foods I avoid'), 'ea_allergies', tp.allergies || '', { ph: t('e.g. nuts, lactose, pork') }) + '<div class="mute small">' + t('Food suggestions and Tune respect these.') + '</div>' +
    '<div class="field"><label for="ea_fmt">' + t('How you want to train') + '</label>' + sel('ea_fmt', 'format', tp.format) + '</div>' +
    '<button class="btn" onclick="A.saveAnswers()">' + t('Save') + '</button>' };
};
A.saveAnswers = async () => {
  const w = val('ea_w') ? parseFloat(val('ea_w')) : null, h = val('ea_h') ? parseInt(val('ea_h'), 10) : null;
  if (w !== null && (isNaN(w) || w < 20 || w > 400)) { toast(t('Check the number: weight in kg, 20–400.'), 'err'); return; }
  if (h !== null && (isNaN(h) || h < 100 || h > 250)) { toast(t('Check the number: height in cm, 100–250.'), 'err'); return; }
  busy(true);
  try {
    const patch = { weight_kg: w, height_cm: h, experience: val('ea_exp'), goal: val('ea_goal'), goal_detail: val('ea_gd').slice(0, 300), injuries: val('ea_inj').slice(0, 300), diet: val('ea_diet').slice(0, 200), eating_style: val('ea_style'), allergies: val('ea_allergies').slice(0, 200), format: val('ea_fmt') };
    const r = await db.updateTraineeProfile(S.me.id, patch); S.traineeProfile = Object.assign({}, S.traineeProfile, patch, r || {});
    toast(t('Saved')); back();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
