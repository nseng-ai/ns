# Shared Project Config Ownership Refined

## Summary

The dispatch-client extraction remains complete, but follow-up review found that the generic `[dispatch]` project-config parser serves package-wide deployability, scripts, and the curated public API in addition to local dispatch invocation. The parser therefore moved from `src/dispatch-client/project-config.ts` to the neutral package-owned `src/config/project-config.ts` home. Dispatch-client retains only invocation-specific refinement requiring `deployment_url` and `workflow_dashboard_url` during preflight.

The same remediation deepened exact-source preparation into one dispatch-owned publication/revalidation phase. Its discriminated result supplies one authoritative refreshed source and trigger context, while mutating failures retain publication and affected-branch evidence structurally.

## Objective Impact

M4+M5 remains complete: the command feature and its orchestration still live under `dispatch-client`, and no old `src/ns/dispatch-prompt/` ownership or public `./dispatch-client` export returned. This update corrects the narrower historical ownership claim for a package-shared parser; it is a refinement, not a rollback of the extraction.

Local fake-driven coverage verifies already-current, exact-SHA Git, authorized Graphite, rewritten-SHA, revalidation-failure evidence, and refreshed trigger-connection behavior. No live dispatch, deployment, Graphite submit, Git push, PR mutation, or publication was performed or claimed.

## Follow-Ups

- Keep package-shared `[dispatch]` schema parsing under the neutral config owner.
- Keep dispatch invocation requirements and trigger-context refinement under dispatch-client.
- Continue remaining thermo-review rows independently.
