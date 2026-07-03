# Slot Cutover and Playbook Lessons

## Summary

Recorded `slot` as TypeScript-default in the umbrella migration ledger after the child `slot-typescript-port` Objective completed the full cutover: the standalone TypeScript `@asdl/slot` CLI is the sole active surface, `just install-slot` / `install-tools` provide the accepted source-shim distribution, `packages/asdl-slots` is deleted, and rollback/reference evidence is commit `9164ef9ea562`.

The umbrella playbook now captures the first OS/worktree/shell-coupled port lessons: inventory host filesystem and shell protocols, keep git-worktree and shell seams package-local until a second consumer proves reuse, validate rc-file mutations through redirected fakes and throwaway real-shell parity, and include source-shim/stale-tool/rollback evidence before deleting a Python fallback.

## Objective Impact

- Updated the Migration Ledger row for `Slots / slot` from active planning to TS-default/completed.
- Reconciled sequencing language: `slot` completed out of the previously listed order after dispatcher retirement; Roaster remains the next default unstarted capability unless new evidence changes the sequence.
- Added `slot` evidence under the repeated capability-subobjective roadmap pattern without closing the umbrella repeat-until-all row, because Roaster, `vibechk`, and `aretro` are not yet TS-default.
- Refined `porting-playbook.md` with reusable slot lessons for contract inventory, local seams, fake/real-shell parity, fallback deletion, and source-shim distribution.

## Follow-Ups

- Continue the umbrella sequence with Roaster / review workflows as the next default unstarted capability unless new evidence changes the order.
- A focused context rebaseline for stale domain-language references to the deleted Python slot package remains separate if desired.
