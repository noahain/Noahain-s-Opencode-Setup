# Frontend (vanilla JS + withGlobalTauri)

## Files to copy from assets/

| File | Role |
|---|---|
| `plugin-updater.js` | exposes `window.__TAURI_PLUGIN_UPDATER__` - `check()` plus a `downloadAndInstall(events, {signal})` built on the custom Rust command |
| `plugin-process.js` | exposes `window.__TAURI_PLUGIN_PROCESS__` - `relaunch()` via `plugin:process|restart` |
| `updater-toast.js` | the UX: exposes `window.TauriUpdater` - `init()`, `check()`, `relaunch()` |
| `updater-toast.css` | self-contained styling for the toast (adjust to the app's theme) |

Load order in `index.html` (after the Tauri bridge, before app code that calls `init`):

```html
<link rel="stylesheet" href="lib/updater-toast.css">
...
<script src="lib/plugin-updater.js"></script>
<script src="lib/plugin-process.js"></script>
<script src="lib/updater-toast.js"></script>
```

## Wiring

- Call `TauriUpdater.init()` once after page load. It auto-checks silently: one retry after 5 s, 10 s timeout per check, failures only `console.warn`.
- For a manual "Check for updates" button, call `TauriUpdater.check()` - it resolves `{available, version, ...}` or `null`, rejects on failure; show your own status text from that promise.

## The flow (what the user sees)

1. Check finds a newer version -> toast: "Update available - vX.Y.Z" with Update / dismiss.
2. Update -> progress bar. `started` event carries `contentLength`; each `progress` event is an incremental `chunkLength` that the client sums. If content length is unknown the bar runs indeterminate.
3. `finished` -> installer runs on Windows (passive UI); on all platforms the update is on disk but the running app is still the old version -> "Restart now" -> `relaunch()`.
4. Cancel/abort calls `cancel_update_download` on the Rust side.
5. Stall watchdog: no progress event for 2 minutes -> "Download seems stuck" panel with Retry.

Error classes (matched from the message text, shown with copy panels): `SIGNATURE` (verification failed - do not install), `RATE_LIMIT` (GitHub 403), `NOT_FOUND` (404 - wrong endpoint or release removed), `NETWORK`, `PERMISSION`, `IN_USE` (another instance), `UNKNOWN`.

## Bundler projects

If the frontend has a bundler, skip the three `plugin-*.js`/toast assets' IPC layer and use the official packages instead: `@tauri-apps/plugin-updater` (`check()` -> `update`, `update.downloadAndInstall(onEvent)` with the same Started/Progress/Finished event shape) and `@tauri-apps/plugin-process` (`relaunch()`). The Rust side, config, keys, capabilities, and CI remain exactly the same.

## Local testing

- Quick sanity check in `tauri dev`: open the webview devtools and run `await window.__TAURI_PLUGIN_UPDATER__.check()` - it hits the real endpoint (`null` when up to date). This proves capabilities + config + endpoint wiring.
- Full-fidelity local test without publishing: set `plugins.updater.dangerousInsecureTransportProtocol: true`, point `endpoints` at a local server URL, serve a hand-made `latest.json` whose `version` is **higher** than the app's, with a real bundle + `.sig` for the current platform (sign it with `tauri signer sign <file>` using your private key env). The check succeeds and the toast appears in dev; the actual install should be tested with release builds - dev bundles cannot be installed over.
- Remember to remove `dangerousInsecureTransportProtocol` and restore the GitHub endpoint after testing.

## Monolith reference points

Monolith additionally has a minimized "pill" state during updates, a footer status line, and test hooks; those are cosmetic extras, not part of the core flow. Its `updater-toast.js` lives in `frontend/lib/` and is loaded in the order shown above (with `?v=N` cache busters, which this project uses everywhere).
