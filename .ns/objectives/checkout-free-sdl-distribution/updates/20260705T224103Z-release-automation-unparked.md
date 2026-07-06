# Release Automation Unparked

## Summary

User decision (2026-07-05): release automation / CI for the intended public package set is no longer parked. Manual publishes may still be used when needed, but the Objective's active scope now includes a repeatable checked-in release lane for the public `@nseng-ai/*` package set.

This supersedes the earlier parked framing in historical updates and roadmap prose. Those updates remain immutable provenance; the durable Objective record now treats release automation as active work.

## Objective Impact

`objective.md` now includes release automation / CI in scope, completion criteria, and risk framing. The Non-Goals section no longer excludes release automation. `roadmap.md` moved release automation / CI from `## Parked` into `## Work` as an open semantic row with evidence expectations: checked-in automation should build/package and dry-run or otherwise qualify the public package set before publication, and documentation should describe the release lane.

The Objective remains open. Closure now requires both public package-set publication/verification and release automation / CI evidence.

## Follow-Ups

- Design the release lane around the final intended-public package set rather than only the already-published `@nseng-ai/ns` CLI package.
- Decide what counts as CI qualification versus local release tooling for the package set, then record that as implementation evidence when it lands.
- Keep registry publication authority separate from automation design unless explicitly authorized; dry-run/package qualification can advance without pushing new packages.
