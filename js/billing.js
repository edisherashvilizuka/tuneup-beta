// Tune Up — payments in the app (0021 + Edge Function `pay`).
// Trainee: pay for the chosen coach plan by card, see and cancel the subscription, change plan from the next renewal,
// receipts, a Today card when a card payment failed. Coach: TBC bank account for the 85 %, earnings by month and client.
// Admin: month view, accounts to check, refunds. Everything is hidden unless payments are on for this account
// (live for everyone, or test mode for admins and listed testers) — otherwise the old "you pay your coach directly" flow stays.
import { t, esc, fmtDate, firstName, LANG } from './i18n.js';
import { SCREENS, A, I, go, back, root, rerender, toast, sheet, closeSheet, field, val, busy, empty } from './ui.js';
import * as db from './db.js';
import { S, coachPair } from './state.js';
import { isNative, openOutside } from './native.js';

export const money = (tetri) => { const v = Math.round(Number(tetri) || 0) / 100; return (Number.isInteger(v) ? String(v) : v.toFixed(2)) + ' ₾'; };
const day = (ts) => ts ? fmtDate(ts, 'dm') : '';
const L = () => !!(window.TUNE_CFG || {}).legalLinks;   // legal page links only once it carries the operator's details
const LIVE = ['active', 'past_due', 'paused'];

// ---------------------------------------------------------------- loading
export async function loadBilling() {
  S.payOn = await db.paymentsOn();
  if (!S.payOn) { S.subs = []; S.payments = []; return; }
  if (S.me.role === 'trainee') { const [subs, pays] = await Promise.all([db.mySubscriptions(), db.myPayments()]); S.subs = subs || []; S.payments = pays || []; }
}
export function currentSub() { return (S.subs || []).find(s => s.product === 'coach_plan' && LIVE.includes(s.status)) || null; }
export function paysInApp() { return !!S.payOn; }
// store app: back from the bank's in-app browser (or from the background) with a checkout open → check it
export function checkPendingPayment() {
  let id = null; try { id = localStorage.getItem('tuneup-paying'); } catch (e) {}
  if (!id || !S.me || S.me.role !== 'trainee') return;
  S.payResult = null; go('payReturn', { payment: id });
}

