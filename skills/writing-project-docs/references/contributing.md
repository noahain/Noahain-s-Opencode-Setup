# CONTRIBUTING.md

The reader is a potential contributor with a fresh clone and no context. The document succeeds when they can go from zero to running tests without asking anything.

## Typical sections

- Welcome - one or two sentences; where to ask questions (link the repo's issue tracker or chat if it exists).
- Prerequisites - exact versions from toolchain files; note OS-specific ones (system libraries, build tools) separately.
- Setup - clone, install dependencies.
- Build and run - verified commands with their working directories.
- Tests - how to run the full suite and a single test/suite/file. Match the repo's actual runner (cargo test, node --test, pytest, go test, ...).
- Lint/format - the actual command, or an explicit note that none exists and what that implies. Do not document tooling the repo does not have.
- Project layout - brief; link ARCHITECTURE.md if it exists.
- Conventions - commit message format, branch model, PR expectations (from AGENTS.md/CLAUDE.md/.github templates if present).
- License note for contributions if the repo states one.

## Ground truth

The CI workflows define the true required steps. If CI runs lint and tests on PRs, CONTRIBUTING should tell contributors how to run the same things locally. If something only runs in CI, say that.

## Refresh specifics

- Re-verify every command against CI/manifests; check the working directory each one needs.
- Prerequisites must still match the toolchain files and the CI matrix.
- Test instructions must name the real runner and real test locations.

## Pitfalls

- Commands that only work from the wrong directory (the most common contributor trap).
- Missing platform-specific dependencies.
- Describing a build step the repo does not have - or omitting the one it does.
- Stale minimum toolchain versions.
- Documenting formatters or linters the repo deliberately does not use.
