# Cutover Retirement Playbook

## Summary

The final planned stack branch updated public-facing documentation and wrapper tests to describe the current TypeScript migration boundary without changing installed/prod behavior, plugin behavior, publishing, or broad Python fallback deletion.

Documentation now records the local TypeScript-managed operation set, the compatibility-backed operation set, and the evidence needed before retiring fallback paths. Wrapper tests now cover local TypeScript alias mode and local legacy Python alias mode in addition to existing local/prod behavior.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed with wrapper alias coverage included.
- `pnpm --dir ts/packages/pr-address run check` passed.
- `dprint check` passed for the changed Markdown files.

## Objective Impact

This moves the public cutover roadmap row to in-progress, not complete. Safe docs and wrapper-test coverage improved, but the branch intentionally did not perform npm/prod distribution cutover, did not replace the Python `asdl pr-address ...` plugin, and did not delete broad Python fallback paths.

The active compatibility boundary remains explicit:

- installed/prod skill invocation stays Python-backed
- the `asdl pr-address ...` plugin stays Python-backed
- `prepare-run`, `summarize-feedback`, default payload-mode `get-feedback`, stack orchestration helpers, `record-batch-checkpoint`, `read-feedback-details`, and unported schema routes stay fallback-backed

## Follow-Ups

- Make a separate explicit distribution decision before npm/prod skill cutover.
- Prove TypeScript plugin compatibility before replacing the Python `asdl pr-address ...` plugin.
- Port payload artifact storage before retiring fallback for default payload workflows, stack orchestration, checkpoint recovery, and bulk payload reading.
- Retire Python fallback per operation only after TypeScript parity, schema/envelope behavior, wrapper routing, and rollback evidence are all in place.
