# Saor Browser

> **Saor** (Irish: *free*) — a lightweight, privacy-respecting browser that runs on anything from a Raspberry Pi Zero 2 W upward.

## Design goals

| Goal | How |
|---|---|
| **Minimal footprint** | Uses the OS's own WebView engine — no bundled Chromium |
| **Low memory** | V8 heap capped at 128 MB; tracker blocking cuts page weight |
| **Cross-platform** | WebKit2GTK on Linux/Pi · WKWebView on macOS · Edge WebView2 on Windows |
| **Zero runtime deps** | Core logic (history, tabs, bookmarks, settings) is pure TypeScript |
| **Privacy by default** | Built-in tracker blocklist enabled at first launch |

---

## System requirements

| Platform | Minimum | Rendering engine |
|---|---|---|
| **Raspberry Pi Zero 2 W** | 512 MB RAM, ARM64 OS | WebKit2GTK |
| **Linux (x64 / ARM64)** | Ubuntu 20.04, Debian 11, Fedora 38 or later | WebKit2GTK |
| **macOS** | macOS 11 Big Sur or later | WKWebView (system) |
| **Windows** | Windows 10 build 20H2+ or Windows 11 | Edge WebView2 (pre-installed) |

Node.js **≥ 18** is required on all platforms.

---

## Installation

### Linux / Raspberry Pi

```bash
git clone https://github.com/madracingco/Saor-browser.git
cd Saor-browser
./install.sh
```

The script installs `libwebkit2gtk-4.0-dev`, Node.js ≥ 18 (via NodeSource if needed), runs `npm install` (which compiles the native webview addon), and creates a `/usr/local/bin/saor` launcher.

**Raspberry Pi OS (Bookworm) — quick copy-paste:**
```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/madracingco/Saor-browser.git
cd Saor-browser && ./install.sh
```

### macOS

```bash
git clone https://github.com/madracingco/Saor-browser.git
cd Saor-browser
open install.command   # or: bash install.command
```

Requires Xcode Command Line Tools (prompted automatically). Homebrew is used for Node.js if available.

### Windows

```powershell
git clone https://github.com/madracingco/Saor-browser.git
cd Saor-browser
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\install.ps1
```

Requires [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload to compile the native webview addon. WebView2 ships with Windows 10 20H2+ and Windows 11.

---

## Running

```bash
saor              # after install.sh / install.command / install.ps1
# or from the repo:
npm run build     # compile TypeScript → dist/
npm start         # node --max-old-space-size=128 dist/ui/app.js
# debug mode (shows DevTools):
npm run start:debug
```

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+L` | Focus address bar |
| `Ctrl+T` | New tab |
| `F5` / `Ctrl+R` | Reload |
| `Alt+←` | Back |
| `Alt+→` | Forward |
| `Enter` (address bar) | Navigate |
| `Escape` (address bar) | Cancel edit |

---

## Architecture

```
src/
├── ui/
│   ├── app.ts            ← main entry: creates webview, wires IPC
│   ├── chrome.ts         ← injected toolbar HTML/CSS/JS (per-page overlay)
│   └── pages.ts          ← new-tab, blocked, error, about pages (data: URIs)
├── navigation/
│   ├── url-parser.ts     ← normalise, parse, strip trackers, detect safe protocol
│   └── history.ts        ← back/forward navigation stack
├── tabs/
│   └── tab-manager.ts    ← create, close, switch, pin, reorder tabs
├── bookmarks/
│   └── bookmark-store.ts ← CRUD, folders, tags, full-text search
├── privacy/
│   ├── tracker-blocker.ts    ← hostname blocklist (exact + suffix match)
│   └── default-blocklist.ts  ← curated list of ~40 tracker domains
├── security/
│   └── content-security.ts   ← CSP parsing, mixed-content detection, safe-browsing stub
└── settings/
    └── settings-store.ts     ← typed key-value store with defaults + export/import
```

The toolbar is injected into **every page** via `webview.init()` (runs before the page's own scripts). It creates a `position: fixed` bar at the top and shifts `body` content down by 48 px. When the user interacts with the bar, `window.saorXxx()` calls are made — these are bound to Node.js handlers via `webview.bind()`. After navigation, `webview.eval()` pushes new state back into the injected script.

---

## Development

```bash
npm run build:run   # build + launch in one step
npm run test        # Jest unit tests with coverage report
npm run test:watch  # watch mode
npm run lint        # ESLint
```

---

## Built-in pages

| URL | Description |
|---|---|
| `about:newtab` | New-tab search page |
| `about:saor` | Version and platform info |

---

## Privacy

- Tracker blocking is **on by default** (≈ 40 common domains).
- No telemetry, no crash reporting, no update checks phone home.
- `privacy.clearCookiesOnExit` setting (off by default) clears all cookies at shutdown when enabled.
- Tracking parameters (`utm_*`, `fbclid`, `gclid`, etc.) are stripped automatically.

---

## License

GPL-3.0 — see [LICENSE](LICENSE).
