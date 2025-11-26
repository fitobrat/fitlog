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

// ==== USERNAME HELPER ====
// Convert username to email format for Supabase (username@fitlog.local)
function usernameToEmail(username) {
  const clean = username.trim().toLowerCase();
  // If it already has @, use as-is, otherwise add @fitlog.local
  return clean.includes('@') ? clean : `${clean}@fitlog.local`;
}

// Extract username from email (for display)
function emailToUsername(email) {
  if (!email) return '';
  const parts = email.split('@');
  // If it's our fake domain, return just the username part
  if (parts[1] === 'fitlog.local') {
    return parts[0];
  }
  // Otherwise return the email as-is (for real emails)
  return email;
}

// ==== AUTH HELPERS ====
async function updateAuthStatus() {
  const el = document.getElementById('authStatus');
  if (!el) return;
  const { data: { user } = {} } = await client.auth.getUser();
  if (user) {
    const displayName = emailToUsername(user.email || user.id);
    el.textContent = 'Signed in as ' + displayName;
  } else {
    el.textContent = 'Not signed in (read-only)';
  }
}

async function logIn() {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!username || !password) {
    showMessage('Please enter both username and password.', 'error');
    return;
  }
  
  // Convert username to email format for Supabase
  const email = usernameToEmail(username);
  
  setButtonLoading('loginBtn', true);
  const { error } = await client.auth.signInWithPassword({ email, password });
  setButtonLoading('loginBtn', false);
  if (error) {
    showMessage(error.message || 'Login failed. Check your credentials.', 'error');
  } else {
    showMessage('Logged in successfully!', 'success');
    // Auto-fill nickname with username if empty
    const nicknameField = document.getElementById('nickname');
    if (nicknameField && !nicknameField.value.trim()) {
      const { data: { user } = {} } = await client.auth.getUser();
      if (user) {
        nicknameField.value = emailToUsername(user.email);
      }
    }
    document.getElementById('authUsername').value = '';
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

// ==== NAVIGATION ====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(pageId)?.classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');
  
  if (pageId === 'dashboard') {
    loadDashboard();
  } else if (pageId === 'settings') {
    loadSettings();
  }
}

// ==== DASHBOARD ====
let dashboardCharts = {};

