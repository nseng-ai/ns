# ADR 0058: Repository-Neutral Activation and Caller-Independent User Extensions

## Status

Accepted

Supersedes ADR 0056's Active-harness gate, persisted harness selection, and automatic extension artifact provisioning. ADR 0056 remains the historical record of the design it accepted; its user lifecycle safety decisions are obsolete where they exist only to provision or remove descriptor-bundled harness artifacts. ADRs 0051, 0053, 0054, and 0055 otherwise remain in force.

## Context

ADR 0056 coupled three separate concerns: whether an extension contributes user commands and point definitions, which coding-agent harnesses a user or repository selects, and where extension-declared artifacts are copied. That coupling made ordinary command discovery depend on caller identity, persisted harness policy in both project and user configuration, and made extension lifecycle operations mutate harness-specific roots.

The coupling is unnecessary. Commands and point definitions are caller-independent ns surfaces. Project activation can generate repository instructions and create extension consumer directories without knowing which assistant will read them. Skills still need a harness-specific destination, but `ns skills` already has an explicit `--harness` argument and can provision one selected skill deliberately.

## Decision

### Repository-neutral project activation

`ns init` takes no harness selection and persists no harness selection. Project `ns.toml` has no `supported_harnesses` setting. Initialization writes repository-neutral ns configuration and instructions and creates consumer directories declared by active project extensions. Re-running activation reconciles those repository-owned effects only.

Generated repository instructions may use files understood by multiple assistants, but producing those files does not select, authorize, or persist a Harness. A repository remains usable by any caller that understands its checked-in instructions.

### Caller-independent user contributions

User extension commands and point definitions are available according to the layered source and package-admission rules in ADRs 0051, 0053, and 0054. Availability does not depend on `NS_HARNESS`, a persisted harness list, process ancestry, or harness detection.

User lifecycle administration remains available outside a repository. User scope still does not activate repository instructions, consumer directories, hooks, prompt installations, models, or extension-specific project settings. User point definitions may participate in the point catalog; point installations remain Project-owned.

### No automatic extension artifact provisioning

Extension descriptors do not declare bundled harness artifacts. `ns init`, `ns extension install`, `ns extension update`, and `ns extension uninstall` do not provision, reconcile, or remove skills, agents, extension bundles, or other files in harness roots. Extension lifecycle results therefore make no artifact-currentness claim.

Removal of automatic provisioning also removes the need for lifecycle-owned cross-root manifests, package-derived deletion authority, deselected-harness cleanup, and deferred reconciliation based on a persisted harness set. Existing files produced by an older ns version are not automatically deleted under this decision; users retain authority over them and may remove them explicitly.

### Explicit first-party skill provisioning

Harness-specific provisioning is retained only as an explicit `ns skills` operation. The caller selects a first-party ns skill and supplies `--harness <claude-code|codex|pi>` for `path` or `install`, plus `--scope project|user` where applicable. This explicit selection determines the destination for that operation only; it is not saved as repository or user policy.

The Harness, Harness artifact, Provision, and Skills vocabulary remains valid for this narrow surface. `HarnessId` remains a useful implementation type for validating the explicit `--harness` value. None of those terms imply extension-descriptor artifacts or automatic activation.

## Acceptance examples

- In a new Git repository, `ns init` succeeds without a harness argument and writes no `supported_harnesses` key.
- A user-installed extension's admitted commands and point definitions are visible from Pi, Claude Code, Codex, and a direct shell without `NS_HARNESS`.
- Installing or updating an extension that declares activation instructions and consumer directories updates project activation effects but writes nothing under `.claude/skills`, `.agents/skills`, or `.pi/skills`.
- `ns skills install objective --harness pi --scope user` provisions the selected first-party skill to Pi's user skill root; it does not persist `pi` in an ns configuration file.
- Uninstalling an extension does not inspect or delete harness-root files.

## Consequences

- Project and user configuration schemas no longer need `supported_harnesses` metadata.
- Pi and other callers no longer inject an Active harness identity for ns catalog composition.
- Command and point discovery have one caller-independent result for a given built-in, preinstalled, user, and project source inventory.
- Extension descriptors and author documentation no longer expose bundled-artifact declarations.
- Project activation remains useful across assistants because its durable effects are repository-neutral.
- Harness-specific filesystem writes are deliberate, visible `ns skills --harness` operations rather than extension lifecycle side effects.

## Considered Options

- **Keep `NS_HARNESS` only for user commands:** rejected because command semantics do not depend on the assistant that launched ns and direct-shell behavior should match harness behavior.
- **Keep persisted harness selection only for project activation:** rejected because repository instructions and consumer directories are repository effects, while skill destinations can be selected at the explicit provisioning call.
- **Automatically provision artifacts for every known harness:** rejected because extension lifecycle should not mutate unrelated harness roots and because explicit `ns skills --harness` expresses the user's intent directly.
- **Delete previously provisioned extension artifacts during migration:** rejected because the new lifecycle no longer has a current descriptor declaration or authority model for those files; automatic cleanup would recreate the unsafe coupling this decision removes.
