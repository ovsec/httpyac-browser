import type { ResolvedRequest } from './types';

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '\u2026' : url;
  }
}

export function formatBody(raw: string | null | undefined, ct?: string): string {
  if (!raw) return '(empty)';
  if (ct?.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // fall through to raw
    }
  }
  return raw.length > 5000 ? raw.slice(0, 5000) + '\n\u2026(truncated)' : raw;
}

export function buildCurl(req: ResolvedRequest): string {
  let s = `curl -X ${req.method} '${req.url}'`;
  for (const [k, v] of Object.entries(req.headers || {})) {
    s += ` \\\n  -H '${k}: ${v}'`;
  }
  if (req.body) s += ` \\\n  -d '${req.body.replace(/'/g, "'\\''")}'`;
  return s;
}