async function loadDashboard() {
  const { data: { user } = {} } = await client.auth.getUser();
  if (!user) {
    document.getElementById('dashboardStats').innerHTML = '<p style="text-align:center;color:#9ca3af">Please log in to view your dashboard</p>';
    return;
  }

  const clientId = getClientId();
  const { data: allData } = await client.from('progress').select('*');
  const myData = allData?.find(d => d.id === clientId) || {};
  const allUsers = allData || [];

  // Stats Cards
  const totalReps = (myData.pullups || 0) + (myData.pushups || 0) + (myData.dips || 0);
  const avgReps = allUsers.length > 0 
    ? Math.round(allUsers.reduce((sum, u) => sum + (u.pullups || 0) + (u.pushups || 0) + (u.dips || 0), 0) / allUsers.length)
    : 0;
  const myRank = allUsers.sort((a, b) => 
    ((b.pullups || 0) + (b.pushups || 0) + (b.dips || 0)) - 
    ((a.pullups || 0) + (a.pushups || 0) + (a.dips || 0))
  ).findIndex(u => u.id === clientId) + 1;

  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Your Total Reps</div>
      <div class="stat-value">${totalReps}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Community Avg</div>
      <div class="stat-value">${avgReps}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Your Rank</div>
      <div class="stat-value">#${myRank || 'N/A'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Users</div>
      <div class="stat-value">${allUsers.length}</div>
    </div>
  `;

  // Progress Chart (over time - simplified as we don't have history)
  renderProgressChart(myData, allUsers);
  renderExerciseChart(myData);
  renderComparisonChart(myData, allUsers);
  renderWeeklyChart(allUsers);
}

function renderProgressChart(myData, allUsers) {
  const ctx = document.getElementById('progressChart');
  if (!ctx) return;
  if (dashboardCharts.progress) dashboardCharts.progress.destroy();

  dashboardCharts.progress = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Pull-ups', 'Push-ups', 'Dips', 'Run (km)'],
      datasets: [{
        label: 'Your Stats',
        data: [myData.pullups || 0, myData.pushups || 0, myData.dips || 0, (myData.run_km || 0) * 10],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }, {
        label: 'Community Avg',
        data: [
          allUsers.reduce((s, u) => s + (u.pullups || 0), 0) / Math.max(allUsers.length, 1),
          allUsers.reduce((s, u) => s + (u.pushups || 0), 0) / Math.max(allUsers.length, 1),
          allUsers.reduce((s, u) => s + (u.dips || 0), 0) / Math.max(allUsers.length, 1),
          (allUsers.reduce((s, u) => s + (u.run_km || 0), 0) / Math.max(allUsers.length, 1)) * 10
        ],
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } }
      }
    }
  });
}

function renderExerciseChart(myData) {
  const ctx = document.getElementById('exerciseChart');
  if (!ctx) return;
  if (dashboardCharts.exercise) dashboardCharts.exercise.destroy();

  const total = (myData.pullups || 0) + (myData.pushups || 0) + (myData.dips || 0);
  dashboardCharts.exercise = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pull-ups', 'Push-ups', 'Dips'],
      datasets: [{
        data: [myData.pullups || 0, myData.pushups || 0, myData.dips || 0],
        backgroundColor: ['#3b82f6', '#f97316', '#10b981'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e5e7eb', padding: 15 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderComparisonChart(myData, allUsers) {
  const ctx = document.getElementById('comparisonChart');
  if (!ctx) return;
  if (dashboardCharts.comparison) dashboardCharts.comparison.destroy();

  const topUsers = [...allUsers].sort((a, b) => 
    ((b.pullups || 0) + (b.pushups || 0) + (b.dips || 0)) - 
    ((a.pullups || 0) + (a.pushups || 0) + (a.dips || 0))
  ).slice(0, 5);

  dashboardCharts.comparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topUsers.map(u => u.name || 'Anonymous'),
      datasets: [{
        label: 'Total Reps',
        data: topUsers.map(u => (u.pullups || 0) + (u.pushups || 0) + (u.dips || 0)),
        backgroundColor: topUsers.map(u => u.id === getClientId() ? '#3b82f6' : '#6b7280')
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
        x: { ticks: { color: '#9ca3af', maxRotation: 45 }, grid: { display: false } }
      }
    }
  });
}

function renderWeeklyChart(allUsers) {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx) return;
  if (dashboardCharts.weekly) dashboardCharts.weekly.destroy();

  // Simplified: show distribution of activity levels
  const levels = [0, 10, 25, 50, 100, 200];
  const counts = levels.map((level, i) => 
    allUsers.filter(u => {
      const total = (u.pullups || 0) + (u.pushups || 0) + (u.dips || 0);
      return i === levels.length - 1 ? total >= level : total >= level && total < levels[i + 1];
    }).length
  );

  dashboardCharts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0-9', '10-24', '25-49', '50-99', '100-199', '200+'],
      datasets: [{
        label: 'Users',
        data: counts,
        backgroundColor: '#3b82f6'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#9ca3af', stepSize: 1 }, grid: { color: '#1f2937' } },
        x: { ticks: { color: '#9ca3af' }, grid: { display: false } }
      }
    }
  });
}

// ==== SETTINGS ====
async function loadSettings() {
  const { data: { user } = {} } = await client.auth.getUser();
  const accountInfo = document.getElementById('accountInfo');
  if (user) {
    accountInfo.innerHTML = `
      <p><strong>Username:</strong> ${emailToUsername(user.email)}</p>
      <p><strong>User ID:</strong> ${user.id.substring(0, 8)}...</p>
    `;
  } else {
    accountInfo.innerHTML = '<p>Not logged in</p>';
  }
}

function exportToCSV() {
  const clientId = getClientId();
  client.from('progress').select('*').eq('id', clientId).single().then(({ data }) => {
    if (!data) {
      showMessage('No data to export', 'error');
      return;
    }
    const csv = `name,pullups,pushups,dips,run_km,created_at\n${data.name || 'Anonymous'},${data.pullups || 0},${data.pushups || 0},${data.dips || 0},${data.run_km || 0},${data.created_at || ''}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitlog-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Data exported successfully!', 'success');
  });
}

function importFromCSV() {
  const fileInput = document.getElementById('importFile');
  fileInput.click();
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      if (lines.length < 2) {
        showMessage('Invalid CSV format', 'error');
        return;
      }
      const headers = lines[0].split(',');
      const data = lines[1].split(',');
      const payload = {
        id: getClientId(),
        name: data[0] || 'Anonymous',
        pullups: parseInt(data[1]) || 0,
        pushups: parseInt(data[2]) || 0,
        dips: parseInt(data[3]) || 0,
        run_km: parseFloat(data[4]) || 0
      };
      client.from('progress').upsert(payload, { onConflict: 'id' }).then(({ error }) => {
        if (error) {
          showMessage('Import failed: ' + error.message, 'error');
        } else {
          showMessage('Data imported successfully!', 'success');
          document.getElementById('nickname').value = payload.name;
          document.getElementById('pullups').value = payload.pullups;
          document.getElementById('pushups').value = payload.pushups;
          document.getElementById('dips').value = payload.dips;
          document.getElementById('run').value = payload.run_km;
          loadAll();
        }
      });
    };
    reader.readAsText(file);
  };
}

// ==== EVENT LISTENERS & STARTUP ====
window.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  // Existing event listeners
  document.getElementById('saveBtn').addEventListener('click', upsertMyProgress);
  document.getElementById('resetBtn').addEventListener('click', clearMyData);
  document.getElementById('loginBtn').addEventListener('click', logIn);
  document.getElementById('logoutBtn').addEventListener('click', logOut);
  
  // CSV Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  document.getElementById('importBtn').addEventListener('click', importFromCSV);
  
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
  
  // Also allow Enter on username field
  document.getElementById('authUsername')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') logIn();
  });
  
  loadAll();
  subscribeRealtime();
  updateAuthStatus();
});


