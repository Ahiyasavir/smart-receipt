// Supabase Edge Function (Deno) — Google OAuth token exchange.
//
// Deploy:  supabase functions deploy google-oauth-callback --no-verify-jwt
// Secrets: supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
//            SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//
// This is the ONLY place GOOGLE_CLIENT_SECRET and the refresh_token exist.
// Neither is ever returned to the browser. NOT part of the Vite/tsc build
// (lives outside `src`, runs on Deno).
//
// Flow: receive { code, verifier, redirectUri } + the caller's Supabase JWT →
// resolve user_id → exchange code at Google → upsert refresh_token into
// gmail_connections (service role) → return { connected: true } only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { code, verifier, redirectUri } = await req.json();
    if (!code || !verifier || !redirectUri) {
      return json({ error: 'missing_params' }, 400);
    }

    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    // 1. Identify the user from their Supabase access token.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    // 2. Exchange the authorization code (server-side, with the secret).
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
        code_verifier: verifier,
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      // No refresh_token usually means the user previously consented without
      // prompt=consent. The frontend uses prompt=consent to avoid this.
      return json({ error: 'no_refresh_token', detail: tokens.error ?? null }, 400);
    }

    // 3. Persist server-side only, tightly mapped to the user.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let email: string | null = null;
    try {
      const profileRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (profileRes.ok) email = (await profileRes.json()).email ?? null;
    } catch { /* email is optional */ }

    const { error: upsertErr } = await admin
      .from('gmail_connections')
      .upsert({
        user_id:       userId,
        email_address: email,
        refresh_token: tokens.refresh_token,
        status:        'connected',
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertErr) return json({ error: 'persist_failed', detail: upsertErr.message }, 500);

    // 4. (Optional) kick an immediate backfill of the last 24h of alerts.
    //    Implemented by the gmail-sync function; invoked fire-and-forget so the
    //    user sees "connected" instantly.
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sinceHours: 24 }),
      });
    } catch { /* non-fatal: scheduled sync will catch up */ }

    return json({ connected: true, email });
  } catch (e) {
    return json({ error: 'exchange_failed', detail: String(e) }, 500);
  }
});
