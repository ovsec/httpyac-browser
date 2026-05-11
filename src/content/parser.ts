import type { Block } from '../shared/types';

export function parseBlock(text: string, blockName: string | null): Block | null {
  const lines = text.split('\n');
  let i = 0;
  let name = blockName;
  const localVars: Record<string, string> = {};

  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }

    const nm = l.match(/^#\s*@name\s+(.+)$/i);
    if (nm) { name = nm[1].trim(); i++; continue; }

    const vm = l.match(/^@(\w+)\s*:?=\s*(.*)$/);
    if (vm) { localVars[vm[1]] = vm[2].trim(); i++; continue; }

    if (l.startsWith('#') || l.startsWith('//')) { i++; continue; }
    break;
  }

  if (i >= lines.length) return null;

  const rm = lines[i].trim().match(
    /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(https?:\/\/\S+|\/.*|\{\{[^}]+\}\}\S*)(?:\s+HTTP\/[\d.]+)?$/i
  );
  if (!rm) return null;

  const method = rm[1].toUpperCase();
  const url = rm[2];
  i++;

  const headers: Record<string, string> = {};
  while (i < lines.length && lines[i].trim() !== '') {
    const hm = lines[i].match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (hm) headers[hm[1].trim()] = hm[2].trim();
    i++;
  }
  i++;

  const bodyLines: string[] = [];
  const assertions: string[] = [];
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l.startsWith('??')) assertions.push(l.slice(2).trim());
    else bodyLines.push(lines[i]);
    i++;
  }

  return {
    name,
    method,
    url,
    headers,
    body: bodyLines.join('\n').trim() || null,
    assertions,
    localVars,
  };
}

export function parseText(text: string): Block[] {
  const found: Block[] = [];
  const parts = text.split(/(^###[^\n]*$)/m);

  // Hoist @var definitions from the preamble (before first ###) into every block
  const globalVars: Record<string, string> = {};
  if (parts[0]) {
    for (const line of parts[0].split('\n')) {
      const vm = line.trim().match(/^@(\w+)\s*:?=\s*(.*)$/);
      if (vm) globalVars[vm[1]] = vm[2].trim();
    }
    const r = parseBlock(parts[0], null);
    if (r) {
      r.localVars = { ...globalVars, ...r.localVars };
      found.push(r);
    }
  }

  for (let i = 1; i < parts.length; i += 2) {
    const nm = parts[i].match(/^###\s+(.+)$/);
    const r = parseBlock(parts[i + 1] || '', nm ? nm[1].trim() : null);
    if (r) {
      r.localVars = { ...globalVars, ...r.localVars };
      found.push(r);
    }
  }

  return found;
}
