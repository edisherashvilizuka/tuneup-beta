// Tune Up beta — coach screens: clients, client view (monitoring + plan), invite links, More. Today tab lives in monitor.js.
import { t, esc, opt, fmtDate, firstName, OPTS, unit } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { planCard, loadPlan } from './plan.js';
import { loadMonitor, monitorCards, loadClientExtras } from './monitor.js';

export const COACH_TABS = [{ id: 'ctoday', label: 'Today', ico: 'home' }, { id: 'clients', label: 'Clients', ico: 'users' }, { id: 'invites', label: 'Invites', ico: 'link' }, { id: 'cmore', label: 'More', ico: 'gear' }];

export async function loadCoach() {
  S.clients = await db.myClients(S.me.id);
  S.coachProfile = await db.myCoachProfile(S.me.id);
  await loadMonitor();
}
function tp(c) { const p = c.trainee && c.trainee.trainee_profiles; return (Array.isArray(p) ? p[0] : p) || {}; }

SCREENS.clients = () => {
  const active = S.clients.filter(c => c.status === 'active'), ended = S.clients.filter(c => c.status !== 'active');
  const row = c => '<div class="lrow" style="cursor:pointer" onclick="A.go(\'client\',{id:\'' + c.id + '\'})">' + avatar(c.trainee.name, c.trainee.id) + '<div class="grow"><div class="t">' + esc(c.trainee.name) + '</div><div class="s">' + esc([opt('goal', tp(c).goal), opt('format', c.format)].filter(Boolean).join(' · ')) + '</div></div>' + I.chev + '</div>';
  return { title: t('Clients'), sub: t('{n} active', { n: active.length }), body:
    (active.length ? '<div class="card">' + active.map(row).join('') + '</div>' : '<div class="card soft"><div class="h3">' + t('No clients yet') + '</div><div class="mute">' + t('Create an invite link and send it to a client. They sign up through it and land here.') + '</div><button class="btn sm" onclick="A.newInvite()">' + I.link + ' ' + t('Invite a client') + '</button></div>') +
    (ended.length ? '<div class="section-title"><span class="eyebrow">' + t('Ended') + '</span></div><div class="card" style="opacity:.75">' + ended.map(row).join('') + '</div>' : ''),
    actions: '<button class="act" onclick="A.newInvite()" aria-label="Invite">' + I.plus + '</button>' };
};

