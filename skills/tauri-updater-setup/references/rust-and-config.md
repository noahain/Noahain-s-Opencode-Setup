# Rust wiring and config

## Cargo.toml

```toml
[dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tokio = { version = "1", features = ["sync", "macros", "rt"] }  # only for the cancel channel
```

## Plugin registration (lib.rs / main.rs)

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(CancelDownloadState::default())          // from assets/updater-command.rs
    .invoke_handler(tauri::generate_handler![
        // ...existing commands...
        start_update_download,
        cancel_update_download,
    ])
```

Why a custom download command: the plugin exposes `plugin:updater|check` directly to JS (no custom code needed for the check), but the built-in `download_and_install` has no frontend-facing progress events or cancellation. The command in `assets/updater-command.rs` wraps it with a `tauri::ipc::Channel` for progress and a `oneshot` + `tokio::select!` for cancel. If neither matters for the app, `update.download_and_install(|_, _| {}, || {})` called from a simpler command is enough.

One serde detail that breaks progress numbers silently: `#[serde(tag = "event", content = "data", rename_all = "camelCase")]` on the enum renames the **variants** (`Started` -> `started`) but not the fields. The shipped asset also sets `rename_all_fields = "camelCase"` (serde 1.0.186+) so the fields arrive as `contentLength` / `chunkLength` - exactly what `updater-toast.js` reads. If progress percentage stays at 0, this naming mismatch is the usual cause.

## tauri.conf.json

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<content of the public key - not a file path>",
      "endpoints": [
        "https://github.com/OWNER/REPO/releases/latest/download/latest.json"
      ]
    }
  }
}
```

- `createUpdaterArtifacts: true` is required - without it no `.sig` files or updater bundles are produced. (`"v1Compatible"` exists only for migrating v1 apps.)
- `pubkey` must be the key **content**; a path does not work.
- TLS is enforced. `"dangerousInsecureTransportProtocol": true` temporarily allows non-HTTPS endpoints for local testing - remove it afterwards.
- `plugins.updater.windows.installMode`: `"passive"` (default; small progress window, no interaction) | `"basicUi"` (interactive) | `"quiet"` (silent, cannot self-elevate).
- Optional per-platform endpoints can use `{{target}}`, `{{arch}}`, `{{current_version}}` variables when serving your own manifest.
- macOS: `bundle.macOS.hardenedRuntime: true` (what Monolith ships). The docs do not state the updater itself requires code signing, but macOS distribution generally does - Apple Silicon requires signing for any internet-downloaded app, and outside-the-App-Store distribution requires notarization.

## Generating the signing key

```bash
tauri signer generate -w ~/.tauri/myapp.key
# flags: -p <password>  (prompted if omitted)
#        -w <path>      (writes the key + <path>.pub public key)
#        --ci           (no prompts; empty password)
```

- Public key: the content of `~/.tauri/myapp.key.pub` (one line) goes into `tauri.conf.json` `pubkey`.
- Private key: the `myapp.key` file itself. Keep it outside the repo (or gitignore it) and put it into CI:
  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/myapp.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # only if the key has a password
  ```
- `TAURI_SIGNING_PRIVATE_KEY` may be the key content or a path on the runner. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional for an unencrypted key.

## Capabilities

Add to the relevant capability file (`src-tauri/capabilities/*.json`):

```json
"permissions": [
  "...",
  "updater:default",
  "process:default"
]
```

Without these the frontend's `plugin:updater|check` and `plugin:process|restart` calls are rejected at runtime - and the toast will silently never appear.

## Version consistency

`tauri.conf.json` `version` is what the bundle, the manifest, and the running app report. Keep `Cargo.toml` `version` in lockstep, and tag releases `vX.Y.Z` to match. The updater compares the manifest version against the running app's config version with SemVer, so a forgotten bump means clients never see the release.
