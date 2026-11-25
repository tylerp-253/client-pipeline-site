// Client Pipeline: open Stripe's customer portal so people can update their
// card, switch plans, see invoices or cancel. Returns { url }.
//
// Secrets: STRIPE_SECRET_KEY, APP_URL (same as create-checkout), ALLOWED_ORIGIN optional.
// Deploy with JWT verification turned OFF.

// ---------- shared helpers (repeated in each function so each file stands alone) ----------

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');

function secretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      const value = keys.default ?? Object.values(keys)[0];
      if (typeof value === 'string' && value) return value;
    } catch { /* fall through to the legacy key */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('No Supabase secret key is available to this function.');
}

function serverHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = secretKey();
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}

function fail(status: number, error: string, message: string): Response {
  return reply(status, { error, message });
}

async function signedInUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: secretKey(), Authorization: auth } });
  if (!res.ok) return null;
  const user = await res.json();
  return user && typeof user.id === 'string' ? user : null;
}

async function loadProfile(id: string): Promise<{ stripe_customer_id: string | null } | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`, { headers: serverHeaders() });
  if (!res.ok) throw new Error(`Profile lookup failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

// ---------- this function ----------

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  try {
    const user = await signedInUser(req);
    if (!user) return fail(401, 'not_signed_in', 'Sign in again, then retry.');
    const profile = await loadProfile(user.id);
    if (!profile?.stripe_customer_id) return fail(404, 'no_customer', 'There is no billing account yet. Choose a plan first.');
    const key = Deno.env.get('STRIPE_SECRET_KEY'), appUrl = Deno.env.get('APP_URL');
    if (!key || !appUrl) return fail(503, 'not_configured', 'Payments are not set up yet.');
    const base = (Deno.env.get('STRIPE_API_BASE') || 'https://api.stripe.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/billing_portal/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `customer=${encodeURIComponent(profile.stripe_customer_id)}&return_url=${encodeURIComponent(appUrl.split('#')[0] + '#billing')}`,
    });
    const body = await res.json();
    if (!res.ok) {
      console.error('Stripe error', res.status, body?.error?.message);
      return fail(502, 'stripe_error', 'Stripe could not open billing. Try again.');
    }
    return reply(200, { url: body.url });
  } catch (e) {
    console.error(e);
    return fail(500, 'server_error', 'Something went wrong. Try again.');
  }
}

Deno.serve(handler);
