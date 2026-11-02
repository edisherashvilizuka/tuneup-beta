// Tune Up beta — onboarding (Launch 1, 2026-10-31): public sign-up for trainees (4 question steps + "how do you want to
// train?") and coaches (5 profile steps incl. My plans and free hours), plus the older invite paths (a coach's client
// invite link pairs at once; an admin coach invite skips the review).
import { t, esc, LANG, OPTS, dayName } from './i18n.js';
import { SCREENS, A, I, go, back, root, replace, rerender, toast, busy, val, field, chips, avatar, sheet, closeSheet } from './ui.js';
import * as db from './db.js';
import { S, clearInvite, clearSignup } from './state.js';
import { attachBlock, saveAttachments } from './attach.js';
import { plansListHtml } from './plans.js';
import { shrink } from './attach.js';

let afterOnboard = () => {};
export function onOnboarded(fn) { afterOnboard = fn; }
function d() { return S.draft; }
function stepsBar(n, m) { return '<div class="steps" style="margin-bottom:6px">' + Array.from({ length: m }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</div>'; }
function keepFields(ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) d()[id] = el.value; }); }
function segc(id, opts, cur, action) { return '<div class="segc">' + Object.keys(opts).map(k => '<button type="button" class="' + (cur === k ? 'on' : '') + '" onclick="A.' + action + '(\'' + id + '\',\'' + k + '\')">' + esc(t(opts[k])) + '</button>').join('') + '</div>'; }
A.pickOne = (k, v) => { keepAll(); d()[k] = v; rerender(); };
A.togMany = (k, v) => { keepAll(); const a = d()[k] = d()[k] || []; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); rerender(); };
function keepAll() { keepFields(['name', 'age', 'weight_kg', 'height_cm', 'goal_detail', 'injuries', 'allergies', 'budget_min', 'budget_max', 'pitch', 'gym', 'district', 'years', 'links']); }
function chipsMany(k, opts, keys) { const sel = d()[k] || []; return '<div class="chips">' + (keys || Object.keys(opts)).map(o => '<button type="button" class="chip ' + (sel.includes(o) ? 'on' : '') + '" onclick="A.togMany(\'' + k + '\',\'' + o + '\')">' + esc(t(opts[o])) + '</button>').join('') + '</div>'; }
function chipsOne(k, opts, keys) { const sel = d()[k]; return '<div class="chips">' + (keys || Object.keys(opts)).map(o => '<button type="button" class="chip ' + (sel === o ? 'on' : '') + '" onclick="A.pickOne(\'' + k + '\',\'' + o + '\')">' + esc(t(opts[o])) + '</button>').join('') + '</div>'; }
const SEX = { f: 'Female', m: 'Male' }; const TOD = { morning: 'Morning', day: 'Daytime', evening: 'Evening' }; const PLACE = { gym: 'Gym', home: 'Home' };
export const DISTRICTS = { vake: 'Vake', saburtalo: 'Saburtalo', vera: 'Vera', didube: 'Didube', isani: 'Isani', gldani: 'Gldani', samgori: 'Samgori', nadzaladevi: 'Nadzaladevi', chugureti: 'Chugureti', mtatsminda: 'Mtatsminda', krtsanisi: 'Krtsanisi', didi_dighomi: 'Didi Dighomi', other: 'Other' };
const CG = { any: 'Any', f: 'Woman', m: 'Man' };
const inviteCoach = () => (S.invite && S.invite.kind === 'client' && S.invite.info && S.invite.info.coach) || '';
const ERR = '<div class="err" id="err"></div>';

