import type { Stats } from '../shared/types';
import { registry, runOne, getStats, flatEntry } from './runner';
import { injectAll } from './inject';
import { subscribeVarsChanged } from './variables';
import sidepanelCss from './sidepanel.css?raw';

// ── State ──────────────────────────────────────────────────────────────
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let isOpen = false;
let activeTab: 'requests' | 'variables' = 'requests';
let isRunningAll = false;
let isRescanning = false;

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
      </div>
      <div class="tab-content" id="tab-requests">
        <div class="stats-bar"></div>
        <div class="action-bar">
          <button class="action-btn run-all" aria-label="Run all requests">${SYM_RUN} Run All</button>
          <button class="action-btn rescan" aria-label="Re-scan page">${SYM_SPIN} Re-scan</button>
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
    reqPanel.classList.toggle('hidden', tab !== 'requests');
    varPanel.classList.toggle('hidden', tab !== 'variables');
    if (tab === 'variables') loadVariablesTab();
  });

  // Run All
  $('.action-btn.run-all')!.addEventListener('click', runAllRequests);

  // Re-scan
  $('.action-btn.rescan')!.addEventListener('click', rescanPage);

  // Variables: env select change
  $('.env-select')!.addEventListener('change', onEnvChange);

  // Variables: editor input
  const varEditor = $('.var-editor') as HTMLTextAreaElement | null;
  varEditor?.addEventListener('input', onVarEditorInput);

  // Variables: add env
  $('.env-btn.add')!.addEventListener('click', addEnvironment);

  // Variables: delete env
  $('.env-btn.del')!.addEventListener('click', deleteEnvironment);

  // Re-highlight on variable changes from external sources
  subscribeVarsChanged(() => {
    if (isOpen && activeTab === 'variables') loadVariablesTab();
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
  const countEl = $('.tab-count');
  const dotEl = $('.tab-dot');
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
    `;
  }

  // Action buttons
  const runAllBtn = $('.action-btn.run-all') as HTMLButtonElement | null;
  const rescanBtn = $('.action-btn.rescan') as HTMLButtonElement | null;
  if (runAllBtn) {
    runAllBtn.disabled = isRunningAll || stats.total === 0;
    runAllBtn.textContent = isRunningAll ? `${SYM_SPIN} Running\u2026` : `${SYM_RUN} Run All`;
  }
  if (rescanBtn) {
    rescanBtn.disabled = isRescanning;
    rescanBtn.textContent = isRescanning ? `${SYM_SPIN} Scanning\u2026` : `${SYM_SPIN} Re-scan`;
  }

  // Error state
  if (!stats.total && !isRescanning) {
    const list = $('.request-list');
    if (list) {
      list.innerHTML = `<div class="empty-state"><div class="icon">${SYM_HOUSE}</div><div>No HTTP requests detected</div></div>`;
    }
    return;
  }

  renderRequestItems(stats);
}

function renderRequestItems(stats: Stats): void {
  const list = $('.request-list');
  if (!list) return;

  list.innerHTML = stats.requests.map((r, i) => {
    const method = r.method ?? 'GET';
    const mCls = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? method : 'OTHER';
    const label = r.name || shortUrl(r.url);
    const running = r.state === 'running';

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

    const btnDisabled = running ? 'disabled' : '';
    const btnContent = running ? SYM_SPIN : SYM_RUN;
    return `<div class="req-item" data-index="${i}">
      <span class="req-method ${mCls}">${method}</span>
      <span class="req-label" title="${escAttr(r.url)}">${escHtml(label)}</span>
      ${resultHtml}
      <button class="req-run-btn" data-index="${i}" ${btnDisabled}>${btnContent}</button>
    </div>`;
  }).join('');

  // Bind events
  list.querySelectorAll('.req-item').forEach(row => {
    const idx = parseInt((row as HTMLElement).dataset.index!, 10);
    row.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLElement).closest('.req-run-btn')) return;
      const item = flatEntry(idx);
      if (item) {
        item.e.wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    const runBtn = row.querySelector('.req-run-btn') as HTMLButtonElement;
    runBtn.addEventListener('click', async (e: Event) => {
      e.stopPropagation();
      runBtn.disabled = true;
      const item = flatEntry(idx);
      if (item) {
        await runOne(item.e, item.i);
        renderSidepanel();
      }
    });
  });
}

// ── Run All ────────────────────────────────────────────────────────────
async function runAllRequests(): Promise<void> {
  if (isRunningAll) return;
  isRunningAll = true;
  renderSidepanel();

  // Run all requests in parallel (same as existing behavior)
  await Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i))));

  isRunningAll = false;
  renderSidepanel();
}

// ── Re-scan ────────────────────────────────────────────────────────────
async function rescanPage(): Promise<void> {
  if (isRescanning) return;
  isRescanning = true;
  renderSidepanel();

  try { injectAll(true); } catch (e) { console.warn('[httpOwl] re-scan error', e); }

  isRescanning = false;
  renderSidepanel();
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
