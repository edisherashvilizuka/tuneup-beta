// Tune Up beta — "Tune", the in-app assistant: answers from the person's own data AND does things by chat.
// Flow per question: save the question → rebuild what Tune knows (tunectx.js) → the `tune` Edge Function → each
// returned action is prepared (tuneact.js); INSTANT ones run at once, the rest wait on a card with Yes / No → the
// reply and the action states are saved. The conversation is kept in `tune_messages` (only its owner can read it).
import { t, esc, LANG, firstName } from './i18n.js';
import { SCREENS, A, I, rerender, toast, cur } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';
import { track } from './chat.js';
import { loadTuneData, traineeContext, coachContext } from './tunectx.js';
import { prepare, run } from './tuneact.js';

const STALE_MS = 2 * 3600 * 1000;           // a proposal older than this (or followed by a newer question) can no longer be confirmed
function tuneState() { S.tune = S.tune || { msgs: [], busy: false, loaded: false }; return S.tune; }
function clientName(pairId) { const c = (S.clients || []).find(x => x.id === pairId); return c ? c.trainee.name : ''; }
export function resetTune() { S.tune = null; }

// ---- what the model sees of earlier turns: the text plus what really happened to its actions
const STATE_WORD = { auto: 'done', done: 'done', pending: 'waiting for Yes/No', declined: 'declined by the user', failed: 'failed', invalid: 'could not be prepared', expired: 'expired, not done' };
function forModel(m) {
  const notes = (m.actions || []).map(a => '[' + (STATE_WORD[a.status] || a.status) + ': ' + a.sum + (a.err ? ' — ' + a.err : '') + ']');
  return { role: m.role, content: ((m.content || '').trim() || '…') + (notes.length ? '\n' + notes.join('\n') : '') };
}
function lastAssistantId(st) { for (let i = st.msgs.length - 1; i >= 0; i--) if (st.msgs[i].role === 'assistant') return st.msgs[i].id; return null; }
function liveCard(st, m, a) { return a.status === 'pending' && m.id === lastAssistantId(st) && st.msgs[st.msgs.length - 1] === m && Date.now() - new Date(m.created_at || Date.now()).getTime() < STALE_MS; }

