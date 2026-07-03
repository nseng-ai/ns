# All Nonslop Capability Inventory Requirement

## Summary

The Objective scope was corrected to require a whole-repo capability inventory of `/Users/schrockn/code/nonslop`, not just the `areg` package and the `ns-*` skill catalog.

Evidence gathered during the correction included a bounded source-tree listing excluding `.git`, `.venv`, caches, and build artifacts, plus inspection of nonslop's root recipes/config, docs, scripts, GitHub workflows/actions, agent configuration, package skeleton directories, and checkout-local skill symlinks. A seed catalog was written to `nonslop-capability-inventory.md`; it is not complete until implementation assigns final dispositions to every item.

## Objective Impact

The thesis, scope, completion criteria, assumptions/risks, and first roadmap row now require cataloging every nonslop capability before implementation: source code, tests, first-party skills, existing asdl-tools skill copies, docs, scripts, CI/workflow setup, package/release/dev recipes, generated templates, agent configuration, lockfiles, local development integrations, checkout-local symlinked skills, and empty or skeletal package directories.

The implementation session must assign each discovered capability an explicit disposition (`migrate`, `rewrite`, `fold`, `retire`, or `ignore as cache/build/local-only`) before moving files or claiming deletion readiness.

## Follow-Ups

- Start implementation with the whole-repo capability inventory/disposition audit.
- Ensure the final deletion-readiness evidence covers non-`areg` capabilities such as CI, skill standards, sync scripts, local dev links, and agent configuration.
