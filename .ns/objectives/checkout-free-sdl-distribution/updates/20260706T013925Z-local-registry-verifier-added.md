# Local Registry Verifier Added

## Summary

A read-only npm registry verification command now exists for the intended public `@nseng-ai/*` package set:

```bash
pnpm --dir ts run release:verify-public
```

The verifier shares the intended public package inventory and workspace-manifest discovery with `release:qualify-public`, reads registry metadata through `npm view <package>@<version> name version bin exports dist.tarball time --json`, and reports per-package published, missing, mismatched, or error status. Default report mode exits `0` for missing or mismatched registry packages so the current mostly-unpublished package set can be inventoried without failing. `--strict` exits nonzero for missing, mismatched, or errored packages, and `--version <version>` verifies a coordinated release version for every package instead of local manifest versions.

Documentation in `ts/packages/README.md` now distinguishes local dry-run qualification before publishing from post-publish registry readback verification. No `npm publish` or registry write was run.

Validation/evidence gathered locally:

```bash
pnpm --dir ts run release:qualify-public -- --all --skip-checks --skip-dry-run
pnpm --dir ts run release:verify-public
pnpm --dir ts run release:verify-public -- --version 0.1.0
pnpm --dir ts run release:verify-public -- --strict
just ts-deps-check
just ts-format-check
just ts-lint
just dprint-check
```

Observed registry state from the new verifier:

- Default local-manifest mode completed with exit `0` and reported 19 missing packages. This includes `@nseng-ai/ns@0.1.1`, which has local publish-prep evidence but is not registry-published.
- Coordinated `--version 0.1.0` mode completed with exit `0`, reported 18 missing packages, and reported `@nseng-ai/ns@0.1.0` as present but mismatched because its registry metadata lacks the five `./kernel/*` exports required by the current source manifest.
- `--strict` exited nonzero as expected against the incomplete current registry state.

## Objective Impact

This advances the release automation/local machinery row: checked-in release tooling now covers both sides of the public package lane — local no-write qualification before publish and read-only registry readback after publish. It does not complete the publication/verification row because no new package was published and the registry is still missing most intended packages.

The command also gives future release sessions a repeatable strict gate for post-publish evidence: after an authorized coordinated publish, `pnpm --dir ts run release:verify-public -- --strict` should fail if any intended package is absent or missing required name/version/tarball/time/bin/export metadata.

## Follow-Ups

- Publish an authorized coordinated package set separately, then rerun `release:verify-public -- --strict` and record registry-backed evidence.
- Publish a version of `@nseng-ai/ns` whose registry metadata includes the five `./kernel/*` exports before dependent package publication relies on those subpaths.
- If future automation needs durable machine-readable evidence, add a `--json` mode as a separate slice.