// ---- the screen
let EXAMPLES = [];
function examples(name) {
  if (S.me.role !== 'coach') return [t('What is left to eat today?'), t('I ate two eggs and a toast'), t('Tell my coach I will be 10 minutes late'), t('Remove the last meal I logged')];
  if (name) return [t('How is {name}’s week going?', { name: firstName(name) }), t('Build {name} a 3-day plan', { name: firstName(name) }), t('Move {name}’s next session one hour later', { name: firstName(name) })];
  return [t('Who needs attention today?'), t('Who missed a workout this week?'), t('Send everyone a reminder to log their water')];
}
A.tuneExample = (i, client) => { const inp = document.getElementById('tq'); if (!inp || !EXAMPLES[i]) return; inp.value = EXAMPLES[i]; A.askTune(client); };
const ICON = { check: I.check, x: I.x, chat: I.chat, cal: I.cal, plan: I.plan, edit: I.edit, mail: I.mail, chart: I.chart };
function card(st, m, a, i) {
  const live = liveCard(st, m, a); const status = a.status === 'pending' && !live ? 'expired' : a.status;
  const tag = { auto: '<span class="tag ok">' + t('Done') + '</span>', done: '<span class="tag ok">' + t('Done') + '</span>', declined: '<span class="tag">' + t('Not done') + '</span>', expired: '<span class="tag">' + t('Not done') + '</span>', failed: '<span class="tag bad">' + t('Failed') + '</span>', invalid: '<span class="tag bad">' + t('Could not prepare this') + '</span>', pending: '' }[status] || '';
  const c = a.card || {};
  return '<div class="tcard ' + status + '"><div class="tc-h"><span class="tc-i">' + (ICON[c.icon] || I.check) + '</span><span class="grow">' + esc(c.title || a.name) + '</span>' + tag + '</div>' +
    (c.body ? '<div class="tc-b">' + esc(c.body) + '</div>' : '') +
    (a.err ? '<div class="tc-e">' + esc(a.err) + '</div>' : '') +
    (live ? (c.who ? '<div class="tc-w">' + esc(c.who) + '</div>' : '') + '<div class="btn-row"><button class="btn sm" onclick="A.tuneYes(\'' + m.id + '\',' + i + ',this)">' + t('Yes') + '</button><button class="btn sec sm" onclick="A.tuneNo(\'' + m.id + '\',' + i + ')">' + t('No') + '</button></div>' : '') + '</div>';
}
function bubble(st, m) {
  const acts = (m.actions || []).map((a, i) => card(st, m, a, i)).join('');
  const pend = (m.actions || []).filter((a, i) => liveCard(st, m, a)).length;
  return (m.content && !(m.content === '…' && (m.actions || []).length) ? '<div class="msg ' + (m.role === 'user' ? 'me' : 'them') + '">' + esc(m.content).replace(/\n/g, '<br>') + '</div>' : '') + acts +
    (pend > 1 ? '<button class="btn sm tc-all" onclick="A.tuneYesAll(\'' + m.id + '\',this)">' + t('Yes to all ({n})', { n: pend }) + '</button>' : '');
}
SCREENS.tune = (params) => {
  const st = tuneState(); const client = params && params.client; const name = client ? clientName(client) : '';
  const intro = S.me.role === 'coach' ? t('Ask how your clients are doing — or tell me what to do: message a client, plan or move sessions, build a plan, set targets and goals. I ask you before anything reaches a client.') : t('Ask about your plan and your day — or tell me what to do: log food, tick exercises, write to your coach, update your answers. I ask you before anything is sent.');
  const ex = st.msgs.length ? [] : examples(name); EXAMPLES = ex;
  const exHtml = ex.length ? '<div class="chips tune-ex">' + ex.map((q, i) => '<button class="chip" onclick="A.tuneExample(' + i + (client ? ",'" + client + "'" : '') + ')">' + esc(q) + '</button>').join('') + '</div>' : '';
  const saved = '<div class="tune-saved mute small">' + I.shield + '<span class="grow">' + t('Saved in your account — only you see this conversation.') + '</span>' + (st.msgs.length ? '<span class="link" onclick="A.tuneClear(this)">' + t('Clear') + '</span>' : '') + '</div>';
  const body = '<div class="chat">' + (st.loaded ? saved : '') + '<div class="msg them">' + esc(intro) + '</div>' + exHtml + st.msgs.map(m => bubble(st, m)).join('') +
    (!st.loaded ? '<div class="msg them mute">' + t('Loading…') + '</div>' : '') + (st.busy ? '<div class="msg them mute">' + t('Tune is thinking…') + '</div>' : '') + '</div>';
  return { title: 'Tune', sub: name ? t('about {name}', { name: firstName(name) }) : t('Your assistant'), tabs: false, body,
    footer: '<div class="composer"><input id="tq" placeholder="' + esc(t('Write to Tune')) + '" autocomplete="off" maxlength="1000"><button onclick="A.askTune(' + (client ? "'" + client + "'" : '') + ')" aria-label="Send">' + I.send + '</button></div>',
    after: async () => {
      const inp = document.getElementById('tq'); if (inp) { inp.addEventListener('keydown', e => { if (e.key === 'Enter') A.askTune(client); }); if (!st.busy && st.msgs.length && st.focusInput) { inp.focus(); st.focusInput = false; } }
      const b = document.getElementById('body'); if (b) b.scrollTop = b.scrollHeight;
      if (!st.loaded && !st.loading) { st.loading = true; try { st.msgs = (await db.tuneHistory(60)).reverse(); } catch (e) { st.msgs = []; } st.loaded = true; st.loading = false; if (cur().name === 'tune') rerender(); }
    } };
};

function summary(done) { return done.map(a => (a.card && a.card.title) || a.name).join(', '); }
async function saveActions(m) { if (!m.id || String(m.id).startsWith('local')) return; try { await db.setTuneActions(m.id, m.actions); } catch (e) {} }
async function saveMsg(role, content, actions) { try { return await db.saveTuneMsg(role, content, actions); } catch (e) { return { id: 'local' + Date.now() + Math.random(), role, content, actions: actions || [], created_at: new Date().toISOString() }; } }

