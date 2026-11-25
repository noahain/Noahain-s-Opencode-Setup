# README.md

The README is the front door: a stranger decides in one screen whether this project is for them, and how to get it running.

## Typical sections (adapt to the repo)

- Title + one-line pitch (what it is, for whom)
- Badges - only ones the repo already uses or that encode verifiable facts (version, license, platforms, minimum toolchain). A badge whose value you cannot trace is noise at best.
- Screenshot / demo - reference existing assets only.
- What it is - two to five sentences a newcomer can act on.
- Features - each one exists today (verify in the tree).
- Install / download - exact artifact names, taken from the release workflow or release assets, not from memory.
- Build from source - either inline verified commands or a pointer to CONTRIBUTING.md.
- Usage - the shortest path to a working result.
- Requirements / platform support - from manifests, the CI matrix, and platform-specific docs.
- License - name from LICENSE; make the relative link resolve.

## Refresh specifics

- Version badges and any version text must match the manifest version.
- Every image path and relative link must exist in the tree.
- Download/install instructions must match what the release pipeline actually publishes (check .github/workflows or the release assets).
- Feature lists: run a pass of "does this still exist?" - renamed or removed features are the most common rot.

## Pitfalls

- A version badge one or two releases behind (classic) or ahead.
- Dead screenshot links after assets got reorganized.
- Install steps that still name an old artifact format.
- Marketing adjectives the repo never used; emojis; speed or scale claims nothing backs.
- A whole-file rewrite in response to "the README is stale".
