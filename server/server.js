// Servidor do VECNA (roda no PC de casa). Sem dependências — só Node 18+.
//   node server/server.js
// Variáveis opcionais: PORT (padrão 3000), VECNA_TOKEN (exige "Authorization: Bearer <token>" em /api/*)
// Gmail: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (veja server/README.md). O VECNA só LÊ emails e cria RASCUNHOS.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.VECNA_TOKEN || '';
const ROOT = path.join(__dirname, '..');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT = `http://localhost:${PORT}/auth/google/callback`;
const TOKEN_FILE = path.join(__dirname, '.google-token.json');
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose';
let oauthState = '';
let access = { token: '', exp: 0 };
const YT_KEY = process.env.YOUTUBE_API_KEY || '';
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

// ---------- Música (YouTube) ----------
// Com YOUTUBE_API_KEY usa a API oficial; sem ela, lê a página de resultados do YouTube (menos estável).
async function searchMusic(q) {
  if (YT_KEY) {
    const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=5&q=${encodeURIComponent(q)}&key=${YT_KEY}`;
    const res = await fetch(u);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error?.message || `YouTube ${res.status}`);
    return (d.items || []).map(i => ({ id: i.id.videoId, titulo: decode(i.snippet.title), canal: i.snippet.channelTitle }));
  }
  const res = await fetch('https://www.youtube.com/results?hl=pt-BR&search_query=' + encodeURIComponent(q), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' }
  });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  const html = await res.text();
  const out = [], seen = new Set();
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 5) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    let titulo = m[2];
    try { titulo = JSON.parse('"' + m[2] + '"'); } catch {}
    out.push({ id: m[1], titulo, canal: '' });
  }
  if (!out.length) throw new Error('Nenhum resultado (o YouTube pode ter mudado a página; use YOUTUBE_API_KEY).');
  return out;
}

// ---------- Gmail ----------
const savedRefresh = () => { try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).refresh_token; } catch { return ''; } };

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `OAuth ${res.status}`);
  return data;
}

async function gmailToken() {
  if (access.token && Date.now() < access.exp - 60000) return access.token;
  const refresh = savedRefresh();
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Gmail não configurado no servidor (GOOGLE_CLIENT_ID/SECRET).');
  if (!refresh) throw new Error('Gmail não autorizado. Abra http://localhost:' + PORT + '/auth/google no PC de casa.');
  const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  access = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return access.token;
}

async function gmail(pathAndQuery, opts = {}) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + pathAndQuery, {
    ...opts,
    headers: { Authorization: 'Bearer ' + await gmailToken(), 'Content-Type': 'application/json' }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Gmail ${res.status}`);
  return data;
}

const header = (msg, name) => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function bodyText(payload) {
  const parts = [];
  (function walk(p) {
    if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType || '')) parts.push({ type: p.mimeType, text: b64(p.body.data) });
    (p.parts || []).forEach(walk);
  })(payload || {});
  const plain = parts.find(p => p.type === 'text/plain') || parts[0];
  if (!plain) return '';
  return (plain.type === 'text/html' ? decode(plain.text.replace(/<(style|script)[\s\S]*?<\/\1>/g, '').replace(/<br\s*\/?>|<\/p>/g, '\n').replace(/<[^>]+>/g, '')) : plain.text)
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

async function listInbox(q, max) {
  const list = await gmail(`messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return Promise.all((list.messages || []).map(async m => {
    const msg = await gmail(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    return { id: m.id, de: header(msg, 'From'), assunto: header(msg, 'Subject'), data: header(msg, 'Date'), resumo: msg.snippet, naoLido: (msg.labelIds || []).includes('UNREAD') };
  }));
}

async function readMessage(id) {
  const msg = await gmail(`messages/${encodeURIComponent(id)}?format=full`);
  return { id, de: header(msg, 'From'), para: header(msg, 'To'), assunto: header(msg, 'Subject'), data: header(msg, 'Date'), corpo: bodyText(msg.payload) };
}

// Cria RASCUNHO (nunca envia). Se replyToId vier, o rascunho entra na mesma conversa.
async function createDraft({ to, subject, body, replyToId }) {
  const headers = [`To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8'];
  let threadId;
  if (replyToId) {
    const orig = await gmail(`messages/${encodeURIComponent(replyToId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
    const mid = header(orig, 'Message-ID');
    threadId = orig.threadId;
    if (mid) headers.push(`In-Reply-To: ${mid}`, `References: ${(header(orig, 'References') + ' ' + mid).trim()}`);
  }
  const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const d = await gmail('drafts', { method: 'POST', body: JSON.stringify({ message: { raw, ...(threadId && { threadId }) } }) });
  return { ok: true, rascunhoId: d.id, aviso: 'Rascunho criado no Gmail. NÃO foi enviado.' };
}

const readBody = req => new Promise((resolve, reject) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
});

const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  // Autorização do Gmail: só pelo próprio PC (localhost), uma única vez.
  if (url.pathname === '/auth/google' || url.pathname === '/auth/google/callback') {
    if (!isLocal(req)) return send(res, 403, 'Abra esta página no PC de casa, via localhost.', 'text/plain');
    if (!CLIENT_ID || !CLIENT_SECRET) return send(res, 500, 'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET antes de iniciar o servidor.', 'text/plain');
    if (url.pathname === '/auth/google') {
      oauthState = require('crypto').randomBytes(16).toString('hex');
      const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', state: oauthState });
      res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
      return res.end();
    }
    try {
      if (!oauthState || url.searchParams.get('state') !== oauthState) throw new Error('state inválido');
      const d = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: REDIRECT });
      if (!d.refresh_token) throw new Error('Google não devolveu refresh_token; tente de novo.');
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: d.refresh_token }), { mode: 0o600 });
      access = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
      oauthState = '';
      return send(res, 200, 'Gmail conectado ao VECNA. Pode fechar esta aba.', 'text/plain; charset=utf-8');
    } catch (e) { return send(res, 400, 'Falha: ' + e.message, 'text/plain; charset=utf-8'); }
  }

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
    if (url.pathname === '/api/music/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
      if (!q) return send(res, 400, { error: 'informe q' });
      try { return send(res, 200, await searchMusic(q)); } catch (e) { return send(res, 502, { error: e.message }); }
    }
    if (url.pathname.startsWith('/api/mail/')) {
      try {
        if (url.pathname === '/api/mail/inbox') return send(res, 200, await listInbox(url.searchParams.get('q') || 'in:inbox newer_than:2d', Math.min(Number(url.searchParams.get('max')) || 10, 20)));
        if (url.pathname === '/api/mail/message') return send(res, 200, await readMessage(url.searchParams.get('id') || ''));
        if (url.pathname === '/api/mail/draft' && req.method === 'POST') {
          const d = await readBody(req);
          if (!d.to || !d.body) return send(res, 400, { error: 'to e body são obrigatórios' });
          return send(res, 200, await createDraft(d));
        }
      } catch (e) { return send(res, 502, { error: e.message }); }
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
