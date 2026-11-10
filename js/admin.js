// Tune Up beta — admin screens (week 1: coach invites, users, pairs).
import { rollNum } from './motion.js';
import { t, esc, fmtDate, firstName, fmtTime, isoDate, dayName, LANG } from './i18n.js';
import { SCREENS, A, I, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { attHtml, resolveUrls, urlOf } from './attach.js';
import { componentLines } from './plans.js';
import { DISTRICTS } from './onboard.js';
import { expandWeek, progTitle, progSummary } from './solo.js';

export const ADMIN_TABS = [{ id: 'aover', label: 'Overview', ico: 'home' }, { id: 'acoaches', label: 'Coaches', ico: 'shield', badge: () => ((S.admin && S.admin.coaches) || []).filter(c => c.review_status === 'pending').length || 0 }, { id: 'aprograms', label: 'Programs', ico: 'plan', badge: () => ((S.admin && S.admin.programs) || []).filter(p => p.status === 'submitted' || p.status === 'draft').length || 0 }, { id: 'ausers', label: 'Users', ico: 'users' }];

export async function loadAdmin() {
  const [users, pairs, invites, feedback, logsToday, coaches, funnel, programs, rules] = await Promise.all([db.adminUsers(), db.adminPairsFull(), db.coachInvites(), db.adminFeedback().catch(() => []), db.adminLogsToday(isoDate()).catch(() => 0), db.adminCoaches().catch(() => []), db.adminFunnel(30).catch(() => ({})), db.programs(true).catch(() => []), db.rules().catch(() => [])]);
  S.admin = { users, pairs, invites, feedback, logsToday, coaches, funnel, programs, rules: {} }; (rules || []).forEach(r => { S.admin.rules[r.key] = r; });
  resolveUrls(feedback || []).then(ok => { if (ok) rerender(); }).catch(() => {});
  resolveUrls((coaches || []).map(c => ({ attachments: c.docs || [] }))).then(ok => { if (ok) rerender(); }).catch(() => {});
  if (!S.exercises) db.listExercises().then(x => { S.exercises = x; }).catch(() => {});
}
const ROLE = { trainee: 'Trainee', coach: 'Coach', admin: 'Admin' };

SCREENS.aover = () => {
  const a = S.admin || { users: [], pairs: [], invites: [] };
  const coaches = a.users.filter(u => u.role === 'coach').length, trainees = a.users.filter(u => u.role === 'trainee').length, pending = a.users.filter(u => !u.role).length;
  const active = a.pairs.filter(p => p.status === 'active').length;
  const COLS = ['--c-kcal', '--c-water', '--c-carbs', '--c-tune', '--c-protein', '--c-fat']; let ci = 0;
  const stat = (v, k) => '<div class="kpi"><span class="eyebrow" style="color:var(' + COLS[(ci++) % COLS.length] + ')">' + esc(k) + '</span><span class="num">' + rollNum(v, 'i', null, true) + '</span></div>';
  const F = a.funnel || {}; const fmax = Math.max(1, F.signups || 0, F.solo || 0, F.requests || 0, F.trials || 0, F.active || 0);
  const fr = (k, v, c) => '<div class="row" style="gap:10px;font-weight:700;font-size:14px"><span style="min-width:110px">' + esc(t(k)) + '</span><div class="bar grow" style="height:22px;border-radius:11px"><i style="width:' + Math.round((v || 0) / fmax * 100) + '%;background:' + c + ';border-radius:11px"></i></div><b style="min-width:28px;text-align:right">' + (v || 0) + '</b></div>';
  const funnel = '<div class="card"><div class="h3">' + t('Funnel · last 30 days') + '</div><div class="col" style="gap:6px">' + fr('Sign-ups', F.signups, 'var(--a-line)') + fr('Solo', F.solo, 'var(--c-tune)') + fr('Requests', F.requests, 'var(--a-amber)') + fr('Trials', F.trials, 'var(--c-kcal)') + fr('Chose a plan', F.active, 'var(--a-green)') + '</div></div>';
  return { title: t('Overview'), sub: 'Tune Up', body:
    '<div class="kpis">' + stat(F.coaches_live || 0, t('Coaches live')) + stat(F.coaches_waiting || 0, t('Waiting review')) + stat(F.solo_week || 0, t('Solo this week')) + stat(F.programs_live || 0, t('Programs live')) + stat(active, t('Active pairs')) + stat(a.logsToday || 0, t('Logs today')) + '</div>' + funnel +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.go(\'afeedback\')"><div class="grow"><div class="t">' + t('Feedback') + '</div><div class="s">' + ((a.feedback || [])[0] ? esc(a.feedback[0].text).slice(0, 60) : t('Nothing yet')) + '</div></div>' + I.chev + '</div></div>' +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.go(\'apairs\')"><div class="grow"><div class="t">' + t('Pairs & plans') + '</div><div class="s">' + esc(t('{n} active plans · for the monthly settlement', { n: a.pairs.filter(p => p.status === 'active' && p.plan_id).length })) + '</div></div>' + I.chev + '</div></div>' +
    '<div class="card">' + (S.me.role === 'coach' ? '<div class="lrow" style="cursor:pointer" onclick="A.switchCoach()"><div class="grow"><div class="t">' + t('Back to coaching') + '</div><div class="s">' + t('Your clients, calendar and chat') + '</div></div>' + I.chev + '</div>' : '') + '<div class="lrow"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div><div class="lrow" style="cursor:pointer" onclick="A.reloadAdmin()"><div class="grow"><div class="t">' + t('Refresh') + '</div></div></div><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div></div>' };
};
A.reloadAdmin = async () => { try { await loadAdmin(); rerender(); toast(t('Updated')); } catch (e) { toast(t('Could not refresh'), 'err'); } };

const RS = { pending: 'Waiting', more: 'Asked for more', approved: 'Approved', rejected: 'Not approved' };
A.acTab = (k) => { S.draft.acTab = k; rerender(); };
SCREENS.acoaches = () => {
  const a = S.admin || { users: [], invites: [], coaches: [] };
  const open = a.invites.filter(i => !i.used_by && new Date(i.expires_at) > new Date()), used = a.invites.filter(i => i.used_by);
  const all = a.coaches || []; const waiting = all.filter(c => c.review_status === 'pending' || c.review_status === 'more'), approved = all.filter(c => c.review_status === 'approved'), rejected = all.filter(c => c.review_status === 'rejected');
  const tab = S.draft.acTab || (waiting.length ? 'waiting' : 'approved'); const list = tab === 'waiting' ? waiting : tab === 'approved' ? approved : rejected;
  const row = c => { const ready = (c.plans || []).some(p => p.status === 'active') && (c.docs || []).some(d => d.kind === 'id');
    const sub = [c.inperson ? (DISTRICTS[c.district] ? t(DISTRICTS[c.district]) : c.district) : t('Online only'), t('{n} plans', { n: (c.plans || []).length }), (c.docs || []).length ? t('{n} documents', { n: c.docs.length }) : t('no documents'), fmtDate(c.created_at, 'dm')].filter(Boolean).join(' · ');
    const tag = c.review_status === 'approved' ? '<span class="tag ok">' + t('Live') + '</span>' : c.review_status === 'rejected' ? '<span class="tag bad">' + t(RS.rejected) + '</span>' : c.review_status === 'more' ? '<span class="tag">' + t('Waiting on coach') + '</span>' : ready ? '<span class="tag ok">' + t('Ready') + '</span>' : '<span class="tag warn">' + t('Incomplete') + '</span>';
    return '<div class="srow" style="cursor:pointer" onclick="A.go(\'acoach\',{id:\'' + c.id + '\'})">' + (c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="" class="avatar" style="object-fit:cover">' : avatar(c.name || c.email, c.id)) + '<div class="grow" style="min-width:0"><div class="t">' + esc(c.name || c.email) + (c.deactivated_at ? ' <span class="tag bad">' + t('paused') + '</span>' : '') + '</div><div class="s wrap">' + esc(sub) + '</div></div>' + tag + I.chev + '</div>'; };
  return { title: t('Coaches'), actions: '<button class="act" onclick="A.newCoachInvite()" aria-label="New">' + I.plus + '</button>', body:
    '<div class="segc" role="tablist"><button class="' + (tab === 'waiting' ? 'on' : '') + '" onclick="A.acTab(\'waiting\')">' + t('Waiting') + ' · ' + waiting.length + '</button><button class="' + (tab === 'approved' ? 'on' : '') + '" onclick="A.acTab(\'approved\')">' + t('Approved') + ' · ' + approved.length + '</button>' + (rejected.length ? '<button class="' + (tab === 'rejected' ? 'on' : '') + '" onclick="A.acTab(\'rejected\')">' + t('No') + ' · ' + rejected.length + '</button>' : '') + '</div>' +
    (list.length ? '<div class="slist">' + list.map(row).join('') + '</div>' : '<div class="card flat mute">' + t('Nobody here right now.') + '</div>') +
    '<div class="section-title"><span class="eyebrow">' + t('Coach invites') + '</span></div>' +
    (open.length ? '<div class="card">' + open.map(i => '<div class="lrow" style="cursor:pointer" onclick="A.showCoachInvite(\'' + i.code + '\')"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + esc(i.code) + ' · ' + t('Valid until {date}', { date: fmtDate(i.expires_at, 'dm') }) + '</div></div>' + I.chev + '</div>').join('') + '</div>' : '<div class="card flat mute">' + t('No open invites.') + '</div>') +
    (used.length ? '<div class="card" style="opacity:.75">' + used.map(i => '<div class="lrow"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + t('Used {date}', { date: fmtDate(i.used_at, 'dm') }) + '</div></div></div>').join('') + '</div>' : '') };
};
// one coach: profile, plans, documents, free hours → approve / ask for more / reject
SCREENS.acoach = ({ id }) => {
  const c = ((S.admin || {}).coaches || []).find(x => x.id === id); if (!c) return { title: '', body: empty('users', t('Not found')) };
  const b = (k, v) => '<div class="card"><div class="eyebrow">' + esc(k) + '</div><div class="t" style="font-weight:600;white-space:pre-wrap">' + v + '</div></div>';
  const av = c.availability || {}; const free = [1, 2, 3, 4, 5, 6, 7].filter(d => (av[d] || []).length).map(d => dayName(d, true) + ' ' + Math.min(...av[d]) + '–' + (Math.max(...av[d]) + 1)).join(' · ');
  const docs = (c.docs || []).length ? c.docs.map(d => '<div class="cert"><div class="ic">' + (d.type === 'application/pdf' ? I.file : I.camera) + '</div><div class="grow"><div class="t">' + esc(t(d.kind === 'id' ? 'ID' : d.kind === 'cert' ? 'Certificate' : 'Document')) + '</div><div class="s">' + esc(d.name || '') + '</div></div>' + (urlOf(d.path) ? '<a class="btn xs sec" href="' + esc(urlOf(d.path)) + '" target="_blank" rel="noopener">' + t('Open') + '</a>' : '') + '</div>').join('') : '<div class="s">' + t('No documents uploaded.') + '</div>';
  return { title: esc(c.name || c.email), sub: t(RS[c.review_status] || 'Waiting') + (c.reviewed_at ? ' · ' + fmtDate(c.reviewed_at, 'dm') : ''), actions: c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="" class="avatar" style="object-fit:cover">' : avatar(c.name || c.email, c.id), body:
    b(t('Profile'), esc([c.inperson && c.online ? t('In person or online') : c.online ? t('Online only') : t('In person'), (c.specialties || []).map(x => t({ strength: 'Strength', fatloss: 'Fat loss', hypertrophy: 'Muscle', mobility: 'Mobility', running: 'Running', rehab: 'After injury', women: 'Women’s fitness', seniors: '50+' }[x] || x)).join(', '), c.years ? t('{n} years', { n: c.years }) : '', [c.gym, DISTRICTS[c.district] ? t(DISTRICTS[c.district]) : c.district].filter(Boolean).join(', '), c.email].filter(Boolean).join(' · ')) + (c.pitch ? '\n“' + esc(c.pitch) + '”' : '') + (c.links ? '\n' + esc(c.links) : '')) +
    b(t('Plans'), (c.plans || []).length ? c.plans.map(p => esc(p.name + ' · ' + p.price_gel + ' ₾' + (p.status === 'paused' ? ' (' + t('Paused') + ')' : '')) + '<div class="s">' + esc(componentLines(p.components).join(' · ')) + '</div>').join('<div style="height:6px"></div>') : '<span style="color:var(--a-red)">' + t('No plans yet — approval needs at least one.') + '</span>') +
    '<div class="card"><div class="eyebrow">' + t('Documents') + '</div>' + docs + '</div>' +
    b(t('Free hours'), esc(free || t('Not set yet'))) +
    (c.review_note ? b(t('Your note to the coach'), esc(c.review_note)) : '') +
    (c.review_status !== 'approved' ? '<button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.reviewCoach(\'' + c.id + '\',\'approved\')">' + t('Approve') + '</button>' : '') +
    '<div class="btn-row">' + (c.review_status !== 'more' ? '<button class="btn sec" onclick="A.reviewNote(\'' + c.id + '\',\'more\')">' + t('Ask for more') + '</button>' : '') + (c.review_status !== 'rejected' ? '<button class="btn danger" onclick="A.reviewNote(\'' + c.id + '\',\'rejected\')">' + t('Reject') + '</button>' : '<button class="btn sec" onclick="A.reviewCoach(\'' + c.id + '\',\'pending\')">' + t('Back to waiting') + '</button>') + '</div>' +
    (c.review_status === 'approved' ? '<button class="btn sec" onclick="A.reviewNote(\'' + c.id + '\',\'rejected\')">' + t('Remove from matching') + '</button>' : '') +
    '<div class="card flat mute small">' + t('Approving shows the coach in Find a coach and sends them a notification. "Ask for more" sends your note; the coach sees it on Today.') + '</div>' };
};
A.reviewNote = (id, status) => sheet('<div class="h2">' + t(status === 'more' ? 'What is missing?' : 'Why not?') + '</div>' + field(t('Note to the coach'), 'rv_note', '', { textarea: true, ph: t(status === 'more' ? 'e.g. The certificate photo is unreadable — upload it again.' : 'e.g. We cannot verify the certificate.') }) + '<button class="btn ' + (status === 'rejected' ? 'danger' : '') + '" onclick="A.reviewCoach(\'' + id + '\',\'' + status + '\',val(\'rv_note\'))">' + t(status === 'more' ? 'Send' : 'Reject') + '</button>');
A.reviewCoach = async (id, status, note) => {
  busy(true);
  try { await db.adminReviewCoach(id, status, note || (typeof val === 'function' ? val('rv_note') : '')); closeSheet(); await loadAdmin(); toast(status === 'approved' ? t('Approved — live in Find a coach') : status === 'more' ? t('Note sent') : status === 'rejected' ? t('Not approved') : t('Saved')); rerender(); }
  catch (e) { busy(false); toast(/no plan/.test((e && e.message) || '') ? t('The coach needs at least one plan first.') : t('Could not save — try again'), 'err'); }
};
window.val = val;

// ---- programs: Tune's drafts and coach submissions → confirm / publish; the nutrition rules the partner confirms once
A.apTab = (k) => { S.draft.apTab = k; rerender(); };
const PS = { draft: 'Drafts', submitted: 'Submitted', published: 'Published', unpublished: 'Unpublished' };
SCREENS.aprograms = () => {
  const all = (S.admin && S.admin.programs) || []; const by = k => all.filter(p => p.status === k);
  const tab = S.draft.apTab || (by('submitted').length ? 'submitted' : by('draft').length ? 'draft' : 'published'); const list = by(tab);
  const who = p => p.author_id ? t('Contributed by {name}', { name: ((S.admin.users || []).find(u => u.id === p.author_id) || {}).name || t('a coach') }) : t('Drafted by Tune');
  const row = p => '<div class="srow" style="cursor:pointer" onclick="A.go(\'aprogram\',{id:\'' + p.id + '\'})"><div class="grow" style="min-width:0"><div class="t wrap">' + esc(progTitle(p)) + '</div><div class="s wrap">' + esc(t('{w} weeks · {d} days a week', { w: p.weeks, d: p.days_per_week }) + ' · ' + who(p) + (p.status === 'published' ? ' · ' + t('{n} people on it', { n: p.uses || 0 }) : '')) + '</div></div>' + (tab === 'draft' || tab === 'submitted' ? '<button class="btn xs" onclick="event.stopPropagation();A.programStatus(\'' + p.id + '\',\'published\')">' + t('Confirm') + '</button>' : '') + I.chev + '</div>';
  const nut = S.admin.rules.nutrition; const sw = S.admin.rules.swaps;
  const rule = (r, label, sub) => '<div class="lrow" style="cursor:pointer" onclick="A.go(\'arule\',{key:\'' + r.key + '\'})"><div class="grow"><div class="t">' + esc(label) + '</div><div class="s">' + esc(r.confirmed_at ? t('Confirmed {date}', { date: fmtDate(r.confirmed_at, 'dm') }) : t('Not confirmed yet')) + ' · ' + esc(sub) + '</div></div>' + (r.confirmed_at ? '<span class="tag ok">' + I.check + '</span>' : '<span class="tag warn">!</span>') + I.chev + '</div>';
  return { title: t('Programs'), sub: t('Tune Up Solo content'), body:
    '<div class="segc" role="tablist">' + ['draft', 'submitted', 'published'].map(k => '<button class="' + (tab === k ? 'on' : '') + '" onclick="A.apTab(\'' + k + '\')">' + esc(t(PS[k])) + ' · ' + by(k).length + '</button>').join('') + '</div>' +
    (list.length ? '<div class="slist">' + list.map(row).join('') + '</div>' : '<div class="card flat mute">' + t('Nothing here.') + '</div>') +
    (by('unpublished').length ? '<div class="section-title"><span class="eyebrow">' + t(PS.unpublished) + '</span></div><div class="slist">' + by('unpublished').map(row).join('') + '</div>' : '') +
    '<div class="section-title"><span class="eyebrow">' + t('Rules') + '</span></div><div class="card" style="gap:0;padding:4px 16px">' + (nut ? rule(nut, t('Nutrition targets'), t('calories, protein, water, steps for Solo')) : '') + (sw ? rule(sw, t('Injury swaps'), t('which exercises are replaced for knee, back, shoulder, wrist, ankle')) : '') + '</div>' +
    '<div class="card flat mute small">' + t('Nothing reaches users before Confirm. Published programs carry the name of who confirmed them.') + '</div>' };
};
SCREENS.aprogram = ({ id }) => {
  const p = ((S.admin || {}).programs || []).find(x => x.id === id); if (!p) return { title: '', body: empty('plan', t('Not found')) };
  const w = S.draft.apWeek && S.draft.apWeek[id] || 1; const days = expandWeek(p, w); const exName = n => { const x = (S.exercises || []).find(e => e.name === n && !e.owner_id); return x && LANG.cur === 'ka' && x.name_ka ? x.name_ka : n; };
  const who = p.author_id ? t('Contributed by {name}', { name: ((S.admin.users || []).find(u => u.id === p.author_id) || {}).name || t('a coach') }) : t('Drafted by Tune');
  return { title: progTitle(p), sub: t(PS[p.status] || p.status) + (p.confirmed_at ? ' · ' + t('confirmed {date}', { date: fmtDate(p.confirmed_at, 'dm') }) : ''), body:
    '<div class="s">' + esc(t('{w} weeks · {d} days a week', { w: p.weeks, d: p.days_per_week }) + ' · ' + who) + '</div>' + (progSummary(p) ? '<div class="card"><div class="lead">' + esc(progSummary(p)) + '</div></div>' : '') +
    '<div class="chips hs">' + Array.from({ length: p.weeks }, (_, i) => '<button class="chip ' + (w === i + 1 ? 'on' : '') + '" onclick="A.apWeek(\'' + id + '\',' + (i + 1) + ')">' + esc(t('Week {n}', { n: i + 1 })) + '</button>').join('') + '</div>' +
    days.map(d => '<div class="card" style="gap:6px"><div class="t">' + esc(LANG.cur === 'ka' && d.name_ka ? d.name_ka : d.name) + '</div>' + d.items.map(it => '<div class="s" style="color:var(--a-ink2)">' + esc(exName(it.ex) + ' ' + it.sets + '×' + it.reps + (it.load ? ' · ' + it.load : '')) + '</div>').join('') + '</div>').join('') +
    (p.status !== 'published' ? '<button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.programStatus(\'' + id + '\',\'published\')">' + t('Confirm and publish') + '</button>' : '<button class="btn sec" onclick="A.programStatus(\'' + id + '\',\'unpublished\')">' + t('Unpublish') + '</button>') +
    (p.status === 'submitted' ? '<button class="btn sec" onclick="A.programStatus(\'' + id + '\',\'unpublished\')">' + t('Not now') + '</button>' : '') +
    '<div class="card flat mute small">' + t('Something to change — an exercise, sets or reps? Send it through Feedback with the program name and it will be updated. This screen is for reading and confirming.') + '</div>' };
};
A.apWeek = (id, w) => { S.draft.apWeek = S.draft.apWeek || {}; S.draft.apWeek[id] = w; rerender(); };
A.programStatus = async (id, status) => { busy(true); try { await db.setProgramStatus(id, status); await loadAdmin(); toast(status === 'published' ? t('Published — Solo users can pick it') : t('Not published')); rerender(); } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); } };
SCREENS.arule = ({ key }) => {
  const r = (S.admin.rules || {})[key]; if (!r) return { title: '', body: empty('plan', t('Not found')) }; const v = r.value || {};
  let body = '';
  if (key === 'nutrition') {
    const line = (k, x) => '<div class="lrow"><div class="grow"><div class="s">' + esc(k) + '</div><div class="t" style="font-weight:600">' + esc(x) + '</div></div></div>';
    body = '<div class="card">' + line(t('Method'), t('Mifflin-St Jeor: 10×kg + 6.25×cm − 5×age (+5 men / −161 women), × activity by training days')) + line(t('Activity by days a week'), Object.entries(v.activity || {}).map(([d, a]) => d + ': ×' + a).join(' · ')) + line(t('Calories by goal'), Object.entries(v.goal_kcal || {}).map(([g, a]) => g + ' ' + (a > 0 ? '+' : '') + Math.round(a * 100) + ' %').join(' · ')) + line(t('Calorie floor / ceiling'), (v.kcal_floor || {}).f + ' (women) · ' + (v.kcal_floor || {}).m + ' (men) · ' + v.kcal_ceiling) + line(t('Protein per kg by goal'), Object.entries(v.protein_per_kg || {}).map(([g, a]) => g + ' ' + a + ' g').join(' · ') + ' · ' + v.protein_min + '–' + v.protein_max + ' g') + line(t('Water'), v.water_ml_per_kg + ' ml/kg · ' + v.water_min + '–' + v.water_max + ' ml') + line(t('Steps by goal'), Object.entries(v.steps || {}).map(([g, a]) => g + ' ' + a).join(' · ')) + line(t('Carbs / fats split'), t(v.split === 'balanced' ? 'Balanced (55 / 45 of the remaining calories)' : v.split)) + '</div>';
  } else if (key === 'swaps') {
    body = ['gym', 'home'].map(pl => '<div class="card"><div class="h3">' + t(pl === 'gym' ? 'Gym' : 'Home') + '</div>' + (v[pl] || []).map(s => '<div class="lrow"><div class="grow"><div class="s">' + esc(t({ knee: 'Knee', back: 'Back', shoulder: 'Shoulder', wrist: 'Wrist', ankle: 'Ankle' }[s.when] || s.when)) + '</div><div class="t" style="font-weight:600">' + esc(s.from.join(', ')) + '</div><div class="s">→ ' + esc(s.to) + '</div></div></div>').join('') + '</div>').join('');
  } else body = '<div class="card"><pre class="s" style="white-space:pre-wrap">' + esc(JSON.stringify(v, null, 1)) + '</pre></div>';
  return { title: key === 'nutrition' ? t('Nutrition targets') : key === 'swaps' ? t('Injury swaps') : key, sub: r.confirmed_at ? t('Confirmed {date}', { date: fmtDate(r.confirmed_at, 'dm') }) : t('Not confirmed yet'), body: body + '<button class="btn" style="background:var(--a-green);color:#16130F" onclick="A.confirmRule(\'' + key + '\')">' + (r.confirmed_at ? t('Confirm again') : t('Confirm')) + '</button><div class="card flat mute small">' + t('Changing a number: ask Claude in the project chat — the rules are a table the app reads.') + '</div>' };
};
A.confirmRule = async (key) => { busy(true); try { await db.confirmRule(key, null); await loadAdmin(); toast(t('Confirmed')); rerender(); } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); } };

// ---- pairs & plans (the monthly 15 % settlement while payments are outside the app)
SCREENS.apairs = () => {
  const a = S.admin || { pairs: [] }; const coachPairs = a.pairs.filter(p => p.kind !== 'solo');
  const active = coachPairs.filter(p => p.status === 'active'), trials = coachPairs.filter(p => p.status === 'trial');
  const withPlan = active.filter(p => p.plan_id); const sum = withPlan.reduce((n, p) => n + (p.plan_price || 0), 0);
  const row = p => '<div class="srow"><div class="grow" style="min-width:0"><div class="t">' + esc((p.trainee || {}).name || '?') + ' → ' + esc((p.coach || {}).name || '?') + '</div><div class="s wrap">' + esc(p.status === 'trial' ? (p.trial_session_id ? t('trial booked') : t('accepted — trial not booked yet')) : p.plan_id ? p.plan_name + ' · ' + p.plan_price + ' ₾ · ' + t('since {date}', { date: fmtDate(p.plan_since || p.started_at, 'dm') }) : t('Existing client · no plan yet')) + '</div></div>' + (p.plan_price ? '<div class="r" style="font-weight:800">' + p.plan_price + ' ₾</div>' : '') + '</div>';
  const text = withPlan.map(p => (p.trainee || {}).name + ' → ' + (p.coach || {}).name + ' · ' + p.plan_name + ' · ' + p.plan_price + ' GEL').join('\n') + '\n' + t('Total') + ' ' + sum + ' GEL · Tune Up 15 % = ' + (sum * 0.15).toFixed(2) + ' GEL';
  return { title: t('Pairs & plans'), sub: fmtDate(Date.now(), 'dm').split(' ')[1], actions: '<button class="act" onclick="A.copyText(' + JSON.stringify(text).replace(/"/g, '&quot;') + ')" aria-label="Copy">' + I.copy + '</button>', body:
    '<div class="card amber"><div class="eyebrow" style="color:var(--a-amber-ink)">' + t('Active plans this month') + '</div><div class="h2">' + esc(sum + ' ₾ · Tune Up 15 % = ' + (sum * 0.15).toFixed(2) + ' ₾') + '</div><div class="s">' + esc(t('{n} pairs with a plan · payments are outside the app', { n: withPlan.length })) + '</div></div>' +
    (active.length ? '<div class="slist">' + active.map(row).join('') + '</div>' : '<div class="card flat mute">' + t('No active pairs.') + '</div>') +
    (trials.length ? '<div class="section-title"><span class="eyebrow">' + t('Trials') + '</span></div><div class="slist">' + trials.map(row).join('') + '</div>' : '') };
};

A.newCoachInvite = () => sheet('<div class="h2">' + t('New coach invite') + '</div>' + field(t('Coach name (for your list)'), 'cinote', '', { ph: t('e.g. Giorgi, Fitness One') }) + '<button class="btn" onclick="A.createCoachInvite()">' + t('Create link') + '</button>');
A.createCoachInvite = async () => {
  busy(true);
  try { const inv = await db.createCoachInvite(S.me.id, val('cinote')); await loadAdmin(); A.showCoachInvite(inv.code); }
  catch (e) { busy(false); toast(t('Could not create — try again'), 'err'); }
};
A.showCoachInvite = (code) => {
  const link = db.inviteLink('coach', code);
  const msg = t('Welcome to the Tune Up beta! Open this link on your phone to set up your coach account: {link}', { link });
  sheet('<div class="h2">' + t('Coach invite link') + '</div><div class="codebox">' + esc(link) + '</div><p class="mute small">' + t('Works once, for 30 days. Send it to the coach only.') + '</p>' +
    '<div class="btn-row"><button class="btn sec" onclick="A.copyText(' + JSON.stringify(link).replace(/"/g, '&quot;') + ')">' + I.copy + ' ' + t('Copy') + '</button>' +
    (navigator.share ? '<button class="btn" onclick="A.shareText(' + JSON.stringify(msg).replace(/"/g, '&quot;') + ')">' + I.send + ' ' + t('Send') + '</button>' : '') + '</div>' +
    '<button class="btn sec" onclick="A.closeSheet();A.setTab(\'acoaches\')">' + t('Done') + '</button>');
};

SCREENS.ausers = () => {
  const a = S.admin || { users: [], pairs: [] };
  const pairOf = id => a.pairs.find(p => p.status === 'active' && p.kind !== 'solo' && (p.trainee.id === id || (p.coach && p.coach.id === id)));
  const soloOf = id => a.pairs.find(p => p.status === 'active' && p.kind === 'solo' && p.trainee.id === id);
  return { title: t('Users'), sub: t('{n} total', { n: a.users.length }), body:
    '<div class="card">' + (a.users.length ? a.users.map(u => { const p = pairOf(u.id); return '<div class="lrow" style="cursor:pointer" onclick="A.userSheet(\'' + u.id + '\')">' + avatar(u.name || u.email, u.id) + '<div class="grow"><div class="t">' + esc(u.name || u.email) + (u.deactivated_at ? ' <span class="tag bad">' + t('paused') + '</span>' : '') + '</div><div class="s">' + esc(t(ROLE[u.role] || 'No role')) + (p && u.role === 'trainee' ? ' · ' + t('with {name}', { name: firstName(p.coach.name) }) : soloOf(u.id) && u.role === 'trainee' ? ' · Solo' : '') + ' · ' + fmtDate(u.created_at, 'dm') + '</div></div>' + I.chev + '</div>'; }).join('') : empty('users', t('No users yet'))) + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Pairs') + '</span></div>' +
    (a.pairs.length ? '<div class="card">' + a.pairs.map(p => '<div class="lrow"><div class="grow"><div class="t">' + esc(p.kind === 'solo' ? 'Solo' : (p.coach || {}).name || '?') + ' → ' + esc((p.trainee || {}).name || '?') + '</div><div class="s">' + (p.status === 'active' ? t('Active since {date}', { date: fmtDate(p.started_at, 'dm') }) : t('Ended {date}', { date: fmtDate(p.ended_at, 'dm') })) + '</div></div></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No pairs yet.') + '</div>') };
};
A.userSheet = (id) => {
  const u = (S.admin.users || []).find(x => x.id === id); if (!u) return;
  sheet('<div class="h2">' + esc(u.name || u.email) + '</div><div class="card flat"><div class="lrow"><div class="grow"><div class="s">' + t('E-mail') + '</div><div class="t">' + esc(u.email) + '</div></div></div><div class="lrow"><div class="grow"><div class="s">' + t('Role') + '</div><div class="t">' + esc(t(ROLE[u.role] || 'No role')) + '</div></div></div><div class="lrow"><div class="grow"><div class="s">' + t('Consent') + '</div><div class="t">' + (u.consent_at ? fmtDate(u.consent_at) : '—') + '</div></div></div></div>' +
    (u.role === 'admin' ? '' : '<button class="btn ' + (u.deactivated_at ? '' : 'danger') + '" onclick="A.toggleActive(\'' + u.id + '\',' + (u.deactivated_at ? 'true' : 'false') + ')">' + (u.deactivated_at ? t('Un-pause account') : t('Pause account')) + '</button>') +
    '<button class="btn sec" onclick="A.closeSheet()">' + t('Close') + '</button>');
};
A.toggleActive = async (id, active) => { try { await db.setActive(id, active); closeSheet(); await loadAdmin(); rerender(); toast(active ? t('Account un-paused') : t('Account paused')); } catch (e) { toast(t('Could not change — try again'), 'err'); } };
SCREENS.afeedback = () => {
  const list = (S.admin && S.admin.feedback) || []; const who = id => { const u = (S.admin.users || []).find(x => x.id === id); return u ? (u.name || u.email) : '?'; };
  return { title: t('Feedback'), sub: t('{n} total', { n: list.length }), body: list.length ? '<div class="card">' + list.map(f => '<div class="lrow"><div class="grow"><div class="t" style="white-space:pre-wrap">' + esc(f.text) + '</div>' + attHtml(f.attachments) + '<div class="s">' + esc(who(f.user_id)) + ' · ' + esc(f.role) + ' · ' + esc(f.screen) + ' · ' + fmtDate(f.created_at) + ' ' + fmtTime(f.created_at) + '</div></div></div>').join('') + '</div>' : empty('chat', t('Nothing yet')) };
};
