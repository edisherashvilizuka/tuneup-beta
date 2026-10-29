// Tune Up beta — sessions: trainee list (Join button for video), coach month grid + new / move / cancel.
// Weekly sessions are one row + exceptions (a moved or cancelled occurrence); occurrences are expanded here.
function gigDate(dayNum, mon, cls) { return '<div class="gig' + (cls ? ' ' + cls : '') + '"><b>' + dayNum + '</b><span>' + esc(mon) + '</span></div>'; }
import { loader } from './motion.js';
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
function joinBtn(o) { return o.s.where_kind === 'video' && /^https?:\/\//.test(o.s.place) && !o.cancelled && o.at.getTime() + o.s.minutes * 60000 > Date.now() ? '<a class="btn xs" href="' + esc(o.s.place) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + t('Join') + '</a>' : ''; }
function occRow(o, withName, tap, gig) {
  const d = o.at; const mon = fmtDate(d, 'dm').split(' ').slice(1).join(' ');
  const tile = gig ? gigDate(d.getDate(), mon, o.cancelled ? 'off' : '') : '';
  return '<div class="sess" ' + (tap ? 'style="cursor:pointer" onclick="' + tap + '"' : '') + '>' + tile + '<div class="time">' + fmtTime(o.at) + '<span class="mute small">' + o.s.minutes + ' ' + t('min') + '</span></div><div class="grow"><div class="t" style="font-weight:500' + (o.cancelled ? ';text-decoration:line-through' : '') + '">' + (withName ? esc(pairName(o.s.pair_id)) + ' · ' : '') + esc(whereLine(o.s)) + '</div><div class="s mute small">' + (o.cancelled ? '<span class="tag bad">' + t('Cancelled') + '</span> ' : o.moved ? '<span class="tag warn">' + t('Moved') + '</span> ' : '') + [o.s.repeat === 'weekly' ? t('every {day}', { day: dayName(weekdayOf(new Date(o.s.starts_at))) }) : '', esc(o.note || o.s.note || '')].filter(Boolean).join(' · ') + '</div></div>' + joinBtn(o) + (withName || o.cancelled || o.at.getTime() < Date.now() ? '' : calBtn(o)) + '</div>';
}
// ---- add one session to the phone's calendar (Apple: .ics file, Google: their "new event" page)
const CALS = {};
function calBtn(o) { const k = o.s.id + '@' + o.at.getTime(); CALS[k] = o; return '<button class="btn xs sec" onclick="event.stopPropagation();A.calSheet(\'' + k + '\')" aria-label="' + esc(t('Add to my calendar')) + '">' + I.cal + '</button>'; }
function stamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function calText(o) { const coach = (S.pair && S.pair.coach && S.pair.coach.name) || ''; return { title: 'Tune Up · ' + (coach || t('Session')), place: o.s.where_kind === 'video' ? o.s.place : (o.s.place || ''), note: o.note || o.s.note || '', start: o.at, end: new Date(o.at.getTime() + o.s.minutes * 60000) }; }
A.calSheet = (k) => { const o = CALS[k]; if (!o) return; const c = calText(o);
  const g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(c.title) + '&dates=' + stamp(c.start) + '/' + stamp(c.end) + '&location=' + encodeURIComponent(c.place) + '&details=' + encodeURIComponent(c.note);
  sheet('<div class="h2">' + t('Add to my calendar') + '</div><div class="mute">' + esc(fmtDay(isoDate(o.at))) + ' · ' + fmtTime(o.at) + ' · ' + o.s.minutes + ' ' + t('min') + '</div><div class="mute small">' + t('If your coach moves or cancels it, the app tells you — your calendar does not change by itself.') + '</div>' +
    '<button class="btn" onclick="A.calIcs(\'' + k + '\')">' + t('Apple Calendar (iPhone)') + '</button><a class="btn sec" href="' + esc(g) + '" target="_blank" rel="noopener" onclick="A.closeSheet()">' + t('Google Calendar') + '</a>'); };
A.calIcs = (k) => { const o = CALS[k]; if (!o) return; const c = calText(o); const e = x => String(x).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tune Up//beta//EN', 'BEGIN:VEVENT', 'UID:' + o.s.id + '-' + stamp(c.start) + '@tuneup', 'DTSTAMP:' + stamp(new Date()), 'DTSTART:' + stamp(c.start), 'DTEND:' + stamp(c.end), 'SUMMARY:' + e(c.title), c.place ? 'LOCATION:' + e(c.place) : '', c.note ? 'DESCRIPTION:' + e(c.note) : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  closeSheet(); location.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); };

// ---- trainee: upcoming sessions (29 Oct redesign: the next one as a hero card, then a list)
function srow(o) {
  const up = o.at.getTime() + o.s.minutes * 60000 > Date.now();
  const pill = o.cancelled ? '<span class="pill bad">' + t('Cancelled') + '</span>' : o.moved ? '<span class="pill warn">' + t('Moved') + '</span>' : '';
  const sub = [o.s.repeat === 'weekly' && !o.cancelled ? t('every {day}', { day: dayName(weekdayOf(new Date(o.s.starts_at))) }) : '', o.note || o.s.note || ''].filter(Boolean).join(' · ');
  return '<div class="srow' + (o.cancelled ? ' off' : '') + '"><div class="sdate"><b>' + esc(dayName(weekdayOf(o.at), true)) + '</b><span>' + o.at.getDate() + '</span></div><div class="grow" style="min-width:0"><div class="t"' + (o.cancelled ? ' style="text-decoration:line-through"' : '') + '>' + fmtTime(o.at) + ' · ' + esc(whereLine(o.s)) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>' + pill + (up && !o.cancelled ? joinBtn(o) || calBtn(o) : '') + '</div>';
}
function heroCard(o, today) {
  const tom = addDays(today, 1); const when = o.date === today ? t('Today') : o.date === tom ? t('Tomorrow') : fmtDay(o.date);
  const end = new Date(o.at.getTime() + o.s.minutes * 60000); const video = o.s.where_kind === 'video';
  const maps = !video && o.s.place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.s.place) : '';
  const main = joinBtn(o) ? '<a class="btn" href="' + esc(o.s.place) + '" target="_blank" rel="noopener">' + t('Join') + '</a>' : maps ? '<a class="btn" href="' + esc(maps) + '" target="_blank" rel="noopener">' + I.pin + ' ' + t('Directions') + '</a>' : '';
  const mins = (o.at.getTime() - Date.now()) / 60000; const soon = !o.cancelled && mins > -o.s.minutes && mins < 24 * 60;
  const time = '<div class="big">' + fmtTime(o.at) + ' <span>– ' + fmtTime(end) + '</span></div>';
  return '<div class="card nexts' + (video ? ' video' : '') + (soon && o.date === today ? ' soon' : '') + '"><div class="row between nx-top"><div class="eyebrow">' + t('Next session · {when}', { when }) + '</div>' + calBtn(o) + '</div>' +
    (soon ? '<div class="row cdrow"><svg class="cdring" viewBox="0 0 54 54" width="54" height="54" aria-hidden="true"><circle cx="27" cy="27" r="23" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="5"/><circle data-cdring cx="27" cy="27" r="23" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 144.5" transform="rotate(-90 27 27)"/></svg><div class="grow">' + time + '<div class="cdin" data-cd="' + o.at.toISOString() + '"></div></div></div>' : time) +
    '<div class="where">' + (video ? I.video : I.pin) + ' ' + esc(whereLine(o.s)) + (o.moved ? ' · <span class="tag warn">' + t('Moved') + '</span>' : '') + '</div>' + (o.note || o.s.note ? '<div class="mute small">' + esc(o.note || o.s.note) + '</div>' : '') +
    '<div class="btn-row">' + main + '<button class="btn sec" onclick="A.setTab(\'chat\')">' + t('Ask to move') + '</button></div></div>';
}
SCREENS.sessions = () => {
  const today = isoDate(); const list = occurrences(today, addDays(today, 27)).filter(o => !(o.cancelled && o.date < today));
  const cp = S.pair && S.pair.coach && S.pair.coach.coach_profiles; const av = cp && (Array.isArray(cp) ? cp[0] : cp); const avail = av && av.availability_text;
  let html = '';
  if (!S.cal) html = loader(t('Loading…'));
  else if (!list.length) html = empty('cal', t('No sessions planned yet — your coach adds them here.'));
  else {
    const next = list.find(o => !o.cancelled && o.at.getTime() + o.s.minutes * 60000 > Date.now());
    const rest = list.filter(o => o !== next);
    html = (next ? heroCard(next, today) : '') + (rest.length ? '<div class="section-title"><span class="eyebrow">' + t('Coming up') + '</span></div><div class="slist">' + rest.map(srow).join('') + '</div>' : '');
  }
  return { title: t('Sessions'), sub: S.pair && S.pair.coach ? t('With {name}', { name: firstName(S.pair.coach.name) }) : t('next 4 weeks'), body: html + (avail ? '<div class="card flat mute small">' + I.cal + ' ' + t('{name} is usually available: {when}', { name: firstName((S.pair.coach || {}).name), when: esc(avail) }) + '</div>' : ''),
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
  return { title: t('Calendar'), sub: S.clients && S.clients.length ? t('{n} active', { n: pairs().length }) : '', actions: '<button class="act add" onclick="A.newSession()" aria-label="New session">' + I.plus + '</button>', body:
    '<div class="row between"><button class="act" onclick="A.calMonth(-1)" aria-label="Previous">' + I.back + '</button><div class="h3">' + esc(monthName) + '</div><button class="act" onclick="A.calMonth(1)" aria-label="Next" style="transform:rotate(180deg)">' + I.back + '</button></div>' +
    '<div class="card">' + grid + '</div>' +
    '<div class="section-title"><span class="eyebrow">' + esc(fmtDay(S.calView.sel)) + '</span><span class="link" onclick="A.newSession(\'' + S.calView.sel + '\')">' + t('Add') + '</span></div>' +
    (!S.cal ? loader(t('Loading…')) : dayList.length ? dayList.map(o => occRow(o, true, 'A.sessionSheet(\'' + o.s.id + '\',\'' + (o.origDate || o.date) + '\')')).join('') : '<div class="card flat mute">' + t('Nothing planned') + '</div>'),
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
A.sesPick = (k, v, el) => {
  S.draft.ses[k === 'len' ? 'minutes' : k] = v; [...el.parentNode.children].forEach(c => c.classList.toggle('on', c === el));
  if (k === 'where') { const p = document.getElementById('s_place'), gym = (S.coachProfile && S.coachProfile.gym) || ''; if (p) { if (v === 'video' && !/^https?:/i.test(p.value)) { p.value = ''; p.placeholder = 'https://meet.google.com/…'; p.focus(); } else if (v === 'gym' && !p.value) p.value = gym; } }
};
// a session can't start in the past (a few minutes of grace for "right now")
function inPast(date, time) { return new Date(date + 'T' + time).getTime() < Date.now() - 10 * 60000; }
A.saveSession = async () => {
  const d = S.draft.ses; const date = val('s_date'), time = val('s_time'); const pairSel = document.getElementById('s_pair');
  if (!date || !time) { toast(t('Pick a date and time.'), 'err'); return; }
  if (inPast(date, time)) { toast(t('That time has already passed — pick a later one.'), 'err'); return; }
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
    '<div class="btn-row"><button class="btn" onclick="A.moveSession(\'' + id + '\',\'' + date + '\')">' + t('Move') + '</button><button class="btn danger" onclick="A.cancelSession(\'' + id + '\',\'' + date + '\',this)">' + t('Cancel session') + '</button></div>' +
    (s.repeat === 'weekly' ? '<button class="btn sec" onclick="A.stopRepeat(\'' + id + '\',\'' + date + '\')">' + t('Stop repeating after this one') + '</button>' : ''));
};
A.moveSession = async (id, date) => {
  const s = S.cal.sessions.find(x => x.id === id); const nd = val('m_date'), nt = val('m_time'); if (!nd || !nt) return;
  if (inPast(nd, nt)) { toast(t('That time has already passed — pick a later one.'), 'err'); return; }
  busy(true);
  const at = new Date(nd + 'T' + nt).toISOString();
  try {
    if (s.repeat === 'weekly') await db.addSessionException({ session_id: id, on_date: date, moved_to: at, note: val('m_note') });
    else await db.updateSession(id, { starts_at: at, status: 'planned', cancel_note: val('m_note') });
    closeSheet(); toast(t('Moved — the client is notified')); await loadSessions(); rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.cancelSession = async (id, date, el) => {
  if (el && !el.dataset.armed) { el.dataset.armed = '1'; el.textContent = t('Tap again to cancel — the client is told'); setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = t('Cancel session'); } }, 4000); return; }
  const s = S.cal.sessions.find(x => x.id === id); busy(true);
  try {
    if (s.repeat === 'weekly') await db.addSessionException({ session_id: id, on_date: date, moved_to: null, note: val('m_note') });
    else await db.updateSession(id, { status: 'cancelled', cancel_note: val('m_note') });
    closeSheet(); toast(t('Cancelled — the client is notified')); await loadSessions(); rerender();
  } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.stopRepeat = async (id, date) => { busy(true); try { await db.updateSession(id, { repeat_until: date }); closeSheet(); toast(t('Saved')); await loadSessions(); rerender(); } catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); } };
