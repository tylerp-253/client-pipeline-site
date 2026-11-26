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
const FIELD = Object.fromEntries(FIELDS.map((f) => [f.k, f]));
// The guided setup: one question per screen. "need" answers must be filled in;
// the rest can be skipped and added later.
const STEPS = [
  { keys: ['agency', 'sender'], need: ['agency', 'sender'], title: "Who's sending these emails?",
    why: 'Your first name signs every email, so it reads like it came from a person, because it did.' },
  { keys: ['sells'], need: ['sells'], title: 'What do you sell, and what does it cost?',
    why: 'Every finding points at a problem this offer fixes. A real price helps the weekly search find companies that can afford you.',
    example: 'Website messaging and copy for B2B software companies. Projects start at $12,000.' },
  { keys: ['ideal'], need: ['ideal'], title: 'Who is your ideal client?',
    why: 'This decides which companies show up in your best fits each week.',
    example: 'B2B software companies in the US with 20 to 200 staff. I sell to the head of marketing or the founder.' },
  { keys: ['notFit'], need: [], title: "Who don't you want?",
    why: "Keeps your weekly suggestions off companies you'd turn down anyway.",
    example: 'Pre-launch startups with no customers yet, and anyone who wants it done in a week.' },
  { keys: ['notice'], need: ['notice'], title: "When you look at a prospect, what's the first thing you notice that's wrong?",
    why: 'This becomes the opening line of email 1, so use the words you would say out loud.',
    example: 'The homepage talks about features and never says who it is for or what problem it solves.' },
  { keys: ['giveaway'], need: [], title: 'What would you happily give away on a first call?',
    why: 'It shapes the value asset you lead with: something useful they get before you ask for anything.',
    example: 'A five-minute read of their homepage and the one line I would change first.' },
  { keys: ['proof', 'voice'], need: [], title: 'Make the emails sound like you',
    why: 'Both are optional. Real results make the emails stronger, and 2 or 3 emails you have sent make the drafts match your voice.' },
];
const SUGGEST_WEEKLY = 25;
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
  open: null, view: 'setup', toasts: [], menu: null, sheet: null, filter: 'all', q: '', emailTab: 0, loadingWs: false, focusDrawer: false, busy: false, confirm: null, sentTo: '', adminRows: null, confirming: false,
  setup: null, autoRec: null, addMode: null, csv: null,
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
function field(id, label, control, hint) {
  return h('div', { class: 'col' }, h('label', { for: id, text: label }), control, hint ? h('p', { class: 'muted', text: hint }) : null);
}
// What the working card shows for each AI task. The steps advance on a timer
// paced to how long the task usually takes; the last one stays until it's done.
const WORK = {
  prefill: { secs: 18, hint: 'This usually takes about 20 seconds.', steps: ['Reading what you gave us', 'Pulling out what you sell and who you serve', 'Drafting your answers'] },
  polish: { secs: 6, hint: 'Just a few seconds.', steps: ['Reading your notes', 'Tightening the wording', "Making sure nothing's made up"] },
  research: { secs: 24, hint: 'This usually takes under a minute.', steps: ['Reading their site', 'Looking for the one clear gap', 'Checking the quote against their words', 'Writing three emails in your voice'] },
  find: { secs: 55, hint: 'This usually takes about a minute.', steps: ['Searching the web for companies like your best clients', 'Checking each one against your ideal client', 'Scoring the best fits', 'Making sure every company is real'] },
  recommend: { secs: 12, hint: 'This usually takes about 15 seconds.', steps: ['Reading your answers', 'Matching you to the right value asset', 'Checking your answers for gaps'] },
  asset: { secs: 20, hint: 'This usually takes about 20 seconds.', steps: ['Laying out the page', 'Writing each section', 'Adding a simple next step'] },
  recap: { secs: 10, hint: 'This usually takes about 10 seconds.', steps: ['Reading your coach notes', 'Writing the recap'] },
};
const KICKERS = ['On it.', 'Working on it.', 'Give me a moment.', 'Rolling up my sleeves.'];
let busyTick = null, busyReveal = null, busyFocus = null;
function busy(on, label, work) {
  state.busy = on;
  const box = $('busy'), page = $('app');
  clearInterval(busyTick); clearTimeout(busyReveal);
  if (!on) {
    box.classList.remove('on'); box.hidden = true;
    if (page) page.inert = false;
    if (busyFocus && document.contains(busyFocus)) busyFocus.focus({ preventScroll: true });
    busyFocus = null;
    return;
  }
  busyFocus = document.activeElement;
  $('busyText').textContent = label || 'Working...';
  $('busyKicker').textContent = work ? KICKERS[Math.floor(Math.random() * KICKERS.length)] : 'One moment.';
  const steps = work?.steps || [], list = $('busySteps');
  list.replaceChildren(...steps.map((t) => h('li', { text: t })));
  box.classList.toggle('small', !steps.length);
  const start = Date.now();
  const tick = () => {
    const t = (Date.now() - start) / 1000;
    if (steps.length) {
      const now = Math.min(steps.length - 1, Math.floor(t / (work.secs / steps.length)));
      [...list.children].forEach((li, n) => { li.className = n < now ? 'done' : n === now ? 'now' : 'next'; });
    }
    $('busyTime').textContent = work ? (t >= 6 ? Math.round(t) + ' seconds so far. ' : '') + work.hint : '';
  };
  tick();
  busyTick = setInterval(tick, 500);
  box.hidden = false;
  if (page) page.inert = true;
  // Quick saves finish before the card would even show, so it waits a beat; AI work shows at once.
  busyReveal = setTimeout(() => box.classList.add('on'), work ? 10 : 300);
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
  setNotice('That change could not be saved. Check your connection, then make the change again.', 'error');
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
  state.wsId = id; state.open = null; state.sheet = null; state.filter = 'all'; state.q = ''; rememberWs(id);
  state.loadingWs = true; render();
  await loadProspects();
  state.loadingWs = false; render();
}

