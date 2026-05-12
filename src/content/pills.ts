import type { Block, Result } from '../shared/types';
import { esc, shortUrl } from '../shared/utils';
import { hasUnresolvedVars } from './variables';
import pillCss from './pills.css?raw';

export function renderPills(
  shadow: ShadowRoot,
  blocks: Block[],
  results: (Result | null)[],
  offsets: number[],
  _right = 8,
): void {
  shadow.innerHTML = `<style>${pillCss}</style>
    <div class="pills" role="toolbar" aria-label="HTTP request actions">
      ${blocks.map((b, i) => {
        const r = results[i];
        const top = (offsets?.[i] ?? 0) + 6;
        let cls = '', icon = '', label = '';

        if (!r) {
          cls = ''; icon = '<span class="icon">\u25B6</span>'; label = esc(b.method);
        } else if (r.state === 'running') {
          cls = 'running'; icon = '<span class="icon spin">\u21BB</span>'; label = esc(b.method);
        } else {
          const ar = r.assertResults ?? [];
          const aFail = ar.filter(a => !a.pass).length;
          const aBadge = ar.length
            ? `<span class="assert-badge ${aFail ? 'fail' : ''}">${aFail ? `\u2717${aFail}/${ar.length}` : `\u2713${ar.length}`}</span>`
            : '';
          if (r.ok) {
            cls = 'success'; icon = '<span class="icon">\u2713</span>';
            label = `${r.status}${aBadge}`;
          } else {
            cls = 'error'; icon = '<span class="icon">\u2717</span>';
            label = `${r.status > 0 ? r.status : 'ERR'}${aBadge}`;
          }
        }

        const warnCls = !r && hasUnresolvedVars(b) ? 'warn' : '';
        const warnTitle = warnCls ? ' title="Unresolved variables"' : '';
        const methodName = esc(b.method);
        const requestLabel = b.name ? `${methodName} ${esc(b.name)}` : `${methodName} ${esc(shortUrl(b.url))}`;

        return `<div class="pill-wrap ${cls} ${warnCls}" data-idx="${i}" style="top:${top}px;left:4px">
          <div class="pill" data-action="run" data-idx="${i}"${warnTitle}>
            <span class="dot"></span>
            ${icon}
            ${label}
          </div>
          <button class="details-btn" data-action="details" data-idx="${i}" aria-label="Details for ${requestLabel}" title="Details">\u2197</button>
        </div>`;
      }).join('')}
    </div>`;
}
