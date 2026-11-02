// Tune Up beta — coach plans built from the product's components (Launch 1, decided 2026-10-31).
// A coach composes 1–4 plans: a name, ticked components with their numbers, a monthly price in GEL. Trainees see the
// plan cards on the coach profile and pick one after the free trial. Plans never lock app features — they are the
// coach's promise, shown on both sides. Chat, Tune and daily logging are always included.
import { t, esc, unit } from './i18n.js';
import { SCREENS, A, I, go, back, rerender, toast, sheet, closeSheet, field, val, busy, empty } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

// the catalogue: key → label, what it means, and how it is counted (n = number, c = cadence, b = yes/no)
export const COMPONENTS = [
  { k: 'plan', b: true, label: 'Training plan', sub: 'A weekly plan you build and update' },
  { k: 'nutrition', b: true, label: 'Nutrition coaching', sub: 'Daily targets, the food log reviewed, 👍 on good entries' },
  { k: 'gym', n: true, unit: 'per month', label: 'Gym sessions', sub: 'At your gym' },
  { k: 'video', n: true, unit: 'per month', label: 'Video-call sessions', sub: 'Needs "I also coach online"' },
  { k: 'form', n: true, unit: 'per week', label: 'Form checks', sub: 'The client sends a clip in chat, you reply on it' },
  { k: 'content', b: true, label: 'Your video content', sub: 'Your follow-along video links' },
  { k: 'checkin', c: true, label: 'Check-in replies', sub: 'How often you answer the evening check-in' },
  { k: 'review', b: true, label: 'Monthly progress review', sub: 'A call plus a written summary' }
];
export const CADENCE = { daily: 'daily', '3x': '3× a week', weekly: 'weekly' };

// one line per ticked component, in the reader's language ("8 gym sessions / month", "Check-in replies daily")
export function componentLines(c) {
  c = c || {}; const out = [];
  if (c.plan) out.push(t('Training plan'));
  if (c.nutrition) out.push(t('Nutrition coaching'));
  if (c.gym > 0) out.push(t('{n} gym sessions / month', { n: c.gym }));
  if (c.video > 0) out.push(t('{n} video calls / month', { n: c.video }));
  if (c.form > 0) out.push(t('Form checks {n} / week', { n: c.form }));
  if (c.content) out.push(t('Coach\'s video content'));
  if (c.checkin && CADENCE[c.checkin]) out.push(t('Check-in replies {c}', { c: t(CADENCE[c.checkin]) }));
  if (c.review) out.push(t('Monthly progress review'));
  if (c.custom) out.push(c.custom);
  return out;
}
export function planFormat(c) { c = c || {}; const g = c.gym > 0, v = c.video > 0; return g && v ? 'either' : v ? 'online' : g ? 'inperson' : 'either'; }
export function cheapest(plans, format) {
  const ok = (plans || []).filter(p => p.status !== 'paused').filter(p => !format || format === 'either' || planFormat(p.components) === 'either' || planFormat(p.components) === format);
  return ok.length ? Math.min(...ok.map(p => p.price_gel)) : null;
}
// the card trainees see
export function planCardHtml(p, opts) {
  opts = opts || {};
  const lines = componentLines(p.components);
  const btn = opts.chosen ? '<div class="btn" style="pointer-events:none">' + I.check + ' ' + t('Chosen') + '</div>' : opts.choose ? '<button class="btn sec" onclick="' + opts.choose + '">' + t('Choose') + '</button>' : '';
  return '<div class="card plan' + (opts.chosen ? ' sel' : '') + '"><div class="row between" style="align-items:flex-start"><div class="h3" style="flex:1;min-width:0">' + esc(p.name) + (p.status === 'paused' ? ' <span class="tag">' + t('Paused') + '</span>' : '') + '</div><div class="pr">' + esc(String(p.price_gel)) + ' ₾ <small>' + t('/ month') + '</small></div></div>' +
    '<ul>' + lines.map(l => '<li><i>' + I.check + '</i>' + esc(l) + '</li>').join('') + '</ul>' + btn + '</div>';
}

