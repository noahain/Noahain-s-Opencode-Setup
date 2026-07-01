# AGENTS.md

Global behavioral rules for all projects. Project-specific `AGENTS.md` files merge on top of this one. The default operating mode is below; the opt-in Modes near the end replace it only when I explicitly activate them.

## Operating Default — Ask About Everything

This is the baseline unless a Mode is active.

- Ask freely. There is no cap on questions and no question is too small.
- Use the questions tool, and batch all questions into one message rather than asking one at a time.
- Ask about intent, requirements, naming, design direction, and preferences — anything about *what you want* or *why*. Do not guess these.
- Surface assumptions explicitly. If multiple interpretations exist, present them instead of silently picking one. If a simpler approach exists, say so and push back when warranted.
- The one carve-out is technical execution — see Autonomous Bug Fixing. Asking-first governs intent and direction, not permission to do obvious technical work.

## Working Style — Do It Yourself, Delegate Narrowly

- Do the work yourself by default: reasoning, debugging, root-causing, design, and the actual fixes stay in the main context.
- Delegate **only** when a subagent specifically owns that job (see Delegation). Never delegate reasoning about a bug or the fix itself.
- Read files you already know the path to directly. Use `explore` to find *where* something is, not to read a file you can already locate.
- Verify file/tool availability yourself by checking — never ask "is X installed?" Treat something as missing only after confirming it.

## Delegation

Delegate these and nothing else. Everything not listed stays with the main agent.

- **`explore`** — locating code, files, symbols; grep/glob searches, usages, import tracing. Read-only.
- **`docs-fetcher`** — all documentation, API, and error-message lookups. Treat it as a search engine: tell it exactly what you need to know; it does the fetching and returns targeted excerpts. Don't fetch raw pages yourself.
- **`git-agent`** — all git operations (status, diff, log, stage, branch, commit, PR text). Ask me before committing, then hand the commit to `git-agent`.
- **`test-engineer`** — build, compile, lint, typecheck, and test runs. It reports results; it never edits.
- **`fast-coder`** — fast, low-stakes edits that need no quality bar or reasoning (boilerplate, scaffolding, mechanical changes). When you use it: give it maximum context up front, scope it to do *only* that one task and nothing else, and review its output. Never use it for logic, security-sensitive, or design work.
- **`vibe-tester`** — spec validation / gap analysis (mainly inside Subagent-Driven Development mode).
- **`spec-verifier`** — verifies implementation matches spec (mainly inside Subagent-Driven Development mode).
- **`code-reviewer`** — quality, security, performance review with fresh verification evidence (mainly inside Subagent-Driven Development mode).

## Autonomy & Permissions

- **Ask before committing to git.**
- **Always ask before destructive actions**, in every mode including Full-Autonomy: deleting files, modifying production data, force-pushing, dropping databases, or any irreversible command that reaches outside the current project scope.
- **Autonomous Bug Fixing (technical execution):** given a bug report, just fix it — don't ask for hand-holding on *how*. Point at the logs, errors, or failing tests, then resolve them. Go fix failing CI without being told the steps. Still ask if the requirement or intent behind the fix is ambiguous.

## Planning & Verification

- For multi-step or architectural work, state a brief plan with checkable, verifiable steps before starting.
- Turn vague tasks into verifiable goals: "fix the bug" → "write a test that reproduces it, then make it pass"; "add validation" → "test invalid inputs, then make them pass."
- Never claim done without proof: run tests, typecheck, and lint (via `test-engineer`) and demonstrate correctness. "Assume success" is only acceptable in RPD mode.
- If something goes sideways, stop and re-plan — don't keep pushing.

## Delivery Contract

When a task is ready for me to test, close with one final message — not a step-by-step log:

1. **What was done** — a summary, not a play-by-play.
2. **What's ready to test** — exactly what I should exercise.
3. **Assumptions made** — anything you decided on your own, so I can confirm it.
4. **Open questions** — use the questions tool if any remain.

## Self-Improvement Loop

- After any correction from me, add a specific, actionable rule to `AGENTS.md` that prevents the same mistake from recurring.
- Write the rule for yourself: concrete, testable, not aspirational.
- Iterate on these rules until the mistake rate drops; prune ones that stop earning their place.

## Simplicity, Laziness & Elegance

Lazy about *scope*, never about *correctness*.

- Write the minimum code that solves the problem. No features, abstractions, configurability, or error handling for impossible scenarios that weren't asked for. Fewest files possible; deletion over addition; boring over clever.
- Before building, stop at the first rung that holds: Does this need to exist (YAGNI)? Does the standard library or a native platform feature cover it? Does an already-installed dependency? Can it be one line? Only then write new code.
- Don't add new dependencies if they can be reasonably avoided.
- When a change *is* non-trivial: fix the root cause and choose the elegant solution. No patches stacked on patches — straps on top of straps become spaghetti. If a fix feels hacky, redo it as if you knew everything you know now.
- Skip the elegance pass on simple, obvious fixes; don't over-engineer.
- Challenge your own work before presenting it: "would a staff engineer approve this?"

## Surgical Changes

- Touch only what the request requires; every changed line should trace to it.
- Don't "improve" adjacent code, comments, or formatting, and don't refactor things that aren't broken.
- Match existing style even if you'd do it differently.
- Remove imports/variables/functions that *your* changes orphaned; leave pre-existing dead code alone but mention it.

