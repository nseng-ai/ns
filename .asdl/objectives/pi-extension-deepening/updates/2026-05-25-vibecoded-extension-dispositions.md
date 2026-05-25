# Vibecoded Extension Dispositions

## Summary

Candidate 10 has been decided.

- `/submit` is accepted for promotion into the engineered TypeScript extension package because it mutates Graphite/GitHub state, owns raw process handling, and needs fake-driven tests.
- `/land` stays vibecoded as an intentional fast path for contributors who do not use Graphite and for whom `/land-stack` does not make sense.
- `/just` stays vibecoded; Candidate 5 already extracted the shared skill-expansion helper, and the remaining command behavior is repo-local workflow glue.
- The old Pi package import drift in kept vibecoded code was fixed from `@mariozechner/*` to the current `@earendil-works/*` packages in `.pi/extensions/land.ts` and `.pi/extensions/submit.ts`.
- `docs/pi/README.md` now records the current inventory and layer decisions for `/land`, `/just`, and `/submit`.

## Objective Impact

Candidate 10 is complete as a disposition slice. The Objective now has an accepted high-risk implementation path: promote `/submit`, but start with characterization and fake-driven tests around its existing Graphite dry-run, restack, submit, current-PR verification, timeout, output-tail, and PR-link behavior rather than introducing a broad generic command runtime first.

The vibecoded layer remains intentional. `/land` is not retired because it serves a non-Graphite fast path distinct from `/land-stack`; `/just` remains local because its shared Pi skill-expansion policy is already factored out.

This also resolves the import-path review question for the currently kept vibecoded commands.

## Follow-Ups

- Implement `/submit` promotion in a coherent slice with fake-driven tests and Graphite/GitHub workflow guidance.
- Do not infer from `/submit` alone that a broad command runtime is justified; promote concrete behavior first, then apply the deletion test to repeated lifecycle semantics.
- Continue remaining candidate triage with Candidate 1, unless `/submit` promotion is chosen as the next implementation slice.
