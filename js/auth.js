// Tune Up beta — welcome, sign-in by e-mail code, consent, "no invite" and "paused" screens.
import { t, esc, LANG, setLang, firstName } from './i18n.js';
import { SCREENS, A, I, go, replace, root, rerender, toast, busy, val, field, langToggle, sheet, closeSheet , setTheme } from './ui.js';
import * as db from './db.js';
import { S, setSignup, setInvite } from './state.js';
import { openOutside, publicUrl } from './native.js';

let afterSignIn = () => {};
export function onSignedIn(fn) { afterSignIn = fn; }

A.lang = (l) => { setLang(l); rerender(); };
A.setTheme = (v) => { setTheme(v); rerender(); };

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
    '<div class="eyebrow" style="margin-bottom:26px">' + t('Tbilisi') + '</div>' +
'<div class="hero-logo" style="margin:0 auto 14px;width:72px;height:72px"><svg width="52" height="52" viewBox="0 0 512 512" aria-hidden="true"><rect x="72" y="169" width="46" height="174" rx="23" fill="#F3EBDC"/><rect x="138" y="118" width="46" height="276" rx="23" fill="#F3EBDC"/><rect x="328" y="118" width="46" height="276" rx="23" fill="#F3EBDC"/><rect x="394" y="169" width="46" height="174" rx="23" fill="#F3EBDC"/><rect x="184" y="236" width="144" height="40" rx="20" fill="#16130F"/></svg></div>' +
        '<div class="brandline">tune up<span class="dot">.</span></div>' +
    '<p class="lead" style="max-width:280px">' + t('Train smarter — with a coach, or on your own.') + '</p>' +
    '<div style="height:18px"></div>' +
    '<div class="col" style="width:100%;gap:10px">' + invCard +
    (inv && inv.info && inv.info.valid ? '<button class="btn" onclick="A.startSignup(null)">' + I.mail + ' ' + t('Continue with e-mail') + '</button>'
      : '<button class="btn" onclick="A.startSignup(\'trainee\')">' + t('I want to train') + '</button><button class="btn sec" onclick="A.startSignup(\'coach\')">' + t('I am a coach') + '</button>') +
    '</div><div style="height:10px"></div><div class="link" onclick="A.startSignup(\'signin\')">' + t('Already have an account? Sign in') + '</div>' +
    (inv && inv.info && inv.info.valid ? '' : '<div class="link" style="margin-top:6px" onclick="A.inviteCodeSheet()">' + t('I have an invite code') + '</div>') +
    '<div class="mute small" style="margin-top:6px">' + t('No passwords — we e-mail you a one-time code.') + '</div>' +
    (!(window.TUNE_CFG || {}).legalLinks ? '' : '<div class="mute small" style="margin-top:14px">' + t('By continuing you accept the') + ' <span class="link" style="display:inline" onclick="A.legal(\'terms\')">' + t('the Terms of use') + '</span> ' + t('and the') + ' <span class="link" style="display:inline" onclick="A.legal(\'privacy\')">' + t('the Privacy policy') + '</span>.</div>') };
};

