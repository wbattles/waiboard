// --- tabs ---

function showTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tabName}-tab`).classList.add('active');
  event.target.classList.add('active');
  if (tabName === 'projects') {
    loadMyProjectsList();
  }
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

// --- api keys ---

async function loadApiKeys() {
  try {
    const response = await fetch('/api/me/api-keys');
    if (!response.ok) return;
    const keys = await response.json();
    const container = document.getElementById('api-keys-container');

    if (keys.length === 0) {
      container.innerHTML = '<div class="user-activity">no api keys</div>';
      return;
    }

    container.innerHTML = keys.map(k => `
      <div class="user-item">
        <div class="user-main">
          <div class="api-key-value">${k.key}</div>
        </div>
        <div class="user-actions">
          <button onclick="deleteApiKey(${k.id})">delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading api keys:', error);
  }
}

async function generateApiKey() {
  const response = await fetch('/api/me/api-keys', { method: 'POST' });
  if (response.ok) {
    const data = await response.json();
    document.getElementById('key-modal-value').value = data.key;
    document.getElementById('key-modal').classList.remove('hidden');
    loadApiKeys();
  }
}

function copyKey() {
  const input = document.getElementById('key-modal-value');
  input.select();
  navigator.clipboard.writeText(input.value);
}

function closeKeyModal() {
  document.getElementById('key-modal').classList.add('hidden');
}

document.getElementById('key-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('key-modal')) closeKeyModal();
});

async function deleteApiKey(id) {
  const response = await fetch(`/api/me/api-keys/${id}`, { method: 'DELETE' });
  if (response.ok) loadApiKeys();
}

// --- projects tab ---

let editingProjectId = null;
let allUsers = [];
let currentUser = null;

async function loadCurrentUser() {
  try {
    const response = await fetch('/api/current-user');
    if (response.ok) currentUser = await response.json();
  } catch (error) {}
}

async function loadAllUsers() {
  try {
    const response = await fetch('/api/users');
    if (response.ok) allUsers = await response.json();
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

async function loadMyProjectsList() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) return;
    const projects = await response.json();
    const container = document.getElementById('my-projects-list');

    if (projects.length === 0) {
      container.innerHTML = '<div class="user-activity">no projects</div>';
      return;
    }

    container.innerHTML = projects.map(p => {
      const canEdit = currentUser && (currentUser.is_admin || p.created_by_id === currentUser.id);
      return `
        <div class="user-item">
          <div class="user-main">
            <div class="user-identity">
              <div class="username">${p.name}</div>
              <span class="admin-badge">${p.acronym}</span>
            </div>
          </div>
          ${canEdit ? `
            <div class="user-actions">
              <button onclick="editProjectUsers(${p.id})">users</button>
              <button onclick="deleteMyProject(${p.id}, '${p.name}')">delete</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

document.getElementById('create-project-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('new-project-name').value.trim();
  const acronym = document.getElementById('new-project-acronym').value.trim().toUpperCase();

  if (!name || !acronym) return;
  if (acronym.length !== 3) {
    alert('project code must be exactly 3 characters');
    return;
  }

  const response = await fetch('/api/me/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, acronym }),
  });

  if (response.ok) {
    document.getElementById('create-project-form').reset();
    loadMyProjectsList();
  } else {
    const error = await response.json();
    alert(error.detail || 'failed to create project');
  }
});

async function editProjectUsers(projectId) {
  editingProjectId = projectId;
  await loadAllUsers();

  const response = await fetch(`/api/projects/${projectId}/users`);
  const projectUsers = await response.json();
  const selectedIds = projectUsers.map(u => u.id);

  const container = document.getElementById('project-users-list');
  container.innerHTML = allUsers.map(u => {
    const isAdmin = u.username === 'admin';
    const checked = isAdmin || selectedIds.includes(u.id);
    return `
      <label class="user-checkbox">
        <input type="checkbox" value="${u.id}" ${checked ? 'checked' : ''} ${isAdmin ? 'disabled' : ''}>
        ${u.username}
      </label>
    `;
  }).join('');

  document.getElementById('project-modal').classList.remove('hidden');
}

async function saveProjectUsers() {
  const selected = Array.from(
    document.querySelectorAll('#project-users-list input:checked, #project-users-list input:disabled')
  ).map(cb => parseInt(cb.value));

  const response = await fetch(`/api/me/projects/${editingProjectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_ids: selected }),
  });

  if (response.ok) {
    closeProjectModal();
    loadMyProjectsList();
  } else {
    const error = await response.json();
    alert(error.detail || 'failed to update project');
  }
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
  editingProjectId = null;
}

document.getElementById('project-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('project-modal')) closeProjectModal();
});

async function deleteMyProject(projectId, projectName) {
  if (!confirm(`delete project ${projectName}?`)) return;

  const response = await fetch(`/api/me/projects/${projectId}`, { method: 'DELETE' });
  if (response.ok) {
    loadMyProjectsList();
  } else {
    const error = await response.json();
    alert(error.detail || 'failed to delete project');
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

loadCurrentUser();
loadFont();
loadMode();
loadApiKeys();
