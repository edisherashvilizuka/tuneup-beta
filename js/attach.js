// Tune Up beta — photos, files and voice notes for every composer (chat, Tune) and, later, every text field.
// A composer keeps a small list of PENDING files (shrunk in the phone, not yet uploaded); sending uploads them to the
// private bucket and stores {path, name, type, size, w, h} on the message. Pictures in a thread are shown through
// short-lived signed links. Voice: the phone records (MediaRecorder), the clip goes to the `transcribe` function and
// the words land in the field — the audio itself is never stored. Where the function is off, the phone's own speech
// recognition is used when the browser has it.
import { t, esc, LANG } from './i18n.js';
import { A, I, toast, track } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

export const MAX_FILES = 4, MAX_BYTES = 10 * 1024 * 1024, TUNE_PDF_BYTES = 5 * 1024 * 1024, IMG_MAX = 1600, IMG_Q = 0.82;
const PEND = {};                                   // composer id → pending files
export const pending = id => (PEND[id] = PEND[id] || []);
export function clearPending(id) { PEND[id] = []; }
// pending files belong to one conversation (one client's chat, Tune about one client): a new conversation starts empty
const SCOPE = {};
export function scopePending(id, key) { if (SCOPE[id] !== key) { if (SCOPE[id] !== undefined) PEND[id] = []; SCOPE[id] = key; } }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const isImg = type => /^image\//.test(type || '');
const extOf = (type, name) => isImg(type) ? (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg') : (String(name || '').split('.').pop() || 'bin').toLowerCase().slice(0, 5);
export const fmtSize = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (Math.round(n / 1024 / 1024 * 10) / 10) + ' MB';

// ---- picking: a hidden <input type=file> per composer; pictures are shrunk here, PDFs go as they are
export function pickHtml(id, opts) {
  const o = opts || {};
  return '<input type="file" id="' + id + '_file" accept="' + (o.accept || 'image/*,application/pdf') + '" ' + (o.multiple === false ? '' : 'multiple ') + 'style="display:none" onchange="A.attPick(\'' + id + '\',this)">';
}
A.attPick = async (id, input) => {
  const files = Array.from(input.files || []); input.value = ''; if (!files.length) return;
  const list = pending(id);
  for (const f of files) {
    if (list.length >= MAX_FILES) { toast(t('Up to {n} files per message', { n: MAX_FILES }), 'err'); break; }
    try { list.push(await prepare(f, id)); } catch (e) { toast(e.message || t('Could not read the file'), 'err'); }
  }
  renderPending(id); A.attChanged && A.attChanged(id);
};
A.attDrop = (id, i) => { pending(id).splice(i, 1); renderPending(id); A.attChanged && A.attChanged(id); };
async function prepare(file, id) {
  const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
  if (!isImg(type) && type !== 'application/pdf') throw new Error(t('Photos and PDF files only'));
  if (isImg(type)) {
    const r = await shrink(file, IMG_MAX, IMG_Q);
    return { id: uid(), blob: r.blob, type: 'image/jpeg', name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', size: r.blob.size, w: r.w, h: r.h, preview: r.dataUrl };
  }
  if (file.size > MAX_BYTES) throw new Error(t('Files up to 10 MB'));
  if (id === 'tq' && file.size > TUNE_PDF_BYTES) throw new Error(t('Tune reads PDF files up to 5 MB'));   // the Tune function refuses bigger ones
  return { id: uid(), blob: file, type: 'application/pdf', name: file.name || 'file.pdf', size: file.size, w: 0, h: 0, preview: '' };
}
// a picture → JPEG at most `max` px on the long side (the phone does this; nothing big ever leaves it)
export function shrink(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', q);
      c.toBlob(b => b ? res({ blob: b, w: c.width, h: c.height, dataUrl }) : rej(new Error(t('Could not read the photo'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(t('Could not read the photo'))); }; img.src = url;
  });
}
export const dataUrlOf = f => f.preview ? Promise.resolve(f.preview) : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read')); r.readAsDataURL(f.blob); });

// ---- the pending strip above a composer
export function pendingHtml(id) {
  const list = pending(id); if (!list.length) return '';
  return list.map((f, i) => '<span class="pend">' + (f.preview ? '<img src="' + f.preview + '" alt="">' : '<span class="pfile">' + I.file + '</span>') + '<span class="pn">' + esc(f.name) + '</span><button type="button" class="px" onclick="A.attDrop(\'' + id + '\',' + i + ')" aria-label="' + esc(t('Remove')) + '">' + I.x + '</button></span>').join('');
}
export function renderPending(id) { const el = document.getElementById(id + '_pend'); if (el) { el.innerHTML = pendingHtml(id); el.style.display = pending(id).length ? '' : 'none'; } }

// ---- upload at send time → the rows stored on the message
export async function uploadPending(id, prefix) {
  const list = pending(id); const out = [];
  for (const f of list) {
    const path = prefix + '/' + f.id + '.' + extOf(f.type, f.name);
    await db.uploadAttachment(path, f.blob, f.type);
    out.push({ path, name: f.name, type: f.type, size: f.size, w: f.w, h: f.h });
  }
  return out;
}

// ---- showing attachments in a thread: signed links, fetched once per hour per file
const URLS = {}; let urlT = 0;
export async function resolveUrls(messages) {
  const paths = []; messages.forEach(m => (m.attachments || []).forEach(a => { if (a.path && !(URLS[a.path] && URLS[a.path].until > Date.now())) paths.push(a.path); }));
  if (!paths.length) return false;
  try { const got = await db.signedUrls([...new Set(paths)]); Object.keys(got).forEach(p => { URLS[p] = { url: got[p], until: Date.now() + 50 * 60 * 1000 }; }); return true; } catch (e) { return false; }
}
export const urlOf = path => (URLS[path] && URLS[path].url) || '';
export function attHtml(atts) {
  if (!atts || !atts.length) return '';
  return '<div class="atts">' + atts.map(a => {
    const u = urlOf(a.path);
    if (isImg(a.type)) return u ? '<a href="' + u + '" target="_blank" rel="noopener" class="att img"><img src="' + u + '" alt="' + esc(a.name || '') + '" loading="lazy"' + (a.w && a.h ? ' style="aspect-ratio:' + a.w + '/' + a.h + '"' : '') + '></a>' : '<span class="att img ph">' + I.camera + '</span>';
    return '<a ' + (u ? 'href="' + u + '" target="_blank" rel="noopener"' : '') + ' class="att file">' + I.file + '<span class="grow"><span class="n">' + esc(a.name || 'file') + '</span><span class="s">' + fmtSize(a.size || 0) + '</span></span></a>';
  }).join('') + '</div>';
}

// ---- the composer: [📎] [🎤] [ input ] [send]
export function composerHtml(id, opts) {
  const o = opts || {};
  return '<div class="pend-row" id="' + id + '_pend" style="display:none"></div>' +
    '<div class="composer"><button type="button" class="side" onclick="document.getElementById(\'' + id + '_file\').click()" aria-label="' + esc(t('Attach a photo or file')) + '">' + I.clip + '</button>' +
    '<button type="button" class="side" id="' + id + '_mic" onclick="A.voice(\'' + id + '\')" aria-label="' + esc(t('Voice note')) + '">' + I.mic + '</button>' +
    '<input id="' + id + '" placeholder="' + esc(o.placeholder || '') + '" autocomplete="off" maxlength="' + (o.maxlength || 2000) + '">' +
    '<button type="button" onclick="' + o.send + '" aria-label="' + esc(t('Send')) + '">' + I.send + '</button></div>' + pickHtml(id, o);
}

// ---- voice notes: record on the phone → words into the field
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const MR = window.MediaRecorder || null;
let rec = null, recId = null, recT = null, chunks = [], stream = null, sr = null;
export const voiceAvailable = () => !!((MR && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || SR);
const MAX_MS = 60000;
function mime() { for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']) if (MR && MR.isTypeSupported && MR.isTypeSupported(m)) return m; return ''; }
function micBtn(id) { return document.getElementById(id + '_mic'); }
function setLive(id, on, label) { const b = micBtn(id); if (!b) return; b.classList.toggle('live', !!on); b.innerHTML = on ? I.stop : I.mic; b.title = label || ''; }
function putText(id, text) {
  const el = document.getElementById(id); if (!el || !text) return;
  el.value = (el.value ? el.value.replace(/\s+$/, '') + ' ' : '') + text; el.dispatchEvent(new Event('input', { bubbles: true })); try { el.focus(); } catch (e) {}
  A.voiceDone && A.voiceDone(id, text);
}
A.voice = async (id) => {
  if (rec || sr) { stopVoice(); return; }
  if (MR && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast(t('Microphone not allowed — check the phone settings'), 'err'); return; }
    const type = mime(); chunks = []; recId = id;
    try { rec = type ? new MR(stream, { mimeType: type }) : new MR(stream); } catch (e) { rec = new MR(stream); }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }); const kind = blob.type; rec = null; clearTimeout(recT);
      if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
      setLive(id, false);
      if (blob.size < 1500) { toast(t('Could not hear that — try again or type it.'), 'err'); return; }
      const b = micBtn(id); if (b) { b.classList.add('busy'); b.innerHTML = I.dots; }
      try {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read')); r.readAsDataURL(blob); });
        const r = await db.transcribe(dataUrl, LANG.cur);
        if (r.text) { putText(id, r.text.trim()); track('voice', { where: id, len: r.text.length }); } else toast(t('Could not hear that — try again or type it.'), 'err');
      } catch (e) {
        if (e.status === 503 && SR) { toast(t('Voice notes are not switched on yet — using the phone’s own speech instead.')); listenSR(id); }
        else toast(e.status === 429 ? t('Too many voice notes — try again in a few minutes.') : t('Could not transcribe — try again or type it.'), 'err');   // the server's words are English; say it in the app's language
      } finally { const b2 = micBtn(id); if (b2) { b2.classList.remove('busy'); if (!sr) b2.innerHTML = I.mic; } }
      void kind;
    };
    rec.start(250); setLive(id, true, t('Tap to stop'));
    recT = setTimeout(() => stopVoice(), MAX_MS);
    return;
  }
  if (SR) { listenSR(id); return; }
  toast(t('This browser has no microphone support — type instead.'), 'err');
}
function listenSR(id) {
  sr = new SR(); sr.lang = LANG.cur === 'ka' ? 'ka-GE' : 'en-US'; sr.interimResults = false; sr.maxAlternatives = 1; recId = id;
  sr.onresult = e => { const txt = Array.from(e.results).map(r => r[0].transcript).join(' ').trim(); if (txt) putText(id, txt); };
  sr.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast(t('Could not hear that — try again or type it.'), 'err'); };
  sr.onend = () => { sr = null; setLive(id, false); };
  try { sr.start(); setLive(id, true, t('Tap to stop')); } catch (e) { sr = null; setLive(id, false); }
}
export function stopVoice() {
  if (rec) { try { rec.stop(); } catch (e) {} }
  if (sr) { try { sr.stop(); } catch (e) {} }
}
A.stopVoice = stopVoice;

