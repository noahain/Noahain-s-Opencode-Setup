> CRITICAL: The built-in explore agent is DISABLED for this project.

> You MUST use @explore-pro for ALL codebase exploration without exception.

> Never invoke the default explore agent. If you are unsure which to call, call @explore-pro.



\## Core Exploration Discipline



1\. \*\*Delegate All Exploration\*\*

&#x20;  Whenever you need to search the codebase — find a function definition, locate all usages, trace imports, discover patterns, grep for a string — always call `@explore-pro`.

&#x20;  Never manually run `grep`, `find`, or read multiple files for exploration purposes from the main context.



2\. \*\*One Query, One Subagent\*\*

&#x20;  Frame your exploration intent as a single clear query, then hand it off.

&#x20;  Example:

&#x20;  - "Find all call sites of `authenticateUser` in `src/`"

&#x20;  - "List every file that imports `deprecatedLogger`"

&#x20;  - "Trace the dependency chain of `PaymentService`"



3\. \*\*Before You Search, Ask This\*\*

&#x20;  “Can this be answered by `@explore-pro`?”

&#x20;  If yes → delegate it. The only valid reason to NOT delegate is: you already have the exact file path and only need to read its content, not search within or across files.



4\. \*\*Keep the Main Context Lean\*\*

&#x20;  Exploration results are often verbose. Offloading them to a subagent prevents context bloat and reduces token cost, keeping you focused on implementation.



5\. \*\*Aggregate, Then Act\*\*

&#x20;  If you need multiple pieces of information, bundle them into a single `@explore-pro` call where possible.

&#x20;  Use the aggregated result to plan your next move — don't pollute context with intermediate search fragments.



6\. \*\*Never “Just Peek” in the Main Agent\*\*

&#x20;  A quick “let me just check if this function is used anywhere” is the easiest way to bloat the context.

&#x20;  Always use `@explore-pro`, even for small lookups.



7\. \*\*Autonomous Investigation\*\*

&#x20;  When debugging or investigating an issue, let `@explore-pro` do the legwork.

&#x20;  You receive a concise report; then you decide the fix.



\## Example Flow



```

User: “Refactor the user session handling — we need to remove the legacy cookie fallback.”



Agent (thinking): \\\*I need to see where the legacy cookie is read or written.\\\*

Agent (action): calls `@explore-pro` with query “find all references to 'legacyCookie' in the codebase”



@explore-pro returns: 3 files, 8 locations.



Agent then plans and implements changes without ever running a manual search in the main context.

```



\## Anti-Patterns to Avoid



\- ❌ “Let me grep for that quickly…”

\- ❌ “I’ll just scan the file tree manually.”

\- ❌ Reading 20 files to “understand the architecture” in the main thread.

\- ✅ “I’ll ask `@explore-pro` to map the authentication flow.”

