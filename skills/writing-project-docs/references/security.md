# SECURITY.md

The reader is a security researcher deciding where to send a vulnerability report. Honesty beats polish: never promise a channel, key, or timeline the maintainers did not set.

## Typical sections

- Supported versions - which releases get fixes. If the repo does not state a policy, keep it simple and true (for example: the latest release), and flag the assumption in your report.
- Reporting a vulnerability - the channel. GitHub's private vulnerability reporting (the repo's Security tab) is the safe default when the repo lives on GitHub; use an email or form only if the repository itself states one. Never invent an address or key.
- What to include - description, reproduction, impact, affected version/commit.
- What to expect - keep to generic, honest wording (acknowledgment, coordinated disclosure) unless the maintainers set specifics.
- Scope - in-scope components and out-of-scope items if the repo distinguishes them.

## Refresh specifics

- Verify every contact and URL: addresses must appear somewhere in the repo, URLs must resolve.
- If the policy references versions or supported branches, re-check against the actual release practice.

## Pitfalls

- Invented emails, GPG keys, or bug bounty programs (the worst possible failure - researchers trust these).
- SLA-style promises ("we respond within 24 hours") the maintainers never made.
- Claiming support for versions that are no longer maintained.
