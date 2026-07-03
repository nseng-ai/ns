# Hidden exec danger-tier rebaseline

## Summary

Rebaselined the Area (a) danger-tier disposition after confirming that hidden `exec` commands across SDL CLIs are script/skill/agent surfaces rather than human-facing command UX. ADR 0015 #2 already records that hidden `exec` destructive/external writes use required operation arguments as sufficient intent and should not be retrofitted with prompts or `--yes` solely for human Tier 2 symmetry.

Concrete correction: `branch-context exec delete` is no longer an Area (a) `land-now-fix`. It is a hidden agent/script-only `exec` command, and its key/branch operation arguments supply explicit intent. Its remaining branch-context work stays under Area (c) through the generic `branch_context_error` wrapper, not under confirmation gating.

Durable documents updated:

- `docs/adr/0015-cli-surface-conformance-decisions.md` now states the carve-out as hidden `exec` destructive/external writes and names `branch-context exec delete` alongside the `pr-address` thread mutators.
- `docs/retros/cli-surface-conformance-audit.md` reclassifies `branch-context exec delete` Area (a) as conformant under ADR 0015 #2, removes it from the safety-first confirmation remediation list, and keeps human-facing `brmem delete` and `sdl shell install` as Area (a) land-now work.
- This Objective's `objective.md` and `roadmap.md` now distinguish human-facing confirmation remediation from hidden-`exec` no-prompt policy.

## Objective Impact

- The Area (a) roadmap row remains open but is narrower and more accurate: add confirmation only to human-facing destructive/user-environment commands (`brmem delete`, `sdl shell install`, `areg init`, `areg skill apply`, `packagechk claim-pypi`/`claim-npm`, `slot free --all`).
- The prior update `20260626T103959Z-decision-gate-resolved.md` remains immutable historical context, but its follow-up list is superseded for Area (a) where it included `branch-context exec delete` as confirmation work.
- Completion criteria now require hidden `exec` destructive/external writes to be explicitly reclassified or kept conformant under ADR 0015 #2, instead of treating them as human-facing Tier 2 prompt gaps.

## Follow-Ups

- Next Area (a) implementation should start with human-facing confirmation gaps, especially `brmem delete` or `sdl shell install`; do not add `--yes` to `branch-context exec delete` unless a future ADR reverses the hidden-`exec` policy.
- Continue to fix `branch-context` under Area (c) by replacing the generic error-collapse wrapper with modeled snake_case error types and structured recovery data.
