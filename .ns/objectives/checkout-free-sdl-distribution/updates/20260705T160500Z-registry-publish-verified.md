# Registry publish verified for @nseng-ai/ns 0.1.0

## Summary

The real npm registry now contains `@nseng-ai/ns@0.1.0`, and a registry-backed `npx` install was verified from a throwaway foreign git repo with no ns checkout.

Evidence collected on 2026-07-05 UTC:

```bash
npm view @nseng-ai/ns@0.1.0 name version bin dist.tarball time --json
```

reported package `@nseng-ai/ns`, version `0.1.0`, bin `{ "ns": "bin/ns.js" }`, tarball `https://registry.npmjs.org/@nseng-ai/ns/-/ns-0.1.0.tgz`, and publish time `2026-07-05T15:55:07.881Z`.

Registry install smoke from a fresh temp repo:

```bash
TMP=$(mktemp -d /tmp/ns-registry-smoke-XXXXXX)
cd "$TMP"
git init -q
printf '{"private":true,"type":"module"}\n' > package.json
npx -y @nseng-ai/ns@0.1.0 objective list --format md --minimal
npx -y @nseng-ai/ns@0.1.0 objective list --help
npx -y @nseng-ai/ns@0.1.0 objective exec tracking-gate demo --format json
```

The first command rendered the Objective list for the foreign checkout (`No open Objective records found.`), the help command rendered `Usage: ns objective list`, and the hidden `objective exec tracking-gate` surface loaded and returned the expected negative result for missing slug `demo`. This verifies the published package loads Objective and hidden exec command code from the registry-installed package rather than a source checkout.

## Objective Impact

The final non-parked roadmap row is complete: a versioned `@nseng-ai/ns` package exists on npm and registry-backed `npx` can run `ns objective ...` against a foreign repo. This also clears the hard checkout-free distribution dependency consumed by `ship-objectives-to-customers`; that Objective still needs its own tracking update to clear or revise its Blocked Sentence.

The Objective appears ready for explicit close after any desired final validation/readback, because its completion criteria have recorded evidence: registry install works checkout-free, Objective hidden exec loads, package runtime avoids checkout shims per the prior dry-run/smoke update, runtime dependency triage is recorded, and the build/package path is reproducible through the host package scripts.

## Follow-Ups

- Run `objective-close` for this Objective if the final readback is accepted.
- Update `ship-objectives-to-customers` to clear its checkout-free blocked sentence or revise its dependency status now that `@nseng-ai/ns@0.1.0` is published and registry-verified.
- Keep release automation parked unless a new Objective or roadmap row is created for it.
