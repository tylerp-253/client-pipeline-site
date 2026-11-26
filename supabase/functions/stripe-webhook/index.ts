// Client Pipeline: receives Stripe events and keeps each profile's plan and
// subscription status in step with Stripe.
//
// In Stripe, add a webhook endpoint pointing at this function's URL with these
// events: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...),
//          STRIPE_PRICE_APP, STRIPE_PRICE_COACHING.
// Deploy with JWT verification turned OFF: Stripe can't send a Supabase login,
// so this function checks Stripe's signature instead.

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

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(payload: string, header: string, secret: string, toleranceSec = 300): Promise<boolean> {
  const parts = header.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => sameText(s, expected));
}

// deno-lint-ignore no-explicit-any
async function getSubscription(id: string): Promise<any> {
  const base = (Deno.env.get('STRIPE_API_BASE') || 'https://api.stripe.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
  });
  if (!res.ok) throw new Error(`Stripe subscription lookup failed: ${res.status}`);
  return res.json();
}

function planFor(priceId: string | undefined): string | null {
  if (priceId && priceId === Deno.env.get('STRIPE_PRICE_APP')) return 'app';
  if (priceId && priceId === Deno.env.get('STRIPE_PRICE_COACHING')) return 'coaching';
  return null;
}

// deno-lint-ignore no-explicit-any
async function syncSubscription(sub: any, userHint?: string | null): Promise<void> {
  const item = sub?.items?.data?.[0];
  const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
  const fields = {
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    plan: planFor(item?.price?.id),
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
  const userId = sub.metadata?.user_id || userHint;
  const filter = userId
    ? `id=eq.${encodeURIComponent(userId)}`
    : `stripe_customer_id=eq.${encodeURIComponent(fields.stripe_customer_id)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${filter}`, {
    method: 'PATCH', headers: serverHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Profile update failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (!rows.length) console.warn('No profile matched subscription', sub.id, filter);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('Webhook secret not set', { status: 503 });
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';
  if (!(await verifySignature(payload, signature, secret))) return new Response('Bad signature', { status: 400 });

  try {
    const event = JSON.parse(payload);
    const obj = event?.data?.object ?? {};
    // Stripe sends several events at once after a checkout and doesn't promise
    // the order. Each event's copy of the subscription is a snapshot from when
    // it was created, so an old "incomplete" one can land after "active". We
    // always look up the subscription as it is now, so the order doesn't matter.
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription' && obj.subscription) {
          const sub = await getSubscription(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id);
          await syncSubscription(sub, obj.client_reference_id);
        }
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        if (obj.id) await syncSubscription(await getSubscription(obj.id));
        break;
      default:
        break;
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    // A 500 makes Stripe retry the event later, which is what we want.
    return new Response('Webhook handler failed', { status: 500 });
  }
}

Deno.serve(handler);
