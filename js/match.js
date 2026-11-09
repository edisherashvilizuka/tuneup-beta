// Tune Up beta — matching (Launch 1, decided 2026-10-31): Find a coach (ranked by a fit score out of 99, filters),
// the coach's public profile with plan cards, request → coach accepts → free trial → both confirm → choose a plan.
// Nothing is paid before a mutually confirmed trial; the trainee pays the coach directly (payments outside the app).
import { t, esc, LANG, OPTS, opt, isoDate, addDays, weekdayOf, dayName, fmtDay, fmtTime, firstName, unit } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, field, val, busy, empty, avatar } from './ui.js';
import * as db from './db.js';
import { S, isSolo } from './state.js';
import { planCardHtml, componentLines, cheapest, planFormat } from './plans.js';
import { DISTRICTS, HOURS } from './onboard.js';

// ---- the fit score (SPEC: specialty 30, calendar overlap 25, district 15 / adjacent 8, budget 10, gender 5, injury
// experience 5, rating 5 with new coach +3; −20 when the formats cannot meet)
const GOAL_SPEC = { lose: ['fatloss'], gain: ['hypertrophy', 'strength'], tone: ['fatloss', 'mobility', 'women'], health: ['mobility', 'seniors', 'rehab'], sport: ['strength', 'running'] };
const ADJ = { vake: ['saburtalo', 'vera', 'mtatsminda'], saburtalo: ['vake', 'didube', 'vera', 'didi_dighomi'], vera: ['vake', 'saburtalo', 'mtatsminda', 'chugureti'], didube: ['saburtalo', 'nadzaladevi', 'chugureti', 'didi_dighomi'], isani: ['samgori', 'krtsanisi', 'chugureti'], gldani: ['nadzaladevi'], samgori: ['isani'], nadzaladevi: ['didube', 'gldani', 'chugureti'], chugureti: ['vera', 'didube', 'nadzaladevi', 'isani'], mtatsminda: ['vake', 'vera', 'krtsanisi'], krtsanisi: ['mtatsminda', 'isani'], didi_dighomi: ['saburtalo', 'didube'] };
const SLOT = { morning: [7, 8, 9, 10, 11], day: [12, 13, 14, 15, 16], evening: [17, 18, 19, 20, 21] };
const dkey = s => { s = String(s || '').toLowerCase().trim(); return Object.keys(DISTRICTS).find(k => k === s || DISTRICTS[k].toLowerCase() === s) || s; };
export function fitScore(c, tp) {
  tp = tp || {}; const parts = [];
  const want = GOAL_SPEC[tp.goal] || []; const have = c.specialties || [];
  const spec = want.some(s => have.includes(s)) ? 30 : have.length ? 8 : 4; parts.push({ k: 'Specialty', v: spec, m: 30 });
  const av = c.availability || {}; const days = (tp.days || []).map(Number); const slots = (tp.time_of_day || []).length ? tp.time_of_day : ['morning', 'day', 'evening'];
  let cal = 15;
  if (days.length) { let hit = 0, all = 0; days.forEach(d => slots.forEach(sl => { all++; if ((av[d] || []).some(h => SLOT[sl].includes(h))) hit++; })); cal = Math.round(25 * hit / Math.max(1, all)); }
  parts.push({ k: 'Calendar overlap', v: cal, m: 25 });
  const online = tp.format === 'online'; const td = dkey(tp.district), cd = dkey(c.district);
  const dist = online ? 15 : td && cd ? (td === cd ? 15 : (ADJ[td] || []).includes(cd) ? 8 : 0) : 7; parts.push({ k: 'District', v: dist, m: 15 });
  const cheap = cheapest(c.plans, tp.format); const bmax = Number(tp.budget_max) || 0;
  const budget = !bmax || cheap == null ? 7 : cheap <= bmax ? 10 : cheap <= bmax * 1.2 ? 5 : 0; parts.push({ k: 'Budget', v: budget, m: 10 });
  const gender = !tp.coach_gender || tp.coach_gender === 'any' || !c.sex ? 5 : tp.coach_gender === c.sex ? 5 : 0; parts.push({ k: 'Gender', v: gender, m: 5 });
  const inj = !(tp.injuries || '').trim() || /none|no\b|არა/i.test(tp.injuries || '') ? 5 : have.includes('rehab') ? 5 : 2; parts.push({ k: 'Injury experience', v: inj, m: 5 });
  const rating = c.rating_n ? Math.round(Number(c.rating)) : 3; parts.push({ k: 'Rating', v: rating, m: 5, isNew: !c.rating_n });
  let total = parts.reduce((a, p) => a + p.v, 0);
  let penalty = 0; if (online && !c.online) penalty = -20; if (tp.format === 'inperson' && !c.inperson) penalty = -20;
  total = Math.max(0, Math.min(99, total + penalty));
  return { total, parts, penalty, cheap };
}
export async function loadMatch(force) {
  if (!force && S.match && Date.now() - (S.match.at || 0) < 120000) return S.match;
  const [coaches, request] = await Promise.all([db.browseCoaches(), db.myRequest().catch(() => null)]);
  const tp = S.traineeProfile || {};
  const list = (coaches || []).map(c => Object.assign(c, { fit: fitScore(c, tp) })).sort((a, b) => b.fit.total - a.fit.total);
  const prices = list.map(c => c.fit.cheap).filter(x => x != null);
  S.match = { coaches: list, request: request && request.id ? request : null, cheapest: prices.length ? Math.min(...prices) : null, at: Date.now() };
  return S.match;
}
const photo = (c, cls) => c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="" class="avatar ' + (cls || '') + '" style="object-fit:cover">' : avatar(c.name, c.id, cls);
function scoreCls(n) { return n >= 80 ? 'hi' : n >= 60 ? 'mid' : ''; }

