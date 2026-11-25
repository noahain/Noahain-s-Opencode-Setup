# The fact sheet

Everything a document claims should come from here. Build this before writing; it is the difference between documentation and plausible fiction.

## Identity

- Project name and how the repo itself spells it (README title, manifest `name`, directory). Never "fix" a spelling the project uses deliberately.
- One-line description: manifest `description`, or the existing README tagline, or the repo's own summary - in that order of preference.
- Links: `git remote get-url origin`, homepage fields in the manifest, existing badges.
- License: from LICENSE / the manifest `license` field.

## Stack and exact versions

Read manifests and toolchain files, not prose: Cargo.toml, package.json, pyproject.toml, go.mod, composer.json, rust-toolchain.toml, .nvmrc, .python-version, `engines` fields. Minimum versions stated in docs should be the ones these files imply.

## Commands (build / run / test / lint)

Sources, best first:

1. CI workflows (.github/workflows/\*) - these run on every change, so they cannot rot unnoticed.
2. Makefile / justfile / task runners, package.json scripts, scripts/ directory.
3. Existing docs - verify each command against the sources above before trusting it.

For every command, record the working directory it must run from, and any required environment variables. If the repo has no test command, that is a fact too - say so instead of inventing one.

## Structure

- Directory map: top two levels, one line each; note what is generated vs source (build/, dist/, target/ are usually generated).
- Entry points: where execution starts (main.rs, index.html, src/index.ts, bin/...).
- Tests: where they live and how they are organized.
- Assets: screenshots/logos the docs can reference (verify they exist).

## Release and history (for CHANGELOG and badges)

- Version source of truth: the manifest version field; cross-check against the latest git tag (`git tag -l --sort=-v:refname | head`).
- Tag dates: `git log -1 --format=%cs <tag>` for real release dates.
- Unreleased work: `git log --oneline <last-tag>..HEAD`.
- Existing changelog format: Keep a Changelog vs freeform vs generated - the existing file wins.

## Conventions

- AGENTS.md / CLAUDE.md / .editorconfig / linter configs: build commands, code style, commit message format, branch model.
- The absence of a formatter or linter can itself be documented ("there is none; keep the diff clean") - do not silently introduce tooling that was never used.

## Git history

Use history for the CHANGELOG and nothing else. It is not a source for prose claims - code and configs are.
