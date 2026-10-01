// Tune Up beta — onboarding through an invite: coach set-up form, trainee join form, redeem.
import { t, esc, LANG, OPTS } from './i18n.js';
import { SCREENS, A, I, go, root, rerender, toast, busy, val, field, chips } from './ui.js';
import * as db from './db.js';
import { S, clearInvite } from './state.js';

let afterOnboard = () => {};
export function onOnboarded(fn) { afterOnboard = fn; }

function d() { return S.draft; }

// ---- coach
SCREENS.coachSetup = () => {
  const x = d();
  return { title: t('Set up your coach profile'), tabs: false, back: false, body:
    '<p class="lead">' + t('Clients see this when they join you. Keep it short — you can edit it later.') + '</p>' +
    field(t('Your name'), 'name', x.name, { ph: t('e.g. Giorgi Kapanadze'), attrs: ' autocomplete="name"' }) +
    '<div class="field"><label>' + t('What you coach') + '</label>' + chips(OPTS.specialty, x.specialties || [], 'togSpec') + '</div>' +
    field(t('One line about you'), 'pitch', x.pitch, { textarea: true, ph: t('e.g. 8 years of strength coaching, calm and consistent.') }) +
    field(t('Gym'), 'gym', x.gym, { ph: t('e.g. Fitness One, Saburtalo') }) +
    field(t('District'), 'district', x.district, { ph: t('e.g. Vake') }) +
    '<div class="field"><label>' + t('How you train clients') + '</label>' + chips(OPTS.format, x.format || 'inperson', 'pickFormat') + '</div>' +
    '<div class="err" id="err"></div>' +
    '<button class="btn" onclick="A.finishCoach()">' + t('Create coach account') + '</button>' };
};
A.togSpec = (k) => { const x = d(); x.specialties = x.specialties || []; const i = x.specialties.indexOf(k); if (i >= 0) x.specialties.splice(i, 1); else x.specialties.push(k); keep(); rerender(); };
A.pickFormat = (k) => { d().format = k; keep(); rerender(); };
A.pickExp = (k) => { d().experience = k; keep(); rerender(); };
A.pickGoal = (k) => { d().goal = k; keep(); rerender(); };
function keep() { ['name', 'pitch', 'gym', 'district', 'weight_kg', 'height_cm', 'goal_detail', 'injuries', 'diet'].forEach(id => { const el = document.getElementById(id); if (el) d()[id] = el.value; }); }

A.finishCoach = async () => {
  keep(); const x = d(); const err = document.getElementById('err');
  if (!x.name || x.name.trim().length < 2) { err.textContent = t('Please enter your name.'); return; }
  err.textContent = ''; busy(true);
  const fmt = x.format || 'inperson';
  try {
    await db.redeemCoach(S.invite.code, x.name.trim(), LANG.cur, { specialties: x.specialties || [], pitch: x.pitch || '', gym: x.gym || '', district: x.district || '', inperson: fmt !== 'online', online: fmt !== 'inperson' });
    clearInvite(); S.draft = {}; toast(t('Welcome, coach')); await afterOnboard();
  } catch (e) { busy(false); err.textContent = friendly(e); }
};

// ---- trainee
SCREENS.traineeJoin = () => {
  const x = d(); const coach = (S.invite && S.invite.info && S.invite.info.coach) || t('your coach');
  return { title: t('Join {name}', { name: coach }), tabs: false, back: false, body:
    '<p class="lead">' + t('A few answers so {name} can plan for you. Everything here is only visible to you and your coach.', { name: coach }) + '</p>' +
    field(t('Your name'), 'name', x.name, { ph: t('e.g. Nino Beridze'), attrs: ' autocomplete="name"' }) +
    '<div class="input-row">' + field(t('Weight'), 'weight_kg', x.weight_kg, { type: 'number', unit: 'kg', ph: '70' }) + field(t('Height'), 'height_cm', x.height_cm, { type: 'number', unit: 'cm', ph: '170' }) + '</div>' +
    '<div class="field"><label>' + t('Experience') + '</label>' + chips(OPTS.experience, x.experience || '', 'pickExp') + '</div>' +
    '<div class="field"><label>' + t('Main goal') + '</label>' + chips(OPTS.goal, x.goal || '', 'pickGoal') + '</div>' +
    field(t('Anything specific?'), 'goal_detail', x.goal_detail, { textarea: true, ph: t('e.g. lose 5 kg before summer, run 5 km') }) +
    field(t('Injuries or limits'), 'injuries', x.injuries, { ph: t('e.g. left knee, lower back — or none') }) +
    field(t('Diet'), 'diet', x.diet, { ph: t('e.g. no restrictions, vegetarian, fasting') }) +
    '<div class="field"><label>' + t('How you want to train') + '</label>' + chips(OPTS.format, x.format || 'inperson', 'pickFormat') + '</div>' +
    '<div class="err" id="err"></div>' +
    '<button class="btn" onclick="A.finishTrainee()">' + t('Join and start') + '</button>' };
};

A.finishTrainee = async () => {
  keep(); const x = d(); const err = document.getElementById('err');
  if (!x.name || x.name.trim().length < 2) { err.textContent = t('Please enter your name.'); return; }
  if (!x.experience || !x.goal) { err.textContent = t('Pick your experience and main goal.'); return; }
  err.textContent = ''; busy(true);
  try {
    await db.redeemClient(S.invite.code, x.name.trim(), LANG.cur, { weight_kg: x.weight_kg || '', height_cm: x.height_cm || '', experience: x.experience, goal: x.goal, goal_detail: x.goal_detail || '', injuries: x.injuries || '', diet: x.diet || '', format: x.format || 'inperson' });
    clearInvite(); S.draft = {}; toast(t('You are paired')); await afterOnboard();
  } catch (e) { busy(false); err.textContent = friendly(e); }
};

// pre-fill for a returning trainee who opens a new invite
export async function prefillTrainee() {
  const x = d(); if (S.me) x.name = x.name || S.me.name || '';
  try { const tp = await db.myTraineeProfile(S.me.id); if (tp) Object.keys(tp).forEach(k => { if (tp[k] != null && x[k] == null) x[k] = tp[k]; }); } catch (e) {}
}

function friendly(e) {
  const m = (e && e.message) || '';
  if (/invite invalid/.test(m)) return t('This invite link is no longer valid — ask for a new one.');
  if (/already paired/.test(m)) return t('You already have a coach. Ask them to end the pairing first.');
  if (/already has a role/.test(m)) return t('This account is already set up in another role.');
  if (/own invite/.test(m)) return t('You cannot use your own invite link.');
  if (/consent/.test(m)) return t('Please accept the data notice first.');
  return t('Something went wrong — try again.');
}
