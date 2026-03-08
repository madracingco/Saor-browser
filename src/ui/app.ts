/**
 * Saor Browser — main application entry point.
 *
 * Creates a native OS webview window (WebKit2GTK on Linux/Pi,
 * WKWebView on macOS, Edge WebView2 on Windows) via @webview/webview.
 *
 * Architecture:
 *  - The webview renders the actual web page.
 *  - A lightweight HTML/CSS toolbar (chrome) is injected before every page
 *    load via webview.init(), giving us back/forward/URL/tab controls without
 *    bundling a separate rendering engine.
 *  - IPC between the chrome JS and this Node.js process uses webview.bind().
 *  - Navigation history, tab state, bookmarks, and tracker-blocking all live
 *    in the logic modules under src/ (pure TypeScript, no UI framework).
 *
 * Memory tuning for Pi Zero 2 W (512 MB):
 *  - Node.js V8 heap capped at 128 MB via --max-old-space-size=128 in the
 *    start script.  The OS WebView has its own separate heap.
 *  - performance.maxTabs default = 5 (configurable in SettingsStore).
 *  - Tracker blocking cuts significant page weight on ad-heavy sites.
 */

import { Webview } from "@webview/webview";
import { NavigationHistory } from "../navigation/history";
import { TabManager } from "../tabs/tab-manager";
import { SettingsStore } from "../settings/settings-store";
import { TrackerBlocker } from "../privacy/tracker-blocker";
import { normaliseInput } from "../navigation/url-parser";
import { DEFAULT_BLOCKLIST } from "../privacy/default-blocklist";
import { buildChromeScript } from "./chrome";
import { newTabPage, blockedPage, errorPage, aboutPage } from "./pages";

// ── Version ────────────────────────────────────────────────────────────────
const VERSION = "0.1.0";

// ── Singletons ─────────────────────────────────────────────────────────────
const settings = new SettingsStore();
const history  = new NavigationHistory();
const tabs     = new TabManager();
const blocker  = new TrackerBlocker(
  settings.get<boolean>("privacy.blockTrackers") ? [...DEFAULT_BLOCKLIST] : []
);

const DEBUG = process.env.SAOR_DEBUG === "1";
const wv = new Webview(DEBUG);

wv.title = "Saor Browser";
wv.size  = { width: 1024, height: 768 };

// ── Internal state ─────────────────────────────────────────────────────────

/** URL that is currently displayed in the webview. */
let activeUrl = "about:newtab";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Serialises current browser state and calls __saorChrome.update() in the
 * page so the toolbar reflects the new URL, button states, and tab strip.
 */
function syncChrome(url: string): void {
  const tabList = tabs.allTabs().map((t) => ({ id: t.id, url: t.url, title: t.title }));
  const active  = tabs.activeTab();

  const payload = JSON.stringify({
    url:         url === "about:newtab" ? "" : url,
    canBack:     history.canGoBack(),
    canFwd:      history.canGoForward(),
    tabs:        tabList,
    activeTabId: active?.id ?? "",
  });

  wv.eval(`window.__saorChrome && window.__saorChrome.update(${payload})`);
}

/**
 * Core navigation routine.
 * Normalises user input → validates protocol → checks blocklist → navigates.
 */
function navigateTo(rawInput: string): void {
  // Handle built-in pages
  if (rawInput === "about:saor" || rawInput === "saor://about") {
    wv.navigate(aboutPage(VERSION));
    activeUrl = rawInput;
    syncChrome(rawInput);
    return;
  }

  if (rawInput === "about:newtab" || rawInput === "") {
    wv.navigate(newTabPage(settings.get<string>("navigation.searchEngine")));
    activeUrl = "about:newtab";
    const tab = tabs.activeTab();
    if (tab) tabs.updateTab(tab.id, { url: "about:newtab", title: "New Tab" });
    syncChrome("about:newtab");
    return;
  }

  const url = normaliseInput(rawInput, settings.get<string>("navigation.searchEngine"));

  // Tracker blocklist check (skip for data: and about: pages)
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const { hostname } = new URL(url);
      const result = blocker.check(hostname);
      if (result.blocked) {
        const tab = tabs.activeTab();
        if (tab) tabs.updateTab(tab.id, { url, title: "Blocked" });
        wv.navigate(blockedPage(url, hostname));
        activeUrl = url;
        syncChrome(url);
        return;
      }
    } catch {
      // Malformed URL — let the webview handle and show its own error
    }
  }

  // Enforce tab limit on new navigations only when creating fresh tabs
  history.push(url);
  activeUrl = url;

  const tab = tabs.activeTab();
  if (tab) tabs.updateTab(tab.id, { url, isLoading: true });

  wv.navigate(url);
  syncChrome(url);
}

// ── IPC bindings (webview JS → Node.js) ────────────────────────────────────

wv.bind("saorNavigate", (rawUrl: unknown) => {
  navigateTo(String(rawUrl ?? ""));
  return null;
});

wv.bind("saorBack", () => {
  const entry = history.back();
  if (entry) {
    activeUrl = entry.url;
    wv.navigate(entry.url);
    syncChrome(entry.url);
  }
  return null;
});

wv.bind("saorForward", () => {
  const entry = history.forward();
  if (entry) {
    activeUrl = entry.url;
    wv.navigate(entry.url);
    syncChrome(entry.url);
  }
  return null;
});

wv.bind("saorRefresh", () => {
  wv.eval("location.reload()");
  return null;
});

wv.bind("saorNewTab", () => {
  const maxTabs = settings.get<number>("performance.maxTabs");
  if (tabs.tabCount >= maxTabs) {
    wv.eval(
      `alert("Tab limit reached (max ${maxTabs}).\\nClose an existing tab to open a new one.")`
    );
    return null;
  }
  tabs.createTab("about:newtab", true);
  navigateTo("about:newtab");
  return null;
});

wv.bind("saorSwitchTab", (tabId: unknown) => {
  const id = String(tabId ?? "");
  try {
    tabs.activateTab(id);
    const tab = tabs.activeTab();
    if (tab) {
      activeUrl = tab.url;
      if (tab.url === "about:newtab") {
        wv.navigate(newTabPage(settings.get<string>("navigation.searchEngine")));
      } else {
        wv.navigate(tab.url);
      }
      syncChrome(tab.url);
    }
  } catch {
    // Tab no longer exists — ignore
  }
  return null;
});

/**
 * Called by the chrome script's window.onload handler so Node learns the
 * final URL (after any redirects) and the page title.
 */
wv.bind("saorPageLoaded", (url: unknown, title: unknown) => {
  const u = String(url ?? "");
  const t = String(title ?? u);
  activeUrl = u;
  const tab = tabs.activeTab();
  if (tab) tabs.updateTab(tab.id, { url: u, title: t, isLoading: false });
  // Update history title retroactively
  history.push(u, t);
  history.back(); // restore position (we pushed to record the title)
  syncChrome(u);
  return null;
});

// ── Startup ────────────────────────────────────────────────────────────────

// Inject the chrome toolbar before every page load
wv.init(buildChromeScript());

// Open first tab
tabs.createTab("about:newtab", true);
wv.navigate(newTabPage(settings.get<string>("navigation.searchEngine")));

// Hand control to the native event loop (blocking call)
wv.run();
