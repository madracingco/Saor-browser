#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Saor Browser — macOS installer
# Double-click this file in Finder, or run it in Terminal.
#
# Requirements installed automatically (via Homebrew if present):
#   - Node.js ≥ 18
#   - Xcode Command Line Tools (for compiling the webview native addon)
#
# The macOS WebView (WKWebView) is provided by the OS — nothing extra needed.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")"
REPO_DIR="$(pwd)"
NODE_MIN=18

echo "==> Saor Browser macOS installer"
echo "    Directory: ${REPO_DIR}"
echo

# ── Xcode CLI Tools ───────────────────────────────────────────────────────────

if ! xcode-select -p &>/dev/null; then
  echo "==> Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "    Please complete the installation dialog and re-run this script."
  exit 0
fi
echo "==> Xcode CLI tools — OK"

# ── Node.js ───────────────────────────────────────────────────────────────────

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -ge "$NODE_MIN" ]; then
    echo "==> Node.js ${NODE_VER} — OK"
  else
    echo "WARN: Node.js ${NODE_VER} is too old (need ≥ ${NODE_MIN})."
    if command -v brew &>/dev/null; then
      echo "==> Upgrading Node.js via Homebrew..."
      brew install node@${NODE_MIN} || brew upgrade node
    else
      echo "ERROR: Please install Node.js ≥ ${NODE_MIN}: https://nodejs.org"
      exit 1
    fi
  fi
else
  if command -v brew &>/dev/null; then
    echo "==> Installing Node.js via Homebrew..."
    brew install node
  else
    echo "ERROR: Please install Node.js ≥ ${NODE_MIN}: https://nodejs.org"
    exit 1
  fi
fi

# ── npm install + build ────────────────────────────────────────────────────────

echo
echo "==> Installing npm dependencies..."
npm install

echo
echo "==> Building TypeScript..."
npm run build

# ── Launcher symlink ──────────────────────────────────────────────────────────

LAUNCHER_DIR="${HOME}/.local/bin"
mkdir -p "${LAUNCHER_DIR}"
cat > "${LAUNCHER_DIR}/saor" <<LAUNCHER
#!/bin/sh
exec node --max-old-space-size=128 "${REPO_DIR}/dist/ui/app.js" "\$@"
LAUNCHER
chmod +x "${LAUNCHER_DIR}/saor"

echo
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Saor Browser installed successfully on macOS!       ║"
echo "║                                                      ║"
echo "║  Run:  ~/.local/bin/saor                             ║"
echo "║  Or:   npm start  (inside ${REPO_DIR})               ║"
echo "╚══════════════════════════════════════════════════════╝"

# Keep Terminal window open so user can read the output
read -r -p "Press Enter to close..."
