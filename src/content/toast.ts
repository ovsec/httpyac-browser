import toastCss from './toast.css?raw';

// ── Toast container (Shadow DOM, appended to body on first use) ───────
let container: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;

function ensureContainer(): void {
  if (container) return;
  container = document.createElement('div');
  container.style.cssText = 'all:initial;display:block;position:static;';
  shadow = container.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${toastCss}</style><div class="toast-container"></div>`;
  document.body.appendChild(container);
}

function getToastEl(): HTMLElement {
  ensureContainer();
  return shadow!.querySelector('.toast-container') as HTMLElement;
}

// ── Show a single toast ───────────────────────────────────────────────
export function showToast(
  method: string,
  label: string,
  ok: boolean,
  status: number,
  time: number,
): void {
  const containerEl = getToastEl();
  const mCls = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? method : 'OTHER';
  const statusLabel = ok ? '\u2713' : '\u2717';
  const statusCls = ok ? 'ok' : 'err';
  const statusText = status > 0 ? `${statusLabel} ${status}` : `${statusLabel} ERR`;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-method ${mCls}">${escHtml(method)}</span>
    <span class="toast-label">${escHtml(label)}</span>
    <span class="toast-result ${statusCls}">${escHtml(statusText)} \u00B7 ${time}ms</span>
  `;
  containerEl.appendChild(toast);

  // Remove after animation completes (2.25s = 0.25s in + 2s visible + 0.25s out)
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2300);
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Listen for request-completion events from runner.ts ───────────────
export function initToasts(): void {
  document.body.addEventListener('httpowl-done', ((e: CustomEvent) => {
    const { method, url, name, status, ok, time } = e.detail;
    const label = name || shortUrl(url);
    showToast(method, label, ok, status, time);
  }) as EventListener);
}

function shortUrl(url: string): string {
  try { const u = new URL(url); return u.pathname + (u.search || ''); }
  catch { return url; }
}
