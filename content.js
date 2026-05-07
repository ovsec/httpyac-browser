(() => {
  if (window.__httpOwl) { window.__httpOwl.reinject(); return; }

  // ── Utilities ─────────────────────────────────────────────────────────────
  const esc = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function shortUrl(url) {
    try { const u = new URL(url); return u.pathname + (u.search || ''); }
    catch { return url.length > 50 ? url.slice(0, 50) + '…' : url; }
  }

  function formatBody(raw, ct) {
    if (!raw) return '(empty)';
    if (ct && ct.includes('json')) {
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch (_) {}
    }
    return raw.length > 5000 ? raw.slice(0, 5000) + '\n…(truncated)' : raw;
  }

  function buildCurl(req) {
    let s = `curl -X ${req.method} '${req.url}'`;
    for (const [k,v] of Object.entries(req.headers || {})) s += ` \\\n  -H '${k}: ${v}'`;
    if (req.body) s += ` \\\n  -d '${req.body.replace(/'/g,"'\\''")}'`;
    return s;
  }

  // ── Parser ────────────────────────────────────────────────────────────────
  function parseBlock(text, blockName) {
    const lines = text.split('\n');
    let i = 0, name = blockName;
    const localVars = {};
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) { i++; continue; }
      const nm = l.match(/^#\s*@name\s+(.+)$/i);
      if (nm) { name = nm[1].trim(); i++; continue; }
      // Inline variable: @var = value  or  @var := value (lazy)
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
    const method = rm[1].toUpperCase(), url = rm[2]; i++;
    const headers = {};
    while (i < lines.length && lines[i].trim() !== '') {
      const hm = lines[i].match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
      if (hm) headers[hm[1].trim()] = hm[2].trim();
      i++;
    }
    i++;
    const bodyLines = [], assertions = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (l.startsWith('??')) assertions.push(l.slice(2).trim());
      else bodyLines.push(lines[i]);
      i++;
    }
    return { name, method, url, headers, body: bodyLines.join('\n').trim() || null, assertions, localVars };
  }

  function parseText(text) {
    const found = [], parts = text.split(/(^###[^\n]*$)/m);

    // Hoist @var definitions from the preamble (before first ###) into every block.
    // parseBlock discards them when there's no HTTP request in the preamble.
    const globalVars = {};
    if (parts[0]) {
      for (const line of parts[0].split('\n')) {
        const vm = line.trim().match(/^@(\w+)\s*:?=\s*(.*)$/);
        if (vm) globalVars[vm[1]] = vm[2].trim();
      }
      const r = parseBlock(parts[0], null);
      if (r) { r.localVars = { ...globalVars, ...r.localVars }; found.push(r); }
    }

    for (let i = 1; i < parts.length; i += 2) {
      const nm = parts[i].match(/^###\s+(.+)$/);
      const r  = parseBlock(parts[i+1] || '', nm ? nm[1].trim() : null);
      if (r) { r.localVars = { ...globalVars, ...r.localVars }; found.push(r); }
    }
    return found;
  }

  // ── Assertion engine ──────────────────────────────────────────────────────
  // Resolve dot-path + array index from context object.
  // Supports: status, duration, body, body.foo.bar, body.list[0].id,
  //           header content-type  (space separator, not dot)
  function resolveCtx(ctx, rawPath) {
    const path = rawPath.trim();

    // "header <name>" – header lookup with space separator
    if (/^header\s+/i.test(path)) {
      const key = path.slice(7).trim().toLowerCase();
      const hdrs = ctx.header ?? {};
      return hdrs[key] ?? hdrs[Object.keys(hdrs).find(k => k.toLowerCase() === key)];
    }

    const parts = path.split('.');
    let val = ctx;
    for (const raw of parts) {
      if (val == null) return undefined;
      const arr = raw.match(/^(.+?)\[(\d+)\]$/);
      val = arr ? val[arr[1]]?.[+arr[2]] : val[raw];
    }
    return val;
  }

  function parseRhs(s) {
    const t = s.trim();
    if (t === 'null')      return null;
    if (t === 'true')      return true;
    if (t === 'false')     return false;
    if (t === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^["'].*["']$/.test(t))    return t.slice(1, -1);
    return t;
  }

  function evalOne(expr, ctx) {
    const e = expr.trim();

    // Unary / type checks  (no right-hand side)
    const unaryMatch = e.match(/^(.+?)\s+(exists|isTrue|isFalse|isNumber|isBoolean|isString|isArray)$/i);
    if (unaryMatch) {
      const val = resolveCtx(ctx, unaryMatch[1]);
      switch (unaryMatch[2].toLowerCase()) {
        case 'exists':    return { pass: val != null, actual: val };
        case 'istrue':    return { pass: val === true, actual: val };
        case 'isfalse':   return { pass: val === false, actual: val };
        case 'isnumber':  return { pass: typeof val === 'number', actual: typeof val };
        case 'isboolean': return { pass: typeof val === 'boolean', actual: typeof val };
        case 'isstring':  return { pass: typeof val === 'string', actual: typeof val };
        case 'isarray':   return { pass: Array.isArray(val), actual: typeof val };
      }
    }

    // Binary operators — longest first to avoid prefix collisions
    const OPS = ['startsWith','endsWith','includes','contains','matches','!=','==','<=','>=','<','>'];
    for (const op of OPS) {
      const sep  = ['<','>','==','!=','<=','>='].includes(op) ? ` ${op} ` : ` ${op} `;
      const idx  = e.indexOf(sep);
      if (idx === -1) continue;

      const lhs      = e.slice(0, idx).trim();
      const rhs      = e.slice(idx + sep.length);
      const actual   = resolveCtx(ctx, lhs);
      const expected = parseRhs(rhs);
      let pass;

      switch (op) {
        case '==':         pass = actual == expected; break;
        case '!=':         pass = actual != expected; break;
        case '<':          pass = Number(actual) < Number(expected); break;
        case '>':          pass = Number(actual) > Number(expected); break;
        case '<=':         pass = Number(actual) <= Number(expected); break;
        case '>=':         pass = Number(actual) >= Number(expected); break;
        case 'includes':
        case 'contains':
          pass = Array.isArray(actual)
            ? actual.includes(expected)
            : String(actual ?? '').includes(String(expected));
          break;
        case 'startsWith': pass = String(actual ?? '').startsWith(String(expected)); break;
        case 'endsWith':   pass = String(actual ?? '').endsWith(String(expected)); break;
        case 'matches':    try { pass = new RegExp(expected).test(String(actual ?? '')); } catch { pass = false; } break;
        default: pass = false;
      }
      return { pass, actual, expected, op };
    }

    // Bare path — truthy check
    const val = resolveCtx(ctx, e);
    return { pass: !!val, actual: val, expected: 'truthy' };
  }

  function evaluateAssertions(assertions, res) {
    if (!assertions?.length) return [];
    let parsed;
    try { parsed = JSON.parse(res.body); } catch { parsed = res.body ?? ''; }
    const ctx = { status: res.status, body: parsed, duration: res.time, header: res.headers ?? {} };
    return assertions.map(expr => {
      try   { return { expr, ...evalOne(expr, ctx) }; }
      catch (e) { return { expr, pass: false, actual: null, expected: null, error: e.message }; }
    });
  }

  // Find the Nth full-token occurrence of needle in text.
  // Skips substring matches: "GET .../users" inside "GET .../users/1"
  // by requiring the character after needle to be whitespace or end-of-string.
  function findNthOccurrence(text, needle, occurrence) {
    let searchFrom = 0, seen = 0;
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

  // Mirror technique for <textarea>: replicate its font/size/padding in a hidden
  // div, insert text up to needle, measure resulting height = Y offset of that line.
  function findOffsetInTextarea(el, needle, occurrence = 0) {
    const value    = el.value;
    const needleIdx = findNthOccurrence(value, needle, occurrence);
    if (needleIdx === -1) return 0;

    const cs     = getComputedStyle(el);
    const mirror = document.createElement('div');
    mirror.style.cssText = [
      'position:fixed', 'visibility:hidden', 'top:0', 'left:-99999px',
      'white-space:pre-wrap', 'word-wrap:break-word', 'box-sizing:border-box', 'overflow:hidden',
    ].join(';');
    mirror.style.width = el.offsetWidth + 'px';
    for (const p of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing',
                     'lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft']) {
      mirror.style[p] = cs[p];
    }

    const before = document.createElement('span');
    before.textContent = value.slice(0, needleIdx);
    const marker = document.createElement('span');
    marker.textContent = needle[0] || ' ';
    mirror.appendChild(before);
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const mRect  = mirror.getBoundingClientRect();
    const kRect  = marker.getBoundingClientRect();
    document.body.removeChild(mirror);
    return Math.max(0, kRect.top - mRect.top);
  }

  // Find the top-offset (px) of a block's METHOD URL line within el.
  // • textarea  → mirror-div technique (el.value, no DOM text nodes)
  // • pre/code/CodeMirror/GitHub → el.textContent + Range API
  //   Works when needle spans multiple syntax-highlight <span> tokens.
  // occurrence: skip first N matches (handles duplicate METHOD+URL in same block)
  function findBlockTopOffset(el, block, occurrence = 0) {
    const needle = block.method + ' ' + block.url;

    if (el.tagName === 'TEXTAREA') return findOffsetInTextarea(el, needle, occurrence);

    try {
      const fullText  = el.textContent; // concatenates all descendant text nodes
      const needleIdx = findNthOccurrence(fullText, needle, occurrence);
      if (needleIdx === -1) return 0;

      // Walk text nodes to find which one owns the character at needleIdx
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let pos = 0, node;
      while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (pos <= needleIdx && needleIdx < pos + len) {
          const localIdx = needleIdx - pos;
          const range = document.createRange();
          range.setStart(node, localIdx);
          range.setEnd(node, Math.min(localIdx + 1, len));
          const lineRect = range.getBoundingClientRect();
          const elRect   = el.getBoundingClientRect();
          return Math.max(0, lineRect.top - elRect.top);
        }
        pos += len;
      }
    } catch (_) {}
    return 0;
  }

  function systemVarValue(name) {
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

  // Cached copy of popup variables — kept in sync via storage listener
  let cachedVars = {};
  let _varVersion = 0;
  const _unresolvedCache = new WeakMap();
  chrome.storage.local.get('variables', ({ variables }) => { cachedVars = variables ?? {}; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.variables) {
      cachedVars = changes.variables.newValue ?? {};
      _varVersion++;
    }
  });

  function hasUnresolvedVars(block) {
    const cached = _unresolvedCache.get(block);
    if (cached && cached.v === _varVersion) return cached.r;

    const merged = { ...cachedVars, ...(block.localVars ?? {}) };
    const check = s => {
      if (!s) return false;
      const re = /\{\{(=?)([\s\S]*?)\}\}/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const eq = m[1], expr = m[2].trim();
        if (eq === '=') continue;
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

  function applyVars(req, vars) {
    // Block-level @var definitions override popup vars
    const merged = { ...vars, ...(req.localVars ?? {}) };

    const sub = s => String(s).replace(/\{\{(=?)([\s\S]*?)\}\}/g, (full, eq, inner) => {
      const expr = inner.trim();
      // {{= js expression }}
      if (eq === '=') {
        try { return String(Function(`'use strict'; return (${expr})`)() ?? ''); }
        catch { return full; }
      }
      // System variables: $uuid, $timestamp, $randomInt, $guid, $datetime, $localDatetime
      const sv = systemVarValue(expr);
      if (sv !== null) return sv;
      // Popup / inline vars
      return merged[expr] ?? full;
    });

    let url = sub(req.url);
    // @host auto-prepend: if URL is a relative path, prepend host variable
    if (url.startsWith('/') && merged['host']) {
      url = merged['host'].replace(/\/$/, '') + url;
    }

    return {
      ...req,
      url,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, sub(v)])),
      body:    req.body ? sub(req.body) : null,
    };
  }

  // ── Pill shadow CSS ───────────────────────────────────────────────────────
  const PILL_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :host { display: block; width: 100%; height: 100%; }

    .pills {
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
    }

    .pill-wrap {
      position: absolute;
      display: inline-flex;
      align-items: stretch;
      gap: 6px;
      pointer-events: auto;
      user-select: none;
    }

    .pill, .pill-btn {
      font-size: 11px;
      font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
      white-space: nowrap;
      letter-spacing: 0.02em;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 12px;
      background: rgba(13, 17, 23, 0.88);
      border: 1px solid rgba(48, 54, 61, 0.75);
      border-radius: 20px;
      color: rgba(139, 148, 158, 0.9);
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    .pill-wrap:hover .pill {
      background: #21262d;
      border-color: #8b949e;
      color: #e6edf3;
    }

    .pill-wrap.running .pill {
      background: rgba(13, 17, 23, 0.88);
      border-color: #388bfd;
      color: #58a6ff;
      animation: pulse-border 1.8s ease-in-out infinite;
    }
    .pill-wrap.success .pill {
      background: rgba(13, 17, 23, 0.88);
      border-color: #2ea043;
      color: #3fb950;
    }
    .pill-wrap.success:hover .pill { background: #161b22; }
    .pill-wrap.error .pill {
      background: rgba(13, 17, 23, 0.88);
      border-color: #da3633;
      color: #f85149;
    }
    .pill-wrap.error:hover .pill { background: #161b22; }
    .pill-wrap.warn .pill {
      background: rgba(13, 17, 23, 0.88);
      border-color: #9e6a03;
      color: #d29922;
    }
    .pill-wrap.warn:hover .pill { background: #161b22; }

    @keyframes pulse-border {
      0%, 100% { border-color: #388bfd; }
      50%       { border-color: #58a6ff; }
    }

    .dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .icon { display: inline-block; }
    .spin { animation: spin 0.65s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .assert-badge {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 8px;
      margin-left: 2px;
      font-weight: 600;
      background: #21262d;
      letter-spacing: 0;
    }
    .pill-wrap.success .assert-badge.fail { background: #7f1d1d22; color: #f85149; }

    /* ── action buttons slide-in ── */
    .pill-actions {
      display: inline-flex;
      align-items: stretch;
      gap: 5px;
      overflow: hidden;
      max-width: 0;
      opacity: 0;
      /* expand: delay 120ms so accidental passes don't trigger */
      transition: max-width 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.12s,
                  opacity   0.35s ease 0.18s;
      pointer-events: none;
    }
    .pill-wrap:hover .pill-actions {
      max-width: 200px;
      opacity: 1;
      pointer-events: auto;
      /* collapse faster, no delay */
      transition: max-width 0.3s cubic-bezier(0.55, 0, 1, 0.45),
                  opacity   0.2s ease;
    }

    .pill-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0 10px;
      background: rgba(13, 17, 23, 0.88);
      border: 1px solid #30363d;
      border-radius: 16px;
      color: #8b949e;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .pill-btn.btn-run:hover {
      background: #238636;
      border-color: #2ea043;
      color: #fff;
    }
    .pill-btn.btn-details:hover {
      background: #21262d;
      border-color: #8b949e;
      color: #e6edf3;
    }
  `;

  // ── Overlay (modal detail) CSS ────────────────────────────────────────────
  const OVERLAY_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 13px;
      animation: fade-in 0.14s ease;
    }
    .backdrop.hidden { display: none; }

    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      width: 100%;
      max-width: 680px;
      max-height: 84vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 30px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03);
      animation: rise 0.16s ease;
      overflow: hidden;
    }
    @keyframes rise {
      from { transform: translateY(12px) scale(0.98); opacity: 0; }
      to   { transform: translateY(0)    scale(1);    opacity: 1; }
    }

    /* Header */
    .card-head {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      padding: 13px 16px;
      border-bottom: 1px solid #30363d;
      background: #0d1117;
      flex-shrink: 0;
    }
    .badge {
      font-size: 10px; font-weight: 700;
      padding: 2px 7px; border-radius: 4px;
      font-family: monospace; letter-spacing: 0.05em; flex-shrink: 0;
    }
    .m-GET    { background: #0d419d28; color: #58a6ff; }
    .m-POST   { background: #14532d28; color: #3fb950; }
    .m-PUT    { background: #78350f28; color: #d29922; }
    .m-DELETE { background: #7f1d1d28; color: #f85149; }
    .m-PATCH  { background: #4c1d9528; color: #bc8cff; }
    .m-HEAD,.m-OPTIONS { background: #1c3a4a28; color: #79c0ff; }
    .m-OTHER  { background: #21262d; color: #8b949e; }

    .req-name { color: #8b949e; font-size: 11.5px; flex-shrink: 0; }
    .req-url  {
      font-family: 'Cascadia Code', Consolas, monospace;
      font-size: 12px; color: #e6edf3;
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      min-width: 0;
    }
    .status-code {
      font-weight: 700; font-family: monospace; font-size: 13px; flex-shrink: 0;
    }
    .s-2xx { color: #3fb950; }
    .s-3xx { color: #58a6ff; }
    .s-4xx { color: #d29922; }
    .s-5xx { color: #f85149; }
    .s-net { color: #8b949e; }
    .res-time { color: #8b949e; font-size: 11px; flex-shrink: 0; }

    .close-btn {
      margin-left: auto; flex-shrink: 0;
      padding: 3px 9px;
      background: transparent; border: 1px solid #30363d; border-radius: 5px;
      color: #8b949e; font-size: 12px; cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
    }
    .close-btn:hover { color: #f85149; border-color: rgba(248,81,73,0.6); }

    /* Body */
    .card-body { flex: 1; overflow-y: auto; }
    .card-body::-webkit-scrollbar { width: 5px; }
    .card-body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

    .section { padding: 13px 16px; border-bottom: 1px solid #21262d; }
    .section:last-child { border-bottom: none; }

    .sec-title {
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.09em;
      text-transform: uppercase; color: #8b949e; margin-bottom: 9px;
    }

    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 4px 10px; margin-bottom: 6px; }
    .k  { color: #8b949e; font-size: 12px; white-space: nowrap; padding-top: 1px; }
    .v  {
      font-family: 'Cascadia Code', Consolas, monospace;
      font-size: 12px; color: #e6edf3; word-break: break-all;
    }

    .sub { font-size: 11px; color: #6b7280; margin: 10px 0 5px; font-weight: 500; }

    pre.code {
      background: #0d1117;
      border: 1px solid #21262d;
      border-radius: 6px;
      padding: 9px 11px;
      font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
      font-size: 11px; color: #e6edf3;
      white-space: pre-wrap; word-break: break-all;
      max-height: 260px; overflow-y: auto; line-height: 1.55;
      margin: 0;
    }
    pre.code::-webkit-scrollbar { width: 4px; }
    pre.code::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }

    .muted { color: #6b7280; font-size: 12px; font-style: italic; }

    .assert-row {
      display: grid;
      grid-template-columns: 16px 1fr;
      gap: 4px 8px;
      padding: 5px 0;
      border-bottom: 1px solid #21262d;
      align-items: start;
      font-size: 12px;
    }
    .assert-row:last-child { border-bottom: none; }
    .a-icon { font-weight: 700; font-size: 12px; }
    .a-icon.ok  { color: #3fb950; }
    .a-icon.err { color: #f85149; }
    .a-expr { font-family: monospace; font-size: 11px; color: #c9d1d9; }
    .a-got  {
      grid-column: 2;
      font-family: monospace; font-size: 10.5px;
      color: #8b949e; margin-top: 2px;
    }
    .a-got code { color: #f85149; background: #21262d; padding: 1px 4px; border-radius: 3px; }

    .running-msg {
      display: flex; align-items: center; gap: 8px;
      color: #58a6ff; font-size: 12px; padding: 4px 0;
    }
    .running-spin { animation: spin 0.65s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Footer */
    .card-foot {
      display: flex; gap: 7px; align-items: center;
      padding: 11px 16px;
      border-top: 1px solid #30363d;
      background: #0d1117;
      flex-shrink: 0;
    }
    .foot-btn {
      padding: 5px 12px;
      background: #21262d; border: 1px solid #30363d; border-radius: 6px;
      color: #c9d1d9; font-size: 12px; cursor: pointer; font-family: inherit;
      transition: background 0.12s;
    }
    .foot-btn:hover:not(:disabled) { background: #30363d; }
    .foot-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .foot-run {
      background: #0f2d16; border-color: #238636; color: #3fb950;
    }
    .foot-run:hover:not(:disabled) { background: #238636; color: #fff; }
    .ml { margin-left: auto; }
  `;

  // ── Global overlay ────────────────────────────────────────────────────────
  let overlayHost, overlayShadow;
  let activeDetail = null; // { entry, idx }

  function createOverlay() {
    overlayHost = document.createElement('div');
    overlayHost.setAttribute('data-http-owl-overlay', '');
    overlayHost.style.cssText = 'all:initial;';
    document.body.appendChild(overlayHost);
    overlayShadow = overlayHost.attachShadow({ mode: 'open' });
    overlayShadow.innerHTML = `<style>${OVERLAY_CSS}</style><div class="backdrop hidden"></div>`;

    overlayShadow.addEventListener('click', async e => {
      if (e.target.classList.contains('backdrop')) { hideOverlay(); return; }
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;

      if (action === 'close') { hideOverlay(); return; }

      if (action === 'copy-res' && activeDetail) {
        const r = activeDetail.entry.results[activeDetail.idx];
        navigator.clipboard.writeText(r?.body || '').catch(() => {});
        return;
      }
      if (action === 'copy-curl' && activeDetail) {
        const { variables: vars = {} } = await chrome.storage.local.get('variables');
        const b = activeDetail.entry.blocks[activeDetail.idx];
        navigator.clipboard.writeText(buildCurl(applyVars(b, vars))).catch(() => {});
        return;
      }
      if (action === 'run' && activeDetail) {
        runOne(activeDetail.entry, activeDetail.idx);
        return;
      }
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideOverlay(); });
  }

  async function showOverlay(entry, idx) {
    activeDetail = { entry, idx, resolvedBlock: null };
    renderOverlay();
    overlayShadow.querySelector('.backdrop').classList.remove('hidden');
    const { variables: vars = {} } = await chrome.storage.local.get('variables');
    if (activeDetail?.entry === entry && activeDetail?.idx === idx) {
      activeDetail.resolvedBlock = applyVars(entry.blocks[idx], vars);
      renderOverlay();
    }
  }

  function hideOverlay() {
    overlayShadow?.querySelector('.backdrop')?.classList.add('hidden');
    activeDetail = null;
  }

  function renderOverlay() {
    if (!activeDetail) return;
    const { entry, idx } = activeDetail;
    const block    = entry.blocks[idx];
    const resolved = activeDetail.resolvedBlock ?? block;
    const result   = entry.results[idx];
    const method   = block.method;
    const mCls     = ['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'].includes(method)
                     ? `m-${method}` : 'm-OTHER';

    const code    = result?.status ?? 0;
    const running = result?.state === 'running';
    const hasRes  = result && !running;
    const scCls   = code === 0 ? 's-net' : code < 300 ? 's-2xx' : code < 400 ? 's-3xx' : code < 500 ? 's-4xx' : 's-5xx';

    const reqHeaders = Object.entries(resolved.headers || {}).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)';

    const responseSection = (() => {
      if (running) return `
        <div class="section">
          <div class="sec-title">Response</div>
          <div class="running-msg"><span class="running-spin">↻</span> Executing…</div>
        </div>`;
      if (!result) return `
        <div class="section">
          <p class="muted">Not yet run. Click ▶ Run below.</p>
        </div>`;
      const resHeaders = Object.entries(result.headers || {}).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)';
      const body = code === 0 ? result.statusText : formatBody(result.body || '', result.headers?.['content-type'] || '');
      return `
        <div class="section">
          <div class="sec-title">Response</div>
          <div class="kv">
            <span class="k">Status</span>
            <span class="v ${scCls}">${code === 0 ? 'Network Error' : `${code} ${esc(result.statusText)}`}</span>
          </div>
          ${code > 0 ? `<div class="kv"><span class="k">Time</span><span class="v">${result.time}ms</span></div>` : ''}
          <div class="sub">Headers</div>
          <pre class="code">${esc(resHeaders)}</pre>
          <div class="sub">Body</div>
          <pre class="code">${esc(body)}</pre>
        </div>`;
    })();

    const ar = result?.assertResults ?? [];
    const assertSection = ar.length === 0 ? '' : (() => {
      const pass = ar.filter(a => a.pass).length;
      return `
        <div class="section">
          <div class="sec-title">Assertions ${pass}/${ar.length}</div>
          ${ar.map(a => `
            <div class="assert-row">
              <span class="a-icon ${a.pass ? 'ok' : 'err'}">${a.pass ? '✓' : '✗'}</span>
              <span class="a-expr">${esc(a.expr)}</span>
              ${!a.pass ? `<div class="a-got">got: <code>${esc(String(a.actual ?? 'undefined'))}</code></div>` : ''}
            </div>`).join('')}
        </div>`;
    })();

    const html = `
      <div class="card">
        <div class="card-head">
          <span class="badge ${mCls}">${esc(method)}</span>
          ${block.name ? `<span class="req-name">${esc(block.name)}</span>` : ''}
          <span class="req-url" title="${esc(resolved.url)}">${esc(resolved.url)}</span>
          ${hasRes && code > 0 ? `<span class="status-code ${scCls}">${code} ${esc(result.statusText)}</span>` : ''}
          ${hasRes && code > 0 ? `<span class="res-time">${result.time}ms</span>` : ''}
          <button class="close-btn" data-action="close">✕</button>
        </div>
        <div class="card-body">
          <div class="section">
            <div class="sec-title">Request</div>
            <div class="kv">
              <span class="k">Method</span><span class="v">${esc(method)}</span>
            </div>
            <div class="kv">
              <span class="k">URL</span><span class="v">${esc(resolved.url)}</span>
            </div>
            <div class="sub">Headers</div>
            <pre class="code">${esc(reqHeaders)}</pre>
            ${resolved.body ? `<div class="sub">Body</div><pre class="code">${esc(resolved.body)}</pre>` : ''}
          </div>
          ${responseSection}
          ${assertSection}
        </div>
        <div class="card-foot">
          ${hasRes && result.body ? `<button class="foot-btn" data-action="copy-res">Copy Response</button>` : ''}
          <button class="foot-btn" data-action="copy-curl">Copy as cURL</button>
          <button class="foot-btn foot-run" data-action="run" ${running ? 'disabled' : ''}>▶ Run</button>
          <button class="foot-btn ml" data-action="close">Close</button>
        </div>
      </div>`;

    overlayShadow.querySelector('.backdrop').innerHTML = html;
  }

  // ── Pill render ───────────────────────────────────────────────────────────
  function renderPills(shadow, blocks, results, offsets, right = 8) {
    shadow.innerHTML = `<style>${PILL_CSS}</style>
      <div class="pills">
        ${blocks.map((b, i) => {
          const r   = results[i];
          const top = (offsets?.[i] ?? 0) + 6;
          let cls = '', icon = '', label = '';

          if (!r) {
            cls = ''; icon = `<span class="icon">▶</span>`; label = esc(b.method);
          } else if (r.state === 'running') {
            cls = 'running'; icon = `<span class="icon spin">↻</span>`; label = esc(b.method);
          } else {
            const ar       = r.assertResults ?? [];
            const aFail    = ar.filter(a => !a.pass).length;
            const aBadge   = ar.length
              ? `<span class="assert-badge ${aFail ? 'fail' : ''}">${aFail ? `✗${aFail}/${ar.length}` : `✓${ar.length}`}</span>`
              : '';
            if (r.ok) {
              cls = 'success'; icon = `<span class="icon">✓</span>`;
              label = `${r.status}${aBadge}`;
            } else {
              cls = 'error'; icon = `<span class="icon">✗</span>`;
              label = `${r.status > 0 ? r.status : 'ERR'}${aBadge}`;
            }
          }

          const warnCls = !r && hasUnresolvedVars(b) ? 'warn' : '';
          const warnTitle = warnCls ? ' title="Unresolved variables"' : '';

          return `<div class="pill-wrap ${cls} ${warnCls}" data-idx="${i}" style="top:${top}px;left:4px">
            <div class="pill"${warnTitle}>
              <span class="dot"></span>
              ${icon}
              ${label}
            </div>
            <div class="pill-actions">
              <button class="pill-btn btn-run" data-action="run" data-idx="${i}">▶ Run</button>
              <button class="pill-btn btn-details" data-action="details" data-idx="${i}">↗ Details</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // ── Runner ────────────────────────────────────────────────────────────────
  const registry = [];

  async function runOne(entry, i) {
    entry.results[i] = { state: 'running' };
    entry.render();
    if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();

    const { variables: vars = {} } = await chrome.storage.local.get('variables');
    const block = entry.blocks[i];
    const merged = { ...vars, ...(block.localVars ?? {}) };
    const res = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'EXECUTE', request: applyVars(block, vars), vars: merged }, result => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(result);
      });
    });

    if (!res) {
      entry.results[i] = { state: 'error', ok: false, status: 0, statusText: 'Extension context lost — reload page', time: 0, headers: {}, body: '', assertResults: [] };
      entry.render();
      if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();
      return;
    }

    const assertResults = evaluateAssertions(block.assertions, res);
    const assertsPass   = assertResults.every(a => a.pass);
    const overallOk     = res.ok && assertsPass;
    entry.results[i] = { state: overallOk ? 'done' : 'error', ...res, ok: overallOk, httpOk: res.ok, assertResults };
    entry.render();
    if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();
    updateGlobalIcon();
  }

  function updateGlobalIcon() {
    const all = registry.flatMap(e => e.results.filter(Boolean));
    if (!all.length) return;
    if (all.some(r => r.state === 'running')) {
      chrome.runtime.sendMessage({ type: 'SET_ICON', state: 'running' }, () => { chrome.runtime.lastError; });
    } else {
      chrome.runtime.sendMessage({ type: 'SET_ICON', state: all.every(r => r.ok) ? 'success' : 'error' }, () => { chrome.runtime.lastError; });
    }
  }

  // ── Injection ─────────────────────────────────────────────────────────────
  function injectForElement(el, blocks, precomputedOffsets) {
    const entry = { shadow: null, blocks, results: new Array(blocks.length).fill(null), el, wrapper: null };

    // Wrapper kept so SCROLL_TO / scrollIntoView still works
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-http-owl-wrapper', '');
    wrapper.style.cssText = 'position:relative;display:block;';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    entry.wrapper = wrapper;

    // Measure offsets BEFORE DOM mutation so the layout read doesn't force reflow.
    entry.offsets = precomputedOffsets ?? blocks.map((b, i) => {
      const occurrence = blocks.slice(0, i).filter(p => p.method === b.method && p.url === b.url).length;
      return findBlockTopOffset(el, b, occurrence);
    });

    const pillHost = document.createElement('div');
    pillHost.setAttribute('data-http-owl', '');
    pillHost.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible;';
    wrapper.appendChild(pillHost);
    entry.shadow = pillHost.attachShadow({ mode: 'open' });

    // Pills are position:absolute inside the wrapper — track content on scroll automatically.
    entry.render = () => {
      if (!el.isConnected) return;
      renderPills(entry.shadow, entry.blocks, entry.results, entry.offsets, 0);
    };

    requestAnimationFrame(() => entry.render());
    registry.push(entry);

    entry.shadow.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.action === 'run') runOne(entry, idx);
      else if (btn.dataset.action === 'details') showOverlay(entry, idx);
    });
  }

  // Confluence (and other wikis) render ### as <h2>/<h3>/<h4>.
  // Walk forward from the heading to find the nearest code block,
  // skipping at most a couple of blank/wrapper elements.
  function findNextCodeEl(heading) {
    let el = heading.nextElementSibling, hops = 0;
    while (el && hops < 3) {
      if (el.matches('h1,h2,h3,h4,h5,h6')) break;
      if (el.matches('pre, code')) return el;
      const inner = el.querySelector('pre, code'); // e.g. Confluence <div class="code-panel">
      if (inner) return inner;
      el = el.nextElementSibling;
      hops++;
    }
    return null;
  }

  function injectAll() {
    hideOverlay();

    // Undo previous wrappers: move original elements back, then remove wrappers
    document.querySelectorAll('[data-http-owl-wrapper]').forEach(wrapper => {
      Array.from(wrapper.childNodes).forEach(child => {
        if (child.nodeType === 1 && !child.hasAttribute('data-http-owl')) {
          wrapper.parentNode.insertBefore(child, wrapper);
        }
      });
      wrapper.remove();
    });
    // Remove body-level pill hosts (position:fixed overlays)
    document.querySelectorAll('[data-http-owl]').forEach(el => el.remove());
    document.querySelectorAll('[data-http-owl-done]').forEach(el => {
      el.removeAttribute('data-http-owl-done');
    });
    registry.length = 0;

    let count = 0;

    // ── Phase 1: all layout reads (before any DOM mutations) ──────────────────

    // Strategy 3 (GitHub blob): measure cell rects NOW, before injectForElement
    // mutates the DOM and would force a reflow on these reads.
    let githubInject = null;
    {
      const codeCells = Array.from(
        document.querySelectorAll(
          'td.blob-code, td.js-file-line, td[id^="LC"], td.react-code-file-line'
        )
      );
      if (codeCells.length) {
        const table = codeCells[0].closest('table');
        if (table && !table.dataset.httpOwlDone) {
          const lines = codeCells.map(td => td.textContent);
          const blocks = parseText(lines.join('\n'));
          if (blocks.length) {
            const tableRect = table.getBoundingClientRect();
            const lineOffsets = codeCells.map(td => td.getBoundingClientRect().top - tableRect.top);
            const blockOffsets = blocks.map((block, bi) => {
              const needle = block.method + ' ' + block.url;
              const skip = blocks.slice(0, bi).filter(
                p => p.method === block.method && p.url === block.url
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
            githubInject = { table, blocks, blockOffsets };
          }
        }
      }
    }

    // ── Phase 2: all DOM mutations ────────────────────────────────────────────

    // Strategy 1: code blocks containing inline ### separators
    document.querySelectorAll('pre, code, textarea').forEach(el => {
      if (el.tagName === 'CODE' && el.closest('pre')) return;
      if (el.dataset.httpOwlDone) return;
      // Skip off-screen hidden textareas (e.g. GitHub's read-only-cursor-text-area).
      // checkVisibility() avoids a forced reflow; offsetWidth fallback for older browsers.
      if (el.tagName === 'TEXTAREA') {
        const hidden = el.checkVisibility
          ? !el.checkVisibility()
          : (!el.offsetWidth && !el.offsetHeight);
        if (hidden) {
          el.dataset.httpOwlDone = '1';
          return;
        }
      }
      const text   = el.value ?? el.textContent ?? '';
      const blocks = parseText(text);
      if (!blocks.length) return;
      el.dataset.httpOwlDone = '1';
      injectForElement(el, blocks);
      count += blocks.length;
    });

    // Strategy 2: Confluence / wiki pages where ### → <h2>/<h3>/<h4> + <pre>
    document.querySelectorAll('h2, h3, h4').forEach(heading => {
      const name   = heading.textContent.trim();
      if (!name) return;
      const codeEl = findNextCodeEl(heading);
      if (!codeEl || codeEl.dataset.httpOwlDone) return;
      const text   = codeEl.value ?? codeEl.textContent ?? '';
      const block  = parseBlock(text.trim(), name);
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

  function getStats() {
    const flat = registry.flatMap(e => e.blocks.map((block, i) => ({ block, result: e.results[i] })));
    return {
      total:    flat.length,
      done:     flat.filter(({result: r}) => r && r.state !== 'running').length,
      ok:       flat.filter(({result: r}) => r?.ok).length,
      err:      flat.filter(({result: r}) => r && !r.ok && r.state !== 'running').length,
      requests: flat.map(({ block, result: r }) => ({
        method:      block.method,
        url:         block.url,
        name:        block.name ?? null,
        state:       r?.state      ?? null,
        ok:          r?.ok         ?? null,
        httpOk:      r?.httpOk     ?? null,
        status:      r?.status     ?? null,
        statusText:  r?.statusText ?? null,
        time:        r?.time       ?? null,
        assertTotal: block.assertions?.length ?? 0,
        assertFail:  r?.assertResults?.filter(a => !a.pass).length ?? 0,
      })),
    };
  }

  function flatEntry(index) {
    return registry.flatMap(e => e.blocks.map((_, i) => ({ e, i })))[index] ?? null;
  }

  // ── Public API + messages ─────────────────────────────────────────────────
  window.__httpOwl = {
    reinject: injectAll,
    getStats,
    runAll: () => Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i)))),
  };

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'SCAN') {
      reply({ count: injectAll() });
    } else if (msg.type === 'RUN_ALL') {
      window.__httpOwl.runAll().then(() => reply({ ok: true }));
      return true;
    } else if (msg.type === 'RUN_ONE') {
      const item = flatEntry(msg.index);
      if (item) runOne(item.e, item.i).then(() => reply(getStats()));
      return true;
    } else if (msg.type === 'SCROLL_TO') {
      flatEntry(msg.index)?.e.wrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reply({ ok: true });
    } else if (msg.type === 'STATS') {
      reply(getStats());
    } else if (msg.type === 'GET_REPORT') {
      chrome.storage.local.get('variables').then(({ variables: vars = {} }) => {
        const rows = registry.flatMap(e => e.blocks.map((block, i) => {
          const result   = e.results[i];
          const resolved = applyVars(block, vars);
          return {
            method:          block.method,
            name:            block.name ?? null,
            url:             block.url,
            resolvedUrl:     resolved.url,
            headers:         block.headers,
            resolvedHeaders: resolved.headers,
            body:            block.body,
            resolvedBody:    resolved.body,
            assertions:      block.assertions ?? [],
            state:           result?.state         ?? null,
            ok:              result?.ok             ?? null,
            status:          result?.status         ?? null,
            statusText:      result?.statusText     ?? null,
            time:            result?.time           ?? null,
            resHeaders:      result?.headers        ?? {},
            resBody:         result?.body           ?? null,
            assertResults:   result?.assertResults  ?? [],
          };
        }));
        reply({ requests: rows });
      });
      return true;
    }
  });

  createOverlay();
  try { injectAll(); } catch (e) { console.warn('[httpOwl] init scan error', e); }


  // Re-scan when SPA (Confluence, GitHub, etc.) renders content after document_idle.
  // Only fires if unprocessed code elements exist; debounced to avoid thrashing.
  {
    let _t = null;
    new MutationObserver(() => {
      clearTimeout(_t);
      _t = setTimeout(() => {
        _t = null;
        if (document.querySelector(
          'pre:not([data-http-owl-done]),' +
          'code:not(pre code):not([data-http-owl-done]),' +
          'textarea:not([data-http-owl-done])'
        )) { try { injectAll(); } catch (e) { console.warn('[httpOwl] re-scan error', e); } }
      }, 600);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

})();
