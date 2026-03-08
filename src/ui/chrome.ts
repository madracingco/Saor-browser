/**
 * Browser chrome — the toolbar overlay injected into every page.
 *
 * Implemented as a self-contained IIFE that:
 *  - Runs once per page (guards on __saorChromeInstalled)
 *  - Creates a position:fixed div with back/forward/reload/URL/new-tab controls
 *  - Pushes body content down by the toolbar height so nothing is hidden
 *  - Exposes window.__saorChrome.update(state) for Node → page state sync
 *  - Listens for keyboard shortcuts (Ctrl+L, Ctrl+T, F5, Alt+Arrow)
 *  - Fires window.saor* IPC calls (bound by @webview/webview in app.ts) back to Node
 */

export const CHROME_HEIGHT_PX = 48;

export function buildChromeScript(): string {
  // Template literal — single quotes inside must be escaped; use hex escapes for
  // any character that could break the JS string embedding.
  return `
(function () {
  if (window.__saorChromeInstalled) return;
  window.__saorChromeInstalled = true;

  /* ── styles ─────────────────────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.id = '__saor-chrome-style';
  styleEl.textContent = [
    '#__saor{all:initial;position:fixed;top:0;left:0;right:0;height:${CHROME_HEIGHT_PX}px',
    ';background:#1a1a2e;display:flex;align-items:center;padding:0 6px;gap:4px',
    ';z-index:2147483647;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif',
    ';font-size:13px;color:#dde1e7;box-shadow:0 1px 6px rgba(0,0,0,.5)}',
    '#__saor *{box-sizing:border-box;font-family:inherit}',
    '.sb{all:unset;display:inline-flex;align-items:center;justify-content:center',
    ';width:30px;height:30px;border-radius:4px;cursor:pointer;font-size:17px',
    ';color:#dde1e7;flex-shrink:0;transition:background .1s}',
    '.sb:hover{background:rgba(255,255,255,.12)}',
    '.sb[data-off]{opacity:.3;pointer-events:none}',
    '#__saor-url{all:unset;flex:1;height:30px;background:#16213e;border:1px solid #2a2a4a',
    ';border-radius:5px;padding:0 10px;font-size:13px;color:#dde1e7;min-width:0}',
    '#__saor-url:focus{outline:none;border-color:#5b8dee}',
    '#__saor-tabs{display:flex;align-items:center;gap:2px;overflow:hidden;max-width:35%}',
    '.st{all:unset;padding:3px 9px;background:#16213e;border-radius:4px;cursor:pointer',
    ';font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
    ';max-width:110px;color:#aab4c8;display:inline-block}',
    '.st:hover{background:#1e2a4a}',
    '.st.on{background:#0f3460;color:#fff}',
    'body{margin-top:${CHROME_HEIGHT_PX}px!important}',
  ].join('');
  (document.head || document.documentElement).appendChild(styleEl);

  /* ── markup ──────────────────────────────────────────────────────────── */
  var bar = document.createElement('div');
  bar.id = '__saor';
  bar.innerHTML =
    '<button class="sb" id="__saor-back"  title="Back (Alt+\u2190)">\u2190</button>' +
    '<button class="sb" id="__saor-fwd"   title="Forward (Alt+\u2192)">\u2192</button>' +
    '<button class="sb" id="__saor-reload" title="Reload (F5)">\u21BB</button>' +
    '<input  id="__saor-url" type="text" spellcheck="false" autocomplete="off" placeholder="Search or enter address\u2026" />' +
    '<div    id="__saor-tabs"></div>' +
    '<button class="sb" id="__saor-newtab" title="New tab (Ctrl+T)">+</button>';

  // Prepend to <html> so it survives unusual body structures
  document.documentElement.insertBefore(bar, document.documentElement.firstChild);

  /* ── refs ─────────────────────────────────────────────────────────────── */
  var backBtn   = document.getElementById('__saor-back');
  var fwdBtn    = document.getElementById('__saor-fwd');
  var reloadBtn = document.getElementById('__saor-reload');
  var urlInput  = document.getElementById('__saor-url');
  var tabsEl    = document.getElementById('__saor-tabs');
  var newTabBtn = document.getElementById('__saor-newtab');

  /* ── shared state (updated from Node via __saorChrome.update) ─────────── */
  var _state = { url: '', canBack: false, canFwd: false, tabs: [], activeTabId: '' };

  /* ── public API called by Node.js via webview.eval() ───────────────────── */
  window.__saorChrome = {
    update: function (s) {
      _state = Object.assign({}, _state, s);

      // URL bar (only when not focused — don't interrupt typing)
      if (urlInput && document.activeElement !== urlInput) {
        urlInput.value = s.url || '';
      }

      // Back / forward buttons
      if (backBtn)  backBtn[s.canBack  ? 'removeAttribute' : 'setAttribute']('data-off', '');
      if (fwdBtn)   fwdBtn[s.canFwd   ? 'removeAttribute' : 'setAttribute']('data-off', '');

      // Tab strip (only render when > 1 tab to save space on small screens)
      if (!tabsEl) return;
      tabsEl.innerHTML = '';
      if (s.tabs && s.tabs.length > 1) {
        s.tabs.forEach(function (t, i) {
          var btn = document.createElement('button');
          btn.className = 'st' + (t.id === s.activeTabId ? ' on' : '');
          btn.title = t.url || ('Tab ' + (i + 1));
          btn.textContent = t.title || ('Tab ' + (i + 1));
          btn.onclick = function () { window.saorSwitchTab(t.id); };
          tabsEl.appendChild(btn);
        });
      }
    }
  };

  /* ── event wiring ─────────────────────────────────────────────────────── */
  function safe(el, ev, fn) { el && el.addEventListener(ev, fn); }

  safe(backBtn,   'click', function () { window.saorBack(); });
  safe(fwdBtn,    'click', function () { window.saorForward(); });
  safe(reloadBtn, 'click', function () { window.saorRefresh(); });
  safe(newTabBtn, 'click', function () { window.saorNewTab(); });

  safe(urlInput, 'keydown', function (e) {
    if (e.key === 'Enter')  { window.saorNavigate(urlInput.value); urlInput.blur(); }
    if (e.key === 'Escape') { urlInput.value = _state.url || ''; urlInput.blur(); }
  });
  safe(urlInput, 'focus', function () { urlInput.select(); });

  /* ── keyboard shortcuts ───────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key === 'ArrowLeft')  { window.saorBack();    e.preventDefault(); }
    if (e.altKey && e.key === 'ArrowRight') { window.saorForward(); e.preventDefault(); }
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
      window.saorRefresh(); e.preventDefault();
    }
    if (e.ctrlKey && e.key === 'l') { urlInput && urlInput.focus(); e.preventDefault(); }
    if (e.ctrlKey && e.key === 't') { window.saorNewTab(); e.preventDefault(); }
  }, true);

  /* ── notify Node when the page finishes loading ───────────────────────── */
  window.addEventListener('load', function () {
    window.saorPageLoaded(location.href, document.title || location.href);
  });
})();
`;
}
