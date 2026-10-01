// Tune Up beta — welcome, sign-in by e-mail code, consent, "no invite" and "paused" screens.
import { t, esc, LANG, setLang, firstName } from './i18n.js';
import { SCREENS, A, I, go, replace, root, rerender, toast, busy, val, field, langToggle, sheet, closeSheet } from './ui.js';
import * as db from './db.js';
import { S } from './state.js';

let afterSignIn = () => {};
export function onSignedIn(fn) { afterSignIn = fn; }

A.lang = (l) => { setLang(l); rerender(); };

SCREENS.setup = () => ({ header: false, tabs: false, center: true, body:
  '<div class="brandline">tune up<span class="dot">.</span></div><p class="lead">' + t('The beta is not switched on yet. Check back soon.') + '</p>' });

SCREENS.welcome = () => {
  const inv = S.invite;
  let invCard = '';
  if (inv && inv.info) {
    if (inv.info.valid && inv.info.kind === 'client') invCard = '<div class="card soft"><div class="eyebrow">' + t('Invitation') + '</div><div class="h2">' + esc(t('{name} invited you to Tune Up', { name: inv.info.coach || t('Your coach') })) + '</div><div class="mute">' + t('Sign in with your e-mail to accept.') + '</div></div>';
    else if (inv.info.valid && inv.info.kind === 'coach') invCard = '<div class="card soft"><div class="eyebrow">' + t('Invitation') + '</div><div class="h2">' + t('You are invited as a coach') + '</div><div class="mute">' + t('Sign in with your e-mail to set up your coach account.') + '</div></div>';
    else invCard = '<div class="card amber"><div class="h3">' + t('This invite link is no longer valid') + '</div><div class="mute">' + t('Ask for a new link. You can still sign in if you already have an account.') + '</div></div>';
  }
  return { header: false, tabs: false, center: true, body:
    '<div class="row" style="position:absolute;top:14px;right:14px;gap:8px">' + langToggle('lang') + '</div>' +
    '<div class="eyebrow" style="margin-bottom:26px">' + t('Tbilisi') + ' · ' + t('closed beta') + '</div>' +
    '<div class="brandline">tune up<span class="dot">.</span></div>' +
    '<p class="lead" style="max-width:260px">' + t('Your coach, in your pocket every day.') + '</p>' +
    '<div style="height:18px"></div>' +
    '<div class="col" style="width:100%;gap:10px">' + invCard +
    '<button class="btn" onclick="A.go(\'email\')">' + I.mail + ' ' + t('Continue with e-mail') + '</button></div>' +
    '<div style="height:10px"></div><div class="mute small">' + t('No passwords — we e-mail you a one-time code.') + '</div>' };
};

SCREENS.email = () => ({ title: t('Sign in'), tabs: false, body:
  '<p class="lead">' + t('Enter your e-mail. We will send you a one-time code.') + '</p>' +
  field(t('E-mail'), 'email', S.draft.email || '', { type: 'email', ph: 'name@example.com', attrs: ' autocomplete="email" autocapitalize="off" autocorrect="off"' }) +
  '<div class="err" id="err"></div>' +
  '<button class="btn" onclick="A.sendCode()">' + t('Send code') + '</button>',
  after: () => { const el = document.getElementById('email'); if (el) { el.focus(); el.addEventListener('keydown', e => { if (e.key === 'Enter') A.sendCode(); }); } } });

A.sendCode = async () => {
  const email = val('email').toLowerCase();
  const err = document.getElementById('err');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = t('Please enter a valid e-mail.'); return; }
  S.draft.email = email; err.textContent = ''; busy(true);
  try { await db.sendCode(email, LANG.cur); go('code'); }
  catch (e) { busy(false); err.textContent = e.message && /rate|limit|seconds/i.test(e.message) ? t('Too many attempts — wait a minute and try again.') : t('Could not send the code. Check the e-mail and try again.'); }
};

