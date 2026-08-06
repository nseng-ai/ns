# Centralize Layered Project Configuration

## Thesis

ns configuration access becomes one deep, typed project-configuration module. Callers provide invocation scope — such as `cwd`, environment, and active harness — and consume effective typed values; they do not discover roots, construct `ns.toml` paths, read TOML, bind Node filesystem adapters, or implement precedence. Today that access is inconsistent: `ProjectConfigGateway`, `nodeProjectConfigGateway`, `loadProjectConfig()`, `parseProjectConfigToml()`, typed `SettingsSchema`, and point-catalog logic live together in `ts/packages/public/sdk/src/project-config/points.ts` as a low-level filesystem probe that requires callers to supply `repoRoot` and file-relative paths, while production consumers variously use that gateway, read `ns.toml` directly, discover roots through Git solely for configuration, or assume `cwd` is the root. Consolidation lands behavior-preservingly before any new configuration layer is activated: accepted ADR 0056 keeps user-level models, extension settings, hooks, and prompt installations dormant, and activating them requires an explicit superseding or refining ADR — never a refactor side effect.

## Scope

- Define the external effective-config interface and demote or rename the current low-level filesystem `ProjectConfigGateway` role as an internal adapter dependency if needed.
- Make project/config-root discovery part of the module rather than each consumer.
- Preserve typed `SettingsSchema`, shared parsing, points, and source-aware diagnostics where they remain useful.
- Produce one invocation-scoped configuration snapshot/capability for ns CLI and Pi composition roots instead of repeated reads and root probes.
- Migrate command-source discovery, point/descriptor discovery, model policy, Reviews, Slots, harness configuration, and other production direct readers to the shared seam.
- Separate effective reads from explicit source mutation; preserve byte-preserving edits, optimistic stale-state checks, path containment, and user/project scope authority.
- Add provenance so diagnostics and inspection can identify the winning source.
- Add mechanical enforcement against direct production `ns.toml` access outside the config implementation/mutation adapters.
- After consolidation, write an ADR that settles `ns.local.toml` and approved user-settings semantics before enabling them.
- Implement only the layer families approved by that ADR.

## Non-Goals

- No behavior-changing local/user layer during the initial consolidation.
- No generic TOML deep merge; setting families own merge/replacement semantics.
- No user hooks or prompt installations without an explicit security/path decision.
- No compatibility aliases or dual canonical config access paths.
- No requirement that every arbitrary project file use this module; scope is ns configuration.
- No broad Git gateway cleanup unrelated to configuration scope.

## Completion Criteria

- Production workflows no longer directly construct/read `ns.toml` or independently discover a root solely for config.
- Nested-directory invocation resolves the same effective project config as root invocation.
- Command source inventory, point definitions/installations, and typed settings consume one coherent invocation scope.
- Effective reads and source-specific mutation are distinct interfaces.
- Existing project-only behavior remains compatible through the consolidation phase.
- Source-labelled diagnostics/provenance exist.
- An architecture guard rejects new direct accesses outside an explicit allowlist.
- A new ADR refines/supersedes ADR 0056 before `ns.local.toml` or user settings become active.
- Approved layering behavior and docs/tests land after that ADR.

## Assumptions and Risks

**Assumptions:**

- `parseProjectConfigToml` and `SettingsSchema` are reusable foundations rather than throwaway code.
- CLI preparation and per-command Pi contexts provide sufficient scope to establish configuration once per invocation.
- Existing setting families can define explicit merge/replacement policies without a universal deep merge.

**Risks:**

- Extension declarations influence which schemas/point definitions exist, creating ordering or cycle pressure.
- User settings can silently broaden behavior or execute repository-affecting content unless source permissions are explicit.
- Relative paths need source-specific bases; flattening layers can resolve paths incorrectly.
- Consolidating reads and adding layers in one step would obscure regressions.
- Broad migration can recreate shallow pass-through wrappers or duplicate canonical doors.

## Open Questions

- Final external interface name and whether the current filesystem contract is renamed or hidden internally.
- Exact project-root discovery policy outside Git repositories.
- Cache/snapshot lifetime and invalidation within long-lived Pi sessions.
- Per-family layer permissions and merge rules.
- Whether user model settings are harness-gated or globally effective for ns invocations.
- `ns.local.toml` source-control, secret, path, mutation, and inspection semantics.
- How extension-provided settings schemas become available without circular discovery.
- Failure policy for malformed lower-precedence sources when a higher layer supplies a value.
