Do not store installer binaries here anymore.

Current rule:
- generated installers should be published to Backblaze object storage under the `application-downloads/` folder
- use `python3 scripts/sync_application_downloads.py` after generating new build artifacts
- public website routes like `/downloads/windows-agent/` and `/downloads/mac-agent/` resolve from Backblaze, not from this folder

Keep only lightweight config files here when needed, such as `bootstrap-products.json`.
