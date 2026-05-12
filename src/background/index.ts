import type { ContentMessage, IconState, ExecResponse } from '../shared/types';

self.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  console.warn('[httpOwl] Unhandled rejection:', e.reason?.message ?? e.reason);
});

// httpyac orange + lightning bolt, browser badge changes color by state
interface BadgeColors { bg: string; bar: string }
const STATE_BADGE: Record<string, BadgeColors> = {
  default: { bg: '#1e3a5f', bar: '#2563eb' },
  running: { bg: '#1e3558', bar: '#60a5fa' },
  success: { bg: '#14532d', bar: '#4ade80' },
  error:   { bg: '#7f1d1d', bar: '#f87171' },
};

async function buildImageData(state: IconState, size: number): Promise<ImageData> {
  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(size, size);
  } catch {
    // OffscreenCanvas not available — return a minimal black image
    return new ImageData(new Uint8ClampedArray(size * size * 4), size, size);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new ImageData(new Uint8ClampedArray(size * size * 4), size, size);
  }
  const c = size / 2;

  try {
    // Clip everything to circle
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();

    // httpyac orange background
    ctx.fillStyle = '#f57c00';
    ctx.fillRect(0, 0, size, size);

    // White lightning bolt
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    const boltScale = (size * 0.72) / 24;
    ctx.translate(c - 13 * boltScale, c - 13 * boltScale);
    ctx.scale(boltScale, boltScale);
    ctx.fill(new Path2D('M13 2L3 14h9l-1 8 10-12h-9l1-8z'));
    ctx.restore();

    // Browser window badge
    const badge = STATE_BADGE[state] ?? STATE_BADGE.default;
    const bw = Math.round(size * 0.48);
    const bh = Math.round(size * 0.34);
    const bx = size - bw;
    const by = size - bh;
    const tb = Math.max(2, Math.round(bh * 0.30));

    // Thin dark border
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 1, bh + 1);

    // Window body
    ctx.fillStyle = badge.bg;
    ctx.fillRect(bx, by, bw, bh);

    // Title bar (status color)
    ctx.fillStyle = badge.bar;
    ctx.fillRect(bx, by, bw, tb);

    // Three dots (classic browser chrome)
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
  } catch {
    // Native canvas operation failed — return fallback
    return new ImageData(new Uint8ClampedArray(size * size * 4), size, size);
  }
}

const _iconCache = new Map<string, Record<number, ImageData>>();

async function setIcon(state: IconState): Promise<void> {
  if (!_iconCache.has(state)) {
    const [d16, d32, d48] = await Promise.all([
      buildImageData(state, 16),
      buildImageData(state, 32),
      buildImageData(state, 48),
    ]);
    _iconCache.set(state, { 16: d16, 32: d32, 48: d48 });
  }
  await chrome.action.setIcon({ imageData: _iconCache.get(state) as Record<number, ImageData> });
}

// ── OAuth2 client_credentials ────────────────────────────────────────────────
const _tokenCache = new Map<string, { token: string; expiry: number }>();

async function getOAuthToken(prefix: string, vars: Record<string, string>): Promise<string> {
  const cached = _tokenCache.get(prefix);
  if (cached && Date.now() < cached.expiry) return cached.token;

  const endpoint = vars[`${prefix}_tokenEndpoint`];
  const clientId = vars[`${prefix}_clientId`];
  const clientSecret = vars[`${prefix}_clientSecret`];
  const scope = vars[`${prefix}_scope`];
  const useAuthHeader = vars[`${prefix}_useAuthorizationHeader`] !== 'false';

  if (!endpoint || !clientId || !clientSecret)
    throw new Error(`OAuth missing: ${prefix}_tokenEndpoint / ${prefix}_clientId / ${prefix}_clientSecret`);

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope) body.set('scope', scope);

  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
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

  const ttl = (data.expires_in ?? 3600) - 60;
  _tokenCache.set(prefix, { token: data.access_token, expiry: Date.now() + ttl * 1000 });
  return data.access_token;
}

async function executeRequest(
  request: { method: string; url: string; headers: Record<string, string>; body: string | null },
  vars: Record<string, string> = {},
): Promise<ExecResponse> {
  console.log('[httpOwl] executeRequest start', { method: request.method, url: request.url });

  // Resolve OAuth2 client_credentials before the real request
  const hdrs = { ...(request.headers || {}) };
  const authKey = Object.keys(hdrs).find(k => k.toLowerCase() === 'authorization');
  if (authKey) {
    const m = hdrs[authKey].match(/^oauth2\s+client_credentials\s+(\S+)$/i);
    if (m) {
      try {
        hdrs[authKey] = `Bearer ${await getOAuthToken(m[1], vars)}`;
      } catch (err) {
        console.warn('[httpOwl] OAuth token failure', (err as Error).message);
        return { ok: false, status: 0, statusText: (err as Error).message, headers: {}, body: '', time: 0 };
      }
    }
  }

  const start = Date.now();
  try {
    const opts: RequestInit = { method: request.method, headers: hdrs, redirect: 'follow' };
    if (request.body && !['GET', 'HEAD'].includes(request.method.toUpperCase())) {
      opts.body = request.body;
    }

    console.log('[httpOwl] executing fetch', request.url);
    const res = await fetch(request.url, opts);
    const elapsed = Date.now() - start;
    console.log('[httpOwl] fetch response', { status: res.status, ok: res.ok, time: elapsed });

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    const text = await res.text();

    return { ok: res.ok, status: res.status, statusText: res.statusText, headers: resHeaders, body: text, time: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.warn('[httpOwl] fetch error', (err as Error).message, { time: elapsed });
    return { ok: false, status: 0, statusText: (err as Error).message, headers: {}, body: '', time: elapsed };
  }
}

// ── Keyboard shortcut ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-panel') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }).catch(() => {});
    });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ContentMessage & { type: string }, _sender, reply) => {
  console.log('[httpOwl] SW onMessage received', { type: msg.type });

  if (msg.type === 'PING') {
    reply({ ok: true, timestamp: Date.now() });
    return true;
  }

  if (msg.type === 'SET_ICON') {
    setIcon(msg.state).then(() => {
      console.log('[httpOwl] SET_ICON reply ok');
      reply({ ok: true });
    }).catch(() => {
      console.warn('[httpOwl] SET_ICON reply error');
      reply({ ok: false });
    });
    return true;
  }
  if (msg.type === 'EXECUTE') {
    console.log('[httpOwl] EXECUTE handler running', { url: msg.request.url, method: msg.request.method });
    executeRequest(msg.request, msg.vars ?? {})
      .then(result => {
        console.log('[httpOwl] EXECUTE reply sending', { ok: result.ok, status: result.status, time: result.time });
        reply(result);
      })
      .catch((err) => {
        console.error('[httpOwl] EXECUTE handler error', err);
        reply({ ok: false, status: 0, statusText: 'Worker error', headers: {}, body: '', time: 0 });
      });
    return true;
  }
});

// NOTE: setIcon is intentionally NOT called at startup.
// OffscreenCanvas operations inside setIcon can crash the service worker
// process (native crash, not catchable by JS). Instead, icon is only set
// in response to SET_ICON messages from the content script (when the
// page is scanned or results change). If OffscreenCanvas fails there,
// the error is handled locally without affecting message processing.
