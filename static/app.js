const COLUMNS = [
  { id: "todo",       label: "to do" },
  { id: "inprogress", label: "in progress" },
  { id: "testing",    label: "testing" },
  { id: "done",       label: "done" },
];

let editingId = null;
let viewingTicket = null;
let currentProjectId = null;
let projectUsers = [];

async function loadProjects() {
  const res = await fetch("/api/projects");
  const projects = await res.json();
  
  const selector = document.getElementById("project-selector");
  selector.innerHTML = '<option value="">select project</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  
  // Auto-select first project if available
  if (projects.length > 0) {
    currentProjectId = projects[0].id;
    selector.value = currentProjectId;
    loadProjectUsers();
    loadTickets();
  }
}

function switchProject() {
  const selector = document.getElementById("project-selector");
  currentProjectId = selector.value ? parseInt(selector.value) : null;
  if (currentProjectId) {
    loadProjectUsers();
    loadTickets();
  } else {
    projectUsers = [];
    // Clear board if no project selected
    COLUMNS.forEach(col => {
      document.getElementById(`tickets-${col.id}`).innerHTML = "";
    });
  }
}

async function loadProjectUsers() {
  if (!currentProjectId) { projectUsers = []; return; }
  try {
    const res = await fetch(`/api/projects/${currentProjectId}/users`);
    projectUsers = await res.json();
  } catch { projectUsers = []; }
}

function populateAssigneeDropdown(selectedUserId) {
  const select = document.getElementById("ticket-assignee");
  select.innerHTML = '<option value="0">unassigned</option>' +
    projectUsers.map(u =>
      `<option value="${u.id}" ${u.id === selectedUserId ? 'selected' : ''}>${u.username}</option>`
    ).join('');
}

async function loadTickets() {
  const res = await fetch(`/api/tickets?project_id=${currentProjectId}`);
  const tickets = await res.json();

  COLUMNS.forEach(col => {
    document.getElementById(`tickets-${col.id}`).innerHTML = "";
  });

  tickets.forEach(renderTicket);
}

function renderTicket(ticket) {
  const container = document.getElementById(`tickets-${ticket.column}`);
  if (!container) return;

  const div = document.createElement("div");
  div.className = "ticket";

  // top row: title + assigned user
  const top = document.createElement("div");
  top.className = "ticket-top";

  const title = document.createElement("div");
  title.className = "ticket-title";
  title.textContent = ticket.title;
  top.appendChild(title);

  if (ticket.assigned_user) {
    const assignee = document.createElement("span");
    assignee.className = "ticket-assignee";
    assignee.textContent = ticket.assigned_user.username;
    top.appendChild(assignee);
  }

  div.appendChild(top);

  const desc = document.createElement("div");
  desc.className = "ticket-desc";
  desc.innerText = ticket.description || "";
  div.appendChild(desc);

  const bottom = document.createElement("div");
  bottom.className = "ticket-bottom";

  const select = document.createElement("select");
  COLUMNS.forEach(col => {
    const opt = document.createElement("option");
    opt.value = col.id;
    opt.textContent = col.label;
    if (col.id === ticket.column) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => moveTicket(ticket.id, select.value));

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "view";
  viewBtn.addEventListener("click", () => openViewModal(ticket));

  bottom.appendChild(select);
  bottom.appendChild(viewBtn);

  if (ticket.project && ticket.ticket_number) {
    const code = document.createElement("span");
    code.className = "ticket-code";
    code.textContent = ticket.project.acronym + "-" + ticket.ticket_number;
    bottom.appendChild(code);
  }

  div.appendChild(bottom);
  container.appendChild(div);
}

// --- view modal ---

async function openViewModal(ticket) {
  viewingTicket = ticket;

  document.getElementById("view-title").textContent = ticket.title;
  document.getElementById("view-desc").innerText = ticket.description;

  // Setup column dropdown
  const columnSelect = document.getElementById("view-column");
  columnSelect.innerHTML = "";
  COLUMNS.forEach(col => {
    const opt = document.createElement("option");
    opt.value = col.id;
    opt.textContent = col.label;
    if (col.id === ticket.column) opt.selected = true;
    columnSelect.appendChild(opt);
  });
  columnSelect.onchange = () => moveTicket(ticket.id, columnSelect.value);

  populateAssigneeDropdown(ticket.assigned_user ? ticket.assigned_user.id : 0);
  document.getElementById("ticket-assignee").onchange = () => {
    const userId = parseInt(document.getElementById("ticket-assignee").value);
    assignTicket(ticket.id, userId);
  };

  document.getElementById("view-modal").classList.remove("hidden");
}

function closeViewModal() {
  document.getElementById("view-modal").classList.add("hidden");
  viewingTicket = null;
}

async function moveTicket(id, column) {
  await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column }),
  });
  loadTickets();
}

async function assignTicket(id, assigned_user_id) {
  await fetch(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigned_user_id }),
  });
  loadTickets();
}

async function deleteTicket() {
  if (editingId) {
    await fetch(`/api/tickets/${editingId}`, { method: "DELETE" });
    closeModal();
    loadTickets();
  }
}

function openEditFromView() {
  const ticket = viewingTicket;
  closeViewModal();
  editingId = ticket.id;
  document.getElementById("modal-heading").textContent = "edit";
  document.getElementById("ticket-title").value = ticket.title;
  document.getElementById("ticket-description").value = ticket.description;
  document.getElementById("delete-btn").classList.remove("hidden");
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("ticket-title").focus();
}

// --- create / edit modal ---

function openModal() {
  editingId = null;
  document.getElementById("modal-heading").textContent = "new";
  document.getElementById("ticket-title").value = "";
  document.getElementById("ticket-description").value = "";
  document.getElementById("delete-btn").classList.add("hidden");
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("ticket-title").focus();
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingId = null;
}

async function submitTicket() {
  const title = document.getElementById("ticket-title").value.trim();
  const description = document.getElementById("ticket-description").value.trim();

  if (!title) {
    document.getElementById("ticket-title").focus();
    return;
  }

  if (!currentProjectId && editingId === null) {
    alert("No project selected");
    return;
  }

  try {
    if (editingId !== null) {
      const response = await fetch(`/api/tickets/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!response.ok) {
        const error = await response.json();
        alert(`Error updating ticket: ${error.detail || 'Unknown error'}`);
        return;
      }
    } else {
      const response = await fetch(`/api/tickets?project_id=${currentProjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!response.ok) {
        const error = await response.json();
        alert(`Error creating ticket: ${error.detail || 'Unknown error'}`);
        return;
      }
    }

    closeModal();
    loadTickets();
  } catch (error) {
    alert(`Network error: ${error.message}`);
  }
}

document.getElementById("view-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("view-modal")) closeViewModal();
});

document.getElementById("modal").addEventListener("click", e => {
  if (e.target === document.getElementById("modal")) closeModal();
});

document.getElementById("ticket-title").addEventListener("keydown", e => {
  if (e.key === "Enter") submitTicket();
});

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

async function checkUserStatus() {
  try {
    const response = await fetch('/api/current-user');
    if (response.ok) {
      const user = await response.json();
      if (user.is_admin) {
        document.getElementById('admin-btn').classList.remove('hidden');
      }
    }
  } catch (error) {
    // User is not logged in or not admin, admin button stays hidden
  }
}

// Initialize the app
checkUserStatus();
loadProjects();
