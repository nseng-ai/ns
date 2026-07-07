# ns update reconcile slice implemented

## Summary

Implemented the provision/reconcile slice for npm-module-bundled harness artifacts in `@nseng-ai/harness-artifacts` and exposed it through the decided minimal top-level `ns update` command.

The slice wires the existing discovery, provision planning/apply core, and install manifest into one reconcile operation:

- moved repo-root `ns.toml` harness-selection parsing from `@nseng-ai/ns-init` into `@nseng-ai/harness-artifacts`, with `ns-init` re-exporting the same public surface;
- added core seams for resolving harness skill roots and reading install manifests at a root;
- added a pure reconcile planner that detects artifact-id and target-name collisions, generates declared pairs from `ns.toml`, refreshes manifest-tracked entries, dedupes by install-manifest key, and reports orphans without deleting files;
- added a reconcile driver that unions first-party and extension-root npm-module catalogs, reads project `ns.toml`, probes project-scope manifests for all harnesses, previews/applies each pair, and continues past locally edited conflicts while setting `needsForce`;
- added git-root walk-up so `ns update` invoked from a subdirectory anchors targeting at the enclosing worktree root (`.git` directory or file), falling back to cwd outside git;
- added a root-mounted `ns update` command with `--dry-run`/`-n`, `--force`/`-f`, JSON result schema, human rendering, and negative exit on conflicts.

## Scope notes

The implementation stays inside the accepted slice boundaries:

- New provisioning behavior lives in `ts/packages/capabilities/harness-artifacts` plus the host-level ns-cli scenario test that proves preinstalled command wiring.
- The kernel keeps zero artifact knowledge; the command is surfaced through the harness-artifacts preinstalled command catalog.
- Non-extension npm packages, uninstall/orphan cleanup, trust gating, fingerprint/backstop nudges, and per-resource filtering remain parked/non-goals.
- Orphans are reported only; no files are removed.
- The only plan adaptation was mechanical: the CLI e2e test lives in the existing `ts/packages/hosts/ns-cli/test/ns-cli.test.ts` host scenario file rather than a separate new file, matching the current ns-cli test layout.

## Evidence

Tests added/updated:

- `ts/packages/capabilities/harness-artifacts/test/ns-toml.test.ts` — moved parser coverage now owned by harness-artifacts.
- `ts/packages/capabilities/harness-artifacts/test/reconcile-plan.test.ts` — declared pair generation, no-selection behavior, manifest refresh without selection, declared/manifest dedupe, orphan reporting, and collision errors.
- `ts/packages/capabilities/harness-artifacts/test/reconcile-apply.test.ts` — fake-backed fresh install with manifest hashes, idempotent rerun, source refresh, local-edit conflict and force overwrite, missing/invalid `ns.toml`, and orphan preservation.
- `ts/packages/hosts/ns-cli/test/ns-cli.test.ts` — `ns update --help` metadata and a full git-root subdirectory flow installing both a module artifact and first-party `objective`, rerunning unchanged, refusing local edits, and succeeding with `--force`.

Validation run during the slice:

- `pnpm --dir ts --filter @nseng-ai/harness-artifacts test`
- `pnpm --dir ts --filter @nseng-ai/harness-artifacts check`
- `pnpm --dir ts --filter @nseng-ai/ns-init test`
- `pnpm --dir ts --filter @nseng-ai/ns-init check`
- `pnpm --dir ts --filter @nseng-ai/ns test`
- `pnpm --dir ts --filter @nseng-ai/ns check`

Full-repo validation remains to be run before final keep/commit.
