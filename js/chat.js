// Tune Up beta — chat per pair (text; clips as links), the bell (notifications) and the feedback sheet.
import { t, esc, fmtDate, fmtTime, firstName, isoDate } from './i18n.js';
import { SCREENS, A, I, go, root, rerender, toast, sheet, closeSheet, field, val, busy, avatar, empty, cur } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

// ---- pairs this person can chat in
function myPairs() {
  if (S.me.role === 'coach') return (S.clients || []).filter(c => c.status === 'active').map(c => ({ id: c.id, name: c.trainee.name, uid: c.trainee.id }));
  if (S.pair && S.pair.status === 'active') return [{ id: S.pair.id, name: (S.pair.coach || {}).name, uid: (S.pair.coach || {}).id }];
  return [];
}
function linkify(text) {                     // plain text, but https links become tappable (form-check clips)
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, u => '<a href="' + u + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">' + u + '</a>');
}
export async function loadChatIndex() {        // last message + unread per pair (list screen)
  const pairs = myPairs(); S.chat = S.chat || {}; S.chat.index = {}; S.chat.indexAt = Date.now();
  if (!pairs.length) return;
  const ids = pairs.map(p => p.id);
  const [msgs, reads] = await Promise.all([db.recentMessages(ids), db.chatReads(ids)]);
  pairs.forEach(p => {
    const mine = reads.find(r => r.pair_id === p.id && r.user_id === S.me.id); const since = mine ? mine.read_at : '1970-01-01';
    const list = msgs.filter(m => m.pair_id === p.id);
    S.chat.index[p.id] = { last: list[0] || null, unread: list.filter(m => m.sender_id !== S.me.id && m.created_at > since).length };
  });
}
export function chatUnread() { return Object.values((S.chat && S.chat.index) || {}).reduce((a, x) => a + x.unread, 0); }

// ---- list of chats (coach) / straight into the thread (trainee)
SCREENS.chat = () => {
  const pairs = myPairs();
  if (!pairs.length) return { title: t('Chat'), body: empty('chat', S.me.role === 'coach' ? t('No clients yet') : t('No coach yet')) };
  if (S.me.role !== 'coach') { const v = SCREENS.thread({ id: pairs[0].id }); v.tabs = true; return v; }   // the trainee has one chat: the tab is the thread
  const idx = (S.chat && S.chat.index) || {};
  return { title: t('Chat'), body: '<div class="card">' + pairs.map(p => { const x = idx[p.id] || {}; return '<div class="lrow" style="cursor:pointer" onclick="A.go(\'thread\',{id:\'' + p.id + '\'})">' + avatar(p.name, p.uid) + '<div class="grow"><div class="t">' + esc(p.name) + (x.unread ? ' <span class="pill-num" style="background:var(--a-accent);color:#fff">' + x.unread + '</span>' : '') + '</div><div class="s">' + (x.last ? esc((x.last.sender_id === S.me.id ? t('You') + ': ' : '') + x.last.text).slice(0, 70) : t('No messages yet')) + '</div></div>' + (x.last ? '<div class="r mute small">' + fmtDate(x.last.created_at, 'dm') + '</div>' : '') + '</div>'; }).join('') + '</div>',
    after: async () => { if (S.chat && Date.now() - (S.chat.indexAt || 0) < 5000) return; try { await loadChatIndex(); if (cur().name === 'chat') rerender(); } catch (e) {} } };   // refresh at most every 5 s (rerender runs after() again)
};

