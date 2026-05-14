import type { Stats, Block, ReportRow } from '../shared/types';
import { registry, runOne, getStats, flatEntry } from './runner';
import { injectAll } from './inject';
import { subscribeVarsChanged, hasUnresolvedVars, getCachedVars, applyVars } from './variables';
import sidepanelCss from './sidepanel.css?raw';

// ── State ──────────────────────────────────────────────────────────────
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let isOpen = false;
let activeTab: 'requests' | 'variables' | 'about' = 'requests';
let isRunningAll = false;
let isRescanning = false;
let selectedIndices = new Set<number>();
let methodFilter = 'ALL';

interface EnvConfig {
  envs: Record<string, string>;
  activeEnv: string;
}
let envConfig: EnvConfig = { envs: { $shared: '', default: '' }, activeEnv: 'default' };

// ── Helpers ────────────────────────────────────────────────────────────
function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s: string): string {
  return String(s).replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}
function shortUrl(url: string): string {
  try { const u = new URL(url); return u.pathname + (u.search || ''); }
  catch { return url; }
}
function $(sel: string): HTMLElement | null {
  return shadow?.querySelector(sel) as HTMLElement | null;
}

// ── HTML escape helpers for Unicode symbols ────────────────────────────
const SYM_CHECK   = '\u2713';
const SYM_CROSS   = '\u2717';
const SYM_RUN     = '\u25B6';
const SYM_SPIN    = '\u21BB';
const SYM_PLUS    = '+';
const SYM_MINUS   = '\u2212';
const SYM_CLOSE   = '\u2715';
const SYM_HOUSE   = '\u2302';
const SYM_WARN    = '\u26A0';
const SYM_DOWN    = '\u2193';