// which door the person came through: a role (new account allowed), an invite (new account allowed), or plain sign-in
A.startSignup = (role) => { setSignup(role === 'trainee' || role === 'coach' ? role : null); S.draft.signin = role === 'signin'; go('email'); };
SCREENS.email = () => ({ title: S.signup && !S.draft.signin ? t('Create your account') : t('Sign in'), tabs: false, body:
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
  try { await db.sendCode(email, LANG.cur, canCreate()); go('code'); }
  catch (e) { busy(false); const m = (e && (e.message || e.code)) || ''; err.textContent = /signup|not allowed|otp_disabled|not found/i.test(m) ? t('There is no Tune Up account with this e-mail. Check it for typos — or go back and create one.') : /rate|limit|seconds/i.test(m) ? t('Too many attempts — wait a minute and try again.') : t('Could not send the code. Check the e-mail and try again.'); }
};

SCREENS.code = () => ({ title: t('Check your e-mail'), sub: S.draft.email, tabs: false, body:
  '<p class="lead">' + t('We sent a code to {email}. Type all its digits here.', { email: S.draft.email }) + '</p>' +
  '<div class="mute small" style="margin-bottom:10px">' + t('It can take a few minutes to arrive. Check the spam folder too.') + '</div>' +
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
// a new account is made through a valid invite link or the public sign-up buttons; "Sign in" is for existing accounts
function canCreate() { return !!((S.invite && S.invite.info && S.invite.info.valid) || (S.signup && !S.draft.signin)); }
A.resend = async () => { try { await db.sendCode(S.draft.email, LANG.cur, canCreate()); toast(t('Code sent again')); } catch (e) { toast(t('Could not send — wait a minute'), 'err'); } };

// ---- consent (health data) — shown once per account
SCREENS.consent = () => ({ title: t('Before we start'), tabs: false, back: false, body:
  '<div class="row between"><div class="eyebrow">' + t('Your data') + '</div>' + langToggle('lang') + '</div>' +
  '<div class="card note">' +
  '<p>' + t('Tune Up stores what you and your coach enter: name, e-mail, weight, goals, injuries, food and training logs, check-ins and messages. Some of this is health-related data.') + '</p>' +
  '<p>' + t('It is kept on servers in the EU (Frankfurt) and shown only to you, your coach and the Tune Up team. It is never sold.') + '</p>' +
  '<p>' + t('When you or your coach use Tune, the in-app assistant, the question and the data needed to answer it (plan, logs, answers, chat messages, photos you attach) are sent to Anthropic in the USA, the AI company that powers it. Voice notes are turned into text by OpenAI in the USA; the recording itself is not kept.') + '</p>' +
  '<p>' + t('Your conversations with Tune are saved in your account so you can come back to them. Only you can see them — not your coach or client — and you can clear them at any time.') + '</p>' +
  '<p>' + t('We also count which screens are used, under an account number without your name or health data, to see what to improve.') + '</p>' +
  '<p>' + t('You can delete your account and all of its data at any time from More → Delete account.') + '</p>' +
  '<p>' + t('Tune Up is new: things may change, and we may ask you for feedback.') + '</p>' +
  (!(window.TUNE_CFG || {}).legalLinks ? '' : '<p><span class="link" style="display:inline" onclick="A.legal(\'privacy\')">' + t('Full privacy policy') + '</span> · <span class="link" style="display:inline" onclick="A.legal(\'terms\')">' + t('Terms of use') + '</span></p>') +
  '</div>' +
  '<button class="btn" onclick="A.consent()">' + t('I agree — continue') + '</button>' +
  '<button class="btn sec" onclick="A.signOut()">' + t('Not now — sign out') + '</button>' });

A.consent = async () => {
  busy(true);
  try { await db.acceptConsent(LANG.cur); S.me.consent_at = new Date().toISOString(); await afterSignIn(); }
  catch (e) { busy(false); toast(t('Something went wrong — try again'), 'err'); }
};

SCREENS.noinvite = () => SCREENS.pickRole();   // public sign-up: a signed-in person without a role picks one

SCREENS.paused = () => ({ title: t('Account paused'), tabs: false, back: false, body:
  '<div class="card amber"><div class="h3">' + t('This account has been paused by the Tune Up team.') + '</div><div class="mute">' + t('Contact us if you think this is a mistake.') + '</div></div>' +
  '<button class="btn sec" onclick="A.signOut()">' + I.logout + ' ' + t('Sign out') + '</button>' });

A.signOut = async () => { try { const { pushSignOut } = await import('./push.js'); await pushSignOut(); } catch (e) {} try { await db.signOut(); } catch (e) {} S.session = null; S.me = null; S.pair = null; S.clients = []; S.tune = null; S.chat = null; S.cal = null; S.plan = null; S.mon = null; S.exercises = null; S.invites = null; S.notifs = null; S.draft = {}; S.trial = null; S.pairs = null; S.coachPlans = null; S.solo = null; S.match = null; S.requests = null; root('welcome'); };

A.deleteAccountAsk = () => sheet('<div class="h2">' + t('Delete your account?') + '</div><p class="lead">' + t('This removes your profile, logs, messages and pairing for good. It cannot be undone.') + '</p>' +
  '<button class="btn danger" onclick="A.deleteAccount()">' + t('Delete everything') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Keep my account') + '</button>');
A.deleteAccount = async () => { try { await db.deleteAccount(); closeSheet(); toast(t('Account deleted')); await A.signOut(); } catch (e) { toast(t('Could not delete — try again'), 'err'); } };

// privacy policy, terms and refunds — one public page, in the current language
A.legal = (sec) => { const ka = LANG.cur === 'ka'; openOutside(publicUrl('legal.html?lang=' + (ka ? 'ka' : 'en') + '#' + (sec || 'privacy') + (ka ? '-ka' : ''))); };

// an invite typed by hand (the store app cannot open invite links yet; also handy when a link gets mangled)
A.inviteCodeSheet = () => sheet('<div class="h2">' + t('Invite code') + '</div><p class="lead">' + t('The 8 letters and numbers at the end of the invite link your coach sent you.') + '</p>' +
  field(t('Code'), 'inv_code', '', { ph: 'ABCD2345', attrs: ' autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="40"' }) + '<div class="err" id="err"></div>' +
  '<button class="btn" onclick="A.inviteCodeUse()">' + t('Continue') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>');
A.inviteCodeUse = async () => {
  const raw = String(val('inv_code') || '').trim(); const m = raw.match(/[?&](invite|coach)=([A-Za-z0-9]+)/);
  const code = (m ? m[2] : raw).toUpperCase().replace(/[^A-Z0-9]/g, ''); const err = document.getElementById('err');
  if (code.length < 4) { if (err) err.textContent = t('Check the code and try again.'); return; }
  busy(true);
  try {
    const info = await db.inviteInfo(code); busy(false);
    if (!info || !info.valid) { if (err) err.textContent = t('This invite link is no longer valid'); return; }
    setInvite({ kind: info.kind === 'coach' ? 'coach' : 'client', code, info }); closeSheet(); rerender();
  } catch (e) { busy(false); if (err) err.textContent = t('Could not check the code — try again.'); }
};
