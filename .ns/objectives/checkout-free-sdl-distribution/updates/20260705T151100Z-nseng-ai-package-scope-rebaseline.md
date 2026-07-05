# `@nseng-ai/*` Package Scope Rebaseline

## Summary

Trunk now uses the external `@nseng-ai/*` package scope directly in workspace manifests. Evidence from current package manifests includes:

- `ts/packages/hosts/ns-cli/package.json`: `@nseng-ai/ns`, still private, with `ns` bin and local bundle/package smoke scripts.
- `ts/packages/kernel/package.json`: `@nseng-ai/kernel`, still private, with source `ns` bin and local build script.
- Standalone runtime/capability package names already use the external scope, including `@nseng-ai/capability-kit`, `@nseng-ai/flow`, `@nseng-ai/objective`, `@nseng-ai/branch-context`, and sibling capability packages.

This means the previously open `@ns/*` workspace-name to `@nseng-ai/*` published-name mapping decision is no longer open: the repo chose direct workspace package renaming to the publish scope rather than per-package publish-root generation with dependency-name rewriting.

## Objective Impact

The roadmap's standalone published-name/mapping decision row is complete. The Objective record was rebaselined from stale `@ns/*`/`ji` wording where it affected live scope, criteria, risks, and next-work selection. Historical updates still preserve their original names as provenance.

The publish path is still not complete: private runtime packages such as `@nseng-ai/ns`, `@nseng-ai/kernel`, `@nseng-ai/capability-kit`, and `@nseng-ai/flow` still need publishability work, build/package metadata, private flips or wrapper decisions, and real npm install verification before closure.

## Follow-Ups

- Convert the local `@nseng-ai/ns` package artifact into a publish-ready package: final `files`/exports/assets/dependency metadata, private/wrapper decisions, and no checkout-relative runtime assumptions.
- Decide and implement the publishability treatment for private runtime packages, especially `@nseng-ai/kernel`, `@nseng-ai/capability-kit`, and `@nseng-ai/flow`.
- Keep release automation parked; the first external npm publish remains a manual authorized step.
