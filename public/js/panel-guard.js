(function () {
  const gate = document.getElementById('auth-gate');

  requireAuth('/').then(user => {
    if (!user) return;
    if (!user.subscriptionActive && user.role === 'user') {
      alert('Your subscription has expired. Contact the owner.');
      window.location.href = '/';
      return;
    }
    if (gate) gate.style.display = 'none';
    loadApp(user);
  });

  function loadApp(user) {
    const script = document.createElement('script');
    script.src = '/js/app.bundle.js';
    script.onload = () => injectNav(user);
    document.body.appendChild(script);
  }

  function injectNav(user) {
    const checkHeader = setInterval(() => {
      const header = document.querySelector('header');
      if (!header) return;
      clearInterval(checkHeader);
      if (document.getElementById('cm-topnav')) return;

      const nav = document.createElement('div');
      nav.id = 'cm-topnav';
      nav.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      nav.innerHTML = `
        <span style="font-size:11px;color:#666">${user.username}</span>
        <a href="/profile.html" style="font-size:11px;color:#00ffff;text-decoration:none;padding:4px 10px;border:1px solid rgba(0,255,255,0.2);border-radius:8px">Profile</a>
        ${user.role === 'owner' || user.role === 'admin'
          ? '<a href="/admin.html" style="font-size:11px;color:#ff8c00;text-decoration:none;padding:4px 10px;border:1px solid rgba(255,140,0,0.2);border-radius:8px">Admin</a>'
          : ''}
        <button id="cm-logout" style="font-size:11px;color:#888;background:none;border:1px solid #333;border-radius:8px;padding:4px 10px;cursor:pointer">Logout</button>
      `;
      const inner = header.querySelector('.max-w-screen-2xl') || header.firstElementChild;
      if (inner) inner.appendChild(nav);
      document.getElementById('cm-logout')?.addEventListener('click', logout);
    }, 500);
    setTimeout(() => clearInterval(checkHeader), 30000);
  }
})();
