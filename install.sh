#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Saor Browser — Linux / Raspberry Pi installer
#
# Tested on:
#   Raspberry Pi OS Bookworm/Bullseye (ARM64 & ARM32)
#   Ubuntu 20.04 / 22.04 / 24.04
#   Debian 11 / 12
#   Fedora 38+
#   Arch Linux
#
# Requirements installed automatically:
#   - Node.js ≥ 18
#   - libwebkit2gtk-4.0 (the OS WebKit rendering engine)
#   - build-essential / gcc (for compiling the webview native addon)
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MIN=18

echo "==> Saor Browser installer"
echo "    Directory: ${REPO_DIR}"
echo

# ── Detect package manager ──────────────────────────────────────────────────

install_apt() {
  echo "==> Installing system dependencies (apt)..."
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends \
    build-essential \
    libwebkit2gtk-4.0-dev \
    libgtk-3-dev \
    curl
}

install_dnf() {
  echo "==> Installing system dependencies (dnf)..."
  sudo dnf install -y \
    gcc gcc-c++ make \
    webkit2gtk4.0-devel \
    gtk3-devel \
    curl
}

install_pacman() {
  echo "==> Installing system dependencies (pacman)..."
  sudo pacman -Sy --noconfirm \
    base-devel \
    webkit2gtk \
    curl
}

if command -v apt-get &>/dev/null; then
  install_apt
elif command -v dnf &>/dev/null; then
  install_dnf
elif command -v pacman &>/dev/null; then
  install_pacman
else
  echo "WARN: Unknown package manager. Please install libwebkit2gtk-4.0-dev and build-essential manually."
fi

# ── Node.js ─────────────────────────────────────────────────────────────────

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -lt "$NODE_MIN" ]; then
    echo "WARN: Node.js ${NODE_VER} found, but Saor requires ≥ ${NODE_MIN}."
    echo "      Installing Node.js ${NODE_MIN} via NodeSource..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | sudo -E bash -
    sudo apt-get install -y nodejs 2>/dev/null || \
      sudo dnf install -y nodejs 2>/dev/null || true
  else
    echo "==> Node.js ${NODE_VER} — OK"
  fi
else
  echo "==> Node.js not found. Installing via NodeSource..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "ERROR: Please install Node.js ≥ ${NODE_MIN} manually: https://nodejs.org"
    exit 1
  fi
fi

# ── npm install + build ─────────────────────────────────────────────────────

echo
echo "==> Installing npm dependencies..."
cd "${REPO_DIR}"
npm install

echo
echo "==> Building TypeScript..."
npm run build

# ── Desktop entry (optional) ─────────────────────────────────────────────────

if command -v xdg-user-dir &>/dev/null || [ -d "${HOME}/.local/share/applications" ]; then
  DESKTOP_DIR="${HOME}/.local/share/applications"
  mkdir -p "${DESKTOP_DIR}"
  cat > "${DESKTOP_DIR}/saor-browser.desktop" <<DESKTOP
[Desktop Entry]
Name=Saor Browser
Comment=Free, lightweight, privacy-respecting browser
Exec=node --max-old-space-size=128 ${REPO_DIR}/dist/ui/app.js %u
Terminal=false
Type=Application
Icon=web-browser
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
StartupNotify=true
DESKTOP
  echo "==> Desktop entry written to ${DESKTOP_DIR}/saor-browser.desktop"
  xdg-icon-resource install --novendor --size 64 /dev/null saor-browser 2>/dev/null || true
fi

# ── Launcher script ───────────────────────────────────────────────────────────

LAUNCHER="/usr/local/bin/saor"
sudo tee "${LAUNCHER}" > /dev/null <<LAUNCHER
#!/bin/sh
exec node --max-old-space-size=128 "${REPO_DIR}/dist/ui/app.js" "\$@"
LAUNCHER
sudo chmod +x "${LAUNCHER}"

echo
echo "╔═══════════════════════════════════════════════╗"
echo "║  Saor Browser installed successfully!         ║"
echo "║                                               ║"
echo "║  Run with:  saor                              ║"
echo "║  Or:        npm start  (in ${REPO_DIR})       ║"
echo "╚═══════════════════════════════════════════════╝"
