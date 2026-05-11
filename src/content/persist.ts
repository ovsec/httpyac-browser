import type { Result, Block } from '../shared/types';
import { registry } from './runner';

const STORAGE_PREFIX = 'httpowl:';

interface StoredEntry {
  blocks: Pick<Block, 'method' | 'url' | 'name'>[];
  results: (Result | null)[];
}

interface StoredData {
  entries: StoredEntry[];
  timestamp: number;
}

// ── Debounced save ─────────────────────────────────────────────────────
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveResults(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    doSave();
  }, 400);
}

function doSave(): void {
  if (registry.length === 0) return;
  const data: StoredData = {
    entries: registry.map(entry => ({
      blocks: entry.blocks.map(b => ({ method: b.method, url: b.url, name: b.name })),
      results: entry.results,
    })),
    timestamp: Date.now(),
  };
  const key = STORAGE_PREFIX + location.href;
  chrome.storage.session.set({ [key]: data }).catch(() => {});
}

// ── Restore ────────────────────────────────────────────────────────────
export async function restoreResults(): Promise<void> {
  const key = STORAGE_PREFIX + location.href;
  const stored = await chrome.storage.session.get(key) as Record<string, StoredData | undefined>;
  const data = stored[key];
  if (!data) return;

  // TTL: discard results older than 30 minutes
  if (Date.now() - data.timestamp > 30 * 60 * 1000) {
    chrome.storage.session.remove(key).catch(() => {});
    return;
  }

  // Match stored results to current registry entries by method+url+name
  for (const entry of registry) {
    let changed = false;
    for (let i = 0; i < entry.blocks.length; i++) {
      const block = entry.blocks[i];
      // Skip if already has a result (e.g. just re-scanned with pills visible)
      if (entry.results[i]) continue;
      const sig = block.method + '\0' + block.url + '\0' + (block.name ?? '');

      for (const se of data.entries) {
        for (let si = 0; si < se.blocks.length; si++) {
          const sb = se.blocks[si];
          const storedSig = sb.method + '\0' + sb.url + '\0' + (sb.name ?? '');
          if (storedSig === sig && se.results[si]) {
            entry.results[i] = se.results[si];
            changed = true;
            break;
          }
        }
        if (entry.results[i]) break;
      }
    }
    if (changed) entry.render();
  }
}

// ── Cleanup on page unload (optional, saves latest before navigating away)
export function persistOnUnload(): void {
  window.addEventListener('beforeunload', () => {
    // Synchronous save attempt — best-effort
    doSave();
  });
}
