# ARCHITECTURE.md

The reader is a developer who needs to know where things live and how they fit together - orientation, not an encyclopedia. Prefer a small accurate map over an exhaustive stale one.

## Typical sections

- Overview - one paragraph: what the system is, the big pieces, how they communicate.
- Diagram - a mermaid diagram is fine when the repo tolerates diagrams; every node must be a real file, module, or service.
- Directory map - what lives where, one line per area.
- Components - each module/package/service: responsibility, key files, how it talks to its neighbors.
- Key flows - the two or three sequences a newcomer must understand (startup, main user action, background jobs).
- External interfaces - IPC commands, HTTP endpoints, CLI flags (pick what exists).
- Configuration and storage - where user state lives (config directories, databases, files).
- Platform-specific behavior - what differs per OS.
- Where to add new code - the "I want to build X, where does it go" answer.

## Refresh specifics

- Re-verify the module list against the tree: renames and new modules are the main decay.
- Diagram nodes must exist; regenerate the diagram rather than patching it.
- Keep it consistent with the code's actual boundaries, not the ideal ones.

## Pitfalls

- Invented modules or files that never existed (fatal - the document becomes untrustworthy).
- Detailed descriptions of internals that change weekly; describe structure, not line-level logic.
- Duplicating README content instead of pointing at it.
- Diagrams that no longer match the tree.