// ---- Find a coach
const FILTERS = { online: 'Online', f: 'Woman', m: 'Man', budget: '≤ my budget', district: 'My district', fresh: 'New coaches' };
A.fcFilter = (k) => { const f = S.draft.fcF = S.draft.fcF || {}; f[k] = !f[k]; rerender(); };
A.fcSearch = (v) => { S.draft.fcQ = v; const el = document.getElementById('fclist'); if (el) el.innerHTML = fcList(); };
function fcList() {
  const M = S.match; const tp = S.traineeProfile || {}; const f = S.draft.fcF || {}; const q = (S.draft.fcQ || '').toLowerCase().trim();
  let list = (M.coaches || []).slice();
  if (f.online) list = list.filter(c => c.online); if (f.f) list = list.filter(c => c.sex === 'f'); if (f.m) list = list.filter(c => c.sex === 'm');
  if (f.budget && tp.budget_max) list = list.filter(c => c.fit.cheap != null && c.fit.cheap <= Number(tp.budget_max));
  if (f.district && tp.district) list = list.filter(c => dkey(c.district) === dkey(tp.district));
  if (f.fresh) list = list.filter(c => !c.rating_n);
  if (q) list = list.filter(c => (c.name + ' ' + (c.specialties || []).map(s => opt('specialty', s)).join(' ') + ' ' + c.gym + ' ' + c.district).toLowerCase().includes(q));
  if (!list.length) return '<div class="card flat mute">' + t('No coach matches these filters yet.') + '</div>';
  return '<div class="slist">' + list.map(c => '<div class="srow" style="cursor:pointer" onclick="A.go(\'coachPublic\',{id:\'' + c.id + '\'})"><div class="score ' + scoreCls(c.fit.total) + '">' + c.fit.total + '</div>' + photo(c) + '<div class="grow" style="min-width:0"><div class="row" style="gap:6px;flex-wrap:wrap"><div class="t">' + esc(c.name) + '</div>' + (!c.rating_n ? '<span class="tag info">' + t('New') + '</span>' : '') + '</div><div class="s wrap">' + esc([(c.specialties || []).slice(0, 2).map(s => opt('specialty', s)).join(' · '), c.inperson ? (DISTRICTS[dkey(c.district)] ? t(DISTRICTS[dkey(c.district)]) : c.district) : t('Online only'), c.online && c.inperson ? t('also online') : ''].filter(Boolean).join(' · ')) + '</div>' + (c.fit.cheap != null ? '<div class="s" style="color:var(--a-ink);font-weight:700">' + esc(t('from {n} ₾', { n: c.fit.cheap })) + '</div>' : '') + '</div>' + I.chev + '</div>').join('') + '</div>';
}
SCREENS.findCoach = () => {
  if (S.me.role !== 'trainee') return { title: t('Find a coach'), body: empty('users', t('Coaches find clients here — not the other way round.')) };
  if (S.trial || (S.pair && S.pair.kind === 'coach' && S.pair.status === 'active')) return { title: t('Find a coach'), body: '<div class="card soft"><div class="h3">' + t('You already have a coach') + '</div><div class="s" style="color:var(--a-ink2)">' + t('End the current coaching first (More → Your coach) if you want to look for someone new.') + '</div></div>' };
  if (!S.match) return { title: t('Find a coach'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { await loadMatch(); } catch (e) { toast(t('Could not load — try again'), 'err'); S.match = { coaches: [], at: Date.now() }; } rerender(); } };
  const f = S.draft.fcF || {}; const req = S.match.request;
  return { title: t('Find a coach'), sub: (S.match.coaches || []).length === 1 ? t('1 coach') : t('{n} coaches', { n: (S.match.coaches || []).length }), body:
    (req && req.status === 'pending' ? '<div class="card amber"><div class="h3">' + esc(t('Request sent to {name}', { name: firstName(req.coach) })) + '</div><div class="s" style="color:var(--a-ink2)">' + t('One request at a time — cancel it to ask someone else.') + '</div><span class="link" onclick="A.cancelRequest(\'' + req.id + '\')">' + t('Cancel request') + '</span></div>' : '') +
    '<div class="xsearch">' + I.search + '<input class="input" id="fcq" placeholder="' + esc(t('Search name or specialty')) + '" value="' + esc(S.draft.fcQ || '') + '" oninput="A.fcSearch(this.value)"></div>' +
    '<div class="chips hs">' + Object.keys(FILTERS).map(k => '<button class="chip ' + (f[k] ? 'on' : '') + '" onclick="A.fcFilter(\'' + k + '\')">' + esc(t(FILTERS[k])) + '</button>').join('') + '</div>' +
    '<div class="row between"><div class="eyebrow">' + t('Best fit first') + '</div><span class="link small" onclick="A.fitHelp()">' + t('How is fit scored?') + '</span></div><div id="fclist">' + fcList() + '</div>' };
};
A.fitHelp = () => sheet('<div class="h2">' + t('How is fit scored?') + '</div><div class="s">' + t('Out of 99: what the coach specialises in vs your goal (30), free hours on your days and times (25), district (15, neighbouring 8), the cheapest plan vs your budget (10), coach gender (5), experience with injuries (5), rating (5; a new coach gets 3). −20 when you want online and the coach does not coach online, or the other way round.') + '</div><button class="btn sec" onclick="A.closeSheet()">' + t('Close') + '</button>');

