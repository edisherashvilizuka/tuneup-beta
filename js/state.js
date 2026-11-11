// Tune Up beta — in-memory app state (nothing here is persisted except via Supabase or the small localStorage keys noted).
export const S = {
  session: null,     // Supabase session
  me: null,          // profiles row of the signed-in user
  invite: null,      // pending invite from the URL: {kind:'client'|'coach', code, info}
  pair: null,        // trainee: current/last pair with coach; coach: unused
  clients: [],       // coach: pairs with trainees
  draft: {},         // current form draft
  unread: 0          // unread notifications (bell)
};

const INV_KEY = 'tuneup-invite';
export function readInviteFromUrl() {
  try {
    const u = new URL(location.href);
    const c = u.searchParams.get('invite'), k = u.searchParams.get('coach');
    if (c || k) {
      S.invite = { kind: k ? 'coach' : 'client', code: (k || c).toUpperCase().trim() };
      localStorage.setItem(INV_KEY, JSON.stringify(S.invite));
      u.searchParams.delete('invite'); u.searchParams.delete('coach');
      history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    } else {
      const raw = localStorage.getItem(INV_KEY);
      if (raw) S.invite = JSON.parse(raw);
    }
  } catch (e) { S.invite = S.invite || null; }
}
export function setInvite(inv) { S.invite = inv; try { localStorage.setItem(INV_KEY, JSON.stringify({ kind: inv.kind, code: inv.code })); } catch (e) {} }
export function clearInvite() { S.invite = null; try { localStorage.removeItem(INV_KEY); } catch (e) {} }
export function forgetInvite() { try { localStorage.removeItem(INV_KEY); } catch (e) {} }   // keep it in memory for this load only

// public sign-up (Launch 1): which role the person chose on the welcome screen, kept across the e-mail code round-trip
const SIGNUP_KEY = 'tuneup-signup';
export function setSignup(role) { S.signup = role ? { role } : null; try { if (role) localStorage.setItem(SIGNUP_KEY, role); else localStorage.removeItem(SIGNUP_KEY); } catch (e) {} }
export function readSignup() { try { const r = localStorage.getItem(SIGNUP_KEY); if (r === 'trainee' || r === 'coach') S.signup = { role: r }; } catch (e) {} }
export function clearSignup() { setSignup(null); }
// the trainee's pairs: S.pair = the active one (coach or solo: plan, targets, logs); S.trial = a trial pair with a coach (chat, the trial session)
export function coachPair() { if (S.pair && S.pair.kind === 'coach' && S.pair.status === 'active') return S.pair; return S.trial || null; }
export function isSolo() { return !!(S.pair && S.pair.kind === 'solo' && S.pair.status === 'active'); }
