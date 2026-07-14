# Roadmap

## Work

- [x] Implement the read-only extension-status query and `ns extension list` command across the ns-init capability and host catalog.
  - Evidence: fake-driven operation tests, real-adapter integration tests, and host CLI tests cover ordered npm/local/broken rows, all status values and precedence, missing and malformed configuration, help/schema/JSON contracts, conflict detection, and repeated-list byte idempotence. The dedicated inspection gateway has no acquisition, apply, or write operation.
  - Validation: package-focused checks/tests, the TypeScript style guard, the bounded stale-term grep, and `just` pass.
- [x] Reconcile stale acquisition-surface references with the landed nested command contract.
  - Evidence: extension-authoring docs now describe lifecycle reconciliation through `ns init` and nested `ns extension` commands; undeclared-target recovery directs users to `ns extension install <source>`, with a focused assertion. `rg -n 'ns update --extensions' ts/packages` returns no matches.
- [x] Record the completed customer-surface contract and any status-model findings back into the umbrella synthesis evidence.
  - Evidence: the umbrella update `ship-objectives-to-customers/updates/20260714T091638Z-extension-list-contract-synthesized.md` records the complete v1 surface, read-only list semantics, distinct acquisition and artifact states, and the `unavailable` partial-count caveat for release and onboarding checks.

## Parked

- [ ] Fleet-wide `ns extension update --all`.
- [ ] User/global extension settings, bare npm-name sugar, and additional remote source kinds.
- [ ] `ns` self-update behavior behind the reserved top-level `ns update` command.
