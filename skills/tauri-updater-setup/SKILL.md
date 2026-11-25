---
name: tauri-updater-setup
description: Use when setting up, reviewing, or fixing auto-updates in a Tauri 2 desktop app - adding tauri-plugin-updater and tauri-plugin-process, signing keys (tauri signer generate), tauri.conf.json updater config, updater capabilities, an in-app update UI, or the GitHub Actions release pipeline that publishes updater artifacts and latest.json. Also use when an existing updater misbehaves - signature verification failures, 404s, a single-platform latest.json, missing .sig assets, an update UI that never shows, or macOS update problems.
---

# Tauri Updater Setup

## The four pieces of a working updater

An auto-updating Tauri 2 desktop app needs all four of these, and an update only truly ships when they line up:

1. **Rust wiring** - `tauri-plugin-updater` (plus `tauri-plugin-process` to relaunch) registered, with a command to download with progress and cancel.
2. **Config + keys** - `bundle.createUpdaterArtifacts`, an updater `pubkey`, and an `endpoints` URL; the private key lives only in CI secrets.
3. **Frontend UX** - a check on startup (silent on failure), a manual way to check, download progress, a restart prompt.
4. **Release pipeline** - CI builds and signs every target and publishes a **cross-platform `latest.json`**. That last part is the one everyone gets wrong.

This skill is modeled on Monolith's working setup (vanilla-JS frontend, `withGlobalTauri`, GitHub Releases) and adapts to any Tauri 2 desktop project.

## Workflow

1. **Recon** - confirm a Tauri 2 project; note the identifier, product name, `OWNER/REPO`, whether `withGlobalTauri` is on, where the version lives, and which of the four pieces already exist. Never duplicate an existing piece - repair it.
2. **Rust wiring** - add the two crates to `src-tauri/Cargo.toml`, register the plugins, add the download/cancel commands. Use `assets/updater-command.rs`; wiring details in `references/rust-and-config.md`.
3. **Config** - `bundle.createUpdaterArtifacts: true`, plus `plugins.updater.pubkey` and `endpoints` pointing at `<OWNER/REPO>/releases/latest/download/latest.json`. Options in `references/rust-and-config.md`.
4. **Signing keys** - `tauri signer generate -w ~/.tauri/<app>.key`; the **public** key goes into `tauri.conf.json`, the **private** key file goes into repo secrets `TAURI_SIGNING_PRIVATE_KEY` (content) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit the private key.
5. **Capabilities** - `updater:default` and `process:default` in the app's capability file, or the IPC calls are denied.
6. **Frontend** - copy the three JS wrappers + the CSS from `assets/`, load them in order, call `TauriUpdater.init()` on startup. Details in `references/frontend.md`. (If the project uses a bundler, the official `@tauri-apps/plugin-updater` package covers the same flow - the other pieces are unchanged.)
7. **Release pipeline** - install `assets/release-workflow.yml` as `.github/workflows/release.yml`. It includes the `finalize-updater` job that assembles one cross-platform `latest.json` after the build matrix. Explanation in `references/github-actions.md`.
8. **Verify** - walk `references/release-runbook.md`. Never claim the updater works until an installed older build has actually detected, downloaded, and installed a newer release; a green CI run alone proves nothing about the client.

## Rules that prevent the classic failures

- The private key never touches the repo. Only the public key goes in `tauri.conf.json`; only CI gets the secret.
- Never rename `*.app.tar.gz` / `*.sig` artifacts - the manifest job and the macOS updater find platforms by exact name patterns (`*.app.tar.gz` is macOS's update bundle).
- Every matrix build uploads its own single-platform `latest.json` and they race; that is why `finalize-updater` exists. Do not delete it and do not "simplify" the workflow by removing it.
- Version discipline: the tag (`vX.Y.Z`), `tauri.conf.json` `version`, and `Cargo.toml` version must agree. `/releases/latest` serves the newest non-prerelease release only - prereleases are skipped.
- Portable and dev builds cannot update themselves; test with an installed build.
- The key pair must match: a config `pubkey` generated from a different pair than the CI private key means every update fails signature verification.
- The manifest `signature` field is the **content** of the `.sig` file, never a path or URL.

## References

| File | Contents |
|---|---|
| `references/rust-and-config.md` | crate wiring, plugin registration, full `plugins.updater` option list, key generation, capabilities |
| `references/frontend.md` | the toast UI flow, script load order, manual check hook, local testing |
| `references/github-actions.md` | workflow anatomy, secrets setup, the latest.json race + finalize job, platform keys |
| `references/release-runbook.md` | one-time setup checklist, per-release procedure, verification, troubleshooting table |

Assets: `assets/updater-command.rs`, `assets/plugin-updater.js`, `assets/plugin-process.js`, `assets/updater-toast.js`, `assets/updater-toast.css`, `assets/release-workflow.yml`.
