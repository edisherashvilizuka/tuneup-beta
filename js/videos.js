// Tune Up beta — exercise videos (24 Nov 2026, migration 0032). A short how-to video per exercise, played in the app.
//   Tune Up default (Ilia, later other partner coaches) for everyone who sees videos; a coach's own video replaces it for
//   that coach's clients. Hidden while videos_mode = test (admins, the admin list, pay testers only).
//   Coaches add one video from an exercise, or many at once: Tune guesses each video's exercise from the file name, and
//   when the name is unclear from what is said in it and from three frames; the coach confirms before anything is saved.
import { t, esc, exName, LANG } from './i18n.js';
import { SCREENS, A, I, go, rerender, toast, sheet, closeSheet, busy } from './ui.js';
import * as db from './db.js';
import { S, coachPair } from './state.js';
import { howUrl, exLine, searchEx } from './exlib.js';

const MAX_UPLOAD = 45 * 1024 * 1024;            // the bucket takes 50 MB; bigger files are made smaller in the phone first
const known = new Map();                          // exercises seen on screen (id → row), so a play button needs only the id
const urlCache = new Map();                       // signed links (path → {url, until})

// ---------------------------------------------------------------- loading + which video applies
export async function loadVideos() {
  try { S.vidOn = await db.videosOn(); } catch (e) { S.vidOn = false; }
  if (!S.vidOn) { S.vids = null; S.vidRows = []; return; }
  try { S.vidRows = (await db.exerciseVideos()) || []; } catch (e) { S.vidRows = []; }
  buildMap();
}
function preferredOwner() {
  if (!S.me) return null;
  if (S.me.role === 'coach') return S.me.id;
  const cp = coachPair && coachPair(); return cp ? cp.coach_id : null;
}
function buildMap() {
  const mine = preferredOwner(); const m = new Map();
  for (const v of S.vidRows || []) {
    if (v.owner_id && v.owner_id !== mine) continue;
    const cur = m.get(v.exercise_id);
    if (!cur || (v.owner_id && !cur.owner_id)) m.set(v.exercise_id, v);
  }
  S.vids = m;
}
export function vidOf(x) { return x && S.vidOn && S.vids ? S.vids.get(x.id) || null : null; }
function ownVid(exId) { return (S.vidRows || []).find(v => v.exercise_id === exId && v.owner_id && S.me && v.owner_id === S.me.id) || null; }
function defaultVid(exId) { return (S.vidRows || []).find(v => v.exercise_id === exId && !v.owner_id) || null; }
export function vidOwn(x) { return x ? ownVid(x.id) : null; }
export function canAddVideos() { return !!(S.vidOn && S.me && S.me.role === 'coach'); }

// one button wherever an exercise is shown: the in-app video when there is one, otherwise the "How to" link as before
export function howBtn(x, style) {
  if (!x) return '';
  known.set(x.id, x);
  if (vidOf(x)) {
    return style === 'link'
      ? '<button type="button" class="link small" onclick="event.stopPropagation();A.playEx(\'' + x.id + '\')">' + I.play + ' ' + t('Watch the video') + '</button>'
      : '<button type="button" class="vdot vid" onclick="event.stopPropagation();A.playEx(\'' + x.id + '\')" aria-label="' + esc(t('Watch the video')) + '">' + I.play + '</button>';
  }
  const u = howUrl(x); if (!u) return '';
  return style === 'link'
    ? '<a class="link small" href="' + esc(u) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + I.play + ' ' + t('How to do it') + '</a>'
    : '<a class="vdot" href="' + esc(u) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="' + esc(x.video_url ? t('Video') : t('How to do it')) + '">' + I.play + '</a>';
}
export function remember(list) { (list || []).forEach(x => { if (x && x.id) known.set(x.id, x); }); }

