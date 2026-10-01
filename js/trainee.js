// Tune Up beta — trainee screens (week 1: coach card, profile, More).
import { t, esc, opt, fmtDate, firstName, unit, dayName, weekdayOf, isoDate, exName, exMuscle } from './i18n.js';
import { SCREENS, A, I, go, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, setTabs } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

export const TRAINEE_TABS = [{ id: 'home', label: 'Today', ico: 'home' }, { id: 'plan', label: 'Plan', ico: 'plan' }, { id: 'coach', label: 'Coach', ico: 'users' }, { id: 'more', label: 'More', ico: 'gear' }];

export async function loadTrainee() {
  S.pair = await db.myCoachPair(S.me.id);
  S.traineeProfile = await db.myTraineeProfile(S.me.id);
  S.today = { day: isoDate(), logs: [] };
  if (S.pair && S.pair.status === 'active') {
    const [items, targets, goals, logs] = await Promise.all([db.planItems(S.pair.id), db.getTargets(S.pair.id), db.listGoals(S.pair.id), db.logsForDay(S.me.id, S.today.day)]);
    S.plan = { pairId: S.pair.id, items, targets, goals }; S.today.logs = logs;
  } else S.plan = null;
}
function itemsFor(day) { return (S.plan ? S.plan.items : []).filter(i => i.day === day); }
function doneSet() { return new Set((S.today.logs || []).filter(l => l.kind === 'exercise').map(l => l.ref)); }
function itemLine(i) { return [i.sets + ' × ' + i.reps, i.load].filter(Boolean).join(' · '); }
function videoBtn(x) { return x && x.video_url ? '<a class="btn xs sec" href="' + esc(x.video_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.video + ' ' + t('Video') + '</a>' : ''; }
function workoutCard() {
  const items = itemsFor(weekdayOf()); const done = doneSet();
  if (!items.length) return '<div class="card"><div class="h3">' + t('Rest day') + '</div><div class="mute">' + t('Nothing planned for today — recover well.') + '</div></div>';
  const n = items.filter(i => done.has(i.id)).length;
  return '<div class="section-title"><span class="eyebrow">' + t('Today\'s workout') + '</span><span class="mute small">' + n + '/' + items.length + '</span></div>' +
    '<div class="col" style="gap:8px">' + items.map(i => '<div class="task ' + (done.has(i.id) ? 'done' : '') + '" onclick="A.tick(\'' + i.id + '\')"><span class="check ' + (done.has(i.id) ? 'on' : '') + '">' + (done.has(i.id) ? I.check : '') + '</span><div class="grow"><div class="t">' + esc(exName(i.exercise)) + '</div><div class="s">' + esc(itemLine(i)) + (i.note ? ' · ' + esc(i.note) : '') + '</div></div>' + videoBtn(i.exercise) + '</div>').join('') + '</div>' +
    (n === items.length ? '<div class="card soft"><div class="h3">' + t('Workout done — nice work!') + '</div></div>' : '');
}
function targetsCard() {
  const tg = S.plan && S.plan.targets; if (!tg || !(tg.kcal || tg.protein_g || tg.water_ml || tg.steps)) return '';
  const tile = (v, k) => '<div class="tile"><div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div></div>';
  return '<div class="section-title"><span class="eyebrow">' + t('Daily targets') + '</span></div><div class="grid2">' + [tg.kcal ? tile(tg.kcal, unit('kcal')) : '', tg.protein_g ? tile(tg.protein_g + ' ' + unit('g'), t('protein')) : '', tg.water_ml ? tile((tg.water_ml / 1000) + ' L', t('water')) : '', tg.steps ? tile(tg.steps, t('steps')) : ''].join('') + '</div>' +
    '<div class="mute small">' + t('Logging food, water and steps arrives next week.') + '</div>';
}
function goalsCard() {
  const gs = (S.plan && S.plan.goals) || []; if (!gs.length) return '';
  return '<div class="section-title"><span class="eyebrow">' + t('Goals') + '</span></div><div class="card">' + gs.map(g => '<div class="row" style="gap:8px"><span class="check ' + (g.done ? 'on' : '') + '" style="width:20px;height:20px">' + (g.done ? I.check : '') + '</span><span class="grow ' + (g.done ? 'mute' : '') + '">' + esc(g.text) + '</span></div>').join('') + '</div>';
}
A.tick = async (id) => {
  const done = doneSet(); const now = !done.has(id);
  try { await db.setExerciseDone(S.me.id, S.today.day, id, now); S.today.logs = await db.logsForDay(S.me.id, S.today.day); rerender(); }
  catch (e) { toast(t('Could not save — try again'), 'err'); }
};

function coachCard() {
  const p = S.pair; if (!p || p.status !== 'active') return '';
  const c = p.coach || {}; const cp = (c.coach_profiles && (Array.isArray(c.coach_profiles) ? c.coach_profiles[0] : c.coach_profiles)) || {};
  return '<div class="card tap" onclick="A.setTab(\'coach\')"><div class="row">' + avatar(c.name, c.id) + '<div class="grow"><div class="eyebrow">' + t('Your coach') + '</div><div class="h3">' + esc(c.name) + '</div><div class="mute">' + esc([cp.gym, cp.district].filter(Boolean).join(' · ') || (cp.online ? t('Online') : '')) + '</div></div>' + I.chev + '</div></div>';
}

SCREENS.home = () => {
  const p = S.pair; const active = p && p.status === 'active';
  const body = '<div class="eyebrow">' + fmtDate(Date.now(), 'full') + '</div><div class="h1">' + t('Hi, {name}', { name: firstName(S.me.name) }) + '</div>' +
    (active ? (S.plan && S.plan.items.length ? workoutCard() : coachCard() + '<div class="card soft"><div class="h3">' + t('You are paired with {name}', { name: firstName((p.coach || {}).name) }) + '</div><div class="mute">' + t('Your weekly plan, targets and check-ins will appear here as soon as your coach sets them up.') + '</div></div>') + targetsCard() + goalsCard()
      : '<div class="card amber"><div class="h3">' + (p ? t('Your coaching with {name} has ended', { name: firstName((p.coach || {}).name) }) : t('No coach yet')) + '</div><div class="mute">' + t('Open a new invite link from a coach to start again.') + '</div></div>');
  return { title: '', header: false, body };
};

SCREENS.plan = () => {
  if (!S.plan) return { title: t('Plan'), body: empty('plan', t('No plan yet')) };
  const td = weekdayOf();
  const body = [1, 2, 3, 4, 5, 6, 7].map(d => { const items = itemsFor(d); return '<div class="section-title"><span class="eyebrow">' + esc(dayName(d)) + (d === td ? ' · ' + t('today') : '') + '</span></div>' + (items.length ? '<div class="card">' + items.map(i => '<div class="lrow"><div class="grow"><div class="t">' + esc(exName(i.exercise)) + '</div><div class="s">' + esc(itemLine(i)) + (i.note ? ' · ' + esc(i.note) : '') + '</div></div>' + videoBtn(i.exercise) + '</div>').join('') + '</div>' : '<div class="card flat mute">' + t('Rest day') + '</div>'); }).join('');
  return { title: t('Weekly plan'), sub: t('from {name}', { name: firstName((S.pair.coach || {}).name) }), body };
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
    '</div>' +
    '<div class="card flat mute small">' + t('Together since {date}', { date: fmtDate(p.started_at, 'dm') }) + ' · ' + esc(opt('format', p.format)) + '</div>' };
};

