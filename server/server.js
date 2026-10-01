// Servidor do VECNA (roda no PC de casa). Sem dependências — só Node 18+.
//   node server/server.js
// Variáveis opcionais: PORT (padrão 3000), VECNA_TOKEN (exige "Authorization: Bearer <token>" em /api/*)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.VECNA_TOKEN || '';
const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).replace(/<[^>]+>/g, '').trim() : '';
};

async function fetchNews(topic, limit) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic + ' when:2d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 VECNA' } });
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  const xml = await res.text();
  return (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, limit).map(item => ({
    titulo: tag(item, 'title'),
    fonte: tag(item, 'source'),
    data: tag(item, 'pubDate'),
    link: tag(item, 'link')
  }));
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname.startsWith('/api/')) {
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'não autorizado' });
    if (url.pathname === '/api/ping') return send(res, 200, { ok: true });
    if (url.pathname === '/api/news') {
      const topics = (url.searchParams.get('topics') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
      const limit = Math.min(Number(url.searchParams.get('limit')) || 5, 10);
      if (!topics.length) return send(res, 400, { error: 'informe topics' });
      const out = {};
      await Promise.all(topics.map(async t => {
        try { out[t] = await fetchNews(t, limit); } catch (e) { out[t] = { error: e.message }; }
      }));
      return send(res, 200, out);
    }
    return send(res, 404, { error: 'rota desconhecida' });
  }

  // arquivos estáticos do PWA
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || rel.startsWith('server') || rel.startsWith('.')) return send(res, 404, 'não encontrado', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'não encontrado', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, '0.0.0.0', () => console.log(`VECNA no ar: http://localhost:${PORT}`));
