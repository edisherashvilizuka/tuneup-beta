// Tune Up beta — boot: decide which screen the person lands on.
import { setLang, LANG, t } from './i18n.js';
import { root, go, back, NAV, setTabs, toast, A, rerender, refreshBadges } from './ui.js';
import * as db from './db.js';
import { S, readInviteFromUrl, clearInvite, forgetInvite, readSignup, clearSignup } from './state.js';
import { onSignedIn } from './auth.js';
import { onOnboarded, prefillTrainee } from './onboard.js';
import { traineeTabs, loadTrainee } from './trainee.js';
import { COACH_TABS, loadCoach } from './coach.js';
import { ADMIN_TABS, loadAdmin } from './admin.js';
// a coach on the admin list switches between the two sides from More / Overview
A.switchAdmin = async () => { try { await loadAdmin(); setTabs(ADMIN_TABS); root('aover'); } catch (e) { toast(t('Could not load — try again'), 'err'); } };
A.switchCoach = async () => { try { await loadCoach(); setTabs(COACH_TABS); root('ctoday'); } catch (e) { toast(t('Could not load — try again'), 'err'); } };
import { loadUnread, track } from './chat.js';
import './calendar.js';
import './tune.js';
import './food.js';
import './habits.js';
import { initPush, routePending } from './push.js';
import './guide.js';
import './plans.js';
import './solo.js';
import './match.js';
import './requests.js';
import { readPayReturn, checkPendingPayment } from './billing.js';
import { isNative, onResume, onBrowserClosed, onBackButton, exitApp } from './native.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function afterSignIn() {
  if (!S.session) { setTabs([]); root('welcome'); return; }
  const uid = S.session.user.id;
  S.me = await db.loadProfile(uid);
  if (!S.me) { await sleep(900); S.me = await db.loadProfile(uid); }        // the profile row is created by a database trigger a moment after sign-up
  if (!S.me) { toast(t('Profile not ready — try again'), 'err'); setTabs([]); root('welcome'); return; }
  if (S.me.lang && S.me.lang !== LANG.cur && !S.me.consent_at) setLang(S.me.lang);
  setTabs([]);
  if (S.me.deactivated_at) { root('paused'); return; }
  if (!S.me.consent_at) { root('consent'); return; }
  // pending invite?
  if (S.invite) {
    if (S.invite.kind === 'coach' && !S.me.role && S.invite.info && S.invite.info.valid) { S.draft = { name: S.me.name || '' }; root('coachSetup'); return; }
    if (S.invite.kind === 'client' && (!S.me.role || S.me.role === 'trainee') && S.invite.info && S.invite.info.valid) {
      let paired = false;
      if (S.me.role === 'trainee') { try { const p = await db.myCoachPair(uid); paired = !!(p && p.status === 'active'); } catch (e) {} }
      if (!paired) { S.draft = { name: S.me.name || '' }; await prefillTrainee(); root('traineeJoin'); return; }
      toast(t('You already have a coach'), 'err');
    }
    clearInvite();
  }
  if (!S.me.role) {
    // public sign-up: the role chosen on the welcome screen leads straight into its steps; otherwise pick one
    if (S.signup && S.signup.role === 'coach') { S.draft = { name: S.me.name || '' }; root('coachSetup'); return; }
    if (S.signup && S.signup.role === 'trainee') { S.draft = { name: S.me.name || '' }; root('q1'); return; }
    root('pickRole'); return;
  }
  clearSignup();
  if (S.me.role === 'coach') S.me.isAdmin = await db.myIsAdmin();   // the partner: a coach who is also on the admin list
  await home();
}

async function home() {
  try {
    if (S.me.role === 'trainee') { await loadTrainee(); setTabs(traineeTabs()); root('home'); }
    else if (S.me.role === 'coach') { await loadCoach(); setTabs(COACH_TABS); root('ctoday'); }
    else if (S.me.role === 'admin') { await loadAdmin(); setTabs(ADMIN_TABS); root('aover'); }
    track('open');
    await initPush(); rerender(); routePending();
    if (S.payReturn && S.me.role === 'trainee') go('payReturn', { payment: S.payReturn });   // the push card/row depend on what the phone says
  } catch (e) { console.error(e); toast(t('Could not load your data — pull to refresh or sign in again'), 'err'); setTabs([]); root('noinvite'); }
}
onSignedIn(afterSignIn);
setInterval(async () => { if (!S.me || !S.me.role || S.me.role === 'admin') return; const before = S.unread; await loadUnread(); if (S.unread !== before) refreshBadges(); }, 60000);   // badges only — a full redraw here used to wipe what was being typed
onOnboarded(async () => { S.me = await db.loadProfile(S.session.user.id); await home(); const m = S.afterSignup; S.afterSignup = null; if (m === 'coach' && S.me.role === 'trainee') A.go('findCoach'); else if (m && S.me.role === 'trainee' && S.pair && S.pair.kind === 'solo' && !S.pair.program_id) A.go('program'); });

async function boot() {
  document.documentElement.setAttribute('lang', LANG.cur);
  if (!db.configured) { root('setup'); return; }
  readInviteFromUrl(); readSignup(); readPayReturn();
  if (S.invite && !S.invite.info) { try { S.invite.info = await db.inviteInfo(S.invite.code); } catch (e) { S.invite.info = { kind: 'none', valid: false }; } }
  if (S.invite && S.invite.info && !S.invite.info.valid) forgetInvite();   // shown once on the welcome screen, then dropped
  S.session = await db.getSession();
  db.onAuthChange((ev, session) => { if (ev === 'SIGNED_OUT') { S.session = null; } else if (session) { S.session = session; } });
  await afterSignIn();
}
boot();
// store app: after the bank's page or the background, check an open checkout; Android back button = back a screen
if (isNative) {
  onResume(() => { if (S.me) checkPendingPayment(); });
  onBrowserClosed(() => { if (S.me) checkPendingPayment(); });
  onBackButton(() => { const sh = document.querySelector('.sheet'); if (sh && A.closeSheet) { A.closeSheet(); return; } if (NAV.stack.length > 1) back(); else exitApp(); });
}

// Phone keyboard: iPhone does not shrink the page when the keyboard opens — it slides the whole view up and sometimes
// leaves it there after the keyboard closes. Size and place the app to the part of the screen that is really visible
// (CSS variables --vvh / --vvtop, used in the phone layout). Not while zoomed in with two fingers.
(function fitViewport() {
  const vv = window.visualViewport; if (!vv) return; const r = document.documentElement.style;
  const fit = () => { if (Math.abs(vv.scale - 1) > 0.01) { r.removeProperty('--vvh'); r.removeProperty('--vvtop'); return; } r.setProperty('--vvh', Math.round(vv.height) + 'px'); r.setProperty('--vvtop', Math.round(vv.offsetTop) + 'px'); };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
})();
