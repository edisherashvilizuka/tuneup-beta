// Tune Up beta — in-memory app state (nothing here is persisted except via Supabase or the small localStorage keys noted).
export const S = {
  session: null,     // Supabase session
  me: null,          // profiles row of the signed-in user
  invite: null,      // pending invite from the URL: {kind:'client'|'coach', code, info}
  pair: null,        // trainee: current/last pair with coach; coach: unused
  clients: [],       // coach: pairs with trainees
  draft: {}          // current form draft
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
export function clearInvite() { S.invite = null; try { localStorage.removeItem(INV_KEY); } catch (e) {} }
export function forgetInvite() { try { localStorage.removeItem(INV_KEY); } catch (e) {} }   // keep it in memory for this load only
