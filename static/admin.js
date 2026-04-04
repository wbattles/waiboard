let currentUser = null;

async function loadUsers() {
  try {
    const response = await fetch('/api/admin/users');
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      throw new Error('Failed to load users');
    }
    
    const users = await response.json();
    const container = document.getElementById('users-container');
    
    container.innerHTML = users.map(user => {
      const canChangePassword = user.username !== 'admin' || currentUser?.username === 'admin';
      const canDelete = user.id !== currentUser?.id && user.username !== 'admin';
      const createdDate = new Date(user.created_at);
      const createdText = `created ${createdDate.toLocaleDateString()}`;
      
      return `
        <div class="user-item">
          <div class="user-main">
            <div class="user-identity">
              <div class="username">${user.username}</div>
              ${user.is_admin ? '<span class="admin-badge">admin</span>' : '<span class="minion-badge">minion</span>'}
            </div>
            <div class="user-activity">${createdText}</div>
          </div>
          <div class="user-actions">
            ${canChangePassword ? `<button onclick="changePassword(${user.id}, '${user.username}')">change password</button>` : ''}
            ${canDelete ? `<button onclick="deleteUser(${user.id}, '${user.username}')">delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

async function getCurrentUser() {
  try {
    const response = await fetch('/api/current-user');
    if (response.ok) {
      currentUser = await response.json();
    }
  } catch (error) {
    console.error('Error getting current user:', error);
  }
}

async function createUser(event) {
  event.preventDefault();
  
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  const isAdmin = document.getElementById('new-is-admin').checked;
  
  if (!username || !password) {
    showConfirmModal('error', 'username and password are required', null);
    return;
  }
  
  if (username.length > 15) {
    showConfirmModal('error', 'username must be 15 characters or less', null);
    return;
  }
  
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, is_admin: isAdmin })
    });
    
    if (response.ok) {
      document.getElementById('create-user-form').reset();
      loadUsers();
    } else {
      const error = await response.json();
      showConfirmModal('error', error.detail || 'failed to create user', null);
    }
  } catch (error) {
    showConfirmModal('error', 'connection error', null);
  }
}

let confirmCallback = null;

function showConfirmModal(title, message, callback) {
  const titleElement = document.getElementById('confirm-title');
  if (title) {
    titleElement.textContent = title;
    titleElement.style.display = 'block';
  } else {
    titleElement.style.display = 'none';
  }
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

function confirmAction() {
  if (confirmCallback) {
    confirmCallback();
  }
  closeConfirmModal();
}

async function deleteUser(userId, username) {
  showConfirmModal(
    '',
    `delete user ${username}?`,
    async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          loadUsers();
        } else {
          const error = await response.json();
          showConfirmModal('error', error.detail || 'failed to delete user', null);
        }
      } catch (error) {
        showConfirmModal('error', 'connection error', null);
      }
    }
  );
}

let userToChangePassword = null;

async function changePassword(userId, username) {
  userToChangePassword = userId;
  document.getElementById('password-modal').querySelector('h2').textContent = `change password for ${username}`;
  document.getElementById('new-user-password').value = '';
  document.getElementById('password-modal').classList.remove('hidden');
  document.getElementById('new-user-password').focus();
}

function closePasswordModal() {
  document.getElementById('password-modal').classList.add('hidden');
  userToChangePassword = null;
}

async function submitPasswordChange(event) {
  event.preventDefault();
  
  const newPassword = document.getElementById('new-user-password').value;
  
  if (!newPassword) {
    showConfirmModal('error', 'password is required', null);
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/users/${userToChangePassword}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword })
    });
    
    if (response.ok) {
      closePasswordModal();
      showConfirmModal('success', 'password updated successfully', null);
    } else {
      const error = await response.json();
      showConfirmModal('error', error.detail || 'failed to update password', null);
    }
  } catch (error) {
    showConfirmModal('error', 'connection error', null);
  }
}

function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(`${tabName}-tab`).classList.add('active');
  event.target.classList.add('active');
  
  // Initialize projects tab when shown
  if (tabName === 'projects') {
    initializeProjectsTab();
  }
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

document.getElementById('create-user-form').addEventListener('submit', createUser);
document.getElementById('password-form').addEventListener('submit', submitPasswordChange);

// Close modals when clicking outside
document.getElementById('password-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('password-modal')) closePasswordModal();
});

document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('confirm-modal')) closeConfirmModal();
});

// Initialize
getCurrentUser().then(() => loadUsers());