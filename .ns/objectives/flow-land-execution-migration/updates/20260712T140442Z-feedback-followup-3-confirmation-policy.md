# Feedback follow-up 3: rehome upfront confirmation approval policy

## Summary

Third follow-up PR for the July 12, 2026 landing-execution feedback snapshot, addressing #3452 thread `PRRT_kwDOR4YhMs6QM-Y_`: general approval-kind policy no longer lives in the post-landing cleanup module.

`approvedLandConfirmationKinds()` moved unchanged from `post-landing-slot-cleanup.ts` into a dedicated Flow-side module, `src/land/landing-confirmation-policy.ts`. The policy stays in the Flow adapter layer because it maps `ParsedArgs`, observed upfront prompt approval, and an optional cleanup preview into gateway-approved request kinds; ParsedArgs and prompt provenance stay out of the land execution core. The cleanup module now owns only cleanup request/policy mapping, preview planning, isolated cleanup glue, and cleanup progress adaptation.

The complete approval matrix is preserved exactly: dry run approves nothing; no approval without `--yes` or observed upfront prompt approval; `main-landing` once policy allows upfront approval; `free-managed-slots` and `submit-required-updates` only on interactive upfront prompt approval; `post-landing-cleanup` only with a cleanup preview; `--force` remains cleanup policy, and `--yes` keeps the Slice 10 behavior.

`landing-dispatch.ts`, `land-stack.ts`, and tests import from the new module. The general approval-matrix tests moved to `test/unit/landing-confirmation-policy.test.ts`; cleanup-focused coverage (including the Flow-shaped decorator resolution path) stays in `post-landing-slot-cleanup.test.ts`. A new import-direction test forbids `execution/` core modules from importing the Flow-side confirmation policy. No new `land/api` export was introduced.

## Objective Impact

No roadmap slice changes; post-completion review remediation. The Objective remains open.

## Tests and invariants

- Approval matrix tests relocated verbatim to the confirmation-policy-focused test file.
- New import-direction guard: no `execution/` module references `landing-confirmation-policy`.
- All six permanent invariant files byte-for-byte unchanged; no confirmation text, prompt count, or gateway provenance behavior changed.
- Stale-import sweep: no remaining imports of `approvedLandConfirmationKinds` from `post-landing-slot-cleanup`.

## Validation

- `just ts-check`: passed.
- Full `@nseng-ai/flow` package: 81 files, 740 tests passed.
- `just ts-format-check`, `just ts-lint`: passed.
- `ns objective check flow-land-execution-migration`: passed.
- `git diff --check`: passed; permanent invariant diff empty.

No push, submit, or Branch Memory mutation was performed.

## Follow-Ups

- Reply to and resolve thread `PRRT_kwDOR4YhMs6QM-Y_` and the remaining snapshot threads after stack submission is authorized.
