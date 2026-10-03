// Boot, sign-in gate, shared state and hash router.
import * as db from './db.js';

export const state = {
  members: [], pets: [], categories: [], txns: [], upcoming: [], settings: {}, me: null,
  session: null,
  prefill: null,   // one-shot data handed to the Add screen (e.g. Upcoming → Mark paid)
};

const ROUTES = ['home', 'add', 'history', 'reports', 'more'];
const $ = id => document.getElementById(id);

export async function refresh() {
  Object.assign(state, await db.loadAll(state.session));
}

export function navigate(route, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `#/${route}${qs ? `?${qs}` : ''}`;
}

let toastTimer;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// Shared lookups for views
export const nameOf = (list, id, fallback = '—') => state[list].find(x => x.id === id)?.name ?? fallback;
export const active = list => state[list].filter(x => x.active);

function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const route = ROUTES.includes(path) ? path : 'home';
  return { route, params: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}

async function render() {
  const { route, params } = parseHash();
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  const el = $('view');
  try {
    const mod = await import(`./views/${route}.js`);
    el.replaceChildren();
    await mod.render(el, params);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="card"><p>Couldn't open this screen.</p><p class="muted small"></p></div>`;
    el.querySelector('.small').textContent = err.message;
  }
  window.scrollTo(0, 0);
}

const NOT_AUTHORISED = 'Not authorised — this app is private to the family. Ask Kelvin to add your Google email.';
let notAuthorised = false;   // keeps the message on screen after the automatic sign-out

function showLogin(message = '') {
  $('app').hidden = true;
  $('login').hidden = false;
  $('login-msg').textContent = message || (notAuthorised ? NOT_AUTHORISED : '');
}

async function start(session) {
  state.session = session;
  if (!session) return showLogin();
  notAuthorised = false;
  try {
    await refresh();
  } catch (err) {
    return showLogin(`Couldn't load data: ${err.message}`);
  }
  if (!state.me) {
    notAuthorised = true;
    showLogin();
    setTimeout(() => db.signOut(), 4000);
    return;
  }
  $('login').hidden = true;
  $('app').hidden = false;
  $('who').textContent = state.me.name;
  render();
}

$('google-btn').addEventListener('click', async () => {
  $('google-btn').disabled = true;
  const { error } = await db.signInWithGoogle();
  if (error) {
    $('google-btn').disabled = false;
    $('login-msg').textContent = error.message;
  }
});

window.addEventListener('hashchange', () => { if (state.me) render(); });

let started = false;
db.onAuth(session => {
  // Supabase fires on load and on every token refresh; only (re)start when the user changes.
  if (started && session?.user?.id === state.session?.user?.id) return;
  started = true;
  start(session);
});
