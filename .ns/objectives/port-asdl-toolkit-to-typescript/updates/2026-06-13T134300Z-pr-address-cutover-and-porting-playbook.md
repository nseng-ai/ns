# pr-address cutover recorded in umbrella playbook

## Summary

Promoted the completed `pr-address` TypeScript cutover into the umbrella TypeScript migration Objective.

Changes recorded in the umbrella Objective:

- Migration ledger now marks `pr-address` as the completed first TS-default cutover instead of `Unstarted`.
- Roadmap now marks the `pr-address` cutover/Python-retirement row complete with evidence pointing to the `pr-address-typescript-port` plugin-retirement and Python-deletion update.
- Roadmap now marks the reusable playbook row complete.
- New `porting-playbook.md` captures reusable lessons from the real cutover: inventory-first planning, vertical slices, local-before-shared seams, fake/parity evidence, intentional fallback retirement, explicit distribution decisions, Semantic Updates, and Objective-boundary hygiene.
- Distribution language now records the accepted `pr-address` end state without reviving checkout-free bundling or npm publish as a requirement.

## Objective Impact

The umbrella Objective no longer claims `pr-address` is unstarted. It now treats `pr-address` as the first production TypeScript cutover: the standalone TS CLI is the sole active surface, the Python plugin is retired, `packages/asdl-pr-address` is deleted, rollback is external PyPI `asdl-pr-address==0.1.1`, and the accepted installed model is the run-from-source shim.

This completes the umbrella roadmap row to refine a reusable porting playbook from the first full cutover. The next umbrella planning decision remains selection of the next capability, defaulting to `brmem` unless fresh integration-leverage evidence changes the persisted order.

## Follow-Ups

- Select and plan the next umbrella capability, defaulting to `brmem` unless new evidence changes the order.
- Use `porting-playbook.md` as guidance for future capability subobjectives while keeping capability-specific work in the child Objective and shared provider work in the foundation Objective.
- Continue tracking umbrella-wide transitional compromises in `migration-debt.md`; no `pr-address`-specific debt entry was conclusively burned down by this documentation slice.
