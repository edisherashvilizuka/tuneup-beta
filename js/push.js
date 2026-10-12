// Tune Up beta — notifications on the phone (web push for the home-screen app): service worker, subscription, the "turn on" card and the More row.
import { t, esc } from './i18n.js';
import { A, I, go, root, rerender, toast } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

const CFG = window.TUNE_CFG || {};
const DISMISS = 'tuneup-push-later';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
export const supported = () => !!(CFG.vapidPublic && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
let reg = null, sub = null, pending = null;   // pending = {kind, pair} from a tapped notification, routed once the home screen is up

// ---- state for the UI: on | off | blocked | install (iPhone, not yet on the Home Screen) | unsupported
export function state() {
  if (!supported()) return isIOS && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return sub ? 'on' : 'off';
}

// ---- boot: register the worker, re-save an existing subscription (endpoints can change), listen for taps
export async function initPush() {
  readTap();
  if (!supported()) return;
  try {
    reg = await navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) routeTap(e.data.open, e.data.pair); });
    sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') await save(sub); else sub = null;
  } catch (e) { reg = null; sub = null; }
}
function readTap() {                           // opened from a notification while the app was closed: ?n=kind&pair=id
  try {
    const u = new URL(location.href); const n = u.searchParams.get('n');
    if (!n) return;
    pending = { kind: n, pair: u.searchParams.get('pair') || '' };
    u.searchParams.delete('n'); u.searchParams.delete('pair');
    history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
  } catch (e) {}
}
export function routePending() { if (pending) { const p = pending; pending = null; routeTap(p.kind, p.pair); } }
function routeTap(kind, pair) {
  if (!S.me || !S.me.role || S.me.role === 'admin') return;
  const coach = S.me.role === 'coach';
  if (kind === 'message') { if (pair && A.openPairChat) A.openPairChat(pair); else root('chat'); }
  else if (kind === 'checkin' && coach && pair) { root('clients'); go('client', { id: pair }); }
  else root(coach ? 'ccal' : 'sessions');
}

async function save(s) {
  const j = s.toJSON();
  await db.savePushSub({ user_id: S.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200), updated_at: new Date().toISOString() });
}
function keyBytes(s) { const pad = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }

A.pushOn = async () => {
  if (!supported()) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { rerender(); toast(t('Notifications are blocked in your phone settings'), 'err'); return; }
    if (!reg) reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CFG.vapidPublic) });
    await save(sub); rerender(); toast(t('Notifications on'));
  } catch (e) { console.warn('push', e); sub = null; rerender(); toast(t('Could not turn on notifications — try again'), 'err'); }
};
A.pushOff = async () => {
  try { if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await db.deletePushSub(ep).catch(() => {}); } sub = null; rerender(); toast(t('Notifications off')); }
  catch (e) { toast(t('Could not change — try again'), 'err'); }
};
A.pushLater = () => { try { localStorage.setItem(DISMISS, '1'); } catch (e) {} rerender(); };
export async function pushSignOut() {          // this phone stops receiving this person's notifications
  try { if (sub) { const ep = sub.endpoint; await db.deletePushSub(ep).catch(() => {}); await sub.unsubscribe(); } } catch (e) {} sub = null;
}

// ---- Today card (trainee home + coach today) until it is on or dismissed
export function pushCard() {
  const st = state(); let later = false; try { later = !!localStorage.getItem(DISMISS); } catch (e) {}
  if (later || st === 'on' || st === 'unsupported' || st === 'blocked') return '';
  if (st === 'install') return '<div class="card soft"><div class="h3">' + t('Get notified on this phone') + '</div><div class="mute">' + t('First add Tune Up to your Home Screen: tap Share, then “Add to Home Screen”, and open it from there.') + '</div><div class="btn-row"><button class="btn sec sm" onclick="A.pushLater()">' + t('Later') + '</button></div></div>';
  return '<div class="card soft"><div class="h3">' + t('Get notified on this phone') + '</div><div class="mute">' + t('Messages, sessions and check-ins — even when the app is closed.') + '</div><div class="btn-row"><button class="btn sm" onclick="A.pushOn()">' + I.bell + ' ' + t('Turn on') + '</button><button class="btn sec sm" onclick="A.pushLater()">' + t('Later') + '</button></div></div>';
}
// ---- More row
export function pushRow() {
  const st = state();
  const sub2 = st === 'on' ? t('On') : st === 'blocked' ? t('Blocked in phone settings') : st === 'install' ? t('Add to Home Screen first') : st === 'unsupported' ? t('Not available in this browser') : t('Off');
  const act = st === 'on' ? '<button class="btn sec xs" onclick="A.pushOff()">' + t('Turn off') + '</button>' : st === 'off' ? '<button class="btn xs" onclick="A.pushOn()">' + t('Turn on') + '</button>' : '';
  return '<div class="lrow"><div class="grow"><div class="t">' + t('Notifications on this phone') + '</div><div class="s">' + esc(sub2) + '</div></div>' + act + '</div>';
}
