// Tune Up beta — admin screens (week 1: coach invites, users, pairs).
import { t, esc, fmtDate, firstName, fmtTime, isoDate } from './i18n.js';
import { SCREENS, A, I, root, rerender, toast, sheet, closeSheet, avatar, empty, langToggle, field, val, busy } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

export const ADMIN_TABS = [{ id: 'aover', label: 'Overview', ico: 'home' }, { id: 'acoaches', label: 'Coaches', ico: 'shield' }, { id: 'ausers', label: 'Users', ico: 'users' }];

export async function loadAdmin() {
  const [users, pairs, invites, feedback, logsToday] = await Promise.all([db.adminUsers(), db.adminPairs(), db.coachInvites(), db.adminFeedback().catch(() => []), db.adminLogsToday(isoDate()).catch(() => 0)]);
  S.admin = { users, pairs, invites, feedback, logsToday };
}
const ROLE = { trainee: 'Trainee', coach: 'Coach', admin: 'Admin' };

SCREENS.aover = () => {
  const a = S.admin || { users: [], pairs: [], invites: [] };
  const coaches = a.users.filter(u => u.role === 'coach').length, trainees = a.users.filter(u => u.role === 'trainee').length, pending = a.users.filter(u => !u.role).length;
  const active = a.pairs.filter(p => p.status === 'active').length;
  const stat = (v, k) => '<div class="tile"><div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div></div>';
  return { title: t('Overview'), sub: 'Tune Up · ' + t('closed beta'), body:
    '<div class="grid2">' + stat(active, t('Active pairs')) + stat(coaches, t('Coaches')) + stat(trainees, t('Trainees')) + stat(pending, t('Signed in, no role')) + stat(a.logsToday || 0, t('Logs today')) + stat((a.feedback || []).length, t('Feedback notes')) + '</div>' +
    '<div class="card"><div class="lrow" style="cursor:pointer" onclick="A.go(\'afeedback\')"><div class="grow"><div class="t">' + t('Feedback') + '</div><div class="s">' + ((a.feedback || [])[0] ? esc(a.feedback[0].text).slice(0, 60) : t('Nothing yet')) + '</div></div>' + I.chev + '</div></div>' +
    '<div class="card soft"><div class="h3">' + t('Next step') + '</div><div class="mute">' + t('Create a coach invite, send the link to a vetted coach, then let them invite their clients.') + '</div><button class="btn sm" onclick="A.newCoachInvite()">' + I.plus + ' ' + t('New coach invite') + '</button></div>' +
    '<div class="card"><div class="lrow"><div class="grow"><div class="t">' + t('Language') + '</div></div>' + langToggle('setLangSave') + '</div><div class="lrow" style="cursor:pointer" onclick="A.reloadAdmin()"><div class="grow"><div class="t">' + t('Refresh') + '</div></div></div><div class="lrow" style="cursor:pointer" onclick="A.signOut()"><div class="grow"><div class="t">' + t('Sign out') + '</div></div>' + I.logout + '</div></div>' };
};
A.reloadAdmin = async () => { try { await loadAdmin(); rerender(); toast(t('Updated')); } catch (e) { toast(t('Could not refresh'), 'err'); } };

SCREENS.acoaches = () => {
  const a = S.admin || { users: [], invites: [] };
  const open = a.invites.filter(i => !i.used_by && new Date(i.expires_at) > new Date()), used = a.invites.filter(i => i.used_by);
  const coaches = a.users.filter(u => u.role === 'coach');
  return { title: t('Coaches'), actions: '<button class="act" onclick="A.newCoachInvite()" aria-label="New">' + I.plus + '</button>', body:
    (coaches.length ? '<div class="card">' + coaches.map(u => '<div class="lrow">' + avatar(u.name, u.id) + '<div class="grow"><div class="t">' + esc(u.name || u.email) + '</div><div class="s">' + esc(u.email) + (u.deactivated_at ? ' · ' + t('paused') : '') + '</div></div></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No coaches yet.') + '</div>') +
    '<div class="section-title"><span class="eyebrow">' + t('Coach invites') + '</span></div>' +
    (open.length ? '<div class="card">' + open.map(i => '<div class="lrow" style="cursor:pointer" onclick="A.showCoachInvite(\'' + i.code + '\')"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + esc(i.code) + ' · ' + t('Valid until {date}', { date: fmtDate(i.expires_at, 'dm') }) + '</div></div>' + I.chev + '</div>').join('') + '</div>' : '<div class="card flat mute">' + t('No open invites.') + '</div>') +
    (used.length ? '<div class="card" style="opacity:.75">' + used.map(i => '<div class="lrow"><div class="grow"><div class="t">' + esc(i.note || t('Invite')) + '</div><div class="s">' + t('Used {date}', { date: fmtDate(i.used_at, 'dm') }) + '</div></div></div>').join('') + '</div>' : '') };
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
  const pairOf = id => a.pairs.find(p => p.status === 'active' && (p.trainee.id === id || p.coach.id === id));
  return { title: t('Users'), sub: t('{n} total', { n: a.users.length }), body:
    '<div class="card">' + (a.users.length ? a.users.map(u => { const p = pairOf(u.id); return '<div class="lrow" style="cursor:pointer" onclick="A.userSheet(\'' + u.id + '\')">' + avatar(u.name || u.email, u.id) + '<div class="grow"><div class="t">' + esc(u.name || u.email) + (u.deactivated_at ? ' <span class="tag bad">' + t('paused') + '</span>' : '') + '</div><div class="s">' + esc(t(ROLE[u.role] || 'No role')) + (p && u.role === 'trainee' ? ' · ' + t('with {name}', { name: firstName(p.coach.name) }) : '') + ' · ' + fmtDate(u.created_at, 'dm') + '</div></div>' + I.chev + '</div>'; }).join('') : empty('users', t('No users yet'))) + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + t('Pairs') + '</span></div>' +
    (a.pairs.length ? '<div class="card">' + a.pairs.map(p => '<div class="lrow"><div class="grow"><div class="t">' + esc(p.coach.name) + ' → ' + esc(p.trainee.name) + '</div><div class="s">' + (p.status === 'active' ? t('Active since {date}', { date: fmtDate(p.started_at, 'dm') }) : t('Ended {date}', { date: fmtDate(p.ended_at, 'dm') })) + '</div></div></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No pairs yet.') + '</div>') };
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
  return { title: t('Feedback'), sub: t('{n} total', { n: list.length }), body: list.length ? '<div class="card">' + list.map(f => '<div class="lrow"><div class="grow"><div class="t" style="white-space:pre-wrap">' + esc(f.text) + '</div><div class="s">' + esc(who(f.user_id)) + ' · ' + esc(f.role) + ' · ' + esc(f.screen) + ' · ' + fmtDate(f.created_at) + ' ' + fmtTime(f.created_at) + '</div></div></div>').join('') + '</div>' : empty('chat', t('Nothing yet')) };
};
