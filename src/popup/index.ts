import type { Stats, RequestSummary, ReportRow } from '../shared/types';

interface EnvConfig {
  envs: Record<string, string>;
  activeEnv: string;
}

let envConfig: EnvConfig = { envs: { '$shared': '', 'default': '' }, activeEnv: 'default' };

const $ = (id: string): HTMLElement => document.getElementById(id)!;

async function getTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function rescan(): Promise<void> {
  const tab = await getTab();
  if (!tab?.id) return;
  $('rescanBtn').setAttribute('disabled', '');
  $('rescanBtn').textContent = '\u2026';
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN' }).catch(() => null);
    const stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null) as Stats | null;
    if (stats) showStats(stats);
  } finally {
    $('rescanBtn').removeAttribute('disabled');
    $('rescanBtn').textContent = 'Re-scan';
  }
}

async function runAll(): Promise<void> {
  const tab = await getTab();
  if (!tab?.id) return;
  $('runAllBtn').setAttribute('disabled', '');
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ALL' });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null) as Stats | null;
    if (res) showStats(res);
  } finally {
    $('runAllBtn').removeAttribute('disabled');
  }
}

function showStats(stats: Stats): void {
  const { total, ok, err, done = 0, requests = [] } = stats;

  $('emptyMsg').classList.toggle('hidden', total > 0);
  $('statsBar').classList.toggle('hidden', total === 0);
  $('reqList').classList.toggle('hidden', total === 0);

  $('statTotal').textContent = `${total} request${total !== 1 ? 's' : ''}`;
  if (ok > 0) { $('statOk').textContent = `\u2713 ${ok}`; $('statOk').classList.remove('hidden'); }
  else          $('statOk').classList.add('hidden');
  if (err > 0) { $('statErr').textContent = `\u2717 ${err}`; $('statErr').classList.remove('hidden'); }
  else           $('statErr').classList.add('hidden');

  $('reportBtn').classList.toggle('hidden', done === 0);
  $('runAllBtn').removeAttribute('disabled');
  if (total === 0) $('runAllBtn').setAttribute('disabled', '');
  renderRequests(requests);
}

