import type { Block } from '../shared/types';

// Find the Nth full-token occurrence of needle in text.
// Skips substring matches: "GET .../users" inside "GET .../users/1"
function findNthOccurrence(text: string, needle: string, occurrence: number): number {
  let searchFrom = 0;
  let seen = 0;
  while (true) {
    const idx = text.indexOf(needle, searchFrom);
    if (idx === -1) return -1;
    searchFrom = idx + 1;
    const after = text[idx + needle.length];
    if (after !== undefined && !/[\s\r\n]/.test(after)) continue; // substring match
    if (seen === occurrence) return idx;
    seen++;
  }
}

// Mirror technique for <textarea> to find Y offset of a line
function findOffsetInTextarea(el: HTMLTextAreaElement, needle: string, occurrence = 0): number {
  const value = el.value;
  const needleIdx = findNthOccurrence(value, needle, occurrence);
  if (needleIdx === -1) return 0;

  const cs = getComputedStyle(el);
  const mirror = document.createElement('div');
  mirror.style.cssText = [
    'position:fixed', 'visibility:hidden', 'top:0', 'left:-99999px',
    'white-space:pre-wrap', 'word-wrap:break-word', 'box-sizing:border-box', 'overflow:hidden',
  ].join(';');
  mirror.style.width = el.offsetWidth + 'px';
  const styleProps: ReadonlyArray<keyof CSSStyleDeclaration> = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];
  for (const p of styleProps) {
    const val = cs.getPropertyValue(p as string);
    if (val) mirror.style.setProperty(p as string, val);
  }

  const before = document.createElement('span');
  before.textContent = value.slice(0, needleIdx);
  const marker = document.createElement('span');
  marker.textContent = needle[0] || ' ';
  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mRect = mirror.getBoundingClientRect();
  const kRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);
  return Math.max(0, kRect.top - mRect.top);
}

// Find the top-offset (px) of a block's METHOD URL line within el.
export function findBlockTopOffset(el: HTMLElement, block: Block, occurrence = 0): number {
  const needle = block.method + ' ' + block.url;

  if (el.tagName === 'TEXTAREA') {
    return findOffsetInTextarea(el as HTMLTextAreaElement, needle, occurrence);
  }

  try {
    const fullText = el.textContent!;
    const needleIdx = findNthOccurrence(fullText, needle, occurrence);
    if (needleIdx === -1) return 0;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent!.length;
      if (pos <= needleIdx && needleIdx < pos + len) {
        const localIdx = needleIdx - pos;
        const range = document.createRange();
        range.setStart(node, localIdx);
        range.setEnd(node, Math.min(localIdx + 1, len));
        const lineRect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        return Math.max(0, lineRect.top - elRect.top);
      }
      pos += len;
    }
  } catch {
    // fall through
  }
  return 0;
}
