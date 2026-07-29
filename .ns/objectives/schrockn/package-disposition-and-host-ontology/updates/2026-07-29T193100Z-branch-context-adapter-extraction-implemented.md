# Branch Context Pi Adapter Extraction Implemented

## Summary

The complete `@nseng-ai/pi-ns-branch-context` extraction is implemented as one end-to-end working-tree change. Stable Branch Context and Saved Plan slash-command names plus `formatImplBranchContextCommand` move to `@nseng-ai/branch-context/api`; Skill Exposure, Herdr, and the host adapter consume that curated API. The complete Pi implementation, prompt asset, default and integration tests, direct package discovery, and parity identity move to the new incubating host package.

`@nseng-ai/branch-context` now has no `src/pi`, Pi tests, `./pi*` exports, `pi` subpackage declaration, or Pi Runtime peer/dev coupling. The host adapter consumes Branch Context and Plans only through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`; Grill activation uses Pi Runtime's narrow host-neutral contract, without promoting project-only Grill UI names into the Branch Context API.

## Objective Impact

This completes the Branch Context adapter ownership transition required by the end-to-end-per-adapter strategy. Branch Context joins Objectives and Handoffs as a separate `pi-ns-*` host adapter while preserving existing command behavior. Flow, Herdr, the internal Pi-native extractions, and the final broad structural guards remain open; no broad final guards are enabled by this change.

## Follow-Ups

- Extract Flow and Herdr through their own end-to-end adapter PRs.
- Complete the internal Pi-native extractions before enabling the final structural guards.

## Evidence

Focused package typechecks and tests pass for `@nseng-ai/branch-context`, `@nseng-ai/pi-ns-branch-context`, `@nseng-ai/herdr`, and `@nseng-ai/skill-exposure`. The moved real-Branch-Memory integration test also passes in the integration lane. Workspace-wide validation is recorded in the implementing PR's validation evidence.
