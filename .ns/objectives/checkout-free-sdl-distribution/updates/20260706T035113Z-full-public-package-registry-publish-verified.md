# Full Public Package Registry Publish Verified

## Summary

The complete intended public `@nseng-ai/*` package set is now published and registry-verified at coordinated version `0.1.1`.

Registry-backed evidence gathered on 2026-07-06:

- `pnpm --dir ts run release:verify-public -- --version 0.1.1 --strict` exited 0.
- Strict verification read back all 19 intended public packages from npm with `npm view <package>@0.1.1 name version bin exports dist.tarball time --json`.
- The verifier reported `Summary: 19 published, 0 missing, 0 mismatched, 0 errors`.
- `@nseng-ai/ns@0.1.1` registry metadata includes `bin.ns = bin/ns.js` and the expected kernel exports: `./kernel/cli`, `./kernel/command-io`, `./kernel/context`, `./kernel/pi-text-generation`, and `./kernel/sdk`.
- A registry-backed checkout-free smoke from a throwaway foreign git repository ran `npx -y @nseng-ai/ns@0.1.1 objective list --format md`; the installed CLI executed successfully without an ns checkout and reported that the foreign checkout had no open Objective records.

Verified public package set:

- `@nseng-ai/ns@0.1.1`
- `@nseng-ai/clinkr@0.1.1`
- `@nseng-ai/foundation@0.1.1`
- `@nseng-ai/capability-kit@0.1.1`
- `@nseng-ai/brmem@0.1.1`
- `@nseng-ai/plans@0.1.1`
- `@nseng-ai/branch-context@0.1.1`
- `@nseng-ai/objectives@0.1.1`
- `@nseng-ai/handoffs@0.1.1`
- `@nseng-ai/pr-feedback@0.1.1`
- `@nseng-ai/retros@0.1.1`
- `@nseng-ai/reviews@0.1.1`
- `@nseng-ai/slots@0.1.1`
- `@nseng-ai/packagechk@0.1.1`
- `@nseng-ai/vibechk@0.1.1`
- `@nseng-ai/flow@0.1.1`
- `@nseng-ai/ccc@0.1.1`
- `@nseng-ai/command-backed-skill-registry@0.1.1`
- `@nseng-ai/areg@0.1.1`

## Objective Impact

This completes the Objective's remaining open publication row: every workspace package intended to be public/standalone has registry-backed npm evidence at the coordinated `0.1.1` version, and the published `@nseng-ai/ns` CLI package has the expected bin and kernel subpath exports.

Together with the earlier local build, dry-run, release-automation, and checkout-free smoke evidence, the Objective's completion criteria are satisfied. The Objective is ready to close.

## Follow-Ups

- Treat future public package releases as normal release work using the checked-in local lane rather than as remaining scope for this Objective.
- Keep explicitly excluded/internal packages outside the public package set unless a future Objective changes that decision.
