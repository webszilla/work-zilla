# WorkZilla Bootstrap Installer

Lightweight launcher installer for WorkZilla products.

## What It Solves

- Base installer stays small (no bundled Monitor/Storage payloads).
- Product installers are hosted remotely (GitHub Releases/CDN).
- Works with GitHub file size limits by keeping heavy binaries outside this repo.

## Architecture

### Base Installer (this app)
- Launcher UI
- Remote config reader
- Download manager with progress
- Product installer launcher

### Product Installers (separate artifacts)
- WorkZilla Monitor installer (`.exe` / `.dmg` / `.pkg`)
- Online Storage installer (`.exe` / `.dmg` / `.pkg`)

## Folder Structure

```text
apps/bootstrap_installer/
  electron/
    main.js                # bootstrap logic + IPC + downloader + launch installer
    preload.js             # secure renderer bridge
  renderer/
    index.html             # launcher UI shell
    renderer.js            # UI actions + progress updates
    styles.css             # lightweight UI styles
  bootstrap-products.sample.json
  package.json
```

## Remote Config Format

Host JSON in GitHub raw URL or CDN:

```json
{
  "monitor": {
    "windows": "https://server.com/monitor.exe",
    "mac": "https://server.com/monitor.dmg"
  },
  "storage": {
    "windows": "https://server.com/storage.exe",
    "mac": "https://server.com/storage.dmg"
  }
}
```

## Runtime Workflow

1. User opens bootstrap installer.
2. Launcher fetches remote JSON config (`WORKZILLA_BOOTSTRAP_CONFIG_URL`).
3. User selects `WorkZilla Monitor` or `Online Storage`.
4. Bootstrap downloads platform package with progress bar.
5. On completion it auto-launches downloaded installer (`shell.openPath`).

## Build

```bash
cd apps/bootstrap_installer
npm install
```

### Windows bootstrap installer
```bash
npm run dist:win
```

### macOS bootstrap installer
```bash
npm run dist:mac
```

## Production Notes

- Set env var before packaging:
  - `WORKZILLA_BOOTSTRAP_CONFIG_URL=https://cdn.yourdomain.com/workzilla/bootstrap-products.json`
- Keep only launcher code in base installer.
- Publish Monitor/Storage installers separately per release.
