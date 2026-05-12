import type { Block, Entry } from '../shared/types';
import { esc, formatBody, buildCurl } from '../shared/utils';
import { applyVars } from './variables';
import { runOne } from './runner';
import overlayCss from './overlay.css?raw';

// ── Module state ──────────────────────────────────────────────────────────────
let overlayHost: HTMLElement | null = null;
let overlayShadow: ShadowRoot | null = null;
export let activeDetail: { entry: Entry; idx: number; resolvedBlock: Block | null } | null = null;

// ── Initialisation ────────────────────────────────────────────────────────────
export function createOverlay(): void {
  overlayHost = document.createElement('div');
  overlayHost.setAttribute('data-http-owl-overlay', '');
  overlayHost.style.cssText = 'all:initial;';
  document.body.appendChild(overlayHost);
  overlayShadow = overlayHost.attachShadow({ mode: 'open' });
  overlayShadow.innerHTML = `<style>${overlayCss}</style><div class="backdrop hidden"></div>`;

  overlayShadow.addEventListener('click', async e => {
    if ((e.target as HTMLElement).classList.contains('backdrop')) {
      hideOverlay();
      return;
    }
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'close') { hideOverlay(); return; }

    if (action === 'copy-res' && activeDetail) {
      const r = activeDetail.entry.results[activeDetail.idx];
      if (r) navigator.clipboard.writeText(r.body || '').catch(() => {});
      return;
    }
    if (action === 'copy-curl' && activeDetail) {
      const stored = await chrome.storage.local.get('variables') as { variables?: Record<string, string> };
      const b = activeDetail.entry.blocks[activeDetail.idx];
      navigator.clipboard.writeText(buildCurl(applyVars(b, stored.variables ?? {}))).catch(() => {});
      return;
    }
    if (action === 'run' && activeDetail) {
      runOne(activeDetail.entry, activeDetail.idx);
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideOverlay();
  });
}

export async function showOverlay(entry: Entry, idx: number): Promise<void> {
  activeDetail = { entry, idx, resolvedBlock: null };
  renderOverlay();
  overlayShadow?.querySelector('.backdrop')?.classList.remove('hidden');
  const stored = await chrome.storage.local.get('variables') as { variables?: Record<string, string> };
  if (activeDetail?.entry === entry && activeDetail?.idx === idx) {
    activeDetail.resolvedBlock = applyVars(entry.blocks[idx], stored.variables ?? {});
    renderOverlay();
  }
}

export function hideOverlay(): void {
  overlayShadow?.querySelector('.backdrop')?.classList.add('hidden');
  activeDetail = null;
}

