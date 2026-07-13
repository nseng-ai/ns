# Roadmap

## Work

- [ ] Implement the read-only extension-status query and `ns extension list` command across the ns-init capability and host catalog.
  - Evidence: focused operation and command tests show deterministic human and canonical JSON output for empty, npm, local, installed, missing, provisioned, and malformed-config scenarios; schema support is exercised.
  - Policy: keep status computation separate from acquisition and activation writes; listing must never reconcile project state.
- [ ] Reconcile stale acquisition-surface references with the landed nested command contract.
  - Evidence: kernel extension-authoring docs and harness-artifact reconciliation errors no longer mention `ns update --extensions`; focused documentation or string assertions pass where present.
- [ ] Record the completed customer-surface contract and any status-model findings back into the umbrella synthesis evidence.
  - Evidence: this Subobjective's closure names the shipped list semantics and any caveats the release and onboarding Subobjectives must exercise.

## Parked

- [ ] Fleet-wide `ns extension update --all`.
- [ ] User/global extension settings, bare npm-name sugar, and additional remote source kinds.
- [ ] `ns` self-update behavior behind the reserved top-level `ns update` command.