// ---- My plans (coach: More → My plans, and step 4 of the sign-up). S.draft.plans holds unsaved plans during sign-up.
function list() { return S.draft.plansDraft ? (S.draft.plans || []) : (S.coachPlans || []); }
export function plansListHtml(opts) {
  const ps = list(); opts = opts || {};
  const row = (p, i) => '<div class="srow" style="cursor:pointer" onclick="A.planEdit(' + i + ')"><div class="grow" style="min-width:0"><div class="row" style="gap:8px"><div class="t">' + esc(p.name) + '</div><span class="tag ' + (p.status === 'paused' ? '' : 'ok') + '">' + (p.status === 'paused' ? t('Paused') : t('Active')) + '</span></div><div class="s wrap">' + esc(componentLines(p.components).join(' · ')) + '</div></div><div class="r" style="font-weight:800;white-space:nowrap">' + esc(String(p.price_gel)) + ' ₾</div>' + I.chev + '</div>';
  return (opts.intro !== false ? '<div class="s">' + t('Build 1–4 plans from what Tune Up offers. Trainees pick one after the free trial and pay you directly.') + '</div>' : '') +
    '<div class="card tune tap" onclick="A.planSuggest()"><div class="row"><span style="color:var(--c-tune)">' + I.spark + '</span><div class="grow"><div class="t">' + t('Suggest plans') + '</div><div class="s">' + t('Tune drafts 2–3 from your profile — you edit') + '</div></div>' + I.chev + '</div></div>' +
    (ps.length ? '<div class="slist">' + ps.map(row).join('') + '</div>' : '<div class="card flat mute">' + t('No plans yet.') + '</div>') +
    (ps.length < 4 ? '<button class="btn sec" onclick="A.planEdit(-1)">' + I.plus + ' ' + t('Add a plan') + '</button>' : '');
}
SCREENS.myPlans = () => ({ title: t('My plans'), sub: t('{n} of 4', { n: list().length }), body: plansListHtml(),
  after: async () => { if (!S.coachPlans && !S.draft.plansDraft) { try { S.coachPlans = await db.myPlans(S.me.id); rerender(); } catch (e) {} } } });

