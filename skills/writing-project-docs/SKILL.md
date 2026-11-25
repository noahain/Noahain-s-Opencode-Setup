---
name: writing-project-docs
description: Use when asked to create, update, refresh, sync, or rewrite a project's markdown docs - README, CONTRIBUTING, ARCHITECTURE, SECURITY, or CHANGELOG - or when a document seems stale, wrong, or out of date relative to the code, or before a release, handoff, or onboarding someone. Covers both refreshing existing docs in place and writing them from scratch, always grounded in what the repository actually says.
---

# Writing Project Docs

## Why this exists

A project document is a set of claims about the repository: "run this command", "we use this version", "the frontend talks to the backend like this". Docs rot in one way - the code moves and the claims don't - and they become actively harmful when a reader trusts a claim that is no longer true. Every claim you write must be traceable to something in the repository: a manifest, a CI workflow, a source file, a command you ran. When you cannot trace a claim, do not write it as fact.

## Which documents this covers

- **Create** - the file does not exist yet.
- **Refresh** - the file exists and needs to become true again (the default).
- **Rewrite** - the user explicitly asks for a from-scratch regeneration.

Each document has its own reference with required sections, the quality bar, and its pitfalls. Read it before writing:

| Document | Reference |
|---|---|
| README.md | `references/readme.md` |
| CONTRIBUTING.md | `references/contributing.md` |
| ARCHITECTURE.md | `references/architecture.md` |
| SECURITY.md | `references/security.md` |
| CHANGELOG.md | `references/changelog.md` |

Start every run by building the fact sheet - what the repository actually says - per `references/repo-facts.md`.

## Modes

**Refresh (default when the file exists).** Preserve what works: structure, headings, voice, formatting, badges, images, links. Change only what is actually stale, so that every changed line traces to a fact delta or to an explicit request. A refresh that shows up as a whole-file diff has failed - the reader loses the ability to see what changed and why.

**Rewrite** only when explicitly asked ("from scratch", "regenerate", "start over"). Same fact discipline, fresh structure.

**Create** when the file is missing. Use the reference's section list as the skeleton and match the repo's existing tone and formatting.

If the request is vague about mode and the file exists, refresh - it is the least destructive reading of the request - and say what you did.

## Workflow

1. Determine scope: which document(s), which mode. "Update the docs" usually means the document(s) the context points at; prefer the smallest set that satisfies the request.
2. Build the fact sheet (`references/repo-facts.md`). Spend real effort here; every later step draws from it.
3. Draft or surgically edit, following the document's reference file.
4. Verify (see below).
5. Report: what changed, which sources back the facts, what you could not verify.

## Verification pass

Before finishing, walk the document and check each claim against its source:

- **Commands** - point to where each one comes from (CI workflow, Makefile, package manifest script, or you ran it). Include the working directory when it is not the repo root; a command that only works from the wrong directory is a broken command.
- **Versions** - copy from the manifest or toolchain file (Cargo.toml, package.json, pyproject.toml, rust-toolchain.toml, ...). Never from another document, from memory, or from an old badge.
- **Paths and links** - every referenced file and directory must exist; relative links must resolve.
- **Features, modules, flags** - verify they exist in the tree today. Anything removed or renamed gets fixed or dropped.
- **Never invent** - dates, email addresses, URLs, release artifacts, benchmarks, SLAs, screenshots, GPG keys.

When something needed cannot be verified: keep it out, keep the existing text (refresh mode), or leave an obvious placeholder - and list it in your report so the maintainer can fill it in. Never guess silently.

## Repository conventions win

Before writing, look for the repo's own rules and voice: AGENTS.md, CLAUDE.md, existing docs, .github/ templates, formatter/linter configs. Match terminology, the project's own spelling of its name, badge style, and section conventions. If CI exists, the commands it runs are the ground truth for build/test instructions - not what old docs say, not what is customary for the ecosystem.

## Common mistakes

- Turning a refresh into a rewrite: restyling, reordering, or "improving" prose that wasn't asked about.
- Documenting the ecosystem's conventional commands instead of this repo's actual ones.
- Version numbers and install artifacts copied from old docs instead of the manifest / release config.
- Feature lists that describe what the project once did.
- CHANGELOG entries that dump commits or fabricate dates.
- Adding badges, logos, tables of contents, or emojis a project never had because "READMEs usually have them".
