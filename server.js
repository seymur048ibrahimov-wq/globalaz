'use strict';
// GlobalAz: sayt + CJ vasitəçisi (asılılıq yoxdur, Node 18+)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 3000;
const KEY = process.env.CJ_API_KEY || '';
const CJ = process.env.CJ_BASE || 'https://developers.cjdropshipping.com/api2.0/v1';
const PAGE = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('api:"",', 'api:"/",');

async function cj(p, opts, token) {
  const r = await fetch(CJ + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { 'CJ-Access-Token': token } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.result === false || (j.code && j.code !== 200)) throw new Error('CJ: ' + (j.message || r.status));
  return j.data;
}
let tok = null;
async function token() {
  if (tok && Date.parse(tok.exp) - Date.now() > 864e5) return tok.access;
  if (!KEY) throw new Error('CJ_API_KEY təyin edilməyib');
  const d = await cj('/authentication/getAccessToken', { method: 'POST', body: JSON.stringify({ apiKey: KEY }) });
  tok = { access: d.accessToken, exp: d.accessTokenExpiryDate };
  return tok.access;
}
const cache = new Map(); // 6 saat
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' }); return res.end(); }
    if (u.pathname === '/products') {
      const page = Math.min(50, Math.max(1, parseInt(u.searchParams.get('pageNum')) || 1));
      const size = Math.min(100, Math.max(1, parseInt(u.searchParams.get('pageSize')) || 100));
      const name = (u.searchParams.get('productName') || '').slice(0, 60);
      const ck = page + '|' + size + '|' + name, hit = cache.get(ck);
      if (hit && Date.now() - hit.t < 216e5) return send(res, 200, hit.b);
      const d = await cj(`/product/list?pageNum=${page}&pageSize=${size}` + (name ? '&productName=' + encodeURIComponent(name) : ''), {}, await token());
      const b = JSON.stringify({ list: (d && d.list) || [] });
      cache.set(ck, { t: Date.now(), b });
      return send(res, 200, b);
    }
    if (u.pathname === '/' || u.pathname === '/index.html') return send(res, 200, PAGE, 'text/html; charset=utf-8');
    send(res, 404, { error: 'Tapılmadı' });
  } catch (e) { send(res, 502, { error: e.message }); }
}).listen(PORT, () => console.log('GlobalAz http://localhost:' + PORT + (KEY ? '' : '  (CJ_API_KEY yoxdur)')));
