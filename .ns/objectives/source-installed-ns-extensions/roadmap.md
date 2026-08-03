# Roadmap

## Work

- [x] Settle the layered extension-resolution contract and user configuration model. ADR 0051 specifies the single XDG config path, extensions-only interpretation, reserved built-ins, command-path precedence, failure isolation, and command availability versus project activation; ADR 0053 supersedes its manifest-identity rule with normalized source identity and pre-load Project-over-User replacement for matching sources.
- [x] Add user-scope extension discovery and catalog composition. Load and validate user descriptors separately from project descriptors; reserve built-in paths; suppress User declarations when a Project declaration establishes the same normalized source identity; then merge preinstalled/user/project command paths while preserving lazy selected-command loading and actionable source-labelled diagnostics. Starting seams: `ts/packages/public/sdk/src/extensions/registry.ts`, `command-registry.ts`, `declared-descriptors.ts`, and the existing `LoadNsCommandCatalogOptions.homeDir`/`env` inputs.
- [ ] Extend extension lifecycle operations with `--scope user`. Keep project as the default; split user orchestration from `prepareExtensionLifecycle` and `prepareNsActivation`, reuse the byte-preserving `ns-toml-extensions-edit.ts` planners, route declarations to the user file, canonicalize local paths, and preserve unrelated user configuration bytes.
- [ ] Implement user-scoped npm acquisition and cleanup. Choose and document an XDG-owned managed storage root, keep local sources in place, retain `--ignore-scripts` and trust diagnostics, and ensure updates and uninstalls touch only lifecycle-owned bytes.
- [ ] Prove whole-extension source installation across repositories. Install Branch Context, Flow, Handoffs, Herdr, Objectives, PR Feedback, Reviews, and Slots individually from the ns checkout; verify their complete command surfaces in an unrelated repository; verify Skill Exposure remains project-local and no project activation files are written. Evidence includes targeted scenario/integration coverage and relevant repository checks.
- [ ] Reconcile user-facing extension documentation and configuration vocabulary. Document user versus project scope, XDG location, precedence and collision rules, local/npm source behavior, command-only user semantics, failure recovery for moved checkouts, and the unchanged role of `just install-ns`.

## Parked

- Project-level suppression or denylisting of user-installed extensions.
- Bulk installation of all project-declared extensions into user scope.
- Inheriting points, models, supported harnesses, extension-specific settings, or other configuration from the user file.
- User-scope activation of instructions, consumer directories, bundled artifacts, or harness artifacts.
- Shipping the incubating extension set inside the published checkout-free `@nseng-ai/ns` distribution.
