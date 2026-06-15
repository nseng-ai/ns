# Remaining compatibility surface inventoried

## Summary

After the compact-output and mutation-boundary updates, the remaining composed/pipeline-produced input compatibility surface is concentrated in planning and read helpers rather than lifecycle or mutation helpers.

Current remaining compatibility surfaces:

- `classification-template` still accepts explicit manifest input through stdin, `--manifest-json`, or `--manifest-file`.
- `plan-feedback` still accepts wrapper input through stdin, `--payload-json`, or `--payload-file`.
- `stack-feedback-plan` still accepts explicit payload input and `--prep-reference` in addition to empty-stdin session resolution.
- `stack-feedback-diff-current` still accepts explicit payload/reference input in addition to empty-stdin session resolution.
- `skills/pr-address/SKILL.md` still teaches stale validation, mutation, checkpoint, and finalization flows, including removed or compatibility-only wrapper/file paths.

Evidence considered: `rg` over `ts/packages/pr-address/src` and `skills/pr-address/`, plus source inspection of `classification-operations.ts`, `stack-feedback-plan.ts`, and `stack-feedback-diff-current.ts`.

## Objective Impact

The Objective's next implementation slice should be the input-style removal row, not stack mutation parity or compact-output validation. Removing the remaining planning/read compatibility surfaces is the last code-contract cleanup before the final skill rewrite can be made authoritative.

The roadmap now names the remaining helper surfaces explicitly so the next branch can be scoped as one coherent compatibility-removal PR rather than rediscovering the stale input modes.

## Follow-Ups

- Remove those remaining compatibility inputs from the CLI parse schemas, operation schemas, scenario tests, generated JSON schema fixtures, and CLI reference docs.
- Preserve agent-authored file inputs: classification answers, decisions files, and checkpoint evidence remain valid.
- After compatibility removal, rewrite `skills/pr-address/SKILL.md` and the reference docs around the session-store flow and then capture real single-PR plus stack run evidence.
