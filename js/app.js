// Tune Up beta — boot: decide which screen the person lands on.
import { setLang, LANG } from './i18n.js';
import { root, setTabs, toast, A } from './ui.js';
import * as db from './db.js';
import { S, readInviteFromUrl, clearInvite, forgetInvite } from './state.js';
import { onSignedIn } from './auth.js';
import { onOnboarded, prefillTrainee } from './onboard.js';
import { TRAINEE_TABS, loadTrainee } from './trainee.js';
import { COACH_TABS, loadCoach } from './coach.js';
import { ADMIN_TABS, loadAdmin } from './admin.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function afterSignIn() {
  if (!S.session) { setTabs([]); root('welcome'); return; }
  const uid = S.session.user.id;
  S.me = await db.loadProfile(uid);
  if (!S.me) { await sleep(900); S.me = await db.loadProfile(uid); }        // the profile row is created by a database trigger a moment after sign-up
  if (!S.me) { toast('Profile not ready — try again', 'err'); setTabs([]); root('welcome'); return; }
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
      toast('You already have a coach', 'err');
    }
    clearInvite();
  }
  if (!S.me.role) { root('noinvite'); return; }
  await home();
}

async function home() {
  try {
    if (S.me.role === 'trainee') { await loadTrainee(); setTabs(TRAINEE_TABS); root('home'); }
    else if (S.me.role === 'coach') { await loadCoach(); setTabs(COACH_TABS); root('ctoday'); }
    else if (S.me.role === 'admin') { await loadAdmin(); setTabs(ADMIN_TABS); root('aover'); }
  } catch (e) { console.error(e); toast('Could not load your data — pull to refresh or sign in again', 'err'); setTabs([]); root('noinvite'); }
}
onSignedIn(afterSignIn);
onOnboarded(async () => { S.me = await db.loadProfile(S.session.user.id); await home(); });

async function boot() {
  document.documentElement.setAttribute('lang', LANG.cur);
  if (!db.configured) { root('setup'); return; }
  readInviteFromUrl();
  if (S.invite && !S.invite.info) { try { S.invite.info = await db.inviteInfo(S.invite.code); } catch (e) { S.invite.info = { kind: 'none', valid: false }; } }
  if (S.invite && S.invite.info && !S.invite.info.valid) forgetInvite();   // shown once on the welcome screen, then dropped
  S.session = await db.getSession();
  db.onAuthChange((ev, session) => { if (ev === 'SIGNED_OUT') { S.session = null; } else if (session) { S.session = session; } });
  await afterSignIn();
}
boot();