// ---- one thread
let pollT = null;
SCREENS.thread = ({ id }) => {
  const p = myPairs().find(x => x.id === id); if (!p) return { title: t('Chat'), body: empty('chat', t('Not found')) };
  const th = (S.chat && S.chat.threads && S.chat.threads[id]) || null;
  const body = !th ? '<div class="mute">' + t('Loading…') + '</div>' : (th.list.length ? '<div class="chat">' + th.list.map((m, i) => { const day = isoDate(new Date(m.created_at)); const prev = i ? isoDate(new Date(th.list[i - 1].created_at)) : null; return (day !== prev ? '<div class="msg sys">' + fmtDate(m.created_at) + '</div>' : '') + '<div class="msg ' + (m.sender_id === S.me.id ? 'me' : 'them') + '">' + linkify(m.text) + '<span class="tm">' + fmtTime(m.created_at) + '</span></div>'; }).join('') + '</div>' : '<div class="card soft"><div class="h3">' + t('Say hi') + '</div><div class="mute">' + t('Questions, how a session went, a link to a form-check clip — it all goes here.') + '</div></div>');
  return { title: p.name, sub: S.me.role === 'coach' ? t('Client') : t('Your coach'), tabs: false, body,
    footer: '<div class="composer"><input id="msg" placeholder="' + esc(t('Write a message')) + '" autocomplete="off" maxlength="2000"><button onclick="A.sendMsg(\'' + id + '\')" aria-label="Send">' + I.send + '</button></div>',
    after: async () => {
      const inp = document.getElementById('msg'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') A.sendMsg(id); });
      if (!th) { try { await loadThread(id); } catch (e) { toast(t('Could not load — try again'), 'err'); return; } if (onThread()) rerender(); return; }
      scrollChat();
      clearInterval(pollT); pollT = setInterval(() => { if (!onThread()) { clearInterval(pollT); return; } pollThread(id); }, 8000);
    } };
};
const onThread = () => cur().name === 'thread' || cur().name === 'chat';
function scrollChat() { const b = document.getElementById('body'); if (b) b.scrollTop = b.scrollHeight; }
async function loadThread(id) {
  const list = (await db.messages(id)).reverse();
  S.chat = S.chat || {}; S.chat.threads = S.chat.threads || {}; S.chat.threads[id] = { list };
  await db.markChatRead(id, S.me.id).catch(() => {}); if (S.chat.index && S.chat.index[id]) S.chat.index[id].unread = 0;
}
async function pollThread(id) {
  const th = S.chat.threads[id]; const last = th.list.length ? th.list[th.list.length - 1].created_at : '1970-01-01';
  try { const fresh = await db.messagesSince(id, last); if (fresh.length) { fresh.forEach(m => { if (!th.list.find(x => x.id === m.id)) th.list.push(m); }); if (S.chat.index && S.chat.index[id]) S.chat.index[id].last = th.list[th.list.length - 1]; const keep = document.getElementById('msg') ? document.getElementById('msg').value : ''; rerender(); const inp = document.getElementById('msg'); if (inp) inp.value = keep; scrollChat(); db.markChatRead(id, S.me.id).catch(() => {}); } } catch (e) {}
}
A.sendMsg = async (id) => {
  const inp = document.getElementById('msg'); const text = (inp ? inp.value : '').trim(); if (!text) return;
  inp.value = '';
  try { const m = await db.sendMessage(id, S.me.id, text); S.chat.threads[id].list.push(m); if (S.chat.index && S.chat.index[id]) S.chat.index[id].last = m; rerender(); scrollChat(); const i2 = document.getElementById('msg'); if (i2) i2.focus(); }
  catch (e) { inp.value = text; toast(t('Could not send — try again'), 'err'); }
};

// ---- bell
export async function loadUnread() { try { S.unread = await db.unreadCount(S.me.id); } catch (e) {} }
SCREENS.notifs = () => {
  const list = S.notifs || null;
  const icon = k => k === 'message' ? I.chat : k === 'checkin' ? I.edit : I.cal;
  const target = n => n.kind === 'message' ? "A.openPairChat('" + n.pair_id + "')" : n.kind === 'checkin' ? "A.go('client',{id:'" + n.pair_id + "'})" : "A.setTab('" + (S.me.role === 'coach' ? 'ccal' : 'sessions') + "')";
  return { title: t('Notifications'), tabs: false, body: !list ? '<div class="mute">' + t('Loading…') + '</div>' : (list.length ? list.map(n => '<div class="notif ' + (n.read_at ? '' : 'unread') + '" style="cursor:pointer" onclick="' + target(n) + '"><div class="ic ' + (n.kind === 'message' ? '' : n.kind === 'checkin' ? 'blue' : 'amb') + '">' + icon(n.kind) + '</div><div class="grow"><div class="t" style="font-weight:600">' + esc(t(n.title)) + '</div><div class="s mute">' + esc(n.body) + '</div><div class="mute small">' + fmtDate(n.created_at) + ' ' + fmtTime(n.created_at) + '</div></div></div>').join('') : empty('bell', t('Nothing yet — messages, sessions and check-ins will show up here.'))),
    after: async () => { if (!list) { try { S.notifs = await db.notifications(S.me.id); await db.markNotificationsRead(S.me.id); S.unread = 0; } catch (e) { S.notifs = []; } if (cur().name === 'notifs') rerender(); } } };
};
A.openPairChat = (pairId) => { S.notifs = null; root('chat'); if (S.me.role === 'coach') go('thread', { id: pairId }); };

// ---- feedback (any screen → More)
A.feedbackSheet = () => sheet('<div class="h2">' + t('Tell us what you think') + '</div><div class="mute">' + t('What is confusing, missing or great? We read every note.') + '</div>' + field('', 'fb_text', '', { textarea: true, ph: t('Your note…') }) + '<button class="btn" onclick="A.sendFeedback()">' + t('Send feedback') + '</button>');
A.sendFeedback = async () => {
  const text = val('fb_text'); if (!text) return; busy(true);
  try { await db.sendFeedback(S.me.id, S.me.role || '', cur().name, text); closeSheet(); toast(t('Thank you!')); track('feedback'); }
  catch (e) { busy(false); toast(t('Could not send — try again'), 'err'); }
};
// usage stats (no personal data): screen names + role only, and only when a PostHog key is set in config.js
export function track(event, props) {
  const C = window.TUNE_CFG || {}; if (!C.posthog) return;
  try { fetch((C.posthogHost || 'https://eu.i.posthog.com') + '/capture/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: C.posthog, event, distinct_id: S.me ? S.me.id : 'anon', properties: Object.assign({ role: S.me ? S.me.role : null, lang: document.documentElement.lang }, props || {}) }) }).catch(() => {}); } catch (e) {}
}
