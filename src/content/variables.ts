import type { Block } from '../shared/types';
import { safeEval } from '../shared/safe-eval';

// System variable resolvers
function systemVarValue(name: string): string | null {
  switch (name) {
    case '$uuid':
    case '$guid':          return crypto.randomUUID();
    case '$timestamp':     return String(Date.now());
    case '$randomInt':     return String(Math.floor(Math.random() * 1000));
    case '$datetime':      return new Date().toISOString();
    case '$localDatetime': return new Date().toLocaleString();
    default:               return null;
  }
}

let cachedVars: Record<string, string> = {};
let _varVersion = 0;
const _unresolvedCache = new WeakMap<Block, { v: number; r: boolean }>();
const _varChangeListeners: Array<() => void> = [];

// Called from index.ts to initialise the cache
export function initVariables(): void {
  chrome.storage.local.get('variables', ({ variables }: { variables?: Record<string, string> }) => {
    cachedVars = variables ?? {};
  });
  chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area) => {
    if (area === 'local' && changes.variables) {
      cachedVars = (changes.variables.newValue as Record<string, string> | undefined) ?? {};
      _varVersion++;
      _varChangeListeners.forEach(fn => fn());
    }
  });
}

export function subscribeVarsChanged(cb: () => void): void {
  _varChangeListeners.push(cb);
}

export function getCachedVars(): Record<string, string> {
  return cachedVars;
}

export function hasUnresolvedVars(block: Block): boolean {
  const cached = _unresolvedCache.get(block);
  if (cached && cached.v === _varVersion) return cached.r;

  const merged = { ...cachedVars, ...(block.localVars ?? {}) };
  const check = (s: string | null | undefined): boolean => {
    if (!s) return false;
    const re = /\{\{(=?)([\s\S]*?)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const eq = m[1], expr = m[2].trim();
      if (eq === '=') continue; // {{= expr }} is computed later
      if (systemVarValue(expr) !== null) continue;
      if (merged[expr] !== undefined) continue;
      return true;
    }
    return false;
  };
  const r = check(block.url)
    || Object.values(block.headers ?? {}).some(check)
    || check(block.body);
  _unresolvedCache.set(block, { v: _varVersion, r });
  return r;
}

export function applyVars(req: Block, vars: Record<string, string>): Block {
  // Block-level @var definitions override popup vars
  const merged = { ...vars, ...(req.localVars ?? {}) };

  const sub = (s: string | null | undefined): string => {
    return String(s ?? '').replace(/\{\{(=?)([\s\S]*?)\}\}/g, (full, eq: string, inner: string) => {
      const expr = inner.trim();
      // {{= js expression }} — evaluated safely (no Function constructor)
      if (eq === '=') {
        const result = safeEval(expr);
        return result !== undefined ? String(result) : full;
      }
      // System variables
      const sv = systemVarValue(expr);
      if (sv !== null) return sv;
      // Popup / inline vars
      return merged[expr] ?? full;
    });
  };

  let url = sub(req.url);
  // @host auto-prepend: if URL is a relative path, prepend host variable
  if (url.startsWith('/') && merged['host']) {
    url = merged['host'].replace(/\/$/, '') + url;
  }

  return {
    ...req,
    url,
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, sub(v)])
    ),
    body: req.body ? sub(req.body) : null,
  };
}

// ── In-page variable highlighting ─────────────────────────────────────────────

export function varKeyStatus(
  key: string,
  blocks: Block[],
  varsOverride?: Record<string, string>,
): 'resolved' | 'unresolved' | 'computed' {
  if (key.startsWith('=')) return 'computed';
  const name = key.trim();
  if (name.length === 0) return 'resolved';
  if (systemVarValue(name) !== null) return 'resolved';
  const merged = varsOverride ?? cachedVars;
  if (merged[name] !== undefined) return 'resolved';
  for (const b of blocks) {
    if (b.localVars?.[name] !== undefined) return 'resolved';
  }
  return 'unresolved';
}

const VAR_STYLES: Record<string, string> = {
  resolved: 'background:rgba(34,197,94,0.12);outline:1px solid rgba(34,197,94,0.35);border-radius:2px;padding:0 1px;',
  unresolved: 'background:rgba(239,68,68,0.12);outline:1px solid rgba(239,68,68,0.35);border-radius:2px;padding:0 1px;',
  computed: 'background:rgba(59,130,246,0.12);outline:1px solid rgba(59,130,246,0.35);border-radius:2px;padding:0 1px;',
};

export function highlightVariables(el: HTMLElement, blocks: Block[]): void {
  // Cannot highlight inside textarea — it renders plain text only
  if (el.tagName === 'TEXTAREA') return;
  // Skip disconnected elements
  if (!el.isConnected) return;

  // Remove previous highlight spans
  const prev = el.querySelectorAll('[data-http-owl-v]');
  for (let i = prev.length - 1; i >= 0; i--) {
    const span = prev[i];
    const txt = document.createTextNode(span.textContent ?? '');
    span.parentNode!.replaceChild(txt, span);
  }

  const toReplace: Array<{ node: Text; parts: Array<string | Node> }> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent!;
    const segments = text.split(/(\{\{[\s\S]*?\}\})/);
    if (segments.length <= 1) continue;

    const parts: Array<string | Node> = [];
    for (const seg of segments) {
      if (seg.startsWith('{{') && seg.endsWith('}}')) {
        const inner = seg.slice(2, -2);
        const status = varKeyStatus(inner, blocks);
        if (status) {
          const span = document.createElement('span');
          span.setAttribute('data-http-owl-v', status);
          span.style.cssText = VAR_STYLES[status];
          span.textContent = seg;
          parts.push(span);
          continue;
        }
      }
      parts.push(seg);
    }

    if (parts.length > 0) {
      toReplace.push({ node, parts });
    }
  }

  // Apply outside the walker (don't mutate the tree while iterating)
  for (const { node, parts } of toReplace) {
    const parent = node.parentNode!;
    const fragment = document.createDocumentFragment();
    for (const p of parts) {
      fragment.appendChild(typeof p === 'string' ? document.createTextNode(p) : p);
    }
    parent.replaceChild(fragment, node);
  }
}
