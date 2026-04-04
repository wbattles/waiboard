// --- tabs ---

function showTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tabName}-tab`).classList.add('active');
  event.target.classList.add('active');
}

// --- password ---

document.getElementById('password-form').addEventListener('submit', async e => {
  e.preventDefault();
  const current_password = document.getElementById('pw-current').value;
  const new_password = document.getElementById('pw-new').value;
  if (!current_password || !new_password) return;

  const response = await fetch('/api/me/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  });

  if (response.ok) {
    document.getElementById('password-form').reset();
    alert('password updated');
  } else {
    const error = await response.json();
    alert(error.detail || 'failed to change password');
  }
});

// --- my projects ---

async function loadMyProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) return;
    const projects = await response.json();
    const container = document.getElementById('my-projects-container');

    if (projects.length === 0) {
      container.innerHTML = '<div class="user-activity">no projects assigned</div>';
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="user-item">
        <div class="user-main">
          <div class="user-identity">
            <div class="username">${p.name}</div>
            <span class="admin-badge">${p.acronym}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

// --- display: font ---

function changeFont() {
  const font = document.getElementById('font-select').value;
  document.body.style.fontFamily = font;
  localStorage.setItem('waiboard-font', font);
}

function loadFont() {
  const saved = localStorage.getItem('waiboard-font');
  if (saved) {
    document.body.style.fontFamily = saved;
    document.getElementById('font-select').value = saved;
  }
}

// --- display: mode ---

function changeMode() {
  const mode = document.getElementById('mode-select').value;
  applyMode(mode);
  localStorage.setItem('waiboard-mode', mode);
}

function applyMode(mode) {
  if (mode === 'dark') {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
}

function loadMode() {
  const saved = localStorage.getItem('waiboard-mode') || 'light';
  applyMode(saved);
  document.getElementById('mode-select').value = saved;
}

// --- logout ---

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

// --- init ---

loadFont();
loadMode();
loadMyProjects();
