# Planning Uncertain Features Catalog

This checked-in catalog tracks planning-workflow features that are useful experiments but may be removed later. Feature edits should be wrapped with grep-friendly markers so they can be excised cleanly.

Marker convention:

```text
PLAN-VERIFICATION-WORKSTREAM:START <feature-slug>
PLAN-VERIFICATION-WORKSTREAM:END <feature-slug>
```

## Features

### `refactor-execution-strategy-guidance`

- Status: current branch experiment.
- Marker evidence: marked additions in `.ns/prompts/branch-context.plans-write.md`, `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts`, and associated TypeScript prompt tests.
- Why unsure: it may over-prescribe implementation mechanics in durable plans, may bias agents toward named skills when local judgment is enough, and overlaps with normal implementation-agent responsibility.
- Pull-out approach: remove every block/comment group carrying this slug, then remove or relax any tests whose only purpose is asserting the refactor-execution wording.

## Maintenance commands

```bash
rg -n "PLAN-VERIFICATION-WORKSTREAM:(START|END)" .ns skills ts/packages
rg -n "refactor-execution-strategy-guidance" .ns ts/packages
```
