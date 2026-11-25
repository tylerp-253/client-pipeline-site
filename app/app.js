// Client Pipeline app. Plain JavaScript, no build step.
// Talks to Supabase for sign-in, data and the server functions.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

const CFG = window.CP_CONFIG || {};

const ASSETS = [
  { id: 'messaging', name: 'Messaging clarity audit', fits: 'Messaging, brand and copywriting agencies',
    deliverable: 'One page: what a first-time visitor understands in five seconds, the single biggest gap, and what clearer would look like.',
    paste: 'Paste the text of their homepage: headline, subhead, main sections and buttons.' },
  { id: 'seo', name: 'Search gap snapshot', fits: 'SEO and content agencies',
    deliverable: 'One page: three search topics they should own but do not show up for, with the evidence.',
    paste: 'Paste their homepage text plus what your SEO tool shows: searches competitors rank for and they do not. Without that data the app will not guess rankings.' },
  { id: 'ads', name: 'Ad teardown', fits: 'Paid media agencies',
    deliverable: 'One page: their current ads next to two competitors, what is working, and the biggest miss.',
    paste: 'Paste the copy of 2 or 3 of their live ads and 2 competitor ads from the public ad libraries, plus their landing page text.' },
  { id: 'web', name: 'Homepage before-and-after brief', fits: 'Web design and development agencies',
    deliverable: 'One page: what the top of their homepage does now, and a written sketch of a stronger version.',
    paste: 'Paste their homepage text and a few notes on layout: what sits at the top, the main button, anything broken on a phone.' },
  { id: 'email', name: 'Welcome email rewrite', fits: 'Email and lifecycle agencies',
    deliverable: 'One page: their welcome email, what it misses, and the opening lines of a stronger one.',
    paste: 'Join their list and paste the welcome email you receive, plus the text of their signup page.' },
];
const STATUSES = ['New', 'Drafted', 'Approved', 'Sent', 'Replied', 'Call booked', 'Not a fit'];
const FIELDS = [
  { k: 'agency', label: 'Agency name', line: true },
  { k: 'sender', label: 'Your first name, for email sign-offs', line: true },
  { k: 'sells', label: 'What do you sell, and what does it cost?', ph: 'One core offer and its real price. For example: website messaging projects, $12,000 each.',
    coach: 'Push for one core offer and a real price. If they list five services, ask which one they would sell all day.' },
  { k: 'ideal', label: 'Who is your ideal client?', ph: 'Industry, size, location, and the role you sell to.',
    coach: 'Ask for their three best clients by name, then find what those three have in common.' },
  { k: 'notFit', label: 'Who do you not want?', ph: 'The clients that cost more than they pay.',
    coach: 'Ask about the last client they regretted taking.' },
  { k: 'notice', label: 'When you look at a prospect, what is the first thing you notice that is wrong?', ph: 'The thing you spot in the first minute.',
    coach: 'Have them pull up a real prospect and talk out loud for 60 seconds. Write down their exact words.' },
  { k: 'giveaway', label: 'What would you happily give away on a first call?', ph: 'The quick insight you already share for free.',
    coach: 'Listen for the thing they already do for free in sales calls. That is usually the asset.' },
  { k: 'proof', label: 'Proof you can point to (optional)', ph: 'Only real results. Leave blank if you have none yet.',
    coach: 'Only write down results they can back up. The app never invents proof.' },
  { k: 'voice', label: 'Paste 2 or 3 emails you have written', ph: 'Real sent emails work best. Drafts will match this voice.', big: true,
    coach: 'Ask them to forward real sent emails, not polished marketing copy.' },
];
const CHECKLIST = ['Kickoff call held', 'Targeting agreed and written down', 'Voice samples collected', 'Test batch of 5 reviewed together', 'Weekly review time booked'];
const PLANS = [
  { id: 'app', name: 'The app', cta: 'Start with the app', price: '$300', blurb: 'For agencies that want to run it themselves.',
    items: ['Setup questions and a value asset recommendation', 'One finding and three emails for every prospect', 'Full one-page assets to send when they reply', 'A tracker for sent, replies and calls booked'] },
  { id: 'coaching', name: 'App + coaching', cta: 'Start with coaching', price: '$1,500', blurb: 'For agencies that want a guide in their corner.', main: true,
    items: ['Everything in the app', 'A 1:1 onboarding call to set your targeting and voice', 'Guided setup, with coach prompts and a kickoff recap', 'A weekly review of your prospects and drafts', 'Help responding to the replies you get'] },
];
const WEEK_TARGET = 15;

let sb = null;
const state = {
  phase: 'loading', user: null, profile: null, workspaces: [], wsId: null, prospects: [],
  open: null, view: 'setup', notice: '', busy: false, confirm: null, sentTo: '', adminRows: null, confirming: false,
};
const queues = {};

// ---------- small helpers ----------
const $ = (id) => document.getElementById(id);
function add(el, kid) {
  if (kid == null || kid === false) return;
  if (Array.isArray(kid)) { kid.forEach((k) => add(el, k)); return; }
  el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
}
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (['checked', 'disabled', 'selected', 'open'].includes(k)) el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.forEach((k) => add(el, k));
  return el;
}
const str = (v) => (v == null ? '' : String(v));
const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const assetById = (id) => ASSETS.find((a) => a.id === id) || null;
const ws = () => state.workspaces.find((w) => w.id === state.wsId) || null;
const hasAccess = (p) => !!p && p.status === 'approved' && (p.is_admin || p.comped || ['active', 'trialing'].includes(p.subscription_status || ''));
function setNotice(msg) { state.notice = msg || ''; renderNotice(); }
function field(id, label, control, hint) {
  return h('div', { class: 'col' }, h('label', { for: id, text: label }), control, hint ? h('p', { class: 'muted', text: hint }) : null);
}
function busy(on, label) {
  state.busy = on;
  $('busyText').textContent = label || 'Working...';
  $('busy').className = on ? 'on' : '';
}
function queued(key, fn) {
  const p = (queues[key] || Promise.resolve()).then(fn, fn);
  queues[key] = p.catch(() => {});
  return p;
}

