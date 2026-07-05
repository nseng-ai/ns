# Dogfood Positive Signal and Package Scope

## Summary

Human dogfooding feedback is positive: the current Pi explore/subagent capability is useful enough to move beyond repo-local dogfood.

Scope is expanded to include creating `ns-pi-subagents` as a properly formed Pi extension package. The intent is to preserve the tested engineered core while giving the capability a clean package boundary, install/registration surface, and package-level documentation instead of relying on this checkout's `.pi/extensions/explore.ts` shim for normal use.

## Objective Impact

The dogfood roadmap row is now in-progress with a positive signal, and a new semantic work row tracks `ns-pi-subagents` package creation. Completion criteria now require the dogfooded implementation to be packaged as a proper Pi extension package.

This does not change the already accepted local-policy decision for dogfooding; it raises the next productization slice from local shim tuning to package formation.

## Follow-Ups

- Decide the exact package boundary: ns-internal workspace package first vs. immediate external-distribution readiness.
- Implement `ns-pi-subagents` with tests, package-level docs, and a clear Pi extension entrypoint.
- After packaging, update Objective evidence with validation results and any migration away from `.pi/extensions/explore.ts`.
