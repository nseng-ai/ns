# README-First Launch; Docs Site Deferred

## Summary

The owner chose package READMEs as the documentation surface for the first Objectives customer launch. `eve-parity-docs-site` is intentionally deferred: its implemented shell remains preserved, its Vercel gate stays closed, and its unfinished IA, corpus, and deployment work no longer gates this Objective.

This decision supersedes the prior fully-live ship-bar requirement that nseng.ai launch with the first customer slice. The first launch bar is now registry-served `@nseng-ai/ns` and `@nseng-ai/objectives` READMEs followed verbatim through the Claude Code lifecycle.

## Objective Impact

The documentation row narrows to qualifying and publishing package artifacts that contain the new canonical READMEs. The Claude Code steelthread is unblocked from the docs-site dependency and should run after that registry publication exposes the README instructions.

The Objective remains open. Existing `0.1.3` proves bare-core acquisition and skill provisioning, but its artifacts predate the new README content; therefore it cannot yet supply README-verbatim customer evidence.

## Follow-Ups

- Qualify and publish a package version containing the canonical `@nseng-ai/ns` and `@nseng-ai/objectives` READMEs under the release workflow's explicit external-write authorization.
- Run a fresh Claude Code session through create → next → update → close using only those registry-served READMEs and activated repository state.
- Treat every deviation as a README or product defect and repeat from a clean repository.
- Keep public docs-site expansion parked until a future explicit Objective resumes it.