async function urlsFor(paths) {
  const now = Date.now(), need = paths.filter(p => p && !(urlCache.has(p) && urlCache.get(p).until > now));
  if (need.length) { const got = await db.videoUrls(need); Object.entries(got).forEach(([p, u]) => urlCache.set(p, { url: u, until: now + 50 * 60 * 1000 })); }
  const out = {}; paths.forEach(p => { if (p && urlCache.has(p)) out[p] = urlCache.get(p).url; }); return out;
}

// ---------------------------------------------------------------- the player
A.playEx = async (id) => {
  const x = known.get(id) || (S.exercises || []).find(e => e.id === id); const v = x && vidOf(x); if (!v) return;
  const who = !v.owner_id ? t('Tune Up video') : (S.me && v.owner_id === S.me.id) ? t('Your video') : t('Your coach\'s video');
  const coachRow = canAddVideos() ? '<div class="col" style="gap:8px">' + (ownVid(id)
      ? '<button class="btn sec" onclick="A.vidAdd(\'' + id + '\')">' + t('Replace my video') + '</button><button class="btn sec" onclick="A.vidRemoveAsk(\'' + id + '\')">' + t('Remove my video') + '</button>'
      : '<button class="btn sec" onclick="A.vidAdd(\'' + id + '\')">' + I.camera + ' ' + t('Add my video') + '</button><div class="mute small">' + t('Your clients then see your video instead of the Tune Up one.') + '</div>') + '</div>' : '';
  sheet('<div class="h2">' + esc(exName(x)) + '</div><div class="mute small">' + esc([exLine(x), who].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="vidbox"><video id="exvid" playsinline muted loop autoplay controls preload="auto"></video><div class="vidwait" id="exvidwait">' + t('Loading the video…') + '</div></div>' + coachRow);
  try {
    const u = await urlsFor([v.path, v.poster_path]); const el = document.getElementById('exvid'); if (!el) return;
    if (u[v.poster_path]) el.poster = u[v.poster_path];
    el.src = u[v.path]; el.addEventListener('playing', () => { const w = document.getElementById('exvidwait'); if (w) w.remove(); }, { once: true });
    el.addEventListener('error', () => { const w = document.getElementById('exvidwait'); if (w) w.textContent = t('This video could not be played on this phone.'); }, { once: true });
    const p = el.play(); if (p && p.catch) p.catch(() => {});
  } catch (e) { const w = document.getElementById('exvidwait'); if (w) w.textContent = t('Could not load the video — try again'); }
};

// ---------------------------------------------------------------- one video for one exercise (coach)
function pickFiles(multi, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*'; inp.multiple = !!multi; inp.style.display = 'none';
  inp.onchange = () => { const fs = [...(inp.files || [])]; inp.remove(); if (fs.length) cb(fs); };
  document.body.appendChild(inp); inp.click();
}
A.vidAdd = (exId) => pickFiles(false, async (fs) => {
  const x = known.get(exId) || (S.exercises || []).find(e => e.id === exId);
  sheet('<div class="h2">' + esc(exName(x)) + '</div><div class="vidprog"><div class="t" id="vidstep">' + t('Getting the video ready…') + '</div><div class="bar"><i id="vidbar" style="width:5%"></i></div></div>');
  try {
    const it = { file: fs[0] }; await prepare(it, false);
    await uploadOne(it, exId, 'own', (pct, msg) => { const b = document.getElementById('vidbar'); if (b) b.style.width = pct + '%'; const s = document.getElementById('vidstep'); if (s && msg) s.textContent = msg; });
    closeSheet(); toast(t('Video saved — your clients see it now')); rerender();
  } catch (e) { closeSheet(); toast(e && e.userMsg ? e.userMsg : t('Could not save the video — try again'), 'err'); }
});
A.vidRemoveAsk = (exId) => sheet('<div class="h2">' + t('Remove your video?') + '</div><p class="lead">' + t('Your clients see the Tune Up video for this exercise again.') + '</p>' +
  '<button class="btn danger" onclick="A.vidRemove(\'' + exId + '\')">' + t('Remove my video') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Keep it') + '</button>');
A.vidRemove = async (exId) => {
  const v = ownVid(exId); if (!v) { closeSheet(); return; } busy(true);
  try { await db.removeExerciseVideo(v); S.vidRows = S.vidRows.filter(r => r.id !== v.id); buildMap(); busy(false); closeSheet(); toast(t('Removed')); rerender(); }
  catch (e) { busy(false); toast(t('Could not remove — try again'), 'err'); }
};

// ---------------------------------------------------------------- reading a video file in the phone
function err(msg) { const e = new Error(msg); e.userMsg = msg; return e; }
function videoEl(file) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(file); let done = false;
    const fail = () => { if (done) return; done = true; URL.revokeObjectURL(url); rej(err(t('This file could not be opened as a video.'))); };
    v.onloadeddata = () => { if (done) return; done = true; res({ v, url }); }; v.onerror = fail; setTimeout(fail, 20000); v.src = url;
  });
}
function seek(v, at) { return new Promise(res => { const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); try { v.currentTime = Math.max(0, Math.min(at, (v.duration || 1) - 0.05)); } catch (e) { res(); } setTimeout(res, 4000); }); }
function grab(v, maxSide, q) {
  const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return null;
  const k = Math.min(1, maxSide / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q || 0.72);
}
function dataToBlob(d) { const [h, b] = d.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: /data:([^;]+)/.exec(h)[1] }); }
// duration, a cover picture, and (for Tune's guess) three small frames
async function prepare(it, wantFrames) {
  const f = it.file; if (!/^video\//.test(f.type || '') && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) throw err(t('Choose a video file.'));
  const { v, url } = await videoEl(f);
  try {
    it.seconds = isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null;
    await seek(v, Math.min(1, (v.duration || 2) * 0.2)); it.poster = grab(v, 640, 0.78);
    if (wantFrames) { it.frames = []; for (const k of [0.25, 0.5, 0.75]) { await seek(v, (v.duration || 3) * k); const fr = grab(v, 384, 0.6); if (fr) it.frames.push(fr.split(',')[1]); } }
    it.w = v.videoWidth; it.h = v.videoHeight;
  } finally { URL.revokeObjectURL(url); }
}
// a big phone video is played once into a smaller copy (max 1280 px, about 2.5 Mbit/s) before upload
async function shrink(it, onp) {
  const f = it.file; if (f.size <= MAX_UPLOAD) return { blob: f, type: f.type || 'video/mp4', ext: (/\.(\w+)$/.exec(f.name) || [, 'mp4'])[1].toLowerCase() };
  const canvasOk = window.MediaRecorder && HTMLCanvasElement.prototype.captureStream;
  if (!canvasOk) throw err(t('This video is too large (over 45 MB). Record it shorter or in lower quality.'));
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(x => MediaRecorder.isTypeSupported(x));
  if (!type) throw err(t('This video is too large (over 45 MB). Record it shorter or in lower quality.'));
  const { v, url } = await videoEl(f);
  try {
    const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)); const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k / 2) * 2; c.height = Math.round(v.videoHeight * k / 2) * 2;
    const g = c.getContext('2d'); const stream = c.captureStream(30);
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaElementSource(v); const dest = ac.createMediaStreamDestination(); src.connect(dest); dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr)); v.muted = false; } catch (e) { v.muted = true; }
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 }); const parts = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    let raf; const draw = () => { g.drawImage(v, 0, 0, c.width, c.height); if (v.duration) onp && onp(Math.round(v.currentTime / v.duration * 100)); raf = requestAnimationFrame(draw); };
    v.currentTime = 0; rec.start(1000); draw(); await v.play();
    await new Promise(r => { v.onended = r; }); cancelAnimationFrame(raf); rec.stop(); await stopped;
    const blob = new Blob(parts, { type: type.split(';')[0] });
    if (blob.size > 50 * 1024 * 1024) throw err(t('This video is too large (over 45 MB). Record it shorter or in lower quality.'));
    return { blob, type: type.split(';')[0], ext: type.includes('mp4') ? 'mp4' : 'webm' };
  } finally { URL.revokeObjectURL(url); }
}
async function uploadOne(it, exId, target, onp) {
  onp && onp(10, t('Getting the video ready…'));
  const out = await shrink(it, p => onp && onp(10 + Math.round(p * 0.5), t('Making the video smaller…')));
  const base = (target === 'default' ? 'default/' + exId : 'coach/' + S.me.id + '/' + exId) + '/' + Date.now();
  onp && onp(65, t('Uploading…'));
  await db.uploadVideoFile(base + '.' + out.ext, out.blob, out.type);
  let poster = '';
  if (it.poster) { try { await db.uploadVideoFile(base + '.jpg', dataToBlob(it.poster), 'image/jpeg'); poster = base + '.jpg'; } catch (e) {} }
  onp && onp(92, t('Saving…'));
  const row = await db.saveExerciseVideo({ exercise_id: exId, owner_id: target === 'default' ? null : S.me.id, path: base + '.' + out.ext, poster_path: poster, seconds: it.seconds, bytes: out.blob.size, source_name: String(it.file.name || '').slice(0, 200) });
  S.vidRows = (S.vidRows || []).filter(r => !(r.exercise_id === exId && (r.owner_id || null) === (row.owner_id || null))).concat([row]); buildMap();
  onp && onp(100, t('Done'));
  return row;
}

