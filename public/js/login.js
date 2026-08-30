document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  const settings = await loadPanelSettings();
  applyBranding(settings);

  if (settings.panelMode === 'free') {
    window.location.href = '/panel.html';
    return;
  }

  api('/api/me').then(({ user }) => {
    if (user.role === 'owner' || user.role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/panel.html';
    }
  }).catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Authenticating…';

    try {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const { user } = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (user.role === 'owner' || user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/panel.html';
      }
    } catch (err) {
      showMsg(errorEl, err.message);
      btn.disabled = false;
      btn.textContent = 'Enter the Matrix';
    }
  });
});
