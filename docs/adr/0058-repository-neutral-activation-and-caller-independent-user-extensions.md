# ADR 0058: Repository-Neutral Activation and Caller-Independent User Extensions

## Status

Accepted

Supersedes ADR 0056's Active-harness gate, persisted harness selection, extension-artifact provisioning, and ns-owned skill lifecycle. ADR 0056 remains the historical record of the design it accepted. ADRs 0051, 0053, 0054, and 0055 otherwise remain in force.

This decision also removes the skill-management implementation assumptions named by ADR 0046's atomic cutover. ADR 0046's support dispositions, owner-nested canonical topology, flat identities, and dependency-closure convention remain accepted. Runtime Skill-Backed Commands governed by ADR 0048 remain accepted.

## Context

ADR 0056 coupled three separate concerns: whether an extension contributes user commands and Point definitions, which coding-agent harnesses a user or repository selects, and where ns copies extension-declared artifacts. That coupling made ordinary command discovery depend on caller identity, persisted harness policy in project and user configuration, and made extension lifecycle operations mutate harness-specific roots.

The coupling is unnecessary. Commands and Point definitions are caller-independent ns surfaces. Project activation can generate repository instructions and create extension consumer directories without knowing which assistant will read them. Skills have a separate ecosystem and lifecycle: the external `npx skills` tool already owns acquisition, installed state, updates, removal, and `skills-lock.json`.

The repository also has two distinct skill concerns that do not require an ns management layer. It directly maintains its checked-in first-party canonical skill sources and flat Harness Overlays, together with skill frontmatter, Codex sidecars, and Pi exclusions. At runtime, Skill-Backed Commands can locate and load required skill instructions without making ns the installer, reconciler, or catalog owner for those skills.

Keeping an ns skill-management surface would duplicate the external lifecycle and require catalogs, provisioning APIs, ownership manifests, and reconciliation rules solely to copy repository content into harness roots. Automatic extension artifacts have the same problem: extension lifecycle would retain authority over unrelated harness files even though extension activation itself is repository-neutral.

## Decision

### Repository-neutral project activation

`ns init` takes no harness selection and persists no harness selection. Project `ns.toml` has no `supported_harnesses` setting. Initialization writes repository-neutral ns configuration and instructions and creates consumer directories declared by active project extensions. Re-running activation reconciles only those repository-owned activation effects.

Generated repository instructions may use files understood by multiple assistants, but producing those files does not select, authorize, or persist a Harness. A repository remains usable by any caller that understands its checked-in instructions.

### Caller-independent user extensions

User extension commands and Point definitions are available according to the layered source and package-admission rules in ADRs 0051, 0053, and 0054. Availability does not depend on `NS_HARNESS`, a persisted harness list, process ancestry, or harness detection. Pi and other callers do not inject an Active harness identity for ns catalog composition.

User lifecycle administration remains available outside a repository. User scope still does not activate repository instructions, consumer directories, hooks, prompt installations, models, or extension-specific project settings. User Point definitions may participate in the Point catalog; Point installations remain Project-owned.

### Extension lifecycle has no automatic artifacts

Extension descriptors do not declare bundled harness artifacts. `ns init` and `ns extension install|update|uninstall` do not provision, reconcile, update, or remove skills, agents, extension bundles, or other files in harness roots. Extension lifecycle results make no artifact-currentness claim.

The extension lifecycle itself remains: `ns extension install`, `ns extension list`, `ns extension update`, and `ns extension uninstall` continue to manage extension declarations and extension-owned package bytes under the rules of ADRs 0051–0055. In particular, `ns extension update` remains the update operation for extensions.

Removing automatic artifacts also removes lifecycle-owned cross-root manifests, package-derived deletion authority, deselected-harness cleanup, and deferred artifact reconciliation. Files provisioned by older ns versions remain untouched. Existing `.ns-harness-artifacts-manifest.json` files also remain untouched: ns neither migrates nor interprets them as current authority, and users may remove legacy files explicitly.

### ns does not manage skills

ns provides no explicit skill provisioning, installation, update, removal, path, listing, reconciliation, catalog, ownership-manifest, or management API. This absence applies to CLI commands, exported programmatic APIs, extension descriptors, and internal lifecycle services; there is no ns-owned replacement registry or harness-artifact catalog.

The external `npx skills` workflow directly owns skill acquisition, installation, updates, removal, installed-state lifecycle, and `skills-lock.json`. Users invoke that tool directly and accept its destination, lifecycle, and lock semantics. ns does not wrap its operations in an ns lifecycle or reconcile its results.

This repository directly maintains its repository-owned skill surfaces as ordinary checked-in files:

