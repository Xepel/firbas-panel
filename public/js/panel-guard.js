(function () {
  const gate = document.getElementById('auth-gate');

  async function boot() {
    let settings = { panelMode: 'paid', panelName: 'CyberMonks', logoUrl: '/assets/logo.png' };
    try {
      const data = await api('/api/settings');
      settings = data.settings || settings;
    } catch {}

    applyBranding(settings);

    if (settings.panelMode === 'free') {
      if (gate) gate.style.display = 'none';
      loadApp({ username: 'guest', role: 'guest', freeMode: true });
      return;
    }

    const user = await requireAuth('/');
    if (!user) return;
    if (!user.subscriptionActive && user.role === 'user') {
      alert('Your subscription has expired. Contact the owner.');
      window.location.href = '/';
      return;
    }
    if (gate) gate.style.display = 'none';
    loadApp(user);
  }

  function loadApp(user) {
    const script = document.createElement('script');
    script.src = '/js/app.bundle.js';
    script.onload = () => {
      injectNav(user);
      applyLiveBranding();
    };
    document.body.appendChild(script);
  }

  function applyLiveBranding() {
    const settings = window.__CM_SETTINGS__;
    if (!settings) return;
    const name = settings.panelName || 'CyberMonks';
    const logo = typeof logoWithCacheBust === 'function'
      ? logoWithCacheBust(settings.logoUrl || '/assets/logo.png', settings.updatedAt)
      : (settings.logoUrl || '/assets/logo.png');
    const tryApply = setInterval(() => {
      const header = document.querySelector('header');
      if (!header) return;
      clearInterval(tryApply);
      header.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (/logo\.png|cybermonks|cm-logo/i.test(src) || /cybermonks/i.test(img.alt || '')) {
          img.src = logo;
          img.alt = name;
        }
      });
      // Replace CYBER + MONKS text spans if present
      const spans = header.querySelectorAll('span');
      spans.forEach(span => {
        if (span.textContent === 'CYBER' || span.textContent === 'MONKS') {
          span.parentElement && (span.parentElement.dataset.cmBrand = '1');
        }
      });
      const brandWrap = header.querySelector('[data-cm-brand="1"]')?.parentElement;
      if (brandWrap && !brandWrap.querySelector('.cm-live-name')) {
        const label = document.createElement('span');
        label.className = 'cm-live-name';
        label.style.cssText = 'font-weight:700;letter-spacing:0.06em;color:#00ffff;margin-left:4px';
        label.textContent = name.toUpperCase();
        // hide old split letters
        brandWrap.querySelectorAll('span').forEach(s => {
          if (s.textContent === 'CYBER' || s.textContent === 'MONKS') s.style.display = 'none';
        });
        brandWrap.appendChild(label);
      }
    }, 400);
    setTimeout(() => clearInterval(tryApply), 20000);
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
      if (user.freeMode) {
        nav.innerHTML = `<span style="font-size:11px;color:#666">Free mode</span>`;
      } else {
        nav.innerHTML = `
          <span style="font-size:11px;color:#666">${user.username}</span>
          <a href="/profile.html" style="font-size:11px;color:#00ffff;text-decoration:none;padding:4px 10px;border:1px solid rgba(0,255,255,0.2);border-radius:8px">Profile</a>
          ${user.role === 'owner' || user.role === 'admin'
            ? '<a href="/admin.html" style="font-size:11px;color:#ff8c00;text-decoration:none;padding:4px 10px;border:1px solid rgba(255,140,0,0.2);border-radius:8px">Admin</a>'
            : ''}
          <button id="cm-logout" style="font-size:11px;color:#888;background:none;border:1px solid #333;border-radius:8px;padding:4px 10px;cursor:pointer">Logout</button>
        `;
      }
      const inner = header.querySelector('.max-w-screen-2xl') || header.firstElementChild;
      if (inner) inner.appendChild(nav);
      document.getElementById('cm-logout')?.addEventListener('click', logout);
    }, 500);
    setTimeout(() => clearInterval(checkHeader), 30000);
  }

  boot();
})();