// ── Initialise ─────────────────────────────────────────────────────────
export function createSidepanel(): void {
  if (host) return;

  host = document.createElement('div');
  host.style.cssText = 'all:initial;display:block;position:static;';
  shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `<style>${sidepanelCss}</style>
    <div class="tab" role="button" tabindex="0" aria-label="Toggle httpOwl side panel">
      <span class="tab-icon">HO</span>
      <span class="tab-count">0</span>
      <span class="tab-dot idle"></span>
    </div>
    <div class="backdrop hidden"></div>
    <div class="drawer">
      <div class="header">
        <span class="header-title">http<span>Owl</span></span>
        <span class="header-stats"></span>
        <button class="close-btn" aria-label="Close side panel">${SYM_CLOSE}</button>
      </div>
      <div class="tabs">
        <button class="tab-btn active" data-tab="requests">Requests</button>
        <button class="tab-btn" data-tab="variables">Variables</button>
        <button class="tab-btn" data-tab="about">About</button>
      </div>
      <div class="tab-content" id="tab-requests">
        <div class="stats-bar"></div>
        <div class="action-bar">
          <select class="method-filter" aria-label="Filter by HTTP method">
            <option value="ALL">All</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
            <option value="OTHER">OTHER</option>
          </select>
          <button class="action-btn run-all" aria-label="Run all requests">${SYM_RUN} Run All</button>
          <button class="action-btn run-selected" aria-label="Run selected requests" disabled>${SYM_RUN} Sel</button>
          <button class="action-btn rescan" aria-label="Re-scan page" title="Re-scan">${SYM_SPIN}</button>
          <button class="action-btn report" aria-label="Download HTML report" title="Download HTML report">${SYM_DOWN}</button>
        </div>
        <div class="request-list"></div>
      </div>
        <div class="tab-content hidden" id="tab-variables">
        <div class="env-bar">
          <select class="env-select" aria-label="Select environment"></select>
          <button class="env-btn add" aria-label="Add environment">${SYM_PLUS}</button>
          <button class="env-btn del" aria-label="Delete environment">${SYM_MINUS}</button>
        </div>
        <div class="var-editor-wrap">
          <textarea class="var-editor" placeholder="KEY=value&#10;API_KEY=abc123&#10;BASE_URL=https://api.example.com" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="tab-content hidden" id="tab-about">
        <div class="about-section">
          <div class="about-title">http<span>Owl</span></div>
          <div class="about-version">v1.0.3</div>
          <p class="about-desc">
            Browser companion for <a href="https://httpyac.github.io" target="_blank" rel="noopener">httpYac</a>
            &mdash; runs <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>DELETE</code>, <code>PATCH</code>
            requests and evaluates <code>??</code> assertions directly on any webpage.
          </p>
          <hr class="about-hr">
          <div class="about-sub">Known Limitations</div>
          <ul class="about-list">
            <li>No response variable capture (<code>@variable</code>) &mdash; cannot chain requests by extracting values from responses.</li>
            <li>No script block support &mdash; httpYac <code>&lt;script&gt;</code> blocks for custom JS logic are not executed.</li>
            <li>Only OAuth2 <code>client_credentials</code> is supported &mdash; authorization code, PKCE, implicit, and AWS Signature flows are not implemented.</li>
            <li>No request chaining &mdash; requests run independently; results from one cannot feed into another.</li>
            <li>Body truncated at 5&thinsp;000 characters in the detail overlay (full body still used for assertions).</li>
            <li>Some servers may reject requests even with extension-origin fetch due to strict CORS or security policies.</li>
            <li>Load testing is not supported &mdash; this is a debugging tool, not a benchmarking tool.</li>
          </ul>
        </div>
      </div>
    </div>`;

  // Append to body
  document.body.appendChild(host);

  // ── Bind events ──────────────────────────────────────────────────────
  // Tab click → toggle drawer
  const tabEl = $('.tab')!;
  tabEl.addEventListener('click', toggleDrawer);
  tabEl.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') { e.preventDefault(); toggleDrawer(); }
  });

  // Close button
  $('.close-btn')!.addEventListener('click', closeDrawer);

  // Backdrop click → close
  $('.backdrop')!.addEventListener('click', closeDrawer);

  // Escape key → close
  document.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape' && isOpen) closeDrawer();
  });

  // Tab switching
  $('.tabs')!.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('.tab-btn') as HTMLElement | null;
    if (!btn) return;
    const tab = btn.dataset.tab as 'requests' | 'variables';
    if (tab === activeTab) return;
    activeTab = tab;
    // Update tab button styles
    $('.tabs')!.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show/hide content panels
    const reqPanel = $('#tab-requests')!;
    const varPanel = $('#tab-variables')!;
    const aboutPanel = $('#tab-about')!;
    reqPanel.classList.toggle('hidden', tab !== 'requests');
    varPanel.classList.toggle('hidden', tab !== 'variables');
    aboutPanel.classList.toggle('hidden', tab !== 'about');
    if (tab === 'variables') loadVariablesTab();
  });

  // Run All
  $('.action-btn.run-all')!.addEventListener('click', runAllRequests);

  // Run Selected
  $('.action-btn.run-selected')!.addEventListener('click', runSelectedRequests);

  // Method filter
  $('.method-filter')!.addEventListener('change', handleFilterChange);

  // Re-scan
  $('.action-btn.rescan')!.addEventListener('click', rescanPage);

  // Report
  $('.action-btn.report')!.addEventListener('click', generateReport);

  // Variables: env select change
  $('.env-select')!.addEventListener('change', onEnvChange);

  // Variables: editor input
  const varEditor = $('.var-editor') as HTMLTextAreaElement | null;
  varEditor?.addEventListener('input', onVarEditorInput);

  // Variables: add env
  $('.env-btn.add')!.addEventListener('click', addEnvironment);

  // Variables: delete env
  $('.env-btn.del')!.addEventListener('click', deleteEnvironment);

  // Re-highlight + re-render request list on variable changes from external sources
  subscribeVarsChanged(() => {
    if (isOpen) {
      if (activeTab === 'variables') loadVariablesTab();
      renderSidepanel(); // re-render requests to update unresolved var states
    }
  });

  // Keyboard shortcut (Ctrl+Shift+H) forwarded from background
  chrome.runtime.onMessage.addListener((msg: Record<string, unknown>) => {
    if (msg.type === 'TOGGLE_PANEL') toggleDrawer();
  });

  // Initial render
  renderTab();
}

// ── Toggle ─────────────────────────────────────────────────────────────
function toggleDrawer(): void {
  isOpen = !isOpen;
  $('.drawer')!.classList.toggle('open', isOpen);
  $('.backdrop')!.classList.toggle('hidden', !isOpen);
  if (isOpen) {
    renderDrawerContent();
    if (activeTab === 'variables') loadVariablesTab();
  }
}

function closeDrawer(): void {
  if (!isOpen) return;
  isOpen = false;
  $('.drawer')!.classList.remove('open');
  $('.backdrop')!.classList.add('hidden');
}

// ── Render ─────────────────────────────────────────────────────────────
export function renderSidepanel(): void {
  renderTab();
  if (isOpen) renderDrawerContent();
}

