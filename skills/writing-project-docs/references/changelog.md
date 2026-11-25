# CHANGELOG.md

The reader is a user (or the maintainer at release time) asking "what changed?". Write for humans: commits are evidence, not entries.

## Format

Follow the existing file's format. If you are creating one, Keep a Changelog is the default: an [Unreleased] section plus, per release, Added / Changed / Deprecated / Removed / Fixed / Security. Match the existing entry voice when refreshing.

## Sources

- Latest tag: `git describe --tags --abbrev=0` (or sort tags by version).
- Unreleased work: `git log --oneline <tag>..HEAD`; also look at PR titles if available.
- Release dates come only from real tags: `git log -1 --format=%cs <tag>`. Never invent or estimate a date.

## Workflow for "update the changelog"

1. Determine the last released tag.
2. Collect commits since then; group them into user-facing entries (use commit scopes/types as categorization hints, but describe behavior, not implementation).
3. Make [Unreleased] reflect those changes; if it already has entries, merge - do not duplicate.
4. Leave released sections alone: they are a historical record. Never move entries between releases or edit past dates unless explicitly asked.
5. Add a released section only for versions that actually have tags.

## Pitfalls

- Pasting raw `git log` output as entries.
- Fabricating or guessing release dates.
- Turning [Unreleased] into a versioned section before it was actually tagged.
- Losing or duplicating existing entries during a merge.
- Internal-only churn (CI tweaks, refactors) listed as user-facing changes.
