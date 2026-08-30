// Apply panel branding (name + logo) from /api/settings
async function loadPanelSettings() {
  try {
    const data = await api('/api/settings?t=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache' }
    });
    return data.settings || {};
  } catch {
    return { panelMode: 'paid', panelName: 'CyberMonks', logoUrl: '/assets/logo.png' };
  }
}

function logoWithCacheBust(logoUrl, updatedAt) {
  const logo = logoUrl || '/assets/logo.png';
  if (/^data:/i.test(logo)) return logo;
  const stamp = updatedAt ? String(new Date(updatedAt).getTime()) : String(Date.now());
  const sep = logo.includes('?') ? '&' : '?';
  return logo + sep + 'v=' + stamp;
}

function applyBranding(settings) {
  if (!settings) return;
  const name = (settings.panelName || 'CyberMonks').trim() || 'CyberMonks';
  const logo = logoWithCacheBust(settings.logoUrl || '/assets/logo.png', settings.updatedAt);

  document.title = name + ' — ' + (document.title.includes('Admin')
    ? 'Admin'
    : document.title.includes('Profile')
      ? 'Profile'
      : document.title.includes('Panel') || location.pathname.includes('panel')
        ? 'Panel'
        : 'Login');

  document.querySelectorAll('link[rel="icon"]').forEach(link => {
    link.href = logo;
  });

  document.querySelectorAll('img.cm-logo, .cm-nav-brand img, img[src*="logo.png"], .cm-card > img').forEach(img => {
    img.src = logo;
    img.alt = name;
  });

  document.querySelectorAll('.cm-brand h1, .cm-nav-brand span').forEach(el => {
    el.textContent = name.toUpperCase();
  });

  window.__CM_SETTINGS__ = settings;
}
