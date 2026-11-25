# GitHub Actions release pipeline

Install `assets/release-workflow.yml` as `.github/workflows/release.yml`.

## Triggers and jobs

- `push` of a tag matching `v*` -> real release: builds all 4 targets and publishes to GitHub Releases.
- `workflow_dispatch` -> dry-run: builds all targets, uploads the bundles as workflow artifacts, publishes nothing.
- Job `release`: matrix of macOS arm64, macOS x64, Linux (ubuntu-22.04), Windows. Each cell runs `tauri-action`, which builds, signs with the `TAURI_SIGNING_PRIVATE_KEY` env, creates the release, and uploads installers, updater artifacts (`.sig`, `*.app.tar.gz`), and a per-platform `latest.json`.
- Job `finalize-updater`: runs after the whole matrix and rewrites `latest.json` to cover every platform (see below).

## One-time secrets

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/myapp.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # only if the key has a password
```

- The key value can be content or a runner path; from a secret it is content.
- macOS Apple signing (`APPLE_*`) is intentionally not wired. **Do not add empty APPLE_* secrets**: an empty-but-present `APPLE_CERTIFICATE` makes the Tauri bundler run `security import` with an empty cert and fail the build. Add them only once real values exist.

## The latest.json race (why finalize-updater exists)

Each matrix cell's `tauri-action` generates a `latest.json` containing only the platform it built, and all cells upload to the same release - last writer wins. Historically that left a Windows-only manifest, silently breaking auto-updates for macOS and Linux. `finalize-updater` fixes it: after the matrix, it lists the release assets, downloads every updater `.sig` (whose verbatim text IS the signature value), and assembles one manifest with all platform keys:

```json
{
  "version": "2.2.7",
  "notes": "See the assets below to download and install.",
  "pub_date": "2026-...",
  "platforms": {
    "windows-x86_64":      { "signature": "...", "url": "https://github.com/OWNER/REPO/releases/download/vX.Y.Z/..." },
    "windows-x86_64-msi":  { "signature": "...", "url": "..." },
    "windows-x86_64-nsis": { "signature": "...", "url": "..." },
    "darwin-aarch64":      { "signature": "...", "url": "..." },
    "darwin-x86_64":       { "signature": "...", "url": "..." },
    "linux-x86_64":        { "signature": "...", "url": "..." }
  }
}
```

`version` and each platform's `url` + `signature` are required; `signature` is the `.sig` content, never a path or URL. `windows-x86_64` is the MSI-family default key; the `-msi` / `-nsis` suffixed keys exist so both Windows installer types can update.

## Artifact naming rules

The finalize job finds assets by suffix pattern: `_x64_en-US\.msi$`, `_x64-setup\.exe$`, `aarch64\.app\.tar\.gz$`, `_x64\.app\.tar\.gz$`, `amd64\.AppImage$`. These match Tauri's default naming for any product name. **Never rename `*.app.tar.gz` or `*.sig`** (macOS updater bundles) - renames make the finalize job fail with `::error::missing updater asset for ...`.

## After the first tag

```bash
gh release view vX.Y.Z --json assets --jq '.assets[].name'          # expect *.sig + latest.json
curl -sL https://github.com/OWNER/REPO/releases/latest/download/latest.json | jq '.platforms | keys'
```

Then the real test: install the built older version on each OS, release a newer tag, and watch the app detect and install it.

## Notes

- `/releases/latest` (the endpoint in `tauri.conf.json`) redirects to the newest **non-prerelease** release - drafting or marking a release prerelease removes it from the update path.
- The dry-run path exists for first-time setup; use it before pushing a real tag.
- Monolith additionally publishes portable builds (raw exe / zipped .app) as extra steps after the release step; that is optional and unrelated to updating.
