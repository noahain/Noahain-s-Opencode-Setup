# Release runbook

## One-time setup checklist

- [ ] `tauri-plugin-updater` + `tauri-plugin-process` in Cargo.toml; tokio sync features if using the cancel command
- [ ] Plugins registered in the builder; `CancelDownloadState` managed; commands in `invoke_handler`
- [ ] `bundle.createUpdaterArtifacts: true`
- [ ] `plugins.updater.pubkey` + `endpoints` (GitHub `latest.json`)
- [ ] Key generated (`tauri signer generate -w`), private key kept out of the repo / gitignored
- [ ] Repo secrets set: `TAURI_SIGNING_PRIVATE_KEY` (+ password if used)
- [ ] Capabilities include `updater:default`, `process:default`
- [ ] Frontend assets loaded in order; `TauriUpdater.init()` called on startup
- [ ] `.github/workflows/release.yml` installed (with `finalize-updater`)

## Every release

1. Bump the version in `tauri.conf.json` **and** `Cargo.toml` (matching), commit on the working branch, merge to the release branch.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Watch the 4 matrix jobs + `finalize-updater`.
4. Verify the release: all `.sig` assets present, `latest.json` contains every platform key (`gh release view ... --json assets`, `curl -sL .../latest.json | jq '.platforms | keys'`).
5. Client check: an installed older build must show the toast, download, install, and report the new version after restart.

A tag is only for version bumps; docs-only changes need no tag.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `finalize-updater` fails: `missing updater asset for ...` | that platform's build failed, or its artifacts were renamed | check the matrix job log; restore default artifact names |
| Check returns 404 | endpoint URL wrong (owner/repo), or newest release is a draft/prerelease | fix `endpoints`; publish as a normal release |
| Every install fails signature verification | config `pubkey` does not match the CI private key | regenerate the pair, update both |
| No toast ever appears | missing capabilities; check() failing silently | add `updater:default`/`process:default`; run `await window.__TAURI_PLUGIN_UPDATER__.check()` in devtools to see the real error |
| Progress stays at 0% / "Downloading..." | serde field renaming vs JS field names (`contentLength` vs `content_length`) | set `rename_all_fields = "camelCase"` on the event enum |
| Install fails on Windows | running a portable/dev build, or another instance is open | test an installed build; close other instances; per-machine installs may need elevation |
| `RATE_LIMIT` / 403 | anonymous GitHub API limits on the checking machine | retry later |
| Update installs but version doesn't change | the running app only restarts into the new version after relaunch | make the UI call `relaunch()` after `finished` |
| macOS updater can't find an update | `.app.tar.gz` renamed | keep default names; finalize job greps them |

## Key rotation (advanced)

The `pubkey` is baked into every installed build. To rotate safely: generate the new pair, ship **one release signed with the OLD key** whose build embeds the **NEW pubkey**, let it reach users, then switch the CI secret to the new private key. Rotating the secret first breaks every existing install.
