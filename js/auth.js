// Shared API helpers for CyberMonks auth pages

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showMsg(el, text) {
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
}

function hideMsg(el) {
  if (!el) el?.classList?.remove('show');
}

async function requireAuth(redirect = '/login.html') {
  try {
    const { user } = await api('/api/me');
    return user;
  } catch {
    window.location.href = redirect;
    return null;
  }
}

async function requireRole(roles, redirect = '/panel.html') {
  const user = await requireAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    window.location.href = redirect;
    return null;
  }
  return user;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function roleBadge(role) {
  return `<span class="cm-badge cm-badge-${role}">${role}</span>`;
}

function subBadge(active) {
  return active
    ? '<span class="cm-badge cm-badge-active">Active</span>'
    : '<span class="cm-badge cm-badge-expired">Expired</span>';
}

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
}