// ================================================================ trainee: 4 steps
SCREENS.q1 = () => { const x = d(); const m = inviteCoach() ? 3 : 4;
  return { title: t('Who you are'), sub: t('Step {n} of {m}', { n: 1, m }), tabs: false, back: false, body: stepsBar(1, m) +
    (inviteCoach() ? '<p class="lead">' + t('A few answers so {name} can plan for you. Only you and your coach see them.', { name: inviteCoach() }) + '</p>' : '') +
    field(t('Your name'), 'name', x.name, { ph: t('e.g. Nino Beridze'), attrs: ' autocomplete="name"' }) +
    '<div class="field"><label>' + t('Sex') + '</label>' + segc('sex', SEX, x.sex, 'pickOne') + '</div>' +
    '<div class="input-row">' + field(t('Age'), 'age', x.age, { type: 'number', ph: '29' }) + field(t('Weight'), 'weight_kg', x.weight_kg, { type: 'number', unit: 'kg', ph: '70' }) + field(t('Height'), 'height_cm', x.height_cm, { type: 'number', unit: 'cm', ph: '170' }) + '</div>' +
    '<div class="field"><label>' + t('Experience') + '</label>' + chipsOne('experience', OPTS.experience) + '</div>' +
    '<div class="link" onclick="A.tellTune()">' + I.spark + ' ' + t('Tell Tune instead — it fills the answers') + '</div>' + ERR +
    '<button class="btn" onclick="A.qNext(1)">' + t('Next') + '</button>' }; };
SCREENS.q2 = () => { const x = d(); const m = inviteCoach() ? 3 : 4;
  return { title: t('Your direction'), sub: t('Step {n} of {m}', { n: 2, m }), tabs: false, body: stepsBar(2, m) +
    '<div class="field"><label>' + t('Main goal') + '</label>' + chipsOne('goal', OPTS.goal) + '</div>' +
    field(t('Anything specific?'), 'goal_detail', x.goal_detail, { textarea: true, ph: t('e.g. lose 5 kg before summer, run 5 km') }) +
    field(t('Injuries or pain'), 'injuries', x.injuries, { ph: t('e.g. left knee, lower back — or none') }) +
    '<div class="field"><label>' + t('Eating style') + '</label>' + chipsOne('eating_style', OPTS.eating_style, ['normal', 'vegetarian', 'vegan', 'nopork', 'fasting']) + '</div>' +
    field(t('Allergies or foods I avoid'), 'allergies', x.allergies, { ph: t('e.g. nuts, lactose, pork') }) + ERR +
    '<button class="btn" onclick="A.qNext(2)">' + t('Next') + '</button>' }; };
SCREENS.q3 = () => { const x = d(); const m = inviteCoach() ? 3 : 4; const days = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
  const sel = (x.days || []).map(String);
  return { title: t('When and how'), sub: t('Step {n} of {m}', { n: 3, m }), tabs: false, body: stepsBar(3, m) +
    '<div class="field"><label>' + t('Days you can train') + '</label><div class="wstrip">' + Object.keys(days).map(k => '<button type="button" class="wd ' + (sel.includes(k) ? 'today' : '') + '" onclick="A.togMany(\'days\',\'' + k + '\')" aria-pressed="' + sel.includes(k) + '"><span>' + esc(dayName(Number(k), true)) + '</span></button>').join('') + '</div></div>' +
    '<div class="field"><label>' + t('Time of day') + '</label>' + chipsMany('time_of_day', TOD) + '</div>' +
    '<div class="field"><label>' + t('Where you train') + '</label>' + segc('place', PLACE, x.place || 'gym', 'pickOne') + '</div>' +
    '<div class="field"><label>' + t('With a coach') + '</label>' + chipsOne('format', OPTS.format) + '</div>' + ERR +
    '<button class="btn" onclick="A.qNext(3)">' + (inviteCoach() ? t('Join and start') : t('Next')) + '</button>' }; };
