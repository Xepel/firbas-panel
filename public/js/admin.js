let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireRole(['owner', 'admin']);
  if (!currentUser) return;

  document.getElementById('navUser').textContent = currentUser.username;
  document.getElementById('navRole').textContent = currentUser.role;

  if (currentUser.role !== 'owner') {
    document.getElementById('subscriptionSection').style.display = 'none';
    const roleField = document.getElementById('roleField');
    if (roleField) roleField.style.display = 'none';
  }

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('panelLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/panel.html';
  });
  document.getElementById('profileLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/profile.html';
  });

  document.getElementById('addUserForm').addEventListener('submit', addUser);
  loadUsers();
});

async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666">Loading…</td></tr>';

  try {
    const { users } = await api('/api/users');
    tbody.innerHTML = users.map(u => `
      <tr data-id="${u.id}">
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${roleBadge(u.role)}</td>
        <td>${subBadge(u.subscriptionActive)}</td>
        <td>${formatDate(u.subscriptionExpires)}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td class="cm-actions-row">
          ${currentUser.role === 'owner' && u.role !== 'owner' ? `
            <button class="cm-btn cm-btn-ghost sub-btn" data-id="${u.id}" data-name="${escapeHtml(u.username)}">+ Days</button>
          ` : ''}
          ${u.role !== 'owner' ? `
            <button class="cm-btn cm-btn-ghost reset-btn" data-id="${u.id}">Reset PW</button>
            <button class="cm-btn cm-btn-danger del-btn" data-id="${u.id}">Delete</button>
          ` : '—'}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.sub-btn').forEach(btn => {
      btn.addEventListener('click', () => openSubModal(btn.dataset.id, btn.dataset.name));
    });
    tbody.querySelectorAll('.reset-btn').forEach(btn => {
      btn.addEventListener('click', () => resetPassword(btn.dataset.id));
    });
    tbody.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteUser(btn.dataset.id));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#ff6666">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function addUser(e) {
  e.preventDefault();
  const msg = document.getElementById('addUserMsg');
  msg.className = 'cm-error';

  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const subscriptionDays = document.getElementById('newSubDays').value;
  const roleEl = document.getElementById('newRole');
  const role = roleEl ? roleEl.value : 'user';

  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, subscriptionDays: Number(subscriptionDays) || 0, role })
    });
    msg.className = 'cm-success show';
    msg.textContent = `User "${username}" created successfully.`;
    document.getElementById('addUserForm').reset();
    loadUsers();
  } catch (err) {
    showMsg(msg, err.message);
  }
}

function openSubModal(userId, username) {
  const days = prompt(`Add subscription days for "${username}":`, '30');
  if (!days) return;
  addSubscription(userId, Number(days));
}

async function addSubscription(userId, days) {
  if (!days || days < 1) { alert('Enter a valid number of days'); return; }
  try {
    await api('/api/user-action', {
      method: 'POST',
      body: JSON.stringify({ action: 'subscription', id: userId, days })
    });
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function resetPassword(userId) {
  const password = prompt('Enter new password (min 6 chars):');
  if (!password) return;
  try {
    await api('/api/user-action', {
      method: 'POST',
      body: JSON.stringify({ action: 'password', id: userId, password })
    });
    alert('Password reset successfully.');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('Delete this user permanently?')) return;
  try {
    await api('/api/user-action', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id: userId })
    });
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
