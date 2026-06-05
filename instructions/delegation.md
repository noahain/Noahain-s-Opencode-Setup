> CRITICAL: The main agent MUST delegate ALL codebase exploration, git operations, documentation lookups, and build/test runs to the designated subagents.
> Do NOT attempt to perform these tasks in the main context. When in doubt, delegate.

## Core Delegation Discipline

1. **Delegate First, Never Self-Service**  
   Whenever you need to search code, stage a commit, fetch docs, or run tests — immediately call the appropriate subagent.  
   The main agent is for orchestration and decision-making only.

2. **One Clear Query per Subagent Call**  
   Frame your intent as a single, precise task, then hand it off.  
   Example:  
   - `@explore` “Find all call sites of `authenticateUser` in `src/`”  
   - `@git-agent` “Stage all changes and create a commit with message `feat: add session renewal`”

3. **Keep the Main Context Lean**  
   Subagent results are often verbose. Offloading them prevents context bloat, reduces token cost, and keeps you focused on the next logical step.

4. **Bundle When Possible**  
   If you need multiple pieces of information from the same domain (e.g., two separate searches), combine them into a single subagent call where the agent can handle them efficiently.

5. **Never “Just Quickly” Do It Yourself**  
   A quick `grep`, a direct `git add`, a `curl` to docs, or a manual `npm test` in the main context is the fastest way to bloat the context and break delegation discipline.  
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
4. If you already know the exact file path and only need to *read* its content (not search within or across files), you may read it directly — but if you’re looking for *where* something is, delegate.

### Example Flow

```
User: “Refactor user session handling — remove legacy cookie fallback.”

Main agent: needs to locate all references to `legacyCookie`.
Action: calls @explore with “find all references to 'legacyCookie' in the codebase”

@explore returns: 3 files, 8 locations.
Main agent now plans and implements changes without ever running a manual search.
```

### Anti‑Patterns (Exploration)

- ❌ “Let me grep for that quickly…”
- ❌ “I’ll just scan the file tree manually.”
- ❌ Reading 20 files to “understand the architecture” in the main thread.
- ✅ “I’ll ask `@explore` to map the authentication flow.”

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
User: “Commit the changes with a good message.”

Main agent:  
Action: calls @git-agent with “Stage all changes and create a commit with a conventional commit message describing the diff.”

@git-agent replies: ✅ Created commit `feat: add session renewal endpoint`. No warnings.
```

### Anti‑Patterns (Git)

- ❌ “I’ll just `git add -A && git commit -m ‘fix stuff’`”
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
4. If `@docs-fetcher` reports “not found”, then you may tell the user that official docs are silent — do not invent an answer.

### Example Flow

```
Error: “TypeError: next.config.mjs: Invalid export field”

Main agent:  
Action: calls @docs-fetcher with “What causes ‘Invalid export field’ in Next.js config?” for library “Next.js”.

@docs-fetcher returns: Config must use `export default` not named exports. (source: https://nextjs.org/docs/...)
Main agent proposes the fix based on the fetched information.
```

### Anti‑Patterns (Docs)

- ❌ “I’ll just quickly Google this error…”  
- ❌ Guessing a method signature because “it’s probably similar to…”  
- ❌ Asking the user “how do I configure this?” without first checking the docs.  
- ✅ Delegate `@docs-fetcher` for every documentation gap.

---

## @test-engineer (build, compile, lint, test)

**Scope:** Any build, compile, lint, or test run — including unit tests, integration tests, and type checking.  
**Never** run these directly in the main agent’s shell.

### Delegation Rules

1. All `npm test`, `npm run build`, `cargo build`, `pytest`, `eslint`, etc., must be executed by `@test-engineer`.  
2. When you modify code, immediately ask `@test-engineer` to run the related tests.  
3. If a test fails, `@test-engineer` will report the failure details; the main agent then decides the fix.  
4. Do not interpret build output yourself — let `@test-engineer` filter and present the relevant diagnostics.

### Example Flow

```
Main agent: finishes a refactor and wants to verify no regressions.
Action: calls @test-engineer with “Run the full test suite for the auth module.”

@test-engineer returns: 14/14 passing, 0 failures. Lint clean.
Main agent can now mark the task complete with confidence.
```

### Anti‑Patterns (Test/Build)

- ❌ “I’ll just run `npm test` quickly to see if it passes.”  
- ❌ Manually running `cargo check` and scanning the output.  
- ❌ Keeping a terminal open to watch for build errors.  
- ✅ Delegate all build/test/lint operations to `@test-engineer`.