// ---------------------------------------------------------------- many videos at once, with Tune's guess
function clean(s) { return String(s || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.+()[\]]+/g, ' ').replace(/\b(img|vid|mov|mp4|final|copy|edit|ver|v\d+|\d+)\b/gi, ' ').replace(/\s+/g, ' ').trim(); }
function words(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1); }
function sim(a, b) { const A2 = new Set(words(a)), B = new Set(words(b)); if (!A2.size || !B.size) return 0; let n = 0; A2.forEach(w => { if (B.has(w)) n++; }); return n / Math.max(A2.size, B.size); }
const isAdm = () => !!(S.me && (S.me.role === 'admin' || S.me.isAdmin));
function candidates() { const all = S.exercises || []; return S.vb && S.vb.target === 'default' ? all.filter(x => !x.owner_id) : all.filter(x => !x.owner_id || x.owner_id === S.me.id); }
function nameGuess(fileName) {
  const q = clean(fileName); if (!q) return null; let best = null;
  for (const x of candidates()) { const s = Math.max(sim(q, x.name), sim(q, x.name_ka)); if (!best || s > best.s) best = { x, s }; }
  if (best && best.s >= 0.75) return { id: best.x.id, by: 'name' };
  const hit = searchEx(candidates(), q)[0]; if (hit && Math.max(sim(q, hit.name), sim(q, hit.name_ka)) >= 0.5) return { id: hit.id, by: 'name' };
  return null;
}
// the first 25 seconds of sound as a small WAV clip for the transcription service (skipped quietly when not possible)
async function speechOf(file) {
  if (file.size > 80 * 1024 * 1024) return '';
  try {
    const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC(); const buf = await ac.decodeAudioData(await file.arrayBuffer()); ac.close && ac.close();
    const secs = Math.min(25, buf.duration), rate = 16000; const off = new OfflineAudioContext(1, Math.ceil(secs * rate), rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0, 0, secs); const out = await off.startRendering();
    const pcm = out.getChannelData(0); let peak = 0; for (let i = 0; i < pcm.length; i += 50) peak = Math.max(peak, Math.abs(pcm[i])); if (peak < 0.02) return '';
    const dv = new DataView(new ArrayBuffer(44 + pcm.length * 2)); const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([dv.buffer], { type: 'audio/wav' })); });
    const r = await db.transcribe(b64, LANG.cur, {}); return r && typeof r.text === 'string' ? r.text : '';
  } catch (e) { return ''; }
}
async function guess(it) {
  it.state = 'checking'; vbDraw();
  try { await prepare(it, true); } catch (e) { it.state = 'bad'; it.msg = e.userMsg || t('This file could not be opened as a video.'); vbDraw(); return; }
  const g = nameGuess(it.file.name);
  if (g) { it.ex = g.id; it.by = 'name'; it.state = 'ready'; vbDraw(); return; }
  try {
    const transcript = await speechOf(it.file);
    const list = candidates(); const refs = list.map((x, i) => ({ ref: 'X' + (i + 1), name: x.name, name_ka: x.name_ka || '' }));
    const r = await db.matchVideo({ name: clean(it.file.name), transcript: transcript.slice(0, 1500), frames: it.frames || [], candidates: refs, lang: LANG.cur });
    const k = r && r.ref ? refs.findIndex(x => x.ref === r.ref) : -1;
    if (k >= 0 && (r.confidence || 0) >= 0.45) { it.ex = list[k].id; it.by = transcript ? 'speech' : 'video'; it.sure = r.confidence >= 0.75; }
    else { it.ex = null; it.newName = (r && r.new_name) || clean(it.file.name); }
  } catch (e) { it.ex = null; it.newName = clean(it.file.name); }
  it.state = 'ready'; vbDraw();
}