## Code Style

### General Principles
- Keep logic in one function unless it's genuinely reusable or composable. Don't extract single-use helpers preemptively — inline at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible, but never swallow real errors or ignore error returns. Handle errors explicitly at trust boundaries.
- Rely on type inference; avoid explicit annotations unless needed for exports or clarity. Put explicit return types on exported functions.
- In typed languages, avoid escape-hatch types (e.g. `any` in TS).
- Prefer functional array methods (`map`/`filter`/`flatMap`) over manual loops; use type guards on `filter` to preserve inference.
- Inline values used only once instead of naming an intermediate variable.
- Functions do one thing — if you need "and" to describe it, split it. Name variables after what they hold, functions after what they do. Don't abbreviate (`getUserProfile`, not `getUsrProf`).

### Variables & Control Flow
- Prefer `const` over `let`; use ternaries or early returns instead of reassignment.
- Avoid `else`; prefer early returns.
- Avoid unnecessary destructuring; use dot notation to preserve context.

### Imports
- Never alias imports (`import { foo as bar }`).
- Never use star imports (`import * as Foo`). If a namespace is needed, import the module's own exported namespace by name.
- Group imports at the top: stdlib, external packages, internal modules.
- Prefer dynamic imports for heavy modules only needed on selected code paths, especially in startup-sensitive entrypoints. Destructure the bindings near the top of the narrowest scope that needs them.

### Complex Logic
- Make the main function read as the happy path; move supporting details into small helpers below it.
- Extract only when it names a real concept (e.g. `requireConfig`, `readMetadata`), not to break up simple expressions. Keep helpers close to the code they support.

### Comments
- Don't write comments or docstrings.
- No commented-out code — delete it; git remembers.

### Commits & Branches
- Commit messages and PR titles: `type(scope): summary` — `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scope optional.
- Branch names: short, at most three hyphenated words, no slashes or type prefixes (e.g. `session-recovery`, not `feat/session-recovery`).

### JavaScript / TypeScript
- Prefer Bun APIs when available (e.g. `Bun.file()`).
- Drizzle: use snake_case field names so column names don't need restating as strings.
- Effect: bind services to named variables before calling methods; prefer `Schema.UnknownFromJsonString` + `Schema.decodeUnknownOption` over `JSON.parse` wrapped in `Effect.try`; don't return `Effect` from helpers that aren't actually effectful.

## Core Principles

- **Simplicity first** — every change as simple as possible, minimal code impact.
- **No laziness on correctness** — find root causes, no temporary fixes, senior-developer standards.
- **Minimal impact** — touch only what's necessary; avoid introducing bugs.

## API Design

- Validate every endpoint's inputs at the boundary; never trust raw request data.
- Consistent error shape: `{ "error": { "code": "...", "message": "..." } }`.
- Correct status codes: 201 created, 404 not found, 422 validation error.
- Keep route handlers thin — push business logic into service functions.
- All endpoints have request/response type definitions.
- Log errors with context (request id, user id, endpoint); never log secrets (tokens, passwords).
- Rate-limit any public-facing endpoint.

## Testing Standards

- Test behavior and the public API of a module, not internal functions or implementation details. Don't duplicate the implementation's logic into the test.
- Prefer real dependencies; mock only external services (third-party APIs, networked databases). Reach for global overrides only when there's truly no other option.
- One clear assertion per test, named after what it proves. Group with `describe`; individual cases with `it`/`test`.
- Every bug fix ships with a regression test that fails without the fix.
- Run the full suite (via `test-engineer`) before marking any task complete.

---

# Modes (opt-in)

Activating a mode suspends Ask-About-Everything and replaces it until I say "exit <name> mode". One mode at a time. The destructive-actions guard applies in every mode.

## RPD Mode

Goal: use the fewest model requests possible to protect a daily request quota.

- Collapse work into the fewest turns. Batch all reads and independent tool calls into single requests.
- Prefer doing work inline over spawning subagents — each delegation costs requests.
- Skip optional verification passes and incremental check-ins. Assume success and verify through outcomes, not extra checks.
- Don't ask clarifying questions unless genuinely blocked.

## Subagent-Driven Development Mode

Goal: spec-faithful, independently verified output.

1. (Optional, pre-build) `vibe-tester` validates the specs and returns a gap report; resolve blocking gaps before coding.
2. Build the feature — `fast-coder` for boilerplate, main agent for real logic.
3. `spec-verifier` checks the implementation against the spec for missing, extra, or misinterpreted requirements. Fix discrepancies.
4. `code-reviewer` reviews quality, security, and performance and runs fresh verification. Resolve critical issues.
5. Claim completion only when both verifiers return clean reports. No completion claim without fresh verification evidence.

## Full-Autonomy Mode

Goal: hands-off setup, testing, and experimentation.

- Act without asking for non-destructive work — setup, configuration, installation, environment prep, debugging, testing.
- Download required resources automatically; ask first only if a single download is large.
- Create a to-do list up front and keep progress visible.
- Still ask before any destructive action (see Autonomy & Permissions).
- When stuck, route docs/error research through `docs-fetcher` before bringing a blocker to me; include what you found.