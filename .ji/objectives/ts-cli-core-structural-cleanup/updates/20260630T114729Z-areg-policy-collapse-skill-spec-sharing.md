# Semantic Update: `@sdl/areg` Policy Collapse and Skill-Spec Classification Sharing

## Summary

Completed the remaining focused `@sdl/areg` real/fake gateway cleanup slice from the god-file row:

- Collapsed init-vs-skill-kind project write target policy into private descriptor data in `ts/packages/tools/areg/src/gateways/mutation-policy.ts`.
- Reworked `project-fs.ts` to use one write-target resolver and one write-target validator parameterized by the policy descriptor while preserving policy-specific refusal ordering, error codes, and message text.
- Reworked `RealAregProjectGateway` write/create-parent/revalidation paths to use descriptor data instead of repeated `request.policy === "init"` branches.
- Extracted post-resolution skill-kind inspection classification into `ts/packages/tools/areg/src/gateways/skill-kind-classification.ts` and reused it from both the real and fake project gateways.
- Added focused tests for mutation-policy refusal precedence/message preservation and fake skill-kind inspection error classification.

## Scope Notes

This was a structural refactor only. Observable `areg` gateway behavior was preserved, including init's unsupported-before-unsafe refusal precedence and skill-kind's unsafe-before-unsupported precedence.

Canonical path classification remains real-gateway-owned in this slice. The fake still uses its lightweight `fakeResolveSkillName` heuristic because sharing realpath/canonical path semantics would require the fake to model filesystem state it does not honestly represent.

## Objective Impact

The two live follow-ups from the `@sdl/areg` project-gateway decomposition row are now addressed for the compatibility-focused scope:

- mutation-policy fork collapsed to data;
- duplicated real/fake post-resolution skill-spec inspection classification removed.

Remaining possible follow-up is only the explicitly deferred canonical path classifier sharing, if a later slice introduces an honest pure boundary without fake filesystem over-modeling.

## Validation

- `pnpm --dir ts --filter @sdl/areg test` — passed (20 files, 157 tests) before formatting.
- `just ts-format-check` — initially failed on the new `mutation-policy.ts`; fixed with `just ts-format-fix`.
- `just ts-format-check` — passed after autofix.
- `just ts-lint` — passed.
- `just ts-check` — passed.