// ---------- server functions ----------
async function invoke(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body: body || {} });
  if (!error) return data;
  let info = null;
  try { if (error.context && typeof error.context.json === 'function') info = await error.context.json(); } catch { /* not JSON */ }
  throw { code: info?.error || 'network', message: info?.message || 'Could not reach the server. Check your connection and try again.' };
}
async function ask(label, task, data, opts = {}) {
  if (state.busy) return null;
  busy(true, label, WORK[task]);
  try {
    const out = await invoke('ai', { task, data });
    return out?.result ?? null;
  } catch (e) {
    if (e.code === 'not_approved' || e.code === 'no_plan' || e.code === 'not_signed_in') { await loadAccount(); }
    setNotice(opts.fix ? opts.fix(e) : e.message, 'error');
    return null;
  } finally { busy(false); }
}
const promptData = (w, extra) => ({ intake: w.intake || {}, asset: w.asset || null, ...extra });
const prospectData = (p) => ({ company: p.company, contact: p.contact, role: p.role, url: p.url, notes: p.notes, material: p.material });
// "Acme Ops | Home" -> "Acme Ops"
const nameFromTitle = (t) => str(t).split(/\s[|\u2013\u2014:-]\s|\s\|/)[0].trim().slice(0, 200);
const domainOf = (u) => {
  let t = str(u).trim(); if (!t) return '';
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try { return new URL(t).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};
const isEmail = (e) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test(str(e).trim());

async function recommendAsset() {
  const w = ws(); if (!w) return;
  const r = await ask('Choosing your value asset.', 'recommend', promptData(w));
  if (!r) return;
  await saveWs(w, { asset: { id: r.assetId, why: r.why, lookFor: r.lookFor, openingAngle: r.openingAngle, runnerUpId: r.runnerUpId, runnerUpWhy: r.runnerUpWhy, sharpen: r.sharpen || [] } });
  render();
}
async function prefillFromSite(w, url, notes) {
  const label = url ? 'Reading your website' + (notes ? ' and your notes' : '') + ' and drafting your answers.' : 'Drafting your answers from your notes.';
  const r = await ask(label, 'prefill', { url, notes }, {
    fix: (e) => (e.code === 'site_unreadable' ? e.message.replace(/ Paste the page text instead\.$/, '') + ' Skip this step and type your answers instead.' : e.message),
  });
  if (!r) return false;
  const intake = { ...(w.intake || {}), website: r.site?.url || url || str(w.intake?.website), brainDump: str(notes).slice(0, 8000) };
  const drafted = { ...(intake._drafted || {}) };
  for (const [k, v] of Object.entries(r.answers || {})) {
    if (v && !str(intake[k]).trim()) { intake[k] = v; drafted[k] = true; }
  }
  intake._drafted = drafted;
  await saveWs(w, { intake });
  return r.warning || true; // a warning to show once the next screen is up

}
async function researchProspect(p) {
  const w = ws(); if (!w) return;
  if (!str(p.material).trim() && !domainOf(p.url)) { setNotice("Add their website or paste their material first. The finding has to come from something real."); return; }
  const label = str(p.material).trim() ? 'Reading the material and drafting three emails.' : 'Reading ' + domainOf(p.url) + ' and drafting three emails.';
  const r = await ask(label, 'research', promptData(w, { prospect: prospectData(p) }));
  if (!r) return;
  const extra = {};
  if (r.material) extra.material = r.material;
  if (r.siteTitle && (!str(p.company).trim() || p.company === domainOf(p.url))) extra.company = nameFromTitle(r.siteTitle) || p.company;
  if (!r.enough) await saveProspect(p, { ...extra, missing: r.missing, finding: null, emails: null });
  else await saveProspect(p, { ...extra, missing: '', finding: r.finding, emails: r.emails, status: ['New', 'Suggested'].includes(p.status) ? 'Drafted' : p.status });
  render();
}
async function findBestFits() {
  const w = ws(); if (!w) return;
  const r = await ask('Finding your best-fit companies.', 'find', { workspaceId: w.id });
  if (!r) return;
  const fresh = (r.added || []).filter((x) => x.workspace_id === w.id && !state.prospects.some((p) => p.id === x.id));
  state.prospects = [...fresh, ...state.prospects];
  setNotice(fresh.length ? 'Found ' + fresh.length + ' new best-fit ' + (fresh.length === 1 ? 'company' : 'companies') + '. Add the ones you like to your prospects.'
    : 'No new strong matches this time. Try again later, or make your ideal client in Setup a little broader.', fresh.length ? 'success' : 'info');
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
  const done = (msg) => { const old = [...btn.childNodes]; btn.textContent = msg; setTimeout(() => { btn.replaceChildren(...old); }, 1600); };
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
  if (!q || q.status === 'pending') {
    state.phase = 'pending';
    // Lets the admin know about the request. The server sends this at most once per person.
    if (q) invoke('notify', { event: 'signup' }).catch((e) => console.warn('Request notification not sent:', e.message));
  }
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
// Small line icons, drawn to match the clerk: round caps, 1.8 stroke.
const ICONS = {
  setup: '<path d="M9 4h6M8 3h8a1 1 0 0 1 1 1v1H7V4a1 1 0 0 1 1-1z"/><path d="M7 5H5.5A1.5 1.5 0 0 0 4 6.5v13A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18.5 5H17"/><path d="M8 11l1.5 1.5L12 10M8 16.5l1.5 1.5 2.5-2.5M14 11.5h3M14 17h3"/>',
  prospects: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M8 13h8M8 16h5"/>',
  tracker: '<path d="M4 20h16"/><path d="M6.5 16v-4M11 16V8M15.5 16v-6M20 16V5" transform="translate(-.5 0)"/>',
  billing: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  admin: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M8 10l4 4 4-4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l4-4-4-4M14 12H4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
};
function svgFrom(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; }
const icon = (name) => svgFrom('<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>');
// The brand mark: a prospect file with its tab, and one green line written on it.
const markSvg = () => svgFrom('<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M4 9.5A1.5 1.5 0 0 1 5.5 8H12l2.5 3h12A1.5 1.5 0 0 1 28 12.5v13a1.5 1.5 0 0 1-1.5 1.5h-21A1.5 1.5 0 0 1 4 25.5z" fill="#E6D7A6" stroke="#10261D" stroke-width="2" stroke-linejoin="round"/><path d="M9 17.5h14" stroke="#0E6A48" stroke-width="2.6" stroke-linecap="round"/><path d="M9 22h9" stroke="#10261D" stroke-width="2" stroke-linecap="round" opacity=".35"/></svg>');
// A still copy of the clerk from the working card, for empty states.
const clerk = (still) => {
  const el = document.querySelector('#busy .bot').cloneNode(true);
  if (still) el.classList.add('still');
  return el;
};
const brand = (href) => h('a', { class: 'brand', href: href || '../', 'aria-label': 'Client Pipeline home' }, markSvg(), h('span', { text: 'Client Pipeline' }));
const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' },
  h('div', { class: 'col' }, h('h1', { text: title }), sub ? (typeof sub === 'string' ? h('p', { text: sub }) : sub) : null),
  actions.filter(Boolean).length ? h('div', { class: 'row' }, actions) : null);
const initial = (email) => (str(email).trim()[0] || '?').toUpperCase();

let toastSeq = 0;
function dismissToast(id) { state.toasts = state.toasts.filter((t) => t.id !== id); renderNotice(); }
const ERRORISH = /(could not|couldn't|did not|didn't|does not look|not right|failed|wrong|limit|expired|isn't|not found|too big|first\b|Enter |Add their|Add your|Choose|Describe|Paste|We couldn't|Only)/i;
function setNotice(msg, kind) {
  if (!msg) { state.toasts = []; renderNotice(); return; }
  const t = { id: ++toastSeq, msg, kind: kind || (ERRORISH.test(msg) ? 'error' : 'info') };
  state.toasts = [...state.toasts.filter((x) => x.msg !== msg), t].slice(-3);
  renderNotice();
  setTimeout(() => dismissToast(t.id), t.kind === 'error' ? 14000 : 7000);
}
function renderNotice() {
  const box = $('notice'); box.replaceChildren();
  state.toasts.forEach((t) => box.appendChild(h('div', { class: 'toast ' + t.kind, role: t.kind === 'error' ? 'alert' : 'status' },
    h('span', { text: t.msg }),
    h('button', { type: 'button', onclick: () => dismissToast(t.id) }, 'Dismiss'))));
}
function go(view) {
  state.view = view; state.menu = null; state.open = null; state.sheet = null;
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  render(); window.scrollTo(0, 0);
}
function render() {
  renderNotice();
  const root = $('app'), y = window.scrollY;
  let view;
  if (state.phase === 'app') view = viewShell();
  else if (state.phase === 'unconfigured') view = authFrame(viewUnconfigured());
  else if (state.phase === 'loading') view = authFrame(h('div', { class: 'auth-card' }, h('div', { class: 'skeleton', style: 'height:28px;width:60%' }), h('div', { class: 'skeleton', style: 'height:14px' }), h('div', { class: 'skeleton', style: 'height:14px;width:80%' })));
  else if (state.phase === 'error') view = authFrame(viewError());
  else if (state.phase === 'signedout') view = authFrame(viewSignIn(), true);
  else if (state.phase === 'pending') view = authFrame(viewPending());
  else if (state.phase === 'rejected') view = authFrame(viewRejected());
  else view = authFrame(viewPlans(true));
  root.replaceChildren(view);
  document.body.classList.toggle('locked', state.phase === 'app' && !!(state.sheet || (state.open && state.view === 'prospects')));
  window.scrollTo(0, y);
  if (state.focusDrawer) { state.focusDrawer = false; const c = document.querySelector('.drawer [data-close], .dialog [data-close]'); if (c) c.focus(); }
}
function authFrame(content) {
  return h('div', { class: 'auth' },
    h('header', { class: 'auth-top' }, brand(),
      state.user ? h('div', { class: 'row' }, h('span', { class: 'muted', text: state.user.email || '' }), h('button', { type: 'button', class: 'quiet small', onclick: signOut }, 'Sign out')) : h('span', { class: 'pill', text: 'Early access' })),
    h('main', { class: 'auth-body', id: 'main' }, content));
}

function viewUnconfigured() {
  return h('div', { class: 'auth-card' }, h('h1', { text: 'Almost there' }),
    h('p', { text: 'This app is not connected to Supabase yet. Add your Project URL and publishable key to app/config.js, as the setup guide describes.' }));
}
function viewError() {
  return h('div', { class: 'auth-card' }, h('h1', { text: 'Your account did not load' }),
    h('p', { text: 'Check your connection and try again.' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: () => loadAccount() }, 'Try again'),
      h('button', { type: 'button', class: 'quiet', onclick: signOut }, 'Sign out')));
}
function signInPitch() {
  return h('div', { class: 'auth-pitch' },
    h('h2', { text: 'Outreach that opens with something useful.' }),
    h('p', { text: "For each prospect, the app finds the one clear gap on their site and drafts three short emails that lead with it. You review, you send, you book the call." }),
    h('div', { class: 'pitch-card', 'aria-hidden': 'true' },
      h('p', { class: 'who', text: 'Example prospect file' }),
      h('div', { class: 'lines' }, h('div', { class: 'ln' }), h('div', { class: 'ln' })),
      h('p', { class: 'found' }, 'Their headline, ', h('span', { class: 'quote', text: '"The all-in-one platform for modern operations"' }), ", never says who it's for."),
      h('p', { class: 'hand note', text: 'That becomes the first line.' })));
}
function viewSignIn() {
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@youragency.com', value: state.sentTo });
  const send = async (e) => {
    e.preventDefault();
    const addr = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setNotice('Enter a valid email address.', 'error'); email.focus(); return; }
    busy(true, 'Sending your sign-in email...');
    const { error } = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    busy(false);
    if (error) { setNotice(/rate|seconds/i.test(error.message) ? 'Please wait a minute before asking for another email.' : 'The email could not be sent. Check the address and try again.', 'error'); return; }
    state.sentTo = addr; setNotice(''); render();
  };
  let card;
  if (!state.sentTo) {
    card = h('form', { class: 'auth-card', onsubmit: send, novalidate: true },
      h('h1', { text: 'Sign in or request access' }),
      h('p', { class: 'muted', style: 'font-size:15px', text: "Enter your work email. We'll send you a sign-in link and a 6-digit code. No password to remember." }),
      field('email', 'Work email', email),
      h('button', { type: 'submit', class: 'primary' }, 'Email me a sign-in link'),
      h('p', { class: 'faint', text: 'New here? Signing in creates your request. Tyler reviews every request before access opens.' }));
  } else {
    const code = h('input', { type: 'text', id: 'code', class: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '000000' });
    const verify = async (e) => {
      e.preventDefault();
      const token = code.value.replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(token)) { setNotice('Enter the code from the email.', 'error'); code.focus(); return; }
      busy(true, 'Signing you in...');
      const { error } = await sb.auth.verifyOtp({ email: state.sentTo, token, type: 'email' });
      busy(false);
      if (error) { setNotice('That code did not work. It may have expired: ask for a new email.', 'error'); return; }
      setNotice('');
    };
    card = h('form', { class: 'auth-card', onsubmit: verify, novalidate: true },
      h('h1', { text: 'Check your email' }),
      h('p', { class: 'muted', style: 'font-size:15px' }, 'We sent a sign-in link and a code to ', h('b', { text: state.sentTo }), '. Click the link, or type the code here.'),
      field('code', 'Code from the email', code),
      h('button', { type: 'submit', class: 'primary' }, 'Sign in'),
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'quiet small', onclick: () => { state.sentTo = ''; render(); } }, 'Use a different email')),
      h('p', { class: 'faint', text: 'Nothing yet? Check your spam folder. Links work best opened in this same browser; the code works anywhere.' }));
  }
  return h('div', { class: 'auth-split' }, signInPitch(), card);
}
function viewPending() {
  return h('div', { class: 'auth-card' },
    h('p', { class: 'hand', text: 'Request received.' }),
    h('h1', { text: "You're on the list" }),
    h('p', { text: "Tyler reviews every request personally, and we'll email you as soon as yours is approved. Then you can choose a plan right here." }),
    h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => loadAccount() }, 'Check again')));
}
function viewRejected() {
  return h('div', { class: 'auth-card' }, h('h1', { text: "We're not a fit right now" }),
    h('p', { text: "Thanks for your interest in Client Pipeline. Early access is limited, and we can't open an account for you at the moment. If you think this is a mistake, reply to any email from us." }));
}
function planCard(pl, current) {
  return h('div', { class: 'plan' + (pl.main ? ' main' : '') },
    pl.main ? h('span', { class: 'pill plan-tag', text: 'Includes 1:1 coaching' }) : null,
    h('h2', { text: pl.name }), h('p', { class: 'price' }, pl.price, ' ', h('small', { text: 'a month' })),
    h('p', { class: 'muted', text: pl.blurb }),
    h('ul', { class: 'ticks' }, pl.items.map((t) => h('li', { text: t }))),
    current ? h('p', { class: 'label', text: 'Your plan' })
      : h('button', { type: 'button', class: pl.main ? 'primary' : '', onclick: () => startCheckout(pl.id) }, pl.cta));
}
function viewPlans(standalone) {
  if (state.confirming) {
    return h('div', { class: 'auth-card' }, clerk(false), h('h1', { text: 'Confirming your payment' }),
      h('p', { text: 'Stripe has your payment. Your plan switches on here in a few seconds.' }));
  }
  return h('div', { class: 'stack', style: 'width:100%;max-width:900px' },
    h('div', { class: 'col', style: 'gap:6px' },
      standalone ? h('p', { class: 'hand', text: "You're approved." }) : null,
      h('h1', { text: 'Choose your plan' }),
      h('p', { class: 'muted', style: 'font-size:15px', text: 'Payment is handled by Stripe. You can change or cancel your plan any time from Billing.' })),
    h('div', { class: 'plans' }, PLANS.map((pl) => planCard(pl, false))),
    h('p', { class: 'faint', text: 'Interested in the mastermind? It is by invitation. Reply to your welcome email and Tyler will tell you more.' }));
}

