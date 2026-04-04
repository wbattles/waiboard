const COLUMNS = [
  { id: "todo",       label: "to do" },
  { id: "inprogress", label: "in progress" },
  { id: "testing",    label: "testing" },
  { id: "done",       label: "done" },
];

let editingId = null;
let viewingTicket = null;

async function loadTickets() {
  const res = await fetch("/api/tickets");
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

  const titleRow = document.createElement("div");
  titleRow.className = "ticket-title-row";
  
  const title = document.createElement("div");
  title.className = "ticket-title";
  title.textContent = ticket.title;
  
  const assignedUser = document.createElement("div");
  assignedUser.className = "ticket-assigned";
  if (ticket.assigned_user) {
    assignedUser.textContent = ticket.assigned_user;
  }
  
  titleRow.appendChild(title);
  titleRow.appendChild(assignedUser);

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

  div.appendChild(titleRow);

  const desc = document.createElement("div");
  desc.className = "ticket-desc";
  desc.innerText = ticket.description || "";
  div.appendChild(desc);

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "view";
  viewBtn.addEventListener("click", () => openViewModal(ticket));

  bottom.appendChild(select);
  bottom.appendChild(viewBtn);
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

  // Setup assignment dropdown
  await setupAssignmentDropdown(ticket);

  document.getElementById("view-modal").classList.remove("hidden");
}

async function setupAssignmentDropdown(ticket) {
  try {
    const response = await fetch('/api/users');
    const users = await response.json();
    
    const assignSelect = document.getElementById("view-assigned");
    assignSelect.innerHTML = "";
    
    // Add unassigned option
    const unassignedOpt = document.createElement("option");
    unassignedOpt.value = "0";
    unassignedOpt.textContent = "unassigned";
    if (!ticket.assigned_user_id) unassignedOpt.selected = true;
    assignSelect.appendChild(unassignedOpt);
    
    // Add user options
    users.forEach(user => {
      const opt = document.createElement("option");
      opt.value = user.id;
      opt.textContent = user.username;
      if (ticket.assigned_user_id === user.id) opt.selected = true;
      assignSelect.appendChild(opt);
    });
    
    assignSelect.onchange = () => assignUser(ticket.id, parseInt(assignSelect.value));
  } catch (error) {
    console.error('Failed to load users:', error);
  }
}

async function assignUser(ticketId, userId) {
  await fetch(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigned_user_id: userId }),
  });
  loadTickets();
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

  if (editingId !== null) {
    await fetch(`/api/tickets/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
  } else {
    await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
  }

  closeModal();
  loadTickets();
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
loadTickets();