// ---- a photo block inside a form (check-in, private notes, feedback): the saved pictures, the pending ones, "Add photo"
const KEEP = {}, KEEPKEY = {};                     // form id → saved attachments still kept (the rest were removed)
// opts.keep: a key for the record on a SCREEN (e.g. the client's id for private notes). A redraw of the same record keeps
// what was picked or removed but not saved yet; a new record or freshly saved attachments start over. Sheets omit it.
export function attachBlock(id, existing, opts) {
  const o = opts || {}; const key = o.keep ? o.keep + '|' + (existing || []).map(a => a.path).join(',') : null;
  if (!key || KEEPKEY[id] !== key) { KEEP[id] = (existing || []).slice(); clearPending(id); KEEPKEY[id] = key; }
  return '<div class="attblock" id="' + id + '_att">' + attachInner(id) + '</div>' + pickHtml(id, Object.assign({ accept: 'image/*' }, o));
}
function attachInner(id) {
  const kept = KEEP[id] || [];
  return (kept.length ? '<div class="kept">' + kept.map((a, i) => '<span class="pend">' + (urlOf(a.path) ? '<img src="' + urlOf(a.path) + '" alt="">' : '<span class="pfile">' + I.camera + '</span>') + '<span class="pn">' + esc(a.name || '') + '</span><button type="button" class="px" onclick="A.attKeepDrop(\'' + id + '\',' + i + ')" aria-label="' + esc(t('Remove')) + '">' + I.x + '</button></span>').join('') + '</div>' : '') +
    '<div class="pend-row in" id="' + id + '_pend"' + (pending(id).length ? '' : ' style="display:none"') + '>' + pendingHtml(id) + '</div>' +
    '<span class="link" onclick="document.getElementById(\'' + id + '_file\').click()">' + I.camera + ' ' + t('Add a photo') + '</span>';
}
A.attKeepDrop = (id, i) => { (KEEP[id] || []).splice(i, 1); const el = document.getElementById(id + '_att'); if (el) el.innerHTML = attachInner(id); };
export const kept = id => (KEEP[id] || []).slice();
export async function saveAttachments(id, prefix) {   // what to store on the row: kept + newly uploaded
  const fresh = pending(id).length ? await uploadPending(id, prefix) : []; clearPending(id);
  const all = kept(id).concat(fresh); await resolveUrls([{ attachments: all }]); return all;
}
A.attChanged = (id) => { const el = document.getElementById(id + '_att'); if (el) el.innerHTML = attachInner(id); };
export const thumbs = atts => attHtml(atts);