SCREENS.vidBulk = ({ target } = {}) => {
  const tg = target === 'default' && isAdm() ? 'default' : 'own';
  if (!S.vb || S.vb.target !== tg) S.vb = { target: tg, items: [] };
  if (!S.exercises) db.listExercises().then(x => { S.exercises = x; remember(x); rerender(); }).catch(() => {});
  const items = S.vb.items, ready = items.filter(i => i.state === 'ready' && (i.ex || i.makeNew)), checking = items.filter(i => i.state === 'checking').length;
  const intro = tg === 'default'
    ? t('These become the Tune Up video for each exercise — everyone without their own coach\'s video sees them.')
    : t('Choose all your exercise videos at once. Tune finds the exercise for each one from the file name, what you say in it and the movement itself. Check the list, fix anything wrong, then upload.');
  return { title: tg === 'default' ? t('Tune Up videos') : t('Upload my videos'), sub: items.length ? t('{n} videos', { n: items.length }) : '', body:
    '<p class="lead" style="margin:0">' + esc(intro) + '</p>' +
    '<button class="btn sec" onclick="A.vbPick()">' + I.plus + ' ' + (items.length ? t('Add more videos') : t('Choose videos')) + '</button>' +
    '<div class="col" id="vblist" style="gap:8px">' + vbRows() + '</div>' +
    (items.length ? '<button class="btn" ' + (ready.length && !checking && !S.vb.running ? '' : 'disabled') + ' onclick="A.vbUpload()">' + (checking ? t('Tune is checking the videos…') : t('Upload {n} videos', { n: ready.length })) + '</button>' : '') };
};
function vbRows() {
  const byLabel = { name: t('from the file name'), speech: t('from what is said'), video: t('from the movement') };
  return (S.vb ? S.vb.items : []).map((it, k) => {
    const x = it.ex && (S.exercises || []).find(e => e.id === it.ex);
    const thumb = it.poster ? '<img class="vthumb" src="' + it.poster + '" alt="">' : '<span class="vthumb"></span>';
    const has = x && (S.vb.target === 'default' ? defaultVid(x.id) : ownVid(x.id));
    let line;
    if (it.state === 'checking') line = '<span class="mute">' + t('Tune is checking…') + '</span>';
    else if (it.state === 'bad') line = '<span style="color:var(--a-red)">' + esc(it.msg) + '</span>';
    else if (it.state === 'up') line = '<span class="mute">' + esc(it.msg || t('Uploading…')) + '</span>';
    else if (it.state === 'done') line = '<span style="color:var(--a-green)">' + I.check + ' ' + esc(x ? exName(x) : '') + '</span>';
    else if (x) line = '<b>' + esc(exName(x)) + '</b> <span class="mute small">· ' + esc(byLabel[it.by] || '') + (it.by !== 'name' && !it.sure ? ' · ' + t('please check') : '') + (has ? ' · ' + t('replaces the current video') : '') + '</span>';
    else if (it.makeNew) line = '<b>' + esc(it.newName) + '</b> <span class="mute small">· ' + t('new exercise') + '</span>';
    else line = '<span style="color:var(--a-amber)">' + t('Not sure which exercise — choose one') + '</span>';
    const act = ['ready', 'bad'].includes(it.state) ? '<button class="btn xs sec" onclick="A.vbChange(' + k + ')">' + t('Change') + '</button><button class="btn xs sec" aria-label="' + esc(t('Remove')) + '" onclick="A.vbDrop(' + k + ')">' + I.x + '</button>' : '';
    return '<div class="card vbrow">' + thumb + '<div class="grow" style="min-width:0"><div class="s mute" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.file.name) + '</div><div class="t">' + line + '</div>' +
      (it.state === 'up' ? '<div class="bar"><i style="width:' + (it.pct || 5) + '%"></i></div>' : '') + '</div><div class="row" style="gap:6px">' + act + '</div></div>';
  }).join('');
}
function vbDraw() { rerender(); }
A.vbPick = () => pickFiles(true, async (fs) => {
  if (!S.exercises) { try { S.exercises = await db.listExercises(); remember(S.exercises); } catch (e) {} }
  const add = fs.map(f => ({ file: f, state: 'checking' })); S.vb.items = S.vb.items.concat(add); rerender();
  for (const it of add) await guess(it);   // one by one: phones keep up, and the list fills in as it goes
});
A.vbDrop = (k) => { S.vb.items.splice(k, 1); rerender(); };
A.vbChange = (k) => {
  const it = S.vb.items[k];
  sheet('<div class="h2">' + t('Which exercise is this?') + '</div><div class="mute small">' + esc(it.file.name) + '</div>' +
    '<input class="input" id="vbq" placeholder="' + esc(t('Search exercises')) + '" oninput="A.vbFind(' + k + ',this.value)" autocomplete="off">' +
    '<div class="col" id="vbres" style="gap:6px">' + vbResults(k, clean(it.file.name)) + '</div>' +
    (S.vb.target === 'own' ? '<button class="btn sec" onclick="A.vbNew(' + k + ')">' + I.plus + ' ' + t('Make it a new exercise') + '</button>' : ''));
  setTimeout(() => { const q = document.getElementById('vbq'); if (q) q.focus(); }, 50);
};
function vbResults(k, q) {
  const list = (q ? searchEx(candidates(), q) : candidates()).slice(0, 12);
  return list.map(x => '<div class="lrow" style="cursor:pointer" onclick="A.vbSet(' + k + ',\'' + x.id + '\')"><div class="grow"><div class="t">' + esc(exName(x)) + '</div><div class="s">' + esc(exLine(x) || t('My exercise')) + '</div></div>' + I.chev + '</div>').join('') || '<div class="mute small">' + t('Nothing found') + '</div>';
}
A.vbFind = (k, q) => { const el = document.getElementById('vbres'); if (el) el.innerHTML = vbResults(k, q); };
A.vbSet = (k, id) => { const it = S.vb.items[k]; it.ex = id; it.by = 'name'; it.sure = true; it.makeNew = false; it.state = it.state === 'bad' ? 'bad' : 'ready'; closeSheet(); rerender(); };
A.vbNew = (k) => {
  const it = S.vb.items[k];
  sheet('<div class="h2">' + t('New exercise') + '</div><input class="input" id="vbnn" value="' + esc(it.newName || clean(it.file.name)) + '" maxlength="80">' +
    '<button class="btn" onclick="A.vbNewOk(' + k + ')">' + t('Use this name') + '</button>');
};
A.vbNewOk = (k) => { const v = (document.getElementById('vbnn') || {}).value || ''; if (v.trim().length < 2) { toast(t('Enter a name'), 'err'); return; } const it = S.vb.items[k]; it.ex = null; it.makeNew = true; it.newName = v.trim(); it.state = 'ready'; closeSheet(); rerender(); };
A.vbUpload = async () => {
  const todo = S.vb.items.filter(i => i.state === 'ready' && (i.ex || i.makeNew)); if (!todo.length) return;
  S.vb.running = true; let ok = 0;
  for (const it of todo) {
    it.state = 'up'; it.pct = 5; vbDraw();
    try {
      if (it.makeNew && !it.ex) { const nx = await db.addExercise(S.me.id, { name: it.newName }); S.exercises = (S.exercises || []).concat([nx]); remember([nx]); it.ex = nx.id; }
      await uploadOne(it, it.ex, S.vb.target, (pct, msg) => { it.pct = pct; it.msg = msg; vbDraw(); });
      it.state = 'done'; ok++;
    } catch (e) { it.state = 'bad'; it.msg = e && e.userMsg ? e.userMsg : t('Could not upload — try again'); }
    vbDraw();
  }
  S.vb.running = false; rerender(); toast(t('{n} videos saved', { n: ok }));
};

