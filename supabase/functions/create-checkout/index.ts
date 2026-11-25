// Client Pipeline: start a Stripe Checkout for a subscription.
//
// The app sends { plan: "app" | "coaching" }. Only approved people can buy.
// Returns { url } to redirect the browser to Stripe.
//
// Secrets this function reads (Edge Functions > Secrets):
//   STRIPE_SECRET_KEY      required (sk_test_... while testing, sk_live_... for real)
//   STRIPE_PRICE_APP       required, the price ID of the $300/month plan (price_...)
//   STRIPE_PRICE_COACHING  required, the price ID of the $1,500/month plan
//   APP_URL                required, the app's address, e.g. https://you.github.io/client-pipeline-site/app/
//   ALLOWED_ORIGIN         optional, defaults to *
//
// Deploy with JWT verification turned OFF: this function checks the
// signed-in user itself.

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

type User = { id: string; email?: string };
type Profile = {
  id: string; email: string; status: string; is_admin: boolean; comped: boolean;
  plan: string | null; subscription_status: string | null; stripe_customer_id: string | null;
};

async function signedInUser(req: Request): Promise<User | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: secretKey(), Authorization: auth } });
  if (!res.ok) return null;
  const user = await res.json();
  return user && typeof user.id === 'string' ? user : null;
}

async function loadProfile(id: string): Promise<Profile | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`, { headers: serverHeaders() });
  if (!res.ok) throw new Error(`Profile lookup failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

async function updateProfile(filter: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${filter}`, {
    method: 'PATCH', headers: serverHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Profile update failed: ${res.status} ${await res.text()}`);
}

function formEncode(obj: Record<string, unknown>, prefix = '', out: string[] = []): string {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v as Record<string, unknown>, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

// deno-lint-ignore no-explicit-any
async function stripe(path: string, params?: Record<string, unknown>, method = 'POST'): Promise<any> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw Object.assign(new Error('STRIPE_SECRET_KEY is not set'), { code: 'not_configured' });
  const base = (Deno.env.get('STRIPE_API_BASE') || 'https://api.stripe.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : formEncode(params ?? {}),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('Stripe error', res.status, body?.error?.message);
    throw Object.assign(new Error(body?.error?.message || `Stripe returned ${res.status}`), { code: 'stripe_error' });
  }
  return body;
}

// ---------- this function ----------

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  try {
    const user = await signedInUser(req);
    if (!user) return fail(401, 'not_signed_in', 'Sign in again, then retry.');
    const profile = await loadProfile(user.id);
    if (!profile || (profile.status !== 'approved')) return fail(403, 'not_approved', 'Your account is waiting for approval.');
    if (['active', 'trialing', 'past_due'].includes(profile.subscription_status ?? '')) {
      return fail(409, 'already_subscribed', 'You already have a plan. Use Manage billing to change it.');
    }

    let body: { plan?: string } = {};
    try { body = await req.json(); } catch { /* handled below */ }
    const prices: Record<string, string | undefined> = {
      app: Deno.env.get('STRIPE_PRICE_APP'), coaching: Deno.env.get('STRIPE_PRICE_COACHING'),
    };
    const plan = String(body.plan ?? '');
    if (!(plan in prices)) return fail(400, 'unknown_plan', 'Choose the app plan or the coaching plan.');
    const price = prices[plan];
    const appUrl = Deno.env.get('APP_URL');
    if (!price || !appUrl) return fail(503, 'not_configured', 'Payments are not set up yet.');

    let customer = profile.stripe_customer_id;
    if (!customer) {
      const created = await stripe('customers', { email: profile.email || user.email, metadata: { user_id: user.id } });
      customer = created.id as string;
      await updateProfile(`id=eq.${encodeURIComponent(user.id)}`, { stripe_customer_id: customer });
    }

    const back = appUrl.split('#')[0];
    const join = back.includes('?') ? '&' : '?';
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: { 0: { price, quantity: 1 } },
      allow_promotion_codes: 'true',
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
      success_url: `${back}${join}checkout=success#billing`,
      cancel_url: `${back}${join}checkout=cancel#billing`,
    });
    return reply(200, { url: session.url });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'not_configured') return fail(503, 'not_configured', 'Payments are not set up yet.');
    if (code === 'stripe_error') return fail(502, 'stripe_error', 'Stripe could not start checkout. Try again.');
    console.error(e);
    return fail(500, 'server_error', 'Something went wrong. Try again.');
  }
}

Deno.serve(handler);
