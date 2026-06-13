# Umbrella porting playbook updated

## Summary

Fed the completed `pr-address` TypeScript migration lessons back into the umbrella TypeScript porting Objective.

The umbrella Objective now:

- Marks `pr-address` as the completed first TS-default cutover in its migration ledger.
- Marks the umbrella `pr-address` cutover/Python-retirement roadmap row complete.
- Adds and links `.asdl/objectives/port-asdl-toolkit-to-typescript/porting-playbook.md` as the reusable playbook for later capability ports.
- Records the accepted end state: standalone TS `pr-address` CLI as the sole active surface, retired Python plugin, deleted `packages/asdl-pr-address`, relocated golden corpus, external PyPI `asdl-pr-address==0.1.1` rollback, and run-from-source shim distribution.

## Objective Impact

This completes the final active roadmap row, "Feed lessons into the umbrella porting playbook." The `pr-address-typescript-port` Objective is ready for closure review if its completion criteria are still satisfied.

No source, test, wrapper, or runtime code changed in this slice; it was Objective documentation and playbook work only.

## Follow-Ups

- Run the `objective-close` workflow for `pr-address-typescript-port` after reviewing completion criteria.
- Select and plan the next umbrella capability, defaulting to `brmem` unless fresh evidence changes the persisted order.
- Keep the optional singular `read-feedback-detail` containment parity hygiene item parked unless a later `pr-address` maintenance slice explicitly takes it up.
