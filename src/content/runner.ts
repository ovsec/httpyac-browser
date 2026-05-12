import type { Result, Entry, ExecResponse, IconState, Stats, RequestSummary } from '../shared/types';
import { evaluateAssertions } from './assertions';
import { applyVars } from './variables';
import { renderOverlay, activeDetail } from './overlay';

// ── Registry ──────────────────────────────────────────────────────────────────
export const registry: Entry[] = [];

// ── Runner ────────────────────────────────────────────────────────────────────
export async function runOne(entry: Entry, i: number): Promise<void> {
  entry.results[i] = { state: 'running', ok: false, httpOk: false, status: 0, statusText: '', time: 0, headers: {}, body: '', assertResults: [] };
  entry.render();
  if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();

  const stored = await chrome.storage.local.get('variables') as { variables?: Record<string, string> };
  const vars = stored.variables ?? {};
  const block = entry.blocks[i];
  const merged = { ...vars, ...(block.localVars ?? {}) };

  const resolvedReq = applyVars(block, vars);
  console.log('[httpOwl] runOne sendMessage', { method: block.method, url: resolvedReq.url, blockUrl: block.url });

  let timedOut = false;
  const res = await new Promise<ExecResponse | null>(resolve => {
    const timeout = setTimeout(() => {
      timedOut = true;
      console.warn('[httpOwl] TIMEOUT — no response from background after 30s');
      resolve(null);
    }, 30000);
    try {
      chrome.runtime.sendMessage(
        { type: 'EXECUTE' as const, request: resolvedReq, vars: merged },
        (result: ExecResponse | undefined) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            console.warn('[httpOwl] sendMessage lastError', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            console.log('[httpOwl] sendMessage response received', { ok: result?.ok, status: result?.status, time: result?.time });
            resolve(result ?? null);
          }
        },
      );
    } catch (err) {
      clearTimeout(timeout);
      console.error('[httpOwl] sendMessage threw synchronously', err);
      resolve(null);
    }
  });

  if (!res) {
    entry.results[i] = {
      state: 'error', ok: false, httpOk: false, status: 0,
      statusText: timedOut ? 'Request timed out after 30s' : 'Extension context lost \u2014 reload page', time: 0,
      headers: {}, body: '', assertResults: [],
    };
    entry.render();
    if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();
    return;
  }

  const assertResults = evaluateAssertions(block.assertions, res);
  const assertsPass = assertResults.every(a => a.pass);
  const overallOk = res.ok && assertsPass;
  entry.results[i] = {
    state: overallOk ? 'done' : 'error',
    ...res,
    ok: overallOk,
    httpOk: res.ok,
    assertResults,
  };
  entry.render();
  if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();
  updateGlobalIcon();

  // Notify toast system and persistence
  const r = entry.results[i]!;
  document.body.dispatchEvent(new CustomEvent('httpowl-done', {
    detail: {
      method: block.method,
      url: block.url,
      name: block.name,
      status: r.status,
      ok: r.ok,
      time: r.time,
      assertTotal: block.assertions.length,
      assertFail: r.assertResults?.filter(a => !a.pass).length ?? 0,
    },
  }));
}

export function updateGlobalIcon(): void {
  const all = registry.flatMap(e => e.results.filter(Boolean)) as Result[];
  if (!all.length) return;
  if (all.some(r => r.state === 'running')) {
    chrome.runtime.sendMessage({ type: 'SET_ICON', state: 'running' as IconState }, () => { chrome.runtime.lastError; });
  } else {
    chrome.runtime.sendMessage(
      { type: 'SET_ICON', state: (all.every(r => r.ok) ? 'success' : 'error') as IconState },
      () => { chrome.runtime.lastError; },
    );
  }
}

// ── Stats helpers ─────────────────────────────────────────────────────────────
export function getStats(): Stats {
  const flat = registry.flatMap(e => e.blocks.map((block, i) => ({ block, result: e.results[i] })));
  return {
    total: flat.length,
    done: flat.filter(({ result: r }) => r && r.state !== 'running').length,
    ok: flat.filter(({ result: r }) => r?.ok).length,
    err: flat.filter(({ result: r }) => r && !r.ok && r.state !== 'running').length,
    requests: flat.map(({ block, result: r }): RequestSummary => ({
      method: block.method,
      url: block.url,
      name: block.name ?? null,
      state: r?.state ?? null,
      ok: r?.ok ?? null,
      httpOk: r?.httpOk ?? null,
      status: r?.status ?? null,
      statusText: r?.statusText ?? null,
      time: r?.time ?? null,
      assertTotal: block.assertions?.length ?? 0,
      assertFail: r?.assertResults?.filter(a => !a.pass).length ?? 0,
    })),
  };
}

export function flatEntry(index: number): { e: Entry; i: number } | null {
  return registry.flatMap(e => e.blocks.map((_, i) => ({ e, i })))[index] ?? null;
}

// ── Diagnostic self-test ──────────────────────────────────────────────────────
export async function diagnose(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const elapsed = (label: string, fn: () => Promise<unknown>): Promise<void> => {
    const start = performance.now();
    return fn().then(
      r => { results[label] = { ok: true, ms: Math.round(performance.now() - start), data: r }; },
      e => { results[label] = { ok: false, ms: Math.round(performance.now() - start), error: String(e) }; },
    );
  };

  await elapsed('storage.local.get', () => chrome.storage.local.get('variables'));
  await elapsed('sendMessage PING (background alive?)', () =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PING timed out after 5s')), 5000);
      chrome.runtime.sendMessage({ type: 'PING' }, (reply: unknown) => {
        clearTimeout(timer);
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(reply);
      });
    }),
  );

  return results;
}
