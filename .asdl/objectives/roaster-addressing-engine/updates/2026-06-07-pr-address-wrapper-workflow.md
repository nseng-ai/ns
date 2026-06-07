# Preserve pr-address as a Lightweight Wrapper Workflow

## Summary

The Objective has been corrected to preserve the user-facing `pr-address` workflow at the end of the redesign. The intended deletion is not the workflow entrypoint itself; it is the current `pr-address` core implementation shape where classification, planning, batching, validation, and closeout semantics live outside roaster.

The desired end state is a coherent single-PR `pr-address` workflow that acts as a lightweight roaster-backed orchestrator/wrapper: it selects the current-branch PR target/profile, invokes roaster-owned collection/triage/batching/resolution/closeout planning, and optionally executes approved GitHub closeout through helper plumbing.

## Objective Impact

This narrows the no-backwards-compatibility stance. There is still no requirement to preserve the old `pr-address` classification/planning contract or implementation shape, but there is now an explicit requirement to preserve the public `pr-address` workflow affordance as a lightweight wrapper above roaster core.

Roadmap language was updated so the skill/package work is not framed as removing `pr-address`, but as keeping it usable while preventing it from re-growing independent core workflow semantics.

## Follow-Ups

- Define the exact UX and command/skill behavior of the lightweight `pr-address` wrapper.
- Ensure future deletion/refactor work distinguishes old core workflow code from the public wrapper workflow.
- When rewriting skills, preserve the user-facing promise that `pr-address` can run a single-PR addressing workflow, even though roaster owns the durable engine.
