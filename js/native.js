// Tune Up — what changes when the app runs as a store app (Capacitor shell around these same files).
// On the web every function here is a no-op or falls back to the browser behaviour.
// Plugins are reached through window.Capacitor.Plugins (the native bridge fills it; no bundler needed):
//   PushNotifications — Apple / Google notifications (the web push of the home-screen app does not exist in the shell)
//   Browser           — the bank's page and outside links in an in-app browser sheet
//   App               — coming back to the foreground (after paying), Android back button
const C = window.Capacitor;
export const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const platform = isNative && C.getPlatform ? C.getPlatform() : 'web';   // 'ios' | 'android' | 'web'
const P = (name) => (isNative && C.Plugins && C.Plugins[name]) || null;
const CFG = window.TUNE_CFG || {};
export const WEB_URL = (CFG.webUrl || 'https://edisherashvilizuka.github.io/tuneup-beta/').replace(/\/?$/, '/');

// outside pages (legal, the bank, how-to videos): an in-app browser sheet in the shell, a new tab on the web
export async function openOutside(url) {
  const B = P('Browser');
  if (B) { try { await B.open({ url, presentationStyle: 'popover' }); return; } catch (e) {} }
  window.open(url, '_blank', 'noopener');
}
// the app's own public pages (legal.html, …) live on the website too; the shell opens that copy
export function publicUrl(path) { return isNative ? WEB_URL + path : path; }

// ---- notifications in the shell: one token per phone, stored like a web-push subscription ('apns:…' / 'fcm:…')
export function nativePushAvailable() { return !!P('PushNotifications'); }
export async function nativePushState() {
  const PN = P('PushNotifications'); if (!PN) return 'unsupported';
  try { const r = await PN.checkPermissions(); return r.receive === 'granted' ? 'granted' : r.receive === 'denied' ? 'denied' : 'prompt'; } catch (e) { return 'unsupported'; }
}
let listening = false;
export async function nativePushInit(onToken, onTap) {
  const PN = P('PushNotifications'); if (!PN || listening) return;
  listening = true;
  try {
    await PN.addListener('registration', (t) => { if (t && t.value) onToken((platform === 'ios' ? 'apns:' : 'fcm:') + t.value); });
    await PN.addListener('registrationError', (e) => console.warn('push registration', e));
    await PN.addListener('pushNotificationActionPerformed', (a) => { const d = (a && a.notification && a.notification.data) || {}; onTap(d.kind || '', d.pair || ''); });
    if ((await nativePushState()) === 'granted') await PN.register();   // refresh the token on every start (tokens can change)
  } catch (e) { console.warn('push init', e); }
}
export async function nativePushOn() {
  const PN = P('PushNotifications'); if (!PN) return 'unsupported';
  const r = await PN.requestPermissions();
  if (r.receive !== 'granted') return 'denied';
  await PN.register(); return 'granted';
}

// ---- coming back to the app (after the bank's page, or from the background)
export function onResume(fn) { const A = P('App'); if (A) A.addListener('appStateChange', (s) => { if (s && s.isActive) fn(); }); }
export function onBrowserClosed(fn) { const B = P('Browser'); if (B) B.addListener('browserFinished', fn); }
// Android back button: go back a screen, or leave the app from a top screen
export function onBackButton(fn) { const A = P('App'); if (A) A.addListener('backButton', fn); }
export function exitApp() { const A = P('App'); if (A && A.exitApp) A.exitApp(); }