function renderTab(): void {
  const stats = getStats();
  const tabEl = $('.tab');
  const countEl = $('.tab-count');
  const dotEl = $('.tab-dot');
  if (tabEl) tabEl.classList.toggle('hidden', stats.total === 0);
  if (countEl) countEl.textContent = String(stats.total);
  if (dotEl) {
    dotEl.className = 'tab-dot';
    if (isRunningAll || stats.requests.some(r => r.state === 'running')) dotEl.classList.add('scan');
    else if (stats.err > 0) dotEl.classList.add('err');
    else if (stats.ok > 0) dotEl.classList.add('ok');
    else dotEl.classList.add('idle');
  }
}

function renderDrawerContent(): void {
  renderRequestsTab();
  renderTab();
}

function renderRequestsTab(): void {
  const stats = getStats();

  // Header stats
  const hdr = $('.header-stats');
  if (hdr) {
    const parts: string[] = [];
    if (stats.total > 0) parts.push(`${stats.total} req`);
    if (stats.ok > 0) parts.push(`<span class="ok">${SYM_CHECK} ${stats.ok}</span>`);
    if (stats.err > 0) parts.push(`<span class="err">${SYM_CROSS} ${stats.err}</span>`);
    hdr.innerHTML = parts.join(' \u00A0');
  }

  // Stats bar
  const statsBar = $('.stats-bar');
  if (statsBar) {
    statsBar.innerHTML = `
      <span class="stat-item">Total: ${stats.total}</span>
      ${stats.ok > 0 ? `<span class="stat-item ok">${SYM_CHECK} ${stats.ok}</span>` : ''}
      ${stats.err > 0 ? `<span class="stat-item err">${SYM_CROSS} ${stats.err}</span>` : ''}
      ${selectedIndices.size > 0 ? `<span class="stat-item">Selected: ${selectedIndices.size}</span>` : ''}
    `;
  }

  // Action buttons
  const runAllBtn = $('.action-btn.run-all') as HTMLButtonElement | null;
  const runSelBtn = $('.action-btn.run-selected') as HTMLButtonElement | null;
  const rescanBtn = $('.action-btn.rescan') as HTMLButtonElement | null;
  if (runAllBtn) {
    runAllBtn.disabled = isRunningAll || stats.total === 0;
    runAllBtn.textContent = isRunningAll ? `${SYM_SPIN} Running\u2026` : `${SYM_RUN} Run All`;
  }
  if (runSelBtn) {
    runSelBtn.disabled = selectedIndices.size === 0 || isRunningAll;
    runSelBtn.textContent = isRunningAll ? `${SYM_SPIN}` : `${SYM_RUN} Sel`;
  }
  if (rescanBtn) {
    rescanBtn.disabled = isRescanning;
    rescanBtn.textContent = isRescanning ? `${SYM_SPIN}` : `${SYM_SPIN}`;
  }
  const reportBtn = $('.action-btn.report') as HTMLButtonElement | null;
  if (reportBtn) {
    reportBtn.disabled = stats.done === 0;
  }

  // Error state
  if (!stats.total && !isRescanning) {
    const list = $('.request-list');
    if (list) {
      list.innerHTML = `<div class="empty-state"><div class="icon">${SYM_HOUSE}</div><div>No HTTP requests detected</div></div>`;
    }
    return;
  }

  // Filter and render
  const filtered = stats.requests.filter((r, i) => {
    if (methodFilter === 'ALL') return true;
    if (methodFilter === 'OTHER') return !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method ?? 'GET');
    return (r.method ?? 'GET') === methodFilter;
  });

  // Remove selected indices that are no longer visible
  const visibleIndices = new Set(filtered.map(r => stats.requests.indexOf(r)));
  for (const idx of selectedIndices) {
    if (!visibleIndices.has(idx)) selectedIndices.delete(idx);
  }

  renderRequestItems(filtered, stats);
}

