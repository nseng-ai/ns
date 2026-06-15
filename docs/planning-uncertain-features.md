# Planning Uncertain Features Catalog

This checked-in catalog tracks planning-workflow features that are useful experiments but may be removed later. Feature edits should be wrapped with grep-friendly markers so they can be excised cleanly.

Marker convention:

```text
PLAN-VERIFICATION-WORKSTREAM:START <feature-slug>
PLAN-VERIFICATION-WORKSTREAM:END <feature-slug>
```

## Features

### `enriched-plan-save-plan-quality`

- Status: existing unsure planning feature.
- Marker evidence: `skills/enriched-plan-save/SKILL.md` wraps the saved-plan quality and cold-read executability/fact-check workflow.
- Why unsure: it adds workflow overhead to saved-plan creation and may be too policy-heavy for a skill prompt if the behavior is better owned by a CLI command or removed.
- Pull-out approach: remove the marked block and then re-check the remaining enriched-plan-save workflow for numbering and stale references to cold-read review/freshness gates.

### `refactor-execution-strategy-guidance`

- Status: current branch experiment.
- Marker evidence: marked additions in `.asdl/prompts/plans-write.md`, `packages/asdl-core/src/asdl_core/prompts/defaults/plans-write.md`, `skills/enriched-plan-save/SKILL.md`, `ts/packages/pi-extensions/src/branch-context/enriched-plan-save.ts`, and associated Python/TypeScript prompt tests.
- Why unsure: it may over-prescribe implementation mechanics in durable plans, may bias agents toward named skills when local judgment is enough, and overlaps with normal implementation-agent responsibility.
- Pull-out approach: remove every block/comment group carrying this slug, then remove or relax any tests whose only purpose is asserting the refactor-execution wording.

## Maintenance commands

```bash
rg -n "PLAN-VERIFICATION-WORKSTREAM:(START|END)" .asdl packages skills ts/packages
rg -n "refactor-execution-strategy-guidance|enriched-plan-save-plan-quality" .asdl packages skills ts/packages
```
