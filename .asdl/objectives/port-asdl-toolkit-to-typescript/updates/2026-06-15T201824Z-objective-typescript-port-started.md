# Objective TypeScript Port Started

## Summary

`objective` is now selected as the next default capability slice in the umbrella TypeScript migration after the completed Handoff cutover and the completed out-of-sequence `areg` exception.

Created the active child Objective `.asdl/objectives/objective-typescript-port/` to own detailed Objective CLI port planning. The child Objective starts with a concrete `contract-inventory.md` covering standalone `objective`, hidden `objective exec` commands, checked-in Markdown storage, skill/Pi/CCC consumers, the current `asdl objective` plugin path, distribution assumptions, tests, and incidental Python details.

This setup does not implement TypeScript code, delete Python, change install recipes, or retire the plugin path.

## Objective Impact

The umbrella migration ledger now marks Objectives / `objective` as in progress with an active child Objective instead of simply `Unstarted`.

The broader repeated-capability row remains open because the toolkit migration is not complete. This update records only selection and setup for the `objective` capability slice. The next remaining default capability after `objective` is `asdl-dispatcher` unless future evidence changes the sequence.

## Follow-Ups

- Start future Objective port work from `.asdl/objectives/objective-typescript-port/contract-inventory.md` rather than rediscovering the Python contract from scratch.
- Decide `asdl objective` plugin retirement and the final distribution model from current consumer evidence before cutover.
- Port in vertical TypeScript slices, beginning with a small deterministic read/list surface, then migrate callers/install docs and retire the Python fallback deliberately.
- Feed reusable lessons, accepted divergence, migration debt, and final status back into this umbrella Objective when meaningful decisions land.