// ---------- data ----------
async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (error) throw error;
  return data;
}
async function loadWorkspaces() {
  const { data, error } = await sb.from('workspaces').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  state.workspaces = data || [];
  const last = (() => { try { return localStorage.getItem('cp:last-ws') || ''; } catch { return ''; } })();
  state.wsId = state.workspaces.some((w) => w.id === last) ? last : (state.workspaces[0]?.id || null);
  await loadProspects();
}
async function loadProspects() {
  state.prospects = [];
  if (!state.wsId) return;
  const wid = state.wsId;
  const { data, error } = await sb.from('prospects').select('*').eq('workspace_id', wid).order('created_at', { ascending: false });
  if (error) { setNotice('Your prospects could not be loaded. Check your connection and reopen the workspace.'); return; }
  if (state.wsId === wid) state.prospects = data || [];
}
function rememberWs(id) { try { localStorage.setItem('cp:last-ws', id || ''); } catch { /* private mode */ } }
function saveFailed(error) {
  console.error(error);
  setNotice('That change could not be saved. Check your connection, then make the change again.');
}
function saveWs(w, fields) {
  Object.assign(w, fields);
  return queued('w:' + w.id, async () => {
    const { error } = await sb.from('workspaces').update(fields).eq('id', w.id);
    if (error) saveFailed(error);
  });
}
function saveProspect(p, fields) {
  Object.assign(p, fields);
  return queued('p:' + p.id, async () => {
    const { error } = await sb.from('prospects').update(fields).eq('id', p.id);
    if (error) saveFailed(error);
  });
}
async function createWs(name, example) {
  const row = { name: name || 'Untitled workspace', mode: 'self', intake: {} };
  if (example) {
    row.name = 'Sample agency (example data)';
    row.intake = { agency: 'Sample agency', sender: 'Alex',
      sells: 'Website messaging and copy projects for B2B software companies, $12,000 a project.',
      ideal: 'B2B software companies with 20 to 200 staff. We sell to the head of marketing or the founder.',
      notFit: 'Pre-launch startups with no customers yet.',
      notice: 'The homepage talks about features and never says who it is for or what problem it solves.',
      giveaway: 'A five-minute read of their homepage and the one thing I would change.', proof: '', voice: '' };
    row.asset = { id: 'messaging', why: 'Set by hand for this example. Use the button below to get a recommendation from your own answers.', lookFor: [], openingAngle: '' };
  }
  busy(true, 'Creating your workspace...');
  try {
    const { data, error } = await sb.from('workspaces').insert(row).select().single();
    if (error) throw error;
    state.workspaces.push(data);
    state.wsId = data.id; state.prospects = []; state.open = null;
    rememberWs(data.id);
    if (example) {
      const { data: p, error: pe } = await sb.from('prospects').insert({
        workspace_id: data.id, company: 'Sample Co (example)', contact: 'Jordan', role: 'Head of Marketing',
        material: 'Headline: The all-in-one platform for modern operations.\nSubhead: Powerful, flexible, and built to scale with your business.\nButtons: Learn more, Get started, Watch video.\nSection 1: Seamless integrations.\nSection 2: Enterprise-grade security.\nSection 3: Trusted by teams everywhere.\nFooter: Contact sales.',
      }).select().single();
      if (!pe) state.prospects = [p];
    }
    go('setup');
  } catch (e) { saveFailed(e); } finally { busy(false); }
}
async function deleteWs(w) {
  busy(true, 'Deleting...');
  const { error } = await sb.from('workspaces').delete().eq('id', w.id);
  busy(false);
  if (error) { saveFailed(error); return; }
  state.workspaces = state.workspaces.filter((x) => x.id !== w.id);
  state.wsId = state.workspaces[0]?.id || null; state.confirm = null;
  rememberWs(state.wsId);
  await loadProspects();
  render();
}
async function switchWs(id) {
  state.wsId = id; state.open = null; rememberWs(id);
  $('main').replaceChildren(h('div', { class: 'sheet' }, h('p', { text: 'Opening workspace...' })));
  await loadProspects();
  render();
}

// ---------- server functions ----------
async function invoke(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body: body || {} });
  if (!error) return data;
  let info = null;
  try { if (error.context && typeof error.context.json === 'function') info = await error.context.json(); } catch { /* not JSON */ }
  throw { code: info?.error || 'network', message: info?.message || 'Could not reach the server. Check your connection and try again.' };
}
async function ask(label, task, data) {
  if (state.busy) return null;
  busy(true, label + ' This can take up to a minute.');
  try {
    const out = await invoke('ai', { task, data });
    return out?.result ?? null;
  } catch (e) {
    if (e.code === 'not_approved' || e.code === 'no_plan' || e.code === 'not_signed_in') { await loadAccount(); }
    setNotice(e.message);
    return null;
  } finally { busy(false); }
}
const promptData = (w, extra) => ({ intake: w.intake || {}, asset: w.asset || null, ...extra });
const prospectData = (p) => ({ company: p.company, contact: p.contact, role: p.role, url: p.url, notes: p.notes, material: p.material });

