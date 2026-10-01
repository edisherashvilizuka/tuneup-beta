/* Tune Up beta — public settings. Only public values belong here (they ship to every phone).
   supabaseUrl / supabaseKey — from Supabase → Settings → API (Project URL + publishable/anon key)
   proxy   — Tune's AI relay (Netlify Function; the Anthropic key lives in Netlify env vars, never here)
   posthog — PostHog project key (phc_…); empty = no usage stats */
window.TUNE_CFG = {
  supabaseUrl: 'https://tlpquinatxrpxgcqphpv.supabase.co',
  supabaseKey: 'sb_publishable_oObQxyEOBgQc88SnDh2xDQ_yQ1RfMs0',
  proxy: '/.netlify/functions/tune',
  posthog: '',
  posthogHost: 'https://eu.i.posthog.com',
  beta: true
};