SCREENS.q4 = () => { const x = d();
  return { title: t('Preferences'), sub: t('Step {n} of {m}', { n: 4, m: 4 }), tabs: false, body: stepsBar(4, 4) +
    '<div class="field"><label>' + t('Budget per month') + '</label><div class="input-row">' + field(t('From'), 'budget_min', x.budget_min, { type: 'number', unit: '₾', ph: '100' }) + field(t('To'), 'budget_max', x.budget_max, { type: 'number', unit: '₾', ph: '250' }) + '</div></div>' +
    '<div class="field"><label>' + t('District') + '</label>' + chipsOne('district', DISTRICTS) + '</div>' +
    '<div class="field"><label>' + t('Coach gender') + '</label>' + chipsOne('coach_gender', CG) + '</div>' +
    '<div class="s">' + t('Only used to rank coaches. You can change it later in My answers.') + '</div>' + ERR +
    '<button class="btn" onclick="A.qNext(4)">' + t('Next') + '</button>' }; };
A.qNext = (n) => {
  keepAll(); const x = d(); const err = document.getElementById('err');
  if (n === 1) {
    if (!x.name || x.name.trim().length < 2) { err.textContent = t('Please enter your name.'); return; }
    const w = x.weight_kg ? Number(x.weight_kg) : null, h = x.height_cm ? Number(x.height_cm) : null, a = x.age ? Number(x.age) : null;
    if (w !== null && (isNaN(w) || w < 20 || w > 400)) { err.textContent = t('Check the number: weight in kg, 20–400.'); return; }
    if (h !== null && (isNaN(h) || h < 100 || h > 250)) { err.textContent = t('Check the number: height in cm, 100–250.'); return; }
    if (a !== null && (isNaN(a) || a < 14 || a > 99)) { err.textContent = t('Check the age (14–99).'); return; }
    if (!x.experience) { err.textContent = t('Pick your experience.'); return; }
    go('q2'); return;
  }
  if (n === 2) { if (!x.goal) { err.textContent = t('Pick your main goal.'); return; } go('q3'); return; }
  if (n === 3) { if (!(x.days || []).length) { err.textContent = t('Pick at least one day.'); return; } if (!x.format) x.format = 'inperson'; if (inviteCoach()) { A.finishTrainee(); return; } go('q4'); return; }
  if (n === 4) { go('howTrain'); }
};
A.tellTune = () => sheet('<div class="h2">' + t('Tell Tune about yourself') + '</div><div class="s">' + t('One paragraph is enough: age, weight, how often you train, what you want, anything that hurts. Tune fills the steps; you check them.') + '</div>' +
  field('', 'tt_text', '', { textarea: true, ph: t('e.g. I\'m 29, 68 kg, 167 cm, beginner, want to lose about 8 kg, left knee hurts on lunges, free Mon Wed Fri evenings…') }) +
  '<button class="btn" onclick="A.tellTuneGo()">' + t('Fill my answers') + '</button>');