- owner-nested canonical first-party skills under the ADR 0046 topology;
- flat Harness Overlays;
- skill frontmatter and invocation metadata;
- Codex sidecars; and
- Pi exclusions.

Those surfaces are changed directly in the same repository change that requires them. They are not generated or reconciled by ns, and they do not constitute an ns skill catalog or provisioning API.

Runtime Skill-Backed Commands remain. They may resolve and load required checked-in or externally installed skill instructions according to their runtime contract and fail closed when required instructions are unavailable. Runtime invocation does not grant ns lifecycle ownership of a skill, its installation, or its lock entry.

### Removed commands have no compatibility surface

The `ns skills` command group, the top-level `ns update` command, and the `ns skill-exposure` command group are removed. Invoking any of those paths produces the CLI's ordinary unknown-command behavior.

There are no aliases, forwarding shims, deprecation shims, hidden compatibility commands, or programmatic compatibility APIs for these removed surfaces. `ns extension update` is not removed or renamed.

## Acceptance examples

- In a new Git repository, `ns init` succeeds without a harness argument and writes no `supported_harnesses` key.
- A user-installed extension's admitted commands and Point definitions are visible from Pi, Claude Code, Codex, and a direct shell without `NS_HARNESS`.
- Installing or updating an extension that has activation instructions and consumer directories updates project activation effects but writes nothing under `.claude/skills`, `.agents/skills`, `.pi/skills`, or user-level harness roots.
- `npx skills add nseng-ai/ns --skill objective --full-depth` uses the external skill lifecycle and its lock state; ns does not reproduce, wrap, or reconcile that operation.
- A repository change to a first-party skill updates the canonical source and any affected checked-in overlays, frontmatter, Codex sidecars, or Pi exclusions directly.
- A Skill-Backed Command can load its required skill at runtime and fail closed if it is unavailable without exposing an ns skill-installation API.
- `ns skills`, `ns update`, and `ns skill-exposure` fail as unknown commands, while `ns extension update` continues to update extensions.
- Upgrading ns does not delete or modify files provisioned by an older version and does not modify an existing `.ns-harness-artifacts-manifest.json`.

## Consequences

- Project and user configuration schemas no longer need `supported_harnesses` metadata.
- Command and Point discovery have one caller-independent result for a given built-in, preinstalled, user, and project source inventory.
- Project activation remains useful across assistants because its durable effects are repository-neutral.
- Extension descriptors and lifecycle documentation no longer expose or promise bundled harness artifacts.
- Skill lifecycle and lock ownership have one direct external owner, `npx skills`, rather than overlapping ns and external management paths.
- Repository-owned canonical skills, overlays, metadata, sidecars, and exclusions require deliberate checked-in maintenance rather than generated reconciliation.
- Runtime Skill-Backed Commands remain available, but installation problems are runtime precondition failures rather than triggers for implicit provisioning.
- Users with legacy provisioned files or manifests receive no automatic cleanup. This avoids unsafe deletion but leaves explicit manual cleanup to the user.
- Removal is intentionally breaking: scripts or callers using the deleted commands receive ordinary unknown-command errors and must move skill lifecycle operations to `npx skills`; extension update callers continue to use `ns extension update`.

## Considered Options

- **Keep `NS_HARNESS` only for user commands:** rejected because command semantics do not depend on the assistant that launched ns, and direct-shell behavior should match harness behavior.
- **Keep persisted harness selection only for project activation:** rejected because repository instructions and consumer directories are repository effects and do not require a selected harness.
- **Automatically provision extension artifacts for every known harness:** rejected because extension lifecycle should not mutate unrelated harness roots and should not claim ownership of another tool's installed state.
- **Retain `ns skills` as a wrapper around `npx skills`:** rejected because a wrapper would preserve a second public management surface, blur lifecycle and lock ownership, and invite ns-specific reconciliation semantics.
- **Retain an ns first-party catalog or programmatic provisioning API without CLI commands:** rejected because hidden catalog and API ownership would preserve the same duplicated authority and maintenance burden.
- **Generate repository overlays and invocation metadata from canonical skills:** rejected because these are repository-owned checked-in surfaces with deliberate harness-specific policy; they are maintained directly rather than through an ns reconciliation system.
- **Remove runtime Skill-Backed Commands together with skill management:** rejected because loading required workflow instructions at command runtime is independent of acquiring, installing, updating, or reconciling skills.
- **Keep compatibility shims for removed command paths:** rejected because shims would imply continuing ownership, make unknown-command behavior inconsistent, and prolong a pre-launch contract that is intentionally removed.
- **Delete previously provisioned files or manifests during migration:** rejected because ns no longer has current ownership evidence or deletion authority for those files; automatic cleanup would recreate the unsafe coupling this decision removes.
