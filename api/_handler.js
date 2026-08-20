const app = require('../app');

function handler(req, res) {
  if (typeof req.url === 'string' && !req.url.startsWith('/api')) {
    const q = req.url.indexOf('?');
    const path = q === -1 ? req.url : req.url.slice(0, q);
    const qs = q === -1 ? '' : req.url.slice(q);
    req.url = '/api' + (path.startsWith('/') ? path : '/' + path) + qs;
  }
  return app(req, res);
}

module.exports = handler;
