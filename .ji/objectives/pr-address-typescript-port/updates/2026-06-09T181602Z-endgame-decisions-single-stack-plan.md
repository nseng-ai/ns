# Endgame Decisions and Single-Stack Plan

## Summary

An analysis pass mapped every remaining Python-backed surface and settled the three decisions that previously blocked planning the rest of the Objective as one executable stack.

Decisions:

- Distribution: installed/prod mode will execute a bundled, self-contained JavaScript artifact shipped inside the installed skill. No npm registry publish is required; `@asdl/pr-address` stays unpublished by design, and npm publishing moved to Parked.
- Plugin: the `asdl pr-address ...` Python plugin is retired outright rather than shimmed or ported. The standalone `pr-address` CLI becomes the only invocation surface.
- Python end-state: `packages/asdl-pr-address` is fully deleted in-repo within the endgame stack once parity, bundle cutover, and plugin retirement are evidenced. Rollback after deletion is the external frozen PyPI artifact `asdl-pr-address==0.1.1` via `uvx`.

New evidence informing those decisions:

- The wrapper's prod mode pins `asdl-pr-address==0.1.0`, but PyPI has only `0.1.1`; installed/prod invocation is currently broken, so there is no working prod Python path to preserve through cutover.
- `@asdl/pr-address` is not published on npm.
- The payload artifact store (`asdl_core.payloads`: env-based session resolution, `{root}/{session}/artifacts/` layout, `{descriptor}--{role}.json` naming) is the single keystone dependency for all remaining unported operations.
- Remaining fallback-backed operations are `prepare-run`, `summarize-feedback`, default payload-mode `get-feedback`, `read-feedback-details`, `record-batch-checkpoint` artifact writing, `stack-feedback-prep`, `stack-feedback-plan`, and `build-stack-resolve-thread-payloads`, plus `--json-schema` routes outside the classification trio.
- Stack orchestration operations have no Graphite dependency; they reuse the PR gateway, payload store, and the already-ported planning/classification core.
- `prepare-run`'s contested-thread reopen is a GitHub write already covered by the ported TypeScript mutation gateway and fakes.

## Objective Impact

The roadmap's completed first-stack plan was replaced by an Endgame Stack section: nine dependency-ordered branches (`payload-store`, `payload-operations`, `prepare-run-summarize`, `stack-orchestration`, `schema-routes`, `bundle-distribution`, `plugin-retirement`, `python-deletion`, `playbook`) designed for a single multi-agent session. Every branch is directly executable under the Runner Policy plus the Decided entries; the standing exclusions are live GitHub write probes, registry publishing, and PR submission.

`objective.md` now records the decisions under Assumptions and Risks, resolves the plugin-compatibility and fallback-retirement-evidence open questions, updates Scope and Completion Criteria from npm-path wording to bundled-distribution wording, and adds one new open question about exact bundle build/runtime/refresh mechanics.

The cutover and retirement roadmap rows now carry the decided policies: bundle machinery, wrapper cutover, and plugin retirement are directly executable; full Python deletion is preauthorized within the endgame stack once its listed gates are evidenced.

## Follow-Ups

- Execute the Endgame Stack branches in order, capturing Python parity fixtures in early branches while the in-repo reference implementation still exists.
- Settle bundle build mechanics (Node version floor, single-file vs directory bundle, installed-skill refresh story) inside the `bundle-distribution` branch and record the outcome.
- After `python-deletion`, confirm no docs, tests, workspace config, or skill wrappers reference the deleted package, and record the final retirement evidence.
- Close the Objective after the `playbook` branch records reusable migration lessons and completion criteria are evidenced.
