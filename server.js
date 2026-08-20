require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());
app.use(express.static(__dirname));

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

async function initDb() {
  const { data } = await supabase.from('cm_users').select('id').eq('role', 'owner').limit(1);
  if (data?.length) return;

  const hash = await bcrypt.hash('CyberMonks@2026', 10);
  const { error } = await supabase.from('cm_users').insert({
    id: '00000000-0000-4000-8000-000000000001',
    username: 'owner',
    password_hash: hash,
    role: 'owner',
    subscription_expires: null
  });
  if (error && !error.message.includes('duplicate')) {
    console.error('Failed to seed owner:', error.message);
    return;
  }
  console.log('Owner created in Supabase. Login: owner / CyberMonks@2026');
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

  const { data: session } = await supabase
    .from('cm_sessions')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!session) return null;

  const { data: userRow } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', session.user_id)
    .maybeSingle();

  if (!userRow) return null;

  return {
    user: rowToUser(userRow),
    session: {
      token: session.token,
      userId: session.user_id,
      expiresAt: session.expires_at
    }
  };
}

function requireAuth(roles) {
  return async (req, res, next) => {
    const ctx = await getSession(req);
    if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
    if (roles && !roles.includes(ctx.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.user = ctx.user;
    req.session = ctx.session;
    next();
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
  if (currentExpiry && new Date(currentExpiry) > now) {
    base = new Date(currentExpiry);
  }
  base.setDate(base.getDate() + Number(days));
  return base.toISOString();
}

// ── Auth ──

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { data: rows } = await supabase
    .from('cm_users')
    .select('*')
    .ilike('username', username.trim());

  const row = rows?.[0];
  const user = row ? rowToUser(row) : null;

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!isSubscriptionActive(user)) {
    return res.status(403).json({ error: 'Your subscription has expired. Contact the owner.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await supabase.from('cm_sessions').delete().eq('user_id', user.id);
  await supabase.from('cm_sessions').insert({
    token,
    user_id: user.id,
    expires_at: expiresAt.toISOString()
  });

  setSessionCookie(res, token);
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/logout', async (req, res) => {
  const token = parseCookies(req).cm_session;
  if (token) await supabase.from('cm_sessions').delete().eq('token', token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const ctx = await getSession(req);
  if (!ctx) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: sanitizeUser(ctx.user) });
});

// ── Users ──

app.get('/api/users', requireAuth(['owner', 'admin']), async (req, res) => {
  const { data, error } = await supabase
    .from('cm_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data.map(rowToUser).map(sanitizeUser) });
});

app.post('/api/users', requireAuth(['owner', 'admin']), async (req, res) => {
  const { username, password, subscriptionDays, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const { data: existing } = await supabase
    .from('cm_users')
    .select('id')
    .ilike('username', username.trim());

  if (existing?.length) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  let userRole = 'user';
  if (req.user.role === 'owner' && role && ['user', 'admin'].includes(role)) {
    userRole = role;
  }

  const days = Number(subscriptionDays) || 0;
  const subscription_expires = days > 0
    ? calcSubscriptionExpiry(null, days)
    : null;

  const { data, error } = await supabase.from('cm_users').insert({
    username: username.trim(),
    password_hash: await bcrypt.hash(password, 10),
    role: userRole,
    subscription_expires
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ user: sanitizeUser(rowToUser(data)) });
});

app.delete('/api/users/:id', requireAuth(['owner', 'admin']), async (req, res) => {
  const { data: target } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner') return res.status(403).json({ error: 'Cannot delete owner' });
  if (req.user.role === 'admin' && target.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot delete other admins' });
  }

  await supabase.from('cm_sessions').delete().eq('user_id', req.params.id);
  await supabase.from('cm_users').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

app.put('/api/users/:id/password', requireAuth(['owner', 'admin']), async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const { data: target } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner' && req.user.id !== target.id) {
    return res.status(403).json({ error: 'Cannot reset owner password' });
  }

  const { error } = await supabase
    .from('cm_users')
    .update({ password_hash: await bcrypt.hash(password, 10) })
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.put('/api/users/:id/subscription', requireAuth(['owner']), async (req, res) => {
  const addDays = Number(req.body?.days);
  if (!addDays || addDays < 1) {
    return res.status(400).json({ error: 'Days must be a positive number' });
  }

  const { data: user } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found' });

  const subscription_expires = calcSubscriptionExpiry(user.subscription_expires, addDays);
  const { data, error } = await supabase
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
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const { data: row } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', req.user.id)
    .maybeSingle();

  const user = rowToUser(row);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const { error } = await supabase
    .from('cm_users')
    .update({ password_hash: await bcrypt.hash(newPassword, 10) })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

async function start() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    if (!process.env.VERCEL) process.exit(1);
    return;
  }
  await initDb();
  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`CyberMonks Panel running at http://localhost:${PORT}`);
    });
  }
}

start();

module.exports = app;
