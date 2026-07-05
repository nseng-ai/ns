# Standalone Package Publishing Confirmed

## Summary

User decision (2026-07-05): many workspace packages will be published as standalone
versioned npm packages — `@ns/capability-kit` and `@ns/flow` at a minimum. This firms up
the Pi-style strategy's "versioned npm packages where feasible" clause into a commitment:
standalone publishing is the plan for the runtime closure, not a fallback that
bundle-inline might quietly replace.

This makes published naming a real work item rather than a residual open question:

- The external publish scope is `@nseng-ai`; no packages exist under `@ns` on the public
  registry (registry search returns zero), but scope ownership is unverified — confirm
  whether the `ns` npm user/org is claimable before assuming `@ns/*` names could ever be
  published as-is.
- The current single-manifest technique — workspace `@ns/cli` with a generated publish
  root carrying `@nseng-ai/ns` — works because esbuild inlines every workspace dependency
  into one artifact, so exactly one manifest is renamed and no `@ns/*` name can leak into
  a published dependency list.
- That technique does not scale to a published dependency graph: standalone packages
  reference each other, so every internal `@ns/x` dependency edge would need pack-time
  rewriting to its external name, fighting the lockfile, TS project references, and import
  specifiers. The orthodox alternatives are (a) rename workspace packages to their
  published names, or (b) build deliberate per-package publish-root generation with
  dependency-name rewriting and accept owning that machinery.

## Objective Impact

- Adds a naming/mapping decision row to the roadmap ahead of the publish row: every
  standalone-published package needs a decided external name and a decided
  workspace-name-to-published-name mapping strategy.
- Resolves the "which private packages get un-privated vs bundle-inlined" open question's
  direction for `@ns/capability-kit` and `@ns/flow`: standalone publish.

## Follow-Ups

- Verify `@nseng-ai` org ownership and check whether the `ns` npm scope is claimable
  (requires a logged-in npm session; anonymous probes are blocked).
- Decide per standalone package its published name (for example `@nseng-ai/capability-kit`,
  `@nseng-ai/flow`) and record the table.
- Decide the mapping strategy: workspace rename to published names vs pack-time
  dependency-graph rewriting. Coordinate with the open `rename-ji-to-ns` objective, which
  owns the naming cutover and publish name.
