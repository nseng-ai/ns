# Public Set Registry and First Batch Qualification

## Summary

This update records the current intended public/standalone package set and the first publishability batch for local release qualification. Registry reads were performed with `npm view <pkg>@0.1.0 name version bin exports dist.tarball time --json` on 2026-07-05. E404 means not published or inaccessible from the current npm registry view; it is not ownership evidence by itself.

The first batch remains `@nseng-ai/capability-kit` and `@nseng-ai/flow`. They are now treated as public source-shipping packages for local qualification, with generated `dist/publish` manifests expected to replace workspace/catalog dependency specs with registry-compatible versions and to reject private-package leakage.

## Intended Public Package Set

Already public workspace packages plus the user-approved standalone runtime batch:

- `@nseng-ai/branch-context@0.1.0`
- `@nseng-ai/handoffs@0.1.0`
- `@nseng-ai/objectives@0.1.0`
- `@nseng-ai/plans@0.1.0`
- `@nseng-ai/pr-feedback@0.1.0`
- `@nseng-ai/retros@0.1.0`
- `@nseng-ai/reviews@0.1.0`
- `@nseng-ai/slots@0.1.0`
- `@nseng-ai/command-backed-skill-registry@0.1.0`
- `@nseng-ai/ns@0.1.0`
- `@nseng-ai/brmem@0.1.0`
- `@nseng-ai/clinkr@0.1.0`
- `@nseng-ai/foundation@0.1.0`
- `@nseng-ai/areg@0.1.0`
- `@nseng-ai/packagechk@0.1.0`
- `@nseng-ai/vibechk@0.1.0`
- `@nseng-ai/capability-kit@0.1.0`
- `@nseng-ai/flow@0.1.0`

Explicit exclusions remain `@nseng-ai/kernel` (folded into `@nseng-ai/ns`, not standalone), `@nseng-ai/ccc` (deferred/private), `@nseng-ai/pi`, `@nseng-ai/pi-command-surfaces`, `nscc`, `@internal/pi-tools`, `@internal/typescript-style-guard`, and `.ns/reviews/*/tools/*` review tooling.

## Objective Impact

The Objective remains open. This update advances the package-set publication row by recording the intended set and current registry evidence, and advances the release automation row with a checked-in local first-batch qualification lane. It does not claim final closure because most intended packages are not yet registry-published and the qualification lane currently defaults to the first batch rather than the complete set.

## Registry Status

- Published: `@nseng-ai/ns@0.1.0` with `bin.ns = bin/ns.js` and tarball `https://registry.npmjs.org/@nseng-ai/ns/-/ns-0.1.0.tgz`.
- E404/not published or inaccessible: `@nseng-ai/branch-context@0.1.0`, `@nseng-ai/handoffs@0.1.0`, `@nseng-ai/objectives@0.1.0`, `@nseng-ai/plans@0.1.0`, `@nseng-ai/pr-feedback@0.1.0`, `@nseng-ai/retros@0.1.0`, `@nseng-ai/reviews@0.1.0`, `@nseng-ai/slots@0.1.0`, `@nseng-ai/command-backed-skill-registry@0.1.0`, `@nseng-ai/brmem@0.1.0`, `@nseng-ai/clinkr@0.1.0`, `@nseng-ai/foundation@0.1.0`, `@nseng-ai/areg@0.1.0`, `@nseng-ai/packagechk@0.1.0`, `@nseng-ai/vibechk@0.1.0`, `@nseng-ai/capability-kit@0.1.0`, and `@nseng-ai/flow@0.1.0`.

Follow-up caveat: current source `@nseng-ai/ns` has `./kernel/*` exports, but the already-published `@nseng-ai/ns@0.1.0` registry metadata does not show those exports. Local first-batch dry-run qualification may proceed against the current generated `@nseng-ai/ns` package shape, but real dependent publishes need a publish preview that accounts for `@nseng-ai/ns` kernel export availability, likely by publishing a version whose registry metadata includes the kernel subpaths before publishing dependents.

## Release Qualification Lane

A checked-in local qualification entrypoint now exists at `pnpm --dir ts run release:qualify-public`. It qualifies the first batch by default and prints the full intended public set so extending to the complete set is mechanical. The command prepares generated package roots under each package's `dist/publish`, rejects `workspace:`/`catalog:` specs and excluded/private package dependencies, and runs `npm publish --dry-run` without registry writes.

This is first-batch local qualification evidence, not final Objective closure. Closure still requires registry-backed publication/verification for the complete intended public set and a release lane that covers the complete set.

## Follow-Ups

- Publish or version `@nseng-ai/ns` so the registry package exposes the `./kernel/*` subpaths needed by dependents before any real `@nseng-ai/capability-kit` or `@nseng-ai/flow` publish.
- Extend `pnpm --dir ts run release:qualify-public -- --all` to cover every intended public package, not only the first batch.
- Record registry-backed evidence after each real publish, including expected exports/bin metadata and tarball provenance.
