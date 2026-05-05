let envConfig = { envs: { '$shared': '', 'default': '' }, activeEnv: 'default' };

const $ = id => document.getElementById(id);

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function rescan() {
  const tab = await getTab();
  $('rescanBtn').disabled = true;
  $('rescanBtn').textContent = '…';
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN' }).catch(() => null);
    const stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
    if (stats) showStats(stats);
  } finally {
    $('rescanBtn').disabled = false;
    $('rescanBtn').textContent = 'Re-scan';
  }
}

async function runAll() {
  const tab = await getTab();
  $('runAllBtn').disabled = true;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ALL' });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
    if (res) showStats(res);
  } finally {
    $('runAllBtn').disabled = false;
  }
}

function showStats(stats) {
  const { total, ok, err, done = 0, requests = [] } = stats;

  $('emptyMsg').classList.toggle('hidden', total > 0);
  $('statsBar').classList.toggle('hidden', total === 0);
  $('reqList').classList.toggle('hidden', total === 0);

  $('statTotal').textContent = `${total} request${total !== 1 ? 's' : ''}`;
  if (ok > 0) { $('statOk').textContent = `✓ ${ok}`; $('statOk').classList.remove('hidden'); }
  else          $('statOk').classList.add('hidden');
  if (err > 0) { $('statErr').textContent = `✗ ${err}`; $('statErr').classList.remove('hidden'); }
  else           $('statErr').classList.add('hidden');

  $('reportBtn').classList.toggle('hidden', done === 0);
  $('runAllBtn').disabled = total === 0;
  renderRequests(requests);
}