SCREENS.code = () => ({ title: t('Check your e-mail'), sub: S.draft.email, tabs: false, body:
  '<p class="lead">' + t('We sent a code to {email}. Type all its digits here.', { email: S.draft.email }) + '</p>' +
  '<input class="input code-in" id="code" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="one-time-code" placeholder="••••••••">' +
  '<div class="err" id="err"></div>' +
  '<button class="btn" onclick="A.verify()">' + t('Sign in') + '</button>' +
  '<div class="mute small" style="text-align:center">' + t('No e-mail? Check spam, or') + ' <span class="link" onclick="A.resend()">' + t('send it again') + '</span></div>',
  after: () => { const el = document.getElementById('code'); if (el) { el.focus(); el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 10); }); el.addEventListener('keydown', e => { if (e.key === 'Enter') A.verify(); }); } } });

let verifying = false;
A.verify = async () => {
  const code = val('code'); const err = document.getElementById('err');
  if (code.length < 6) { err.textContent = t('Enter the code from the e-mail.'); return; }
  if (verifying) return; verifying = true;
  err.textContent = ''; busy(true);
  try { const data = await db.verifyCode(S.draft.email, code); S.session = data.session; await afterSignIn(); }
  catch (e) { busy(false); err.textContent = t('That code did not work. Check it or request a new one.'); }
  verifying = false;
};
A.resend = async () => { try { await db.sendCode(S.draft.email, LANG.cur); toast(t('Code sent again')); } catch (e) { toast(t('Could not send — wait a minute'), 'err'); } };

// ---- consent (health data) — shown once per account
SCREENS.consent = () => ({ title: t('Before we start'), tabs: false, back: false, body:
  '<div class="row between"><div class="eyebrow">' + t('Your data') + '</div>' + langToggle('lang') + '</div>' +
  '<div class="card note">' +
  '<p>' + t('Tune Up stores what you and your coach enter: name, e-mail, weight, goals, injuries, food and training logs, check-ins and messages. Some of this is health-related data.') + '</p>' +
  '<p>' + t('It is kept on servers in the EU (Frankfurt), shown only to you, your coach and the Tune Up team, and never sold or shared with anyone else.') + '</p>' +
  '<p>' + t('You can delete your account and all of its data at any time from More → Delete account.') + '</p>' +
  '<p>' + t('This is a free closed beta: things may change or break, and we may ask you for feedback.') + '</p>' +
  '</div>' +
  '<button class="btn" onclick="A.consent()">' + t('I agree — continue') + '</button>' +
  '<button class="btn sec" onclick="A.signOut()">' + t('Not now — sign out') + '</button>' });

A.consent = async () => {
  busy(true);
  try { await db.acceptConsent(LANG.cur); S.me.consent_at = new Date().toISOString(); await afterSignIn(); }
  catch (e) { busy(false); toast(t('Something went wrong — try again'), 'err'); }
};

SCREENS.noinvite = () => ({ title: t('Invite only'), tabs: false, back: false, body:
  '<div class="card soft"><div class="h2">' + t('Tune Up is invite-only during the beta') + '</div>' +
  '<div class="lead">' + t('Ask your coach for an invite link and open it on this phone. If you are a coach, ask the Tune Up team for your link.') + '</div></div>' +
  '<div class="mute small">' + t('Signed in as {email}', { email: (S.session && S.session.user && S.session.user.email) || '' }) + '</div>' +
  '<button class="btn sec" onclick="A.signOut()">' + I.logout + ' ' + t('Sign out') + '</button>' });

SCREENS.paused = () => ({ title: t('Account paused'), tabs: false, back: false, body:
  '<div class="card amber"><div class="h3">' + t('This account has been paused by the Tune Up team.') + '</div><div class="mute">' + t('Contact us if you think this is a mistake.') + '</div></div>' +
  '<button class="btn sec" onclick="A.signOut()">' + I.logout + ' ' + t('Sign out') + '</button>' });

A.signOut = async () => { try { await db.signOut(); } catch (e) {} S.session = null; S.me = null; S.pair = null; S.clients = []; root('welcome'); };

A.deleteAccountAsk = () => sheet('<div class="h2">' + t('Delete your account?') + '</div><p class="lead">' + t('This removes your profile, logs, messages and pairing for good. It cannot be undone.') + '</p>' +
  '<button class="btn danger" onclick="A.deleteAccount()">' + t('Delete everything') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Keep my account') + '</button>');
A.deleteAccount = async () => { try { await db.deleteAccount(); closeSheet(); toast(t('Account deleted')); await A.signOut(); } catch (e) { toast(t('Could not delete — try again'), 'err'); } };
