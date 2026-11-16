# Security policy

The current development line is the supported codebase. There is no
published long-term support or backport commitment for older commits.

For a suspected vulnerability, use GitHub's private vulnerability
reporting feature in this repository's Security tab if it is enabled.
If it is unavailable, arrange a private channel with the repository
maintainer before sharing exploit details. Do not place session
cookies, OAuth codes, credentials, personal game records, or unrelated
account data in public issues or pull requests.

Include the affected commit, expected and observed behavior, a minimal
local reproduction, likely impact, and any proposed correction. Test
against a local or isolated environment that you own. The project has
not published a response-time guarantee or bounty program.

Security-sensitive boundaries for contributors:

- Sessions and OAuth transaction state belong to the API. Never put
  session tokens in localStorage or expose them to the web application.
- Authentication, user ownership, CSRF, input/work bounds, and private
  response caching policies must be preserved by new routes.
- Uploaded game logs and learning content are untrusted input. Apply
  validation and computation budgets before replay or rendering.
- Client game history is for private personal review. It is never an
  authoritative result for ratings or competitive play.
- Online competitive gameplay requires server-owned hidden information,
  legal actions, settlement, and duplicate-action protection before launch.

Known limitations and verified repairs are recorded in
[`docs/audit/security-performance-audit.md`](docs/audit/security-performance-audit.md).