// a small offline parser (numbers + keywords in EN/KA); the real Tune can refine it later from the chat
A.tellTuneGo = () => {
  const s = (val('tt_text') || '').toLowerCase(); const x = d(); const num = re => { const m = s.match(re); return m ? m[1] : null; };
  const age = num(/(\d{2})\s*(?:years|yo|y\.o|წლის|year)/) || num(/i(?:'m| am)\s*(\d{2})/); if (age) x.age = age;
  const w = num(/(\d{2,3}(?:[.,]\d)?)\s*(?:kg|კგ|კილო)/); if (w) x.weight_kg = w.replace(',', '.');
  const h = num(/(1\d{2}|2[0-4]\d)\s*(?:cm|სმ)/); if (h) x.height_cm = h;
  if (/beginner|never|first time|დამწყებ|არასდროს/.test(s)) x.experience = 'beginner'; else if (/regular|years|წლებია|რეგულარ/.test(s)) x.experience = 'regular'; else if (/some|a bit|sometimes|ცოტა|ზოგჯერ/.test(s)) x.experience = 'some';
  if (/lose|fat|slim|weight|დავიკლო|წონ|გახდომ/.test(s)) x.goal = 'lose'; else if (/muscle|gain|bulk|კუნთ|მოვიმატო/.test(s)) x.goal = 'gain'; else if (/strength|strong|ძალ|ძლიერ/.test(s)) x.goal = 'sport'; else if (/tone|fit|shape|ფორმ|ტონუს/.test(s)) x.goal = 'tone'; else if (/health|energy|ჯანმრთ|ენერგ/.test(s)) x.goal = 'health';
  const inj = []; if (/knee|მუხლ/.test(s)) inj.push(t('knee')); if (/back|წელ|ზურგ/.test(s)) inj.push(t('lower back')); if (/shoulder|მხარ/.test(s)) inj.push(t('shoulder')); if (/wrist|მაჯ/.test(s)) inj.push(t('wrist')); if (/ankle|კოჭ/.test(s)) inj.push(t('ankle')); if (inj.length) x.injuries = inj.join(', ');
  if (/vegan|ვეგან/.test(s)) x.eating_style = 'vegan'; else if (/vegetarian|ვეგეტარ/.test(s)) x.eating_style = 'vegetarian'; else if (/no pork|ღორის გარეშე|without pork/.test(s)) x.eating_style = 'nopork'; else if (/fast|მარხვ/.test(s)) x.eating_style = 'fasting';
  const D = { 1: /\bmon|ორშ/, 2: /\btue|სამშ/, 3: /\bwed|ოთხშ/, 4: /\bthu|ხუთშ/, 5: /\bfri|პარას/, 6: /\bsat|შაბ/, 7: /\bsun|კვირა\b/ }; const days = Object.keys(D).filter(k => D[k].test(s)); if (days.length) x.days = days;
  if (/weekday|every day|ყოველდღე/.test(s)) x.days = ['1', '2', '3', '4', '5'];
  const tod = []; if (/morning|დილ/.test(s)) tod.push('morning'); if (/evening|night|საღამო/.test(s)) tod.push('evening'); if (/noon|lunch|daytime|დღის/.test(s)) tod.push('day'); if (tod.length) x.time_of_day = tod;
  if (/home|სახლ/.test(s)) x.place = 'home'; if (/gym|დარბაზ/.test(s)) x.place = 'gym';
  if (/online|ონლაინ/.test(s)) x.format = /in person|gym|პირად|დარბაზ/.test(s) ? 'either' : 'online';
  const b = s.match(/(\d{2,4})\s*(?:-|–|to)\s*(\d{2,4})\s*(?:gel|₾|ლარ)/); if (b) { x.budget_min = b[1]; x.budget_max = b[2]; } else { const b1 = num(/(\d{2,4})\s*(?:gel|₾|ლარ)/); if (b1) x.budget_max = b1; }
  closeSheet(); rerender(); toast(t('Filled — check each step'));
};

// how do you want to train?
SCREENS.howTrain = () => { const x = d(); const m = x.mode || 'solo';
  const opt = (k, title, sub, pill) => '<div class="card tap ' + (m === k ? 'sel' : '') + '" onclick="A.pickOne(\'mode\',\'' + k + '\')" role="radio" aria-checked="' + (m === k) + '"><div class="row between"><div class="h3">' + esc(t(title)) + '</div>' + (pill ? '<span class="pill ok">' + esc(t(pill)) + '</span>' : I.chev) + '</div><div class="s">' + esc(t(sub)) + '</div></div>';
  return { title: t('How do you want to train?'), tabs: false, body:
    opt('solo', 'Tune Up only', 'Free. A program made for you — Tune adjusts it every week.', 'Free') +
    opt('coach', 'Find a coach', 'Ranked matches, a free trial session, you pay the coach directly.') +
    opt('later', 'Start with Tune Up, add a coach later', 'The same free program; "Find a coach" stays on your Today.') + ERR +
    '<button class="btn" onclick="A.finishTrainee()">' + t('Next') + '</button>' }; };

A.finishTrainee = async () => {
  keepAll(); const x = d(); const err = document.getElementById('err');
  if (!x.name || !x.goal || !x.experience) { if (err) err.textContent = t('Something is missing — go back a step.'); return; }
  err && (err.textContent = ''); busy(true);
  const profile = { weight_kg: x.weight_kg || '', height_cm: x.height_cm || '', age: x.age || '', sex: x.sex || '', experience: x.experience, goal: x.goal, goal_detail: x.goal_detail || '', injuries: x.injuries || '', diet: x.allergies || '', eating_style: x.eating_style || '', allergies: x.allergies || '',
    format: x.format || 'inperson', days: (x.days || []).map(Number), time_of_day: x.time_of_day || [], place: x.place || 'gym', budget_min: x.budget_min || '', budget_max: x.budget_max || '', district: x.district || '', coach_gender: x.coach_gender || 'any' };
  try {
    if (inviteCoach()) { await db.redeemClient(S.invite.code, x.name.trim(), LANG.cur, profile); try { await db.updateTraineeProfile(S.me.id, { sex: profile.sex, age: profile.age || null, days: profile.days, time_of_day: profile.time_of_day, place: profile.place, eating_style: profile.eating_style, allergies: profile.allergies }); } catch (e) {} clearInvite(); S.draft = {}; toast(t('You are paired')); await afterOnboard(); return; }
    const mode = x.mode || 'solo';
    await db.signupTrainee(x.name.trim(), LANG.cur, profile, mode);
    clearSignup(); S.draft = {}; S.afterSignup = mode; toast(mode === 'coach' ? t('Welcome!') : t('Welcome — your program is ready'));
    await afterOnboard();
  } catch (e) { busy(false); if (err) err.textContent = friendly(e); else toast(friendly(e), 'err'); }
};
// a returning trainee who opens a new invite: pre-fill from the saved answers
export async function prefillTrainee() {
  const x = d(); if (S.me) x.name = x.name || S.me.name || '';
  try { const tp = await db.myTraineeProfile(S.me.id); if (tp) Object.keys(tp).forEach(k => { if (tp[k] != null && x[k] == null) x[k] = Array.isArray(tp[k]) ? tp[k].map(String) : tp[k]; }); } catch (e) {}
}
// the old single-form name still routes to the steps
SCREENS.traineeJoin = () => SCREENS.q1();

// ================================================================ coach: 5 steps
function cp() { const x = d(); x.cp = x.cp || { specialties: [], online: false, inperson: true, availability: {}, docs: [] }; return x.cp; }
SCREENS.coachSetup = () => { const x = d(); const c = cp();
  return { title: t('About you'), sub: t('Step {n} of {m}', { n: 1, m: 5 }), tabs: false, back: false, body: stepsBar(1, 5) +
    '<div class="row" style="gap:14px">' + (c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="" class="avatar xl" style="object-fit:cover">' : '<div class="avatar xl" style="background:var(--a-card);color:var(--a-mute)">' + I.camera + '</div>') + '<div class="col"><span class="link" onclick="document.getElementById(\'cs_photo\').click()">' + (c.photo_url ? t('Change photo') : t('Add a photo')) + '</span><span class="s">' + t('Trainees see it in Find a coach') + '</span></div></div>' +
    '<input type="file" id="cs_photo" accept="image/*" style="display:none" onchange="A.csPhoto(this)">' +
    field(t('Your name'), 'name', x.name, { ph: t('e.g. Giorgi Kapanadze'), attrs: ' autocomplete="name"' }) +
    '<div class="field"><label>' + t('Sex') + '</label>' + segc('cs_sex', SEX, c.sex, 'csPick') + '</div>' +
    field(t('Gym'), 'gym', c.gym, { ph: t('e.g. Fitness One, Saburtalo') }) +
    '<div class="field"><label>' + t('District') + '</label><div class="chips">' + Object.keys(DISTRICTS).map(o => '<button type="button" class="chip ' + (c.district === o ? 'on' : '') + '" onclick="A.csPick(\'cs_district\',\'' + o + '\')">' + esc(t(DISTRICTS[o])) + '</button>').join('') + '</div></div>' + ERR +
    '<button class="btn" onclick="A.csNext(1)">' + t('Next') + '</button>' }; };
A.csPick = (k, v) => { csKeep(); const c = cp(); if (k === 'cs_sex') c.sex = v; else if (k === 'cs_district') c.district = v; rerender(); };
function csKeep() { keepAll(); const c = cp(); const x = d(); ['pitch', 'gym', 'links'].forEach(k => { if (x[k] != null) c[k] = x[k]; }); if (x.years != null) c.years = x.years; }
A.csPhoto = async (input) => {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  try { busy(true); const r = await shrink(f, 600, 0.85); cp().photo_url = await db.uploadAvatar(S.me.id, r.blob, 'image/jpeg'); busy(false); rerender(); }
  catch (e) { busy(false); toast(t('Could not upload the photo'), 'err'); }
};
SCREENS.cs2 = () => { const c = cp();
  return { title: t('What you coach'), sub: t('Step {n} of {m}', { n: 2, m: 5 }), tabs: false, body: stepsBar(2, 5) +
    '<div class="field"><label>' + t('Specialties') + '</label><div class="chips">' + Object.keys(OPTS.specialty).map(k => '<button type="button" class="chip ' + (c.specialties.includes(k) ? 'on' : '') + '" onclick="A.csSpec(\'' + k + '\')">' + esc(t(OPTS.specialty[k])) + '</button>').join('') + '</div></div>' +
    field(t('Years coaching'), 'years', c.years, { type: 'number', ph: '5' }) +
    field(t('Your pitch'), 'pitch', c.pitch, { textarea: true, ph: t('Two sentences trainees read first — who you work with and how.') }) +
    '<div class="card" style="padding:12px 16px"><div class="row"><div class="grow"><div class="t">' + t('I also coach online') + '</div><div class="s">' + t('Needed for plans with video calls') + '</div></div><button type="button" class="toggle ' + (c.online ? 'on' : '') + '" onclick="A.csOnline()" aria-label="' + esc(t('I also coach online')) + '"></button></div></div>' +
    '<div class="card" style="padding:12px 16px"><div class="row"><div class="grow"><div class="t">' + t('I coach in person') + '</div><div class="s">' + t('At your gym — needed for plans with gym sessions') + '</div></div><button type="button" class="toggle ' + (c.inperson ? 'on' : '') + '" onclick="A.csInperson()" aria-label="' + esc(t('I coach in person')) + '"></button></div></div>' + ERR +
    '<button class="btn" onclick="A.csNext(2)">' + t('Next') + '</button>' }; };
A.csSpec = (k) => { csKeep(); const a = cp().specialties; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); rerender(); };
A.csOnline = () => { csKeep(); cp().online = !cp().online; rerender(); };
A.csInperson = () => { csKeep(); cp().inperson = !cp().inperson; rerender(); };
SCREENS.cs3 = () => { const c = cp(); const byKind = k => c.docs.filter(x => x.kind === k);
  return { title: t('CV & proof'), sub: t('Step {n} of {m}', { n: 3, m: 5 }), tabs: false, body: stepsBar(3, 5) +
    '<div class="s">' + t('Seen only by the Tune Up team. Needed once, before you appear in matching.') + '</div>' +
    '<div class="card"><div class="t">' + t('ID (photo)') + '</div>' + attachBlock('cd_id', byKind('id'), { accept: 'image/*', multiple: false, keep: 'id' }) + '</div>' +
    '<div class="card"><div class="t">' + t('Certificate (photo or PDF)') + '</div>' + attachBlock('cd_cert', byKind('cert'), { accept: 'image/*,application/pdf', multiple: false, keep: 'cert' }) + '</div>' +
    field(t('CV or links (optional)'), 'links', c.links, { ph: t('e.g. Instagram, a website, LinkedIn') }) + ERR +
    '<button class="btn" onclick="A.csNext(3)">' + t('Next') + '</button>' }; };
SCREENS.cs4 = () => { S.draft.plansDraft = true; S.draft.cp = cp();
  return { title: t('My plans'), sub: t('Step {n} of {m}', { n: 4, m: 5 }), tabs: false, body: stepsBar(4, 5) + plansListHtml() + ERR + '<button class="btn" onclick="A.csNext(4)">' + t('Next') + '</button>' }; };
SCREENS.cs5 = () => { const c = cp();
  return { title: t('Your free hours'), sub: t('Step {n} of {m}', { n: 5, m: 5 }), tabs: false, body: stepsBar(5, 5) +
    '<div class="s">' + t('Tap the hours you can take sessions. Free trials and bookings land only here.') + '</div>' +
    '<div class="card">' + availGrid(c.availability, 'csHour') + '</div>' +
    '<div class="row" style="gap:14px"><span class="row" style="gap:6px"><i class="avdot free"></i><span class="s">' + t('Free') + '</span></span><span class="s">' + t('Tap a day name to toggle its usual hours') + '</span></div>' + ERR +
    '<button class="btn" onclick="A.csNext(5)">' + (S.invite && S.invite.kind === 'coach' ? t('Create coach account') : t('Finish — send for review')) + '</button>' }; };
// free-hours grid: 7 weekdays × hours 7–21; availability = {"1":[9,10,…]}
export const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export function availGrid(av, action) {
  av = av || {};
  return '<div class="avail"><div></div>' + [1, 2, 3, 4, 5, 6, 7].map(dd => '<button type="button" class="hd" onclick="A.' + action + '(' + dd + ',0)">' + esc(dayName(dd, true)) + '</button>').join('') +
    HOURS.map(h => '<div class="hr">' + h + '</div>' + [1, 2, 3, 4, 5, 6, 7].map(dd => '<button type="button" class="c ' + ((av[dd] || []).includes(h) ? 'on' : '') + '" onclick="A.' + action + '(' + dd + ',' + h + ')" aria-label="' + esc(dayName(dd, true) + ' ' + h + ':00') + '" aria-pressed="' + (av[dd] || []).includes(h) + '"></button>').join('')).join('') + '</div>';
}
export function toggleHour(av, dd, h) {
  av[dd] = av[dd] || [];
  if (h === 0) { av[dd] = av[dd].length ? [] : [9, 10, 11, 12, 17, 18, 19, 20]; return av; }
  const i = av[dd].indexOf(h); if (i >= 0) av[dd].splice(i, 1); else av[dd].push(h); av[dd].sort((a, b) => a - b); return av;
}
export function availSummary(av) {
  av = av || {}; const n = [1, 2, 3, 4, 5, 6, 7].filter(dd => (av[dd] || []).length).length; if (!n) return '';
  const hs = [].concat(...[1, 2, 3, 4, 5, 6, 7].map(dd => av[dd] || [])); const lo = Math.min(...hs), hi = Math.max(...hs) + 1;
  return t('{n} days a week · {a}:00–{b}:00', { n, a: lo, b: hi });
}
A.csHour = (dd, h) => { csKeep(); toggleHour(cp().availability, dd, h); rerender(); };
A.csNext = async (n) => {
  csKeep(); const x = d(); const c = cp(); const err = document.getElementById('err');
  if (n === 1) { if (!x.name || x.name.trim().length < 2) { err.textContent = t('Please enter your name.'); return; } if (!c.district) { err.textContent = t('Pick your district.'); return; } go('cs2'); return; }
  if (n === 2) { if (!c.specialties.length) { err.textContent = t('Pick at least one specialty.'); return; } if (!c.online && !c.inperson) { err.textContent = t('Online, in person — or both.'); return; } if (!(c.pitch || '').trim()) { err.textContent = t('Write a sentence or two about how you coach.'); return; } go('cs3'); return; }
  if (n === 3) {
    busy(true);
    try { const idDocs = await saveAttachments('cd_id', 'tune/' + S.me.id + '/docs'); const certDocs = await saveAttachments('cd_cert', 'tune/' + S.me.id + '/docs'); c.docs = idDocs.map(a => Object.assign(a, { kind: 'id' })).concat(certDocs.map(a => Object.assign(a, { kind: 'cert' }))); }
    catch (e) { busy(false); err.textContent = t('Could not upload a file — try again.'); return; }
    busy(false);
    if (!(S.invite && S.invite.kind === 'coach') && !c.docs.find(a => a.kind === 'id')) { err.textContent = t('Add a photo of your ID — the team needs it for the review.'); return; }
    go('cs4'); return;
  }
  if (n === 4) { if (!(S.draft.plans || []).length) { err.textContent = t('Add at least one plan (or let Tune suggest).'); return; } go('cs5'); return; }
  if (n === 5) {
    if (![1, 2, 3, 4, 5, 6, 7].some(dd => (c.availability[dd] || []).length)) { err.textContent = t('Mark at least a few free hours.'); return; }
    await finishCoach();
  }
};
async function finishCoach() {
  const x = d(); const c = cp(); const err = document.getElementById('err'); busy(true);
  const profile = { specialties: c.specialties, pitch: c.pitch || '', gym: c.gym || '', district: c.district || '', inperson: !!c.inperson, online: !!c.online, years: c.years || '', sex: c.sex || '', photo_url: c.photo_url || '', docs: c.docs || [], links: c.links || '', availability: c.availability || {} };
  try {
    if (S.invite && S.invite.kind === 'coach') {
      await db.redeemCoach(S.invite.code, x.name.trim(), LANG.cur, profile);      // admin-vetted: approved at once
      await db.saveCoachProfile(S.me.id, { years: profile.years || null, sex: profile.sex, photo_url: profile.photo_url, docs: profile.docs, links: profile.links, availability: profile.availability });
      clearInvite();
    } else await db.signupCoach(x.name.trim(), LANG.cur, profile);
    for (const [k, p] of (S.draft.plans || []).entries()) await db.savePlan(Object.assign({ coach_id: S.me.id, position: k }, p));
    clearSignup(); S.draft = {}; toast(t('Welcome, coach')); await afterOnboard();
  } catch (e) { busy(false); if (err) err.textContent = friendly(e); }
}

// ================================================================ no invite, no role: pick a role (public sign-up)
SCREENS.pickRole = () => ({ title: t('Welcome to Tune Up'), tabs: false, back: false, body:
  '<div class="card tap" onclick="A.startAs(\'trainee\')"><div class="row between"><div class="h3">' + t('I want to train') + '</div>' + I.chev + '</div><div class="s">' + t('A free program with Tune, or a Tbilisi coach with a free trial session.') + '</div></div>' +
  '<div class="card tap" onclick="A.startAs(\'coach\')"><div class="row between"><div class="h3">' + t('I am a coach') + '</div>' + I.chev + '</div><div class="s">' + t('Set up your profile and plans; the Tune Up team reviews it within a day or two.') + '</div></div>' +
  '<div class="mute small">' + t('Signed in as {email}', { email: (S.session && S.session.user && S.session.user.email) || '' }) + '</div>' +
  '<button class="btn sec" onclick="A.signOut()">' + I.logout + ' ' + t('Sign out') + '</button>' });
A.startAs = (role) => { S.draft = { name: (S.me && S.me.name) || '' }; root(role === 'coach' ? 'coachSetup' : 'q1'); };

function friendly(e) {
  const m = (e && e.message) || '';
  if (/invite invalid/.test(m)) return t('This invite link is no longer valid — ask for a new one.');
  if (/already paired/.test(m)) return t('You already have a coach. Ask them to end the pairing first.');
  if (/already has a role/.test(m)) return t('This account is already set up in another role.');
  if (/own invite/.test(m)) return t('You cannot use your own invite link.');
  if (/consent/.test(m)) return t('Please accept the data notice first.');
  return t('Something went wrong — try again.');
}