async function recommendAsset() {
  const w = ws(); if (!w) return;
  const r = await ask('Choosing your value asset.', 'recommend', promptData(w));
  if (!r) return;
  await saveWs(w, { asset: { id: r.assetId, why: r.why, lookFor: r.lookFor, openingAngle: r.openingAngle, runnerUpId: r.runnerUpId, runnerUpWhy: r.runnerUpWhy } });
  render();
}
async function researchProspect(p) {
  const w = ws(); if (!w) return;
  if (!str(p.material).trim()) { setNotice("Paste the prospect's material first. The finding has to come from something real."); return; }
  const r = await ask('Reading the material and drafting three emails.', 'research', promptData(w, { prospect: prospectData(p) }));
  if (!r) return;
  if (!r.enough) await saveProspect(p, { missing: r.missing, finding: null, emails: null });
  else await saveProspect(p, { missing: '', finding: r.finding, emails: r.emails, status: p.status === 'New' ? 'Drafted' : p.status });
  render();
}
async function buildAsset(p) {
  const w = ws(); if (!w || !p.finding) return;
  const r = await ask('Building the full asset.', 'asset', promptData(w, { prospect: prospectData(p), finding: p.finding }));
  if (!r) return;
  await saveProspect(p, { asset: r });
  render();
}
async function writeRecap() {
  const w = ws(); if (!w) return;
  const done = CHECKLIST.filter((c, i) => w.checklist && w.checklist[i]);
  const r = await ask('Writing the kickoff recap.', 'recap', promptData(w, { coachNotes: w.coach_notes, done }));
  if (!r) return;
  await saveWs(w, { recap: r.text });
  render();
}
async function startCheckout(plan) {
  if (state.busy) return;
  busy(true, 'Opening secure checkout...');
  try {
    const out = await invoke('create-checkout', { plan });
    if (out?.url && /^https:\/\//.test(out.url)) { location.href = out.url; return; }
    setNotice('Checkout did not open. Try again.');
  } catch (e) { setNotice(e.message); } finally { busy(false); }
}
async function openPortal() {
  if (state.busy) return;
  busy(true, 'Opening billing...');
  try {
    const out = await invoke('billing-portal');
    if (out?.url && /^https:\/\//.test(out.url)) { location.href = out.url; return; }
    setNotice('Billing did not open. Try again.');
  } catch (e) { setNotice(e.message); } finally { busy(false); }
}

// ---------- copy and download ----------
function copyText(text, btn) {
  const done = (msg) => { const old = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = old; }, 1600); };
  if (!navigator.clipboard) { done('Select the text and copy it'); return; }
  navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Select the text and copy it'));
}
function assetAsText(p) {
  const a = p.asset, out = [a.title, '', a.intro, ''];
  a.sections.forEach((s) => out.push(s.heading, s.body, ''));
  out.push(a.nextStep);
  return out.join('\n');
}
function downloadAsset(p) {
  const a = p.asset, w = ws(), who = esc(w.intake?.agency || w.name);
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(a.title) +
    '</title><style>body{font-family:Georgia,serif;max-width:680px;margin:48px auto;padding:0 24px;color:#10261D;line-height:1.55}h1{font-family:Arial,sans-serif;font-size:28px;line-height:1.2}h2{font-family:Arial,sans-serif;font-size:17px;margin-top:28px}.by{font-family:Arial,sans-serif;font-size:13px;color:#4A5C53}.next{border-top:2px solid #0E6A48;margin-top:32px;padding-top:16px}</style></head><body>' +
    '<p class="by">Prepared for ' + esc(p.company) + ' by ' + who + '</p><h1>' + esc(a.title) + '</h1><p>' + esc(a.intro) + '</p>' +
    a.sections.map((s) => '<h2>' + esc(s.heading) + '</h2><p>' + esc(s.body) + '</p>').join('') +
    '<p class="next">' + esc(a.nextStep) + '</p></body></html>';
  const name = (str(p.company).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prospect') + '-value-asset.html';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = h('a', { href: url, download: name });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- account flow ----------
let sessionUid; // the user the screen was last loaded for; token refreshes don't reload
async function onSession(session) {
  const uid = session?.user?.id || null;
  if (uid === sessionUid) return;
  sessionUid = uid;
  state.user = session?.user || null;
  if (!state.user) { state.phase = 'signedout'; state.profile = null; render(); return; }
  await loadAccount();
}
async function loadAccount() {
  try {
    let profile = await loadProfile();
    for (let i = 0; !profile && i < 3; i++) { await new Promise((r) => setTimeout(r, 800)); profile = await loadProfile(); }
    state.profile = profile;
  } catch (e) {
    console.error(e);
    state.phase = 'error'; render(); return;
  }
  const p = state.profile;
  const params = new URLSearchParams(location.search);
  if (params.get('checkout') === 'success' && !hasAccess(p)) {
    state.phase = 'plans'; state.confirming = true; render();
    for (let i = 0; i < 15 && !hasAccess(state.profile); i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try { state.profile = await loadProfile(); } catch { /* keep trying */ }
    }
    state.confirming = false;
    if (!hasAccess(state.profile)) setNotice('Your payment went through, but your plan has not shown up yet. Refresh this page in a minute.');
  }
  if (params.has('checkout')) {
    if (params.get('checkout') === 'cancel') setNotice('Checkout was cancelled. Nothing was charged.');
    history.replaceState(null, '', location.pathname + location.hash);
  }
  const q = state.profile;
  if (!q || q.status === 'pending') state.phase = 'pending';
  else if (q.status === 'rejected') state.phase = 'rejected';
  else if (!hasAccess(q)) state.phase = 'plans';
  else {
    state.phase = 'app';
    try { await loadWorkspaces(); } catch (e) { console.error(e); setNotice('Your workspaces could not be loaded. Refresh the page to try again.'); }
  }
  render();
}
async function signOut() {
  await sb.auth.signOut();
  sessionUid = null;
  Object.assign(state, { user: null, profile: null, workspaces: [], wsId: null, prospects: [], adminRows: null, phase: 'signedout', sentTo: '' });
  render();
}

// ---------- rendering ----------
function renderNotice() {
  const box = $('notice'); box.replaceChildren();
  if (!state.notice) return;
  box.appendChild(h('div', { class: 'notice', role: 'alert' }, h('span', { text: state.notice }),
    h('button', { type: 'button', class: 'quiet', onclick: () => setNotice('') }, 'Dismiss')));
}
function renderWho() {
  const box = $('who'); box.replaceChildren();
  if (!state.user) return;
  box.appendChild(h('span', { text: state.user.email || '' }));
  box.appendChild(h('button', { type: 'button', class: 'quiet', onclick: signOut }, 'Sign out'));
}
function go(view) { state.view = view; if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view); render(); }
function render() {
  renderNotice(); renderWho();
  const main = $('main'), y = window.scrollY;
  let view;
  if (state.phase === 'unconfigured') view = viewUnconfigured();
  else if (state.phase === 'loading') view = h('div', { class: 'sheet' }, h('p', { text: 'Loading...' }));
  else if (state.phase === 'error') view = viewError();
  else if (state.phase === 'signedout') view = viewSignIn();
  else if (state.phase === 'pending') view = viewPending();
  else if (state.phase === 'rejected') view = viewRejected();
  else if (state.phase === 'plans') view = viewPlans(true);
  else view = viewApp();
  main.replaceChildren(view);
  window.scrollTo(0, y);
}

function viewUnconfigured() {
  return h('div', { class: 'sheet narrow' }, h('h1', { text: 'Almost there' }),
    h('p', { text: 'This app is not connected to Supabase yet. Add your Project URL and publishable key to app/config.js, as the setup guide describes.' }));
}
function viewError() {
  return h('div', { class: 'sheet narrow' }, h('h1', { text: 'Something went wrong' }),
    h('p', { text: 'Your account could not be loaded. Check your connection and try again.' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => loadAccount() }, 'Try again'),
      h('button', { type: 'button', class: 'quiet', onclick: signOut }, 'Sign out')));
}
function viewSignIn() {
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@youragency.com', value: state.sentTo });
  const send = async (e) => {
    e.preventDefault();
    const addr = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setNotice('Enter a valid email address.'); email.focus(); return; }
    busy(true, 'Sending your sign-in email...');
    const { error } = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    busy(false);
    if (error) { setNotice(/rate|seconds/i.test(error.message) ? 'Please wait a minute before asking for another email.' : 'The email could not be sent. Check the address and try again.'); return; }
    state.sentTo = addr; setNotice(''); render();
  };
  if (!state.sentTo) {
    return h('form', { class: 'sheet narrow', onsubmit: send, novalidate: true },
      h('p', { class: 'label', text: 'Early access' }),
      h('h1', { text: 'Sign in or request access' }),
      h('p', { text: "Enter your work email. We'll send you a sign-in link and a 6-digit code. No password to remember." }),
      field('email', 'Work email', email),
      h('button', { type: 'submit', class: 'primary' }, 'Email me a sign-in link'),
      h('p', { class: 'muted', text: 'New here? Signing in creates your request. Tyler reviews every request before access opens.' }));
  }
  const code = h('input', { type: 'text', id: 'code', class: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '000000' });
  const verify = async (e) => {
    e.preventDefault();
    const token = code.value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) { setNotice('Enter the code from the email.'); code.focus(); return; }
    busy(true, 'Signing you in...');
    const { error } = await sb.auth.verifyOtp({ email: state.sentTo, token, type: 'email' });
    busy(false);
    if (error) { setNotice('That code did not work. It may have expired: ask for a new email.'); return; }
    setNotice('');
  };
  return h('form', { class: 'sheet narrow', onsubmit: verify, novalidate: true },
    h('h1', { text: 'Check your email' }),
    h('p', {}, 'We sent a sign-in link and a code to ', h('b', { text: state.sentTo }), '. Click the link, or type the code here.'),
    field('code', 'Code from the email', code),
    h('button', { type: 'submit', class: 'primary' }, 'Sign in'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'quiet', onclick: () => { state.sentTo = ''; render(); } }, 'Use a different email')),
    h('p', { class: 'muted', text: "Nothing yet? Check your spam folder. Links work best opened in this same browser; the code works anywhere." }));
}
function viewPending() {
  return h('div', { class: 'sheet narrow' },
    h('p', { class: 'hand', text: 'Request received.' }),
    h('h1', { text: "You're on the list" }),
    h('p', {}, 'Thanks for requesting early access. Tyler reviews every request personally, and you will be able to choose a plan here as soon as yours is approved.'),
    h('p', { class: 'muted', text: 'Signed in as ' + (state.user?.email || '') }),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => loadAccount() }, 'Check again')));
}
function viewRejected() {
  return h('div', { class: 'sheet narrow' }, h('h1', { text: "We're not a fit right now" }),
    h('p', { text: "Thanks for your interest in Client Pipeline. Early access is limited, and we can't open an account for you at the moment. If you think this is a mistake, reply to any email from us." }));
}
function planCard(pl, current) {
  return h('div', { class: 'plan' + (pl.main ? ' main' : '') },
    h('h2', { text: pl.name }), h('p', { class: 'price' }, pl.price, ' ', h('small', { text: 'a month' })),
    h('p', { class: 'muted', text: pl.blurb }),
    h('ul', { class: 'plain' }, pl.items.map((t) => h('li', { text: t }))),
    current ? h('p', { class: 'label', text: 'Your plan' })
      : h('button', { type: 'button', class: pl.main ? 'primary' : '', onclick: () => startCheckout(pl.id) }, pl.cta));
}
function viewPlans(standalone) {
  if (state.confirming) {
    return h('div', { class: 'sheet narrow' }, h('h1', { text: 'Confirming your payment' }),
      h('p', { text: 'Stripe has your payment. Your plan switches on here in a few seconds.' }));
  }
  return h('div', { class: 'col', style: 'gap:16px' },
    h('div', { class: 'sheet' },
      standalone ? h('p', { class: 'hand', text: "You're approved." }) : null,
      h('h1', { text: 'Choose your plan' }),
      h('p', { text: 'Payment is handled by Stripe. You can change or cancel your plan any time from Billing.' })),
    h('div', { class: 'plans' }, PLANS.map((pl) => planCard(pl, false))),
    h('p', { class: 'muted', text: 'Interested in the mastermind? It is by invitation. Reply to your welcome email and Tyler will tell you more.' }));
}

