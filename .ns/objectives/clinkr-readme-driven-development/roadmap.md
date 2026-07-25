# Roadmap

## Work

- [ ] Settle the cold-audience Clinkr story through the README-driven-development grilling loop. Resolve audience, requirements, the minimum primary path, entrypoint boundaries, and which observable behaviors deserve explicit contract status in `references/README-draft.md`.
- [ ] Audit package exports, implementation, tests, and representative callers against the emerging README. Record material mismatches and accidental-complexity findings in supporting references, each with a proposed disposition rather than silently changing code or contract.
- [ ] Discuss every contract-supporting refactoring proposal and disputed mismatch disposition with the user. Update the README with settled public-interface and observable-behavior decisions; park unrelated redesign with rationale.
- [ ] Reconcile approved implementation and caller mismatches to the settled contract. Keep changes bounded to contract honesty and preserve focused behavior evidence.
- [ ] Verify the reconciled contract against targeted package tests, relevant caller evidence, package/type checks, and appropriate repository validation. Record evidence under the reconciliation or promotion outcome rather than as a standalone validation task.
- [ ] Promote the settled draft to `ts/packages/infra/clinkr/README.md`, replace `references/README-draft.md` with a provenance pointer, and confirm the durable package README remains the sole canonical user contract.
- [ ] Return Clinkr's gate-calibration lessons and concrete process amendments to `foundation-readme-driven-pass`, then close this Subobjective when its mismatches are resolved or explicitly parked.

## Parked

- Unrelated Clinkr redesign or cleanup discovered during the audit; split it into separate tracked work after user discussion.
