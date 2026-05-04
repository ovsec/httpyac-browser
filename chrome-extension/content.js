(() => {
  if (window.__httpScanner) { window.__httpScanner.reinject(); return; }

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
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) { i++; continue; }
      const nm = l.match(/^#\s*@name\s+(.+)$/i);
      if (nm) { name = nm[1].trim(); i++; continue; }
      if (l.startsWith('#') || l.startsWith('//')) { i++; continue; }
      break;
    }
    if (i >= lines.length) return null;
    const rm = lines[i].trim().match(
      /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(https?:\/\/\S+)(?:\s+HTTP\/[\d.]+)?$/i
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
    // Collect body lines and ?? assertion lines (can be interleaved at end)
    const bodyLines = [], assertions = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (l.startsWith('??')) assertions.push(l.slice(2).trim());
      else bodyLines.push(lines[i]);
      i++;
    }
    return { name, method, url, headers, body: bodyLines.join('\n').trim() || null, assertions };
  }

  function parseText(text) {
    const found = [], parts = text.split(/(^###[^\n]*$)/m);
    if (parts[0]) { const r = parseBlock(parts[0], null); if (r) found.push(r); }
    for (let i = 1; i < parts.length; i += 2) {
      const nm = parts[i].match(/^###\s+(.+)$/);
      const r  = parseBlock(parts[i+1] || '', nm ? nm[1].trim() : null);
      if (r) found.push(r);
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

  function applyVars(req, vars) {
    const sub = s => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
    return {
      ...req,
      url:     sub(req.url),
      headers: Object.fromEntries(Object.entries(req.headers).map(([k,v]) => [k,sub(v)])),
      body:    req.body ? sub(req.body) : null,
    };
  }

  // ── Pill shadow CSS ───────────────────────────────────────────────────────
  const PILL_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .pills {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      padding: 8px;
      pointer-events: none;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: rgba(13, 17, 23, 0.78);
      border: 1px solid rgba(48, 54, 61, 0.65);
      border-radius: 20px;
      color: rgba(139, 148, 158, 0.85);
      font-size: 11px;
      font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
      cursor: pointer;
      pointer-events: auto;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s;
      user-select: none;
      white-space: nowrap;
      letter-spacing: 0.02em;
    }
    .pill:hover {
      background: rgba(22, 27, 34, 0.95);
      border-color: rgba(88, 166, 255, 0.45);
      color: #c9d1d9;
    }

    .pill.running {
      background: rgba(23, 42, 100, 0.55);
      border-color: rgba(59, 130, 246, 0.75);
      color: #79b8ff;
      animation: glow-blue 1.5s ease-in-out infinite;
    }
    .pill.success {
      background: rgba(18, 68, 40, 0.65);
      border-color: rgba(63, 185, 80, 0.8);
      color: #56d364;
      box-shadow: 0 0 10px rgba(63, 185, 80, 0.15);
    }
    .pill.success:hover {
      background: rgba(22, 90, 50, 0.8);
      border-color: #3fb950;
    }
    .pill.error {
      background: rgba(100, 22, 22, 0.6);
      border-color: rgba(248, 81, 73, 0.8);
      color: #ff7b72;
      box-shadow: 0 0 10px rgba(248, 81, 73, 0.15);
    }
    .pill.error:hover {
      background: rgba(130, 24, 24, 0.8);
      border-color: #f85149;
    }

    @keyframes glow-blue {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.35); }
      50%       { box-shadow: 0 0 12px 2px rgba(59,130,246,0.12); }
    }

    .dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
      opacity: 0.75;
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
      background: rgba(255,255,255,0.08);
      letter-spacing: 0;
    }
    .pill.success .assert-badge.fail { background: rgba(248,81,73,0.25); color: #ff7b72; }
    .pill.error   .assert-badge      { background: rgba(255,255,255,0.08); }
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
    overlayHost.setAttribute('data-http-scanner-overlay', '');
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

  function showOverlay(entry, idx) {
    activeDetail = { entry, idx };
    renderOverlay();
    overlayShadow.querySelector('.backdrop').classList.remove('hidden');
  }

  function hideOverlay() {
    overlayShadow?.querySelector('.backdrop')?.classList.add('hidden');
    activeDetail = null;
  }

  function renderOverlay() {
    if (!activeDetail) return;
    const { entry, idx } = activeDetail;
    const block  = entry.blocks[idx];
    const result = entry.results[idx];
    const method = block.method;
    const mCls   = ['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'].includes(method)
                   ? `m-${method}` : 'm-OTHER';

    const code    = result?.status ?? 0;
    const running = result?.state === 'running';
    const hasRes  = result && !running;
    const scCls   = code === 0 ? 's-net' : code < 300 ? 's-2xx' : code < 400 ? 's-3xx' : code < 500 ? 's-4xx' : 's-5xx';

    const reqHeaders = Object.entries(block.headers || {}).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)';

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
          <span class="req-url" title="${esc(block.url)}">${esc(block.url)}</span>
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
              <span class="k">URL</span><span class="v">${esc(block.url)}</span>
            </div>
            <div class="sub">Headers</div>
            <pre class="code">${esc(reqHeaders)}</pre>
            ${block.body ? `<div class="sub">Body</div><pre class="code">${esc(block.body)}</pre>` : ''}
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
  function renderPills(shadow, blocks, results) {
    shadow.innerHTML = `<style>${PILL_CSS}</style>
      <div class="pills">
        ${blocks.map((b, i) => {
          const r = results[i];
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

          return `<div class="pill ${cls}" data-idx="${i}"
                       title="Click: run  ·  Double-click: details">
            <span class="dot"></span>
            ${icon}
            ${label}
          </div>`;
        }).join('')}
      </div>`;
  }

  // ── Runner ────────────────────────────────────────────────────────────────
  const registry = [];

  async function runOne(entry, i) {
    entry.results[i] = { state: 'running' };
    renderPills(entry.shadow, entry.blocks, entry.results);
    if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();

    const { variables: vars = {} } = await chrome.storage.local.get('variables');
    const block = entry.blocks[i];
    const res = await chrome.runtime.sendMessage({
      type: 'EXECUTE',
      request: applyVars(block, vars),
    });

    const assertResults = evaluateAssertions(block.assertions, res);
    const assertsPass   = assertResults.every(a => a.pass);
    const overallOk     = res.ok && assertsPass;
    entry.results[i] = { state: overallOk ? 'done' : 'error', ...res, ok: overallOk, httpOk: res.ok, assertResults };
    renderPills(entry.shadow, entry.blocks, entry.results);
    if (activeDetail?.entry === entry && activeDetail?.idx === i) renderOverlay();
    updateGlobalIcon();
  }

  function updateGlobalIcon() {
    const all = registry.flatMap(e => e.results.filter(Boolean));
    if (!all.length) return;
    if (all.some(r => r.state === 'running')) {
      chrome.runtime.sendMessage({ type: 'SET_ICON', state: 'running' });
    } else {
      chrome.runtime.sendMessage({ type: 'SET_ICON', state: all.every(r => r.ok) ? 'success' : 'error' });
    }
  }

  // ── Injection ─────────────────────────────────────────────────────────────
  function injectForElement(el, blocks) {
    const entry = { shadow: null, blocks, results: new Array(blocks.length).fill(null), wrapper: null };

    // Wrap element so we can absolutely-position pills inside
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-http-scanner-wrapper', '');
    wrapper.style.cssText = 'position:relative;display:block;';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    entry.wrapper = wrapper;

    const pillHost = document.createElement('div');
    pillHost.setAttribute('data-http-scanner', '');
    pillHost.style.cssText = 'position:absolute;top:0;right:0;z-index:100;pointer-events:none;';
    wrapper.appendChild(pillHost);

    entry.shadow = pillHost.attachShadow({ mode: 'open' });
    renderPills(entry.shadow, blocks, entry.results);
    registry.push(entry);

    // Debounce single-click so dblclick can cancel it
    let clickTimer = null;

    entry.shadow.addEventListener('click', e => {
      const pill = e.target.closest('[data-idx]');
      if (!pill) return;
      const idx = parseInt(pill.dataset.idx);
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => runOne(entry, idx), 220);
    });

    entry.shadow.addEventListener('dblclick', e => {
      const pill = e.target.closest('[data-idx]');
      if (!pill) return;
      clearTimeout(clickTimer);
      showOverlay(entry, parseInt(pill.dataset.idx));
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
    document.querySelectorAll('[data-http-scanner-wrapper]').forEach(wrapper => {
      Array.from(wrapper.childNodes).forEach(child => {
        if (child.nodeType === 1 && !child.hasAttribute('data-http-scanner')) {
          wrapper.parentNode.insertBefore(child, wrapper);
        }
      });
      wrapper.remove();
    });
    document.querySelectorAll('[data-http-scanner-done]').forEach(el => {
      el.removeAttribute('data-http-scanner-done');
    });
    registry.length = 0;

    let count = 0;

    // Strategy 1: code blocks containing inline ### separators
    document.querySelectorAll('pre, code, textarea').forEach(el => {
      if (el.tagName === 'CODE' && el.closest('pre')) return;
      if (el.dataset.httpScannerDone) return;
      const text   = el.value ?? el.textContent ?? '';
      const blocks = parseText(text);
      if (!blocks.length) return;
      el.dataset.httpScannerDone = '1';
      injectForElement(el, blocks);
      count += blocks.length;
    });

    // Strategy 2: Confluence / wiki pages where ### → <h2>/<h3>/<h4> + <pre>
    document.querySelectorAll('h2, h3, h4').forEach(heading => {
      const name   = heading.textContent.trim();
      if (!name) return;
      const codeEl = findNextCodeEl(heading);
      if (!codeEl || codeEl.dataset.httpScannerDone) return;
      const text   = codeEl.value ?? codeEl.textContent ?? '';
      const block  = parseBlock(text.trim(), name);
      if (!block) return;
      codeEl.dataset.httpScannerDone = '1';
      injectForElement(codeEl, [block]);
      count++;
    });

    chrome.runtime.sendMessage({ type: 'SET_ICON', state: 'default' });
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
  window.__httpScanner = {
    reinject: injectAll,
    getStats,
    runAll: () => Promise.all(registry.flatMap(e => e.blocks.map((_, i) => runOne(e, i)))),
  };

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'SCAN') {
      reply({ count: injectAll() });
    } else if (msg.type === 'RUN_ALL') {
      window.__httpScanner.runAll().then(() => reply({ ok: true }));
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
    }
  });

  createOverlay();
  injectAll();
})();