// ---------- the app frame: sidebar on desktop, top bar and tab bar on phones ----------
function navItems() {
  const items = [['setup', 'Setup', 'setup'], ['prospects', 'Prospects', 'prospects'], ['tracker', 'Tracker', 'tracker'], ['billing', 'Billing', 'billing']];
  if (state.profile?.is_admin) items.push(['admin', 'Admin', 'admin']);
  return items;
}
const waitingCount = () => state.prospects.filter((p) => p.status === 'Suggested').length;
function navLink([v, label, ic]) {
  const n = v === 'prospects' ? waitingCount() : 0;
  return h('a', { href: '#' + v, 'aria-current': state.view === v ? 'page' : null, onclick: (e) => { e.preventDefault(); go(v); } },
    icon(ic), h('span', { text: label }), n ? h('span', { class: 'count', 'aria-label': n + ' best fits waiting', text: String(n) }) : null);
}
function wsMenu() {
  const w = ws();
  const btn = h('button', { type: 'button', class: 'ws-btn', 'aria-haspopup': 'menu', 'aria-expanded': String(state.menu === 'ws'),
    onclick: (e) => { e.stopPropagation(); state.menu = state.menu === 'ws' ? null : 'ws'; render(); } },
    h('span', { class: 'ws-ico', text: initial(w ? w.name : '+') }),
    h('span', { class: 'ws-name', text: w ? w.name : 'No workspace yet' }), icon('chevron'));
  const box = h('div', { class: 'anchor grow' }, btn);
  if (state.menu === 'ws') {
    box.appendChild(h('div', { class: 'menu', role: 'menu', style: 'top:calc(100% + 6px);left:0;right:0' },
      h('p', { class: 'menu-head', text: 'Workspaces' }),
      state.workspaces.map((x) => h('button', { type: 'button', role: 'menuitemradio', 'aria-current': String(x.id === state.wsId),
        onclick: () => { state.menu = null; if (x.id !== state.wsId) switchWs(x.id); else render(); } }, x.name)),
      h('hr'),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { state.menu = null; state.wsId = null; state.prospects = []; go('setup'); } }, icon('plus'), 'New workspace')));
  }
  return box;
}
function userMenu(where) {
  const email = state.user?.email || '', p = state.profile || {};
  const plan = PLANS.find((x) => x.id === p.plan);
  const role = p.is_admin ? 'Admin' : plan && ['active', 'trialing', 'past_due'].includes(p.subscription_status || '') ? plan.name : p.comped ? 'Complimentary access' : '';
  const open = state.menu === 'user-' + where;
  const toggle = (e) => { e.stopPropagation(); state.menu = open ? null : 'user-' + where; render(); };
  const btn = where === 'side'
    ? h('button', { type: 'button', class: 'me', 'aria-haspopup': 'menu', 'aria-expanded': String(open), onclick: toggle },
      h('span', { class: 'avatar', text: initial(email) }), h('span', { class: 'col' }, h('b', { text: email }), role ? h('span', { class: 'faint', text: role }) : null))
    : h('button', { type: 'button', class: 'avatar-btn', 'aria-label': 'Account', 'aria-haspopup': 'menu', 'aria-expanded': String(open), onclick: toggle }, h('span', { class: 'avatar', text: initial(email) }));
  const box = h('div', { class: 'anchor' }, btn);
  if (open) {
    box.appendChild(h('div', { class: 'menu', role: 'menu', style: where === 'side' ? 'bottom:calc(100% + 6px);left:0;right:0' : 'top:calc(100% + 8px);right:0' },
      h('p', { class: 'menu-head', text: email }),
      h('button', { type: 'button', role: 'menuitem', onclick: () => go('billing') }, icon('billing'), 'Billing'),
      h('hr'),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { state.menu = null; signOut(); } }, icon('logout'), 'Sign out')));
  }
  return box;
}
function viewShell() {
  const items = navItems();
  if (!items.some(([v]) => v === state.view)) state.view = 'setup';
  const side = h('aside', { class: 'side', 'aria-label': 'Main' },
    brand(),
    wsMenu(),
    h('nav', { class: 'nav', 'aria-label': 'Sections' },
      items.filter(([v]) => !['billing', 'admin'].includes(v)).map(navLink),
      h('p', { class: 'nav-label', text: 'Account' }),
      items.filter(([v]) => ['billing', 'admin'].includes(v)).map(navLink)),
    h('div', { class: 'side-foot' }, userMenu('side')));
  const top = h('header', { class: 'topbar' }, brand(), wsMenu(), userMenu('top'));
  const tabs = h('nav', { class: 'tabbar nav', 'aria-label': 'Sections' }, items.map(navLink));
  const main = h('main', { class: 'content', id: 'main' }, viewPage());
  return h('div', { class: 'shell' }, side, h('div', { class: 'frame' }, top, main), tabs, overlays());
}
function viewPage() {
  const w = ws();
  if (state.loadingWs) return h('div', { class: 'stack' }, h('div', { class: 'skeleton', style: 'height:32px;width:40%' }), h('div', { class: 'skeleton', style: 'height:180px' }));
  if (state.view === 'billing') return viewBilling();
  if (state.view === 'admin') return viewAdmin();
  if (!w) return viewWelcome();
  if (state.view === 'prospects') return viewProspects(w);
  if (state.view === 'tracker') return viewTracker();
  return viewSetup(w);
}
function overlays() {
  const box = h('div', {});
  const w = ws();
  if (state.view === 'prospects' && w) {
    const p = state.open && state.prospects.find((x) => x.id === state.open);
    if (p) box.append(h('div', { class: 'scrim', onclick: closeOverlay }), prospectDrawer(p, assetById(w.asset?.id) || ASSETS[0]));
    if (state.sheet === 'add') box.append(h('div', { class: 'scrim', onclick: closeOverlay }), addDialog(w));
  }
  return box;
}
function closeOverlay() { state.open = null; state.sheet = null; state.confirm = null; render(); }
document.addEventListener('click', (e) => { if (state.menu && !e.target.closest('.anchor')) { state.menu = null; render(); } });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || state.busy) return;
  if (state.menu) { state.menu = null; render(); return; }
  if (state.sheet || state.open) closeOverlay();
});

function viewWelcome() {
  const name = h('input', { type: 'text', id: 'new-ws-name', placeholder: 'Agency or client name' });
  const start = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } createWs(n, false); };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } });
  return h('div', { class: 'sheet', style: 'max-width:640px' },
    h('div', { class: 'empty', style: 'padding:12px 0 0' }, clerk(true),
      h('h1', { text: state.workspaces.length ? 'Add a workspace' : 'Set up your first workspace' }),
      h('p', { class: 'muted', style: 'font-size:15px', text: 'A workspace holds one agency: its ideal client, its voice, the value asset it leads with, and its prospects.' })),
    field('new-ws-name', 'Name this workspace', name),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', onclick: start }, 'Create workspace'),
      h('button', { type: 'button', onclick: () => createWs('', true) }, 'Try it with example data'),
      state.workspaces.length ? h('button', { type: 'button', class: 'quiet', onclick: () => switchWs(state.workspaces[0].id) }, 'Cancel') : null));
}