// ---- the coach's public profile
SCREENS.coachPublic = ({ id }) => {
  const c = ((S.match || {}).coaches || []).find(x => x.id === id);
  if (!c) return { title: '', body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { await loadMatch(); } catch (e) {} rerender(); } };
  const tp = S.traineeProfile || {}; const fit = c.fit || fitScore(c, tp);
  const fmtLine = c.inperson && c.online ? t('In person or online') : c.online ? t('Online') : t('In person');
  const role = [t('Coach'), c.years ? t('{n} years', { n: c.years }) : '', [c.gym, DISTRICTS[dkey(c.district)] ? t(DISTRICTS[dkey(c.district)]) : c.district].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const fitRows = fit.parts.map(p => '<div class="row" style="font-size:13px;font-weight:700"><span style="min-width:132px">' + esc(t(p.k)) + '</span><div class="bar grow"><i class="grn" style="width:' + Math.round(p.v / p.m * 100) + '%"></i></div><b style="min-width:52px;text-align:right">' + (p.isNew ? esc(t('new +3')) : p.v + ' / ' + p.m) + '</b></div>').join('') + (fit.penalty ? '<div class="s" style="color:var(--a-red)">' + esc(t('{n} — the formats do not meet (online vs in person)', { n: fit.penalty })) + '</div>' : '');
  const av = c.availability || {}; const freeDays = [1, 2, 3, 4, 5, 6, 7].filter(d => (av[d] || []).length);
  const free = freeDays.length ? '<div class="col" style="gap:4px">' + freeDays.map(d => '<div class="row between"><span class="t" style="font-weight:600">' + esc(dayName(d)) + '</span><span class="s">' + esc(hoursLine(av[d])) + '</span></div>').join('') + '</div>' : '<div class="s">' + t('Not set yet') + '</div>';
  const reviews = (c.reviews || []).length ? '<div class="card"><div class="row between"><div class="h3">' + t('Reviews') + '</div><span class="stars">' + '★'.repeat(Math.round(Number(c.rating) || 0)) + '</span><span class="s">' + esc(Number(c.rating).toFixed(1) + ' · ' + c.rating_n) + '</span></div>' + c.reviews.filter(r => r.text).slice(0, 3).map(r => '<div class="lrow"><div class="grow"><div class="t" style="font-weight:600">“' + esc(r.text) + '”</div><div class="s">' + '★'.repeat(r.stars) + ' · ' + fmtDay(String(r.at).slice(0, 10), 'dm') + '</div></div></div>').join('') + '</div>' : '<div class="card flat mute small">' + t('No reviews yet — new on Tune Up.') + '</div>';
  const plans = (c.plans || []).length ? c.plans.map(p => planCardHtml(p)).join('') : '<div class="card flat mute">' + t('No plans published yet.') + '</div>';
  const canAsk = !S.trial && !(S.pair && S.pair.kind === 'coach' && S.pair.status === 'active'); const req = S.match && S.match.request; const pendingHere = req && req.status === 'pending';
  return { title: '', actions: '<div class="score ' + scoreCls(fit.total) + '">' + fit.total + '</div>', body:
    '<div class="row" style="gap:14px;margin-top:-6px">' + photo(c, 'xl') + '<div class="grow" style="min-width:0"><div class="h1 sm">' + esc(c.name) + '</div><div class="s">' + esc(role) + '</div></div></div>' +
    '<div class="chips">' + (c.specialties || []).map(s => '<span class="chip sm">' + esc(opt('specialty', s)) + '</span>').join('') + '<span class="chip sm soft">' + esc(fmtLine) + '</span></div>' +
    (c.pitch ? '<div class="card"><div class="lead" style="font-style:italic">“' + esc(c.pitch) + '”</div></div>' : '') +
    '<div class="card green"><div class="h3">' + esc(t('Why {n}', { n: fit.total })) + '</div><div class="col" style="gap:7px">' + fitRows + '</div></div>' +
    '<div class="section-title"><div class="h3">' + t('Plans') + '</div></div><div class="s" style="margin-top:-8px">' + t('You pay the coach directly. Nothing before a free trial.') + '</div>' + plans +
    '<div class="card"><div class="h3">' + t('Free hours') + '</div>' + free + '</div>' + reviews +
    (canAsk ? (pendingHere && req.coach_id === c.id ? '<div class="card amber"><div class="h3">' + t('Request sent') + '</div><div class="s">' + t('He usually answers within a day.') + '</div><span class="link" onclick="A.cancelRequest(\'' + req.id + '\')">' + t('Cancel request') + '</span></div>'
      : pendingHere ? '<div class="s">' + esc(t('You have an open request with {name} — cancel it to ask someone else.', { name: firstName(req.coach) })) + '</div>' : '<button class="btn" onclick="A.requestSheet(\'' + c.id + '\')">' + t('Send request') + '</button>') : '') };
};
function hoursLine(hs) { hs = (hs || []).slice().sort((a, b) => a - b); const r = []; let s = null, p = null; hs.forEach(h => { if (s == null) { s = p = h; } else if (h === p + 1) p = h; else { r.push(s + ':00–' + (p + 1) + ':00'); s = p = h; } }); if (s != null) r.push(s + ':00–' + (p + 1) + ':00'); return r.join(', '); }
A.requestSheet = (id) => {
  const c = S.match.coaches.find(x => x.id === id); const tp = S.traineeProfile || {};
  const both = c.inperson && c.online; S.draft.reqFmt = both ? (tp.format === 'online' ? 'online' : tp.format === 'either' ? 'either' : 'inperson') : (c.online ? 'online' : 'inperson');
  sheet('<div class="h2">' + esc(t('Ask {name}', { name: firstName(c.name) })) + '</div><div class="s">' + t('He sees your answers (goal, days, injuries) and your note. If he accepts, the chat opens and you book a free trial session.') + '</div>' +
    (both ? '<div class="field"><label>' + t('How you want to train') + '</label><div class="chips">' + ['inperson', 'online', 'either'].map(k => '<button class="chip ' + (S.draft.reqFmt === k ? 'on' : '') + '" onclick="A.reqFmt(\'' + k + '\')">' + esc(opt('format', k)) + '</button>').join('') + '</div></div>' : '') +
    field(t('A short note (optional)'), 'req_note', '', { textarea: true, ph: t('e.g. Hi! I want to lose about 8 kg before summer. Evenings work best.') }) +
    '<button class="btn" onclick="A.sendRequest(\'' + id + '\')">' + t('Send request') + '</button>');
};
A.reqFmt = (k) => { S.draft.reqFmt = k; document.querySelectorAll('.sheet .chip').forEach(el => el.classList.toggle('on', el.textContent === opt('format', k))); };
A.sendRequest = async (id) => {
  busy(true);
  try { await db.sendRequest(id, val('req_note'), S.draft.reqFmt || 'inperson'); closeSheet(); await loadMatch(true); toast(t('Request sent')); root('home'); }
  catch (e) { busy(false); const m = (e && e.message) || ''; toast(/open request/.test(m) ? t('You already have an open request.') : /already paired/.test(m) ? t('You already have a coach.') : t('Could not send — try again'), 'err'); }
};
A.cancelRequest = async (id) => { try { await db.cancelRequest(id); await loadMatch(true); toast(t('Request cancelled')); rerender(); } catch (e) { toast(t('Could not cancel — try again'), 'err'); } };