function viewApp() {
  const w = ws(), out = h('div', { class: 'col', style: 'gap:16px' });
  const admin = !!state.profile?.is_admin;
  if (state.view === 'admin' && !admin) state.view = 'setup';
  if (state.workspaces.length) {
    out.appendChild(h('div', { class: 'row' },
      h('label', { for: 'ws-select', class: 'label', text: 'Workspace' }),
      h('select', { id: 'ws-select', onchange: (e) => switchWs(e.target.value) },
        state.workspaces.map((x) => h('option', { value: x.id, selected: x.id === state.wsId, text: x.name }))),
      h('button', { type: 'button', onclick: () => { state.wsId = null; state.prospects = []; go('setup'); } }, 'New workspace')));
  }
  const tabs = [['setup', 'Setup'], ['prospects', 'Prospects'], ['tracker', 'Tracker'], ['billing', 'Billing']];
  if (admin) tabs.push(['admin', 'Admin']);
  out.appendChild(h('nav', { class: 'tabs', 'aria-label': 'Sections' }, tabs.map(([v, label]) =>
    h('a', { href: '#' + v, 'aria-current': state.view === v ? 'page' : null, onclick: (e) => { e.preventDefault(); go(v); } }, label))));
  if (state.view === 'billing') out.appendChild(viewBilling());
  else if (state.view === 'admin') out.appendChild(viewAdmin());
  else if (!w) out.appendChild(viewWelcome());
  else if (state.view === 'prospects') out.appendChild(viewProspects(w));
  else if (state.view === 'tracker') out.appendChild(viewTracker());
  else out.appendChild(viewSetup(w));
  return out;
}

