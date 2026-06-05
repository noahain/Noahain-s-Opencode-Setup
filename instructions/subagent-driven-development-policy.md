## Subagent-Driven Development (Skill)

When the `subagent-driven-development` skill is active, orchestrate three subagents in sequence:

1. **`implementer`** – default general subagent that builds the feature per spec.
2. **`spec-verifier`** – read-only; checks implementation against spec for missing/extra/misinterpreted requirements.
3. **`code-reviewer`** – read-only; reviews quality, security, performance; independently runs tests/lint.

**Workflow**  
- After `implementer` finishes, run `spec-verifier`. Fix discrepancies.  
- Then run `code-reviewer`. Resolve critical issues.  
- Claim completion only when both verifiers return a clean report.

*No completion claim without fresh verification evidence.*