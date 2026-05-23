# Pi Extension Layer Documentation

## Summary

`docs/pi/README.md` now documents ASDL's two project-local Pi extension implementation layers:

- the vibecoded extension layer at `.pi/extensions/*.ts` and `.pi/extensions/*/index.ts`; and
- the engineered layer at `ts/packages/pi-extensions/`.

The README records promotion criteria based on stability, risk, reuse, and test need, and explicitly says not to promote behavior merely because an extension is checked in. It also inventories the current authored extensions and classifies `objective.ts` and `land-stack.ts` as project-local adapters over engineered behavior, with `just-fix.ts` and `submit.ts` remaining vibecoded implementations.

Verification: full `just` passed.

## Objective Impact

This resolves the first docs slice of the Objective and candidate 1 for the initial architecture pass. `docs/pi/README.md` is sufficient as the first documentation surface for the layer distinction; no package metadata or additional local convention is needed before moving to later candidates.

The roadmap now marks the layer documentation, current inventory, and candidate 1 clarification work complete. The broader Objective remains open for shared command runtime evaluation, Objective selection deepening, `land-stack` module splitting, `/submit` layer decisions, and shared skill-invocation evaluation.

## Follow-Ups

- Decide whether `/submit` remains vibecoded, is partially promoted, or moves into engineered Graphite/PR machinery.
- Evaluate shared command runtime mechanics only where real reuse appears across extensions.
- Compare Objective and `just-fix` skill expansion flows before extracting shared skill-invocation mechanics.
