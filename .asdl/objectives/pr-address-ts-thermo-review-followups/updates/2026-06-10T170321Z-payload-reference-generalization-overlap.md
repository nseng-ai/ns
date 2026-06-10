# Overlap note: standalone `payload-reference-generalization` objective created

## Summary

A thermo-review of the `stack-artifact-reference-payload-file-options` branch (which added `--payload-file` and `--<key>-reference` inputs to `stack-feedback-plan`, `stack-feedback-diff-current`, and `build-stack-resolve-thread-payloads`) produced a new standalone objective, `payload-reference-generalization`, created deliberately while this record is open. Duplication was accepted up front; the plan is to merge all in-flight lines to master and then reconcile the records.

## Reconciliation points

- **Stack-plan canonical schema.** This record's "Canonical contracts modules" row plans one Zod definition per wire shape, citing "stack-plan via the compositional `stack-feedback-diff-current` pattern". The new branch _added_ a second copy of `stackPlanReferenceShapeSchema` (in `stack-feedback-diff-current.ts` and `stack-resolve-thread-payloads.ts`), and the new objective's PR 2 row resolves that duplication (delete the shallow shape layer or define once). Whoever lands second must rebase onto the other's consolidation rather than re-consolidate.
- **Single operation table vs payload spec.** This record's "Single operation table driving dispatch, schema routing, and help" row and the new objective's parked #5b row (spec-driven option allowlists + `--json-schema` request documents generated from a per-operation payload spec) converge on the same artifact: one source of truth per operation for its inputs. Reconciliation must assign one owner; the likely answer is that the operation table absorbs the payload spec as a field.
- **Unified argv parser.** This record's "Shared operation-support layer and unified argv parser" row deletes `managed-options.ts`; the new branch extended the option allowlists in all three parsers. Mechanical conflict only, but sequence-aware rebasing is needed.
- **File-size pressure.** The new branch grew `stack-feedback.ts` to 934 lines; this record's decomposition row should treat it as next in line after the two 1.3k files.

## Objective Impact

- No roadmap rows change state. An open question pointing at `payload-reference-generalization` was added to `objective.md` so the overlap survives until reconciliation.