function viewWelcome() {
  const name = h('input', { type: 'text', id: 'new-ws-name', placeholder: 'Agency or client name' });
  const start = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } createWs(n, false); };
  return h('div', { class: 'sheet' },
    h('h1', { text: state.workspaces.length ? 'Add a workspace' : 'Set up your first workspace' }),
    h('p', { text: 'A workspace holds one agency: its ideal client, its voice, the value asset it leads with, and its prospects.' }),
    field('new-ws-name', 'Name this workspace', name),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', onclick: start }, 'Create workspace'),
      h('button', { type: 'button', onclick: () => createWs('', true) }, 'Try it with example data'),
      state.workspaces.length ? h('button', { type: 'button', class: 'quiet', onclick: () => switchWs(state.workspaces[0].id) }, 'Cancel') : null));
}

function viewSetup(w) {
  const guided = w.mode === 'guided', intake = w.intake || (w.intake = {});
  const out = h('div', { class: 'col', style: 'gap:16px' });
  out.appendChild(h('div', { class: 'sheet' },
    h('h1', { text: 'Setup' }),
    h('p', { class: 'muted', text: 'Short, honest answers work best. Everything saves as you go.' }),
    h('div', { class: 'row' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' },
        h('button', { type: 'button', 'aria-pressed': String(!guided), onclick: () => { saveWs(w, { mode: 'self' }); render(); } }, 'On my own'),
        h('button', { type: 'button', 'aria-pressed': String(guided), onclick: () => { saveWs(w, { mode: 'guided' }); render(); } }, 'Guided onboarding')),
      h('span', { class: 'muted', text: guided ? 'Coach prompts are showing under each question.' : 'Switch to guided onboarding when a coach is running the call.' }))));

  const form = h('div', { class: 'sheet' }, h('h2', { text: 'Your agency' }));
  FIELDS.forEach((f) => {
    const id = 'f-' + f.k;
    const c = f.line ? h('input', { type: 'text', id, value: str(intake[f.k]), placeholder: f.ph || '' })
      : h('textarea', { id, class: f.big ? 'big' : '', value: str(intake[f.k]), placeholder: f.ph || '' });
    c.addEventListener('input', () => { intake[f.k] = c.value; });
    c.addEventListener('change', () => saveWs(w, { intake: { ...intake } }));
    form.appendChild(field(id, f.label, c));
    if (guided && f.coach) form.appendChild(h('div', { class: 'coach' }, h('b', { text: 'Coach: ' }), f.coach));
  });
  out.appendChild(form);

  const a = w.asset ? assetById(w.asset.id) : null;
  const card = h('div', { class: 'sheet' }, h('h2', { text: 'Your value asset' }),
    h('p', { class: 'muted', text: 'The one useful thing you make for each prospect before you ask for anything. Every email leads with a finding from it.' }));
  if (a) {
    card.appendChild(h('div', { class: 'block soft' },
      h('h3', { text: a.name }), h('p', { text: a.deliverable }),
      w.asset.why ? h('p', { text: w.asset.why }) : null,
      w.asset.lookFor?.length ? h('div', { class: 'col' }, h('b', { text: 'Look for in each prospect' }), h('ul', { class: 'plain' }, w.asset.lookFor.map((t) => h('li', { text: t })))) : null,
      w.asset.openingAngle ? h('p', {}, h('b', { text: 'How email 1 opens: ' }), w.asset.openingAngle) : null,
      h('p', {}, h('b', { text: 'For each prospect: ' }), a.paste)));
    const ru = assetById(w.asset.runnerUpId);
    if (ru) card.appendChild(h('p', { class: 'muted', text: 'Runner-up: ' + ru.name + '. ' + str(w.asset.runnerUpWhy) }));
  }
  const pick = h('select', { id: 'asset-pick', 'aria-label': 'Choose a value asset yourself', onchange: (e) => {
    if (!e.target.value) return;
    saveWs(w, { asset: { id: e.target.value, why: '', lookFor: [], openingAngle: '' } }); render();
  } }, h('option', { value: '', text: 'Or choose one yourself' }), ASSETS.map((x) => h('option', { value: x.id, text: x.name + ' (' + x.fits + ')' })));
  card.appendChild(h('div', { class: 'row' },
    h('button', { type: 'button', class: 'primary', onclick: recommendAsset }, a ? 'Recommend again from my answers' : 'Recommend my value asset'), pick));
  if (a) card.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => go('prospects') }, 'Next: add prospects')));
  out.appendChild(card);

  if (guided) {
    const cl = w.checklist || {};
    const notes = h('textarea', { id: 'coach-notes', value: str(w.coach_notes), placeholder: 'What you heard on the call, in their words.' });
    notes.addEventListener('input', () => { w.coach_notes = notes.value; });
    notes.addEventListener('change', () => saveWs(w, { coach_notes: notes.value }));
    const onb = h('div', { class: 'sheet' }, h('h2', { text: 'Onboarding' }),
      h('div', { class: 'col' }, CHECKLIST.map((c, n) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', id: 'chk-' + n, checked: !!cl[n], onchange: (e) => saveWs(w, { checklist: { ...cl, [n]: e.target.checked } }) }), c))),
      field('coach-notes', 'Coach notes', notes),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: writeRecap }, w.recap ? 'Rewrite the kickoff recap' : 'Write the kickoff recap')));
    if (w.recap) {
      const rc = h('textarea', { id: 'recap', class: 'big', value: w.recap, 'aria-label': 'Kickoff recap email' });
      rc.addEventListener('change', () => saveWs(w, { recap: rc.value }));
      onb.appendChild(rc);
      onb.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', onclick: (e) => copyText(rc.value, e.target) }, 'Copy recap')));
    }
    out.appendChild(onb);
  }

  const del = h('div', { class: 'sheet' }, h('h2', { text: 'Workspace' }));
  const nm = h('input', { type: 'text', id: 'ws-name', value: w.name, maxlength: '120' });
  nm.addEventListener('change', () => { if (nm.value.trim()) { saveWs(w, { name: nm.value.trim() }); render(); } });
  del.appendChild(field('ws-name', 'Workspace name', nm));
  if (state.confirm === 'ws') del.appendChild(h('div', { class: 'row' },
    h('span', { text: 'Delete this workspace and its ' + state.prospects.length + ' prospects? This cannot be undone.' }),
    h('button', { type: 'button', class: 'danger', onclick: () => deleteWs(w) }, 'Yes, delete'),
    h('button', { type: 'button', onclick: () => { state.confirm = null; render(); } }, 'Keep it')));
  else del.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'quiet danger', onclick: () => { state.confirm = 'ws'; render(); } }, 'Delete workspace')));
  out.appendChild(del);
  return out;
}

