require('dotenv').config();
const app = require('../app');

function buildUrlFromRewrite(req) {
  // vercel.json rewrite: /api/(.*) -> /api?cm_path=$1
  const cmPath = req.query && req.query.cm_path;
  if (cmPath != null && cmPath !== '') {
    const qs = new URLSearchParams();
    Object.entries(req.query || {}).forEach(([k, v]) => {
      if (k === 'cm_path') return;
      if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
      else if (v != null) qs.append(k, v);
    });
    const q = qs.toString();
    const path = String(cmPath).replace(/^\/+/, '');
    return '/api/' + path + (q ? '?' + q : '');
  }
  return null;
}

function getOriginalUrl(req) {
  const rewritten = buildUrlFromRewrite(req);
  if (rewritten) return rewritten;

  const headerUrl =
    req.headers['x-forwarded-uri'] ||
    req.headers['x-invoke-path'] ||
    req.headers['x-vercel-forwarded-path'] ||
    '';

  let url = (typeof headerUrl === 'string' && headerUrl) || req.url || '/';

  if (!url.includes('?') && typeof req.url === 'string' && req.url.includes('?')) {
    url += req.url.slice(req.url.indexOf('?'));
  }

  if (!url.startsWith('/api')) {
    const pathOnly = url.split('?')[0] || '/';
    const qs = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    url = '/api' + (pathOnly.startsWith('/') ? pathOnly : '/' + pathOnly) + qs;
  }

  return url;
}

function handler(req, res) {
  req.url = getOriginalUrl(req);
  return app(req, res);
}

module.exports = handler;