function shortUrl(url: string): string {
  try { const u = new URL(url); return u.pathname + (u.search || ''); }
  catch { return url; }
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return String(s).replace(/"/g, '&quot;');
}

function renderRequests(requests: RequestSummary[]): void {
  const list = $('reqList');
  list.innerHTML = requests.map((r, i) => {
    const method = r.method ?? 'GET';
    const mCls = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? `rm-${method}` : 'rm-OTHER';
    const label = r.name || shortUrl(r.url);
    const running = r.state === 'running';

    let resultHtml = '';
    if (running) {
      resultHtml = '<span class="req-result run">\u21BB</span>';
    } else if (r.state) {
      const aTag = r.assertTotal > 0
        ? ` <span class="req-assert ${r.assertFail ? 'err' : 'ok'}">${r.assertFail ? `\u2717${r.assertFail}/${r.assertTotal}` : `\u2713${r.assertTotal}`}</span>`
        : '';
      if (r.ok)
        resultHtml = `<span class="req-result ok">\u2713 ${r.status} \u00B7 ${r.time}ms${aTag}</span>`;
      else
        resultHtml = `<span class="req-result err">${r.status && r.status > 0 ? `\u2717 ${r.status}` : '\u2717 ERR'}${aTag}</span>`;
    }

    return `<div class="req-row" data-index="${i}">
      <span class="rm ${mCls}">${method}</span>
      <span class="req-label" title="${escAttr(r.url)}">${escHtml(label)}</span>
      ${resultHtml}
      <button class="req-run" data-index="${i}" ${running ? 'disabled' : ''}>\u25B6</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.req-row').forEach(row => {
    const idx = parseInt((row as HTMLElement).dataset.index!, 10);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.req-run')) return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', index: idx });
      });
    });
    row.addEventListener('keydown', e => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        e.preventDefault();
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', index: idx });
        });
      }
    });
    const runBtn = row.querySelector('.req-run') as HTMLElement;
    runBtn.setAttribute('aria-label', `Run request for ${escHtml(requests[idx]?.name || shortUrl(requests[idx]?.url))}`);
    runBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const stats = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ONE', index: idx }).catch(() => null) as Stats | null;
      if (stats) showStats(stats);
    });
  });
}

// ── Report ────────────────────────────────────────────
async function generateReport(): Promise<void> {
  const tab = await getTab();
  if (!tab?.id) return;
  const data = await chrome.tabs.sendMessage(tab.id, { type: 'GET_REPORT' }).catch(() => null) as { requests: ReportRow[] } | null;
  if (!data?.requests?.length) return;

  const html = buildReportHtml(data.requests);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `http-report-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportHtml(requests: ReportRow[]): string {
  const ts = new Date().toLocaleString();
  const total = requests.length;
  const done = requests.filter(r => r.state && r.state !== 'running').length;
  const ok = requests.filter(r => r.ok).length;
  const err = requests.filter(r => r.state && !r.ok && r.state !== 'running').length;
  const notRun = total - done;

  const esc = (s: unknown): string => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fmtBody = (raw: string | null | undefined, ct?: string): string => {
    if (!raw) return '';
    if (ct?.includes('json')) { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { /* ignore */ } }
    return raw.length > 10000 ? raw.slice(0, 10000) + '\n\u2026(truncated)' : raw;
  };

  const METHOD_COLOR: Record<string, string> = { GET: '#58a6ff', POST: '#3fb950', PUT: '#d29922', DELETE: '#f85149', PATCH: '#bc8cff' };
  const METHOD_BG: Record<string, string> = { GET: '#0d419d', POST: '#14532d', PUT: '#78350f', DELETE: '#7f1d1d', PATCH: '#4c1d95' };

  const cards = requests.map(r => {
    const fg = METHOD_COLOR[r.method] || '#8b949e';
    const bg = METHOD_BG[r.method] || '#21262d';
    const ran = r.state && r.state !== 'running';
    const sc = r.status;
    const scCls = !sc ? 'net' : sc < 300 ? 's2xx' : sc < 400 ? 's3xx' : sc < 500 ? 's4xx' : 's5xx';

    const reqHdrs = Object.entries(r.resolvedHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)';

    const responseSection = !ran ? '' : (() => {
      const resHdrs = Object.entries(r.resHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)';
      const body = sc === 0 ? (r.statusText || 'Network Error') : fmtBody(r.resBody, r.resHeaders?.['content-type']);
      return `<details open><summary>Response</summary><div class="db">
        <div class="kv"><span class="k">Status</span>
          <span class="v ${scCls}">${sc === 0 ? 'Network Error' : `${sc} ${esc(r.statusText)}`}</span></div>
        ${sc && sc > 0 ? `<div class="kv"><span class="k">Time</span><span class="v">${r.time}ms</span></div>` : ''}
        <div class="sl">Headers</div><pre class="code">${esc(resHdrs)}</pre>
        ${body ? `<div class="sl">Body</div><pre class="code">${esc(body)}</pre>` : ''}
      </div></details>`;
    })();

    const assertSection = !r.assertResults?.length ? '' : (() => {
      const pass = r.assertResults.filter(a => a.pass).length;
      return `<details open><summary>Assertions <span class="${pass === r.assertResults.length ? 'ok' : 'err'}">${pass}/${r.assertResults.length}</span></summary>
        <div class="db">${r.assertResults.map(a => `
          <div class="ar">
            <span class="ai ${a.pass ? 'ok' : 'err'}">${a.pass ? '\u2713' : '\u2717'}</span>
            <span class="ae">${esc(a.expr)}</span>
            ${!a.pass ? `<span class="ag">got: <code>${esc(String(a.actual ?? 'undefined'))}</code></span>` : ''}
          </div>`).join('')}
        </div></details>`;
    })();

    const cardCls = !ran ? '' : r.ok ? 'ok' : 'err';
    const statusLabel = !ran
      ? '<span class="nr">not run</span>'
      : `<span class="sb ${r.ok ? 'ok' : 'err'}">${sc && sc > 0 ? `${sc} ${esc(r.statusText)}` : 'ERR'} \u00B7 ${r.time}ms</span>`;

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
details>summary::before{content:'\\25B6';font-size:8px;transition:transform .15s}
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
  <span>${total} request${total !== 1 ? 's' : ''}</span>
  ${ok > 0 ? `<span class="ok">\u2713 ${ok} passed</span>` : ''}
  ${err > 0 ? `<span class="err">\u2717 ${err} failed</span>` : ''}
  ${notRun > 0 ? `<span>${notRun} not run</span>` : ''}
</div>
<div class="main">${cards}</div>
</body>
</html>`;
}

// ── Variables ─────────────────────────────────────────
function parseVarText(text: string): Record<string, string> {
  const obj: Record<string, string> = {};
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

function computeVariables(): Record<string, string> {
  const shared = parseVarText(envConfig.envs['$shared'] || '');
  const active = parseVarText(envConfig.envs[envConfig.activeEnv] || '');
  return { ...shared, ...active };
}

async function saveEnvConfig(): Promise<void> {
  const merged = computeVariables();
  $('varBadge').textContent = String(Object.keys(merged).length);
  await chrome.storage.local.set({ envConfig, variables: merged });
}

function renderEnvSelect(): void {
  const sel = $('envSelect') as HTMLSelectElement;
  sel.innerHTML = Object.keys(envConfig.envs).map(name =>
    `<option value="${escAttr(name)}" ${name === envConfig.activeEnv ? 'selected' : ''}>${escHtml(name)}</option>`
  ).join('');
}

function loadActiveEnv(): void {
  ($('varEditor') as HTMLTextAreaElement).value = envConfig.envs[envConfig.activeEnv] || '';
  $('varBadge').textContent = String(Object.keys(computeVariables()).length);
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  $('rescanBtn').addEventListener('click', rescan);
  $('rescanBtn').setAttribute('aria-label', 'Re-scan page for HTTP requests');
  $('runAllBtn').addEventListener('click', runAll);
  $('runAllBtn').setAttribute('aria-label', 'Run all detected HTTP requests');
  $('reportBtn').addEventListener('click', generateReport);
  $('reportBtn').setAttribute('aria-label', 'Download HTML report');

  $('varToggle').addEventListener('click', () => {
    const hidden = $('varBody').classList.toggle('hidden');
    $('varChevron').classList.toggle('open', !hidden);
  });
  $('varToggle').setAttribute('role', 'button');
  $('varToggle').setAttribute('tabindex', '0');
  $('varToggle').setAttribute('aria-label', 'Toggle variables editor');

  ($('envSelect') as HTMLSelectElement).addEventListener('change', () => {
    envConfig.envs[envConfig.activeEnv] = ($('varEditor') as HTMLTextAreaElement).value;
    envConfig.activeEnv = ($('envSelect') as HTMLSelectElement).value;
    loadActiveEnv();
    saveEnvConfig();
  });

  ($('varEditor') as HTMLTextAreaElement).addEventListener('input', () => {
    envConfig.envs[envConfig.activeEnv] = ($('varEditor') as HTMLTextAreaElement).value;
    saveEnvConfig();
  });

  $('envAddBtn').addEventListener('click', () => {
    const name = prompt('New environment name:');
    if (!name?.trim()) return;
    const n = name.trim();
    if (envConfig.envs[n] !== undefined) { alert(`"${n}" already exists`); return; }
    envConfig.envs[envConfig.activeEnv] = ($('varEditor') as HTMLTextAreaElement).value;
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
  const stored = await chrome.storage.local.get(['envConfig', 'variables']) as { envConfig?: EnvConfig; variables?: Record<string, string> };
  if (stored.envConfig) {
    envConfig = stored.envConfig;
  } else if (stored.variables && Object.keys(stored.variables).length > 0) {
    envConfig.envs['default'] = Object.entries(stored.variables).map(([k, v]) => `${k}=${v}`).join('\n');
    await chrome.storage.local.set({ envConfig });
  }
  renderEnvSelect();
  loadActiveEnv();

  // Content script auto-runs — fetch current stats with retry
  const tab = await getTab();
  if (!tab?.id) {
    $('emptyMsg').querySelector('p')!.textContent = 'Open a web page to scan for HTTP requests';
    $('emptyMsg').classList.remove('hidden');
    return;
  }

  // Show loading state
  $('emptyMsg').querySelector('p')!.textContent = 'Scanning page for HTTP requests\u2026';
  $('emptyMsg').classList.remove('hidden');

  // Retry with backoff: 300ms, 900ms, then give up
  let stats: Stats | null = null;
  for (const delay of [300, 900]) {
    stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null) as Stats | null;
    if (stats) break;
    await new Promise(r => setTimeout(r, delay));
  }

  if (stats && stats.total > 0) {
    showStats(stats);
  } else if (stats) {
    $('emptyMsg').querySelector('p')!.textContent = 'No HTTP requests detected on this page';
    $('emptyMsg').classList.remove('hidden');
  } else {
    $('emptyMsg').querySelector('p')!.textContent = 'Could not connect to page \u2014 try reloading or navigating to a web page';
    $('emptyMsg').classList.remove('hidden');
  }
});
