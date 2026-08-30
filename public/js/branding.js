// Apply panel branding (name + logo) from /api/settings
async function loadPanelSettings() {
  try {
    const data = await api('/api/settings');
    return data.settings || {};
  } catch {
    return { panelMode: 'paid', panelName: 'CyberMonks', logoUrl: '/assets/logo.png' };
  }
}

function applyBranding(settings) {
  if (!settings) return;
  const name = settings.panelName || 'CyberMonks';
  const logo = settings.logoUrl || '/assets/logo.png';
  document.title = document.title.replace(/CyberMonks|CYBERMONKS/gi, name);
  document.querySelectorAll('img[src="/assets/logo.png"], img.cm-logo, .cm-nav-brand img').forEach(img => {
    img.src = logo;
    img.alt = name;
  });
  document.querySelectorAll('.cm-brand h1, .cm-nav-brand span').forEach(el => {
    if (/cybermonks/i.test(el.textContent || '')) {
      el.textContent = el.textContent.replace(/CYBERMONKS|CyberMonks/gi, name.toUpperCase());
    }
  });
  window.__CM_SETTINGS__ = settings;
}