// ---------------------------------------------------------------- trainee: pay for a plan
// called from the plan cards (Choose your plan): a paid plan opens a short confirmation; an existing subscription changes plan instead
export function choosePlanPaid(pr, plan) {
  const sub = currentSub();
  if (sub && sub.status !== 'paused') {
    if (sub.plan_id === plan.id && !sub.next_plan_id) { toast(t('This is your plan already')); return; }
    sheet('<div class="h2">' + esc(t('Switch to {plan}?', { plan: plan.name })) + '</div>' +
      '<p class="lead">' + esc(t('Your plan changes on {date}, when the next month starts. From then you pay {price} a month. Nothing is charged today.', { date: day(sub.current_period_end), price: money(plan.price_gel * 100) })) + '</p>' +
      '<button class="btn" onclick="A.payChange(\'' + sub.id + '\',\'' + plan.id + '\')">' + t('Switch plan') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>');
    return;
  }
  const c = pr.coach || {};
  sheet('<div class="eyebrow">' + t('Pay by card') + '</div><div class="h2">' + esc(plan.name) + '</div>' +
    '<div class="card flat"><div class="row between"><div>' + esc(t('With {name}', { name: firstName(c.name) })) + '</div><div class="h3">' + money(plan.price_gel * 100) + ' ' + t('/ month') + '</div></div>' +
    '<div class="s">' + t('Renews every month on the same date. Cancel any time in More → Plan & payments; the month you paid for keeps running.') + '</div></div>' +
    '<p class="mute small">' + t('Card, Apple Pay or Google Pay on the bank\'s secure page — Tune Up never sees your card number.') + (L() ? ' <span class="link" style="display:inline" onclick="A.legal(\'refunds\')">' + t('Payments & refunds') + '</span>' : '') + '</p>' +
    '<button class="btn" id="paybtn" onclick="A.payStart(\'' + pr.id + '\',\'' + plan.id + '\')">' + esc(t('Pay {price}', { price: money(plan.price_gel * 100) })) + '</button>' +
    '<button class="btn sec" onclick="A.closeSheet()">' + t('Not now') + '</button>');
}
A.payStart = async (pairId, planId) => {
  busy(true);
  try {
    const r = await db.payStart(pairId, planId, LANG.cur, isNative ? 'app' : 'web');
    try { localStorage.setItem('tuneup-paying', r.payment); } catch (e) {}
    // web: the bank's page replaces the app and comes back with ?paid=<payment>
    // store app: the stand-in test page runs inside the app; the bank opens in an in-app browser and the app checks when it closes
    if (isNative && /pay-test\.html\?/.test(r.url)) { location.href = 'pay-test.html?' + r.url.split('pay-test.html?')[1]; return; }
    if (isNative) { busy(false); closeSheet(); await openOutside(r.url); return; }
    location.href = r.url;
  } catch (e) {
    busy(false);
    const m = String(e.message || '');
    toast(/coach cannot take payments/.test(m) ? t('Your coach cannot take card payments yet — ask them in the chat.')
      : /already subscribed/.test(m) ? t('You already have a paid plan.') : /not open/.test(m) ? t('Payments are not open for your account yet.') : t('Could not open the payment page — try again.'), 'err');
  }
};
A.payChange = async (subId, planId) => {
  busy(true);
  try { await db.subChangePlan(subId, planId); closeSheet(); await loadBilling(); toast(t('Plan change saved')); root('home'); go('billing'); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};

// back from the bank: ?paid=<payment> (read at start-up into S.payReturn)
export function readPayReturn() {
  try {
    const u = new URL(location.href); const p = u.searchParams.get('paid');
    if (p) { S.payReturn = p; u.searchParams.delete('paid'); history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || '')); }
  } catch (e) {}
}
SCREENS.payReturn = (prm) => {
  const st = S.payResult;
  if (!st) return { title: t('Payment'), tabs: false, body: '<div class="card"><div class="h3">' + t('Checking your payment…') + '</div><div class="mute">' + t('This takes a few seconds.') + '</div></div>', after: () => pollPayment(prm.payment || S.payReturn) };
  if (st.status === 'succeeded') return { title: t('Payment'), body:
    '<div class="card green"><div class="h2">' + t('Payment received') + '</div><div class="s" style="color:var(--a-ink2)">' + esc(t('{plan} · {price} · paid until {date}', { plan: st.plan, price: money(st.amount_tetri), date: day(st.until) })) + '</div></div>' +
    '<p class="mute">' + t('A receipt is in More → Plan & payments.') + '</p><button class="btn" onclick="A.payDone()">' + t('Let\'s go') + '</button>' };
  if (st.status === 'failed') return { title: t('Payment'), body:
    '<div class="card amber"><div class="h3">' + t('The payment did not go through') + '</div><div class="mute">' + t('Nothing was charged. Try again, or use another card.') + '</div></div>' +
    '<button class="btn" onclick="A.payRetry()">' + t('Try again') + '</button><button class="btn sec" onclick="A.payDone()">' + t('Later') + '</button>' };
  return { title: t('Payment'), body: '<div class="card"><div class="h3">' + t('The bank is still confirming') + '</div><div class="mute">' + t('We will tell you as soon as it is confirmed. You can close this screen.') + '</div></div><button class="btn sec" onclick="A.payDone()">' + t('OK') + '</button>' };
};
async function pollPayment(id) {
  if (!id) { S.payResult = { status: 'pending' }; rerender(); return; }
  for (let i = 0; i < 8; i++) {
    try { const r = await db.payStatus(id); if (r.status === 'succeeded' || r.status === 'failed' || i === 7) { S.payResult = r; break; } } catch (e) { if (i === 7) S.payResult = { status: 'pending' }; }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!S.payResult) S.payResult = { status: 'pending' };
  try { localStorage.removeItem('tuneup-paying'); } catch (e) {}
  rerender();
}
A.payDone = async () => { S.payResult = null; S.payReturn = null; busy(true); try { const { loadTrainee } = await import('./trainee.js'); await loadTrainee(); } catch (e) {} busy(false); root('home'); };
A.payRetry = () => { S.payResult = null; S.payReturn = null; root('home'); go('choosePlan'); };

