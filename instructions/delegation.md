---
description: Main agent delegation rules — always delegate exploration, git, docs, testing, spec validation, and simple coding to subagents. Main agent is for orchestration and decision-making only.
---

> CRITICAL: The main agent MUST delegate ALL codebase exploration, git operations, documentation lookups, build/test runs, spec validation, and simple coding tasks to the designated subagents.
> Do NOT attempt to perform these tasks in the main context. When in doubt, delegate.

## Core Delegation Discipline

1. **Delegate First, Never Self-Service**  
   Whenever you need to search code, stage a commit, fetch docs, run tests, validate specs, or generate boilerplate — immediately call the appropriate subagent.  
   The main agent is for orchestration and decision-making only.

2. **One Clear Query per Subagent Call**  
   Frame your intent as a single, precise task, then hand it off.  
   Example:  
   - `@explore` "Find all call sites of `authenticateUser` in `src/`"  
   - `@git-agent` "Stage all changes and create a commit with message `feat: add session renewal`"  
   - `@vibe-tester` "Run VT-1 against auth-spec.md, orders-spec.md, payments-spec.md"  
   - `@fast-coder` "Create src/routes/health.ts with a simple health check endpoint"

3. **Keep the Main Context Lean**  
   Subagent results are often verbose. Offloading them prevents context bloat, reduces token cost, and keeps you focused on the next logical step.

4. **Bundle When Possible**  
   If you need multiple pieces of information from the same domain (e.g., two separate searches), combine them into a single subagent call where the agent can handle them efficiently.

5. **Never "Just Quickly" Do It Yourself**  
   A quick `grep`, a direct `git add`, a `curl` to docs, a manual `npm test`, tracing a spec scenario, or writing a boilerplate file in the main context is the fastest way to bloat the context and break delegation discipline.  
   Always use the subagent, even for small lookups.

6. **Autonomous Investigation**  
   When debugging, let `@explore` map the code, `@docs-fetcher` check for known issues, and `@test-engineer` run the relevant suite — then act on the consolidated reports.

---

## @explore (codebase search / file discovery)

**Scope:** Any codebase exploration — find a function, locate usages, trace imports, discover patterns, grep for a string.  
**Never** do this manually in the main agent.

### Delegation Rules

1. Every search, grep, or file‑discovery request must go to `@explore`.  
2. Use the exact same discipline as the former `@explore-pro` (see original exploring.md).  
3. Frame the query as a single clear sentence.  
4. If you already know the exact file path and only need to *read* its content (not search within or across files), you may read it directly — but if you're looking for *where* something is, delegate.

### Example Flow

```
User: "Refactor user session handling — remove legacy cookie fallback."

Main agent: needs to locate all references to `legacyCookie`.
Action: calls @explore with "find all references to 'legacyCookie' in the codebase"

@explore returns: 3 files, 8 locations.
Main agent now plans and implements changes without ever running a manual search.
```

### Anti‑Patterns (Exploration)

- ❌ "Let me grep for that quickly…"
- ❌ "I'll just scan the file tree manually."
- ❌ Reading 20 files to "understand the architecture" in the main thread.
- ✅ "I'll ask `@explore` to map the authentication flow."

---

## @git-agent (all git operations)

**Scope:** Any git operation — stage, commit, branch, push, pull, generate PR description.  
**Exception:** None. Even commits pre‑approved in `autonomy.md` must go through `@git-agent`.

### Delegation Rules

1. Every `git` command (including `status`, `log`, `diff`) must be executed via `@git-agent`.  
2. Commit messages must follow conventional commit format; `@git-agent` will ensure that.  
3. Do not manually compose a PR description — delegate `@git-agent` to generate one from the diff.  
4. If you need to know the repository state, ask `@git-agent` — do not run `git status` yourself.

### Example Flow

```
User: "Commit the changes with a good message."

Main agent:  
Action: calls @git-agent with "Stage all changes and create a commit with a conventional commit message describing the diff."

@git-agent replies: ✅ Created commit `feat: add session renewal endpoint`. No warnings.
```

### Anti‑Patterns (Git)

- ❌ "I'll just `git add -A && git commit -m 'fix stuff'`"
- ❌ Running `git log` directly to see recent commits.
- ❌ Manually writing a PR description body.
- ✅ Delegate every git operation, without exception.

---

## @docs-fetcher (documentation & error research)

**Scope:** Any documentation lookup, error message research, or library API question.  
**Trigger:** Before you ask the user or guess, always delegate to `@docs-fetcher` first.

### Delegation Rules

1. Whenever you encounter an unknown API, a cryptic error, or a configuration question, call `@docs-fetcher` immediately.  
2. Provide the exact question and the library/tool name.  
3. Wait for the concise answer (≤200 tokens) and the source URL; never fetch raw pages yourself.  
4. If `@docs-fetcher` reports "not found", then you may tell the user that official docs are silent — do not invent an answer.

