# HTTP Scanner – Agent Briefing

Chrome extension that scans webpages for [httpyac](https://httpyac.github.io)-format HTTP request blocks, injects floating run buttons directly onto the page, executes requests, and shows results inline.

---

## File Structure

```
chrome-extension/
├── manifest.json   MV3 manifest – permissions, content_scripts, background
├── background.js   Service worker – fetch executor + toolbar icon renderer
├── content.js      Auto-injected into every page – parser, pill UI, assertion engine
├── popup.html      Extension popup shell
├── popup.css       Popup dark-theme styles
├── popup.js        Popup logic – stats, request list, variables editor
└── AGENTS.md       This file
```

---

## Architecture

```
Page DOM
  └── content.js  (auto-injected at document_idle)
        │  parses page → injects floating pill buttons (Shadow DOM)
        │  sends EXECUTE → background.js → returns response
        │  evaluates ?? assertions locally
        │  exposes window.__httpScanner for reinject/stats/runAll
        │
        ├──[chrome.runtime.sendMessage]──► background.js
        │     EXECUTE  → fetch() → { ok, status, headers, body, time }
        │     SET_ICON → OffscreenCanvas → chrome.action.setIcon
        │
        └──[chrome.tabs.sendMessage]◄──── popup.js
              STATS     → { total, done, ok, err, requests[] }
              SCAN      → reinject (re-scan page)
              RUN_ALL   → run every detected request in parallel
              RUN_ONE   → run request at flat index i
              SCROLL_TO → scrollIntoView on the wrapper element
```

---

## httpyac Format Parsed

```http
### Optional block name
# @name GetUsers          ← alternative name syntax
GET https://api.example.com/users
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{"filter": "active"}

?? status == 200
?? body.users isArray
?? header content-type includes application/json
?? duration < 500
```

**Block separators:** `###` in raw text (code blocks), or `<h2>`/`<h3>`/`<h4>` + `<pre>` DOM pairs (Confluence / wiki renderers).

**Variable substitution:** `{{KEY}}` in URL, headers, body. Defined in popup Variables editor, persisted in `chrome.storage.local` under key `"variables"`.

---

## Scanning Strategies (`injectAll` in content.js)

| Strategy | Targets | When used |
|----------|---------|-----------|
| 1 – Inline `###` | `<pre>`, `<code>`, `<textarea>` | Raw `.http` files, GitHub, docs sites |
| 2 – Heading + code | `<h2/h3/h4>` → sibling `<pre/code>` | Confluence, Notion, wikis where `###` renders as headings |

Elements are stamped `data-http-scanner-done` to prevent double-injection. Both strategies run on every `injectAll()` call.

---

## Pill Button (Shadow DOM)

Each detected code block gets a `position:absolute` Shadow DOM host inserted inside a `position:relative` wrapper div that replaces the original element in the DOM.

**States:**

| State | Appearance |
|-------|-----------|
| Not run | `▶ GET` – subtle dark glass pill |
| Running | `↻ GET` – blue pulsing glow |
| Success (HTTP 2xx + all assertions pass) | `✓ 200` – green |
| Error (non-2xx OR any assertion fails) | `✗ 404` – red |
| Assertion badge | `✓3` or `✗1/3` appended to status |

**Interactions:**
- Single click → run request (220 ms debounce to allow double-click)
- Double-click → open detail modal

---

## Detail Modal (Shadow DOM, appended to `document.body`)

Singleton overlay (`data-http-scanner-overlay`). Shows:
- Request: method, URL, headers, body
- Response: status, time, headers, body (JSON pretty-printed)
- Assertions: each `??` line with `✓`/`✗` and `got: <value>` on failure
- Footer: Copy Response, Copy as cURL, Run (re-run live), Close
- Closes on backdrop click or `Escape`

---

## Assertion Engine (`content.js`)

Assertions are evaluated **client-side** after the response returns from `background.js`.

**Context object passed to evaluator:**
```js
{ status, body (JSON-parsed or string), duration, header (lowercase keys) }
```

**Path resolution:**
- `status` → number
- `body.foo.bar` → dot-path traversal
- `body.list[0].id` → array index
- `header content-type` → space separator (not dot), case-insensitive lookup

**Supported operators:**

| Operator | Type |
|----------|------|
| `==` `!=` | equality (loose) |
| `<` `<=` `>` `>=` | numeric |
| `includes` / `contains` | string or array |
| `startsWith` `endsWith` | string |
| `matches` | regex |
| `exists` | not null/undefined |
| `isTrue` `isFalse` | strict boolean |
| `isNumber` `isString` `isBoolean` `isArray` | typeof / Array.isArray |

`ok` on a result is `httpOk && allAssertionsPass`. `httpOk` is the raw HTTP `res.ok` (2xx).

---

## Message Protocol

### popup.js → content.js (via `chrome.tabs.sendMessage`)

| Message | Payload | Response |
|---------|---------|----------|
| `STATS` | – | `{ total, done, ok, err, requests[] }` |
| `SCAN` | – | `{ count }` – re-injects and rescans |
| `RUN_ALL` | – | `{ ok: true }` (async, waits for all) |
| `RUN_ONE` | `{ index }` flat index | full `STATS` response |
| `SCROLL_TO` | `{ index }` flat index | `{ ok: true }` |

### content.js → background.js (via `chrome.runtime.sendMessage`)

| Message | Payload | Response |
|---------|---------|----------|
| `EXECUTE` | `{ method, url, headers, body }` | `{ ok, status, statusText, headers, body, time }` |
| `SET_ICON` | `{ state }` `default\|running\|success\|error` | `{ ok: true }` |

### `requests[]` item shape (in STATS response)

```js
{
  method, url, name,
  state,        // null | 'running' | 'done' | 'error'
  ok,           // overall (http + assertions)
  httpOk,       // raw HTTP ok only
  status, statusText, time,
  assertTotal,  // number of ?? assertions defined
  assertFail,   // number that failed
}
```

---

## Extension Popup

- **Re-scan** button → sends `SCAN`, refreshes list
- **Run All** button → sends `RUN_ALL`, refreshes list
- **Request list** → each row shows method, name/path, result badge, assertion badge, `▶` run button; clicking row body sends `SCROLL_TO`
- **Variables editor** → `KEY=value` per line, saved to `chrome.storage.local["variables"]`, applied via `{{KEY}}` substitution at run time

---

## Known Limitations

- **CORS**: `background.js` fetch uses `host_permissions: <all_urls>` which bypasses CORS for extension-origin requests. Works for most APIs; may still fail if server enforces strict CORS policy without the right headers.
- **No `@variable` capture from responses** – httpyac supports extracting response values into variables for chaining requests; not implemented.
- **No script block support** – httpyac `<script>` blocks for custom JS logic are not parsed.
- **No auth flows** – OAuth, AWS Signature, etc. not implemented.
- **Single-file content script** – all UI CSS is embedded as template literals in `content.js`; large but keeps deployment simple.
- **Body truncated at 5000 chars** in display (full body available in result object for assertions).

---

## Potential Next Features

- Response variable extraction: `# @variable token = body.token` for request chaining
- Environment switcher (dev / staging / prod base URLs)
- Request history / log panel in popup
- Export results as JUnit XML or JSON report
- Support `@import` to load `.http` files referenced by URL
- Keyboard shortcut to run focused request without opening popup