// ---------------------------------------------------------------- trainee: Today card when something needs attention
export function billingCard() {
  if (!S.payOn) return '';
  const sub = (S.subs || []).find(s => s.product === 'coach_plan' && (s.status === 'past_due' || s.status === 'paused'));
  if (!sub) return '';
  if (sub.status === 'past_due') return '<div class="card amber" style="cursor:pointer" onclick="A.go(\'billing\')"><div class="h3">' + t('Card payment failed') + '</div><div class="s" style="color:var(--a-ink2)">' + esc(t('We will try again on {date}. Check that your card has money on it.', { date: day(sub.next_retry_at) })) + '</div></div>';
  return '<div class="card amber"><div class="h3">' + t('Your plan is paused') + '</div><div class="s" style="color:var(--a-ink2)">' + esc(t('The monthly payment for {plan} did not go through. Pay to continue with your coach.', { plan: sub.plan_name })) + '</div><button class="btn sm" onclick="A.go(\'choosePlan\')">' + t('Pay now') + '</button></div>';
}
// the plan line under "Plan" on the trainee's side
export function planPayLine() {
  const sub = currentSub(); if (!S.payOn) return '';
  if (!sub) return t('Not paid in the app yet — More → Plan & payments');
  if (sub.status === 'active' && sub.cancel_at_period_end) return t('Paid in the app · stops on {date}', { date: day(sub.current_period_end) });
  if (sub.status === 'active') return t('Paid in the app · renews on {date}', { date: day(sub.current_period_end) });
  return t('Payment needs attention');
}

