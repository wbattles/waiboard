let allUsers = [];
let editingProjectId = null;
let currentProjectId = null;

async function loadProjects() {
  try {
    const response = await fetch('/api/admin/projects');
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      throw new Error('Failed to load projects');
    }
    
    const projects = await response.json();
    const container = document.getElementById('projects-container');
    
    container.innerHTML = projects.map(project => `
      <div class="user-item">
        <div class="user-main">
          <div class="user-identity">
            <div class="username">${project.name}</div>
            <span class="admin-badge">${project.acronym}</span>
          </div>
          <div class="user-activity">${project.user_count} users</div>
        </div>
        <div class="user-actions">
          <button onclick="editProject(${project.id})">edit</button>
          <button onclick="deleteProject(${project.id}, '${project.name}')">delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

async function loadAllUsers() {
  try {
    const response = await fetch('/api/admin/users');
    if (response.ok) {
      allUsers = await response.json();
      updateUserCheckboxes();
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function updateUserCheckboxes(selectedUserIds = []) {
  const container = document.getElementById('edit-project-users-list');
  if (container) {
    container.innerHTML = allUsers.map(user => {
      const isAdmin = user.username === 'admin';
      const checked = isAdmin || selectedUserIds.includes(user.id);
      return `
        <label class="user-checkbox">
          <input type="checkbox" value="${user.id}" ${checked ? 'checked' : ''} ${isAdmin ? 'disabled' : ''}>
          ${user.username}
        </label>
      `;
    }).join('');
  }
}

async function createProject(event) {
  event.preventDefault();
  
  const name = document.getElementById('new-project-name').value.trim();
  const acronym = document.getElementById('new-project-acronym').value.trim().toUpperCase();
  
  if (!name || !acronym) {
    showConfirmModal('error', 'project name and acronym are required', null);
    return;
  }
  
  if (acronym.length !== 3) {
    showConfirmModal('error', 'acronym must be exactly 3 characters', null);
    return;
  }
  
  const selectedUsers = []; // No user assignment during creation
  
  try {
    const response = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        acronym, 
        user_ids: selectedUsers 
      })
    });
    
    if (response.ok) {
      document.getElementById('create-project-form').reset();
      loadProjects();
    } else {
      const error = await response.json();
      showConfirmModal('error', error.detail || 'failed to create project', null);
    }
  } catch (error) {
    showConfirmModal('error', 'connection error', null);
  }
}

async function editProject(projectId) {
  try {
    const response = await fetch('/api/admin/projects');
    const projects = await response.json();
    const project = projects.find(p => p.id === projectId);
    
    if (!project) return;
    
    editingProjectId = projectId;
    document.getElementById('edit-project-name').value = project.name;
    document.getElementById('edit-project-acronym').value = project.acronym;
    
    const selectedUserIds = project.users.map(u => u.id);
    updateUserCheckboxes(selectedUserIds);
    
    document.getElementById('project-modal').classList.remove('hidden');
    document.getElementById('edit-project-name').focus();
  } catch (error) {
    showConfirmModal('error', 'failed to load project details', null);
  }
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
  editingProjectId = null;
}

async function submitProjectEdit(event) {
  event.preventDefault();
  
  const name = document.getElementById('edit-project-name').value.trim();
  const acronym = document.getElementById('edit-project-acronym').value.trim().toUpperCase();
  
  if (!name || !acronym) {
    showConfirmModal('error', 'project name and acronym are required', null);
    return;
  }
  
  if (acronym.length !== 3) {
    showConfirmModal('error', 'acronym must be exactly 3 characters', null);
    return;
  }
  
  const selectedUsers = Array.from(document.querySelectorAll('#edit-project-users-list input:checked, #edit-project-users-list input:disabled'))
    .map(cb => parseInt(cb.value));
  
  try {
    const response = await fetch(`/api/admin/projects/${editingProjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        acronym, 
        user_ids: selectedUsers 
      })
    });
    
    if (response.ok) {
      closeProjectModal();
      loadProjects();
    } else {
      const error = await response.json();
      showConfirmModal('error', error.detail || 'failed to update project', null);
    }
  } catch (error) {
    showConfirmModal('error', 'connection error', null);
  }
}

async function deleteProject(projectId, projectName) {
  showConfirmModal(
    '',
    `delete project ${projectName}?`,
    async () => {
      try {
        const response = await fetch(`/api/admin/projects/${projectId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          loadProjects();
        } else {
          const error = await response.json();
          showConfirmModal('error', error.detail || 'failed to delete project', null);
        }
      } catch (error) {
        showConfirmModal('error', 'connection error', null);
      }
    }
  );
}

// Initialize projects tab
document.getElementById('create-project-form').addEventListener('submit', createProject);
document.getElementById('project-form').addEventListener('submit', submitProjectEdit);

// Close modal when clicking outside
document.getElementById('project-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('project-modal')) closeProjectModal();
});

// Load data when projects tab is shown
function initializeProjectsTab() {
  loadAllUsers();
  loadProjects();
}