// the editor sheet
function blank() { return { name: '', price_gel: '', components: { plan: true, nutrition: true, checkin: 'weekly' }, status: 'active' }; }
A.planEdit = (i) => {
  const ps = list(); S.draft.pe = { i, p: JSON.parse(JSON.stringify(i >= 0 ? ps[i] : blank())) };
  planSheet();
};
function planSheet() {
  const { i, p } = S.draft.pe; const c = p.components = p.components || {};
  const row = (comp) => {
    const on = comp.b ? !!c[comp.k] : comp.n ? (c[comp.k] || 0) > 0 : !!c[comp.k];
    const ctl = comp.n ? '<div class="stepper"><button type="button" onclick="A.peNum(\'' + comp.k + '\',-1)" aria-label="−">−</button><b>' + (c[comp.k] || 0) + '</b><button type="button" onclick="A.peNum(\'' + comp.k + '\',1)" aria-label="+">+</button></div>'
      : comp.c ? '<button type="button" class="chip sm amb" onclick="A.peCad()">' + esc(c.checkin ? t(CADENCE[c.checkin] || 'weekly') : t('off')) + '</button>' : '';
    return '<div class="comp"><button type="button" class="check ' + (on ? 'on' : '') + '" onclick="A.peTog(\'' + comp.k + '\')" aria-label="' + esc(t(comp.label)) + '">' + (on ? I.check : '') + '</button><div class="grow"><div class="t">' + esc(t(comp.label)) + (comp.n && on ? ' <span class="mute small">' + esc(t(comp.unit)) + '</span>' : '') + '</div><div class="s">' + esc(t(comp.sub)) + '</div></div>' + ctl + '</div>';
  };
  const fmt = planFormat(c); const fmtLabel = fmt === 'either' ? t('In person or online') : fmt === 'online' ? t('Online') : t('In person');
  sheet('<div class="h2">' + (i >= 0 ? t('Edit plan') : t('New plan')) + '</div>' +
    field(t('Plan name'), 'pe_name', p.name, { ph: t('e.g. Online basic, Full gym'), attrs: ' maxlength="60"' }) +
    '<div class="s">' + t('Included in every plan: chat, Tune, daily logging.') + '</div>' +
    '<div class="eyebrow">' + t('What this plan includes') + '</div><div class="card" style="gap:0;padding:4px 14px">' + COMPONENTS.map(row).join('') + '</div>' +
    field(t('One extra line (optional)'), 'pe_custom', c.custom || '', { ph: t('e.g. Gym access included'), attrs: ' maxlength="80"' }) +
    field(t('Price per month'), 'pe_price', p.price_gel, { type: 'number', unit: '₾', ph: '150' }) +
    '<div class="s">' + t('Format') + ': ' + esc(fmtLabel) + (c.video > 0 && S.coachProfile && !S.coachProfile.online && !(S.draft.cp && S.draft.cp.online) ? ' · <span style="color:var(--a-red)">' + esc(t('Video calls need "I also coach online" in your profile')) + '</span>' : '') + '</div>' +
    (i >= 0 ? '<div class="row between"><span class="t">' + t('Paused (hidden from new clients)') + '</span><button type="button" class="toggle ' + (p.status === 'paused' ? 'on' : '') + '" onclick="A.pePause()" aria-label="' + esc(t('Paused')) + '"></button></div>' : '') +
    '<button class="btn" onclick="A.peSave()">' + t('Save plan') + '</button>' + (i >= 0 ? '<button class="btn sec" onclick="A.peDelete()">' + t('Remove plan') + '</button>' : ''));
}
function peKeep() { const { p } = S.draft.pe; p.name = val('pe_name'); p.price_gel = val('pe_price'); p.components.custom = val('pe_custom'); }
A.peTog = (k) => { peKeep(); const c = S.draft.pe.p.components; const comp = COMPONENTS.find(x => x.k === k); if (comp.n) c[k] = c[k] > 0 ? 0 : (k === 'form' ? 1 : 4); else if (comp.c) c.checkin = c.checkin ? '' : 'weekly'; else c[k] = !c[k]; planSheet(); };
A.peNum = (k, d) => { peKeep(); const c = S.draft.pe.p.components; c[k] = Math.max(0, Math.min(k === 'form' ? 7 : 30, (c[k] || 0) + d)); planSheet(); };
A.peCad = () => { peKeep(); const c = S.draft.pe.p.components; const order = ['weekly', '3x', 'daily', '']; c.checkin = order[(order.indexOf(c.checkin || '') + 1) % order.length]; planSheet(); };
A.pePause = () => { peKeep(); const p = S.draft.pe.p; p.status = p.status === 'paused' ? 'active' : 'paused'; planSheet(); };
A.peSave = async () => {
  peKeep(); const { i, p } = S.draft.pe; const price = parseInt(p.price_gel, 10);
  if (!p.name.trim()) { toast(t('Give the plan a name.'), 'err'); return; }
  if (isNaN(price) || price < 0 || price > 5000) { toast(t('Enter a monthly price in GEL.'), 'err'); return; }
  const c = p.components; if (!(c.plan || c.nutrition || c.gym > 0 || c.video > 0 || c.form > 0 || c.content || c.checkin || c.review)) { toast(t('Tick at least one component.'), 'err'); return; }
  if (!c.custom) delete c.custom;
  const row = { name: p.name.trim().slice(0, 60), price_gel: price, components: c, status: p.status || 'active' };
  if (S.draft.plansDraft) { S.draft.plans = S.draft.plans || []; if (i >= 0) S.draft.plans[i] = row; else S.draft.plans.push(row); closeSheet(); rerender(); return; }
  busy(true);
  try {
    const saved = await db.savePlan(Object.assign(row, { coach_id: S.me.id, position: i >= 0 ? (S.coachPlans[i].position || i) : (S.coachPlans || []).length }, i >= 0 ? { id: S.coachPlans[i].id } : {}));
    S.coachPlans = await db.myPlans(S.me.id); closeSheet(); toast(t('Saved')); rerender(); return saved;
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.peDelete = async () => {
  const { i } = S.draft.pe; if (i < 0) return;
  if (S.draft.plansDraft) { S.draft.plans.splice(i, 1); closeSheet(); rerender(); return; }
  try { await db.deletePlan(S.coachPlans[i].id); S.coachPlans = await db.myPlans(S.me.id); closeSheet(); toast(t('Removed')); rerender(); }
  catch (e) { toast(t('Could not remove — a client may be on this plan'), 'err'); }
};

// "Suggest plans": Tune drafts 2–3 plans from the profile — deterministic, no network: the coach edits them anyway.
export function suggestPlans(cp) {
  cp = cp || {}; const online = !!cp.online, inperson = cp.inperson !== false; const out = [];
  const base = (cp.district || '').toLowerCase() === 'vake' ? 1.15 : 1;
  const r = n => Math.round(n * base / 10) * 10;
  if (online) out.push({ name: t('Online basic'), price_gel: r(90), components: { plan: true, nutrition: true, checkin: '3x', form: 1, content: true }, status: 'active' });
  if (online && inperson) out.push({ name: t('Hybrid'), price_gel: r(160), components: { plan: true, nutrition: true, video: 4, checkin: 'daily', form: 2 }, status: 'active' });
  else if (online) out.push({ name: t('Online plus'), price_gel: r(140), components: { plan: true, nutrition: true, video: 4, checkin: 'daily', form: 2, review: true }, status: 'active' });
  if (inperson) out.push({ name: t('Full gym'), price_gel: r(250), components: { plan: true, nutrition: true, gym: 8, checkin: 'daily', review: true }, status: 'active' });
  if (inperson && !online) out.unshift({ name: t('Gym 4'), price_gel: r(140), components: { plan: true, nutrition: true, gym: 4, checkin: 'weekly' }, status: 'active' });
  return out.slice(0, 3);
}
A.planSuggest = async () => {
  const cp = S.draft.plansDraft ? (S.draft.cp || {}) : (S.coachProfile || {});
  const sug = suggestPlans(cp); const cur = list();
  const fresh = sug.filter(s => !cur.find(p => p.name === s.name)).slice(0, Math.max(0, 4 - cur.length));
  if (!fresh.length) { toast(t('You already have these — edit a plan instead'), 'err'); return; }
  if (S.draft.plansDraft) { S.draft.plans = cur.concat(fresh); rerender(); toast(t('{n} plans drafted — tap one to edit', { n: fresh.length })); return; }
  busy(true);
  try { for (const [k, p] of fresh.entries()) await db.savePlan(Object.assign({ coach_id: S.me.id, position: cur.length + k }, p)); S.coachPlans = await db.myPlans(S.me.id); rerender(); toast(t('{n} plans drafted — tap one to edit', { n: fresh.length })); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