// ---------------------------------------------------------------- trainee: Plan & payments
const STATUS = { active: 'Active', past_due: 'Payment failed', paused: 'Paused', cancelled: 'Cancelled', ended: 'Ended', failed: 'Not paid', pending: 'Waiting for the bank' };
const PSTATUS = { succeeded: 'Paid', failed: 'Failed', refunded: 'Refunded', partly_refunded: 'Partly refunded', pending: 'Waiting', created: 'Started' };
SCREENS.billing = () => {
  const sub = currentSub();
  if (!S.subs) return { title: t('Plan & payments'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { await loadBilling(); rerender(); } };
  let top;
  const cp = coachPair();
  if (!sub) top = '<div class="card soft"><div class="h3">' + t('No paid plan right now') + '</div><div class="mute">' + t('When you choose a coach\'s plan, you pay for it here by card.') + '</div>' +
    (cp && (cp.status === 'active' || (cp.trial_trainee_ok && cp.trial_coach_ok)) ? '<button class="btn sm" onclick="A.go(\'choosePlan\')">' + t('Choose a plan') + '</button>' : '') + '</div>';
  else {
    const chip = '<span class="tag ' + (sub.status === 'active' && !sub.cancel_at_period_end ? 'ok' : 'warn') + '">' + esc(t(sub.cancel_at_period_end && sub.status === 'active' ? 'Stops at the end of the month' : STATUS[sub.status] || sub.status)) + '</span>';
    const rows = [
      [t('Price'), money(sub.amount_tetri) + ' ' + t('/ month')],
      [sub.cancel_at_period_end ? t('Stops on') : t('Next payment'), day(sub.status === 'past_due' ? sub.next_retry_at : sub.current_period_end)],
      sub.card_last4 ? [t('Card'), (sub.card_brand && sub.card_brand !== 'TEST' ? sub.card_brand + ' ' : '') + '•••• ' + sub.card_last4] : null,
      sub.next_plan_id ? [t('From {date}', { date: day(sub.current_period_end) }), sub.next_plan_name + ' · ' + money(sub.next_amount_tetri)] : null,
    ].filter(Boolean);
    top = '<div class="card"><div class="row between"><div class="eyebrow">' + t('Your plan') + '</div>' + chip + '</div><div class="h2">' + esc(sub.plan_name) + '</div>' +
      rows.map(r => '<div class="lrow" style="padding:8px 0;min-height:0"><div class="grow mute">' + esc(r[0]) + '</div><div class="t">' + esc(r[1]) + '</div></div>').join('') +
      (sub.mode === 'test' ? '<div class="mute small" style="margin-top:6px">' + t('Test payment — no real money.') + '</div>' : '') + '</div>' +
      (sub.status === 'paused' ? '<button class="btn" onclick="A.go(\'choosePlan\')">' + t('Pay now') + '</button>'
        : sub.cancel_at_period_end ? '<button class="btn" onclick="A.subResume(\'' + sub.id + '\')">' + t('Keep my plan') + '</button>'
        : '<div class="btn-row"><button class="btn sec" onclick="A.go(\'choosePlan\')">' + t('Change plan') + '</button><button class="btn sec" onclick="A.subCancelAsk(\'' + sub.id + '\')">' + t('Cancel plan') + '</button></div>');
  }
  const pays = (S.payments || []).filter(p => p.status !== 'created');
  const hist = pays.length ? '<div class="eyebrow grp">' + t('Payments') + '</div><div class="card menu">' + pays.map(p =>
    '<div class="lrow" style="cursor:default"><div class="grow"><div class="t">' + money(p.amount_tetri) + '</div><div class="s">' + esc(day(p.paid_at || p.created_at) + (p.period_end && p.status !== 'failed' ? ' · ' + t('until {date}', { date: day(p.period_end) }) : '') + (p.refunded_tetri ? ' · ' + t('{amount} back', { amount: money(p.refunded_tetri) }) : '')) + '</div></div>' +
    '<span class="tag ' + (p.status === 'succeeded' ? 'ok' : 'warn') + '">' + esc(t(PSTATUS[p.status] || p.status)) + '</span></div>').join('') + '</div>' : '';
  return { title: t('Plan & payments'), body: top + hist +
    '<p class="mute small">' + t('Questions about a payment? Write to us through Feedback.') + (L() ? ' <span class="link" style="display:inline" onclick="A.legal(\'refunds\')">' + t('Payments & refunds') + '</span>' : '') + '</p>' };
};
A.subCancelAsk = (subId) => {
  const sub = currentSub(); if (!sub) return;
  sheet('<div class="h2">' + t('Cancel your plan?') + '</div><p class="lead">' + esc(t('You keep everything until {date}. After that there are no more payments, and your coach sees that your plan has stopped.', { date: day(sub.current_period_end) })) + '</p>' +
    '<button class="btn danger" onclick="A.subCancel(\'' + subId + '\',true)">' + t('Cancel plan') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Keep my plan') + '</button>');
};
A.subCancel = async (subId, cancel) => {
  busy(true);
  try { await db.subCancel(subId, cancel); closeSheet(); await loadBilling(); busy(false); toast(cancel ? t('Your plan will stop at the end of the month') : t('Your plan continues')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.subResume = (subId) => A.subCancel(subId, false);
export function billingRow(row) { return S.payOn && S.me.role === 'trainee' ? row('--c-protein', "A.go('billing')", t('Plan & payments'), esc(planPayLine() || t('Card payments for your coach\'s plan'))) : ''; }

// ---------------------------------------------------------------- coach: bank account + earnings
SCREENS.earnings = () => {
  const e = S.earnings;
  if (!e) return { title: t('Payments'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { S.earnings = await db.coachEarnings(); } catch (x) { S.earnings = { months: [], clients: [] }; } rerender(); } };
  const acc = e.account;
  const accCard = !acc ? '<div class="card amber"><div class="h3">' + t('Add your TBC account') + '</div><div class="s" style="color:var(--a-ink2)">' + t('Clients pay by card in the app. Your 85 % goes straight to your TBC Bank account with each payment; Tune Up keeps 15 %. Until the account is added and checked, clients cannot pay you in the app.') + '</div><button class="btn sm" onclick="A.payoutSheet()">' + t('Add account') + '</button></div>'
    : '<div class="card"><div class="row between"><div class="eyebrow">' + t('Your TBC account') + '</div><span class="tag ' + (acc.status === 'verified' ? 'ok' : 'warn') + '">' + esc(t(acc.status === 'verified' ? 'Confirmed' : acc.status === 'rejected' ? 'Needs a fix' : 'Being checked')) + '</span></div>' +
      '<div class="h3">' + esc(acc.holder) + ' · •••• ' + esc(acc.iban_last4) + '</div>' + (acc.note ? '<div class="s">' + esc(acc.note) + '</div>' : '') +
      '<span class="link small" onclick="A.payoutSheet()">' + t('Change account') + '</span></div>';
  const months = (e.months || []).length ? '<div class="eyebrow grp">' + t('Earnings') + '</div><div class="card menu">' + e.months.map(m =>
    '<div class="lrow" style="cursor:default"><div class="grow"><div class="t">' + esc(monthName(m.month)) + '</div><div class="s">' + esc(t(m.payments === 1 ? '1 payment · {gross} paid by clients' : '{n} payments · {gross} paid by clients', { n: m.payments, gross: money(m.gross_tetri) })) + '</div></div><div class="h3">' + money(m.coach_tetri) + '</div></div>').join('') + '</div>'
    : '<div class="card flat mute">' + t('No payments yet. When a client pays for your plan, it shows here.') + '</div>';
  const STAT = { active: 'Paid', past_due: 'Payment failed', paused: 'Paused' };
  const clients = (e.clients || []).length ? '<div class="eyebrow grp">' + t('Paying clients') + '</div><div class="card menu">' + e.clients.map(c =>
    '<div class="lrow" style="cursor:default"><div class="grow"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc(c.plan + ' · ' + money(c.amount_tetri) + ' · ' + (c.stopping ? t('stops on {date}', { date: day(c.until) }) : t('until {date}', { date: day(c.until) }))) + '</div></div>' +
    '<span class="tag ' + (c.status === 'active' ? 'ok' : 'warn') + '">' + esc(t(STAT[c.status] || c.status)) + '</span></div>').join('') + '</div>' : '';
  return { title: t('Payments'), body: accCard + months + clients };
};
function monthName(ym) { const [y, m] = String(ym).split('-').map(Number); return fmtDate(new Date(y, m - 1, 15), 'my'); }
A.payoutSheet = () => {
  sheet('<div class="h2">' + t('Your TBC account') + '</div><p class="lead">' + t('Your share of each payment goes to this account. It must be a TBC Bank account in your name.') + '</p>' +
    field(t('Account number (IBAN)'), 'po_iban', '', { ph: 'GE00TB0000000000000000', attrs: ' autocapitalize="characters" autocorrect="off" spellcheck="false"' }) +
    field(t('Account holder'), 'po_holder', S.me.name || '', {}) + '<div class="err" id="err"></div>' +
    '<button class="btn" onclick="A.payoutSave()">' + t('Save') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>');
};
A.payoutSave = async () => {
  const iban = String(val('po_iban') || '').toUpperCase().replace(/\s/g, ''); const holder = String(val('po_holder') || '').trim();
  const err = document.getElementById('err');
  if (!/^GE\d{2}TB\d{16}$/.test(iban)) { if (err) err.textContent = t('That is not a TBC account number. It starts with GE, has TB in it, and is 22 characters long.'); return; }
  if (holder.length < 2) { if (err) err.textContent = t('Write the name on the account.'); return; }
  busy(true);
  try { await db.coachSetPayout(iban, holder); closeSheet(); S.earnings = null; busy(false); toast(t('Saved — we will check it within a day')); rerender(); }
  catch (e) { busy(false); if (err) err.textContent = t('Could not save — try again'); }
};
export function earningsRow(row) { return S.payOn && S.me.role === 'coach' ? row('--c-protein', "A.go('earnings')", t('Payments'), t('Your bank account and earnings')) : ''; }

// ---------------------------------------------------------------- admin: payments
SCREENS.abilling = (prm) => {
  const b = S.adminBilling;
  if (!b || (prm.month && b.month !== prm.month)) return { title: t('Payments'), body: '<div class="card flat mute">' + t('Loading…') + '</div>', after: async () => { try { S.adminBilling = await db.adminBilling(prm.month || null); } catch (e) { S.adminBilling = { error: true, payments: [], accounts: [], trouble: [], totals: {} }; } rerender(); } };
  const [y, m] = String(b.month || '').split('-').map(Number); const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
  const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const tot = b.totals || {};
  const head = '<div class="row between"><button class="btn xs sec" onclick="A.go(\'abilling\',{month:\'' + ym(prev) + '\'})">‹</button><div class="h3">' + esc(monthName(b.month)) + '</div><button class="btn xs sec" onclick="A.go(\'abilling\',{month:\'' + ym(next) + '\'})">›</button></div>' +
    '<div class="card"><div class="row between"><div class="eyebrow">' + t('Mode') + '</div><span class="tag ' + (b.mode === 'live' ? 'ok' : 'warn') + '">' + esc(b.mode === 'live' ? t('Real money') : b.mode === 'test' ? t('Test mode') : t('Off')) + '</span></div>' +
    '<div class="lrow" style="padding:6px 0;min-height:0"><div class="grow mute">' + t('Paid by clients') + '</div><div class="t">' + money(tot.gross_tetri) + '</div></div>' +
    '<div class="lrow" style="padding:6px 0;min-height:0"><div class="grow mute">' + t('Tune Up\'s 15 %') + '</div><div class="t">' + money(tot.fee_tetri) + '</div></div>' +
    '<div class="lrow" style="padding:6px 0;min-height:0"><div class="grow mute">' + t('Refunded') + '</div><div class="t">' + money(tot.refunded_tetri) + '</div></div>' +
    '<span class="link small" onclick="A.billingCsv()">' + t('Download this month (CSV)') + '</span></div>';
  const accounts = (b.accounts || []).filter(a => a.status !== 'verified');
  const accHtml = accounts.length ? '<div class="eyebrow grp">' + t('Coach accounts to check') + '</div>' + accounts.map(a =>
    '<div class="card"><div class="h3">' + esc(a.coach) + '</div><div class="mono">' + esc(a.iban) + '</div><div class="s">' + esc(a.holder) + (a.status === 'rejected' ? ' · ' + t('Needs a fix') : '') + '</div>' +
    '<div class="btn-row"><button class="btn sm" onclick="A.payoutVerify(\'' + a.coach_id + '\',true)">' + t('Confirm') + '</button><button class="btn sm sec" onclick="A.payoutFixSheet(\'' + a.coach_id + '\')">' + t('Ask to fix') + '</button></div></div>').join('') : '';
  const trouble = (b.trouble || []).length ? '<div class="eyebrow grp">' + t('Needs attention') + '</div><div class="card menu">' + b.trouble.map(x =>
    '<div class="lrow" style="cursor:default"><div class="grow"><div class="t">' + esc(x.trainee + ' → ' + x.coach) + '</div><div class="s">' + esc(x.plan + ' · ' + t(x.status === 'paused' ? 'Paused' : 'Payment failed') + (x.retries ? ' · ' + t(x.retries === 1 ? '1 try' : '{n} tries', { n: x.retries }) : '')) + '</div></div></div>').join('') + '</div>' : '';
  const PST = { succeeded: 'Paid', failed: 'Failed', refunded: 'Refunded', partly_refunded: 'Partly refunded', pending: 'Waiting', created: 'Started' };
  const pays = (b.payments || []).length ? '<div class="eyebrow grp">' + t('Payments') + '</div><div class="card menu">' + b.payments.map(p =>
    '<div class="lrow"' + (p.status === 'succeeded' || p.status === 'partly_refunded' ? ' style="cursor:pointer" onclick="A.refundSheet(\'' + p.id + '\')"' : ' style="cursor:default"') + '><div class="grow"><div class="t">' + esc((p.trainee || t('Deleted account')) + ' → ' + (p.coach || '—')) + '</div><div class="s">' + esc(day(p.at) + ' · ' + p.plan + ' · ' + t(p.kind === 'renewal' ? 'renewal' : 'first payment') + (p.reason ? ' · ' + p.reason : '')) + '</div></div>' +
    '<div style="text-align:right"><div class="t">' + money(p.amount_tetri) + '</div><span class="tag ' + (p.status === 'succeeded' ? 'ok' : 'warn') + '">' + esc(t(PST[p.status] || p.status)) + '</span></div></div>').join('') + '</div>' : '<div class="card flat mute">' + t('No payments this month.') + '</div>';
  return { title: t('Payments'), body: head + accHtml + trouble + pays };
};
A.payoutFixSheet = (coachId) => sheet('<div class="h2">' + t('Ask to fix') + '</div>' + field(t('What should the coach fix?'), 'po_note', '', { ph: t('e.g. the name does not match the account') }) +
  '<button class="btn" onclick="A.payoutVerify(\'' + coachId + '\',false)">' + t('Send') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>');
A.payoutVerify = async (coachId, ok) => {
  const note = ok ? '' : String(val('po_note') || '').trim();
  if (!ok && !note) return;
  busy(true);
  try { await db.adminVerifyPayout(coachId, ok, note); closeSheet(); S.adminBilling = null; busy(false); toast(ok ? t('Account confirmed') : t('Sent to the coach')); rerender(); }
  catch (e) { busy(false); toast(t('Could not save — try again'), 'err'); }
};
A.refundSheet = (payId) => {
  const p = ((S.adminBilling || {}).payments || []).find(x => x.id === payId); if (!p) return;
  const left = p.amount_tetri - (p.refunded_tetri || 0);
  sheet('<div class="h2">' + t('Refund') + '</div><p class="lead">' + esc((p.trainee || '') + ' · ' + p.plan + ' · ' + money(p.amount_tetri) + (p.refunded_tetri ? ' · ' + t('{amount} back', { amount: money(p.refunded_tetri) }) : '')) + '</p>' +
    field(t('Amount (₾)'), 'rf_amt', String(left / 100), { type: 'number', attrs: ' step="0.01" min="0.01"' }) +
    field(t('Reason'), 'rf_reason', '', { ph: t('e.g. coach did not start') }) + '<div class="err" id="err"></div>' +
    '<button class="btn danger" onclick="A.refundGo(\'' + payId + '\',' + left + ')">' + t('Send refund') + '</button><button class="btn sec" onclick="A.closeSheet()">' + t('Cancel') + '</button>');
};
A.refundGo = async (payId, left) => {
  const amt = Math.round(Number(String(val('rf_amt') || '').replace(',', '.')) * 100); const err = document.getElementById('err');
  if (!(amt > 0) || amt > left) { if (err) err.textContent = t('Up to {amount}', { amount: money(left) }); return; }
  busy(true);
  try { await db.payRefund(payId, amt, val('rf_reason') || ''); closeSheet(); S.adminBilling = null; busy(false); toast(t('Refund sent')); rerender(); }
  catch (e) { busy(false); if (err) err.textContent = t('The refund did not go through — try again.'); }
};
A.billingCsv = () => {
  const b = S.adminBilling; if (!b) return;
  const rows = [['date', 'trainee', 'coach', 'plan', 'kind', 'status', 'amount_gel', 'tune_up_fee_gel', 'coach_share_gel', 'refunded_gel']].concat((b.payments || []).map(p =>
    [String(p.at || '').slice(0, 10), p.trainee || '', p.coach || '', p.plan, p.kind, p.status, p.amount_tetri / 100, p.fee_tetri / 100, p.coach_tetri / 100, (p.refunded_tetri || 0) / 100]));
  const csv = rows.map(r => r.map(x => { const s = String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'tuneup-payments-' + b.month + '.csv'; document.body.appendChild(a); a.click(); a.remove();
};
