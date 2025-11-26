// ==== CONFIG (replace with your Supabase project values) ====
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'; // TODO: replace with your Supabase project URL
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';        // TODO: replace with your Supabase anon key

// UMD build exposes global "supabase"
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==== AUTH HELPERS ====
async function updateAuthStatus() {
  const el = document.getElementById('authStatus');
  if (!el) return;
  const { data: { user } = {} } = await client.auth.getUser();
  if (user) {
    el.textContent = 'Signed in as ' + (user.email || user.id);
  } else {
    el.textContent = 'Not signed in (read-only)';
  }
}

async function logIn() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) {
    alert('Enter email and password.');
    return;
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  await updateAuthStatus();
}

async function logOut() {
  await client.auth.signOut();
  await updateAuthStatus();
}

// ==== SERVICE WORKER REGISTRATION ====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .catch(err => console.error('SW registration failed', err));
}

// ==== LOCAL IDENTIFIER ====
function getClientId() {
  let id = localStorage.getItem('clientId');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         (Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('clientId', id);
  }
  return id;
}

// ==== SAVE / UPSERT ====
async function upsertMyProgress() {
  const { data: { user } = {} } = await client.auth.getUser();
  if (!user) {
    alert('Please log in to save your progress.');
    return;
  }

  const payload = {
    id: getClientId(),
    name: document.getElementById('nickname').value.trim() || 'Anonymous',
    pullups: Number(document.getElementById('pullups').value) || 0,
    pushups: Number(document.getElementById('pushups').value) || 0,
    dips: Number(document.getElementById('dips').value) || 0,
    run_km: Number(document.getElementById('run').value) || 0
  };

  const { error } = await client
    .from('progress')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error(error);
    alert('Failed to save – try again.');
  } else {
    alert('Saved!');
  }
}

// ==== RESET MY DATA ====
async function clearMyData() {
  const id = localStorage.getItem('clientId');
  if (!id) return;
  const { error } = await client.from('progress').delete().eq('id', id);
  if (error) {
    console.error(error);
  } else {
    localStorage.removeItem('clientId');
    document.querySelectorAll('#tracker input').forEach(i => (i.value = ''));
    alert('Your entry cleared.');
  }
}

// ==== RENDER LEADERBOARD ====
function renderLeaderboard(rows) {
  const container = document.getElementById('leaderboard');
  if (!rows || !rows.length) {
    container.textContent = 'No entries yet.';
    return;
  }
  rows.sort(
    (a, b) =>
      (b.pullups + b.pushups + b.dips) -
      (a.pullups + a.pushups + a.dips)
  );
  container.innerHTML = rows
    .map(
      r =>
        `<div><strong>${r.name}</strong> — PU:${r.pullups} PS:${r.pushups} D:${r.dips} KM:${r.run_km}</div>`
    )
    .join('');
}

// ==== INITIAL LOAD ====
async function loadAll() {
  const { data, error } = await client.from('progress').select('*');
  if (error) {
    console.error(error);
    return;
  }
  renderLeaderboard(data);
}

// ==== REAL-TIME SUBSCRIPTION ====
function subscribeRealtime() {
  client
    .channel('public:progress')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'progress' },
      () => loadAll()
    )
    .subscribe();
}

// ==== EVENT LISTENERS & STARTUP ====
window.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('saveBtn')
    .addEventListener('click', upsertMyProgress);
  document
    .getElementById('resetBtn')
    .addEventListener('click', clearMyData);
  document
    .getElementById('loginBtn')
    .addEventListener('click', logIn);
  document
    .getElementById('logoutBtn')
    .addEventListener('click', logOut);
  loadAll();
  subscribeRealtime();
  updateAuthStatus();
});


