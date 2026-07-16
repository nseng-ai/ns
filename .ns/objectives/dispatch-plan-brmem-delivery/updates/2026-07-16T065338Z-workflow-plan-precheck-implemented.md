# Workflow plan context and sandbox precheck implemented

## Summary

The existing dispatch spine now accepts a typed, locator-only Saved Plan context without carrying plan content in trigger or Workflow arguments. Workflow start seeds the exact `dispatch.id` attribute, prompt dispatch remains compatible, and plan dispatch fails before billable sandbox creation until its retrieval path is satisfied.

Sandbox launch preparation now validates the locator, fetches the exact `dispatch-context` Snapshot Ref, verifies its commit identity, runs deterministic `brmem check` for the required `<dispatch-id>/plan/<plan-slug>.md` member, and creates an execution instruction whose first agent action is `brmem get` followed by execution of the retrieved plan. Fake-driven dispatch, trigger, and sandbox tests and relevant repository TypeScript checks pass.

`build:deployable` was attempted but could not begin because this worktree lacks local Vercel Project Settings. Both ordinary and standalone Vercel builds requested `vercel pull` or credentials. Local autorun correctly performed neither external setup nor credentialed access.

## Objective Impact

Most of the workflow and sandbox roadmap row is locally implemented: typed context transport, Dispatch ID Workflow attribution, plan-body exclusion, exact-ref retrieval, deterministic member precheck, and harness-visible retrieval responsibility. The row remains in progress because recovery lookup behavior is not yet implemented and its required deployable build evidence is blocked on unavailable local project configuration.

This is implementation and local-test evidence only. No deployment, Workflow Analytics query, sandbox creation, workflow trigger, or other cloud mutation occurred.

## Follow-Ups

- Implement recovery lookup by exact `dispatch.id`, treating zero, one, and multiple matches explicitly.
- Run `build:deployable` from an already linked or otherwise repository-supported hermetic checkout; do not silently run `vercel pull` during local autorun.
- Keep command and wrapper work sequenced after the workflow row's remaining local behavior is complete, unless a future run explicitly accepts the validation blocker while preserving it in tracking.
