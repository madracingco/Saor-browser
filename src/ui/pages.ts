/**
 * Built-in page templates for Saor browser.
 *
 * Each function returns a data: URI that can be passed directly to
 * webview.navigate(). Using data: avoids needing a local HTTP server,
 * which keeps memory usage low on constrained hardware.
 */

/** HTML-escape a string for safe embedding inside attribute values or text nodes. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDataUri(html: string): string {
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

/** Shared minimal CSS reset + dark palette (no external fonts). */
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d1a;color:#dde1e7;font-family:system-ui,-apple-system,sans-serif;
       min-height:100vh;display:flex;flex-direction:column;align-items:center;
       justify-content:center;gap:20px;padding:24px;text-align:center}
  a{color:#5b8dee;text-decoration:none}
  a:hover{text-decoration:underline}
  code{background:#16213e;padding:2px 7px;border-radius:4px;font-size:.88rem;color:#a0b4d0;
       word-break:break-all}
  button{padding:10px 20px;border-radius:6px;border:none;background:#2a2a4a;color:#dde1e7;
         cursor:pointer;font-size:14px}
  button:hover{background:#3a3a5a}
  .primary{background:#5b8dee;color:#fff}
  .primary:hover{background:#4a7de0}
`.trim();

// ── New Tab ────────────────────────────────────────────────────────────────

/**
 * The new-tab page: Saor wordmark + a centred search/address bar.
 * Deliberately minimal — no images, no web requests.
 */
export function newTabPage(searchEngine: string): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Tab — Saor</title>
<style>
${BASE_CSS}
h1{font-size:3rem;font-weight:200;letter-spacing:.12em;color:#5b8dee}
h1 span{color:#e94560}
.search-row{display:flex;width:100%;max-width:540px;gap:8px}
.search-row input{flex:1;padding:12px 16px;border-radius:8px;border:1px solid #2a2a4a;
  background:#16213e;color:#dde1e7;font-size:16px;outline:none}
.search-row input:focus{border-color:#5b8dee}
.tagline{font-size:.8rem;color:#4a5260}
</style>
</head>
<body>
<h1>S<span>a</span>or</h1>
<form class="search-row" onsubmit="go(event)">
  <input id="q" type="text" autofocus
         placeholder="Search or enter address\u2026"
         autocomplete="off" spellcheck="false">
  <button class="primary" type="submit">Go</button>
</form>
<p class="tagline">Free &bull; Lightweight &bull; Private</p>
<script>
function go(e){
  e.preventDefault();
  var v=(document.getElementById('q').value||'').trim();
  if(v) window.saorNavigate(v);
}
</script>
</body>
</html>`;
  return toDataUri(html);
}

// ── Blocked page ───────────────────────────────────────────────────────────

/**
 * Shown when navigation to a tracker domain is prevented.
 */
export function blockedPage(url: string, hostname: string): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Blocked — Saor</title>
<style>
${BASE_CSS}
.icon{font-size:4rem}
h1{font-size:1.6rem;color:#e94560}
p{color:#6c7280;max-width:440px}
.actions{display:flex;gap:10px}
</style>
</head>
<body>
<div class="icon">&#x1F6AB;</div>
<h1>Tracker Blocked</h1>
<p><code>${esc(hostname)}</code> is on Saor&rsquo;s tracker blocklist and was not loaded.</p>
<p>Full URL: <code>${esc(url)}</code></p>
<div class="actions">
  <button onclick="window.saorBack()">&#8592; Go back</button>
  <button class="primary" onclick="window.saorNavigate('${esc(url)}?saor_bypass=1')">
    Load anyway
  </button>
</div>
</body>
</html>`;
  return toDataUri(html);
}

// ── Error page ─────────────────────────────────────────────────────────────

/**
 * Shown for navigation errors (DNS failure, connection refused, etc.).
 */
export function errorPage(url: string, message: string): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error — Saor</title>
<style>
${BASE_CSS}
.icon{font-size:4rem}
h1{font-size:1.6rem;color:#e94560}
p{color:#6c7280;max-width:440px}
</style>
</head>
<body>
<div class="icon">&#x26A0;</div>
<h1>Page could not be loaded</h1>
<p>URL: <code>${esc(url)}</code></p>
<p>${esc(message)}</p>
<button onclick="window.saorBack()">&#8592; Go back</button>
</body>
</html>`;
  return toDataUri(html);
}

// ── About page ─────────────────────────────────────────────────────────────

/**
 * about:saor — version and hardware info page.
 */
export function aboutPage(version: string): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>About Saor</title>
<style>
${BASE_CSS}
table{border-collapse:collapse;width:100%;max-width:440px}
td{padding:8px 12px;border-bottom:1px solid #1a1a3a;text-align:left}
td:first-child{color:#6c7280;white-space:nowrap}
h1{font-size:2rem;font-weight:200;color:#5b8dee}
h1 span{color:#e94560}
</style>
</head>
<body>
<h1>S<span>a</span>or Browser</h1>
<table>
  <tr><td>Version</td><td><code>${esc(version)}</code></td></tr>
  <tr><td>Rendering engine</td><td>Native WebView (OS-provided)</td></tr>
  <tr><td>Node.js</td><td><code>${esc(process.versions.node)}</code></td></tr>
  <tr><td>Platform</td><td><code>${esc(process.platform)} / ${esc(process.arch)}</code></td></tr>
  <tr><td>License</td><td>GPL-3.0</td></tr>
</table>
<a href="https://github.com/madracingco/Saor-browser">Source code on GitHub</a>
</body>
</html>`;
  return toDataUri(html);
}
