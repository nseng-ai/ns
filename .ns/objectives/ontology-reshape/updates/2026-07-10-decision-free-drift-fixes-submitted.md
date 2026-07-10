# Decision-free drift fixes batch-submitted as PR #3332

## Summary

The accumulated decision-free, source-backed drift fixes are batch-landed on
branch `land-decision-free-ontology-drift-fixes` (based on `master`, independent
of this record's branch) as PR #3332, clearing the standing follow-up from the
last two updates before the grilling phase. Full validation passed (`just`:
tsgo, 4,906 Vitest tests, objective edge sweep).

Fixed (all cited in `drift-audit.md` or a sweep asset):

- Retired `@ns/` scope throughout `kernel/CONTEXT.md` and
  `capability-kit/src/graphite/CONTEXT.md`.
- `CONTEXT-MAP.md` inventory: 26 → 29 packages with the corrected two-level
  glob, "Thirteen" → "Twelve" package contexts, `@internal/ns-dev` added to the
  internal-space exceptions, phantom `@nseng-ai/flow-pi` removed (Flow Pi
  presentation is `@nseng-ai/flow/pi`, loaded directly by `.pi/extensions/*` —
  verified before rewriting).
- `objectives/CONTEXT.md`: nonexistent `./command-face` export claim replaced
  with `./ns-extension` + `./ns/commands/*`; hidden `exec` roster 3 → 7; EDGES
  column right of BRANCHES.
- `branch-context/CONTEXT.md` and its map entry: Presentation Boundary
  ownership corrected — the capability's own `pi` subpackage owns command names
  and registration; the core-must-not-import-Pi rule kept.
- `hosts/pi/CONTEXT.md`: export-family enumeration now includes `skills/*`,
  `worktree-status`, and the `worktree-status/extension` project-local
  entrypoint carve-out.
- `ts/AGENTS.md` "ji's" residue and kernel manifest SDL description.
- Dead `@nseng-ai/pi-command-surfaces` dependency removed from `hosts/pi`
  (zero imports; lockfile updated). The package's retirement remains a
  grilling-row decision.

Deliberately deferred to grilling rows: the entire ccc CONTEXT.md drift
cluster (subpackage list, retired stack-impl term, worktree-status ownership),
reviews "Capability"-vs-tier wording, and the pr-feedback README retired-engine
trim (editorial; user excluded).

## Objective Impact

- The documentation baseline the grilling rows argue against is now clean of
  known decision-free drift; remaining known drift is exactly the
  decision-bearing set the grilling rows own.
- Note for future sessions: this record's branch is not the fix branch. The
  fixes could not carry their tracking update in the same PR because
  `ontology-reshape` does not exist on `master`; tracking lives here instead.

## Follow-Ups

- Land PR #3332 (draft, submitted via Graphite).
- Schedule the first grilling session (CCC/orchestration, layering, lifecycle
  spread, or review/feedback residue — unordered).
