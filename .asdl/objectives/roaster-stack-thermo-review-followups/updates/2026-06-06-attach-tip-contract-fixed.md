# Attach-Tip Contract Fixed

## Summary

Explicit `--target-branch` mutating stack runs now resolve the generated-branch attachment point through `GraphiteStackGateway.resolve_attach_tip(cwd=..., target_branch=...)` instead of treating the target branch itself as the attach tip.

`_resolve_attach_context(...)` now uses the returned `GraphiteAttachTip` target branch and attach tip, and propagates `GraphiteStackFailure` results from attach-tip resolution. Fake-driven workflow coverage verifies that explicit-target runs call the attach-tip abstraction and checkout the resolved attach tip before generating resolver branches. Real Graphite attach-tip support remains intentionally unsupported and now fails closed with a message that mutating explicit-target runs require attach-tip resolution.

Verification: targeted stack workflow and Graphite gateway tests passed, and ruff passed for the touched source/test files.

## Objective Impact

This completes the roadmap item to fix or explicitly narrow Graphite attach-tip semantics for explicit target branches. The Objective now records the stack contract decision: explicit target branches should resolve through the attach-tip abstraction, not silently bypass it as a manual direct-attachment mode.

The related risk remains that real attach-tip discovery needs a stable implementation before production mutating runs can use explicit target branches, but that risk is now fail-closed and fake-covered rather than hidden behind direct attachment.

## Follow-Ups

- Implement real Graphite attach-tip resolution only when there is a stable enough `gt`/Graphite surface to support it safely.
- Continue the remaining Objective rows for generated PR marker/body support, durable run state, and README/test reconciliation separately.
