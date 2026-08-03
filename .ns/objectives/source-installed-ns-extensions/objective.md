# Source-Installed ns Extensions

## Thesis

Make ns extension packages installable once at user scope so their complete command surfaces are available in every local repository without repeating machine-specific declarations in each project's `ns.toml`. Add an extensions-only user configuration at `$XDG_CONFIG_HOME/ns/ns.toml` (default `$HOME/.config/ns/ns.toml`) and extend the existing extension lifecycle commands with explicit user scope.

Built-in host commands remain reserved and cannot be overridden by any extension. Among extensions, project declarations take precedence over user declarations, while collisions within one scope are errors. User-scoped installation manages declarations and acquisition only: it must not activate instructions, consumer directories, bundled artifacts, points, or other repository effects.

## Scope

- Load top-level `extensions` from the user configuration at `$XDG_CONFIG_HOME/ns/ns.toml`, falling back to `$HOME/.config/ns/ns.toml` under the XDG rules already used in this repository.
- Preserve project `ns.toml` as the higher-precedence extension scope.
- Reserve built-in host command paths: any user or project extension contribution that collides with a built-in is an error rather than an override.
- Allow project extension command paths to override user extension command paths; reject same-scope command collisions deterministically.
- Extend `ns extension install`, `list`, `update`, and `uninstall` with explicit user scope, one whole extension package per lifecycle invocation.
- Support both local package paths and explicit `npm:` specs at user scope. Resolve local packages in place and persist canonical absolute paths; acquire npm packages in user-scoped managed storage.
- Treat extension membership atomically by package: installing an extension exposes every command in its descriptor rather than selecting individual commands.
- Make the eight general ns extension packages installable at user scope from this source checkout: Branch Context, Flow, Handoffs, Herdr, Objectives, PR Feedback, Reviews, and Slots.
- Keep Skill Exposure project-local; it is not installed implicitly or managed specially by `just install-ns`.
- Preserve the existing source shim behavior: inside an ns checkout, that checkout supplies the CLI; elsewhere, the shim's canonical checkout does.
- Keep the published `@nseng-ai/ns` distribution behavior isolated from source-checkout-specific extension membership.

## Non-Goals

- Changing `just install-ns`; it continues to install only the source-backed ns executable shim and does not edit user configuration.
- Bulk-importing a project's extension list into user configuration; user extensions are installed explicitly one package at a time.
- Loading user-level supported harnesses, points, models, extension-specific settings tables, or other `ns.toml` fields.
- Automatically activating user extensions into the current or every repository.
- Writing project instructions, consumer directories, bundled artifacts, or harness artifacts during user-scope lifecycle operations.
- Adding a project denylist or other mechanism to suppress an unrelated user extension in the first release.
- Making the incubating extension set part of the published checkout-free `@nseng-ai/ns` package.
- Allowing extensions to replace built-in host commands.

## Completion Criteria

- `$XDG_CONFIG_HOME/ns/ns.toml`, with the documented `$HOME/.config/ns/ns.toml` fallback, is recognized as an extensions-only user configuration source.
- `ns extension install|list|update|uninstall --scope user` manages one local or npm extension declaration at a time, with local paths persisted canonically and npm bytes held in user-scoped managed storage.
- A user-installed extension's entire descriptor command surface is available from unrelated repositories without adding that extension to their project `ns.toml`.
- Project extension contributions override matching user extension command paths, while same-scope collisions produce deterministic errors.
- Any extension collision with a built-in host command path produces an error at either user or project scope.
- Merely discovering or invoking user-installed extension commands does not write activation files or config into the current repository.
- The eight intended general ns extension packages can be installed individually from this checkout at user scope, while Skill Exposure remains absent unless a project declares it.
- Existing project-scope extension lifecycle behavior and source-shim checkout precedence remain intact.
- The ordinary published `@nseng-ai/ns` CLI remains free of new runtime dependencies on incubating extension packages and retains its existing default command inventory.

## Assumptions and Risks

Assumptions:

- Extension command availability is useful independently of descriptor activation; repositories that need instructions, bundled artifacts, points, or consumer directories will continue to declare and activate the extension at project scope.
- Explicit per-package user installation is clearer and safer than having `just install-ns` silently mutate global configuration.
- Normalized source identity and command-path precedence are sufficient for layering user and project declarations without a first-release suppression mechanism.
- The existing extension acquisition and descriptor-loader seams can be parameterized by scope rather than duplicated.

Risks:

- **Partial descriptor semantics.** A user-installed extension contributes commands but not its activation metadata. Documentation and diagnostics must make this distinction explicit so users do not mistake availability for project activation. ADR 0051 settles that user lifecycle operations bypass project activation entirely.
- **Collision ambiguity (contract settled).** ADR 0051 reserves built-ins and defines command-path precedence; ADR 0053 supersedes its manifest-identity rule with normalized source identity. Matching Project sources suppress matching User sources before loading, while different sources remain independent and compose through command-path precedence.
- **Machine-local path drift.** Canonical absolute local paths become stale when a checkout moves or disappears. User-scope list/update diagnostics must expose acquisition or descriptor failures without breaking unrelated built-ins and extensions.
- **Config corruption or overreach.** Lifecycle edits must preserve unrelated user-file content even though only `extensions` is consumed initially, and must never reinterpret unsupported user-level fields as active settings.
- **Managed npm boundary (resolved).** ADR 0055 places isolated private npm projects under `$XDG_DATA_HOME/ns/extensions/npm/<package-name>/`, distinct from project `.ns/managed-extensions`; cleanup owns only one package project and may prune only an empty package-scope directory.
- **Public dependency leakage.** Implementing source-checkout convenience by importing incubating extensions into public `@nseng-ai/ns` would violate disposition closure; the design must keep extension packages dynamically acquired or otherwise outside the public package's runtime dependency graph.

## Open Questions

- Which concise user-facing labels best express the settled distinction between a user-available command extension and a project-declared, activated extension without adding a separate lifecycle state?

## Closure

**Outcome: completed.** All roadmap rows and completion criteria are satisfied. User-scope extension discovery and lifecycle operations support canonical local paths and managed `npm:` sources through the XDG configuration and data roots; catalog composition preserves reserved built-ins, deterministic same-scope collision errors, project-over-user precedence, and atomic same-package project replacement. Integration evidence proves complete command surfaces for the eight intended source extensions from unrelated non-Git directories, no repository activation effects, Skill Exposure's project-local boundary, source-shim checkout precedence, and isolation of the packed `@nseng-ai/ns` distribution.

The final documentation pass resolves the remaining terminology question with **user-scoped command availability** and **project-scoped activation**. These are scope effects, not extension types or lifecycle states. The durable contract is graduated to ADR 0051, ADR 0052, `ts/packages/public/ns/README.md`, the SDK README and author/reference documentation, and `ts/packages/public/sdk/CONTEXT.md`; this closed Objective is not their sole source.

Material PR evidence spans the submitted implementation stack, culminating in PR #4051, “Prove source-installed extension command surfaces across repositories,” which adds whole-extension, host-lifecycle, source-shim, and packed-distribution proof. The final documentation reconciliation and this closure remain local branch changes at closure time.

Parked non-goals remain deliberately outside the completed outcome: user-extension suppression, bulk installation, user-level inheritance of other configuration, user-scope activation, and bundling incubating extensions into the published CLI. They require fresh product direction rather than reopening this Objective by default.