### Example Flow

```
Error: "TypeError: next.config.mjs: Invalid export field"

Main agent:  
Action: calls @docs-fetcher with "What causes 'Invalid export field' in Next.js config?" for library "Next.js".

@docs-fetcher returns: Config must use `export default` not named exports. (source: https://nextjs.org/docs/...)
Main agent proposes the fix based on the fetched information.
```

### Anti‑Patterns (Docs)

- ❌ "I'll just quickly Google this error…"  
- ❌ Guessing a method signature because "it's probably similar to…"  
- ❌ Asking the user "how do I configure this?" without first checking the docs.  
- ✅ Delegate `@docs-fetcher` for every documentation gap.

---

## @test-engineer (build, compile, lint, test)

**Scope:** Any build, compile, lint, or test run — including unit tests, integration tests, and type checking.  
**Never** run these directly in the main agent's shell.

### Delegation Rules

1. All `npm test`, `npm run build`, `cargo build`, `pytest`, `eslint`, etc., must be executed by `@test-engineer`.  
2. When you modify code, immediately ask `@test-engineer` to run the related tests.  
3. If a test fails, `@test-engineer` will report the failure details; the main agent then decides the fix.  
4. Do not interpret build output yourself — let `@test-engineer` filter and present the relevant diagnostics.

### Example Flow

```
Main agent: finishes a refactor and wants to verify no regressions.
Action: calls @test-engineer with "Run the full test suite for the auth module."

@test-engineer returns: 14/14 passing, 0 failures. Lint clean.
Main agent can now mark the task complete with confidence.
```

### Anti‑Patterns (Test/Build)

- ❌ "I'll just run `npm test` quickly to see if it passes."  
- ❌ Manually running `cargo check` and scanning the output.  
- ❌ Keeping a terminal open to watch for build errors.  
- ✅ Delegate all build/test/lint operations to `@test-engineer`.

---

## @vibe-tester (spec validation and gap analysis)

**Scope:** Validate specification documents by running vibe test cases against them. Detect gaps, conflicts, and ambiguities before implementation begins.

### Delegation Rules

1. Whenever you need to "vibe test" a set of specs, run a spec validation, or check design docs for completeness, call `@vibe-tester`.
2. Provide the vibe tester with the spec documents (paths) and the test case(s) to run.
3. `@vibe-tester` returns a structured gap report (blocking/degraded/cosmetic). Do not manually attempt to trace scenarios against specs — it is a specialized reasoning task that belongs in a dedicated subagent.
4. Use the gap report to decide whether specs are ready for implementation. Do not act on gaps in the main agent; instead, present the report to the user.

### Example Flow

```
User: "I've written the checkout specs. Test them for gaps."

Main agent:
Action: calls @vibe-tester with "Run VT-1: First-Time Buyer With Payment Failure against auth-spec.md, cart-spec.md, inventory-spec.md, orders-spec.md, payments-spec.md, shipping-spec.md"

@vibe-tester returns: gap report with 3 BLOCKING and 4 DEGRADED.
Main agent presents the report and recommends fixes before coding.
```

### Anti-Patterns (Vibe Testing)

- ❌ "Let me quickly trace this scenario manually to see if it works."
- ❌ Assuming the spec is complete without evidence.
- ❌ Trying to run vibe tests in the main agent's context.
- ✅ Delegate all spec validation to `@vibe-tester`.

---

## @fast-coder (simple, repetitive, boilerplate code tasks)

**Scope:** Handle low-complexity, repetitive coding tasks that do not require deep architectural reasoning — boilerplate generation, config changes, simple bug fixes, repeated patterns, file scaffolding.

### Delegation Rules

1. When a task is straightforward and does not need a strong model's reasoning, delegate it to `@fast-coder`.
2. Describe the exact change required (file, insertion point, desired output). `@fast-coder` will produce minimal output — just the code change and a one-line summary.
3. Do not use `@fast-coder` for tasks involving complex logic, security-sensitive code, or design decisions — those stay in the main agent or go to a specialized agent like `@explore`.
4. `@fast-coder` is optimized for speed and low token usage. Use it to keep the main context lean.

### Example Flow

```
Main agent: needs to add a new route file following the existing pattern.

Action: calls @fast-coder with "Create src/routes/health.ts with a simple health check endpoint following the pattern in src/routes/status.ts. Return 200 OK and uptime."

@fast-coder replies: created file, summary: "Added health check route."
Main agent proceeds without consuming tokens on boilerplate.
```

### Anti-Patterns (Fast Coder)

- ❌ Generating boilerplate code directly in the main agent.
- ❌ Using `@fast-coder` for security-critical logic or complex state machines.
- ✅ Delegate all simple, pattern-based coding to `@fast-coder`.