// ---------- setup: a guided walkthrough, then a summary ----------
function firstSetupStep(w) {
  const i = w.intake || {};
  if (i._done) return null;
  if (!i.website && !FIELDS.some((f) => str(i[f.k]).trim())) return 'start';
  const n = STEPS.findIndex((st) => st.need.some((k) => !str(i[k]).trim()));
  return n === -1 ? 'plan' : n;
}
function goStep(step, extra) {
  state.setup = { ...state.setup, step, nudge: null, suggest: null, focus: true, ...(extra || {}) };
  state.toasts = [];
  render();
  window.scrollTo(0, 0);
}
// Instant coaching on the answers that matter most. Shown once per answer:
// pressing Next again with the same answer moves on.
function nudgeFor(k, v) {
  const t = str(v).trim();
  if (!t) return null;
  if (k === 'sells') {
    if (t.length < 25) return 'Add a little more: the one offer you lead with, and what it costs.';
    if ((t.match(/,|;|\band\b/g) || []).length >= 4) return "That's a few offers. Which one would you sell all day? Lead with that one.";
    if (!/[$\u20ac\u00a3\u00a5]|\b\d[\d,.]*\s*(k|usd|dollars?|eur|euros?|gbp|pounds?)\b|\b(per|a|each)\s+(month|project|year|hour|engagement)\b|retainer|\/\s?(mo|month|hr|hour|yr)\b/i.test(t)) return "What does it cost? A real price, even a starting price, helps the weekly search find companies that can afford you.";
  }
  if (k === 'ideal') {
    if (t.length < 30) return 'Be a bit more specific: industry, company size, location, and the role you sell to.';
    if (!/\d|small|mid|large|enterprise|staff|employees|people|revenue|founder|owner|head|director|vp|chief|c[emt]o\b/i.test(t)) return 'Roughly how big are they, and who do you sell to? Size and role make the weekly search much sharper.';
  }
  if (k === 'notice' && t.length < 25) return 'What exactly do you spot? Use the words you would say out loud on a call.';
  return null;
}
function modeSwitch(w) {
  const guided = w.mode === 'guided';
  return h('div', { class: 'row' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' },
      h('button', { type: 'button', 'aria-pressed': String(!guided), onclick: () => { saveWs(w, { mode: 'self' }); render(); } }, 'On my own'),
      h('button', { type: 'button', 'aria-pressed': String(guided), onclick: () => { saveWs(w, { mode: 'guided' }); render(); } }, 'With a coach')),
    h('span', { class: 'muted', text: guided ? 'Coach prompts show under each question.' : 'Running this on a call? Switch to coach prompts.' }));
}
function viewSetup(w) {
  if (!w.intake) w.intake = {};
  if (!state.setup || state.setup.ws !== w.id) state.setup = { ws: w.id, step: firstSetupStep(w), nudge: null, nudged: {}, focus: true };
  const st = state.setup;
  if (st.step === null) return viewSetupSummary(w);
  const total = STEPS.length, at = st.step === 'start' ? 0 : st.step === 'plan' ? total : st.step;
  const frame = h('div', { class: 'wizard-wrap' },
    h('div', { class: 'row between' },
      h('span', { class: 'label', text: st.step === 'start' ? 'Getting started' : st.step === 'plan' ? 'All seven steps done' : Math.round((at / total) * 100) + '% done' }),
      w.intake._done ? h('button', { type: 'button', class: 'quiet small', onclick: () => goStep(null, { returnTo: null }) }, 'Exit setup') : null),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(at), 'aria-label': 'Setup progress' },
      h('span', { style: 'width:' + Math.max(3, Math.round((at / total) * 100)) + '%' })));
  const body = st.step === 'start' ? viewSetupStart(w) : st.step === 'plan' ? viewSetupPlan(w) : viewSetupQuestion(w, st.step);
  frame.appendChild(body);
  if (st.step !== 'plan') frame.appendChild(modeSwitch(w));
  if (st.focus) {
    st.focus = false;
    setTimeout(() => { const el = document.querySelector('#main .wizard input, #main .wizard textarea'); if (el) el.focus(); }, 0);
  }
  return frame;
}
function viewSetupStart(w) {
  const i = w.intake, back = state.setup.returnTo === 'summary';
  const url = h('input', { type: 'url', id: 'site-url', value: str(i.website), placeholder: 'youragency.com', autocomplete: 'url' });
  const notes = h('textarea', { id: 'brain-dump', class: 'big', value: back ? '' : str(i.brainDump),
    placeholder: "Who you help, what you sell and what it costs, the clients you love and the ones you don't, what you spot first when you look at a prospect. Messy is fine." });
  const draft = async () => {
    const v = url.value.trim(), n = notes.value.trim();
    if (v && !domainOf(v)) { url.focus(); setNotice('That website address does not look right. Try something like youragency.com.'); return; }
    if (!v && n.length < 20) { url.focus(); setNotice('Add your website, or a few sentences about your agency, and the app drafts your answers.'); return; }
    const done = await prefillFromSite(w, v, n);
    if (!done) return;
    goStep(back ? null : 0, back ? { returnTo: null } : {});
    if (typeof done === 'string') setNotice(done);
  };
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); draft(); } });
  return h('div', { class: 'sheet wizard' },
    h('p', { class: 'hand', text: back ? 'Draft again' : "Let's get you set up." }),
    h('h1', { class: 'wiz', text: back ? 'Draft your answers again' : 'Start with your website, your words, or both' }),
    h('p', { text: back ? 'The app fills in any answers that are still empty. It never overwrites what you wrote.'
      : "The app reads them and drafts every answer, so you're checking instead of writing. Seven short steps, about five minutes." }),
    field('site-url', 'Your website', url),
    field('brain-dump', 'Or just tell us about your agency (optional)', notes,
      'Type it, or tap the microphone on your phone keyboard and talk. Two minutes of rambling beats twenty minutes of forms.'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', onclick: draft }, 'Draft my answers'),
      back ? h('button', { type: 'button', onclick: () => goStep(null, { returnTo: null }) }, 'Back to setup')
        : h('button', { type: 'button', class: 'quiet', onclick: () => {
          const v = url.value.trim(), n = notes.value.trim();
          if (v || n) saveWs(w, { intake: { ...w.intake, ...(v ? { website: v } : {}), ...(n ? { brainDump: n.slice(0, 8000) } : {}) } });
          goStep(0);
        } }, "Skip, I'll type my answers")));
}
const POLISH = ['sells', 'ideal', 'notFit', 'notice', 'giveaway', 'proof'];
async function improveAnswer(w, k) {
  const i = w.intake, st = state.setup;
  saveWs(w, { intake: { ...i } });
  const { voice, _drafted, ...context } = i; // keep the request small
  const r = await ask(str(i[k]).trim() ? 'Improving your answer.' : 'Suggesting an answer.', 'polish', { field: k, draft: str(i[k]), intake: context });
  if (!r) return;
  st.suggest = { k, ...r }; st.nudge = null;
  render();
}
function suggestionCard(w, k, sg) {
  const i = w.intake, st = state.setup;
  const use = () => {
    i[k] = sg.answer;
    if (i._drafted?.[k]) { i._drafted = { ...i._drafted }; delete i._drafted[k]; }
    st.suggest = null;
    st.nudged[k] = str(sg.answer).trim(); // no second nudge on an answer we just wrote together
    st.nudge = sg.missing ? { k, msg: sg.missing + ' Add it above if you can.' } : null;
    saveWs(w, { intake: { ...i } });
    render();
  };
  return h('div', { class: 'suggest', role: 'status', 'aria-live': 'polite' },
    sg.answer ? h('p', { class: 'label', text: 'Suggested answer' }) : null,
    sg.answer ? h('p', { class: 'suggest-text', text: sg.answer }) : null,
    sg.answer && sg.note ? h('p', { class: 'muted', text: sg.note }) : null,
    sg.missing ? h('div', { class: 'nudge' }, h('b', { text: 'One question: ' }), sg.missing,
      sg.answer ? '' : ' Answer it in your own words above, then press the button again.') : null,
    h('div', { class: 'row' },
      sg.answer ? h('button', { type: 'button', class: 'primary', onclick: use }, 'Use this') : null,
      h('button', { type: 'button', class: 'quiet', onclick: () => { st.suggest = null; render(); } }, sg.answer ? 'Keep mine' : 'Close')));
}
function viewSetupQuestion(w, n) {
  const step = STEPS[n], i = w.intake, st = state.setup, guided = w.mode === 'guided';
  const drafted = i._drafted || {};
  const improve = (k) => improveAnswer(w, k);
  const box = h('div', { class: 'sheet wizard' },
    h('p', { class: 'label', text: 'Step ' + (n + 1) + ' of ' + STEPS.length }),
    h('h1', { class: 'wiz', text: step.title }),
    h('p', { class: 'muted', text: step.why }));
  const next = () => {
    // Moving on counts as checking a drafted answer.
    if (i._drafted && step.keys.some((k) => i._drafted[k])) { i._drafted = { ...i._drafted }; step.keys.forEach((k) => delete i._drafted[k]); }
    saveWs(w, { intake: { ...i } });
    for (const k of step.keys) {
      const msg = nudgeFor(k, i[k]);
      if (msg && st.nudged[k] !== str(i[k]).trim()) {
        st.nudged[k] = str(i[k]).trim(); st.nudge = { k, msg }; render(); return;
      }
    }
    const empty = step.need.find((k) => !str(i[k]).trim());
    if (empty) { st.nudge = { k: empty, msg: 'Add an answer, even a rough one. You can change it any time.' }; render(); return; }
    // An answer they've just worked on no longer needs the "sharpen" prompt.
    if (w.asset?.sharpen?.some((x) => step.keys.includes(x.field))) {
      saveWs(w, { asset: { ...w.asset, sharpen: w.asset.sharpen.filter((x) => !step.keys.includes(x.field)) } });
    }
    if (st.returnTo) goStep(st.returnTo === 'summary' ? null : 'plan', { returnTo: null });
    else goStep(n + 1 < STEPS.length ? n + 1 : 'plan');
  };
  step.keys.forEach((k) => {
    const f = FIELD[k], id = 'f-' + k;
    const c = f.line ? h('input', { type: 'text', id, value: str(i[k]), placeholder: f.ph || '' })
      : h('textarea', { id, class: f.big ? 'big' : '', value: str(i[k]), placeholder: POLISH.includes(k) ? 'Rough notes are fine. Type or talk, then press Improve with AI.' : (f.ph || '') });
    c.addEventListener('input', () => {
      i[k] = c.value;
      const ai = $('ai-' + k); if (ai) ai.textContent = c.value.trim() ? 'Improve with AI' : 'Suggest an answer';
      if (drafted[k]) { delete drafted[k]; i._drafted = { ...drafted }; const b = $('drafted-' + k); if (b) b.remove(); }
    });
    c.addEventListener('change', () => saveWs(w, { intake: { ...i } }));
    if (f.line) c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i[k] = c.value; next(); } });
    const label = step.keys.length > 1 ? f.label : (step.need.includes(k) ? 'Your answer' : 'Your answer (optional)');
    box.appendChild(h('div', { class: 'col' },
      h('label', { for: id, text: label }),
      drafted[k] ? h('p', { class: 'badge', id: 'drafted-' + k, text: 'Drafted for you. Make it yours.' }) : null,
      c));
    if (POLISH.includes(k)) {
      const has = !!str(i[k]).trim(), sg = st.suggest && st.suggest.k === k ? st.suggest : null;
      box.appendChild(h('div', { class: 'row' },
        h('button', { type: 'button', class: 'ai', id: 'ai-' + k, onclick: () => improve(k) }, has ? 'Improve with AI' : 'Suggest an answer'),
        h('span', { class: 'muted', text: has ? 'Rough notes are fine. It tidies them up and keeps your facts.' : "Drafts one from what you've told us so far." })));
      if (sg) box.appendChild(suggestionCard(w, k, sg));
    }
    if (st.nudge && st.nudge.k === k) box.appendChild(h('div', { class: 'nudge', role: 'status' }, h('b', { text: 'Quick thought: ' }), st.nudge.msg));
    if (guided && f.coach) box.appendChild(h('div', { class: 'coach' }, h('b', { text: 'Coach: ' }), f.coach));
  });
  if (step.example) box.appendChild(h('p', { class: 'muted' }, h('b', { text: 'Example: ' }), step.example));
  const last = n === STEPS.length - 1, editing = !!st.returnTo;
  box.appendChild(h('div', { class: 'row' },
    h('button', { type: 'button', class: 'primary', onclick: next }, editing ? 'Save' : last ? 'See my plan' : 'Next'),
    editing ? h('button', { type: 'button', onclick: () => goStep(st.returnTo === 'summary' ? null : 'plan', { returnTo: null }) }, 'Cancel')
      : h('button', { type: 'button', onclick: () => goStep(n === 0 ? 'start' : n - 1) }, 'Back'),
    !editing && !step.need.length ? h('button', { type: 'button', class: 'quiet', onclick: () => goStep(last ? 'plan' : n + 1) }, 'Skip for now') : null));
  return box;
}
function assetSheet(w) {
  const a = w.asset ? assetById(w.asset.id) : null;
  const card = h('div', { class: 'col' });
  if (a) {
    card.appendChild(h('div', { class: 'block soft' },
      h('p', { class: 'label', text: 'You lead with' }),
      h('h2', { text: a.name }), h('p', { text: a.deliverable }),
      w.asset.why ? h('p', { text: w.asset.why }) : null,
      w.asset.lookFor?.length ? h('div', { class: 'col' }, h('b', { text: 'Look for in each prospect' }), h('ul', { class: 'plain' }, w.asset.lookFor.map((t) => h('li', { text: t })))) : null,
      w.asset.openingAngle ? h('p', {}, h('b', { text: 'How email 1 opens: ' }), w.asset.openingAngle) : null));
    const ru = assetById(w.asset.runnerUpId);
    if (ru) card.appendChild(h('p', { class: 'muted', text: 'Runner-up: ' + ru.name + '. ' + str(w.asset.runnerUpWhy) }));
  }
  const pick = h('select', { id: 'asset-pick', 'aria-label': 'Choose a value asset yourself', onchange: (e) => {
    if (!e.target.value) return;
    saveWs(w, { asset: { id: e.target.value, why: '', lookFor: [], openingAngle: '', sharpen: w.asset?.sharpen || [] } }); render();
  } }, h('option', { value: '', text: a ? 'Choose a different one' : 'Or choose one yourself' }), ASSETS.map((x) => h('option', { value: x.id, text: x.name + ' (' + x.fits + ')' })));
  card.appendChild(h('div', { class: 'row' },
    h('button', { type: 'button', class: a ? '' : 'primary', onclick: recommendAsset }, a ? 'Recommend again from my answers' : 'Recommend my value asset'), pick));
  return card;
}
const SHORT = { sells: 'Your offer', ideal: 'Your ideal client', notFit: "Who you don't want", notice: 'What you notice first', giveaway: 'What you give away' };
const stepOf = (k) => STEPS.findIndex((s) => s.keys.includes(k));
function sharpenList(w) {
  const items = (w.asset?.sharpen || []).filter((x) => FIELD[x.field]);
  if (!items.length) return null;
  return h('div', { class: 'col' },
    h('h3', { text: items.length === 1 ? 'One answer worth sharpening' : 'Two answers worth sharpening' }),
    items.map((x) => h('div', { class: 'nudge row', style: 'justify-content:space-between' },
      h('span', {}, h('b', { text: SHORT[x.field] + ': ' }), x.question),
      h('button', { type: 'button', onclick: () => goStep(stepOf(x.field), { returnTo: state.setup.step === null ? 'summary' : 'plan' }) }, 'Edit answer'))));
}
function viewSetupPlan(w) {
  if (!w.asset && state.autoRec !== w.id) { state.autoRec = w.id; setTimeout(recommendAsset, 0); }
  const finish = () => {
    saveWs(w, { intake: { ...w.intake, _done: true } });
    state.setup = { ...state.setup, step: null };
    state.addMode = 'find';
    go('prospects');
  };
  return h('div', { class: 'sheet wizard' },
    h('p', { class: 'hand', text: "That's the hard part done." }),
    h('h1', { class: 'wiz', text: 'Your plan' }),
    h('p', { text: "Here's the one useful thing you'll make for every prospect. Each email opens with a finding from it." }),
    w.asset ? null : h('p', { class: 'muted', text: 'Choosing the best fit from your answers...' }),
    assetSheet(w),
    sharpenList(w),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', disabled: !w.asset, onclick: finish }, 'Find my first prospects'),
      h('button', { type: 'button', onclick: () => goStep(STEPS.length - 1) }, 'Back')));
}
function viewSetupSummary(w) {
  const i = w.intake, guided = w.mode === 'guided';
  const out = h('div', { class: 'stack' });
  out.appendChild(pageHead('Setup', 'Your answers drive every finding, email and weekly suggestion. Change anything, any time.',
    h('button', { type: 'button', onclick: () => goStep(0, { returnTo: null, nudged: {} }) }, 'Walk through setup again')));
  out.appendChild(modeSwitch(w));

  const rows = h('div', { class: 'answers' });
  const line = (label, value, onEdit) => rows.appendChild(h('div', { class: 'answer' },
    h('div', { class: 'col', style: 'gap:2px' }, h('b', { text: label }), value ? h('span', { text: value }) : h('span', { class: 'muted', text: 'Not answered yet' })),
    h('button', { type: 'button', class: 'small', onclick: onEdit, 'aria-label': 'Edit ' + label }, 'Edit')));
  line('Website', str(i.website), () => goStep('start', { returnTo: 'summary' }));
  FIELDS.forEach((f) => line(f.label, f.k === 'voice' && str(i.voice).trim() ? 'Added (' + str(i.voice).trim().split(/\s+/).length + ' words)' : str(i[f.k]).trim(),
    () => goStep(stepOf(f.k), { returnTo: 'summary' })));
  out.appendChild(h('div', { class: 'sheet' }, h('h2', { text: 'Your answers' }), rows));

  out.appendChild(h('div', { class: 'sheet' }, h('h2', { text: 'Your value asset' }),
    h('p', { class: 'muted', text: 'The one useful thing you make for each prospect before you ask for anything.' }),
    assetSheet(w), sharpenList(w),
    w.asset ? h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => go('prospects') }, 'Go to prospects')) : null));

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

  const del = h('div', { class: 'sheet' }, h('h2', { text: 'Workspace settings' }));
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
const addedThisWeek = () => { const cut = Date.now() - 7 * 864e5; return state.prospects.filter((p) => inPipeline(p) && Date.parse(p.created_at) >= cut).length; };
const suggestedThisWeek = () => { const cut = Date.now() - 7 * 864e5; return state.prospects.filter((p) => p.source === 'suggested' && Date.parse(p.created_at) >= cut).length; };
const inPipeline = (p) => p.status !== 'Suggested' && !(p.source === 'suggested' && p.status === 'Not a fit' && !p.finding);
const gmailLink = (to, subject, body) => 'https://mail.google.com/mail/?view=cm&fs=1' +
  (isEmail(to) ? '&to=' + encodeURIComponent(str(to).trim()) : '') + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