// ---- request / trial states on Today (one card at a time)
export function requestCard() {
  if (S.me.role !== 'trainee') return '';
  const tr = S.trial; const req = S.match && S.match.request;
  if (tr) {
    const c = tr.coach || {}; const ses = tr.trialSession;
    if (!ses) return '<div class="card green"><div class="h3">' + esc(t('{name} accepted!', { name: firstName(c.name) })) + '</div><div class="s" style="color:var(--a-ink2)">' + t('Book your free trial — in the gym or by video call. The chat is open.') + '</div><div class="btn-row"><button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.go(\'bookTrial\')">' + t('Book the free trial') + '</button><button class="btn sec" onclick="A.setTab(\'chat\')">' + t('Say hi') + '</button></div></div>';
    const at = new Date(ses.starts_at); const over = at.getTime() + 60 * 60000 < Date.now();
    if (over && tr.trial_trainee_ok == null) return '<div class="card green"><div class="h3">' + esc(t('How was the trial with {name}?', { name: firstName(c.name) })) + '</div><div class="s" style="color:var(--a-ink2)">' + esc(fmtDay(isoDate(at), 'dm') + ' · ' + fmtTime(at) + ' · ' + (ses.where_kind === 'video' ? t('Video call') : ses.place || t('In person'))) + '</div><button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.afterTrialSheet()">' + t('Tell us') + '</button></div>';
    if (over && tr.trial_trainee_ok && !tr.trial_coach_ok) return '<div class="card amber"><div class="h3">' + esc(t('Waiting for {name}', { name: firstName(c.name) })) + '</div><div class="s" style="color:var(--a-ink2)">' + t('He confirms on his side, then you choose a plan.') + '</div></div>';
    if (over && tr.trial_trainee_ok && tr.trial_coach_ok) return '<div class="card green"><div class="h3">' + t('You both said yes!') + '</div><div class="s" style="color:var(--a-ink2)">' + esc(t('Choose one of {name}\'s plans to start.', { name: firstName(c.name) })) + '</div><button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.go(\'choosePlan\')">' + t('Choose your plan') + '</button></div>';
    return '<div class="card soft"><div class="eyebrow">' + t('Free trial session') + '</div><div class="h3">' + esc(fmtDay(isoDate(at)) + ' · ' + fmtTime(at)) + '</div><div class="s" style="color:var(--a-ink2)">' + esc((ses.where_kind === 'video' ? t('Video call') : ses.place || t('In person')) + ' · ' + t('with {name}', { name: firstName(c.name) })) + '</div><div class="btn-row"><button class="btn sec" onclick="A.setTab(\'sessions\')">' + t('Details') + '</button><button class="btn sec" onclick="A.setTab(\'chat\')">' + t('Chat') + '</button></div></div>';
  }
  if (req && req.status === 'pending') return '<div class="card amber"><div class="h3">' + esc(t('Request sent to {name}', { name: firstName(req.coach) })) + '</div><div class="s" style="color:var(--a-ink2)">' + t('He usually answers within a day. Meanwhile your program keeps going.') + '</div><span class="link" onclick="A.cancelRequest(\'' + req.id + '\')">' + t('Cancel request') + '</span></div>';
  if (req && req.status === 'declined' && req.answered_at && Date.now() - new Date(req.answered_at).getTime() < 7 * 86400000 && !(S.draft.hideDecl || {})[req.id]) return '<div class="card"><div class="h3">' + esc(t('{name} can\'t take new clients right now', { name: firstName(req.coach) })) + '</div><div class="s">' + t('No reason needed. Your next best matches are ready.') + '</div><div class="btn-row"><button class="btn sec" onclick="A.go(\'findCoach\')">' + t('See matches') + '</button><button class="btn sec" onclick="A.hideDecl(\'' + req.id + '\')">' + t('Dismiss') + '</button></div></div>';
  return '';
}
A.hideDecl = (id) => { S.draft.hideDecl = S.draft.hideDecl || {}; S.draft.hideDecl[id] = true; rerender(); };

