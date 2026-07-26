# harness-artifacts

The `harness-artifacts` feature of `@nseng-ai/ns` owns the shared catalog, path-table, provision-plan, and local materialization logic for ns-owned harness artifacts.

It is the substrate behind the `ns skills` command family and the `init` feature's artifact activation. Other packages consume it through the `@nseng-ai/ns/api` door; modules inside `@nseng-ai/ns` import this feature directly.

## Domain vocabulary

- **Harness artifact**: an ns-owned resource that can be materialized into an assistant harness.
- **Kinds**: the model represents `skill`, `agent`, and `extension-bundle`; the steelthread provisions only `skill` artifacts today.
- **Harness**: the target assistant environment (`claude-code`, `codex`, or `pi`). Do not use "platform" for this domain.
- **Provision**: the verb for materializing a harness artifact into a harness root.
- **Skills**: the user-facing CLI noun for the current steelthread surface (`ns skills ...`).

## Supported harness path table

`src/harness-paths.ts` defines `HARNESS_SPECS`: harness ids, aliases, and user/project skill roots. `normalizeHarnessId` accepts ids and aliases case-insensitively after trimming; `resolveHarnessArtifactPath` resolves only `skill` artifacts and returns the root plus the concrete artifact path.

Given `projectRoot`, `homeDir`, optional `env.CLAUDE_CONFIG_DIR`, and artifact name `<skillName>`:

| Harness id    | Aliases  | Scope     | Resolved root                                                                                                    | Resolved artifact path                     |
| ------------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `claude-code` | `claude` | `project` | `<projectRoot>/.claude/skills`                                                                                   | `<projectRoot>/.claude/skills/<skillName>` |
| `claude-code` | `claude` | `user`    | `<CLAUDE_CONFIG_DIR>/skills` when `CLAUDE_CONFIG_DIR` is set and non-blank; otherwise `<homeDir>/.claude/skills` | `<root>/<skillName>`                       |
| `codex`       | none     | `project` | `<projectRoot>/.agents/skills`                                                                                   | `<projectRoot>/.agents/skills/<skillName>` |
| `codex`       | none     | `user`    | `<homeDir>/.agents/skills`                                                                                       | `<homeDir>/.agents/skills/<skillName>`     |
| `pi`          | `pi-dev` | `project` | `<projectRoot>/.pi/skills`                                                                                       | `<projectRoot>/.pi/skills/<skillName>`     |
| `pi`          | `pi-dev` | `user`    | `<homeDir>/.pi/agent/skills`                                                                                     | `<homeDir>/.pi/agent/skills/<skillName>`   |

Adding another harness is intended to be a pure data addition to `HARNESS_SPECS`: add the id, aliases, and scoped root specs, then cover alias normalization and path resolution in tests.

## Catalog and provision flow

The first-party catalog lives in `src/first-party-catalog.ts` as `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG`. The current catalog contains the `objective` skill (`objective-skill`) sourced from `skills/objective` in the `@nseng-ai/ns` repository package.

Provisioning follows one deterministic path:

1. Catalog lookup selects a first-party harness artifact entry.
2. The harness path table resolves the target root and artifact path for the selected harness and scope.
3. `buildProvisionPlan` creates a sorted, file-level copy plan from source file hashes. Plan output records the artifact id, kind, provision name, harness, scope, target root, target artifact path, source provenance, and per-file source/target paths with content hashes.
4. `prepareProvision` retains the exact source bytes, target hash facts, and same-key manifest expectation used by the plan; `previewFromPrepared` projects that prepared provision without writing.
5. Desired-state reconciliation combines provisions and authorized removals into one ordered aggregate. Immediately before each transition it rereads source, target, and same-key manifest state; unrelated manifest entries are preserved. Drift returns the stable `stale_prepared_reconciliation` error before that transition writes.
6. Apply writes only prepared bytes, removes only manifest-tracked unchanged files, and updates the latest manifest at `<targetRoot>/.ns-harness-artifacts-manifest.json`. Empty artifact directories may be removed; consumer directories and directories containing untracked files are retained.
7. Manifest entries are keyed as `<harness>:<scope>:<kind>:<artifactId>` and record per-file content hashes for later LBYL decisions.

The apply layer refuses to clobber target files classified as `locally-edited-conflict` unless the caller passes `force: true` (`ns skills install --force`). Stale-removal conflicts are never forced by descriptor activation. Before deletion, manifest key, harness, project scope, target root, artifact path, and every tracked file path must be coherent and strictly contained; malformed records return `unsafe_manifest_entry` and grant no deletion authority. Missing tracked files are safe.

## `ns skills` surface

The CLI wiring is intentionally thin over this package:

```text
ns skills list
ns skills path <skill> --harness <claude-code|codex|pi> [--scope project|user]
ns skills install <skill> --harness <claude-code|codex|pi> [--scope project|user] [--dry-run] [--force]
```

`list` shows first-party ns skills from the static catalog. `path` prints the resolved target root and artifact path. `install --dry-run` returns the same deterministic plan and decisions as apply, but performs no writes; plain `install` provisions and writes the manifest.

## Consumer seam

The `init` feature consumes this feature through `RealArtifactActivationGateway` and `RealArtifactProvisioningStatusGateway`, which call `prepareDeclaredArtifactActivation()` and `applyPreparedDeclaredArtifactActivation()`. Activation prepares the provision once and applies it into project-scope `claude-code`, `codex`, and `pi` harness roots using the shared apply path.

Declared extension activation and `ns update` share the SDK's canonical declared-descriptor loader and feed validated records to artifact discovery. Full activation reads project manifests for every supported harness, including deselected harnesses, and can report `removed` with `removed-source`, `deselected-harness`, `same-target-replacement`, or obsolete-file detail. Targeted reconcile preserves non-target and first-party entries; incomplete acquisition or descriptor discovery does not authorize cleanup of the failed source.
