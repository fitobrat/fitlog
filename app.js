// ==== CONFIG (replace with your Supabase project values) ====
const SUPABASE_URL = 'https://utwaxmfardwfsfyyvdka.supabase.co'; // TODO: replace
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2F4bWZhcmR3ZnNmeXl2ZGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMDY2MzEsImV4cCI6MjA3OTY4MjYzMX0._bv2-Lx5KIbOUOneWmypFixyWy-LIm3rE_vpZNqneP0';        // TODO: replace

// UMD build exposes global "supabase"
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==== MESSAGE HELPER ====
function showMessage(text, type = 'info') {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

// ==== LOADING STATE HELPER ====
function setButtonLoading(buttonId, isLoading) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.classList.add('loading');
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

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
    showMessage('Please enter both email and password.', 'error');
    return;
  }
  setButtonLoading('loginBtn', true);
  const { error } = await client.auth.signInWithPassword({ email, password });
  setButtonLoading('loginBtn', false);
  if (error) {
    showMessage(error.message || 'Login failed. Check your credentials.', 'error');
  } else {
    showMessage('Logged in successfully!', 'success');
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
  }
  await updateAuthStatus();
}

async function logOut() {
  setButtonLoading('logoutBtn', true);
  await client.auth.signOut();
  setButtonLoading('logoutBtn', false);
  showMessage('Logged out successfully.', 'info');
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

// ==== INPUT VALIDATION ====
function validateInput(id, min = 0) {
  const input = document.getElementById(id);
  if (!input) return true;
  const value = Number(input.value);
  if (input.value && (isNaN(value) || value < min)) {
    input.value = min;
    showMessage(`${input.previousElementSibling?.textContent || 'Value'} must be ${min} or greater.`, 'error');
    return false;
  }
  return true;
}

// ==== SAVE / UPSERT ====
async function upsertMyProgress() {
  const { data: { user } = {} } = await client.auth.getUser();
  if (!user) {
    showMessage('Please log in to save your progress.', 'error');
    return;
  }

  // Validate all inputs
  if (!validateInput('pullups') || !validateInput('pushups') || 
      !validateInput('dips') || !validateInput('run')) {
    return;
  }

  const payload = {
    id: getClientId(),
    name: document.getElementById('nickname').value.trim() || 'Anonymous',
    pullups: Math.max(0, Number(document.getElementById('pullups').value) || 0),
    pushups: Math.max(0, Number(document.getElementById('pushups').value) || 0),
    dips: Math.max(0, Number(document.getElementById('dips').value) || 0),
    run_km: Math.max(0, Number(document.getElementById('run').value) || 0)
  };

  setButtonLoading('saveBtn', true);
  const { error } = await client
    .from('progress')
    .upsert(payload, { onConflict: 'id' });
  setButtonLoading('saveBtn', false);

  if (error) {
    console.error(error);
    showMessage('Failed to save. Please check your connection and try again.', 'error');
  } else {
    showMessage('Progress saved successfully!', 'success');
  }
}

// ==== RESET MY DATA ====
async function clearMyData() {
  if (!confirm('Are you sure you want to clear all your data? This cannot be undone.')) {
    return;
  }
  const id = localStorage.getItem('clientId');
  if (!id) {
    showMessage('No data to clear.', 'info');
    return;
  }
  setButtonLoading('resetBtn', true);
  const { error } = await client.from('progress').delete().eq('id', id);
  setButtonLoading('resetBtn', false);
  if (error) {
    console.error(error);
    showMessage('Failed to clear data. Please try again.', 'error');
  } else {
    localStorage.removeItem('clientId');
    document.querySelectorAll('#tracker input').forEach(i => (i.value = ''));
    showMessage('Your data has been cleared.', 'success');
    loadAll(); // Refresh leaderboard
  }
}

// ==== CHART ====
let chartInstance = null;

function renderChart(rows) {
  if (!rows || !rows.length) return;
  
  const container = document.getElementById('chartContainer');
  const canvas = document.getElementById('chartCanvas');
  if (!container || !canvas) return;

  const sorted = [...rows].sort(
    (a, b) => (b.pullups + b.pushups + b.dips) - (a.pullups + a.pushups + a.dips)
  ).slice(0, 10); // Top 10

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(r => r.name || 'Anonymous'),
      datasets: [{
        label: 'Total Reps',
        data: sorted.map(r => r.pullups + r.pushups + r.dips),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const r = sorted[ctx.dataIndex];
              return `Pull-ups: ${r.pullups}, Push-ups: ${r.pushups}, Dips: ${r.dips}`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
        x: { ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 0 }, grid: { display: false } }
      }
    }
  });

  container.style.display = 'block';
}

// ==== RENDER LEADERBOARD ====
function renderLeaderboard(rows) {
  const container = document.getElementById('leaderboard');
  if (!rows || !rows.length) {
    container.textContent = 'No entries yet.';
    document.getElementById('chartContainer').style.display = 'none';
    return;
  }
  rows.sort(
    (a, b) =>
      (b.pullups + b.pushups + b.dips) -
      (a.pullups + a.pushups + a.dips)
  );
  container.innerHTML = rows
    .map(
      (r, idx) =>
        `<div><span style="color:#6b7280;margin-right:.5rem">#${idx + 1}</span><strong>${r.name}</strong> — PU:${r.pullups} PS:${r.pushups} D:${r.dips} KM:${r.run_km.toFixed(2)}</div>`
    )
    .join('');
  
  renderChart(rows);
}

// ==== INITIAL LOAD ====
async function loadAll() {
  const container = document.getElementById('leaderboard');
  if (container) container.textContent = 'Loading…';
  
  const { data, error } = await client.from('progress').select('*');
  if (error) {
    console.error(error);
    if (container) container.textContent = 'Failed to load leaderboard.';
    showMessage('Failed to load data. Please refresh the page.', 'error');
    return;
  }
  renderLeaderboard(data || []);
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
  document.getElementById('saveBtn').addEventListener('click', upsertMyProgress);
  document.getElementById('resetBtn').addEventListener('click', clearMyData);
  document.getElementById('loginBtn').addEventListener('click', logIn);
  document.getElementById('logoutBtn').addEventListener('click', logOut);
  
  // Input validation on blur
  ['pullups', 'pushups', 'dips', 'run'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('blur', () => validateInput(id));
      input.addEventListener('input', function() {
        if (this.value && Number(this.value) < 0) {
          this.value = 0;
        }
      });
    }
  });
  
  // Enter key to submit login
  document.getElementById('authPassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') logIn();
  });
  
  loadAll();
  subscribeRealtime();
  updateAuthStatus();
});


