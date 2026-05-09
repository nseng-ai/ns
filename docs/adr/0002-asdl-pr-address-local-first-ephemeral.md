# asdl-pr-address is local-first, ephemeral, and explicit

asdl-pr-address holds three reinforcing behavioral contracts: every **Invocation** is ephemeral (no run id, no history, no replay; nothing persists between Invocations); an Invocation **never pushes** (it produces local commits and GitHub-side state changes — resolves, replies, reactions — but stops at `git push`, leaving the remote git side to the user); and every **Feedback Item** in scope receives an explicit **Classification** (`actionable` or `informational`), so nothing is silently skipped or dropped from `informational_count`.

We chose this stance because the Tool is operating on the user's PR with the user's reviewers watching: surprises here cost trust. Local-only commits give the user a review window before changes hit the remote. Refusing to drop Items keeps reviewers from being ignored. Ephemerality means there is no shared run state to reason about across Invocations or Tool versions. The cost is friction (the user has to push manually; the Skill has to prompt for `cross_cutting`, `complex`, and `informational` decisions; the Tool cannot remember anything about a prior pass), but each piece of friction is buying back a specific category of trust failure.

## Consequences

- The Skill orchestrates a single Invocation per execution; resuming a partial Invocation requires re-running `prepare-run` (which is cheap because it derives everything from GitHub).
- All GitHub mutations during an Invocation flow through `pr-address exec` operations, never raw `gh api`, so the Tool keeps its mutation surface auditable.
- Feature requests that imply persistent per-Invocation state (replay an Invocation, attach an Invocation to a brmem entry, "skip this Item silently") should reopen this ADR rather than be added as flags.
- The Tool intentionally cannot recover from "the user lost their local commits" — local commits are the single point of truth for in-flight work and the user is expected to review them before pushing.
