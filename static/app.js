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

  const title = document.createElement("div");
  title.className = "ticket-title";
  title.textContent = ticket.title;

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

  div.appendChild(title);

  if (ticket.description) {
    const desc = document.createElement("div");
    desc.className = "ticket-desc";
    desc.innerText = ticket.description;
    div.appendChild(desc);
  }

  const viewBtn = document.createElement("button");
  viewBtn.textContent = "view";
  viewBtn.addEventListener("click", () => openViewModal(ticket));

  bottom.appendChild(select);
  bottom.appendChild(viewBtn);
  div.appendChild(bottom);
  container.appendChild(div);
}

// --- view modal ---

function openViewModal(ticket) {
  viewingTicket = ticket;

  document.getElementById("view-title").textContent = ticket.title;
  document.getElementById("view-desc").innerText = ticket.description;

  const select = document.getElementById("view-column");
  select.innerHTML = "";
  COLUMNS.forEach(col => {
    const opt = document.createElement("option");
    opt.value = col.id;
    opt.textContent = col.label;
    if (col.id === ticket.column) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = () => moveTicket(ticket.id, select.value);

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

async function deleteFromView() {
  await fetch(`/api/tickets/${viewingTicket.id}`, { method: "DELETE" });
  closeViewModal();
  loadTickets();
}

function openEditFromView() {
  const ticket = viewingTicket;
  closeViewModal();
  editingId = ticket.id;
  document.getElementById("modal-heading").textContent = "edit";
  document.getElementById("ticket-title").value = ticket.title;
  document.getElementById("ticket-description").value = ticket.description;
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("ticket-title").focus();
}

// --- create / edit modal ---

function openModal() {
  editingId = null;
  document.getElementById("modal-heading").textContent = "new";
  document.getElementById("ticket-title").value = "";
  document.getElementById("ticket-description").value = "";
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

loadTickets();
