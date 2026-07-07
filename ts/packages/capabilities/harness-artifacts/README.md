# @nseng-ai/harness-artifacts

`@nseng-ai/harness-artifacts` owns the shared catalog, path-table, provision-plan, and local materialization logic for ns-owned harness artifacts.

This package is the reusable substrate behind the `ns skills` command family and the `@nseng-ai/ns-init` SkillMaterializer seam.

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
4. `previewHarnessArtifactProvision` builds the same plan and file decisions without writing anything.
5. `applyHarnessArtifactProvision` applies the plan by copying source text files, then writes the install manifest at `<targetRoot>/.ns-harness-artifacts-manifest.json`.
6. Manifest entries are keyed as `<harness>:<scope>:<kind>:<artifactId>` and record per-file content hashes for later LBYL decisions.

The apply layer refuses to clobber target files classified as `locally-edited-conflict` unless the caller passes `force: true` (`ns skills install --force`). Previously managed files whose current hash still matches the manifest can be overwritten by a newer plan; files already matching the source are `unchanged`.

## `ns skills` surface

The CLI wiring is intentionally thin over this package:

```text
ns skills list
ns skills path <skill> --harness <claude-code|codex|pi> [--scope project|user]
ns skills install <skill> --harness <claude-code|codex|pi> [--scope project|user] [--dry-run] [--force]
```

`list` shows first-party ns skills from the static catalog. `path` prints the resolved target root and artifact path. `install --dry-run` returns the same deterministic plan and decisions as apply, but performs no writes; plain `install` provisions and writes the manifest.

## Consumer seam

`@nseng-ai/ns-init` consumes this package through `RealSkillMaterializer`, an implementation of ns-init's existing `SkillMaterializer` gateway that is a thin adapter over `provisionFirstPartySkill()`. The deep operation resolves the first-party catalog source root, prepares the provision once, and applies it into project-scope `claude-code`, `codex`, and `pi` harness roots using the shared apply path.

Deferred breadth such as reconcile, extension-carried catalogs, AREG re-platforming, uninstall, and stale-after-upgrade behavior is tracked in the `skill-management-subsystem` umbrella objective, not in this steelthread package README.