const chip = (status) => h('span', { class: 'chip s-' + str(status).replace(/\s+/g, ''), text: status });
const addedThisWeek = () => { const cut = Date.now() - 7 * 864e5; return state.prospects.filter((p) => Date.parse(p.created_at) >= cut).length; };

function viewProspects(w) {
  const a = assetById(w.asset?.id), out = h('div', { class: 'col', style: 'gap:16px' });
  out.appendChild(h('div', { class: 'sheet' }, h('h1', { text: 'Prospects' }),
    a ? h('p', {}, 'Leading with: ', h('b', { text: a.name }), '. ' + addedThisWeek() + ' of ' + WEEK_TARGET + ' added this week.')
      : h('div', { class: 'row' }, h('span', { text: 'Choose your value asset in Setup first, so the findings fit what you sell.' }), h('button', { type: 'button', onclick: () => go('setup') }, 'Go to Setup'))));

  const d = { company: '', contact: '', role: '', url: '', material: '', notes: '' };
  const mk = (k, ph, area) => {
    const el = area ? h('textarea', { id: 'np-' + k, class: k === 'material' ? 'big' : '', placeholder: ph }) : h('input', { type: 'text', id: 'np-' + k, placeholder: ph });
    el.addEventListener('input', () => { d[k] = el.value; });
    return el;
  };
  const save = async () => {
    if (!d.company.trim()) { $('np-company').focus(); return; }
    busy(true, 'Saving...');
    const { data, error } = await sb.from('prospects').insert({
      workspace_id: w.id, company: d.company.trim().slice(0, 200), contact: d.contact.trim(), role: d.role.trim(),
      url: d.url.trim(), material: d.material.slice(0, 20000), notes: d.notes.slice(0, 5000),
    }).select().single();
    busy(false);
    if (error) { saveFailed(error); return; }
    state.prospects.unshift(data); state.open = data.id; render();
  };
  out.appendChild(h('details', { class: 'sheet add', open: !state.prospects.length },
    h('summary', {}, 'Add a prospect'),
    field('np-company', 'Company', mk('company', 'Company name')),
    field('np-contact', 'Contact first name', mk('contact', 'Who the email goes to')),
    field('np-role', 'Role', mk('role', 'Owner, head of marketing...')),
    field('np-url', 'Website', mk('url', 'https://')),
    field('np-material', 'Their material', mk('material', 'Paste it here', true), (a || ASSETS[0]).paste + ' The finding comes only from what you paste.'),
    field('np-notes', 'Your notes (optional)', mk('notes', 'Anything you noticed yourself', true)),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: save }, 'Save prospect'))));
  state.prospects.forEach((p) => out.appendChild(prospectCard(p, a || ASSETS[0])));
  return out;
}

