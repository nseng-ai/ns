# Final Python Runtime Deletion

## Summary

The final cleanup bar changed from documenting the remaining Python reference substrate to deleting it from active tracked paths.

This update records the deletion of the last first-party Python implementation surfaces:

- removed `packages/asdl-core/` and all tracked Python reference-source files under it;
- removed the root `src/asdl_tools/` dispatcher package;
- removed the root Python `tests/` tree;
- removed the root uv workspace/project metadata (`pyproject.toml`, `uv.lock`) and Python-oriented just recipes;
- replaced the tracked Python TypeScript-shim renderer with `ts/scripts/render-cli-shim.mjs` and updated callers/tests to invoke Node;
- rebaselined root agent instructions and the context map so they no longer describe an active Python workspace, root Python package, plugin-dispatcher test surface, or `asdl-core` context target.

Historical Python reference remains available through git history. Active shared foundation ownership is TypeScript `@asdl/core`; active command surfaces remain standalone TypeScript CLIs and TypeScript-owned hidden `exec` helpers.

## Objective Impact

This removes the last tracked first-party Python implementation and root Python test surfaces from the migration closure path. The umbrella Objective can now close under a stronger claim than the previous documented-retention state: active toolkit implementation and repository orchestration are TypeScript/default, while future compatibility/framework/UX redesigns remain parked outside the language migration.

## Follow-Ups

- Close the umbrella migration Objective after final validation/readback.
- If any future work needs old Python behavior as reference, recover it from git history rather than keeping a live tracked package.