SCREENS.client = ({ id }) => {
  const c = S.clients.find(x => x.id === id); if (!c) return { title: '', body: empty('users', t('Not found')) };
  const p = tp(c); const u = c.trainee;
  return { title: u.name, sub: c.status === 'active' ? t('Together since {date}', { date: fmtDate(c.started_at, 'dm') }) : t('Ended {date}', { date: fmtDate(c.ended_at, 'dm') }), body:
    '<div class="row">' + avatar(u.name, u.id, 'lg') + '<div class="grow"><div class="h2">' + esc(u.name) + '</div><div class="mute">' + esc([opt('goal', p.goal), p.weight_kg ? p.weight_kg + ' ' + unit('kg') : '', opt('format', c.format)].filter(Boolean).join(' · ')) + '</div></div></div>' +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.go(\'clientAnswers\',{id:\'' + c.id + '\'})"><div class="grow"><div class="t">' + t('Their answers') + '</div><div class="s">' + esc([opt('experience', p.experience), p.injuries ? t('Injuries') + ': ' + p.injuries : ''].filter(Boolean).join(' · ') || t('Weight, goal, injuries, diet')) + '</div></div>' + I.chev + '</div></div>' +
    (c.status === 'active' ? monitorCards(c) + (S.plan && S.plan.pairId === c.id ? planCard(c.id) : '<div class="card flat mute">' + t('Loading the plan…') + '</div>') +
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
    '<button class="btn sec" onclick="A.closeSheet();A.setTab(\'invites\')">' + t('Done') + '</button>');
};
A.copyText = async (s) => { try { await navigator.clipboard.writeText(s); toast(t('Copied')); } catch (e) { toast(t('Select and copy the link'), 'err'); } };
A.shareText = async (s) => { try { await navigator.share({ text: s }); } catch (e) {} };

// ---- more
SCREENS.cmore = () => {
  const cp = S.coachProfile || {};
  return { title: t('More'), body:
    '<div class="card"><div class="lrow">' + avatar(S.me.name, S.me.id) + '<div class="grow"><div class="t">' + esc(S.me.name) + '</div><div class="s">' + esc((S.session.user && S.session.user.email) || '') + '</div></div></div>' +
    '<div class="lrow" style="cursor:pointer" onclick="A.go(\'coachEdit\')"><div class="grow"><div class="t">' + t('Coach profile') + '</div><div class="s">' + esc([cp.gym, cp.district].filter(Boolean).join(' · ') || t('Gym, district, what you coach')) + '</div></div>' + I.chev + '</div>' +
    '<div class="lrow" style="cursor:pointer" onclick="A.go(\'myExercises\')"><div class="grow"><div class="t">' + t('My exercises') + '</div><div class="s">' + t('Your own moves and video links') + '</div></div>' + I.chev + '</div>' +
    '<div class="lrow"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div></div>' +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div>' +
    '<div class="lrow" style="cursor:pointer" onclick="A.deleteAccountAsk()"><div class="grow"><div class="t" style="color:var(--a-red)">' + t('Delete account') + '</div><div class="s">' + t('Removes all your data') + '</div></div></div></div>' +
    '<div class="mute small" style="text-align:center">Tune Up · ' + t('closed beta') + '</div>' };
};

SCREENS.coachEdit = () => {
  const cp = S.draft.cp || (S.draft.cp = Object.assign({ specialties: [], pitch: '', gym: '', district: '', inperson: true, online: false }, S.coachProfile || {}));
  const fmt = cp.inperson && cp.online ? 'either' : cp.online ? 'online' : 'inperson';
  const spec = Object.keys(OPTS.specialty);
  return { title: t('Coach profile'), body:
    field(t('Your name'), 'name', S.draft.name != null ? S.draft.name : S.me.name) +
    '<div class="field"><label>' + t('What you coach') + '</label><div class="chips">' + spec.map(k => '<button class="chip ' + (cp.specialties.includes(k) ? 'on' : '') + '" onclick="A.cpSpec(\'' + k + '\')">' + esc(opt('specialty', k)) + '</button>').join('') + '</div></div>' +
    field(t('One line about you'), 'pitch', cp.pitch, { textarea: true }) + field(t('Gym'), 'gym', cp.gym) + field(t('District'), 'district', cp.district) +
    '<div class="field"><label>' + t('How you train clients') + '</label><div class="chips">' + ['inperson', 'online', 'either'].map(k => '<button class="chip ' + (fmt === k ? 'on' : '') + '" onclick="A.cpFormat(\'' + k + '\')">' + esc(opt('format', k)) + '</button>').join('') + '</div></div>' +
    '<button class="btn" onclick="A.cpSave()">' + t('Save') + '</button>' };
};
function cpKeep() { const cp = S.draft.cp; ['pitch', 'gym', 'district'].forEach(id => { cp[id] = val(id); }); S.draft.name = val('name'); }
A.cpSpec = (k) => { cpKeep(); const a = S.draft.cp.specialties; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.push(k); rerender(); };
A.cpFormat = (k) => { cpKeep(); S.draft.cp.inperson = k !== 'online'; S.draft.cp.online = k !== 'inperson'; rerender(); };
A.cpSave = async () => {
  cpKeep(); const cp = S.draft.cp; const name = (S.draft.name || '').trim();
  if (name.length < 2) { toast(t('Please enter your name.'), 'err'); return; }
  busy(true);
  try {
    await db.saveCoachProfile(S.me.id, { specialties: cp.specialties, pitch: cp.pitch, gym: cp.gym, district: cp.district, inperson: cp.inperson, online: cp.online });
    if (name !== S.me.name) { await db.updateProfile(S.me.id, { name }); S.me.name = name; }
    S.coachProfile = Object.assign({}, S.coachProfile, cp); S.draft = {}; toast(t('Saved')); back();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
