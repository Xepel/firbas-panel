let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireRole(['owner', 'admin']);
  if (!currentUser) return;

  document.getElementById('navUser').textContent = currentUser.username;
  document.getElementById('navRole').textContent = currentUser.role;

  if (currentUser.role !== 'owner') {
    document.getElementById('subscriptionSection').style.display = 'none';
    document.getElementById('ownerSettings').style.display = 'none';
    const roleField = document.getElementById('roleField');
    if (roleField) roleField.style.display = 'none';
  } else {
    loadOwnerSettings();
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
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) settingsForm.addEventListener('submit', saveOwnerSettings);

  loadUsers();
  loadPanelSettings().then(applyBranding);
});

async function loadOwnerSettings() {
  try {
    const { settings } = await api('/api/settings/admin');
    document.getElementById('panelMode').value = settings.panelMode || 'paid';
    document.getElementById('panelName').value = settings.panelName || 'CyberMonks';
    document.getElementById('logoUrl').value = settings.logoUrl || '/assets/logo.png';
    document.getElementById('telegramBotToken').value = settings.telegramBotToken || '';
    document.getElementById('telegramChatId').value = settings.telegramChatId || '';
    updateModeHint();
    document.getElementById('panelMode').onchange = updateModeHint;
  } catch (err) {
    const msg = document.getElementById('settingsMsg');
    msg.className = 'cm-error show';
    msg.textContent = err.message;
  }
}

function updateModeHint() {
  const mode = document.getElementById('panelMode').value;
  document.getElementById('modeHint').textContent = mode === 'free'
    ? 'Free mode: login page skips for visitors. Anyone can open panel and enter Firebase URL directly.'
    : 'Paid mode: users must login with username/password and active subscription.';
}

async function saveOwnerSettings(e) {
  e.preventDefault();
  const msg = document.getElementById('settingsMsg');
  msg.className = 'cm-error';
  try {
    const { settings } = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        panelMode: document.getElementById('panelMode').value,
        panelName: document.getElementById('panelName').value.trim(),
        logoUrl: document.getElementById('logoUrl').value.trim(),
        telegramBotToken: document.getElementById('telegramBotToken').value.trim(),
        telegramChatId: document.getElementById('telegramChatId').value.trim()
      })
    });
    msg.className = 'cm-success show';
    msg.textContent = 'Settings saved. Free/Paid mode is live after refresh.';
    applyBranding(settings);
  } catch (err) {
    showMsg(msg, err.message);
  }
}

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
            <button class="cm-btn cm-btn-ghost expire-btn" data-id="${u.id}" data-name="${escapeHtml(u.username)}">Expire</button>
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
    tbody.querySelectorAll('.expire-btn').forEach(btn => {
      btn.addEventListener('click', () => expireSubscription(btn.dataset.id, btn.dataset.name));
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
    await api(`/api/users/${userId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({ days })
    });
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function expireSubscription(userId, username) {
  if (!confirm(`Expire subscription for "${username}" now?`)) return;
  try {
    await api(`/api/users/${userId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({ expire: true })
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
    await api(`/api/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
    alert('Password reset successfully.');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('Delete this user permanently?')) return;
  try {
    await api(`/api/users/${userId}`, { method: 'DELETE' });
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
