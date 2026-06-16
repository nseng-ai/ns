# areg cutover lessons fed into umbrella playbook

## Summary

`areg` is now TypeScript-default for repo-local use after its out-of-sequence `areg-typescript-port` slice completed caller cutover and Python package removal.

Umbrella updates made in this slice:

- `objective.md` migration ledger now marks `areg` as a completed TS-default cutover rather than an active out-of-sequence subobjective.
- Planned capability order now treats the `areg` exception as resolved and resumes the default sequence with Objectives / `objective` unless new evidence changes the order.
- `roadmap.md` records `areg` completion evidence under the repeated capability-subobjective row.
- `porting-playbook.md` now includes reusable `areg` lessons for skill-management contract inventory, hidden `exec skillx` Clinkr envelope handling, package-local skill/project mutation seams, fake-driven filesystem and external-tool gateways, repo-local TypeScript source/shim cutover, and same-window Python package deletion.

No new end-of-migration debt entry was added: the accepted `areg` divergences either fit existing Clinkr migration debt categories or are durable, documented capability decisions rather than transitional compromises.

## Objective Impact

The umbrella Objective no longer risks ledger drift from the completed out-of-sequence `areg` migration. `areg` now sits alongside `pr-address`, `brmem`, and `handoff` as completed production TypeScript cutover evidence.

The next default capability remains Objectives / `objective`, while external installed `areg` distribution stays a parked follow-up owned by a future consumer-backed decision rather than a blocker to the completed repo-local cutover.

## Follow-Ups

- Use the updated playbook when planning the future `objective` TypeScript port.
- Keep external installed `areg` distribution parked unless a later consumer requires npm-style package execution, generated shims, or another checkout-free model.
- Continue adding only true transitional migration compromises to `migration-debt.md`; do not turn durable capability-specific decisions into debt entries.
