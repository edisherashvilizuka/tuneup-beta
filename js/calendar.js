// Tune Up beta — sessions: trainee list (Join button for video), coach month grid + new / move / cancel.
// Weekly sessions are one row + exceptions (a moved or cancelled occurrence); occurrences are expanded here.
import { t, esc, fmtDate, fmtTime, firstName, isoDate, addDays, dayName, weekdayOf, fmtDay } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, sheet, closeSheet, field, val, busy, empty } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

function pairs() { return S.me.role === 'coach' ? (S.clients || []).filter(c => c.status === 'active') : (S.pair && S.pair.status === 'active' ? [S.pair] : []); }
function pairName(id) { const c = (S.clients || []).find(x => x.id === id); return c ? c.trainee.name : (S.pair && S.pair.coach ? S.pair.coach.name : ''); }
export async function loadSessions() {
  const ids = pairs().map(p => p.id); S.cal = { sessions: [], exceptions: [] };
  if (!ids.length) return;
  S.cal.sessions = await db.sessionsFor(ids);
  S.cal.exceptions = await db.sessionExceptions(S.cal.sessions.filter(s => s.repeat === 'weekly').map(s => s.id));
}
// occurrences between two local dates (inclusive), sorted
export function occurrences(from, to) {
  const out = [];
  for (const s of (S.cal ? S.cal.sessions : [])) {
    const start = new Date(s.starts_at);
    if (s.repeat !== 'weekly') { const d = isoDate(start); if (d >= from && d <= to) out.push({ s, at: start, date: d, cancelled: s.status === 'cancelled', note: s.cancel_note }); continue; }
    if (s.status === 'cancelled') continue;
    for (let i = 0; i < 60; i++) {
      const at = new Date(start); at.setDate(at.getDate() + 7 * i); const d = isoDate(at);
      if (d > to || (s.repeat_until && d > s.repeat_until)) break;
      if (d < from) continue;
      const ex = S.cal.exceptions.find(e => e.session_id === s.id && e.on_date === d);
      if (ex && !ex.moved_to) out.push({ s, at, date: d, cancelled: true, note: ex.note, ex });
      else if (ex) { const m = new Date(ex.moved_to); out.push({ s, at: m, date: isoDate(m), moved: true, note: ex.note, ex, origDate: d }); }
      else out.push({ s, at, date: d, ex: null, origDate: d });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
function whereLine(s) { return s.where_kind === 'video' ? t('Video call') : (s.place || t('In person')); }
function joinBtn(o) { return o.s.where_kind === 'video' && /^https?:\/\//.test(o.s.place) && !o.cancelled ? '<a class="btn xs" href="' + esc(o.s.place) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + t('Join') + '</a>' : ''; }
function occRow(o, withName, tap) {
  return '<div class="sess" ' + (tap ? 'style="cursor:pointer" onclick="' + tap + '"' : '') + '><div class="time">' + fmtTime(o.at) + '<span class="mute small">' + o.s.minutes + ' ' + t('min') + '</span></div><div class="grow"><div class="t" style="font-weight:500' + (o.cancelled ? ';text-decoration:line-through' : '') + '">' + (withName ? esc(pairName(o.s.pair_id)) + ' · ' : '') + esc(whereLine(o.s)) + '</div><div class="s mute small">' + (o.cancelled ? '<span class="tag bad">' + t('Cancelled') + '</span> ' : o.moved ? '<span class="tag warn">' + t('Moved') + '</span> ' : '') + [o.s.repeat === 'weekly' ? t('every {day}', { day: dayName(weekdayOf(new Date(o.s.starts_at))) }) : '', esc(o.note || o.s.note || '')].filter(Boolean).join(' · ') + '</div></div>' + joinBtn(o) + '</div>';
}

// ---- trainee: upcoming sessions
SCREENS.sessions = () => {
  const today = isoDate(); const list = occurrences(today, addDays(today, 27)).filter(o => !(o.cancelled && o.date < today));
  const cp = S.pair && S.pair.coach && S.pair.coach.coach_profiles; const av = cp && (Array.isArray(cp) ? cp[0] : cp); const avail = av && av.availability_text;
  let html = '';
  if (!S.cal) html = '<div class="mute">' + t('Loading…') + '</div>';
  else if (!list.length) html = empty('cal', t('No sessions planned yet — your coach adds them here.'));
  else { let last = ''; list.forEach(o => { if (o.date !== last) { html += '<div class="section-title"><span class="eyebrow">' + (o.date === today ? t('Today') + ' · ' : '') + esc(fmtDay(o.date)) + '</span></div>'; last = o.date; } html += occRow(o, false); }); }
  return { title: t('Sessions'), sub: t('next 4 weeks'), body: html + (avail ? '<div class="card flat mute small">' + I.cal + ' ' + t('{name} is usually available: {when}', { name: firstName((S.pair.coach || {}).name), when: esc(avail) }) + '</div>' : ''),
    after: async () => { if (!S.cal) { try { await loadSessions(); } catch (e) {} rerender(); } } };
};

// ---- coach: month grid + day list
SCREENS.ccal = () => {
  const today = isoDate(); S.calView = S.calView || { month: today.slice(0, 7), sel: today };
  const [y, m] = S.calView.month.split('-').map(Number); const first = new Date(y, m - 1, 1); const days = new Date(y, m, 0).getDate();
  const from = S.calView.month + '-01', to = S.calView.month + '-' + String(days).padStart(2, '0');
  const occ = S.cal ? occurrences(from, to) : [];
  const lead = (first.getDay() + 6) % 7;
  let grid = '<div class="cal">' + [1, 2, 3, 4, 5, 6, 7].map(d => '<div class="dn">' + dayName(d, true) + '</div>').join('');
  for (let i = 0; i < lead; i++) grid += '<div></div>';
  for (let d = 1; d <= days; d++) { const iso = S.calView.month + '-' + String(d).padStart(2, '0'); const n = occ.filter(o => o.date === iso && !o.cancelled).length; grid += '<div class="d ' + (iso === today ? 'today' : '') + (iso === S.calView.sel ? ' sel' : '') + '" onclick="A.calSel(\'' + iso + '\')">' + d + (n ? '<div class="dots">' + '<i></i>'.repeat(Math.min(n, 3)) + '</div>' : '') + '</div>'; }
  grid += '</div>';
  const dayList = occ.filter(o => o.date === S.calView.sel);
  const monthName = fmtDate(first, 'dm').split(' ')[1] + ' ' + y;
  return { title: t('Calendar'), sub: S.clients && S.clients.length ? t('{n} active', { n: pairs().length }) : '', actions: '<button class="act" onclick="A.newSession()" aria-label="New session">' + I.plus + '</button>', body:
    '<div class="row between"><button class="act" onclick="A.calMonth(-1)" aria-label="Previous">' + I.back + '</button><div class="h3">' + esc(monthName) + '</div><button class="act" onclick="A.calMonth(1)" aria-label="Next" style="transform:rotate(180deg)">' + I.back + '</button></div>' +
    '<div class="card">' + grid + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + esc(fmtDay(S.calView.sel)) + '</span><span class="link" onclick="A.newSession(\'' + S.calView.sel + '\')">' + t('Add') + '</span></div>' +
    (!S.cal ? '<div class="mute">' + t('Loading…') + '</div>' : dayList.length ? dayList.map(o => occRow(o, true, 'A.sessionSheet(\'' + o.s.id + '\',\'' + (o.origDate || o.date) + '\')')).join('') : '<div class="card flat mute">' + t('Nothing planned') + '</div>'),
    after: async () => { if (!S.cal) { try { await loadSessions(); } catch (e) {} rerender(); } } };
};
A.calSel = (iso) => { S.calView.sel = iso; rerender(); };
A.calMonth = (n) => { const [y, m] = S.calView.month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); S.calView.month = isoDate(d).slice(0, 7); S.calView.sel = S.calView.month + '-01'; rerender(); };

// ---- new session
A.newSession = (date) => {
  const cs = pairs(); if (!cs.length) { toast(t('No clients yet'), 'err'); return; }
  S.draft.ses = { where: 'gym', repeat: 'none', pair: cs[0].id };
  sheet('<div class="h2">' + t('New session') + '</div>' +
    (cs.length > 1 ? '<div class="field"><label>' + t('Client') + '</label><select class="input" id="s_pair">' + cs.map(c => '<option value="' + c.id + '">' + esc(c.trainee.name) + '</option>').join('') + '</select></div>' : '<div class="mute">' + esc(cs[0].trainee.name) + '</div>') +
    '<div class="input-row">' + field(t('Date'), 's_date', date || (S.calView ? S.calView.sel : isoDate()), { type: 'date' }) + field(t('Time'), 's_time', '18:00', { type: 'time' }) + '</div>' +
    '<div class="field"><label>' + t('Length') + '</label><div class="chips" id="s_len">' + [30, 45, 60, 90].map(n => '<button class="chip ' + (n === 60 ? 'on' : '') + '" onclick="A.sesPick(\'len\',' + n + ',this)">' + n + ' ' + t('min') + '</button>').join('') + '</div></div>' +
    '<div class="field"><label>' + t('Where') + '</label><div class="chips" id="s_where"><button class="chip on" onclick="A.sesPick(\'where\',\'gym\',this)">' + t('Gym / in person') + '</button><button class="chip" onclick="A.sesPick(\'where\',\'video\',this)">' + t('Video call') + '</button></div></div>' +
    field(t('Place or video link'), 's_place', (S.coachProfile && S.coachProfile.gym) || '', { ph: t('e.g. Fitness One, or https://meet.google.com/…') }) +
    '<div class="field"><label>' + t('Repeat') + '</label><div class="chips" id="s_rep"><button class="chip on" onclick="A.sesPick(\'repeat\',\'none\',this)">' + t('One time') + '</button><button class="chip" onclick="A.sesPick(\'repeat\',\'weekly\',this)">' + t('Every week') + '</button></div></div>' +
    field(t('Note (optional)'), 's_note', '', { ph: t('e.g. bring your running shoes') }) +
    '<button class="btn" onclick="A.saveSession()">' + t('Add session') + '</button>');
};
A.sesPick = (k, v, el) => { S.draft.ses[k === 'len' ? 'minutes' : k] = v; [...el.parentNode.children].forEach(c => c.classList.toggle('on', c === el)); };
A.saveSession = async () => {
  const d = S.draft.ses; const date = val('s_date'), time = val('s_time'); const pairSel = document.getElementById('s_pair');
  if (!date || !time) { toast(t('Pick a date and time.'), 'err'); return; }
  const place = val('s_place'); if (d.where === 'video' && !/^https?:\/\//.test(place)) { toast(t('Paste the video link (starts with https://).'), 'err'); return; }
  busy(true);
  try {
    await db.addSession({ pair_id: pairSel ? pairSel.value : d.pair, starts_at: new Date(date + 'T' + time).toISOString(), minutes: d.minutes || 60, where_kind: d.where, place, note: val('s_note'), repeat: d.repeat, created_by: S.me.id });
    closeSheet(); toast(t('Session added')); await loadSessions(); if (S.calView) { S.calView.sel = date; S.calView.month = date.slice(0, 7); } rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// ---- move / cancel one session (or one occurrence of a weekly one)
A.sessionSheet = (id, date) => {
  const s = S.cal.sessions.find(x => x.id === id); if (!s) return; const o = occurrences(date, addDays(date, 7)).find(x => x.s.id === id) || { s, at: new Date(s.starts_at) };
  sheet('<div class="h2">' + esc(pairName(s.pair_id)) + '</div><div class="lead">' + esc(fmtDay(o.date || date)) + ' · ' + fmtTime(o.at) + ' · ' + s.minutes + ' ' + t('min') + '</div><div class="mute">' + esc(whereLine(s)) + (s.repeat === 'weekly' ? ' · ' + t('every {day}', { day: dayName(weekdayOf(new Date(s.starts_at))) }) : '') + '</div>' +
    (o.cancelled ? '<div class="tag bad" style="align-self:flex-start">' + t('Cancelled') + '</div>' : '') +
    '<div class="input-row">' + field(t('Move to'), 'm_date', o.date || date, { type: 'date' }) + field(t('Time'), 'm_time', fmtTime(o.at), { type: 'time' }) + '</div>' +
    field(t('Note to the client (optional)'), 'm_note', '', { ph: t('e.g. gym closed that day') }) +
    '<div class="btn-row"><button class="btn" onclick="A.moveSession(\'' + id + '\',\'' + date + '\')">' + t('Move') + '</button><button class="btn danger" onclick="A.cancelSession(\'' + id + '\',\'' + date + '\')">' + t('Cancel session') + '</button></div>' +
    (s.repeat === 'weekly' ? '<button class="btn sec" onclick="A.stopRepeat(\'' + id + '\',\'' + date + '\')">' + t('Stop repeating after this one') + '</button>' : ''));
};
A.moveSession = async (id, date) => {
  const s = S.cal.sessions.find(x => x.id === id); const nd = val('m_date'), nt = val('m_time'); if (!nd || !nt) return; busy(true);
  const at = new Date(nd + 'T' + nt).toISOString();
  try {
    if (s.repeat === 'weekly') await db.addSessionException({ session_id: id, on_date: date, moved_to: at, note: val('m_note') });
    else await db.updateSession(id, { starts_at: at, status: 'planned', cancel_note: val('m_note') });
    closeSheet(); toast(t('Moved — the client is notified')); await loadSessions(); rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.cancelSession = async (id, date) => {
  const s = S.cal.sessions.find(x => x.id === id); busy(true);
  try {
    if (s.repeat === 'weekly') await db.addSessionException({ session_id: id, on_date: date, moved_to: null, note: val('m_note') });
    else await db.updateSession(id, { status: 'cancelled', cancel_note: val('m_note') });
    closeSheet(); toast(t('Cancelled — the client is notified')); await loadSessions(); rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.stopRepeat = async (id, date) => { busy(true); try { await db.updateSession(id, { repeat_until: date }); closeSheet(); toast(t('Saved')); await loadSessions(); rerender(); } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); } };