// ---------- CSV import ----------
function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : (firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (quoted) {
      if (c === '"') { if (text[n + 1] === '"') { cell += '"'; n++; } else quoted = false; } else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[n + 1] === '\n') n++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}
const CSV_COLUMNS = {
  company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'account', 'account name', 'business', 'business name'],
  url: ['website', 'url', 'domain', 'company website', 'company url', 'company domain', 'site', 'web', 'homepage', 'website url'],
  first: ['first name', 'firstname', 'first', 'contact first name', 'given name'],
  name: ['contact', 'contact name', 'name', 'full name', 'person'],
  email: ['email', 'email address', 'e-mail', 'work email', 'contact email', 'business email'],
  role: ['title', 'job title', 'role', 'position', 'job role'],
};
function csvProspects(text) {
  const rows = parseCsv(text.replace(/^\ufeff/, ''));
  if (rows.length < 2) return { error: 'That file needs a header row and at least one prospect.' };
  const head = rows[0].map((x) => x.toLowerCase().replace(/[_]+/g, ' ').trim());
  const col = (k) => head.findIndex((x) => CSV_COLUMNS[k].includes(x));
  const at = { company: col('company'), url: col('url'), first: col('first'), name: col('name'), email: col('email'), role: col('role') };
  if (at.company < 0 && at.url < 0) return { error: 'We could not find a Company or Website column. Name one of your columns "Company" or "Website".' };
  const have = new Set(state.prospects.map((p) => domainOf(p.url)).filter(Boolean));
  const seen = new Set(), out = []; let dupes = 0;
  for (const r of rows.slice(1)) {
    const get = (k) => (at[k] >= 0 ? str(r[at[k]]).trim() : '');
    const url = get('url'), d = domainOf(url);
    const company = get('company') || d;
    if (!company) continue;
    const key = d || company.toLowerCase();
    if ((d && have.has(d)) || seen.has(key)) { dupes++; continue; }
    seen.add(key);
    const email = isEmail(get('email')) ? get('email') : '';
    out.push({ company: company.slice(0, 200), url: d ? (/^https?:\/\//i.test(url) ? url : 'https://' + url).slice(0, 500) : '',
      contact: (get('first') || get('name').split(/\s+/)[0] || '').slice(0, 200), email: email.slice(0, 320), role: get('role').slice(0, 200) });
  }
  return { rows: out.slice(0, 300), dupes, cut: Math.max(0, out.length - 300) };
}
async function importRows(w, rows) {
  busy(true, 'Importing ' + rows.length + ' prospects...');
  try {
    const added = [];
    for (let n = 0; n < rows.length; n += 100) {
      const { data, error } = await sb.from('prospects').insert(rows.slice(n, n + 100).map((r) => ({ ...r, workspace_id: w.id, source: 'import' }))).select();
      if (error) throw error;
      added.push(...data);
    }
    state.prospects = [...added.reverse(), ...state.prospects];
    state.csv = null;
    setNotice('Imported ' + added.length + ' prospects. Open one and press "Find the gap and draft emails" to start.', 'success');
  } catch (e) { saveFailed(e); } finally { busy(false); render(); }
}

// ---------- prospects tab ----------
const FILTERS = [['all', 'All'], ['New', 'To draft'], ['Drafted', 'Drafted'], ['Approved', 'Approved'], ['Sent', 'Sent'], ['Replied', 'Replied'], ['Call booked', 'Calls booked'], ['Not a fit', 'Not a fit']];
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
function openAdd(mode) { state.sheet = 'add'; state.addMode = mode || 'one'; state.csv = null; state.focusDrawer = true; render(); }
function openProspect(id) { state.open = id; state.confirm = null; state.emailTab = 0; state.focusDrawer = true; render(); }

function viewProspects(w) {
  const a = assetById(w.asset?.id), out = h('div', { class: 'stack' });
  const hasIdeal = str(w.intake?.ideal).trim().length >= 15;
  const used = suggestedThisWeek(), left = Math.max(0, SUGGEST_WEEKLY - used);
  const list = state.prospects.filter(inPipeline);
  const sug = state.prospects.filter((p) => p.status === 'Suggested').sort((x, y) => (y.fit_score ?? 0) - (x.fit_score ?? 0));
  const findBtn = h('button', { type: 'button', class: 'primary', disabled: !hasIdeal || !left, onclick: findBestFits,
    title: !hasIdeal ? 'Describe your ideal client in Setup first' : !left ? "You've used this week's " + SUGGEST_WEEKLY : null }, used ? 'Find more best fits' : 'Find my best fits');
  out.appendChild(pageHead('Prospects',
    a ? h('p', {}, 'Leading with ', h('b', { text: a.name }), '. ' + addedThisWeek() + ' added this week, aim for ' + WEEK_TARGET + '.') : 'Finish setup first, so the findings fit what you sell.',
    h('button', { type: 'button', onclick: () => openAdd('one') }, icon('plus'), 'Add prospects'), findBtn));
  if (!a) out.appendChild(h('div', { class: 'nudge row between' }, h('span', { text: 'Your value asset is not chosen yet. The finding in each email comes from it.' }),
    h('button', { type: 'button', class: 'small', onclick: () => { state.setup = null; go('setup'); } }, 'Go to Setup')));

  if (sug.length) out.appendChild(reviewPanel(sug, used));
  else if (used) out.appendChild(h('p', { class: 'faint', text: used + ' of ' + SUGGEST_WEEKLY + ' best fits used this week.' + (left ? '' : " More open up as this week's age out.") }));

  if (!list.length && !sug.length) {
    out.appendChild(h('div', { class: 'sheet' }, h('div', { class: 'empty' }, clerk(true),
      h('h2', { text: 'Your pipeline starts here' }),
      h('p', { class: 'muted', style: 'font-size:15px', text: hasIdeal ? "Let the app find this week's best-fit companies, add one by its website, or bring a list you already have."
        : 'Add a prospect by its website or import a list. Finish your ideal client in Setup and the app can find best fits for you too.' }),
      h('div', { class: 'row', style: 'justify-content:center' },
        hasIdeal ? h('button', { type: 'button', class: 'primary', disabled: !left, onclick: findBestFits }, 'Find my best fits') : null,
        h('button', { type: 'button', onclick: () => openAdd('one') }, 'Add one'),
        h('button', { type: 'button', onclick: () => openAdd('csv') }, icon('upload'), 'Import a list')))));
    return out;
  }
  if (!list.length) return out;

  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === 'all' ? list.length : list.filter((p) => p.status === k).length]));
  if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';
  const q = state.q.trim().toLowerCase();
  const shown = list.filter((p) => (state.filter === 'all' || p.status === state.filter) &&
    (!q || [p.company, p.contact, p.email, p.url].some((x) => str(x).toLowerCase().includes(q))));
  const search = h('input', { type: 'search', id: 'p-search', placeholder: 'Search prospects', value: state.q, 'aria-label': 'Search prospects' });
  search.addEventListener('input', () => {
    state.q = search.value; const pos = search.selectionStart; render();
    const again = $('p-search'); if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  out.appendChild(h('div', { class: 'sheet flush' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' },
        FILTERS.filter(([k]) => k === 'all' || counts[k]).map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(state.filter === k),
          onclick: () => { state.filter = k; render(); } }, label, h('span', { text: String(counts[k]) })))),
      search),
    shown.length ? h('div', { class: 'plist' }, shown.map(prospectRow))
      : h('div', { class: 'empty' }, h('p', { class: 'muted', text: 'No prospects match. Try another filter or search.' }))));
  return out;
}
function prospectRow(p) {
  return h('button', { type: 'button', class: 'prow phead', 'aria-current': String(state.open === p.id), onclick: () => openProspect(p.id) },
    h('span', { class: 'pname', text: p.company }),
    h('span', { class: 'psub', text: [[p.contact, p.role].filter(Boolean).join(', '), domainOf(p.url)].filter(Boolean).join('  |  ') || 'No contact yet' }),
    h('span', { class: 'pmeta' }, p.fit_score != null ? h('span', { class: 'score', title: 'Fit with your ideal client', text: 'Fit ' + p.fit_score }) : null, chip(p.status)),
    h('span', { class: 'pdate', text: fmtDate(p.created_at) }));
}
function reviewPanel(sug, used) {
  const panel = h('section', { class: 'review', 'aria-label': 'Best fits to review' },
    h('div', { class: 'row between' },
      h('div', { class: 'col', style: 'gap:2px' },
        h('h2', {}, sug.length + ' best ' + (sug.length === 1 ? 'fit' : 'fits') + ' waiting for you'),
        h('p', { class: 'muted', text: 'Add the ones you like. ' + used + ' of ' + SUGGEST_WEEKLY + ' used this week.' })),
      sug.length > 1 ? h('button', { type: 'button', class: 'small', onclick: async () => { for (const p of sug) await saveProspect(p, { status: 'New' }); setNotice('Added ' + sug.length + ' prospects.', 'success'); render(); } }, 'Add all ' + sug.length) : null));
  sug.forEach((p) => panel.appendChild(h('div', { class: 'suggestion' },
    h('div', { class: 'row between', style: 'align-items:flex-start;flex-wrap:nowrap' },
      h('div', { class: 'col', style: 'gap:1px;min-width:0' }, h('span', { class: 'pname', text: p.company }),
        h('span', { class: 'muted', text: domainOf(p.url) }),
        p.contact ? h('span', { class: 'muted', text: [p.contact, p.role].filter(Boolean).join(', ') }) : null),
      p.fit_score != null ? h('span', { class: 'score', title: 'How closely they match your ideal client', text: 'Fit ' + p.fit_score }) : null),
    p.fit_reason ? h('p', { style: 'font-size:15px', text: p.fit_reason }) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary small', onclick: async () => { await saveProspect(p, { status: 'New' }); openProspect(p.id); } }, 'Add to my prospects'),
      h('button', { type: 'button', class: 'quiet small', onclick: async () => { await saveProspect(p, { status: 'Not a fit' }); render(); } }, 'Not a fit'),
      h('span', { style: 'flex:1' }),
      /^https:\/\//.test(str(p.url)) ? h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', class: 'faint', text: 'Their site' }) : null,
      /^https:\/\//.test(str(p.source_url)) ? h('a', { href: p.source_url, target: '_blank', rel: 'noopener noreferrer', class: 'faint', text: 'Where we found them' }) : null))));
  return panel;
}

// ---------- add prospects dialog ----------
function addDialog(w) {
  const a = assetById(w.asset?.id);
  const mode = state.addMode === 'csv' ? 'csv' : 'one';
  const body = h('div', { class: 'dialog-body' },
    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Ways to add prospects', style: 'align-self:flex-start' },
      [['one', 'Add one'], ['csv', 'Import list']].map(([m, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m), 'aria-pressed': String(mode === m),
        onclick: () => { state.addMode = m; render(); } }, label))));
  if (mode === 'one') addOneForm(w, a, body); else importForm(w, body);
  return h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'add-title' },
    h('div', { class: 'dialog-head' }, h('h2', { id: 'add-title', text: 'Add prospects' }),
      h('button', { type: 'button', class: 'quiet icon-only', 'data-close': '', 'aria-label': 'Close', onclick: closeOverlay }, icon('close'))),
    body);
}
function addOneForm(w, a, box) {
  const d = { url: '', company: '', contact: '', email: '', role: '', material: '' };
  const mk = (k, type, ph, area) => {
    const el = area ? h('textarea', { id: 'np-' + k, class: 'big', placeholder: ph }) : h('input', { type, id: 'np-' + k, placeholder: ph, autocomplete: 'off' });
    el.addEventListener('input', () => { d[k] = el.value; });
    return el;
  };
  const save = async (draft) => {
    const dom = domainOf(d.url);
    if (!dom && !d.company.trim()) { $('np-url').focus(); setNotice('Add their website, or at least a company name.', 'error'); return; }
    if (d.email.trim() && !isEmail(d.email)) { $('np-email').focus(); setNotice('That email address does not look right.', 'error'); return; }
    const dup = dom && state.prospects.find((p) => domainOf(p.url) === dom);
    if (dup) { state.sheet = null; setNotice(dup.company + ' is already in your list, so we opened it.', 'info'); openProspect(dup.id); return; }
    busy(true, 'Saving...');
    const { data, error } = await sb.from('prospects').insert({
      workspace_id: w.id, company: (d.company.trim() || dom).slice(0, 200), contact: d.contact.trim(), role: d.role.trim(), email: d.email.trim(),
      url: dom ? (/^https?:\/\//i.test(d.url.trim()) ? d.url.trim() : 'https://' + d.url.trim()).slice(0, 500) : '', material: d.material.slice(0, 20000), source: 'manual',
    }).select().single();
    busy(false);
    if (error) { saveFailed(error); return; }
    state.prospects.unshift(data); state.sheet = null; state.filter = 'all';
    openProspect(data.id);
    if (draft) await researchProspect(data);
  };
  box.appendChild(h('p', { class: 'muted', text: "Paste their website. The app reads it, finds the gap and drafts three emails. You don't need to copy anything from their site." }));
  box.appendChild(h('div', { class: 'grid2' },
    field('np-url', 'Their website', mk('url', 'url', 'theircompany.com')),
    field('np-company', 'Company (optional)', mk('company', 'text', 'We take it from their site')),
    field('np-contact', 'Contact first name', mk('contact', 'text', 'Who the email goes to')),
    field('np-email', 'Contact email', mk('email', 'email', 'name@theircompany.com')),
    field('np-role', 'Role (optional)', mk('role', 'text', 'Owner, head of marketing...'))));
  box.appendChild(h('details', {}, h('summary', { text: 'Paste their material instead' }),
    h('p', { class: 'muted', text: (a || ASSETS[0]).paste + ' Use this when their site blocks readers or you have better material.' }),
    mk('material', '', 'Paste it here', true)));
  box.appendChild(h('div', { class: 'row' },
    h('button', { type: 'button', class: 'primary', onclick: () => save(true) }, 'Save and draft emails'),
    h('button', { type: 'button', onclick: () => save(false) }, 'Just save')));
}
function importForm(w, box) {
  box.appendChild(h('p', { class: 'muted', text: 'Upload a CSV from your CRM or a list you already have. We look for these columns: Company, Website, First name, Email and Title. Up to 300 at a time, and we skip any you already have.' }));
  const input = h('input', { type: 'file', id: 'csv-file', accept: '.csv,text/csv,text/plain' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 3_000_000) { setNotice('That file is too big. Split it into files under 3 MB.', 'error'); return; }
    const parsed = csvProspects(await file.text());
    if (parsed.error) { setNotice(parsed.error, 'error'); state.csv = null; } else state.csv = { name: file.name, ...parsed };
    render();
  });
  box.appendChild(field('csv-file', 'Your CSV file', input));
  const c = state.csv;
  if (c) {
    const withSite = c.rows.filter((r) => r.url).length, withEmail = c.rows.filter((r) => r.email).length;
    box.appendChild(h('div', { class: 'block soft' },
      h('p', {}, h('b', { text: c.rows.length + ' new prospects' }), ' in ' + c.name + '. ' + withSite + ' have a website and ' + withEmail + ' have an email.' +
        (c.dupes ? ' Skipping ' + c.dupes + ' you already have or that repeat.' : '') + (c.cut ? ' Only the first 300 will be imported.' : '')),
      withSite < c.rows.length ? h('p', { class: 'muted', text: 'Prospects without a website need material pasted in before the app can draft emails for them.' }) : null,
      c.rows.length ? h('div', { class: 'tablebox', style: 'background:var(--sheet);border-radius:var(--r-sm)' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Company', 'Website', 'Contact', 'Email'].map((t) => h('th', { text: t })))),
        h('tbody', {}, c.rows.slice(0, 5).map((r) => h('tr', {}, h('td', { text: r.company }), h('td', { text: domainOf(r.url) }), h('td', { text: r.contact }), h('td', { text: r.email })))))) : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'primary', disabled: !c.rows.length, onclick: () => { state.sheet = null; importRows(w, c.rows); } }, 'Import ' + c.rows.length + ' prospects'),
        h('button', { type: 'button', class: 'quiet', onclick: () => { state.csv = null; render(); } }, 'Clear'))));
  }
}