function renderRequestItems(requests: Stats['requests'], fullStats: Stats): void {
  const list = $('.request-list');
  if (!list) return;

  list.innerHTML = requests.map((r, _viewIdx) => {
    // Compute original flat index for state access
    const origIdx = fullStats.requests.indexOf(r);
    const method = r.method ?? 'GET';
    const mCls = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? method : 'OTHER';
    const label = r.name || shortUrl(r.url);
    const running = r.state === 'running';
    const isChecked = selectedIndices.has(origIdx);

    // Check unresolved variables
    const entry = flatEntry(origIdx);
    let hasUnresolved = false;
    if (entry) {
      const block = entry.e.blocks[entry.i];
      hasUnresolved = hasUnresolvedVars(block);
    }

    let resultHtml = '';
    if (running) {
      resultHtml = `<span class="req-result run"><span class="spin">${SYM_SPIN}</span></span>`;
    } else if (r.state) {
      const aTotal = r.assertTotal;
      const aFail = r.assertFail;
      const aTag = aTotal > 0
        ? ` <span class="req-assert ${aFail ? 'err' : 'ok'}">${aFail ? `${SYM_CROSS}${aFail}/${aTotal}` : `${SYM_CHECK}${aTotal}`}</span>`
        : '';
      if (r.ok) {
        resultHtml = `<span class="req-result ok">${SYM_CHECK} ${r.status} \u00B7 ${r.time}ms${aTag}</span>`;
      } else {
        resultHtml = `<span class="req-result err">${r.status && r.status > 0 ? `${SYM_CROSS} ${r.status}` : `${SYM_CROSS} ERR`}${aTag}</span>`;
      }
    }

    const btnDisabled = running || hasUnresolved ? 'disabled' : '';
    const btnTitle = hasUnresolved ? 'Unresolved variables — define them in Variables tab' : '';
    const itemClass = hasUnresolved ? 'req-item unresolved' : 'req-item';
    const warnIcon = hasUnresolved ? `<span class="warn-icon" title="Unresolved variables">${SYM_WARN}</span> ` : '';

    return `<div class="${itemClass}" data-index="${origIdx}">
      <input type="checkbox" class="req-checkbox" data-index="${origIdx}" ${isChecked ? 'checked' : ''}>
      <span class="req-method ${mCls}">${method}</span>
      <span class="req-label" title="${hasUnresolved ? 'Missing variables — define them in Variables tab' : escAttr(r.url)}">${warnIcon}${escHtml(label)}</span>
      ${resultHtml}
      <button class="req-run-btn" data-index="${origIdx}" ${btnDisabled} title="${btnTitle}">${running ? SYM_SPIN : SYM_RUN}</button>
    </div>`;
  }).join('');

  // Bind events
  list.querySelectorAll('.req-item').forEach(row => {
    const idx = parseInt((row as HTMLElement).dataset.index!, 10);

    // Checkbox toggle
    const cb = row.querySelector('.req-checkbox') as HTMLInputElement;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
      renderRequestsTab();
    });

    // Row click → scroll to block (skip if clicking checkbox or run button)
    row.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLElement).closest('.req-run-btn')) return;
      if ((e.target as HTMLElement).closest('.req-checkbox')) return;
      const item = flatEntry(idx);
      if (item) {
        item.e.wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Run button
    const runBtn = row.querySelector('.req-run-btn') as HTMLButtonElement;
    if (runBtn) {
      runBtn.addEventListener('click', async (e: Event) => {
        e.stopPropagation();
        runBtn.disabled = true;
        const item = flatEntry(idx);
        if (item) {
          await runOne(item.e, item.i);
          renderSidepanel();
        }
      });
    }
  });
}

// ── Filter / Selection ─────────────────────────────────────────────────
function handleFilterChange(): void {
  const sel = $('.method-filter') as HTMLSelectElement;
  methodFilter = sel.value;
  selectedIndices.clear();

  // Auto-select all visible requests when filtering by a specific method
  if (methodFilter !== 'ALL') {
    const stats = getStats();
    stats.requests.forEach((r, i) => {
      if (methodFilter === 'OTHER') {
        if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method ?? 'GET')) selectedIndices.add(i);
      } else if ((r.method ?? 'GET') === methodFilter) {
        selectedIndices.add(i);
      }
    });
  }

  renderRequestsTab();
}

function clearSelection(): void {
  selectedIndices.clear();
}

// ── Run Selected ───────────────────────────────────────────────────────
async function runSelectedRequests(): Promise<void> {
  if (isRunningAll || selectedIndices.size === 0) return;
  isRunningAll = true;
  renderSidepanel();

  const indices = Array.from(selectedIndices);
  await Promise.all(indices.map(async idx => {
    const item = flatEntry(idx);
    if (item) await runOne(item.e, item.i);
  }));

  isRunningAll = false;
  selectedIndices.clear();
  renderSidepanel();
}

