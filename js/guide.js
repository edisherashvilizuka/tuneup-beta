// Tune Up beta — "How to start" guides for trainers and clients (More → How Tune Up works; a one-time card on Today).
import { t, esc } from './i18n.js';
import { SCREENS, A, I, rerender } from './ui.js';
import { S } from './state.js';

const SEEN = 'tuneup-guide-seen';
function seenKey() { return SEEN + ':' + ((S.me && S.me.id) || ''); }   // per person, so a second account on the same phone still gets the card
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const COACH = [
  ['Put it on your phone', isIOS ? 'In Safari tap Share, then “Add to Home Screen”. Open Tune Up from that icon, go to More and turn on notifications.' : 'In Chrome tap the three dots, then “Add to Home screen”. Open Tune Up from that icon, go to More and turn on notifications.'],
  ['Invite your clients', 'More → Invite links → New invite link. Send the link in any messenger. One link per client; they sign up in a minute and land in your Clients list.'],
  ['Build the weekly plan', 'Clients → tap a client → Weekly plan → tap a day → Add exercise. Pick from the library or add your own moves with a YouTube or Drive link (More → My exercises). Sets × reps × load.'],
  ['Set targets and goals', 'On the client screen: calories, protein, water, steps for the day, and one short list of goals. The client sees them on Today.'],
  ['Plan the sessions', 'Calendar → + → gym or video call (paste your Meet/Zoom link). Weekly or one-time. Moving or cancelling tells the client automatically.'],
  ['Every day: who needs your eye', 'Today shows who missed a workout, ate little protein, had a low mood or wrote you a note. Tap a client for the last 7 days and your private notes.'],
  ['Chat and Tune', 'Chat is for questions, how a session went and form-check clips (send a link). “Ask Tune about …” gives you a quick summary of a client’s week.'],
  ['Tell us what is wrong', 'More → Send feedback. We read every note and fix things within days. This is a beta: your feedback shapes the app.']
];
const TRAINEE = [
  ['Put it on your phone', isIOS ? 'In Safari tap Share, then “Add to Home Screen”. Open Tune Up from that icon, go to More and turn on notifications.' : 'In Chrome tap the three dots, then “Add to Home screen”. Open Tune Up from that icon, go to More and turn on notifications.'],
  ['Every day: Today', 'Tick exercises as you do them. Add food (calories and protein, roughly is fine), tap + 250 for water, add your steps and weigh yourself in the morning.'],
  ['Evening check-in', 'One tap for how the day went and a line for your coach — sore knee, slept badly, felt great. Your coach sees it the next morning.'],
  ['Plan and Sessions', 'Plan shows your week from your coach. Sessions shows what is coming up; for a video call just tap Join.'],
  ['Chat', 'Questions, how a session went, a link to a short clip of your form — it all goes to your coach here.'],
  ['Ask Tune', 'Tune answers from your own data: “what is left to eat today?”, “what is my workout?”. Or just type “I ate two eggs and a toast” and it logs it for you.'],
  ['Tell us what is wrong', 'More → Send feedback. We read every note and fix things within days. This is a beta: your feedback shapes the app.']
];

export function guideSteps() { return S.me && S.me.role === 'coach' ? COACH : TRAINEE; }

SCREENS.guide = () => ({ title: t('How Tune Up works'), sub: S.me && S.me.role === 'coach' ? t('For trainers') : t('For clients'), tabs: false, body:
  '<div class="col" style="gap:10px">' + guideSteps().map((s, i) => '<div class="card"><div class="row" style="gap:12px;align-items:flex-start"><div class="avatar" style="background:var(--a-accent);flex:none">' + (i + 1) + '</div><div class="grow"><div class="h3">' + esc(t(s[0])) + '</div><div class="mute">' + esc(t(s[1])) + '</div></div></div></div>').join('') + '</div>' +
  '<div class="mute small" style="text-align:center;margin-top:12px">' + t('Questions? Write to us from More → Send feedback.') + '</div>' });

A.guideSeen = () => { try { localStorage.setItem(seenKey(), '1'); } catch (e) {} rerender(); };
A.openGuide = () => { A.guideSeen(); A.go('guide'); };

// one-time card on Today until the guide is opened or dismissed
export function guideCard() {
  let seen = false; try { seen = !!localStorage.getItem(seenKey()); } catch (e) {}
  if (seen) return '';
  return '<div class="card soft"><div class="h3">' + t('New here? Two minutes to get going') + '</div><div class="mute">' + (S.me && S.me.role === 'coach' ? t('Invite clients, build a plan, set targets, plan sessions — the short version.') : t('What to log every day and how to talk to your coach — the short version.')) + '</div><div class="btn-row"><button class="btn sm" onclick="A.openGuide()">' + t('Read the guide') + '</button><button class="btn sec sm" onclick="A.guideSeen()">' + t('Got it') + '</button></div></div>';
}
export function guideRow() {
  return '<div class="lrow" style="cursor:pointer" onclick="A.go(\'guide\')"><div class="grow"><div class="t">' + t('How Tune Up works') + '</div><div class="s">' + t('The two-minute guide') + '</div></div>' + I.chev + '</div>';
}
