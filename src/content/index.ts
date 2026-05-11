import { injectAll } from './inject';
import { createOverlay } from './overlay';
import { registry, runOne, getStats, flatEntry } from './runner';
import { initVariables, subscribeVarsChanged, highlightVariables, applyVars } from './variables';
import { createSidepanel, renderSidepanel } from './sidepanel';
import { initToasts } from './toast';
import { saveResults, restoreResults, persistOnUnload } from './persist';
import type { ReportRow } from '../shared/types';

// ── Public API (for popup / external inspection) ─────────────────────────────
(window as unknown as Record<string, unknown>).__httpOwl = {
  reinject: injectAll,
  getStats,
  runAll: () => Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i)))),
};

// ── Message listeners ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: Record<string, unknown>, _sender, reply) => {
  const { type, index } = msg as { type: string; index?: number };

  if (type === 'SCAN') {
    const count = injectAll(true);
    renderSidepanel();
    reply({ count });
  } else if (type === 'RUN_ALL') {
    Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i))))
      .then(() => { reply({ ok: true }); renderSidepanel(); });
    return true;
  } else if (type === 'RUN_ONE') {
    const item = flatEntry(index!);
    if (item) runOne(item.e, item.i).then(() => { reply(getStats()); renderSidepanel(); });
    return true;
  } else if (type === 'SCROLL_TO') {
    flatEntry(index!)?.e.wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reply({ ok: true });
  } else if (type === 'STATS') {
    reply(getStats());
  } else if (type === 'GET_REPORT') {
    chrome.storage.local.get('variables').then(({ variables: vars = {} }: { variables?: Record<string, string> }) => {
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
      reply({ requests: rows });
    });
    return true;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
initVariables();

// Re-highlight {{...}} variables on all injected elements when popup vars change
subscribeVarsChanged(() => {
  for (const entry of registry) {
    highlightVariables(entry.el, entry.blocks);
  }
});

createOverlay();
createSidepanel();
initToasts();
try { injectAll(); } catch (e) { console.warn('[httpOwl] init scan error', e); }

// Restore persisted results from previous page visit
restoreResults().catch(() => {});

// Save results to session storage when a request completes
document.body.addEventListener('httpowl-done', () => { saveResults(); });
persistOnUnload();

// Re-scan when SPA (Confluence, GitHub, etc.) renders content after document_idle.
let _scanTimer: ReturnType<typeof setTimeout> | null = null;
new MutationObserver(() => {
  clearTimeout(_scanTimer!);
  _scanTimer = setTimeout(() => {
    _scanTimer = null;
    if (document.querySelector(
      'pre:not([data-http-owl-done]),' +
      'code:not(pre code):not([data-http-owl-done]),' +
      'textarea:not([data-http-owl-done])',
    )) {
      try { injectAll(); } catch (e) { console.warn('[httpOwl] re-scan error', e); }
    }
  }, 600);
}).observe(document.documentElement, { childList: true, subtree: true });
