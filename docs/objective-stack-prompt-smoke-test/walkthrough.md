# Smoke Test Walkthrough

This walkthrough describes the intended high-level flow for the disposable Objective stack prompt smoke test.

1. Parent selects the `objective-stack-prompt-smoke-test` Objective.
2. Parent plans two small docs-only slices.
3. Parent creates one Graphite branch for each slice.
4. Parent dispatches one focused runner subagent per slice.
5. Each subagent keeps changes under `docs/objective-stack-prompt-smoke-test/`.
6. Parent validates that the resulting stack is docs-only.
7. Parent records Objective evidence after validating the subagent output.
8. Parent stops before PR submission.
