# Client Pipeline

The outbound system for marketing agencies: a landing page and the app behind it.

| Path | What it is |
| --- | --- |
| `index.html` | The public landing page. Its buttons and "Sign in" link go to the app. |
| `app/` | The app: magic-link sign-in, approval, Stripe plans, admin, and the workspace tools (setup, value asset, prospects, emails, one-page assets, tracker). Plain HTML and JavaScript, no build step. |
| `app/config.js` | The Supabase Project URL and publishable key. The only settings that live in this repository. |
| `supabase/migrations/` | The database: tables, row-level security, approval and usage-limit functions. |
| `supabase/functions/` | Server functions: `ai` (Claude writing), `create-checkout`, `billing-portal`, `stripe-webhook`, `notify` (request and approval emails). |
| `SETUP.md` | Step-by-step setup for Supabase, email sending, Claude, Stripe and going live. |

GitHub Pages serves `index.html` and `app/` straight from the `main` branch.

## How access works

1. Someone signs in with their email (link or 6-digit code). That creates a **pending** profile, and me@tylerpigott.com gets an email.
2. An admin approves them in the app's **Admin** tab, which emails them that they're in.
3. They choose a plan and pay through Stripe Checkout. The Stripe webhook switches their access on.
4. Admins, and anyone an admin comps, get access without paying.

The AI prompts live in the `ai` function, never in the browser, so the Claude API key can only be used for the app's own tasks, and each person has a daily cap.

## Before this goes live

See the end of `SETUP.md`. In short: live Stripe keys, your own email sender, and the landing page's placeholders (company name, privacy policy, terms).