// ---- booking the free trial
SCREENS.bookTrial = () => {
  const tr = S.trial; if (!tr) return { title: t('Free trial session'), body: empty('cal', t('No trial to book right now.')) };
  const c = tr.coach || {}; const cp = c.coach_profiles && (Array.isArray(c.coach_profiles) ? c.coach_profiles[0] : c.coach_profiles) || {};
  const both = cp.inperson && cp.online; const d = S.draft.bt = S.draft.bt || { where: tr.format === 'online' || !cp.inperson ? 'video' : 'gym', date: null, hour: null };
  const today = isoDate(); const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
  const av = cp.availability || {}; const free = dates.filter(x => (av[weekdayOf(new Date(x + 'T00:00:00'))] || []).length);
  if (!d.date) d.date = free[0] || dates[0];
  const hours = (av[weekdayOf(new Date(d.date + 'T00:00:00'))] || []).slice().sort((a, b) => a - b);
  return { title: t('Free trial session'), sub: c.name, body:
    (both ? '<div class="segc"><button class="' + (d.where === 'gym' ? 'on' : '') + '" onclick="A.btWhere(\'gym\')">' + esc(cp.gym || t('Gym')) + '</button><button class="' + (d.where === 'video' ? 'on' : '') + '" onclick="A.btWhere(\'video\')">' + t('Video call') + '</button></div>' : '<div class="s">' + esc(d.where === 'video' ? t('Video call') : cp.gym || t('In person')) + '</div>') +
    '<div class="s">' + esc(t('Pick a time in {name}\'s free hours', { name: firstName(c.name) })) + '</div>' +
    '<div class="row" style="gap:6px;overflow-x:auto;margin:0 -20px;padding:2px 20px;scrollbar-width:none">' + dates.map(x => { const has = free.includes(x); return '<button class="gig ' + (x === d.date ? 'on' : '') + (has ? '' : ' off') + '" onclick="A.btDate(\'' + x + '\')"><b>' + Number(x.slice(8)) + '</b><span>' + esc(dayName(weekdayOf(new Date(x + 'T00:00:00')), true)) + '</span></button>'; }).join('') + '</div>' +
    (hours.length ? '<div class="grid3">' + hours.map(h => '<button class="slot ' + (d.hour === h ? 'on' : '') + '" onclick="A.btHour(' + h + ')">' + h + ':00</button>').join('') + '</div>' : '<div class="card flat mute">' + t('No free hours this day — pick another.') + '</div>') +
    (d.hour != null ? '<div class="card soft"><div class="s" style="color:var(--a-ink2)">' + esc(fmtDay(d.date) + ' · ' + d.hour + ':00 · ' + (d.where === 'video' ? t('Video call') : cp.gym || t('In person')) + ' · ' + t('free')) + '</div></div>' : '') +
    '<button class="btn" onclick="A.btBook()"' + (d.hour == null ? ' disabled' : '') + '>' + t('Book') + '</button>' };
};
A.btWhere = (w) => { S.draft.bt.where = w; rerender(); }; A.btDate = (x) => { S.draft.bt.date = x; S.draft.bt.hour = null; rerender(); }; A.btHour = (h) => { S.draft.bt.hour = h; rerender(); };
A.btBook = async () => {
  const d = S.draft.bt; if (!d || d.hour == null) return; busy(true);
  const at = new Date(d.date + 'T' + String(d.hour).padStart(2, '0') + ':00:00');
  try { await db.bookTrial(S.trial.id, at.toISOString(), d.where); S.draft.bt = null; const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Trial booked — see you there')); root('home'); }
  catch (e) { busy(false); const m = (e && e.message) || ''; toast(/taken/.test(m) ? t('That hour was just taken — pick another.') : /not free/.test(m) ? t('Not in the coach\'s free hours.') : /trial booked/.test(m) ? t('The trial is already booked.') : t('Could not book — try again'), 'err'); }
};
// ---- after the trial
A.afterTrialSheet = () => {
  const tr = S.trial; const c = tr.coach || {}; S.draft.stars = S.draft.stars || 5;
  sheet('<div class="h2">' + t('How was the trial?') + '</div><div class="s">' + esc(t('with {name}', { name: firstName(c.name) })) + '</div>' +
    '<div class="row" style="justify-content:center;gap:6px;font-size:32px;color:var(--a-amber)" id="stars">' + [1, 2, 3, 4, 5].map(n => '<button type="button" onclick="A.setStars(' + n + ')" aria-label="' + n + '" style="font-size:32px;color:' + (n <= S.draft.stars ? 'var(--a-amber)' : 'var(--a-line)') + '">★</button>').join('') + '</div>' +
    field(t('A line for {name} (optional)', { name: firstName(c.name) }), 'tr_text', '', { textarea: true, ph: t('e.g. Explained everything, watched my knee. Felt safe.') }) +
    '<button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.trialAnswer(true)">' + esc(t('Continue with {name}', { name: firstName(c.name) })) + '</button><button class="btn sec" onclick="A.trialAnswer(false)">' + t('Not for me') + '</button>' +
    '<div class="s" style="text-align:center">' + esc(t('{name} also confirms on his side. Then you choose a plan.', { name: firstName(c.name) })) + '</div>');
};
A.setStars = (n) => { S.draft.stars = n; const el = document.getElementById('stars'); if (el) [...el.children].forEach((b, i) => { b.style.color = i < n ? 'var(--a-amber)' : 'var(--a-line)'; }); };
A.trialAnswer = async (ok) => {
  busy(true);
  try { const r = await db.trialAnswer(S.trial.id, ok, S.draft.stars, val('tr_text')); closeSheet(); const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); if (r === 'both') { toast(t('You both said yes!')); go('choosePlan'); } else if (r === 'ended') { toast(t('Thanks — back to your program')); root('home'); } else { toast(t('Saved — waiting for the coach')); rerender(); } }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
// ---- choose a plan (after both said yes; also "change plan" later)
SCREENS.choosePlan = () => {
  const pr = S.trial || (S.pair && S.pair.kind === 'coach' && S.pair.status === 'active' ? S.pair : null); if (!pr) return { title: t('Choose your plan'), body: empty('plan', t('Nothing to choose right now.')) };
  const c = pr.coach || {}; const plans = S.draft.coachPlans;
  if (!plans) return { title: t('Choose your plan'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { await loadMatch(); const cc = (S.match.coaches || []).find(x => x.id === c.id); S.draft.coachPlans = (cc && cc.plans) || []; } catch (e) { S.draft.coachPlans = []; } rerender(); } };
  return { title: t('Choose your plan'), sub: c.name, body: '<div class="s">' + esc(t('You pay {name} directly — he\'ll tell you how. Cancel any month.', { name: firstName(c.name) })) + '</div>' +
    (plans.length ? plans.map(p => planCardHtml(p, { chosen: pr.plan_id === p.id, choose: 'A.choosePlan(\'' + p.id + '\')' })).join('') : '<div class="card flat mute">' + t('The coach has no plans yet — ask in the chat.') + '</div>'),
    after: () => {} };
};
A.choosePlan = async (planId) => {
  const pr = S.trial || S.pair; busy(true);
  try { await db.choosePlan(pr.id, planId); S.draft.coachPlans = null; const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Welcome aboard!')); root('home'); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
// the trainee's own "end coaching" (SPEC: ethical ending — polite notice, back to a program)
A.endCoachingAsk = () => { const c = (S.pair && S.pair.coach) || {}; sheet('<div class="h2">' + esc(t('End coaching with {name}?', { name: firstName(c.name) })) + '</div><p class="lead">' + t('Your coach sees that it ended, with your note. Your data stays with you and your program continues with Tune.') + '</p>' + field(t('Short note (optional)'), 'endnote', '', { textarea: true, ph: t('e.g. Thank you — moving abroad') }) + '<button class="btn danger" onclick="A.endCoaching()">' + t('End coaching') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>'); };
A.endCoaching = async () => { try { await db.endPair(S.pair.id, val('endnote')); closeSheet(); const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); toast(t('Coaching ended')); root('home'); } catch (e) { toast(t('Could not end — try again'), 'err'); } };