function prospectCard(p, a) {
  const open = state.open === p.id, card = h('div', { class: 'sheet' });
  card.appendChild(h('button', { type: 'button', class: 'phead', 'aria-expanded': String(open), onclick: () => { state.open = open ? null : p.id; state.confirm = null; render(); } },
    h('span', { class: 'col', style: 'gap:0' }, h('span', { class: 'pname', text: p.company }), h('span', { class: 'muted', text: [p.contact, p.role].filter(Boolean).join(', ') || 'No contact yet' })),
    chip(p.status)));
  if (!open) return card;

  card.appendChild(h('div', { class: 'row' }, h('label', { for: 'st-' + p.id, text: 'Status' }),
    h('select', { id: 'st-' + p.id, onchange: (e) => { saveProspect(p, { status: e.target.value }); render(); } },
      STATUSES.map((s) => h('option', { value: s, selected: s === p.status, text: s }))),
    /^https:\/\//.test(str(p.url)) ? h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open their site' }) : null));
  const mat = h('textarea', { id: 'mat-' + p.id, class: 'big', value: str(p.material), placeholder: 'Paste it here', maxlength: '20000' });
  mat.addEventListener('input', () => { p.material = mat.value; });
  mat.addEventListener('change', () => saveProspect(p, { material: mat.value }));
  card.appendChild(field('mat-' + p.id, 'Their material', mat, a.paste));
  card.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => researchProspect(p) }, p.finding ? 'Redo the finding and emails' : 'Find the gap and draft emails')));
  if (p.missing) card.appendChild(h('div', { class: 'notice' }, h('span', { text: 'More material needed: ' + p.missing })));

  if (p.finding) {
    card.appendChild(h('div', { class: 'block soft' }, h('h3', { text: 'Finding' }), h('p', { text: p.finding.headline }),
      p.finding.evidence ? h('p', {}, h('span', { class: 'quote', text: p.finding.evidence })) : null,
      p.finding.whyItMatters ? h('p', { class: 'muted', text: p.finding.whyItMatters }) : null,
      h('p', { class: 'hand', text: 'Check the quote against their live page before you send.' })));
    (p.emails || []).forEach((e, n) => {
      const sid = 'es-' + p.id + '-' + n, bid = 'eb-' + p.id + '-' + n;
      const sI = h('input', { type: 'text', id: sid, value: e.subject }), bI = h('textarea', { id: bid, class: 'big', value: e.body });
      const persist = () => saveProspect(p, { emails: p.emails.map((x, i) => (i === n ? { subject: sI.value, body: bI.value } : x)) });
      sI.addEventListener('change', persist); bI.addEventListener('change', persist);
      card.appendChild(h('div', { class: 'block' },
        h('h3', { text: n === 0 ? 'Day 0: email 1' : n === 1 ? 'Day 3: follow-up' : 'Day 10: close the loop' }),
        field(sid, 'Subject', sI), field(bid, 'Body', bI),
        h('div', { class: 'row' }, h('button', { type: 'button', onclick: (ev) => copyText('Subject: ' + sI.value + '\n\n' + bI.value, ev.target) }, 'Copy email'))));
    });
    const ab = h('div', { class: 'block' }, h('h3', { text: 'Full ' + a.name }), h('p', { class: 'muted', text: 'Build this for prospects who reply, or for your top few each week.' }));
    if (p.asset) {
      ab.appendChild(h('h2', { text: p.asset.title }));
      ab.appendChild(h('p', { text: p.asset.intro }));
      p.asset.sections.forEach((sec) => ab.appendChild(h('div', { class: 'col' }, h('b', { text: sec.heading }), h('p', { text: sec.body }))));
      ab.appendChild(h('p', { text: p.asset.nextStep }));
    }
    ab.appendChild(h('div', { class: 'row' },
      h('button', { type: 'button', class: p.asset ? '' : 'primary', onclick: () => buildAsset(p) }, p.asset ? 'Rebuild' : 'Build the full asset'),
      p.asset ? h('button', { type: 'button', onclick: (ev) => copyText(assetAsText(p), ev.target) }, 'Copy text') : null,
      p.asset ? h('button', { type: 'button', onclick: () => downloadAsset(p) }, 'Download one-pager') : null));
    card.appendChild(ab);
  }

  if (state.confirm === p.id) card.appendChild(h('div', { class: 'row' }, h('span', { text: 'Delete ' + p.company + '?' }),
    h('button', { type: 'button', class: 'danger', onclick: async () => {
      const { error } = await sb.from('prospects').delete().eq('id', p.id);
      if (error) { saveFailed(error); return; }
      state.prospects = state.prospects.filter((x) => x.id !== p.id); state.confirm = null; state.open = null; render();
    } }, 'Yes, delete'),
    h('button', { type: 'button', onclick: () => { state.confirm = null; render(); } }, 'Keep')));
  else card.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'quiet danger', onclick: () => { state.confirm = p.id; render(); } }, 'Delete prospect')));
  return card;
}

