# DOCX Exporter — Desktop App (Tauri 2)

A fully native desktop app built with Tauri 2 + React + Vite. No Electron, no bundled Chromium, no Node.js attack surface. Uses the OS's native WebView (WebKit on Mac, WebView2 on Windows).

**Bundle size: ~4 MB vs Electron's ~150 MB.**

---

## Prerequisites

| Tool | Install |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Windows: WebView2 | Pre-installed on Windows 10 1803+ and Windows 11 |
| Mac: Xcode CLI tools | `xcode-select --install` |

---

## Quick start

```bash
npm install

# Dev mode (hot reload, opens a native window)
npm run tauri:dev

# Build installer for your current platform
npm run tauri:build
```

Installers appear in `src-tauri/target/release/bundle/`:
- **Windows:** `nsis/DOCX Exporter_1.0.0_x64-setup.exe`
- **Mac:** `dmg/DOCX Exporter_1.0.0_x64.dmg`

---

## Add an icon (optional but recommended)

```bash
# Drop your 512x512 PNG here, then run:
npm run tauri icon src-tauri/icons/icon.png
```

Tauri generates all required sizes automatically. See `src-tauri/icons/README.md` for details.

---

## Build both platforms without owning both machines

You can't cross-compile Tauri (Rust builds are native). Use the included **GitHub Actions workflow** — it spins up a real Mac and a real Windows machine in parallel for free.

### Setup

1. Push this repo to GitHub
2. Go to **Actions → Build & release → Run workflow** for a manual build, or:
3. Push a version tag to trigger automatically + create a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

After ~8 minutes you get:
- `DOCX Exporter_1.0.0_x64-setup.exe` (Windows NSIS installer)
- `DOCX Exporter_1.0.0_x64.msi` (Windows MSI)
- `DOCX Exporter_1.0.0_aarch64.dmg` (Mac Apple Silicon)
- `DOCX Exporter_1.0.0_x64.dmg` (Mac Intel)

All attached to a GitHub Release automatically.

---

## Updater signing (optional)

Tauri's built-in auto-updater requires a signing key. The workflow references two secrets:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

To generate a key pair:

```bash
npm run tauri signer generate -- -w ~/.tauri/myapp.key
```

Add the private key content and password to your repo's **Settings → Secrets → Actions**. If you don't need auto-updates, delete the `env:` blocks from the workflow — builds work fine without them.

---

## First-launch OS warnings (expected for unsigned apps)

**Mac** — "Developer cannot be verified":
> Right-click the `.app` → **Open** → **Open anyway**

Or via terminal: `xattr -c /Applications/DOCX\ Exporter.app`

**Windows** — SmartScreen:
> **More info** → **Run anyway**

These are normal for apps without an Apple Developer ID ($99/yr) or Windows EV certificate. Fine for internal/personal distribution.

---

## Project structure

```
docx-exporter-tauri/
├── src/                          React frontend (unchanged from web version)
│   ├── components/
│   │   ├── DropZone.jsx/.css
│   │   ├── FileList.jsx/.css
│   │   ├── TagInput.jsx/.css
│   │   ├── ExportLog.jsx/.css
│   │   └── StatCard.jsx/.css
│   ├── lib/
│   │   ├── fileUtils.js          Filtering, chunking, word count
│   │   └── docxBuilder.js        JSZip DOCX generation
│   ├── App.jsx / App.module.css
│   ├── index.css
│   └── main.jsx
├── src-tauri/                    Rust/Tauri shell
│   ├── src/
│   │   ├── main.rs               Binary entry point
│   │   └── lib.rs                App setup, window config
│   ├── icons/                    App icons (see README inside)
│   ├── capabilities/
│   │   └── default.json          Minimal permissions (no fs/shell needed)
│   ├── tauri.conf.json           Window size, CSP, bundle config
│   ├── Cargo.toml
│   └── build.rs
├── .github/
│   └── workflows/
│       └── build.yml             Parallel Windows + Mac CI builds
├── index.html
├── vite.config.js
└── package.json
```

---

## Why Tauri over Electron

| | Tauri 2 | Electron |
|---|---|---|
| Bundle size | ~4 MB | ~150 MB |
| Memory | ~30 MB | ~200 MB |
| WebView | OS native | Bundled Chromium |
| Node.js shipped | No | Yes (full) |
| ASAR integrity bypass | N/A | Unfixed CVE |
| IPC model | Capability-scoped | Unrestricted by default |
| Rust security | Memory-safe core | C++ + JS bridge |