// ---------- prospect panel ----------
function prospectDrawer(p, a) {
  const contact = h('input', { type: 'text', id: 'pc-' + p.id, value: str(p.contact), placeholder: 'First name' });
  contact.addEventListener('change', () => { saveProspect(p, { contact: contact.value.trim().slice(0, 200) }); });
  const email = h('input', { type: 'email', id: 'pe-' + p.id, value: str(p.email), placeholder: 'name@theircompany.com' });
  email.addEventListener('change', () => {
    const v = email.value.trim();
    if (v && !isEmail(v)) { setNotice('That email address does not look right.', 'error'); return; }
    saveProspect(p, { email: v.slice(0, 320) }); render();
  });
  const role = h('input', { type: 'text', id: 'pr-' + p.id, value: str(p.role), placeholder: 'Owner, head of marketing...' });
  role.addEventListener('change', () => { saveProspect(p, { role: role.value.trim().slice(0, 200) }); });
  const status = h('select', { id: 'st-' + p.id, 'aria-label': 'Status', onchange: (e) => { saveProspect(p, { status: e.target.value }); render(); } },
    STATUSES.map((s) => h('option', { value: s, selected: s === p.status, text: s })));
  const dom = domainOf(p.url);

  const body = h('div', { class: 'drawer-body' });
  body.appendChild(h('section', { class: 'drawer-section' }, h('h3', { text: 'Contact' }),
    h('div', { class: 'grid2' }, field('pc-' + p.id, 'First name', contact), field('pe-' + p.id, 'Email', email)),
    field('pr-' + p.id, 'Role', role)));

  // The finding
  const mat = h('textarea', { id: 'mat-' + p.id, class: 'big', value: str(p.material), placeholder: dom ? 'Leave empty and the app reads ' + dom + ' for you.' : 'Paste it here', maxlength: '20000' });
  mat.addEventListener('input', () => { p.material = mat.value; });
  mat.addEventListener('change', () => saveProspect(p, { material: mat.value }));
  const finding = h('section', { class: 'drawer-section' }, h('h3', { text: 'The finding' }));
  if (p.finding) {
    finding.appendChild(h('div', { class: 'block soft' }, h('p', { style: 'font-weight:600', text: p.finding.headline }),
      p.finding.evidence ? h('p', {}, h('span', { class: 'quote', text: p.finding.evidence })) : null,
      p.finding.whyItMatters ? h('p', { class: 'muted', text: p.finding.whyItMatters }) : null,
      h('p', { class: 'hand', text: 'Check the quote against their live page before you send.' })));
  } else if (!p.missing) {
    finding.appendChild(h('p', { class: 'muted', text: dom ? 'The app reads ' + dom + ', finds the one clear gap, and drafts three emails that lead with it.' : 'Paste their material below, and the app finds the gap and drafts three emails.' }));
  }
  if (p.missing) finding.appendChild(h('div', { class: 'nudge' }, h('b', { text: 'More material needed: ' }), p.missing));
  finding.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: p.finding ? '' : 'primary', onclick: () => researchProspect(p) }, p.finding ? 'Redo the finding and emails' : 'Find the gap and draft emails')));
  finding.appendChild(h('details', { open: !dom || !!p.missing }, h('summary', { text: str(p.material).trim() ? 'What the finding is based on' : 'Their material' }),
    field('mat-' + p.id, 'Their material', mat, a.paste)));
  body.appendChild(finding);

  // The emails, one at a time
  if (p.emails?.length) {
    const labels = [['Email 1', 'day 0'], ['Follow-up', 'day 3'], ['Close the loop', 'day 10']];
    const n = Math.min(state.emailTab || 0, p.emails.length - 1), e = p.emails[n];
    const sid = 'es-' + p.id + '-' + n, bid = 'eb-' + p.id + '-' + n;
    const sI = h('input', { type: 'text', id: sid, value: e.subject }), bI = h('textarea', { id: bid, class: 'big', value: e.body, style: 'min-height:220px' });
    const persist = () => saveProspect(p, { emails: p.emails.map((x, i) => (i === n ? { subject: sI.value, body: bI.value } : x)) });
    sI.addEventListener('change', persist); bI.addEventListener('change', persist);
    const openGmail = () => {
      window.open(gmailLink(p.email, sI.value, bI.value), '_blank', 'noopener');
      if (n === 0 && ['New', 'Drafted', 'Approved'].includes(p.status)) setNotice('Opened email 1 in Gmail. Once you send it, set ' + p.company + ' to Sent so the tracker counts it.', 'info');
    };
    body.appendChild(h('section', { class: 'drawer-section' }, h('h3', { text: 'Emails' }),
      h('div', { class: 'email-tabs', role: 'tablist', 'aria-label': 'Emails' }, labels.slice(0, p.emails.length).map(([l, d], i) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === n), onclick: () => { state.emailTab = i; render(); } }, l, h('small', { text: d })))),
      field(sid, 'Subject', sI), field(bid, 'Body', bI),
      !isEmail(p.email) ? h('p', { class: 'faint', text: 'Add their email under Contact and Open in Gmail fills in the To line.' }) : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'primary', onclick: openGmail, title: 'Opens a new Gmail message. If you close it without sending, Gmail keeps it as a draft.' }, icon('mail'), 'Open in Gmail'),
        h('button', { type: 'button', onclick: (ev) => copyText('Subject: ' + sI.value + '\n\n' + bI.value, ev.currentTarget) }, icon('copy'), 'Copy email'))));

    const ab = h('section', { class: 'drawer-section' }, h('h3', { text: 'Full ' + a.name }),
      h('p', { class: 'muted', text: 'Build this for prospects who reply, or for your top few each week.' }));
    if (p.asset) {
      ab.appendChild(h('div', { class: 'block' }, h('h2', { text: p.asset.title }), h('p', { text: p.asset.intro }),
        p.asset.sections.map((sec) => h('div', { class: 'col' }, h('b', { text: sec.heading }), h('p', { text: sec.body }))),
        h('p', { text: p.asset.nextStep })));
    }
    ab.appendChild(h('div', { class: 'row' },
      h('button', { type: 'button', class: p.asset ? '' : 'primary', onclick: () => buildAsset(p) }, p.asset ? 'Rebuild' : 'Build the full asset'),
      p.asset ? h('button', { type: 'button', onclick: (ev) => copyText(assetAsText(p), ev.currentTarget) }, icon('copy'), 'Copy text') : null,
      p.asset ? h('button', { type: 'button', onclick: () => downloadAsset(p) }, icon('download'), 'Download one-pager') : null));
    body.appendChild(ab);
  }

  body.appendChild(state.confirm === p.id
    ? h('div', { class: 'row' }, h('span', { text: 'Delete ' + p.company + '? This cannot be undone.' }),
      h('button', { type: 'button', class: 'danger small', onclick: async () => {
        const { error } = await sb.from('prospects').delete().eq('id', p.id);
        if (error) { saveFailed(error); return; }
        state.prospects = state.prospects.filter((x) => x.id !== p.id); state.confirm = null; state.open = null;
        setNotice('Deleted ' + p.company + '.', 'info'); render();
      } }, 'Yes, delete'),
      h('button', { type: 'button', class: 'small', onclick: () => { state.confirm = null; render(); } }, 'Keep'))
    : h('div', { class: 'row' }, h('button', { type: 'button', class: 'quiet danger small', onclick: () => { state.confirm = p.id; render(); } }, 'Delete prospect')));

  return h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' },
    h('div', { class: 'drawer-head' },
      h('div', { class: 'col' },
        h('h2', { id: 'drawer-title', text: p.company }),
        h('div', { class: 'row', style: 'gap:8px' }, chip(p.status),
          dom && /^https?:\/\//.test(str(p.url)) ? h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', class: 'faint row', style: 'gap:4px' }, dom, icon('external')) : null)),
      status,
      h('button', { type: 'button', class: 'quiet icon-only', 'data-close': '', 'aria-label': 'Close', onclick: closeOverlay }, icon('close'))),
    body);
}

