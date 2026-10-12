/* Tune Up beta — public settings. Only public values belong here (they ship to every phone).
   supabaseUrl / supabaseKey — from Supabase → Settings → API (Project URL + publishable/anon key)
   proxy   — Tune's AI relay (Netlify Function; the Anthropic key lives in Netlify env vars, never here)
   posthog — PostHog project key (phc_…); empty = no usage stats
   vapidPublic — public half of the push-notification key pair (the private half is a Supabase secret) */
window.TUNE_CFG = {
  supabaseUrl: 'https://tlpquinatxrpxgcqphpv.supabase.co',
  supabaseKey: 'sb_publishable_oObQxyEOBgQc88SnDh2xDQ_yQ1RfMs0',
  proxy: '/.netlify/functions/tune',
  posthog: 'phc_CCypmPS8SXGwYMCTqQUiAc6gRmNYegCkTwP98cCceeeD',
  posthogHost: 'https://eu.i.posthog.com',
  vapidPublic: 'BKHuN3pdKyj1ty8o5tTKPW0v3TykTc53PZY6XwCu6WJ8htyFZDspy7kEq8y-QYPPEsZJgsL9puoVT7snN8p3OTg',
  beta: true
};
