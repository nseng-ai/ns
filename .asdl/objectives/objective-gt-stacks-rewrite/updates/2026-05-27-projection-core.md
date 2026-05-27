# Projection Core Landed

## Summary

The second implementation slice introduced the semantic `objective gt stacks` projection core without wiring CLI commands, renderers, or the Pi wrapper.

Evidence: branch `objective-gt-stacks-rewrite/projection-core` added `gt_stack_projection.py` and fake-driven tests over `FakeGtGateway` and `FakeGitGateway`. The tests cover the spec worked example, trunk-connected local branch filtering, untracked git branch exclusion, missing-local-parent warning de-duplication, open/closed/in-flight trunk status projection, many-to-many `also_touches`, connector rows, segment counts, latest-work selection, and deterministic tie-breaking.

Verification: targeted projection/list-touch/real-gateway pytest passed; targeted ruff, format, and `ty` checks passed for the new projection files.

## Objective Impact

The worked-example projection and branch-scope roadmap rows are complete. The broader projection edge-case row and implementation row are now in progress: the core model exists and returns semantic JSON-ready facts, but CLI failure envelopes, renderer expectations, and explicit projection-level archive-root edge coverage still belong to follow-up slices.

The projection relies on `GtGateway.branch_graph()` and the existing Git/Objective seams, keeping Graphite-specific behavior local to the future explicit `objective gt` path.

## Follow-Ups

- Wire `objective gt stacks` CLI JSON first, including stable failure envelopes for Graphite and Git read failures.
- Add renderer tests over the semantic projection without moving glyphs or annotations into the JSON model.
- Add explicit projection-level archive-root-only coverage if the CLI/renderer slice does not cover it naturally.
