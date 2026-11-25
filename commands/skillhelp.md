---
name: skillhelp
description: Recommend which skills the current task would benefit from, then offer to invoke them
---

Your task is to look at what the user is currently trying to do and recommend which available skills would materially improve the outcome.

**Step 1 — Read the task**
- What is the user actually trying to accomplish right now?
- What's the artifact (code, doc, config, review, analysis)?
- What's likely to go wrong or be low-quality if done naively?

**Step 2 — Match against available skills**
Review every skill available to you (name + description). For each candidate, judge whether it genuinely applies. Skip stretches — a short accurate list beats a long noisy one.

**Step 3 — Report**
For each recommended skill, output:

- **`/skill-name`** — one-line summary of what it does
  - *Why it applies here:* concrete tie to this task (name files, the specific sub-problem, the risk it covers)
  - *What changes:* the concrete difference in output vs. not using it
  - *Confidence:* high / medium — and what would raise it

If no skills apply, say so plainly and explain what you'd do instead. Do not manufacture relevance.

Order by impact on the current task. Cap the list at ~5.

At the very end of your response, ask the user:

"Want me to invoke these now? Reply with:
- **all** — trigger every skill above
- **1,3** — trigger specific ones by number
- **none** — proceed without them"

If the user selects any, invoke those skills immediately, in the order listed, before continuing with the underlying task.