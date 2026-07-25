# Roadmap

## Work

- [~] Settle the cold-audience Clinkr story through the README-driven-development grilling loop. The audience lens and structural progression are settled: document for a cold external TypeScript adopter to improve ns's design; require a `ClinkrApp` whose root is either one standalone `ClinkrCommand` or one `ClinkrGroup`; then show a group with N top-level commands and a root group with one subgroup level. `ClinkrApp` owns execution and executable metadata, and none of these paths should require context ceremony when no context is needed. Preserve the accepted homogeneous tree-context model for now; per-command context is only a possible future enhancement. Continue settling requirements, entrypoint boundaries, and which observable behaviors deserve explicit contract status in `references/README-draft.md`.
- [ ] Audit package exports, implementation, tests, and representative callers against the emerging README. Record material mismatches and accidental-complexity findings in supporting references, each with a proposed disposition rather than silently changing code or contract. The first confirmed mismatch is structural: current code has no `ClinkrApp` or standalone `ClinkrCommand`; it offers only `ClinkrGroup`, `command(...)`, and `defaultCommand(...)`, with execution, version, and runtime metadata attached to the group. Its homogeneous context type and per-run context value are accepted rather than mismatches.
- [ ] Discuss every contract-supporting refactoring proposal and disputed mismatch disposition with the user. Update the README with settled public-interface and observable-behavior decisions; park unrelated redesign with rationale.
- [ ] Reconcile approved implementation and caller mismatches to the settled contract. Keep changes bounded to contract honesty and preserve focused behavior evidence.
- [ ] Verify the reconciled contract against targeted package tests, relevant caller evidence, package/type checks, and appropriate repository validation. Record evidence under the reconciliation or promotion outcome rather than as a standalone validation task.
- [ ] Promote the settled draft to `ts/packages/infra/clinkr/README.md`, replace `references/README-draft.md` with a provenance pointer, and confirm the durable package README remains the sole canonical user contract.
- [ ] Return Clinkr's gate-calibration lessons and concrete process amendments to `foundation-readme-driven-pass`, then close this Subobjective when its mismatches are resolved or explicitly parked.

## Parked

- Unrelated Clinkr redesign or cleanup discovered during the audit; split it into separate tracked work after user discussion.