// ---------- tracker ----------
function viewTracker() {
  const ps = state.prospects.filter(inPipeline), count = (list) => ps.filter((p) => list.includes(p.status)).length;
  const drafted = count(['Drafted', 'Approved', 'Sent', 'Replied', 'Call booked']);
  const sent = count(['Sent', 'Replied', 'Call booked']), replies = count(['Replied', 'Call booked']), calls = count(['Call booked']);
  const tile = (n, label) => h('div', { class: 'tile' }, h('b', { text: String(n) }), h('span', { text: label }));
  const out = h('div', { class: 'stack' },
    pageHead('Tracker', sent ? replies + ' of ' + sent + ' sent prospects have replied (' + Math.round(replies / sent * 100) + '%).' : 'Mark a prospect as Sent after you send email 1, and the numbers start here.'),
    h('div', { class: 'tiles' }, tile(ps.length, 'Prospects'), tile(sent, 'Sent'), tile(replies, 'Replied'), tile(calls, 'Calls booked')));
  if (!ps.length) {
    out.appendChild(h('div', { class: 'sheet' }, h('div', { class: 'empty' }, clerk(true), h('h2', { text: 'Nothing to track yet' }),
      h('p', { class: 'muted', text: 'Add prospects and send your first emails. Sent, replies and calls show up here.' }),
      h('button', { type: 'button', class: 'primary', onclick: () => go('prospects') }, 'Go to prospects'))));
    return out;
  }
  const step = (label, n) => h('div', { class: 'fstep' }, h('span', { text: label }),
    h('div', { class: 'fbar' }, h('span', { style: 'width:' + Math.round((n / ps.length) * 100) + '%' })), h('b', { text: String(n) }));
  out.appendChild(h('div', { class: 'sheet' }, h('h2', { text: 'Your pipeline' }),
    h('div', { class: 'funnel' }, step('In pipeline', ps.length), step('Drafted', drafted), step('Sent', sent), step('Replied', replies), step('Calls booked', calls))));
  out.appendChild(h('div', { class: 'sheet flush' }, h('div', { class: 'tablebox' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', { text: 'Company' }), h('th', { text: 'Contact' }), h('th', { text: 'Status' }), h('th', { text: 'Added' }))),
    h('tbody', {}, ps.map((p) => h('tr', {}, h('td', {}, h('b', { text: p.company })), h('td', { text: p.contact || '' }), h('td', {}, chip(p.status)),
      h('td', { text: fmtDate(p.created_at) }))))))));
  return out;
}