function viewTracker() {
  const ps = state.prospects, count = (list) => ps.filter((p) => list.includes(p.status)).length;
  const sent = count(['Sent', 'Replied', 'Call booked']), replies = count(['Replied', 'Call booked']), calls = count(['Call booked']);
  const tile = (n, label) => h('div', { class: 'tile' }, h('b', { text: String(n) }), h('span', { class: 'muted', text: label }));
  const out = h('div', { class: 'col', style: 'gap:16px' },
    h('div', { class: 'sheet' }, h('h1', { text: 'Tracker' }),
      h('p', { class: 'muted', text: sent ? replies + ' of ' + sent + ' sent prospects have replied (' + Math.round(replies / sent * 100) + '%).' : 'Mark a prospect as Sent after you send email 1, and the numbers start here.' })),
    h('div', { class: 'tiles' }, tile(ps.length, 'Prospects'), tile(sent, 'Sent'), tile(replies, 'Replied'), tile(calls, 'Calls booked')));
  if (ps.length) out.appendChild(h('div', { class: 'sheet' }, h('div', { class: 'tablebox' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', { text: 'Company' }), h('th', { text: 'Contact' }), h('th', { text: 'Status' }), h('th', { text: 'Added' }))),
    h('tbody', {}, ps.map((p) => h('tr', {}, h('td', { text: p.company }), h('td', { text: p.contact || '' }), h('td', {}, chip(p.status)),
      h('td', { text: new Date(p.created_at).toLocaleDateString() }))))))));
  else out.appendChild(h('div', { class: 'sheet' }, h('p', { text: 'No prospects yet.' }), h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => go('prospects') }, 'Add your first prospect'))));
  return out;
}

function viewBilling() {
  const p = state.profile || {}, plan = PLANS.find((x) => x.id === p.plan);
  const sheet = h('div', { class: 'sheet' }, h('h1', { text: 'Billing' }));
  if (plan && ['active', 'trialing', 'past_due'].includes(p.subscription_status || '')) {
    sheet.appendChild(h('p', {}, 'Your plan: ', h('b', { text: plan.name + ' (' + plan.price + ' a month)' }), ' ', chip(p.subscription_status)));
    if (p.current_period_end) sheet.appendChild(h('p', { class: 'muted', text: 'Renews on ' + new Date(p.current_period_end).toLocaleDateString() + '.' }));
    if (p.subscription_status === 'past_due') sheet.appendChild(h('div', { class: 'notice' }, h('span', { text: 'Your last payment did not go through. Update your card to keep access.' })));
  } else if (p.is_admin) sheet.appendChild(h('p', { text: 'You have admin access, so no plan is needed.' }));
  else if (p.comped) sheet.appendChild(h('p', { text: 'Your access is complimentary during early access. Thanks for testing.' }));
  else sheet.appendChild(h('p', { text: 'You have no active plan.' }));
  if (p.stripe_customer_id) sheet.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: openPortal }, 'Manage billing'),
    h('span', { class: 'muted', text: 'Update your card, switch plans, see invoices or cancel, on Stripe.' })));
  else if (!p.is_admin && !p.comped) sheet.appendChild(viewPlans(false));
  return sheet;
}

async function loadAdminRows() {
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { setNotice('People could not be loaded.'); return; }
  state.adminRows = data || []; render();
}
async function setAccess(row, status, comped) {
  busy(true, 'Saving...');
  const { data, error } = await sb.rpc('admin_set_access', { target: row.id, new_status: status, new_comped: comped });
  busy(false);
  if (error) { setNotice('That change could not be saved: ' + error.message); return; }
  Object.assign(row, data || { status, comped });
  if (row.id === state.profile?.id) state.profile = { ...state.profile, ...row };
  render();
}
function viewAdmin() {
  if (!state.adminRows) { loadAdminRows(); return h('div', { class: 'sheet' }, h('p', { text: 'Loading people...' })); }
  const rows = state.adminRows, pending = rows.filter((r) => r.status === 'pending');
  const action = (label, fn, cls) => h('button', { type: 'button', class: cls || '', onclick: fn }, label);
  return h('div', { class: 'col', style: 'gap:16px' },
    h('div', { class: 'sheet' }, h('h1', { text: 'People' }),
      h('p', { class: 'muted', text: pending.length ? pending.length + ' waiting for approval.' : 'Nobody is waiting for approval.' }),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => { state.adminRows = null; render(); } }, 'Refresh'))),
    h('div', { class: 'sheet' }, h('div', { class: 'tablebox' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Email', 'Joined', 'Access', 'Plan', 'Actions'].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', { text: r.email + (r.is_admin ? ' (admin)' : '') }),
        h('td', { text: new Date(r.created_at).toLocaleDateString() }),
        h('td', {}, chip(r.status), r.comped ? ' comped' : ''),
        h('td', { text: r.plan ? (PLANS.find((x) => x.id === r.plan)?.name || r.plan) + ', ' + (r.subscription_status || '') : (r.subscription_status || 'none') }),
        h('td', {}, h('div', { class: 'row' },
          r.status !== 'approved' ? action('Approve', () => setAccess(r, 'approved', r.comped), 'primary') : null,
          r.status !== 'rejected' && !r.is_admin ? action('Reject', () => setAccess(r, 'rejected', r.comped), 'danger') : null,
          r.status === 'approved' && !r.is_admin ? action(r.comped ? 'Remove comp' : 'Comp access', () => setAccess(r, 'approved', !r.comped)) : null)))))))),
    h('p', { class: 'muted', text: 'Approving someone lets them choose a plan. Comping gives them access without paying, for testers and early partners.' }));
}

// ---------- start ----------
function viewFromHash() {
  const v = location.hash.replace('#', '');
  return ['setup', 'prospects', 'tracker', 'billing', 'admin'].includes(v) ? v : 'setup';
}
window.addEventListener('hashchange', () => { const v = viewFromHash(); if (v !== state.view) { state.view = v; render(); } });

async function boot() {
  state.view = viewFromHash();
  if (!CFG.supabaseUrl || !CFG.supabaseKey) { state.phase = 'unconfigured'; render(); return; }
  sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange((event, session) => { setTimeout(() => onSession(session), 0); });
  const { data } = await sb.auth.getSession();
  await onSession(data.session);
}
boot();
