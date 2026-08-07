# harness-artifacts

The `harness-artifacts` feature of `@nseng-ai/ns` owns the catalog, path resolution, and
local materialization logic used by the explicit `ns skills` command family. Other packages
consume its retained contracts through the `@nseng-ai/ns/api` door; modules inside
`@nseng-ai/ns` import the feature directly.

It is not an extension-activation subsystem. Extension descriptors do not declare harness
artifacts, and `ns init` or `ns extension install|update|uninstall` never provisions,
reconciles, or removes files in harness roots.

## Domain vocabulary

- **Harness artifact**: an ns-owned first-party skill selected for an explicit provisioning
  operation.
- **Harness**: the destination assistant environment (`claude-code`, `codex`, or `pi`) named
  by `--harness` for one command. Do not use "platform" for this domain.
- **Provision**: the explicit act of materializing a selected first-party skill into the
  selected Harness root.
- **Skills**: the user-facing CLI noun for `ns skills ...`.

The underlying model still contains `HarnessId` and broader artifact-kind types for its
retained API and implementation history. The supported user behavior is narrower: only
first-party `skill` entries are listed or provisioned, and no Harness selection is persisted.

## Harness path table

`src/harness-paths.ts` defines `HARNESS_SPECS`: harness IDs, aliases, and user/project skill
roots. `normalizeHarnessId` accepts IDs and aliases case-insensitively after trimming;
`resolveHarnessArtifactPath` resolves skill destinations from the explicit Harness and scope.

Given `projectRoot`, `homeDir`, optional `env.CLAUDE_CONFIG_DIR`, and skill name
`<skillName>`:

| Harness id    | Aliases  | Scope     | Resolved root                                                                             | Resolved skill path                        |
| ------------- | -------- | --------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `claude-code` | `claude` | `project` | `<projectRoot>/.claude/skills`                                                            | `<projectRoot>/.claude/skills/<skillName>` |
| `claude-code` | `claude` | `user`    | `<CLAUDE_CONFIG_DIR>/skills` when set and non-blank; otherwise `<homeDir>/.claude/skills` | `<root>/<skillName>`                       |
| `codex`       | none     | `project` | `<projectRoot>/.agents/skills`                                                            | `<projectRoot>/.agents/skills/<skillName>` |
| `codex`       | none     | `user`    | `<homeDir>/.agents/skills`                                                                | `<homeDir>/.agents/skills/<skillName>`     |
| `pi`          | `pi-dev` | `project` | `<projectRoot>/.pi/skills`                                                                | `<projectRoot>/.pi/skills/<skillName>`     |
| `pi`          | `pi-dev` | `user`    | `<homeDir>/.pi/agent/skills`                                                              | `<homeDir>/.pi/agent/skills/<skillName>`   |

Adding another Harness remains a data addition to `HARNESS_SPECS`, with alias-normalization
and path-resolution tests. It does not add a persisted project or user setting.

## Explicit first-party skill provisioning

The first-party catalog lives in `src/first-party-catalog.ts` as
`NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG`. The current catalog contains the `objective`
skill (`objective-skill`) sourced from the ns package's first-party skill material.

Provisioning follows one deterministic, caller-requested path:

1. Catalog lookup selects the named first-party skill.
2. The command's explicit `--harness` and `--scope` resolve its target root and path.
3. `buildProvisionPlan` creates a sorted file-level copy plan from source hashes.
4. `prepareProvision` retains the exact source bytes and target facts; dry-run projects the
   prepared operation without writing.
5. Apply rechecks source and target state immediately before writing.
6. Apply writes only prepared bytes and records hashes in
   `<targetRoot>/.ns-harness-artifacts-manifest.json` for later explicit skill operations.

The apply layer refuses to clobber a locally edited target unless the caller passes
`--force`. Safety checks keep all tracked paths inside the selected root. These manifests
belong to explicit `ns skills` operations; extension lifecycle does not consult them.

## `ns skills` surface

```text
ns skills list
ns skills path <skill> --harness <claude-code|codex|pi> [--scope project|user]
ns skills install <skill> --harness <claude-code|codex|pi> [--scope project|user] [--dry-run] [--force]
```

`list` shows first-party ns skills from the static catalog. `path` prints the destination
selected by the explicit Harness and scope. `install --dry-run` returns the same plan and
decisions as apply without writing; plain `install` provisions the selected skill.

There is no implicit Harness, caller-identity gate, persisted Harness configuration, or
automatic extension artifact flow.
