// Tune Up beta — coach screens: clients, client view (monitoring + plan), invite links, More. Today tab lives in monitor.js.
import { loader } from './motion.js';
import { t, esc, opt, fmtDate, firstName, OPTS, unit } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { planCard, loadPlan } from './plan.js';
import { loadMonitor, monitorCards, loadClientExtras, statsFor, flagsFor } from './monitor.js';
import { loadUnread, loadChatIndex } from './chat.js';
import { pushRow } from './push.js';
import { guideRow } from './guide.js';

export const COACH_TABS = [{ id: 'ctoday', label: 'Today', ico: 'home' }, { id: 'clients', label: 'Clients', ico: 'users' }, { id: 'chat', label: 'Chat', ico: 'chat' }, { id: 'ccal', label: 'Calendar', ico: 'cal' }, { id: 'cmore', label: 'More', ico: 'gear' }];

export async function loadCoach() {
  // after coaching ends the ex-client's profile is private again (by design), so the pair comes back without it
  S.clients = (await db.myClients(S.me.id) || []).map(c => c.trainee ? c : Object.assign(c, { gone: true, trainee: { id: null, name: t('Former client'), lang: 'en', trainee_profiles: null } }));
  S.coachProfile = await db.myCoachProfile(S.me.id);
  await loadMonitor();
  S.cal = null; S.chat = null; S.notifs = null; await Promise.all([loadUnread(), loadChatIndex().catch(() => {})]);
}
function tp(c) { const p = c.trainee && c.trainee.trainee_profiles; return (Array.isArray(p) ? p[0] : p) || {}; }

A.clientFilter = (k) => { S.clientFilter = k; rerender(); };
SCREENS.clients = () => {
  const active = S.clients.filter(c => c.status === 'active'), ended = S.clients.filter(c => c.status !== 'active');
  const flags = c => { try { return S.mon ? flagsFor(c, statsFor(c)) : []; } catch (e) { return []; } };
  const needs = active.filter(c => flags(c).length), ok = active.filter(c => !flags(c).length);
  const f = S.clientFilter || 'all'; const list = f === 'eye' ? needs : f === 'ok' ? ok : f === 'ended' ? ended : active;
  const chip = (k, label, n) => '<button class="chip ' + (f === k ? 'on' : '') + '" onclick="A.clientFilter(\'' + k + '\')">' + esc(t(label)) + ' · ' + n + '</button>';
  const row = c => { const p = tp(c); const fl = c.status === 'active' ? flags(c) : [];
    const sub = c.status === 'active' ? [opt('goal', p.goal), lastKg(c, p) ? lastKg(c, p) + ' ' + unit('kg') : '', opt('format', c.format)].filter(Boolean).join(' · ') : [c.ended_at ? t('Ended') + ' ' + fmtDate(new Date(c.ended_at)) : '', c.end_note || ''].filter(Boolean).join(' · ');
    const pill = c.status !== 'active' ? '' : fl.length ? '<span class="pill bad">' + fl.length + '</span>' : '<span class="pill ok">' + I.check + '</span>';
    return '<div class="srow' + (c.status !== 'active' ? ' off' : '') + '"' + (c.gone ? '' : ' style="cursor:pointer" onclick="A.go(\'client\',{id:\'' + c.id + '\'})"') + '>' + avatar(c.trainee.name, c.gone ? c.id : c.trainee.id) + '<div class="grow" style="min-width:0"><div class="t">' + esc(c.trainee.name) + '</div><div class="s wrap">' + esc(sub) + '</div></div>' + pill + (c.gone ? '' : I.chev) + '</div>'; };
  return { title: t('Clients'), sub: t('{n} active', { n: active.length }), body:
    (active.length || ended.length ? '<div class="chips hs">' + chip('all', 'All', active.length) + chip('eye', 'Needs your eye', needs.length) + chip('ok', 'On track', ok.length) + '</div>' : '') +
    (list.length ? '<div class="slist">' + list.map(row).join('') + '</div>' : active.length || f !== 'all' ? '<div class="card flat mute">' + t('Nobody here right now.') + '</div>' : '<div class="card soft"><div class="h3">' + t('No clients yet') + '</div><div class="mute">' + t('Create an invite link and send it to a client. They sign up through it and land here.') + '</div><button class="btn sm" onclick="A.newInvite()">' + I.link + ' ' + t('Invite a client') + '</button></div>') +
    (f === 'all' && ended.length ? '<div class="section-title"><span class="eyebrow">' + t('Ended') + '</span></div><div class="slist">' + ended.map(row).join('') + '</div>' : ''),
    actions: '<button class="act add" onclick="A.newInvite()" aria-label="Invite">' + I.plus + '</button>',
    after: async () => { if (!S.mon) { try { await loadMonitor(); rerender(); } catch (e) {} } } };
};

