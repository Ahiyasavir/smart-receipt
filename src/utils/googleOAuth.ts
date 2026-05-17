/**
 * Google OAuth 2.0 (PKCE) — frontend half of the Gmail-connect flow.
 *
 * The browser only ever handles the public client_id, a PKCE code_verifier,
 * and the short-lived authorization `code`. The code is exchanged for tokens
 * SERVER-SIDE (Supabase Edge Function) using GOOGLE_CLIENT_SECRET, which never
 * reaches this bundle. The resulting refresh_token is stored server-side only.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

const VERIFIER_KEY = 'smartreceipt_gmail_pkce_verifier';
const STATE_KEY    = 'smartreceipt_gmail_oauth_state';

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(len = 64): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer).slice(0, len);
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

/** Where Google redirects back; the SPA handles this path on load. */
export function gmailRedirectUri(): string {
  return `${window.location.origin}/oauth/google/callback`;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

/**
 * Begin the consent flow. Generates a PKCE verifier + CSRF state, stashes them
 * in sessionStorage, and redirects the browser to Google.
 */
export async function startGmailOAuth(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured.');
  }

  const verifier  = randomString(64);
  const challenge = await s256(verifier);
  const state     = randomString(24);

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id:              clientId,
    redirect_uri:           gmailRedirectUri(),
    response_type:          'code',
    scope:                  GMAIL_READONLY,
    access_type:            'offline', // → refresh_token for background sync
    prompt:                 'consent', // force refresh_token on reconnect
    include_granted_scopes: 'true',
    code_challenge:         challenge,
    code_challenge_method:  'S256',
    state,
  });

  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

export interface OAuthCallbackParams {
  code: string;
  verifier: string;
  redirectUri: string;
}

/**
 * Read the callback params after Google redirects back. Validates CSRF state
 * and returns the code + PKCE verifier to hand to the server-side exchanger.
 * Returns null when the current URL is not an OAuth callback.
 */
export function readGmailOAuthCallback(): OAuthCallbackParams | null {
  const url = new URL(window.location.href);
  if (!url.pathname.includes('/oauth/google/callback')) return null;

  const code        = url.searchParams.get('code');
  const state        = url.searchParams.get('state');
  const savedState   = sessionStorage.getItem(STATE_KEY);
  const verifier     = sessionStorage.getItem(VERIFIER_KEY);

  if (!code || !state || state !== savedState || !verifier) return null;

  return { code, verifier, redirectUri: gmailRedirectUri() };
}

/**
 * Hand the authorization code to the server-side Edge Function for the secret
 * exchange. The browser never sees the client secret or refresh token — only
 * a { connected: true } result.
 */
export async function exchangeGmailCode(
  params: OAuthCallbackParams,
  accessToken: string,
): Promise<{ connected: boolean; email?: string | null }> {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${base}/functions/v1/google-oauth-callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      code:        params.code,
      verifier:    params.verifier,
      redirectUri: params.redirectUri,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `Token exchange failed (${res.status})`);
  }
  return res.json();
}

export function clearGmailOAuthState(): void {
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  // Strip OAuth params from the URL without a reload.
  window.history.replaceState({}, document.title, window.location.origin + '/');
}
