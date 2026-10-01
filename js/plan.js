// Tune Up beta — coach side: weekly plan builder, exercise library, targets, goals (per client).
import { t, esc, dayName, exName, exMuscle, unit } from './i18n.js';
import { SCREENS, A, I, go, back, rerender, toast, sheet, closeSheet, field, val, busy, empty } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

// S.plan = { pairId, items, targets, goals }; S.exercises = library (loaded once per session)
export async function loadPlan(pairId) {
  const [items, targets, goals] = await Promise.all([db.planItems(pairId), db.getTargets(pairId), db.listGoals(pairId)]);
  S.plan = { pairId, items, targets, goals };
  if (!S.exercises) S.exercises = await db.listExercises();
  return S.plan;
}
function itemsFor(day) { return (S.plan ? S.plan.items : []).filter(i => i.day === day); }
export function nEx(n) { return n === 1 ? t('1 exercise') : t('{n} exercises', { n }); }
function itemLine(i) { return [i.sets + ' × ' + i.reps, i.load].filter(Boolean).join(' · '); }
function videoBtn(x) { return x && x.video_url ? '<a class="btn xs sec" href="' + esc(x.video_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.video + ' ' + t('Video') + '</a>' : ''; }

// ---- plan overview card (used inside the client screen)
export function planCard(pairId) {
  const p = S.plan && S.plan.pairId === pairId ? S.plan : null;
  if (!p) return '';
  const days = [1, 2, 3, 4, 5, 6, 7].map(d => { const n = itemsFor(d).length; return '<div class="lrow" style="cursor:pointer" onclick="A.go(\'planDay\',{day:' + d + '})"><div class="grow"><div class="t">' + esc(dayName(d)) + '</div><div class="s">' + (n ? nEx(n) : t('Rest day')) + '</div></div>' + I.chev + '</div>'; }).join('');
  const tg = p.targets;
  const tgLine = tg ? [tg.kcal ? tg.kcal + ' ' + unit('kcal') : '', tg.protein_g ? tg.protein_g + ' ' + unit('g') + ' ' + t('protein') : '', tg.water_ml ? (tg.water_ml / 1000) + ' L' : '', tg.steps ? tg.steps + ' ' + t('steps') : ''].filter(Boolean).join(' · ') : t('Not set yet');
  const goals = p.goals.length ? p.goals.map(g => '<div class="row" style="gap:8px"><span class="check ' + (g.done ? 'on' : '') + '" style="width:20px;height:20px">' + (g.done ? I.check : '') + '</span><span class="grow ' + (g.done ? 'mute' : '') + '">' + esc(g.text) + '</span></div>').join('') : '<div class="mute">' + t('No goals yet') + '</div>';
  return '<div class="section-title"><span class="eyebrow">' + t('Weekly plan') + '</span></div><div class="card">' + days + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Daily targets') + '</span><span class="link" onclick="A.targetsSheet()">' + t('Edit') + '</span></div><div class="card"><div class="lead">' + esc(tgLine) + '</div></div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Goals') + '</span><span class="link" onclick="A.goalsScreen()">' + t('Edit') + '</span></div><div class="card">' + goals + '</div>';
}

// ---- one day of the plan
SCREENS.planDay = ({ day }) => {
  const items = itemsFor(day);
  const body = (items.length ? '<div class="col" style="gap:8px">' + items.map(i => '<div class="task" onclick="A.editItem(\'' + i.id + '\')"><div class="grow"><div class="t">' + esc(exName(i.exercise)) + '</div><div class="s">' + esc(itemLine(i)) + (i.note ? ' · ' + esc(i.note) : '') + '</div></div>' + videoBtn(i.exercise) + '</div>').join('') + '</div>' : empty('plan', t('Rest day — add an exercise to make it a training day'))) +
    '<button class="btn" onclick="A.go(\'pickExercise\',{day:' + day + '})">' + I.plus + ' ' + t('Add exercise') + '</button>';
  return { title: dayName(day), sub: nEx(items.length), body };
};

A.editItem = (id) => {
  const i = S.plan.items.find(x => x.id === id); if (!i) return;
  sheet('<div class="h2">' + esc(exName(i.exercise)) + '</div>' + itemFields(i) +
    '<button class="btn" onclick="A.saveItem(\'' + id + '\')">' + t('Save') + '</button><button class="btn sec" onclick="A.removeItem(\'' + id + '\')">' + t('Remove from this day') + '</button>');
};
function itemFields(i) {
  return '<div class="input-row">' + field(t('Sets'), 'f_sets', i.sets, { type: 'number', ph: '3' }) + field(t('Reps'), 'f_reps', i.reps, { ph: '10 / 8-12 / 30 s' }) + '</div>' +
    field(t('Load'), 'f_load', i.load, { ph: t('e.g. 20 kg, bodyweight') }) + field(t('Note for the client'), 'f_note', i.note, { ph: t('e.g. slow on the way down') });
}
function readItemFields() { return { sets: Math.max(1, Math.min(20, parseInt(val('f_sets') || '3', 10) || 3)), reps: val('f_reps') || '10', load: val('f_load'), note: val('f_note') }; }
A.saveItem = async (id) => {
  const patch = readItemFields(); busy(true);
  try { await db.updatePlanItem(id, patch); Object.assign(S.plan.items.find(x => x.id === id), patch); closeSheet(); toast(t('Saved')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.removeItem = async (id) => {
  try { await db.deletePlanItem(id); S.plan.items = S.plan.items.filter(x => x.id !== id); closeSheet(); rerender(); }
  catch (e) { toast(t('Could not remove — try again'), 'err'); }
};

// ---- pick an exercise from the library (global + own)
SCREENS.pickExercise = ({ day }) => {
  const qy = (S.draft.exq || '').toLowerCase();
  const list = (S.exercises || []).filter(x => !qy || exName(x).toLowerCase().includes(qy) || x.name.toLowerCase().includes(qy) || exMuscle(x).toLowerCase().includes(qy));
  const mine = list.filter(x => x.owner_id === S.me.id), glob = list.filter(x => !x.owner_id);
  const row = x => '<div class="lrow" style="cursor:pointer" onclick="A.addItemFor(' + day + ',\'' + x.id + '\')"><div class="grow"><div class="t">' + esc(exName(x)) + '</div><div class="s">' + esc(exMuscle(x)) + (x.video_url ? ' · ' + t('video') : '') + '</div></div>' + I.plus + '</div>';
  return { title: t('Add to {day}', { day: dayName(day) }), body:
    '<input class="input" id="exq" placeholder="' + esc(t('Search exercises')) + '" value="' + esc(S.draft.exq || '') + '" oninput="A.exSearch(this.value)">' +
    '<button class="btn sec sm" onclick="A.newExercise(' + day + ')">' + I.plus + ' ' + t('New exercise with my video link') + '</button>' +
    (mine.length ? '<div class="section-title"><span class="eyebrow">' + t('My exercises') + '</span></div><div class="card">' + mine.map(row).join('') + '</div>' : '') +
    (glob.length ? '<div class="section-title"><span class="eyebrow">' + t('Library') + '</span></div><div class="card">' + glob.map(row).join('') + '</div>' : '<div class="mute">' + t('Nothing found') + '</div>') };
};
A.exSearch = (v) => { S.draft.exq = v; const el = document.getElementById('exq'); const pos = el ? el.selectionStart : 0; rerender(); const n = document.getElementById('exq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
A.addItemFor = async (day, exId) => {
  const x = S.exercises.find(e => e.id === exId); if (!x) return;
  sheet('<div class="h2">' + esc(exName(x)) + '</div><div class="mute">' + esc(exMuscle(x)) + '</div>' + itemFields({ sets: 3, reps: '10', load: '', note: '' }) +
    '<button class="btn" onclick="A.confirmAdd(' + day + ',\'' + exId + '\')">' + t('Add to plan') + '</button>');
};
A.confirmAdd = async (day, exId) => {
  const f = readItemFields(); busy(true);
  try {
    const position = itemsFor(day).length;
    const it = await db.addPlanItem({ pair_id: S.plan.pairId, day, exercise_id: exId, position, ...f });
    S.plan.items.push(it); S.draft.exq = ''; closeSheet(); toast(t('Added')); back();
  } catch (e) { busy(false); toast(t('Could not add — try again'), 'err'); }
};

// ---- the coach's own exercises (with video links)
A.newExercise = (day) => sheet('<div class="h2">' + t('New exercise') + '</div>' + field(t('Name'), 'x_name', '', { ph: t('e.g. Box squat (my cue)') }) + field(t('Muscle group'), 'x_muscle', '', { ph: t('e.g. Legs') }) + field(t('Video link (YouTube, Drive…)'), 'x_video', '', { ph: 'https://', attrs: ' inputmode="url"' }) + field(t('Note'), 'x_note', '', { ph: t('optional') }) +
  '<button class="btn" onclick="A.saveExercise(' + (day || 0) + ')">' + t('Save exercise') + '</button>');
A.saveExercise = async (day) => {
  const name = val('x_name'); if (name.length < 2) { toast(t('Please enter a name.'), 'err'); return; }
  const video = val('x_video'); if (video && !/^https?:\/\//.test(video)) { toast(t('The video link must start with https://'), 'err'); return; }
  busy(true);
  try { const x = await db.addExercise(S.me.id, { name, muscle: val('x_muscle'), video_url: video, note: val('x_note') }); S.exercises.push(x); S.exercises.sort((a, b) => a.name.localeCompare(b.name)); closeSheet(); toast(t('Saved')); if (day) A.addItemFor(day, x.id); else rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
SCREENS.myExercises = () => {
  const mine = (S.exercises || []).filter(x => x.owner_id === S.me.id);
  return { title: t('My exercises'), body:
    '<div class="mute">' + t('Your own moves and video links. Clients see them inside their plan.') + '</div>' +
    (mine.length ? '<div class="card">' + mine.map(x => '<div class="lrow"><div class="grow"><div class="t">' + esc(x.name) + '</div><div class="s">' + esc([x.muscle, x.video_url ? t('video') : ''].filter(Boolean).join(' · ')) + '</div></div>' + videoBtn(x) + '<button class="act" onclick="A.deleteExercise(\'' + x.id + '\')" aria-label="Delete">' + I.x + '</button></div>').join('') + '</div>' : '<div class="card flat mute">' + t('None yet.') + '</div>') +
    '<button class="btn" onclick="A.newExercise(0)">' + I.plus + ' ' + t('New exercise') + '</button>',
    after: async () => { if (!S.exercises) { S.exercises = await db.listExercises(); rerender(); } } };
};
A.deleteExercise = async (id) => { try { await db.deleteExercise(id); S.exercises = S.exercises.filter(x => x.id !== id); rerender(); toast(t('Removed')); } catch (e) { toast(t('Could not remove — it may be in a plan'), 'err'); } };

// ---- targets
A.targetsSheet = () => {
  const tg = (S.plan && S.plan.targets) || {};
  sheet('<div class="h2">' + t('Daily targets') + '</div><div class="mute">' + t('Leave empty what you do not track.') + '</div>' +
    '<div class="input-row">' + field(t('Calories'), 'tg_kcal', tg.kcal || '', { type: 'number', unit: unit('kcal'), ph: '1800' }) + field(t('Protein'), 'tg_protein', tg.protein_g || '', { type: 'number', unit: unit('g'), ph: '120' }) + '</div>' +
    '<div class="input-row">' + field(t('Water'), 'tg_water', tg.water_ml || '', { type: 'number', unit: unit('ml'), ph: '2000' }) + field(t('Steps'), 'tg_steps', tg.steps || '', { type: 'number', ph: '8000' }) + '</div>' +
    '<button class="btn" onclick="A.saveTargets()">' + t('Save') + '</button>');
};
A.saveTargets = async () => {
  const n = id => { const v = parseInt(val(id), 10); return isNaN(v) ? null : v; };
  const patch = { kcal: n('tg_kcal'), protein_g: n('tg_protein'), water_ml: n('tg_water'), steps: n('tg_steps') };
  busy(true);
  try { await db.saveTargets(S.plan.pairId, patch); S.plan.targets = { pair_id: S.plan.pairId, ...patch }; closeSheet(); toast(t('Saved')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — check the numbers'), 'err'); }
};

// ---- goals
A.goalsScreen = () => go('goals');
SCREENS.goals = () => {
  const gs = (S.plan && S.plan.goals) || [];
  return { title: t('Goals'), body:
    (gs.length ? '<div class="card">' + gs.map(g => '<div class="lrow"><button class="check ' + (g.done ? 'on' : '') + '" onclick="A.toggleGoal(\'' + g.id + '\')">' + (g.done ? I.check : '') + '</button><div class="grow ' + (g.done ? 'mute' : '') + '">' + esc(g.text) + '</div><button class="act" onclick="A.deleteGoal(\'' + g.id + '\')" aria-label="Delete">' + I.x + '</button></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No goals yet') + '</div>') +
    field(t('New goal'), 'goal_text', '', { ph: t('e.g. Run 5 km without stopping') }) + '<button class="btn" onclick="A.addGoal()">' + I.plus + ' ' + t('Add goal') + '</button>' };
};
A.addGoal = async () => {
  const text = val('goal_text'); if (!text) return; busy(true);
  try { const g = await db.addGoal(S.plan.pairId, text, S.plan.goals.length); S.plan.goals.push(g); rerender(); }
  catch (e) { busy(false); toast(t('Could not add — try again'), 'err'); }
};
A.toggleGoal = async (id) => { const g = S.plan.goals.find(x => x.id === id); try { await db.updateGoal(id, { done: !g.done }); g.done = !g.done; rerender(); } catch (e) { toast(t('Could not save — try again'), 'err'); } };
A.deleteGoal = async (id) => { try { await db.deleteGoal(id); S.plan.goals = S.plan.goals.filter(x => x.id !== id); rerender(); } catch (e) { toast(t('Could not remove — try again'), 'err'); } };
