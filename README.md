# Noahain's OpenCode Setup

AI coding agent configuration for [OpenCode](https://opencode.ai). Includes subagent definitions, skill packages, behavioral guidelines, plugins, custom tools, and MCP servers.

## Repository layout

A clone contains the setup files at the repository root:

```
├── opencode.json           # agents, plugins, MCP servers, providers
├── cli.json                # terminal / TUI preferences
├── dcp.jsonc               # Deep Context Preservation config
├── AGENTS.md               # behavioral guidelines (loaded as instructions)
├── .env.example            # environment variables for API keys
├── commands/               # custom commands
├── prompts/                # system prompts for each subagent
├── skills/                 # 120 reusable skill packages
├── tools/                  # quorum_* custom tools used by the clerk agent
├── lib/                    # shared helpers for the quorum tools
├── package.json
└── bun.lock
```

On the maintainer's machine the working tree is checked out one level down:

```
Noahain's Opencode Setup/
└── setup/                  # the repository working tree
```

Opening the parent `Noahain's Opencode Setup` folder in OpenCode uses only the global config. Opening `setup/` directly would also load this repo's `opencode.json` as a project config.

## Installation

Clone or symlink this repository into your OpenCode config directory:

```powershell
# Windows (symlink requires Developer Mode or an elevated shell)
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.config\opencode" -Target "<path-to-this-repo>"
```

```sh
# macOS / Linux
ln -s "/path/to/Noahain's Opencode Setup/setup" ~/.config/opencode
```

Then export the API keys listed in `.env.example` (or set them as system environment variables) before starting OpenCode. `opencode.json` references them with `{env:VAR}` substitution. OpenCode creates `service.json`, `node_modules/`, and `backups/` on first run; they are gitignored.

## Subagents

| Agent | Model | Access | Purpose |
|---|---|---|---|
| `clerk` | `opencode/deepseek-v4.1-flash-free` | quorum tools only | Swarm audit/verify orchestration |
| `fast-coder` | `opencode/deepseek-v4.1-flash-free` | edit | Simple/boilerplate coding |
| `vibe-tester` | `opencode/deepseek-v4.1-flash-free` | bash | Spec validation & gap analysis |
| `explore` | `opencode/deepseek-v4.1-flash-free` | bash (read-only) | Code/file search |
| `git-agent` | `opencode/deepseek-v4.1-flash-free` | bash (read-only) | Git operations |
| `docs-fetcher` | `opencode/deepseek-v4.1-flash-free` | none | Documentation lookup |
| `test-engineer` | `opencode/deepseek-v4.1-flash-free` | bash | Build/test/lint |
| `spec-verifier` | `opencode/deepseek-v4.1-flash-free` | none | Spec compliance |
| `code-reviewer` | `opencode/deepseek-v4.1-flash-free` | bash | Code quality review |

## Commands

| Command | Purpose |
|---|---|
| `/impeccable` | Frontend design review and improvement |
| `/learned` | Summarize session learnings into `AGENTS.md` blocks |
| `/skillhelp` | Recommend skills for the current task |

## MCP servers

| Server | Purpose | Auth |
|---|---|---|
| Context7 | Library documentation queries | `CONTEXT7_API_KEY` |
| Chrome DevTools | Browser automation (attaches to your Chrome) | None |
| repowise | Codebase documentation engine | None |
| figma | Figma design/code bridge | OAuth via `/mcps` |

`repowise` is configured against `F:\Coding Projects\Monolith`; update the path in `opencode.json` for another repository.

## Plugins

- `superpowers` — skill-based development workflow
- `@tarquinen/opencode-dcp` — deep context preservation
- `opencode-wakatime` — WakaTime activity tracking
- `opencode-handoff` — session handoff

## Providers

`opencode.json` defines 15 provider entries under `providers` (V2 shape) and `provider` (legacy shape). All live API keys are replaced with `{env:VAR}` placeholders. Local endpoints such as `wapq`, `arena`, `glm-proxy`, and `abliteration` point at localhost ports and are environment-specific.

## Notes

- The repository is public. Never commit real API keys, `.env`, or `service.json`.
- `AGENTS.md` holds the behavioral guidelines: delegation rules, autonomous bug fixing, verification requirements, RPD mode, and opt-in development modes.
- `tools/quorum_*.ts` and `lib/` support the `clerk` agent. Disable the `quorum_*` tools with `tools` in `opencode.json` if you do not use it.

## License

MIT
