# Repo-specificity audit completed and adopter contract settled

## Summary

Completed the full Flow package audit at
`references/repo-specificity-audit.md` using the agreed external-adopter baseline: ns,
GitHub, and Graphite are package-wide requirements; additional integrations may be
command-scoped when intrinsic and clearly documented. Findings are grouped by semantic
adopter assumption and carry source evidence, a concrete adopter scenario, a disposition
with rationale, and a bounded next action.

The audit records 12 findings. Four implementation clusters need resolution:

- repository identity (`main`/`master` checkpoint protection and the `origin` refresh
  assumption);
- Graphite machine facts (the `squash-stack` dependency on the Slot Command Face and
  submit's parsing of `gt log` / `gt branch info` display output);
- Pi ownership (repo-specific `code-workflows` and `code-gt-restack-resolve` skill policy
  shipped from the Flow package);
- point-default fidelity (the PR-description built-in prompt bypasses normal descriptor /
  catalog default declaration).

Intrinsic adopter requirements were folded into `references/README-draft.md`: the ns
runtime supplies the text-generation service and model refs are selected by the existing
environment variables; `autoslot` and managed-slot cleanup are command-scoped Slots
integration; `land` requires authenticated GitHub squash-merge access; Pi is optional; and
`squash-stack` is now included in the complete command inventory. The README's model and
audit open questions are resolved.

Two concerns are explicitly parked rather than silently expanded: centralized CLI-prose
heuristics remain a compatibility risk with an unknown-failure fallback, and duplicated
first-party point definitions remain descriptor-contract debt. The planned submit-check
marker and recovery point were treated as known roadmap work, not duplicate audit findings.

## Objective Impact

The repo-specificity audit roadmap row is complete. The prior model-seam uncertainty is
resolved: Flow already receives `TextGenerator` through the ns command context, so generic
adoption needs documentation and model selection, not a second Flow-specific model gateway.
The genericization roadmap is now sized into four evidence-backed clusters instead of an
open-ended cleanup row.

The Objective remains open. Submit-check marker/recovery implementation, adopter point
documentation, the four audit-driven resolve clusters, README promotion, and validation
remain outstanding. No implementation code changed in this audit slice.

## Follow-Ups

- Revise the superseded `references/validation-gates-plan.md` before implementing the
  submit-check marker and recovery slices.
- Implement the four resolve clusters without pulling the parked CLI-failure protocol or
  first-party descriptor consolidation into scope.
- Keep the README synchronized as each implementation slice makes the drafted contract
  true, then promote it to `ts/packages/capabilities/flow/README.md`.
