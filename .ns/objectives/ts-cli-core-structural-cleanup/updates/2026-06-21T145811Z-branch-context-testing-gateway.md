# Branch-Context Testing Gateway Shared

## Summary

PR #1993 / `branch-context-brmem-testing-helper` exports a reusable `@sdl/branch-context/testing` entrypoint for the in-memory Branch-Memory gateway used by branch-context tests. The helper now wraps the shared `@sdl/brmem` fake gateway, supports configurable current-branch state, records branch-context attachment/list/get/delete calls, and only mutates its local attached-plan state for entries in the branch-context namespace.

The branch-context, ccc, and pi-extension test suites now import this shared testing gateway instead of carrying internal or bespoke fake implementations.

## Objective Impact

This advances the Branch-Memory access unification slice by reducing test-helper drift around the new in-process gateway boundary. It is not by itself the completion evidence for the full branch-context migration: the main row still needs the gateway-migration behavior evidence that branch-context no longer depends on the subprocess/JSON parsing layer while preserving diagnostics and partial-failure semantics.

## Follow-Ups

- Use the shared testing gateway as the canonical fake for branch-context Branch-Memory interactions in downstream tests.
- Complete or verify the underlying branch-context gateway migration slice and record validation evidence before marking the Branch-Memory access roadmap row complete.
