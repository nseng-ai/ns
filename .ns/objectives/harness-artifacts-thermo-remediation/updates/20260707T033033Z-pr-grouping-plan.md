# PR Grouping Plan

## Summary

The remediation stack should target about five local Graphite PRs rather than one PR per roadmap row. The grouping is by subsystem and review risk:

1. Home/path safety foundation: H1 kernel `NsExtensionApi.homeDir`, `.git` marker projectRoot fallback deletion, and first-party root sentinel derivation.
2. Provisioning apply/reconcile semantics: H2 conflict-as-outcome plus reconcile collision skip/report/nonzero behavior.
3. Provisioning I/O and fs plumbing: binary-safe artifact I/O plus shared fs error helpers/adapter/test fake and removal of the apply-layer dependency on discovery's `OptionalTextFileState`.
4. First-party skills/catalog consolidation: deep `provisionFirstPartySkill()`, thin `skills-install.ts`/`RealSkillMaterializer` adapters, plain preinstalled catalog entries replacing `repo-local-ns-extension.ts`, and ns-init dead surface when naturally touched.
5. AREG and tail cleanup: H3/H4/H5 dead-seam sweep, AREG layering/code alignment, dead planner branches, and remaining local LOW sweep items.

## Objective Impact

`objective.md` now defines keepable progress around coherent remediation PR groups instead of single roadmap rows, while preserving the existing no-out-of-scope-behavior and validation boundaries. `roadmap.md` now records the target PR grouping, with guidance to split only when a group crosses review boundaries or validation evidence becomes hard to interpret.

## Follow-Ups

- Runner checkpoints should name the PR group they are advancing.
- LOW cleanup should be folded into the adjacent group that already touches the same files, not spun into a standalone PR unless it becomes independently reviewable.
- If the AREG/tail cleanup group grows too large, split it into dead-seam deletion first and layering/LOW cleanup second.