SCREENS.more = () => ({ title: t('More'), body:
  '<div class="card"><div class="lrow"><div class="grow"><div class="t">' + esc(S.me.name) + '</div><div class="s">' + esc((S.session.user && S.session.user.email) || '') + '</div></div></div>' +
  '<div class="lrow"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div>' +
  '<div class="lrow" style="cursor:pointer" onclick="A.go(\'myProfile\')"><div class="grow"><div class="t">' + t('My answers') + '</div><div class="s">' + t('Weight, goal, injuries, diet') + '</div></div>' + I.chev + '</div></div>' +
  '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div>' +
  '<div class="lrow" style="cursor:pointer" onclick="A.deleteAccountAsk()"><div class="grow"><div class="t" style="color:var(--a-red)">' + t('Delete account') + '</div><div class="s">' + t('Removes all your data') + '</div></div></div></div>' +
  '<div class="mute small" style="text-align:center">Tune Up · ' + t('closed beta') + '</div>' });

A.setLangSave = async (l) => { A.lang(l); try { await db.updateProfile(S.me.id, { lang: l }); S.me.lang = l; } catch (e) {} };

SCREENS.myProfile = () => {
  const tp = S.traineeProfile || {};
  const rows = [[t('Weight'), tp.weight_kg ? tp.weight_kg + ' ' + unit('kg') : '—'], [t('Height'), tp.height_cm ? tp.height_cm + ' ' + unit('cm') : '—'], [t('Experience'), opt('experience', tp.experience)], [t('Main goal'), opt('goal', tp.goal)], [t('Anything specific?'), tp.goal_detail || '—'], [t('Injuries or limits'), tp.injuries || '—'], [t('Diet'), tp.diet || '—'], [t('How you want to train'), opt('format', tp.format)]];
  return { title: t('My answers'), body: '<div class="card">' + rows.map(r => '<div class="lrow"><div class="grow"><div class="s">' + esc(r[0]) + '</div><div class="t">' + esc(r[1]) + '</div></div></div>').join('') + '</div><div class="mute small">' + t('Editing comes next week — for now tell your coach about changes.') + '</div>' };
};
