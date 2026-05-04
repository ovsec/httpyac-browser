let variables = {};

const $ = id => document.getElementById(id);

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function rescan() {
  const tab = await getTab();
  $('rescanBtn').disabled = true;
  $('rescanBtn').textContent = '…';
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN' }).catch(() => null);
    const stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
    if (stats) showStats(stats);
  } finally {
    $('rescanBtn').disabled = false;
    $('rescanBtn').textContent = 'Re-scan';
  }
}

async function runAll() {
  const tab = await getTab();
  $('runAllBtn').disabled = true;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ALL' });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
    if (res) showStats(res);
  } finally {
    $('runAllBtn').disabled = false;
  }
}

function showStats(stats) {
  const { total, ok, err, requests = [] } = stats;

  $('emptyMsg').classList.toggle('hidden', total > 0);
  $('statsBar').classList.toggle('hidden', total === 0);
  $('reqList').classList.toggle('hidden', total === 0);

  $('statTotal').textContent = `${total} request${total !== 1 ? 's' : ''}`;
  if (ok > 0) { $('statOk').textContent = `✓ ${ok}`; $('statOk').classList.remove('hidden'); }
  else          $('statOk').classList.add('hidden');
  if (err > 0) { $('statErr').textContent = `✗ ${err}`; $('statErr').classList.remove('hidden'); }
  else           $('statErr').classList.add('hidden');

  $('runAllBtn').disabled = total === 0;
  renderRequests(requests);
}

function renderRequests(requests) {
  const list = $('reqList');
  list.innerHTML = requests.map((r, i) => {
    const method  = r.method ?? 'GET';
    const mCls    = ['GET','POST','PUT','DELETE','PATCH'].includes(method) ? `rm-${method}` : 'rm-OTHER';
    const label   = r.name || shortUrl(r.url);
    const running = r.state === 'running';

    let resultHtml = '';
    if (running) {
      resultHtml = `<span class="req-result run">↻</span>`;
    } else if (r.state) {
      const aTag = r.assertTotal > 0
        ? ` <span class="req-assert ${r.assertFail ? 'err' : 'ok'}">${r.assertFail ? `✗${r.assertFail}/${r.assertTotal}` : `✓${r.assertTotal}`}</span>`
        : '';
      if (r.ok)
        resultHtml = `<span class="req-result ok">✓ ${r.status} · ${r.time}ms${aTag}</span>`;
      else
        resultHtml = `<span class="req-result err">${r.status > 0 ? `✗ ${r.status}` : '✗ ERR'}${aTag}</span>`;
    }

    return `<div class="req-row" data-index="${i}">
      <span class="rm ${mCls}">${method}</span>
      <span class="req-label" title="${escAttr(r.url)}">${escHtml(label)}</span>
      ${resultHtml}
      <button class="req-run" data-index="${i}" ${running ? 'disabled' : ''}>▶</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.req-row').forEach(row => {
    const idx = parseInt(row.dataset.index);
    row.addEventListener('click', e => {
      if (e.target.closest('.req-run')) return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        chrome.tabs.sendMessage(tab.id, { type: 'SCROLL_TO', index: idx });
      });
    });
    row.querySelector('.req-run').addEventListener('click', async e => {
      e.stopPropagation();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const stats = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ONE', index: idx }).catch(() => null);
      if (stats) showStats(stats);
    });
  });
}

function shortUrl(url) {
  try { const u = new URL(url); return u.pathname + (u.search || ''); }
  catch { return url; }
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}

// ── Variables ─────────────────────────────────────────
function parseVarEditor() {
  variables = {};
  for (const line of $('varEditor').value.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k) variables[k] = v;
    }
  }
  $('varBadge').textContent = Object.keys(variables).length;
  chrome.storage.local.set({ variables });
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  $('rescanBtn').addEventListener('click', rescan);
  $('runAllBtn').addEventListener('click', runAll);
  $('varEditor').addEventListener('input', parseVarEditor);

  $('varToggle').addEventListener('click', () => {
    const hidden = $('varBody').classList.toggle('hidden');
    $('varChevron').classList.toggle('open', !hidden);
  });

  // Restore saved variables
  const stored = await chrome.storage.local.get('variables');
  if (stored.variables && Object.keys(stored.variables).length > 0) {
    variables = stored.variables;
    $('varEditor').value = Object.entries(variables).map(([k, v]) => `${k}=${v}`).join('\n');
    $('varBadge').textContent = Object.keys(variables).length;
  }

  // Content script auto-runs — fetch current stats
  const tab   = await getTab();
  const stats = await chrome.tabs.sendMessage(tab.id, { type: 'STATS' }).catch(() => null);
  if (stats) showStats(stats);
  else $('emptyMsg').classList.remove('hidden');
});
