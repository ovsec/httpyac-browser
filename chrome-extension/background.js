const ICON_COLORS = {
  default: '#6b7280',
  running: '#3b82f6',
  success: '#22c55e',
  error:   '#ef4444',
};

async function buildImageData(state, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const r = c - 1;

  ctx.fillStyle = ICON_COLORS[state] ?? ICON_COLORS.default;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.round(size * 0.52)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', c, c + size * 0.04);

  return ctx.getImageData(0, 0, size, size);
}

async function setIcon(state) {
  const [d16, d32, d48] = await Promise.all([
    buildImageData(state, 16),
    buildImageData(state, 32),
    buildImageData(state, 48),
  ]);
  await chrome.action.setIcon({ imageData: { 16: d16, 32: d32, 48: d48 } });
}

async function executeRequest({ method, url, headers, body }) {
  const start = Date.now();
  try {
    const opts = { method, headers: headers || {}, redirect: 'follow' };
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
    setIcon(msg.state).then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === 'EXECUTE') {
    executeRequest(msg.request).then(result => reply(result));
    return true;
  }
});

setIcon('default');
