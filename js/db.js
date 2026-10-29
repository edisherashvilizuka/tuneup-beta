// Tune Up beta — everything that talks to Supabase. Screens never build queries themselves.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CFG = window.TUNE_CFG || {};
export const configured = !!(CFG.supabaseUrl && CFG.supabaseKey);
export const sb = configured ? createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

const PROFILE_COLS = 'id,role,name,lang,consent_at,deactivated_at,created_at';

function fail(e) { const err = new Error((e && (e.message || e.error_description || e.msg)) || 'error'); err.code = e && e.code; throw err; }
async function q(p) { const { data, error } = await p; if (error) fail(error); return data; }

// ---- auth
export async function getSession() { const { data } = await sb.auth.getSession(); return data.session || null; }
export function onAuthChange(cb) { sb.auth.onAuthStateChange((ev, session) => cb(ev, session)); }
export async function sendCode(email, lang, create) {   // create = false: only existing accounts get a code (a typo never makes a new account)
  return q(sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !!create, data: { lang } } }));
}
export async function verifyCode(email, token) {
  // a first-time sign-up carries a 'signup' code, a returning user a magic-link code; try each
  let last;
  for (const type of ['email', 'signup', 'magiclink']) {
    const { data, error } = await sb.auth.verifyOtp({ email, token, type });
    if (!error && data && data.session) return data;
    last = error || new Error('no session');
  }
  fail(last);
}
export async function signOut() { await sb.auth.signOut(); }

