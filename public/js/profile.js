document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  document.getElementById('navUser').textContent = user.username;
  document.getElementById('navRole').textContent = user.role;
  document.getElementById('profileUsername').textContent = user.username;
  document.getElementById('profileRole').textContent = user.role.toUpperCase();
  document.getElementById('profileSub').textContent = user.subscriptionExpires
    ? formatDate(user.subscriptionExpires)
    : (user.role === 'owner' || user.role === 'admin' ? 'Unlimited' : 'No subscription');

  const subStatus = document.getElementById('profileSubStatus');
  if (user.role === 'owner' || user.role === 'admin') {
    subStatus.textContent = 'Full Access';
    subStatus.className = 'cm-badge cm-badge-active';
  } else {
    subStatus.textContent = user.subscriptionActive ? 'Active' : 'Expired';
    subStatus.className = user.subscriptionActive ? 'cm-badge cm-badge-active' : 'cm-badge cm-badge-expired';
  }

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('panelLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/panel.html';
  });
  document.getElementById('adminLink').addEventListener('click', (e) => {
    e.preventDefault();
    if (user.role === 'owner' || user.role === 'admin') {
      window.location.href = '/admin.html';
    }
  });
  if (user.role !== 'owner' && user.role !== 'admin') {
    document.getElementById('adminLink').style.display = 'none';
  }

  document.getElementById('passwordForm').addEventListener('submit', changePassword);
});

async function changePassword(e) {
  e.preventDefault();
  const msg = document.getElementById('passwordMsg');
  msg.className = 'cm-error';

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showMsg(msg, 'New passwords do not match');
    return;
  }

  try {
    await api('/api/profile-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    msg.className = 'cm-success show';
    msg.textContent = 'Password changed successfully.';
    document.getElementById('passwordForm').reset();
  } catch (err) {
    showMsg(msg, err.message);
  }
}
