# Setting up the Client Pipeline app

This turns on the app at `/app/`: sign-in, your approval step, Stripe subscriptions and the AI writing. Plan on about an hour, mostly waiting on account sign-ups. Do it all in **test mode** first; the last section covers going live.

Placeholders in this guide:

- `YOUR-PROJECT-REF`: the code in your Supabase project URL, e.g. `abcd1234efgh` in `https://abcd1234efgh.supabase.co`
- `APP_URL`: `https://tylerp-253.github.io/client-pipeline-site/app/` (change it if you use your own domain)

Keys go into the Supabase and Stripe dashboards yourself. Never paste a secret key into chat, email or this repository. The only two values that belong in the repository are the Supabase Project URL and **publishable** key, in `app/config.js`.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Pick a region near your customers and save the database password somewhere safe.
2. When it's ready, open **Project Settings > API Keys** and note:
   - the **Project URL**
   - the **publishable key** (starts `sb_publishable_`; older projects call it the `anon` key)

The free plan pauses projects after a stretch with no activity, so move to a paid plan before real customers rely on it.

## 2. Create the database (row-level security included)

1. Open **SQL Editor > New query**.
2. Paste the whole of `supabase/migrations/20261124000000_init.sql` from this repository and click **Run**. It should finish with "Success. No rows returned".
3. Check row-level security is on: open **Table Editor**. `profiles`, `workspaces`, `prospects` and `ai_usage` should each show RLS as enabled. **Advisors > Security Advisor** should show no "RLS disabled" warnings for these tables.

What RLS does here: each person can only read and change their own workspaces and prospects; people can read their own profile but can't change their approval or plan; only admins can see everyone's profile, and only through the `admin_set_access` function; the AI usage counter is server-only.

## 3. Sign-in settings

1. **Authentication > URL Configuration**
   - **Site URL:** `APP_URL`
   - **Redirect URLs:** add `APP_URL`
2. **Authentication > Sign In / Providers > Email:** leave Email enabled. Password sign-in isn't used.
3. **Authentication > Emails > Templates.** The app accepts either the link or the 6-digit code, so put both in the **Magic link** template *and* the **Confirm signup** template (new people get the second one). For example:

   Subject: `Your Client Pipeline sign-in`

   ```html
   <h2>Sign in to Client Pipeline</h2>
   <p><a href="{{ .ConfirmationURL }}">Click here to sign in</a></p>
   <p>Or enter this code in the app: <strong>{{ .Token }}</strong></p>
   <p>If you didn't ask for this, you can ignore this email.</p>
   ```

## 4. Email sending (needed before anyone else can sign in)

Supabase's built-in email only delivers to members of your Supabase team and is heavily rate limited, so customers won't get their sign-in emails until you add your own sender. Using [Resend](https://resend.com) as an example:

1. Sign up at Resend, add a domain you own (a subdomain like `mail.yourdomain.com` keeps it separate from your normal email) and add the DNS records it shows you.
2. Create an API key.
3. In Supabase, **Authentication > Emails > SMTP Settings**, turn on **Enable custom SMTP** and enter:
   - Sender email: an address on that domain, e.g. `hello@mail.yourdomain.com`; sender name: `Client Pipeline`
   - Host `smtp.resend.com`, port `465`, username `resend`, password: your Resend API key
4. Save. Supabase checks the connection when you save.

Until this is done you can still sign in yourself, as long as your email is a member of your Supabase organization.

## 5. Make yourself the admin

1. Connect the app first (section 9) so you can open it, then sign in at `APP_URL` with your email. You'll land on "You're on the list".
2. In **SQL Editor**, run (with your email):

   ```sql
   update public.profiles set is_admin = true, status = 'approved' where email = 'you@yourdomain.com';
   ```

3. Click **Check again** in the app. You now have an **Admin** tab, where you approve or reject people and can comp access for testers.

## 6. Claude API key

1. Sign up at [console.anthropic.com](https://console.anthropic.com), add billing and create an **API key**.
2. Set a monthly **spend limit** in the console so a bug can never run up a surprise bill. The app also caps each person at 150 writing calls a day (change it with `AI_DAILY_LIMIT` below).

## 7. Stripe (test mode)

Keep the **Test mode** switch on for all of this.

1. **Product catalog > Add product**, twice:
   - "Client Pipeline: The app", recurring, **$300 per month**
   - "Client Pipeline: App + coaching", recurring, **$1,500 per month**

   Open each product and copy its **price ID** (starts `price_`).
2. **Developers > API keys:** copy the **Secret key** (`sk_test_...`).
3. **Settings > Billing > Customer portal:** activate it and allow customers to update payment methods, cancel, and switch between the two products.
4. **Developers > Webhooks > Add endpoint:**
   - URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - After saving, copy the **Signing secret** (`whsec_...`).

Stripe will ask for a privacy policy and terms before you take live payments, so fill in the footer placeholders on the landing page before going live.

## 8. Server functions

### Secrets

In Supabase, **Edge Functions > Secrets**, add:

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Claude API key |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_APP` | the $300 price ID |
| `STRIPE_PRICE_COACHING` | the $1,500 price ID |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `APP_URL` | `APP_URL` |
| `ALLOWED_ORIGIN` | `https://tylerp-253.github.io` (optional, locks the functions to your site) |
| `AI_DAILY_LIMIT` | optional, defaults to `150` |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` |

Supabase gives the functions your project URL and secret key automatically.

### Deploy the four functions

**From the dashboard:** **Edge Functions > Deploy a new function > Via Editor**. Create each one with exactly these names, paste the matching file from this repository, and click **Deploy**:

| Function name | File |
| --- | --- |
| `ai` | `supabase/functions/ai/index.ts` |
| `create-checkout` | `supabase/functions/create-checkout/index.ts` |
| `billing-portal` | `supabase/functions/billing-portal/index.ts` |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` |

Then open each function's settings and turn **Verify JWT off**. Each function checks the signed-in person itself (or, for the webhook, Stripe's signature), and the platform check would block the webhook entirely.

**Or with the command line,** from this repository's folder:

```sh
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase functions deploy
```

`supabase/config.toml` already turns JWT verification off for all four.

## 9. Connect the app

Edit `app/config.js` and fill in the Project URL and publishable key from step 1, then commit and push. (Or send me those two values, both safe to share, and I'll do it.) GitHub Pages republishes within a minute or two.

## 10. Test the whole flow

1. Open `APP_URL` in a private window and sign up with a second email address. You should land on "You're on the list".
2. In your own window, open **Admin** and approve them.
3. In the private window, click **Check again**, choose **App + coaching**, and pay with Stripe's test card `4242 4242 4242 4242`, any future date and any CVC.
4. You come back to **Billing**, and within a few seconds it shows the plan. If it doesn't, check **Developers > Webhooks** in Stripe for a failed delivery, and **Edge Functions > stripe-webhook > Logs** in Supabase.
5. Try **Try it with example data**, **Recommend my value asset**, then on the example prospect **Find the gap and draft emails** and **Build the full asset**.
6. In **Billing**, open **Manage billing** and cancel. The app should lock again and show the plans.

## 11. Going live

1. In Stripe, switch to live mode and repeat step 7 (products, secret key, portal, webhook). Live mode has its own IDs and secrets.
2. Update the Supabase secrets `STRIPE_SECRET_KEY`, `STRIPE_PRICE_APP`, `STRIPE_PRICE_COACHING` and `STRIPE_WEBHOOK_SECRET` with the live values.
3. Fill in the landing page's remaining placeholders (company name, privacy policy, terms, the mastermind line, why you built it).
4. Move Supabase to a paid plan so the project never pauses.