A.askTune = async (client) => {
  const st = tuneState(); const inp = document.getElementById('tq'); const q = (inp ? inp.value : '').trim(); if (!q || st.busy || !st.loaded) return;
  inp.value = ''; st.busy = true; st.focusInput = true;
  st.msgs.push({ id: 'local-q', role: 'user', content: q, actions: [], created_at: new Date().toISOString() }); rerender();
  const um = await saveMsg('user', q); st.msgs[st.msgs.length - 1] = um;
  let reply;
  try {
    const D = await loadTuneData(S.me.role === 'coach' ? client : null);
    const ctx = S.me.role === 'coach' ? coachContext(D) : traineeContext(D);
    const res = await db.askTune({ context: ctx.text, lang: LANG.cur, messages: st.msgs.slice(-12).map(forModel) });
    const acts = (res.actions || []).map(a => prepare(a, ctx.refs));
    for (const a of acts) if (a.status === 'auto') { try { await run(a); } catch (e) { a.status = 'failed'; a.err = e.message; } }
    const done = acts.filter(a => a.status === 'auto');
    const text = (res.text || '').trim() || (done.length ? t('Done') + ': ' + summary(done) : acts.length ? '' : t('Tune could not answer — try again'));
    reply = await saveMsg('assistant', text || '…', acts); reply.content = text;
    track('tune', { role: S.me.role, actions: acts.length, auto: done.length, pending: acts.filter(a => a.status === 'pending').length });
    if (done.length) toast(t('Done') + ': ' + summary(done));
  } catch (e) { reply = { id: 'local' + Date.now(), role: 'assistant', content: (e && e.message) || t('Tune could not answer — try again'), actions: [], created_at: new Date().toISOString(), failed: true }; }
  st.msgs.push(reply); if (st.msgs.length > 80) st.msgs = st.msgs.slice(-80);
  st.busy = false; if (cur().name === 'tune') rerender();
};

function findAct(id, i) { const st = tuneState(); const m = st.msgs.find(x => x.id === id); return m && m.actions && m.actions[i] ? { st, m, a: m.actions[i] } : null; }
async function confirmOne(f) {
  if (!liveCard(f.st, f.m, f.a)) return false;
  f.a.status = 'running';
  try { await run(f.a); f.a.status = 'done'; f.a.err = ''; } catch (e) { f.a.status = 'failed'; f.a.err = e.message; }
  return f.a.status === 'done';
}
A.tuneYes = async (id, i, el) => {
  const f = findAct(id, i); if (!f || f.a.status !== 'pending') return; if (el) el.disabled = true;
  const ok = await confirmOne(f); await saveActions(f.m); rerender();
  toast(ok ? t('Done') + ': ' + ((f.a.card && f.a.card.title) || '') : f.a.err || t('Could not save — try again'), ok ? '' : 'err'); track('tune_confirm', { name: f.a.name, ok });
};
A.tuneYesAll = async (id, el) => {
  const st = tuneState(); const m = st.msgs.find(x => x.id === id); if (!m) return; if (el) el.disabled = true; let n = 0, bad = 0;
  for (let i = 0; i < m.actions.length; i++) if (m.actions[i].status === 'pending') { (await confirmOne({ st, m, a: m.actions[i] })) ? n++ : bad++; }
  await saveActions(m); rerender(); toast(bad ? t('{n} done, {m} failed', { n, m: bad }) : t('Done'), bad ? 'err' : ''); track('tune_confirm', { name: 'all', ok: !bad });
};
A.tuneNo = async (id, i) => { const f = findAct(id, i); if (!f || f.a.status !== 'pending') return; f.a.status = 'declined'; await saveActions(f.m); rerender(); };
A.tuneClear = async (el) => {
  if (el && !el.dataset.armed) { el.dataset.armed = '1'; el.textContent = t('Tap again to clear'); setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = t('Clear'); } }, 4000); return; }
  try { await db.clearTune(S.me.id); const st = tuneState(); st.msgs = []; rerender(); toast(t('Conversation cleared')); } catch (e) { toast(t('Could not clear — try again'), 'err'); }
};
export function tuneButton(client) { return '<button class="act" onclick="A.go(\'tune\'' + (client ? ",{client:'" + client + "'}" : '') + ')" aria-label="Tune">' + I.spark + '</button>'; }
