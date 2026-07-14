# Fold the context-economy convention under this Objective

## Summary

Decision: `subagent-delegation-policy` is the canonical Objective for the context-economy
policy in addition to subagent delegation doctrine. The repository-level context-economy
convention introduced by branch `evidence-inheritance-context-economy-policy` —
`docs/conventions/agent-context-economy.md`, wired into `AGENTS.md` and the branch-context
prompts/skills — is the single home for evidence-inheritance, revalidation, named-trigger
expansion, and "do not repeat the child's scan in the parent" rules. The injected
delegation doctrine will reference that convention rather than restating it.

This was an ownership assignment, not a two-record merge: no separate context-economy
Objective record ever existed (the work lived only as branch changes to a convention doc),
so nothing was closed. The convention doc and this Objective describe the same initiative —
both trace to the same measured delegation-first parent-orchestration evidence (the
~209k-token parent-exploration episode; see
`docs/follow-ups/delegation-first-parent-orchestration.md`, referenced by the convention).

## Objective Impact

- `objective.md`: added a **Context-economy convention** Scope bullet naming
  `docs/conventions/agent-context-economy.md` as canonical and this Objective as owner of
  keeping the doctrine aligned by reference; added a Completion Criterion that the
  doctrine's context-economy rules reference the convention and do not drift; added an
  assumption (convention doc is the canonical home) and a risk (cross-branch dependency on
  the `evidence-inheritance-context-economy-policy` branch landing); narrowed the
  canonical-home Open Question so it now covers only the delegation-specific preamble.
- `roadmap.md`: added a `## Work` row to point the doctrine's context-economy rules at the
  convention by reference, flagged as carrying a cross-branch dependency.
- No Objective was closed; no Objective Edge was added (the counterpart is a convention
  doc, not an Objective record).

## Follow-Ups

- When the canonical-policy-content slice lands, ensure the doctrine links
  `docs/conventions/agent-context-economy.md` instead of duplicating its rules.
- If the `evidence-inheritance-context-economy-policy` branch renames or relocates the
  convention doc before landing, update the references in this Objective and the doctrine
  in step.