function lastKg(c, p) { const w = S.mon ? S.mon.logs.filter(l => l.trainee_id === c.trainee.id && l.kind === 'weight').sort((a, b) => a.day < b.day ? -1 : 1).pop() : null; return w ? Number(w.value) : p.weight_kg; }
// the client page is split in three: what is happening, the plan, and notes (it was four phone screens long)
function clientTabs(c) {
  const tab = S.clientTab || 'overview'; const tb = (k, label) => '<button class="' + (tab === k ? 'on' : '') + '" role="tab" aria-selected="' + (tab === k) + '" onclick="A.clientTab(\'' + k + '\')">' + t(label) + '</button>';
  const plan = S.plan && S.plan.pairId === c.id ? planCard(c.id) : '<div class="card flat">' + loader(t('Loading the plan…'), 2) + '</div>';
  return '<div class="segc" role="tablist">' + tb('overview', 'Overview') + tb('plan', 'Plan') + tb('notes', 'Notes') + '</div>' +
    (tab === 'plan' ? plan : monitorCards(c, tab));
}
A.clientTab = (k) => { S.clientTab = k; rerender(); };
SCREENS.client = ({ id }) => {
  const c = S.clients.find(x => x.id === id); if (!c) return { title: '', body: empty('users', t('Not found')) };
  if (S.clientTabFor !== id) { S.clientTabFor = id; S.clientTab = 'overview'; }
  const p = tp(c); const u = c.trainee;
  return { title: '', body:
    '<div class="tophead" style="margin-top:0">' + avatar(u.name, u.id, 'lg') + '<div class="grow" style="min-width:0"><div class="h1 sm">' + esc(u.name) + '</div><div class="eyebrow">' + esc([opt('goal', p.goal), lastKg(c, p) ? lastKg(c, p) + ' ' + unit('kg') : '', opt('format', c.format)].filter(Boolean).join(' · ')) + '</div><div class="mute small">' + esc(c.status === 'active' ? t('Together since {date}', { date: fmtDate(c.started_at, 'dm') }) : t('Ended {date}', { date: fmtDate(c.ended_at, 'dm') })) + '</div></div></div>' +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.go(\'clientAnswers\',{id:\'' + c.id + '\'})"><div class="grow"><div class="t">' + t('Their answers') + '</div><div class="s">' + esc([opt('experience', p.experience), p.injuries ? t('Injuries') + ': ' + p.injuries : ''].filter(Boolean).join(' · ') || t('Weight, goal, injuries, diet')) + '</div></div>' + I.chev + '</div>' +
    (c.status === 'active' ? '<div class="lrow" style="cursor:pointer" onclick="A.go(\'thread\',{id:\'' + c.id + '\'})"><div class="grow"><div class="t">' + t('Chat') + '</div><div class="s">' + t('Messages with {name}', { name: firstName(u.name) }) + '</div></div>' + I.chev + '</div>' + '<div class="lrow" style="cursor:pointer" onclick="A.go(\'tune\',{client:\'' + c.id + '\'})"><div class="grow"><div class="t">' + t('Ask Tune about {name}', { name: firstName(u.name) }) + '</div><div class="s">' + t('Ask, or tell Tune what to do') + '</div></div>' + I.chev + '</div>' : '') + '</div>' +
    (c.status === 'active' ? clientTabs(c) +
      '<div style="height:8px"></div><button class="btn sec" onclick="A.endPairAsk(\'' + c.id + '\')">' + t('End coaching') + '</button>' : (c.end_note ? '<div class="card flat mute">' + t('Note') + ': ' + esc(c.end_note) + '</div>' : '')),
    after: async () => { if (c.status !== 'active') return; let changed = false;
      try { if (S.mon && S.mon.notes[c.id] == null) { await loadClientExtras(c); changed = true; } if (!(S.plan && S.plan.pairId === c.id)) { await loadPlan(c.id); changed = true; } } catch (e) { toast(t('Could not load the plan'), 'err'); }
      if (changed) rerender(); } };
};
SCREENS.clientAnswers = ({ id }) => {
  const c = S.clients.find(x => x.id === id); if (!c) return { title: '', body: empty('users', t('Not found')) };
  const p = tp(c);
  const rows = [[t('Weight'), p.weight_kg ? p.weight_kg + ' ' + unit('kg') : '—'], [t('Height'), p.height_cm ? p.height_cm + ' ' + unit('cm') : '—'], [t('Experience'), opt('experience', p.experience)], [t('Main goal'), opt('goal', p.goal)], [t('Anything specific?'), p.goal_detail || '—'], [t('Injuries or limits'), p.injuries || '—'], [t('Diet'), p.diet || '—'], [t('How they want to train'), opt('format', p.format)]];
  return { title: t('Their answers'), sub: c.trainee.name, body: '<div class="card">' + rows.map(r => '<div class="lrow"><div class="grow"><div class="s">' + esc(r[0]) + '</div><div class="t">' + esc(r[1]) + '</div></div></div>').join('') + '</div>' };
};

A.endPairAsk = (id) => { const c = S.clients.find(x => x.id === id); sheet('<div class="h2">' + t('End coaching with {name}?', { name: firstName(c.trainee.name) }) + '</div><p class="lead">' + t('They will see that the coaching ended, with your note. Their data stays with them.') + '</p>' + field(t('Short note (optional)'), 'endnote', '', { textarea: true, ph: t('e.g. Thank you — you reached your goal!') }) + '<button class="btn danger" onclick="A.endPair(\'' + id + '\')">' + t('End coaching') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>'); };
A.endPair = async (id) => { try { await db.endPair(id, val('endnote')); closeSheet(); await loadCoach(); toast(t('Coaching ended')); root('clients'); } catch (e) { toast(t('Could not end — try again'), 'err'); } };

// ---- invites
SCREENS.invites = () => {
  const list = S.invites || [];
  const open = list.filter(i => !i.used_by && new Date(i.expires_at) > new Date()), used = list.filter(i => i.used_by);
  return { title: t('Invite links'), body:
    '<div class="card soft"><div class="h3">' + t('One link per client') + '</div><div class="mute">' + t('Send the link in any messenger. When the client opens it and signs up, they are paired with you.') + '</div><button class="btn sm" onclick="A.newInvite()">' + I.link + ' ' + t('New invite link') + '</button></div>' +
    (open.length ? '<div class="section-title"><span class="eyebrow">' + t('Waiting') + '</span></div><div class="card">' + open.map(i => '<div class="lrow" style="cursor:pointer" onclick="A.showInvite(\'' + i.code + '\')"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + t('Valid until {date}', { date: fmtDate(i.expires_at, 'dm') }) + ' · ' + esc(i.code) + '</div></div>' + I.chev + '</div>').join('') + '</div>' : '') +
    (used.length ? '<div class="section-title"><span class="eyebrow">' + t('Used') + '</span></div><div class="card" style="opacity:.75">' + used.map(i => '<div class="lrow"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + t('Used {date}', { date: fmtDate(i.used_at, 'dm') }) + '</div></div></div>').join('') + '</div>' : ''),
    after: async () => { if (!S.invites) { try { S.invites = await db.myInvites(S.me.id); rerender(); } catch (e) {} } } };
};

A.newInvite = () => sheet('<div class="h2">' + t('New invite link') + '</div>' + field(t('Who is it for? (only you see this)'), 'invnote', '', { ph: t('e.g. Nino') }) + '<button class="btn" onclick="A.createInvite()">' + t('Create link') + '</button>');
A.createInvite = async () => {
  busy(true);
  try { const inv = await db.createClientInvite(S.me.id, val('invnote')); S.invites = null; A.showInvite(inv.code, val('invnote')); }
  catch (e) { busy(false); toast(t('Could not create — try again'), 'err'); }
};
A.showInvite = (code, note) => {
  const link = db.inviteLink('client', code);
  const msg = t('Hi! Join me on Tune Up — open this link on your phone and sign up: {link}', { link });
  sheet('<div class="h2">' + t('Invite link') + '</div><div class="codebox">' + esc(link) + '</div><p class="mute small">' + t('Works once, for 30 days. Send it to the client only.') + '</p>' +
    '<div class="btn-row"><button class="btn sec" onclick="A.copyText(' + JSON.stringify(link).replace(/"/g, '&quot;') + ')">' + I.copy + ' ' + t('Copy') + '</button>' +
    (navigator.share ? '<button class="btn" onclick="A.shareText(' + JSON.stringify(msg).replace(/"/g, '&quot;') + ')">' + I.send + ' ' + t('Send') + '</button>' : '') + '</div>' +
    '<button class="btn sec" onclick="A.closeSheet();A.go(\'invites\')">' + t('Done') + '</button>');
};
A.copyText = async (s) => { try { await navigator.clipboard.writeText(s); toast(t('Copied')); } catch (e) { toast(t('Select and copy the link'), 'err'); } };
A.shareText = async (s) => { try { await navigator.share({ text: s }); } catch (e) {} };

// ---- more
function dotted(html, c) { return html.split('<div class="lrow"').join('<div class="lrow" style="--dot:var(' + c + ')"'); }
SCREENS.cmore = () => {
  const cp = S.coachProfile || {}; const n = (S.clients || []).filter(c => c.status === 'active').length;
  const row = (c2, on, title, sub) => '<div class="lrow" style="--dot:var(' + c2 + ');cursor:pointer" onclick="' + on + '"><div class="grow"><div class="t">' + title + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>' + I.chev + '</div>';
  const head = '<div class="tophead">' + avatar(S.me.name, S.me.id, 'lg') + '<div class="grow" style="min-width:0"><div class="h1 sm">' + esc(S.me.name) + '</div><div class="eyebrow">' + esc([cp.gym, cp.district, t('{n} active', { n })].filter(Boolean).join(' · ')) + '</div></div></div>';
  return { title: '', header: false, body: head +
    '<div class="eyebrow grp">' + t('Coaching') + '</div><div class="card menu">' + row('--c-kcal', "A.go('coachEdit')", t('Coach profile'), esc([cp.gym, cp.district].filter(Boolean).join(' · ') || t('Gym, district, what you coach'))) + row('--c-carbs', "A.go('myExercises')", t('My exercises'), t('Your own moves and video links')) + row('--c-water', "A.go('invites')", t('Invite links'), t('One link per client')) + '</div>' +
    '<div class="eyebrow grp">' + t('App') + '</div><div class="card menu">' + dotted(pushRow(), '--c-tune') + '<div class="lrow" style="--dot:var(--c-kcal)"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div>' + dotted(guideRow(), '--a-mute') + row('--a-mute', 'A.feedbackSheet()', t('Send feedback'), t('What is confusing, missing or great?')) + '</div>' +
    '<div class="card menu plain"><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div>' +
    '<div class="lrow" style="cursor:pointer" onclick="A.deleteAccountAsk()"><div class="grow"><div class="t" style="color:var(--a-red)">' + t('Delete account') + '</div><div class="s">' + t('Removes all your data') + '</div></div></div></div>' +
    '<div class="mute small" style="text-align:center">Tune Up · ' + t('closed beta') + '</div>' };
};

SCREENS.coachEdit = () => {
  const cp = S.draft.cp || (S.draft.cp = Object.assign({ specialties: [], pitch: '', gym: '', district: '', inperson: true, online: false, availability_text: '' }, S.coachProfile || {}));
  const fmt = cp.inperson && cp.online ? 'either' : cp.online ? 'online' : 'inperson';
  const spec = Object.keys(OPTS.specialty);
  return { title: t('Coach profile'), body:
    field(t('Your name'), 'name', S.draft.name != null ? S.draft.name : S.me.name) +
    '<div class="field"><label>' + t('What you coach') + '</label><div class="chips">' + spec.map(k => '<button class="chip ' + (cp.specialties.includes(k) ? 'on' : '') + '" onclick="A.cpSpec(\'' + k + '\')">' + esc(opt('specialty', k)) + '</button>').join('') + '</div></div>' +
    field(t('One line about you'), 'pitch', cp.pitch, { textarea: true }) + field(t('Gym'), 'gym', cp.gym) + field(t('District'), 'district', cp.district) +
    field(t('When you are usually available'), 'availability_text', cp.availability_text, { ph: t('e.g. Mon–Fri 8–20, Sat mornings') }) +
    '<div class="field"><label>' + t('How you train clients') + '</label><div class="chips">' + ['inperson', 'online', 'either'].map(k => '<button class="chip ' + (fmt === k ? 'on' : '') + '" onclick="A.cpFormat(\'' + k + '\')">' + esc(opt('format', k)) + '</button>').join('') + '</div></div>' +
    '<button class="btn" onclick="A.cpSave()">' + t('Save') + '</button>' };
};
function cpKeep() { const cp = S.draft.cp; ['pitch', 'gym', 'district', 'availability_text'].forEach(id => { cp[id] = val(id); }); S.draft.name = val('name'); }
A.cpSpec = (k) => { cpKeep(); const a = S.draft.cp.specialties; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); rerender(); };
A.cpFormat = (k) => { cpKeep(); S.draft.cp.inperson = k !== 'online'; S.draft.cp.online = k !== 'inperson'; rerender(); };
A.cpSave = async () => {
  cpKeep(); const cp = S.draft.cp; const name = (S.draft.name || '').trim();
  if (name.length < 2) { toast(t('Please enter your name.'), 'err'); return; }
  busy(true);
  try {
    await db.saveCoachProfile(S.me.id, { specialties: cp.specialties, pitch: cp.pitch, gym: cp.gym, district: cp.district, inperson: cp.inperson, online: cp.online, availability_text: cp.availability_text || '' });
    if (name !== S.me.name) { await db.updateProfile(S.me.id, { name }); S.me.name = name; }
    S.coachProfile = Object.assign({}, S.coachProfile, cp); S.draft = {}; toast(t('Saved')); back();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
// a client joined or left: reload the list first (the bell and the phone notification land here)
A.openClients = async (pairId) => { try { await loadCoach(); } catch (e) {} S.notifs = null; root('clients'); if (pairId && (S.clients || []).find(c => c.id === pairId)) go('client', { id: pairId }); };
