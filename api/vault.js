// Vercel Serverless Function  →  /api/vault
// التخزين: Upstash Redis (يُربط من Vercel → Storage، ويضيف المتغيرات تلقائياً)
const crypto = require('crypto');

const HASH = 'cybervault:items';
const MAX_ITEMS = 2000;

function redisCfg() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

async function redis(cmd) {
  const { url, token } = redisCfg();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'redis_error');
  return j.result;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const cut = (v, n) => String(v == null ? '' : v).slice(0, n);

function clean(it) {
  if (!it || typeof it !== 'object') return null;
  const id = cut(it.id, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return {
    id,
    title: cut(it.title, 200),
    url: cut(it.url, 500),
    email: cut(it.email, 300),
    password: cut(it.password, 1000),
    note: cut(it.note, 5000),
    updatedAt: cut(it.updatedAt, 40),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vault-key');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { url, token } = redisCfg();
  if (!url || !token) return res.status(501).json({ error: 'storage_not_configured' });

  // حماية اختيارية: إذا أضفت VAULT_KEY في Vercel يصبح الرمز مطلوباً
  const need = process.env.VAULT_KEY;
  if (need && !safeEqual(req.headers['x-vault-key'] || '', need)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', HASH])) || [];
      const items = [];
      for (let i = 0; i < flat.length; i += 2) {
        try { items.push(JSON.parse(flat[i + 1])); } catch (e) { /* skip */ }
      }
      items.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
      return res.status(200).json({ items });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const list = body && Array.isArray(body.items) ? body.items.map(clean).filter(Boolean) : [];
      if (!list.length) return res.status(400).json({ error: 'bad_request' });
      if (list.length > MAX_ITEMS) return res.status(413).json({ error: 'too_many' });
      const cmd = ['HSET', HASH];
      list.forEach((it) => cmd.push(it.id, JSON.stringify(it)));
      await redis(cmd);
      return res.status(200).json({ ok: true, saved: list.length });
    }

    if (req.method === 'DELETE') {
      const id = cut(req.query && req.query.id, 64);
      if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'bad_request' });
      await redis(['HDEL', HASH, id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
};