// ── Run All ────────────────────────────────────────────────────────────
async function runAllRequests(): Promise<void> {
  if (isRunningAll) return;
  isRunningAll = true;
  clearSelection();
  renderSidepanel();

  // Run all requests in parallel
  await Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i))));

  isRunningAll = false;
  renderSidepanel();
}

// ── Re-scan ────────────────────────────────────────────────────────────
async function rescanPage(): Promise<void> {
  if (isRescanning) return;
  isRescanning = true;
  clearSelection();
  renderSidepanel();

  try { injectAll(true); } catch (e) { console.warn('[httpOwl] re-scan error', e); }

  isRescanning = false;
  renderSidepanel();
}

// ── Report Generation ──────────────────────────────────────────────────
async function generateReport(): Promise<void> {
  const vars = getCachedVars();
  const rows: ReportRow[] = registry.flatMap(e => e.blocks.map((block, i) => {
    const result = e.results[i];
    const resolved = applyVars(block, vars);
    return {
      method: block.method,
      name: block.name ?? null,
      url: block.url,
      resolvedUrl: resolved.url,
      headers: block.headers,
      resolvedHeaders: resolved.headers,
      body: block.body,
      resolvedBody: resolved.body,
      assertions: block.assertions ?? [],
      state: result?.state ?? null,
      ok: result?.ok ?? null,
      status: result?.status ?? null,
      statusText: result?.statusText ?? null,
      time: result?.time ?? null,
      resHeaders: result?.headers ?? {},
      resBody: result?.body ?? null,
      assertResults: result?.assertResults ?? [],
    };
  }));

  if (!rows.length) return;
  const html = buildReportHtml(rows);
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

// ── Variables Tab ──────────────────────────────────────────────────────
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
  const shared = parseVarText(envConfig.envs.$shared || '');
  const active = parseVarText(envConfig.envs[envConfig.activeEnv] || '');
  return { ...shared, ...active };
}

async function saveEnvConfig(): Promise<void> {
  const merged = computeVariables();
  await chrome.storage.local.set({ envConfig, variables: merged });
}

function renderEnvSelect(): void {
  const sel = $('.env-select') as HTMLSelectElement;
  sel.innerHTML = Object.keys(envConfig.envs).map(name =>
    `<option value="${escAttr(name)}" ${name === envConfig.activeEnv ? 'selected' : ''}>${escHtml(name)}</option>`
  ).join('');
}

function loadActiveEnv(): void {
  const editor = $('.var-editor') as HTMLTextAreaElement;
  editor.value = envConfig.envs[envConfig.activeEnv] || '';
}

async function loadVariablesTab(): Promise<void> {
  // Load envConfig from storage
  const stored = await chrome.storage.local.get('envConfig') as { envConfig?: EnvConfig };
  if (stored.envConfig) {
    envConfig = stored.envConfig;
  }
  renderEnvSelect();
  loadActiveEnv();
}

function onEnvChange(): void {
  const editor = $('.var-editor') as HTMLTextAreaElement;
  const sel = $('.env-select') as HTMLSelectElement;
  // Save current editor content to old env
  envConfig.envs[envConfig.activeEnv] = editor.value;
  // Switch to new env
  envConfig.activeEnv = sel.value;
  loadActiveEnv();
  saveEnvConfig();
}

function onVarEditorInput(): void {
  const editor = $('.var-editor') as HTMLTextAreaElement;
  envConfig.envs[envConfig.activeEnv] = editor.value;
  saveEnvConfig();
}

function addEnvironment(): void {
  const name = prompt('New environment name:');
  if (!name?.trim()) return;
  const n = name.trim();
  if (envConfig.envs[n] !== undefined) { /* exists — no-op */ return; }
  const editor = $('.var-editor') as HTMLTextAreaElement;
  envConfig.envs[envConfig.activeEnv] = editor.value;
  envConfig.envs[n] = '';
  envConfig.activeEnv = n;
  renderEnvSelect();
  loadActiveEnv();
  saveEnvConfig();
}

function deleteEnvironment(): void {
  const active = envConfig.activeEnv;
  if (active === '$shared') return;
  if (Object.keys(envConfig.envs).length <= 1) return;
  // eslint-disable-next-line no-alert
  if (!confirm(`Delete environment "${active}"?`)) return;
  delete envConfig.envs[active];
  envConfig.activeEnv = Object.keys(envConfig.envs)[0];
  renderEnvSelect();
  loadActiveEnv();
  saveEnvConfig();
}