// ---- me
export async function loadProfile(uid) {
  return q(sb.from('profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle());
}
export async function updateProfile(uid, patch) { return q(sb.from('profiles').update(patch).eq('id', uid)); }
export async function acceptConsent(lang) { return q(sb.rpc('accept_consent', { p_lang: lang })); }
// deleting the account: the person's own files go first, through the Storage service (SQL may not delete them;
// the service also removes the stored bytes), then the account itself (migration 0014)
export async function myAttachmentPaths() { return (await q(sb.rpc('my_attachment_paths'))) || []; }
async function removePaths(paths) { for (let i = 0; i < paths.length; i += 100) await q(sb.storage.from('attachments').remove(paths.slice(i, i + 100))); }
export async function deleteAccount() { await removePaths(await myAttachmentPaths()); return q(sb.rpc('delete_my_account')); }
// Tune "Clear": the conversation's own pictures and files (tune/<uid>/<file>; notes and feedback folders stay)
export async function removeTuneFiles(uid) { const re = new RegExp('^tune/' + uid + '/[^/]+$'); await removePaths((await myAttachmentPaths()).filter(p => re.test(p))); }

// ---- invites + pairing
export async function inviteInfo(code) { return q(sb.rpc('invite_info', { p_code: code })); }
export async function redeemCoach(code, name, lang, profile) { return q(sb.rpc('redeem_coach_invite', { p_code: code, p_name: name, p_lang: lang, p_profile: profile || {} })); }
export async function redeemClient(code, name, lang, profile) { return q(sb.rpc('redeem_client_invite', { p_code: code, p_name: name, p_lang: lang, p_profile: profile || {} })); }
export async function endPair(id, note) { return q(sb.rpc('end_pair', { p_pair: id, p_note: note || '' })); }

// ---- trainee
export async function myCoachPair(uid) {
  return q(sb.from('pairs').select('id,status,format,started_at,ended_at,end_note,coach:profiles!pairs_coach_id_fkey(id,name,lang,coach_profiles(specialties,pitch,gym,district,online,inperson,availability_text))')
    .eq('trainee_id', uid).order('started_at', { ascending: false }).limit(1).maybeSingle());
}
export async function myTraineeProfile(uid) { return q(sb.from('trainee_profiles').select('*').eq('id', uid).maybeSingle()); }
export async function updateTraineeProfile(uid, patch) { return q(sb.from('trainee_profiles').update(Object.assign({}, patch, { updated_at: new Date().toISOString() })).eq('id', uid).select('*').single()); }
export async function saveTraineeProfile(uid, patch) { return q(sb.from('trainee_profiles').upsert({ id: uid, ...patch, updated_at: new Date().toISOString() })); }

// ---- coach
export async function myClients(uid) {
  return q(sb.from('pairs').select('id,status,format,started_at,ended_at,end_note,trainee:profiles!pairs_trainee_id_fkey(id,name,lang,trainee_profiles(weight_kg,height_cm,experience,goal,goal_detail,injuries,diet,format,allergies,eating_style))')
    .eq('coach_id', uid).order('started_at', { ascending: false }));
}
export async function myCoachProfile(uid) { return q(sb.from('coach_profiles').select('*').eq('id', uid).maybeSingle()); }
export async function saveCoachProfile(uid, patch) { return q(sb.from('coach_profiles').upsert({ id: uid, ...patch, updated_at: new Date().toISOString() })); }
export async function myInvites(uid) { return q(sb.from('client_invites').select('code,note,created_at,expires_at,used_by,used_at').eq('coach_id', uid).order('created_at', { ascending: false })); }
export async function createClientInvite(uid, note) { return q(sb.from('client_invites').insert({ coach_id: uid, note: note || '' }).select('code,expires_at').single()); }
export async function deleteClientInvite(code) { return q(sb.from('client_invites').delete().eq('code', code)); }

// ---- admin
export async function adminUsers() { return q(sb.rpc('admin_users')); }
export async function adminPairs() {
  return q(sb.from('pairs').select('id,status,format,started_at,ended_at,coach:profiles!pairs_coach_id_fkey(id,name),trainee:profiles!pairs_trainee_id_fkey(id,name)').order('started_at', { ascending: false }));
}
export async function coachInvites() { return q(sb.from('coach_invites').select('code,note,created_at,expires_at,used_by,used_at').order('created_at', { ascending: false })); }
export async function createCoachInvite(uid, note) { return q(sb.from('coach_invites').insert({ note: note || '', created_by: uid }).select('code,expires_at').single()); }
export async function setActive(uid, active) { return q(sb.rpc('admin_set_active', { p_user: uid, p_active: !!active })); }

// ---- exercises (global library + the coach's own)
const EX_COLS = 'id,owner_id,name,name_ka,muscle,muscle_ka,video_url,note,grp,sub,equip,kind,pop,also,tags,pos';
export async function listExercises() { return q(sb.from('exercises').select(EX_COLS).order('name')); }
export async function addExercise(uid, x) { return q(sb.from('exercises').insert({ owner_id: uid, name: x.name, muscle: x.muscle || '', video_url: x.video_url || '', note: x.note || '', grp: x.grp || '', sub: x.sub || '', equip: x.equip || '', kind: x.kind || '' }).select(EX_COLS).single()); }
export async function updateExercise(id, patch) { return q(sb.from('exercises').update(patch).eq('id', id)); }
export async function deleteExercise(id) { return q(sb.from('exercises').delete().eq('id', id)); }

// ---- weekly plan, targets, goals (per pair)
const ITEM_COLS = 'id,pair_id,day,sets,reps,load,note,position,created_at,exercise:exercises(' + EX_COLS + ')';
export async function planItems(pairId) { return q(sb.from('plan_items').select(ITEM_COLS).eq('pair_id', pairId).order('day').order('position').order('created_at')); }
export async function addPlanItem(item) { return q(sb.from('plan_items').insert(item).select(ITEM_COLS).single()); }
export async function updatePlanItem(id, patch) { return q(sb.from('plan_items').update(patch).eq('id', id)); }
export async function deletePlanItem(id) { return q(sb.from('plan_items').delete().eq('id', id)); }
export async function getTargets(pairId) { return q(sb.from('targets').select('*').eq('pair_id', pairId).maybeSingle()); }
export async function saveTargets(pairId, patch) { return q(sb.from('targets').upsert({ pair_id: pairId, ...patch, updated_at: new Date().toISOString() })); }
export async function listGoals(pairId) { return q(sb.from('goals').select('id,text,done,position,created_at').eq('pair_id', pairId).order('position').order('created_at')); }
export async function addGoal(pairId, text, position) { return q(sb.from('goals').insert({ pair_id: pairId, text, position: position || 0 }).select('id,text,done,position,created_at').single()); }
export async function updateGoal(id, patch) { return q(sb.from('goals').update(patch).eq('id', id)); }
export async function deleteGoal(id) { return q(sb.from('goals').delete().eq('id', id)); }

// ---- logs (trainee's day)
export async function logsForDay(traineeId, day) { return q(sb.from('logs').select('id,kind,ref,value,protein_g,carbs_g,fat_g,note,reaction,created_at').eq('trainee_id', traineeId).eq('day', day)); }
export async function logsBetween(traineeId, from, to) { return q(sb.from('logs').select('id,day,kind,ref,value,protein_g,carbs_g,fat_g,note').eq('trainee_id', traineeId).gte('day', from).lte('day', to)); }
export async function setExerciseDone(traineeId, day, itemId, done) {
  await q(sb.from('logs').delete().eq('trainee_id', traineeId).eq('day', day).eq('kind', 'exercise').eq('ref', itemId));
  if (done) return q(sb.from('logs').insert({ trainee_id: traineeId, day, kind: 'exercise', ref: itemId, value: 1 }));
}
const LOG_COLS = 'id,trainee_id,day,kind,ref,value,protein_g,carbs_g,fat_g,note,reaction,attachments,created_at';
export async function addLog(traineeId, day, kind, value, extra) {
  const x = extra || {}; const n = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
  return q(sb.from('logs').insert({ trainee_id: traineeId, day, kind, value, protein_g: n(x.protein_g), carbs_g: n(x.carbs_g), fat_g: n(x.fat_g), note: x.note || '' }).select(LOG_COLS).single());
}
export async function setDayLog(traineeId, day, kind, value, note, attachments) {    // steps / weight / checkin: one row per day
  await q(sb.from('logs').delete().eq('trainee_id', traineeId).eq('day', day).eq('kind', kind));
  if (value != null) return q(sb.from('logs').insert({ trainee_id: traineeId, day, kind, value, note: note || '', attachments: attachments || [] }).select(LOG_COLS).single());
}
export async function deleteLog(id) { return q(sb.from('logs').delete().eq('id', id)); }
export async function logsForTrainees(ids, from, to) { return q(sb.from('logs').select(LOG_COLS).in('trainee_id', ids).gte('day', from).lte('day', to)); }
export async function targetsForPairs(ids) { return q(sb.from('targets').select('*').in('pair_id', ids)); }
export async function planItemsForPairs(ids) { return q(sb.from('plan_items').select('id,pair_id,day,created_at').in('pair_id', ids)); }

// ---- coach private notes (one per pair)
export async function getCoachNote(pairId) { return q(sb.from('coach_notes').select('pair_id,text,attachments,updated_at').eq('pair_id', pairId).maybeSingle()); }
export async function saveCoachNote(pairId, text, attachments) { return q(sb.from('coach_notes').upsert({ pair_id: pairId, text, attachments: attachments || [], updated_at: new Date().toISOString() })); }

// ---- chat (per pair)
const MSG_COLS = 'id,pair_id,sender_id,text,attachments,created_at';
export async function messages(pairId, limit) { return q(sb.from('messages').select(MSG_COLS).eq('pair_id', pairId).order('created_at', { ascending: false }).limit(limit || 100)); }
export async function messagesSince(pairId, since) { return q(sb.from('messages').select(MSG_COLS).eq('pair_id', pairId).gt('created_at', since).order('created_at')); }
export async function recentMessages(pairIds) { return q(sb.from('messages').select(MSG_COLS).in('pair_id', pairIds).order('created_at', { ascending: false }).limit(300)); }
export async function sendMessage(pairId, uid, text, attachments) { return q(sb.from('messages').insert({ pair_id: pairId, sender_id: uid, text: text || '', attachments: attachments || [] }).select(MSG_COLS).single()); }
export async function chatReads(pairIds) { return q(sb.from('chat_reads').select('pair_id,user_id,read_at').in('pair_id', pairIds)); }
export async function markChatRead(pairId, uid) { return q(sb.from('chat_reads').upsert({ pair_id: pairId, user_id: uid, read_at: new Date().toISOString() })); }

// ---- sessions (calendar)
const SES_COLS = 'id,pair_id,starts_at,minutes,where_kind,place,note,repeat,repeat_until,status,cancel_note,created_at';
export async function sessionsFor(pairIds) { return q(sb.from('sessions').select(SES_COLS).in('pair_id', pairIds).order('starts_at')); }
export async function sessionExceptions(sessionIds) { return sessionIds.length ? q(sb.from('session_exceptions').select('id,session_id,on_date,moved_to,note').in('session_id', sessionIds)) : []; }
export async function addSession(row) { return q(sb.from('sessions').insert(row).select(SES_COLS).single()); }
export async function updateSession(id, patch) { return q(sb.from('sessions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)); }
export async function addSessionException(row) { return q(sb.from('session_exceptions').upsert(row, { onConflict: 'session_id,on_date' })); }

// ---- push subscriptions (this phone)
export async function savePushSub(row) { return q(sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })); }
export async function deletePushSub(endpoint) { return q(sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); }

// ---- notifications (bell) + feedback
export async function notifications(uid) { return q(sb.from('notifications').select('id,kind,title,body,data,pair_id,created_at,read_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(50)); }
export async function unreadCount(uid) { const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null); if (error) fail(error); return count || 0; }
export async function markNotificationsRead(uid) { return q(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null)); }
export async function sendFeedback(uid, role, screen, text, attachments) { return q(sb.from('feedback').insert({ user_id: uid, role, screen, text, attachments: attachments || [] })); }
export async function adminLogsToday(day) { const { count, error } = await sb.from('logs').select('id', { count: 'exact', head: true }).eq('day', day); if (error) fail(error); return count || 0; }
export async function adminFeedback() { return q(sb.from('feedback').select('id,user_id,role,screen,text,attachments,created_at').order('created_at', { ascending: false }).limit(100)); }

// ---- Tune (assistant) — the Edge Function adds the Anthropic key; the browser never sees it
// saved conversation: own rows only (RLS); only `actions` can be changed afterwards
const TUNE_COLS = 'id,role,content,actions,attachments,created_at';
export async function tuneHistory(limit) { return q(sb.from('tune_messages').select(TUNE_COLS).order('created_at', { ascending: false }).limit(limit || 60)); }
export async function saveTuneMsg(role, content, actions, attachments) { return q(sb.from('tune_messages').insert({ role, content: String(content).slice(0, 4000), actions: actions || [], attachments: attachments || [] }).select(TUNE_COLS).single()); }
export async function setTuneActions(id, actions) { return q(sb.from('tune_messages').update({ actions }).eq('id', id)); }
export async function clearTune(uid) { return q(sb.from('tune_messages').delete().eq('user_id', uid)); }
// what Tune reads for a coach: every active client's plan, goals, private note (own pairs only, RLS)
export async function planItemsFull(pairIds) { return pairIds.length ? q(sb.from('plan_items').select(ITEM_COLS).in('pair_id', pairIds).order('day').order('position').order('created_at')) : []; }
export async function goalsForPairs(pairIds) { return pairIds.length ? q(sb.from('goals').select('id,pair_id,text,done,position,created_at').in('pair_id', pairIds).order('position').order('created_at')) : []; }
export async function coachNotesFor(pairIds) { return pairIds.length ? q(sb.from('coach_notes').select('pair_id,text,updated_at').in('pair_id', pairIds)) : []; }
// food estimator (Edge Function `food`): what the trainee typed → items with a portion and the four macros per unit
export async function lookupFood(text, lang) {
  const { data, error } = await sb.functions.invoke('food', { body: { text, lang } });
  if (error) { let msg = error.message || 'error'; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
  return data || { items: [] };
}
export async function lookupFoodImage(dataUrl, lang) {
  const { data, error } = await sb.functions.invoke('food', { body: { image: dataUrl, lang } });
  if (error) { let msg = error.message || 'error'; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
  return data || { items: [] };
}
// saved meals (trainee's own templates) and the coach's one-tap reaction on a food log
const MEAL_COLS = 'id,name,items,kcal,protein_g,carbs_g,fat_g,created_at,used_at';
export async function listMeals(uid) { return q(sb.from('meals').select(MEAL_COLS).eq('trainee_id', uid).order('used_at', { ascending: false }).limit(12)); }
export async function saveMeal(uid, name, items, m) { return q(sb.from('meals').insert({ trainee_id: uid, name, items, kcal: Math.round(m.kcal), protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g }).select(MEAL_COLS).single()); }
export async function touchMeal(id) { return q(sb.from('meals').update({ used_at: new Date().toISOString() }).eq('id', id)); }
export async function deleteMeal(id) { return q(sb.from('meals').delete().eq('id', id)); }
export async function reactToLog(logId, on) { return q(sb.rpc('react_to_log', { p_log: logId, p_on: !!on })); }
export async function askTune(payload) {
  const { data, error } = await sb.functions.invoke('tune', { body: payload });
  if (error) { let msg = error.message || 'error'; try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} throw new Error(msg); }
  return data || {};
}
export function inviteLink(kind, code) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return base + '?' + (kind === 'coach' ? 'coach' : 'invite') + '=' + code;
}

// ---- attachments (private bucket; chat files under <pair_id>/, Tune files under tune/<user_id>/)
export async function uploadAttachment(path, blob, type) {
  return q(sb.storage.from('attachments').upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' }));
}
export async function signedUrls(paths) {   // → { path: url } (an hour), missing ones left out
  if (!paths.length) return {};
  const rows = await q(sb.storage.from('attachments').createSignedUrls(paths, 3600)); const out = {};
  (rows || []).forEach(r => { if (r && r.signedUrl && !r.error) out[r.path] = r.signedUrl; }); return out;
}
export async function removeAttachment(path) { return q(sb.storage.from('attachments').remove([path])); }
// voice note → text (Edge Function `transcribe`; audio never stored)
export async function transcribe(dataUrl, lang) {
  const { data, error } = await sb.functions.invoke('transcribe', { body: { audio: dataUrl, lang } });
  if (error) { let msg = error.message || 'transcribe failed'; try { const ctx = error.context; if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); if (j && j.error) msg = j.error; } } catch (e) {} const err = new Error(msg); err.status = error.context && error.context.status; throw err; }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}