export function renderOverlay(): void {
  if (!activeDetail || !overlayShadow) return;
  const { entry, idx } = activeDetail;
  const block = entry.blocks[idx];
  const resolved = activeDetail.resolvedBlock ?? block;
  const result = entry.results[idx];
  const method = block.method;
  const mCls = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)
    ? `m-${method}` : 'm-OTHER';

  const code = result?.status ?? 0;
  const running = result?.state === 'running';
  const hasRes = result && !running;
  const scCls = code === 0 ? 's-net' : code < 300 ? 's-2xx' : code < 400 ? 's-3xx' : code < 500 ? 's-4xx' : 's-5xx';

  const reqHeaders = Object.entries(resolved.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)';

  const responseSection = (() => {
    if (running) return `
      <div class="section">
        <div class="sec-title">Response</div>
        <div class="running-msg"><span class="running-spin">\u21BB</span> Executing\u2026</div>
      </div>`;
    if (!result) return `
      <div class="section">
        <p class="muted">Not yet run. Click \u25B6 Run below.</p>
      </div>`;
    const resHeaders = Object.entries(result.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)';
    const isHttpError = code >= 400;
    const rawBody = result.body || '';

    // Determine error type and hint for network errors (code 0)
    const netErrType = (() => {
      if (code !== 0) return null;
      if (result.statusText?.toLowerCase().includes('timed out')) return 'Timeout';
      if (result.statusText?.toLowerCase().includes('extension context')) return 'Context Lost';
      if (result.statusText?.startsWith('Token endpoint') || result.statusText?.includes('OAuth missing')) return 'OAuth Error';
      return 'Network Error';
    })();
    const netErrHint = netErrType === 'Timeout'
      ? 'Request did not receive a response within 30 seconds. The endpoint may be unreachable from the extension context.'
      : netErrType === 'Context Lost'
      ? 'The background service worker terminated. Reload the page to restore the extension connection.'
      : netErrType === 'OAuth Error'
      ? 'OAuth token acquisition failed. Check your client credentials in the Variables tab.'
      : null;

    // Format body for display
    const displayBody = code === 0
      ? result.statusText
      : formatBody(rawBody, result.headers?.['content-type'] || '');
    const hasBody = code !== 0 && rawBody.length > 0;

    return `
      <div class="section">
        <div class="sec-title">Response</div>
        <div class="kv">
          <span class="k">Status</span>
          <span class="v ${scCls}">${code === 0 ? 'Network Error' : `${code} ${esc(result.statusText)}`}</span>
        </div>
        ${code > 0 ? `<div class="kv"><span class="k">Time</span><span class="v">${result.time}ms</span></div>` : ''}
        ${code === 0 ? `
        <div class="kv"><span class="k">Error Type</span><span class="err-type s-net">${netErrType}</span></div>
        <div class="sub">Error</div>
        <pre class="code">${esc(result.statusText || 'Unknown error')}</pre>
        ${netErrHint ? `<p class="err-hint">${netErrHint}</p>` : ''}` : ''}
        ${isHttpError ? `
        <div class="kv"><span class="k">Error Type</span><span class="err-type ${scCls}">HTTP ${code}</span></div>
        ${hasBody ? `<div class="sub">Error Body</div>
        <pre class="code body-err">${esc(displayBody)}</pre>` : `<p class="muted">(no response body)</p>`}` : ''}
        <div class="sub">Headers</div>
        <pre class="code">${esc(resHeaders)}</pre>
        ${!isHttpError && code > 0 ? `<div class="sub">Body</div>
        <pre class="code">${esc(displayBody)}</pre>` : ''}
      </div>`;
  })();

  const ar = result?.assertResults ?? [];
  const assertSection = ar.length === 0 ? '' : (() => {
    const pass = ar.filter(a => a.pass).length;
    return `
      <div class="section">
        <div class="sec-title">Assertions ${pass}/${ar.length}</div>
        ${ar.map(a => `
          <div class="assert-row">
            <span class="a-icon ${a.pass ? 'ok' : 'err'}">${a.pass ? '\u2713' : '\u2717'}</span>
            <span class="a-expr">${esc(a.expr)}</span>
            ${!a.pass ? `<div class="a-got">got: <code>${esc(String(a.actual ?? 'undefined'))}</code></div>` : ''}
          </div>`).join('')}
      </div>`;
  })();

  const requestLabel = block.name ? `${method} ${esc(block.name)}` : `${method} ${esc(resolved.url)}`;
  const html = `
    <div class="card" role="dialog" aria-modal="true" aria-label="Request detail: ${esc(requestLabel)}">
      <div class="card-head">
        <span class="badge ${mCls}">${esc(method)}</span>
        ${block.name ? `<span class="req-name">${esc(block.name)}</span>` : ''}
        <span class="req-url" title="${esc(resolved.url)}">${esc(resolved.url)}</span>
        ${hasRes && code > 0 ? `<span class="status-code ${scCls}">${code} ${esc(result!.statusText)}</span>` : ''}
        ${hasRes && code > 0 ? `<span class="res-time">${result!.time}ms</span>` : ''}
        <button class="close-btn" data-action="close" aria-label="Close dialog">\u2715</button>
      </div>
      <div class="card-body">
        <div class="section">
          <div class="sec-title">Request</div>
          <div class="kv">
            <span class="k">Method</span><span class="v">${esc(method)}</span>
          </div>
          <div class="kv">
            <span class="k">URL</span><span class="v">${esc(resolved.url)}</span>
          </div>
          <div class="sub">Headers</div>
          <pre class="code">${esc(reqHeaders)}</pre>
          ${resolved.body ? `<div class="sub">Body</div><pre class="code">${esc(resolved.body)}</pre>` : ''}
        </div>
        ${responseSection}
        ${assertSection}
      </div>
      <div class="card-foot">
        ${hasRes && result!.body ? `<button class="foot-btn" data-action="copy-res" aria-label="Copy response body">Copy Response</button>` : ''}
        <button class="foot-btn" data-action="copy-curl" aria-label="Copy as cURL command">Copy as cURL</button>
        <button class="foot-btn foot-run" data-action="run" ${running ? 'disabled' : ''} aria-label="${running ? 'Running' : 'Run request'}">\u25B6 Run</button>
        <button class="foot-btn ml" data-action="close" aria-label="Close dialog">Close</button>
      </div>
    </div>`;

  overlayShadow.querySelector('.backdrop')!.innerHTML = html;
}