// ---------------------------------------------------------------- the list: a coach's own videos / the Tune Up library (admin)
SCREENS.vidLib = () => {
  const admin = S.me.role === 'admin' || (isAdm() && !!S.draft.vidLibAdmin);
  if (!S.exercises) db.listExercises().then(x => { S.exercises = x; remember(x); rerender(); }).catch(() => {});
  const exs = S.exercises || []; const by = new Map(exs.map(x => [x.id, x]));
  const rows = (S.vidRows || []).filter(v => admin ? !v.owner_id : v.owner_id === S.me.id).map(v => by.get(v.exercise_id)).filter(Boolean).sort((a, b) => exName(a).localeCompare(exName(b)));
  remember(rows);
  const lib = exs.filter(x => !x.owner_id).length, filmed = (S.vidRows || []).filter(v => !v.owner_id).length;
  const head = admin
    ? '<div class="card"><div class="h3">' + esc(t('{a} of {b} exercises have a Tune Up video', { a: filmed, b: lib })) + '</div><div class="bar"><i style="width:' + (lib ? Math.round(filmed / lib * 100) : 0) + '%"></i></div></div>'
    : '<div class="card"><div class="h3">' + esc(rows.length === 1 ? t('1 video of your own') : t('{n} videos of your own', { n: rows.length })) + '</div><div class="s">' + t('Your clients see your video instead of the Tune Up one. You can also add a video from any exercise in a client\'s plan.') + '</div></div>';
  return { title: admin ? t('Tune Up videos') : t('My exercise videos'), body: head +
    '<button class="btn" onclick="A.go(\'vidBulk\',{target:\'' + (admin ? 'default' : 'own') + '\'})">' + I.plus + ' ' + t('Upload videos') + '</button>' +
    (rows.length ? '<div class="card menu">' + rows.map(x => '<div class="lrow" style="cursor:pointer" onclick="A.playEx(\'' + x.id + '\')"><div class="grow"><div class="t">' + esc(exName(x)) + '</div><div class="s">' + esc(exLine(x) || t('My exercise')) + '</div></div>' + I.play + '</div>').join('') + '</div>' : '') };
};
A.openVidLib = (asAdmin) => { S.draft.vidLibAdmin = !!asAdmin; go('vidLib'); };