function renderRequests(requests) {
  const list = $('reqList');
  list.innerHTML = requests.map((r, i) => {
    const method  = r.method ?? 'GET';
    const mCls    = ['GET','POST','PUT','DELETE','PATCH'].includes(method) ? `rm-${method}` : 'rm-OTHER';
    const label   = r.name || shortUrl(r.url);
    const running = r.state === 'running';

    let resultHtml = '';
    if (running) {
      resultHtml = `<span class="req-result run">↻</span>`;
    } else if (r.state) {
      const aTag = r.assertTotal > 0
        ? ` <span class="req-assert ${r.assertFail ? 'err' : 'ok'}">${r.assertFail ? `✗${r.assertFail}/${r.assertTotal}` : `✓${r.assertTotal}`}</span>`
        : '';
      if (r.ok)
        resultHtml = `<span class="req-result ok">✓ ${r.status} · ${r.time}ms${aTag}</span>`;
      else
        resultHtml = `<span class="req-result err">${r.status > 0 ? `✗ ${r.status}` : '✗ ERR'}${aTag}</span>`;
    }

    return `<div class="req-row" data-index="${i}">
      <span class="rm ${mCls}">${method}</span>
      <span class="req-label" title="${escAttr(r.url)}">${escHtml(label)}</span>
      ${resultHtml}
      <button class="req-run" data-index="${i}" ${running ? 'disabled' : ''}>▶</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.req-row').forEach(row => {
    const idx = parseInt(row.dataset.index);
    row.addEventListener('click', e => {
      if (e.target.closest('.req-run')) return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', index: idx });
      });
    });
    row.querySelector('.req-run').addEventListener('click', async e => {
      e.stopPropagation();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const stats = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ONE', index: idx }).catch(() => null);
      if (stats) showStats(stats);
    });
  });
}

function shortUrl(url) {
  try { const u = new URL(url); return u.pathname + (u.search || ''); }
  catch { return url; }
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}

// ── Report ────────────────────────────────────────────
async function generateReport() {
  const tab  = await getTab();
  const data = await chrome.tabs.sendMessage(tab.id, { type: 'GET_REPORT' }).catch(() => null);
  if (!data?.requests?.length) return;

  const html = buildReportHtml(data.requests);
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `http-report-${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportHtml(requests) {
  const ts     = new Date().toLocaleString();
  const total  = requests.length;
  const done   = requests.filter(r => r.state && r.state !== 'running').length;
  const ok     = requests.filter(r => r.ok).length;
  const err    = requests.filter(r => r.state && !r.ok && r.state !== 'running').length;
  const notRun = total - done;

  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const fmtBody = (raw, ct) => {
    if (!raw) return '';
    if (ct?.includes('json')) { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch (_) {} }
    return raw.length > 10000 ? raw.slice(0, 10000) + '\n…(truncated)' : raw;
  };

  const METHOD_COLOR = { GET:'#58a6ff', POST:'#3fb950', PUT:'#d29922', DELETE:'#f85149', PATCH:'#bc8cff' };
  const METHOD_BG    = { GET:'#0d419d', POST:'#14532d', PUT:'#78350f', DELETE:'#7f1d1d', PATCH:'#4c1d95' };

  const cards = requests.map(r => {
    const fg  = METHOD_COLOR[r.method] || '#8b949e';
    const bg  = METHOD_BG[r.method]    || '#21262d';
    const ran = r.state && r.state !== 'running';
    const sc  = r.status;
    const scCls = !sc ? 'net' : sc < 300 ? 's2xx' : sc < 400 ? 's3xx' : sc < 500 ? 's4xx' : 's5xx';

    const reqHdrs = Object.entries(r.resolvedHeaders || {}).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)';

    const responseSection = !ran ? '' : (() => {
      const resHdrs = Object.entries(r.resHeaders || {}).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)';
      const body    = sc === 0 ? (r.statusText || 'Network Error') : fmtBody(r.resBody, r.resHeaders?.['content-type']);
      return `<details open><summary>Response</summary><div class="db">
        <div class="kv"><span class="k">Status</span>
          <span class="v ${scCls}">${sc === 0 ? 'Network Error' : `${sc} ${esc(r.statusText)}`}</span></div>
        ${sc > 0 ? `<div class="kv"><span class="k">Time</span><span class="v">${r.time}ms</span></div>` : ''}
        <div class="sl">Headers</div><pre class="code">${esc(resHdrs)}</pre>
        ${body ? `<div class="sl">Body</div><pre class="code">${esc(body)}</pre>` : ''}
      </div></details>`;
    })();

    const assertSection = !r.assertResults?.length ? '' : (() => {
      const pass = r.assertResults.filter(a => a.pass).length;
      return `<details open><summary>Assertions <span class="${pass===r.assertResults.length?'ok':'err'}">${pass}/${r.assertResults.length}</span></summary>
        <div class="db">${r.assertResults.map(a => `
          <div class="ar">
            <span class="ai ${a.pass?'ok':'err'}">${a.pass?'✓':'✗'}</span>
            <span class="ae">${esc(a.expr)}</span>
            ${!a.pass ? `<span class="ag">got: <code>${esc(String(a.actual??'undefined'))}</code></span>` : ''}
          </div>`).join('')}
        </div></details>`;
    })();

    const cardCls = !ran ? '' : r.ok ? 'ok' : 'err';
    const statusLabel = !ran
      ? '<span class="nr">not run</span>'
      : `<span class="sb ${r.ok?'ok':'err'}">${sc > 0 ? `${sc} ${esc(r.statusText)}` : 'ERR'} · ${r.time}ms</span>`;

    return `<div class="card ${cardCls}">
      <div class="ch">
        <span class="badge" style="background:${bg}22;color:${fg}">${esc(r.method)}</span>
        ${r.name ? `<span class="rn">${esc(r.name)}</span>` : ''}
        <span class="ru" title="${esc(r.resolvedUrl)}">${esc(r.resolvedUrl)}</span>
        ${statusLabel}
      </div>
      <details><summary>Request</summary><div class="db">
        <div class="kv"><span class="k">URL</span><span class="v mono">${esc(r.resolvedUrl)}</span></div>
        <div class="sl">Headers</div><pre class="code">${esc(reqHdrs)}</pre>
        ${r.resolvedBody ? `<div class="sl">Body</div><pre class="code">${esc(r.resolvedBody)}</pre>` : ''}
      </div></details>
      ${responseSection}
      ${assertSection}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>httpOwl Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;min-height:100vh}
.rh{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;align-items:baseline;gap:16px}
.rt{font-size:18px;font-weight:600}
.rts{color:#8b949e;font-size:12px}
.sum{display:flex;gap:20px;padding:10px 24px;border-bottom:1px solid #21262d;font-size:12px;color:#8b949e}
.sum .ok{color:#3fb950}.sum .err{color:#f85149}
.main{padding:20px 24px;max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.card.ok{border-color:rgba(63,185,80,.4)}.card.err{border-color:rgba(248,81,73,.4)}
.ch{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0d1117;flex-wrap:wrap}
.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;font-family:monospace;letter-spacing:.05em;flex-shrink:0}
.rn{color:#8b949e;font-size:11.5px;flex-shrink:0}
.ru{font-family:'Cascadia Code',Consolas,monospace;font-size:12px;color:#e6edf3;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sb{font-size:11px;font-family:monospace;flex-shrink:0}
.sb.ok{color:#3fb950}.sb.err{color:#f85149}
.nr{font-size:11px;color:#6b7280;flex-shrink:0;font-style:italic}
details{border-top:1px solid #21262d}
details>summary{padding:8px 14px;font-size:11px;font-weight:600;color:#8b949e;cursor:pointer;letter-spacing:.07em;text-transform:uppercase;user-select:none;list-style:none;display:flex;align-items:center;gap:8px}
details>summary::-webkit-details-marker{display:none}
details>summary::before{content:'▶';font-size:8px;transition:transform .15s}
details[open]>summary::before{transform:rotate(90deg)}
details[open]>summary{color:#c9d1d9}
.db{padding:10px 14px 14px;display:flex;flex-direction:column;gap:8px}
.kv{display:grid;grid-template-columns:90px 1fr;gap:6px}
.k{color:#8b949e;font-size:12px}.v{font-size:12px;word-break:break-all}
.v.mono{font-family:'Cascadia Code',Consolas,monospace}
.sl{font-size:10.5px;color:#6b7280;font-weight:500;margin-top:2px}
.s2xx{color:#3fb950}.s3xx{color:#58a6ff}.s4xx{color:#d29922}.s5xx{color:#f85149}.net{color:#8b949e}
.ok{color:#3fb950}.err{color:#f85149}
pre.code{background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 10px;font-family:'Cascadia Code','Fira Code',Consolas,monospace;font-size:11px;color:#e6edf3;white-space:pre-wrap;word-break:break-all;max-height:320px;overflow-y:auto;line-height:1.55}
.ar{display:flex;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid #21262d;font-size:12px}
.ar:last-child{border-bottom:none}
.ai{font-weight:700;font-size:12px;flex-shrink:0}.ai.ok{color:#3fb950}.ai.err{color:#f85149}
.ae{font-family:monospace;font-size:11px;color:#c9d1d9}
.ag{font-size:10.5px;color:#8b949e;margin-left:auto}
.ag code{color:#f85149;background:#21262d;padding:1px 4px;border-radius:3px;font-size:10px}
</style>
</head>
<body>
<div class="rh"><span class="rt">httpOwl Report</span><span class="rts">${esc(ts)}</span></div>
<div class="sum">
  <span>${total} request${total!==1?'s':''}</span>
  ${ok>0?`<span class="ok">✓ ${ok} passed</span>`:''}
  ${err>0?`<span class="err">✗ ${err} failed</span>`:''}
  ${notRun>0?`<span>${notRun} not run</span>`:''}
</div>
<div class="main">${cards}</div>
</body>
</html>`;
}

// ── Variables ─────────────────────────────────────────
function parseVarText(text) {
  const obj = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k) obj[k] = v;
    }
  }
  return obj;
}

function computeVariables() {
  const shared = parseVarText(envConfig.envs['$shared'] || '');
  const active = parseVarText(envConfig.envs[envConfig.activeEnv] || '');
  return { ...shared, ...active };
}

async function saveEnvConfig() {
  const merged = computeVariables();
  $('varBadge').textContent = Object.keys(merged).length;
  await chrome.storage.local.set({ envConfig, variables: merged });
}

function renderEnvSelect() {
  const sel = $('envSelect');
  sel.innerHTML = Object.keys(envConfig.envs).map(name =>
    `<option value="${escAttr(name)}" ${name === envConfig.activeEnv ? 'selected' : ''}>${escHtml(name)}</option>`
  ).join('');
}

function loadActiveEnv() {
  $('varEditor').value = envConfig.envs[envConfig.activeEnv] || '';
  $('varBadge').textContent = Object.keys(computeVariables()).length;
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  $('rescanBtn').addEventListener('click', rescan);
  $('runAllBtn').addEventListener('click', runAll);
  $('reportBtn').addEventListener('click', generateReport);

  $('varToggle').addEventListener('click', () => {
    const hidden = $('varBody').classList.toggle('hidden');
    $('varChevron').classList.toggle('open', !hidden);
  });

  $('envSelect').addEventListener('change', () => {
    envConfig.envs[envConfig.activeEnv] = $('varEditor').value;
    envConfig.activeEnv = $('envSelect').value;
    loadActiveEnv();
    saveEnvConfig();
  });

  $('varEditor').addEventListener('input', () => {
    envConfig.envs[envConfig.activeEnv] = $('varEditor').value;
    saveEnvConfig();
  });

  $('envAddBtn').addEventListener('click', () => {
    const name = prompt('New environment name:');
    if (!name?.trim()) return;
    const n = name.trim();
    if (envConfig.envs[n] !== undefined) { alert(`"${n}" already exists`); return; }
    envConfig.envs[envConfig.activeEnv] = $('varEditor').value;
    envConfig.envs[n] = '';
    envConfig.activeEnv = n;
    renderEnvSelect();
    loadActiveEnv();
    saveEnvConfig();
  });

  $('envDelBtn').addEventListener('click', () => {
    const active = envConfig.activeEnv;
    if (active === '$shared') { alert('Cannot delete $shared'); return; }
    if (Object.keys(envConfig.envs).length <= 1) { alert('Cannot delete the only environment'); return; }
    if (!confirm(`Delete environment "${active}"?`)) return;
    delete envConfig.envs[active];
    envConfig.activeEnv = Object.keys(envConfig.envs)[0];
    renderEnvSelect();
    loadActiveEnv();
    saveEnvConfig();
  });

  // Restore env config (migrate from old flat variables if needed)
  const stored = await chrome.storage.local.get(['envConfig', 'variables']);
  if (stored.envConfig) {
    envConfig = stored.envConfig;
  } else if (stored.variables && Object.keys(stored.variables).length > 0) {
    envConfig.envs['default'] = Object.entries(stored.variables).map(([k, v]) => `${k}=${v}`).join('\n');
    await chrome.storage.local.set({ envConfig });
  }
  renderEnvSelect();
  loadActiveEnv();

  // Content script auto-runs — fetch current stats
  const tab = await getTab();
  if (!tab) { $('emptyMsg').classList.remove('hidden'); return; }

  let stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
  if (!stats) {
    // Content script may not be ready yet (SPA nav, slow inject) — retry once
    await new Promise(r => setTimeout(r, 700));
    stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
  }
  if (stats) showStats(stats);
  else $('emptyMsg').classList.remove('hidden');
});
