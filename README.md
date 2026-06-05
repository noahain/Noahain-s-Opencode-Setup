# Noahain's OpenCode Setup

AI coding agent configuration for [OpenCode](https://opencode.ai). Contains subagent definitions, skill packages, behavioral instructions, and MCP server setup.

## Features

- **6 specialized subagents** — explore, git, docs-fetcher, test-engineer, spec-verifier, code-reviewer
- **94 skills** — reusable packages for frontend, backend, design, debugging, DevOps, and more
- **12 behavioral instructions** — autonomy, delegation, delivery, code style, API design, testing, self-improvement
- **7 plugins** — superpowers, opencode-agent-skills, antigravity-auth, dcp, snip, notification, handoff, kilo-auth
- **3 MCP servers** — Context7 (docs), Chrome DevTools (browser automation), 21st.dev (UI components)
- **RPD optimization mode** — parallel tool calls, batched reads, no permission seeking

## Structure

```
├── opencode.json          # Main config — agents, plugins, MCP, instructions
├── AGENTS.md              # Behavioral guidelines for LLM agents
├── .gitignore
├── instructions/          # 12 instruction files loaded into every session
│   ├── autonomy.md        # Full system access, auto-download, no permission seeking
│   ├── delegation.md      # Must delegate all search/git/test to subagents
│   ├── delivery.md        # Final delivery contract format
│   ├── questions-policy.md # Context7/WebFetch first, then ask
│   ├── morph-tools.md     # morph_edit vs edit tool selection policy
│   ├── api-design.md      # API route handler standards
│   ├── code-style.md      # Universal code style rules
│   ├── self-improvement-rules.md # Plan mode, subagent strategy, verification
│   ├── testing.md         # Testing standards
│   ├── subagent-driven-development-policy.md # 3-phase SDD workflow
│   ├── exploring.md       # Explore-pro delegation rules
│   └── prefrences.md      # Combined autonomy + preferences
├── prompts/               # System prompts for each subagent
│   ├── explore.md         # Read-only search agent
│   ├── git.md             # Git operations agent
│   ├── docs.md            # Documentation fetcher (Context7/WebFetch)
│   ├── test.md            # Build/lint/test runner
│   ├── spec.md            # Spec-compliance reviewer
│   └── review.md          # Senior code reviewer
└── skills/                # 94 reusable skill packages
    ├── frontend-design/   # Production-grade UI components
    ├── backend-patterns/  # Express, Next.js, Node.js patterns
    ├── brainstorming/     # Creative planning workflow
    ├── database-migrations/ # Prisma, Drizzle, Django, TypeORM patterns
    ├── debugger/          # Systematic debugging workflow
    ├── security-review/   # Auth, input handling, secrets patterns
    └── ... (90 more)
```

## Subagents

| Agent | Model | Access | Purpose |
|---|---|---|---|
| `@explore` | opencode-go/deepseek-v4-flash | bash (read-only) | Code/file search |
| `@git-agent` | opencode/mimo-v2.5-free | bash (read-only) | Git operations |
| `@docs-fetcher` | opencode/mimo-v2.5-free | none | Documentation lookup |
| `@test-engineer` | opencode/mimo-v2.5-free | bash (read-only) | Build/test/lint |
| `@spec-verifier` | opencode/mimo-v2.5-free | bash (read-only) | Spec compliance |
| `@code-reviewer` | opencode-go/mimo-v2.5-pro | bash (read-only) | Code quality review |

## MCP Servers

| Server | Purpose | Auth Required |
|---|---|---|
| Context7 | Library documentation queries | API key |
| Chrome DevTools | Browser automation and testing | None |
| 21st.dev | UI component search and generation | API key |

## Plugins

- `superpowers` — skill-based development workflow
- `opencode-agent-skills` — expanded skill library
- `opencode-antigravity-auth` — authentication
- `@tarquinen/opencode-dcp` — deep context preservation
- `opencode-snip` — snippet management
- `opencode-notification` — system notifications
- `opencode-handoff` — session handoff
- `opencode-kilo-auth` — additional auth

## Key Instructions

- **Delegate everything** — all search, git, test, and doc lookups go to subagents. The main context is for orchestration only.
- **Stop slop** — no filler, passive voice, throat-clearing, em dashes, or quotables in prose.
- **Verify before claiming** — tests, lint, and typecheck must produce fresh evidence before marking anything done.
- **Ask, don't guess** — technical facts go to Context7/WebFetch. Intent/preferences go to the user via questions tool.
- **RPD mode** — parallel tool calls required unless editing the same file. Batch reads. No permission seeking.

## Skill Highlights

- **frontend-design** — React, Tailwind, shadcn/ui components
- **backend-patterns** — Node.js, Express, Next.js API routes
- **ui-ux-pro-max** — 50+ styles, 161 palettes, 57 font pairings
- **impeccable** — frontend design audit and polish
- **brainstorming** — structured creative planning with visual companion
- **debug-investigator** — hypothesis-driven root cause analysis
- **security-review** — input validation, auth, secrets handling
- **database-migrations** — schema changes, rollbacks, zero-downtime
- **rust-patterns** / **golang-testing** / **dart-flutter-patterns** — language-specific best practices
- **skill-creator** / **writing-skills** — build and maintain skill packages

## Configuration

Edit `opencode.json` to:

- Add or remove subagents under `agent`
- Change instruction paths under `instructions`
- Add plugins under `plugin`
- Configure MCP servers under `mcp`

MCP API keys (`Context7` and `21st`) are configured in `opencode.json` and should be populated before first use.

## License

MIT