// ---------- billing ----------
function viewBilling() {
  const p = state.profile || {}, plan = PLANS.find((x) => x.id === p.plan);
  const out = h('div', { class: 'stack' }, pageHead('Billing', 'Your plan and payments. Payments run through Stripe.'));
  if (plan && ['active', 'trialing', 'past_due'].includes(p.subscription_status || '')) {
    const card = h('div', { class: 'sheet', style: 'max-width:640px' },
      h('div', { class: 'row between' }, h('h2', { text: plan.name }), chip(p.subscription_status)),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Price' }), h('dd', { text: plan.price + ' a month' }),
        p.current_period_end ? h('dt', { text: 'Renews on' }) : null, p.current_period_end ? h('dd', { text: new Date(p.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) }) : null));
    if (p.subscription_status === 'past_due') card.appendChild(h('div', { class: 'nudge' }, 'Your last payment did not go through. Update your card to keep access.'));
    card.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: openPortal }, 'Manage billing'),
      h('span', { class: 'faint', text: 'Update your card, switch plans, see invoices or cancel, on Stripe.' })));
    out.appendChild(card);
  } else if (p.is_admin || p.comped) {
    out.appendChild(h('div', { class: 'sheet', style: 'max-width:640px' }, h('h2', { text: p.is_admin ? 'Admin access' : 'Complimentary access' }),
      h('p', { class: 'muted', text: p.is_admin ? 'You have admin access, so no plan is needed.' : 'Your access is complimentary during early access. Thanks for testing.' }),
      p.stripe_customer_id ? h('div', { class: 'row' }, h('button', { type: 'button', onclick: openPortal }, 'Manage billing')) : null));
  } else {
    if (p.stripe_customer_id) out.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', onclick: openPortal }, 'Manage billing'), h('span', { class: 'faint', text: 'See past invoices on Stripe.' })));
    out.appendChild(h('div', { class: 'plans' }, PLANS.map((pl) => planCard(pl, false))));
  }
  return out;
}

async function loadAdminRows() {
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { setNotice('People could not be loaded.'); return; }
  state.adminRows = data || []; render();
}
async function setAccess(row, status, comped) {
  const wasApproved = row.status === 'approved';
  busy(true, 'Saving...');
  const { data, error } = await sb.rpc('admin_set_access', { target: row.id, new_status: status, new_comped: comped });
  if (error) { busy(false); setNotice('That change could not be saved: ' + error.message); return; }
  Object.assign(row, data || { status, comped });
  if (row.id === state.profile?.id) state.profile = { ...state.profile, ...row };
  if (status === 'approved' && !wasApproved) {
    busy(true, 'Emailing ' + row.email + '...');
    try {
      const out = await invoke('notify', { event: 'approved', target: row.id });
      setNotice(out?.sent ? 'Approved. We emailed ' + row.email + ' to let them know.' : 'Approved.', 'success');
    } catch (e) {
      setNotice('Approved, but the welcome email did not send (' + e.message + ') Let ' + row.email + ' know yourself.', 'error');
    }
  }
  busy(false);
  render();
}
function viewAdmin() {
  if (!state.adminRows) { loadAdminRows(); return h('div', { class: 'stack' }, pageHead('People', 'Loading...'), h('div', { class: 'skeleton', style: 'height:160px' })); }
  const rows = state.adminRows, pending = rows.filter((r) => r.status === 'pending');
  const action = (label, fn, cls) => h('button', { type: 'button', class: 'small ' + (cls || ''), onclick: fn }, label);
  return h('div', { class: 'stack' },
    pageHead('People', pending.length ? pending.length + ' waiting for approval.' : 'Nobody is waiting for approval.',
      h('button', { type: 'button', onclick: () => { state.adminRows = null; render(); } }, 'Refresh')),
    h('div', { class: 'sheet flush' }, h('div', { class: 'tablebox' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Email', 'Joined', 'Access', 'Plan', ''].map((t) => h('th', { text: t })))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        h('td', {}, h('b', { text: r.email }), r.is_admin ? h('span', { class: 'faint', text: '  admin' }) : null),
        h('td', { text: fmtDate(r.created_at) }),
        h('td', {}, chip(r.status), r.comped ? h('span', { class: 'faint', text: '  comped' }) : null),
        h('td', { text: r.plan ? (PLANS.find((x) => x.id === r.plan)?.name || r.plan) + ', ' + (r.subscription_status || '') : (r.subscription_status || 'none') }),
        h('td', {}, h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' },
          r.status !== 'approved' ? action('Approve', () => setAccess(r, 'approved', r.comped), 'primary') : null,
          r.status !== 'rejected' && !r.is_admin ? action('Reject', () => setAccess(r, 'rejected', r.comped), 'danger') : null,
          r.status === 'approved' && !r.is_admin ? action(r.comped ? 'Remove comp' : 'Comp access', () => setAccess(r, 'approved', !r.comped)) : null)))))))),
    h('p', { class: 'faint', text: 'Approving someone lets them choose a plan. Comping gives them access without paying, for testers and early partners.' }));
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
