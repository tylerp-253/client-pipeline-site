// Client Pipeline: notification emails, sent through Resend.
//
//   { event: "signup" }                  called by the app when a new person lands on
//                                        "You're on the list". Emails the admin, once.
//   { event: "approved", target: "<id>" } called by the app when an admin approves someone.
//                                        Emails that person, once. Only admins can call it.
//
// Each email is sent at most once per person: the profile records when it went out.
//
// Secrets this function reads (Edge Functions > Secrets):
//   RESEND_API_KEY   required, from resend.com (the same account as your sign-in emails)
//   NOTIFY_FROM      required, e.g. Client Pipeline <hello@mail.tylerpigott.com>,
//                    on a domain you've verified in Resend
//   ADMIN_EMAIL      optional, who hears about new requests, defaults to me@tylerpigott.com
//   APP_URL          required (already set for checkout)
//   ALLOWED_ORIGIN   optional, defaults to *
//
// Deploy with JWT verification turned OFF: this function checks the signed-in user itself.

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

type Profile = { id: string; email: string; status: string; is_admin: boolean };

async function signedInUser(req: Request): Promise<{ id: string } | null> {
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

// ---------- this function ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Marks the email as sent, but only if it hasn't been already. Returns true
// when this call won the right to send, so two calls can't both send.
async function claim(id: string, column: string, extraFilter = ''): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&${column}=is.null${extraFilter}`, {
    method: 'PATCH', headers: serverHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ [column]: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Claim failed: ${res.status}`);
  return (await res.json()).length === 1;
}

async function release(id: string, column: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: serverHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ [column]: null }),
  }).catch(() => {});
}

async function sendEmail(to: string, subject: string, text: string, replyTo?: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('NOTIFY_FROM');
  if (!key || !from) throw Object.assign(new Error('Email is not set up'), { code: 'not_configured' });
  const html = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`).join('');
  const res = await fetch(Deno.env.get('RESEND_API_URL') || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) {
    console.error('Resend error', res.status, (await res.text()).slice(0, 500));
    throw Object.assign(new Error(`Resend returned ${res.status}`), { code: 'send_failed' });
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  const admin = Deno.env.get('ADMIN_EMAIL') || 'me@tylerpigott.com';
  const appUrl = (Deno.env.get('APP_URL') || '').split('#')[0];
  try {
    const user = await signedInUser(req);
    if (!user) return fail(401, 'not_signed_in', 'Sign in again, then retry.');
    const me = await loadProfile(user.id);
    if (!me) return fail(404, 'no_profile', 'No profile yet.');
    let body: { event?: string; target?: string } = {};
    try { body = await req.json(); } catch { /* handled below */ }

    if (body.event === 'signup') {
      if (me.status !== 'pending') return reply(200, { sent: false, reason: 'not_pending' });
      if (!(await claim(me.id, 'signup_notified_at'))) return reply(200, { sent: false, reason: 'already_sent' });
      try {
        await sendEmail(admin, `New early access request: ${me.email}`,
          `${me.email} just requested early access to Client Pipeline.\n\n` +
          `Approve or reject them in the Admin tab:\n${appUrl}#admin`);
      } catch (e) { await release(me.id, 'signup_notified_at'); throw e; }
      return reply(200, { sent: true });
    }

    if (body.event === 'approved') {
      if (!me.is_admin) return fail(403, 'not_admin', 'Only an admin can send approval emails.');
      if (!UUID.test(String(body.target ?? ''))) return fail(400, 'bad_target', 'Unknown person.');
      const target = await loadProfile(String(body.target));
      if (!target) return fail(404, 'no_target', 'Unknown person.');
      if (target.status !== 'approved') return reply(200, { sent: false, reason: 'not_approved' });
      if (!(await claim(target.id, 'approved_notified_at', '&status=eq.approved'))) return reply(200, { sent: false, reason: 'already_sent' });
      try {
        await sendEmail(target.email, "You're approved for Client Pipeline",
          'Hi there,\n\n' +
          'Good news: your early access to Client Pipeline is approved.\n\n' +
          `Sign in here to choose your plan and set up your first workspace:\n${appUrl}\n\n` +
          "Start with the example data if you want to see how it works before you add your own prospects. And if you get stuck on anything, just reply to this email. It comes straight to me.\n\n" +
          "I'm glad you're here. Let's go build your pipeline.\n\n" +
          'Tyler', admin);
      } catch (e) { await release(target.id, 'approved_notified_at'); throw e; }
      return reply(200, { sent: true });
    }

    return fail(400, 'unknown_event', 'Unknown event.');
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'not_configured') return fail(503, 'not_configured', 'Notification emails are not set up yet.');
    if (code === 'send_failed') return fail(502, 'send_failed', 'The email could not be sent. Try again.');
    console.error(e);
    return fail(500, 'server_error', 'Something went wrong. Try again.');
  }
}

Deno.serve(handler);
