self.addEventListener('unhandledrejection', e => e.preventDefault());

// httpyac orange + lightning bolt, browser badge changes color by state
const STATE_BADGE = {
  default: { bg: '#1e3a5f', bar: '#2563eb' },
  running: { bg: '#1e3558', bar: '#60a5fa' },
  success: { bg: '#14532d', bar: '#4ade80' },
  error:   { bg: '#7f1d1d', bar: '#f87171' },
};

async function buildImageData(state, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const c      = size / 2;

  // Clip everything to circle
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.clip();

  // httpyac orange background
  ctx.fillStyle = '#f57c00';
  ctx.fillRect(0, 0, size, size);

  // White lightning bolt — SVG path M13 2L3 14h9l-1 8 10-12h-9l1-8z (24×24 viewBox)
  // Shift bolt slightly up-left so badge doesn't cover it
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  const boltScale = (size * 0.72) / 24;
  ctx.translate(c - 13 * boltScale, c - 13 * boltScale);
  ctx.scale(boltScale, boltScale);
  ctx.fill(new Path2D('M13 2L3 14h9l-1 8 10-12h-9l1-8z'));
  ctx.restore();

  // Browser window badge — bottom-right, overlays the circle clip
  const badge = STATE_BADGE[state] ?? STATE_BADGE.default;
  const bw  = Math.round(size * 0.48);
  const bh  = Math.round(size * 0.34);
  const bx  = size - bw;
  const by  = size - bh;
  const tb  = Math.max(2, Math.round(bh * 0.30));  // title bar height

  // Thin dark border for contrast against orange
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx - 1, by - 1, bw + 1, bh + 1);

  // Window body
  ctx.fillStyle = badge.bg;
  ctx.fillRect(bx, by, bw, bh);

  // Title bar (status color)
  ctx.fillStyle = badge.bar;
  ctx.fillRect(bx, by, bw, tb);

  // Three dots on title bar (classic browser chrome)
  if (size >= 32) {
    const dr = Math.max(1, tb * 0.28);
    const dy = by + tb / 2;
    ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.35)'].forEach((col, idx) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(bx + dr * 2 + idx * (dr * 2.5), dy, dr, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  return ctx.getImageData(0, 0, size, size);
}

const _iconCache = new Map();

async function setIcon(state) {
  if (!_iconCache.has(state)) {
    const [d16, d32, d48] = await Promise.all([
      buildImageData(state, 16),
      buildImageData(state, 32),
      buildImageData(state, 48),
    ]);
    _iconCache.set(state, { 16: d16, 32: d32, 48: d48 });
  }
  await chrome.action.setIcon({ imageData: _iconCache.get(state) });
}

// ── OAuth2 client_credentials ─────────────────────────────────────────────────
const _tokenCache = new Map(); // prefix → { token, expiry }

async function getOAuthToken(prefix, vars) {
  const cached = _tokenCache.get(prefix);
  if (cached && Date.now() < cached.expiry) return cached.token;

  const endpoint      = vars[`${prefix}_tokenEndpoint`];
  const clientId      = vars[`${prefix}_clientId`];
  const clientSecret  = vars[`${prefix}_clientSecret`];
  const scope         = vars[`${prefix}_scope`];
  const useAuthHeader = vars[`${prefix}_useAuthorizationHeader`] !== 'false';

  if (!endpoint || !clientId || !clientSecret)
    throw new Error(`OAuth missing: ${prefix}_tokenEndpoint / ${prefix}_clientId / ${prefix}_clientSecret`);

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope) body.set('scope', scope);

  const reqHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (useAuthHeader) {
    reqHeaders['Authorization'] = 'Basic ' + btoa(`${clientId}:${clientSecret}`);
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const res = await fetch(endpoint, { method: 'POST', headers: reqHeaders, body: body.toString() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token endpoint ${res.status}${text ? ': ' + text.slice(0, 120) : ''}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('Token response missing access_token');

  const ttl = (data.expires_in ?? 3600) - 60; // 60s buffer
  _tokenCache.set(prefix, { token: data.access_token, expiry: Date.now() + ttl * 1000 });
  return data.access_token;
}

async function executeRequest({ method, url, headers, body }, vars = {}) {
  // Resolve OAuth2 client_credentials before the real request
  let hdrs = { ...(headers || {}) };
  const authKey = Object.keys(hdrs).find(k => k.toLowerCase() === 'authorization');
  if (authKey) {
    const m = hdrs[authKey].match(/^oauth2\s+client_credentials\s+(\S+)$/i);
    if (m) {
      try {
        hdrs[authKey] = `Bearer ${await getOAuthToken(m[1], vars)}`;
      } catch (err) {
        return { ok: false, status: 0, statusText: err.message, headers: {}, body: '', time: 0 };
      }
    }
  }

  const start = Date.now();
  try {
    const opts = { method, headers: hdrs, redirect: 'follow' };
    if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      opts.body = body;
    }

    const res = await fetch(url, opts);
    const elapsed = Date.now() - start;

    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    const text = await res.text();

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body: text,
      time: elapsed,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: err.message,
      headers: {},
      body: '',
      time: Date.now() - start,
    };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'SET_ICON') {
    setIcon(msg.state).then(() => reply({ ok: true })).catch(() => reply({ ok: false }));
    return true;
  }
  if (msg.type === 'EXECUTE') {
    executeRequest(msg.request, msg.vars ?? {})
      .then(result => reply(result))
      .catch(() => reply({ ok: false, status: 0, statusText: 'Worker error', headers: {}, body: '', time: 0 }));
    return true;
  }
});

setIcon('default').catch(() => {});
