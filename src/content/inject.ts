import type { Block, Entry } from '../shared/types';
import { parseText, parseBlock } from './parser';
import { findBlockTopOffset } from './offsets';
import { renderPills } from './pills';
import { registry, runOne } from './runner';
import { showOverlay } from './overlay';
import { highlightVariables } from './variables';

// ── Injection ────────────────────────────────────────────────────────────────
export function injectForElement(
  el: HTMLElement,
  blocks: Block[],
  precomputedOffsets?: number[],
): void {
  const entry: Entry = {
    shadow: null,
    blocks,
    results: new Array(blocks.length).fill(null),
    el,
    wrapper: null as unknown as HTMLElement,
    offsets: [],
    render: () => {},
  };

  // Wrapper kept so SCROLL_TO / scrollIntoView still works
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-http-owl-wrapper', '');
  wrapper.style.cssText = 'position:relative;display:block;';
  el.parentNode!.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  entry.wrapper = wrapper;

  // Measure offsets BEFORE DOM mutation so layout reads don't force reflow
  entry.offsets = precomputedOffsets ?? blocks.map((b, i) => {
    const occurrence = blocks.slice(0, i).filter(p => p.method === b.method && p.url === b.url).length;
    return findBlockTopOffset(el, b, occurrence);
  });

  const pillHost = document.createElement('div');
  pillHost.setAttribute('data-http-owl', '');
  pillHost.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible;';
  wrapper.appendChild(pillHost);
  entry.shadow = pillHost.attachShadow({ mode: 'open' });

  entry.render = () => {
    if (!el.isConnected) return;
    renderPills(entry.shadow!, entry.blocks, entry.results, entry.offsets, 0);
  };

  requestAnimationFrame(() => entry.render());
  registry.push(entry);

  // Highlight {{...}} variables in the source element
  highlightVariables(el, blocks);

  entry.shadow.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx!, 10);
    if (btn.dataset.action === 'run') {
      runOne(entry, idx);
    } else if (btn.dataset.action === 'details') {
      showOverlay(entry, idx);
    }
  });
}

// Confluence (and other wikis) render ### as <h2>/<h3>/<h4>.
function findNextCodeEl(heading: Element): HTMLElement | null {
  let el = heading.nextElementSibling;
  let hops = 0;
  while (el && hops < 3) {
    if (el.matches('h1,h2,h3,h4,h5,h6')) break;
    if (el.matches('pre, code')) return el as HTMLElement;
    const inner = el.querySelector('pre, code');
    if (inner) return inner as HTMLElement;
    el = el.nextElementSibling;
    hops++;
  }
  return null;
}

export function injectAll(force = false): number {
  if (force) {
    // Full rebuild: undo all previous wrappers and reset registry
    document.querySelectorAll('[data-http-owl-wrapper]').forEach(wrapper => {
      Array.from(wrapper.childNodes).forEach(child => {
        if (child.nodeType === 1 && !(child as HTMLElement).hasAttribute('data-http-owl')) {
          wrapper.parentNode!.insertBefore(child, wrapper);
        }
      });
      wrapper.remove();
    });
    document.querySelectorAll('[data-http-owl]').forEach(el => el.remove());
    document.querySelectorAll('[data-http-owl-done]').forEach(el => {
      el.removeAttribute('data-http-owl-done');
    });
    registry.length = 0;
  }

  let count = 0;

  // ── Phase 1: all layout reads (before any DOM mutations) ──────────────────

  // Strategy 3 (GitHub blob): measure cell rects NOW, before injectForElement
  // mutates the DOM and would force a reflow on these reads.
  let githubInject: { table: HTMLElement; blocks: Block[]; blockOffsets: number[] } | null = null;
  {
    const codeCells = Array.from(
      document.querySelectorAll<HTMLElement>(
        'td.blob-code, td.js-file-line, td[id^="LC"], td.react-code-file-line',
      ),
    );
    if (codeCells.length) {
      const table = codeCells[0].closest('table');
      if (table && !table.dataset.httpOwlDone) {
        const lines = codeCells.map(td => td.textContent ?? '');
        const blocks = parseText(lines.join('\n'));
        if (blocks.length) {
          const tableRect = table.getBoundingClientRect();
          const lineOffsets = codeCells.map(td => td.getBoundingClientRect().top - tableRect.top);
          const blockOffsets = blocks.map((block, bi) => {
            const needle = block.method + ' ' + block.url;
            const skip = blocks.slice(0, bi).filter(
              p => p.method === block.method && p.url === block.url,
            ).length;
            let seen = 0;
            for (let li = 0; li < lines.length; li++) {
              if (lines[li].includes(needle)) {
                if (seen === skip) return lineOffsets[li];
                seen++;
              }
            }
            return 0;
          });
          githubInject = { table: table as HTMLElement, blocks, blockOffsets };
        }
      }
    }
  }

  // ── Phase 2: all DOM mutations ────────────────────────────────────────────

  // Strategy 1: code blocks containing inline ### separators
  document.querySelectorAll<HTMLElement>('pre, code, textarea').forEach(el => {
    if (el.tagName === 'CODE' && el.closest('pre')) return;
    if (el.dataset.httpOwlDone) return;
    // Skip off-screen hidden textareas (e.g. GitHub read-only-cursor-text-area)
    if (el.tagName === 'TEXTAREA') {
      const ta = el as HTMLTextAreaElement;
      const hasCheck = typeof ta.checkVisibility === 'function';
      const hidden = hasCheck ? !ta.checkVisibility() : (!ta.offsetWidth && !ta.offsetHeight);
      if (hidden) {
        el.dataset.httpOwlDone = '1';
        return;
      }
    }

    const text = (el as HTMLTextAreaElement).value ?? el.textContent ?? '';
    const blocks = parseText(text);
    if (!blocks.length) return;
    el.dataset.httpOwlDone = '1';
    injectForElement(el, blocks);
    count += blocks.length;
  });

  // Strategy 2: Confluence / wiki pages where ### -> <h2>/<h3>/<h4> + <pre>
  document.querySelectorAll<HTMLElement>('h2, h3, h4').forEach(heading => {
    const name = heading.textContent?.trim();
    if (!name) return;
    const codeEl = findNextCodeEl(heading);
    if (!codeEl || codeEl.dataset.httpOwlDone) return;
    const text = (codeEl as HTMLTextAreaElement).value ?? codeEl.textContent ?? '';
    const block = parseBlock(text.trim(), name);
    if (!block) return;
    codeEl.dataset.httpOwlDone = '1';
    injectForElement(codeEl, [block]);
    count++;
  });

  // Strategy 3: inject using pre-measured rects from Phase 1
  if (githubInject) {
    const { table, blocks, blockOffsets } = githubInject;
    table.dataset.httpOwlDone = '1';
    injectForElement(table, blocks, blockOffsets);
    count += blocks.length;
  }

  chrome.runtime.sendMessage({ type: 'SET_ICON', state: 'default' }, () => { chrome.runtime.lastError; });
  return count;
}
