# Roadmap

## Work

- [x] Settle the layered extension-resolution contract and user configuration model. ADR 0051 specifies the single XDG config path, extensions-only interpretation, reserved built-ins, command-path precedence, failure isolation, and command availability versus project activation; ADR 0053 supersedes its manifest-identity rule with normalized source identity and pre-load Project-over-User replacement for matching sources.
- [x] Add user-scope extension discovery and package-atomic catalog composition. Load and validate User descriptors separately from Project descriptors; preserve normalized-source suppression from ADR 0053; reserve Built-in paths; then admit complete Preinstalled/User/Project package contributions with whole-package precedence, same-level rejection, descriptor-level requirements, and deterministic cycle-aware dependency evaluation. Flatten commands only from admitted packages while preserving lazy selected-command loading and actionable source-labelled diagnostics.
- [x] Extend extension lifecycle operations with `--scope user` and honest binary availability. Project remains the default. User install prospectively evaluates the exact planned declaration set and writes only when the requested package is completely admitted; list retains rejected declarations as unavailable; update rejects unavailable packages without writing; uninstall remains a recovery path independent of admission. User config replacement uses a synced sibling temporary file, best-effort final prepared-state recheck, rename, and directory sync, and rejects symlink-backed config.
- [x] Implement user-scoped npm acquisition and cleanup. ADR 0055 fixes isolated private projects under `$XDG_DATA_HOME/ns/extensions/npm/<package-name>/`; local sources remain in place, npm lifecycle scripts remain disabled, install rollback removes only bytes newly acquired by that invocation, and declaration-first uninstall touches only lifecycle-owned package bytes.
- [ ] Prove whole-extension source installation across repositories. Install Branch Context, Flow, Handoffs, Herdr, Objectives, PR Feedback, Reviews, and Slots individually from the ns checkout; verify their complete command surfaces in an unrelated repository; verify Skill Exposure remains project-local and no project activation files are written. Evidence includes targeted scenario/integration coverage and relevant repository checks.
- [ ] Reconcile user-facing extension documentation and configuration vocabulary. Document user versus project scope, XDG location, precedence and collision rules, local/npm source behavior, command-only user semantics, failure recovery for moved checkouts, and the unchanged role of `just install-ns`.

## Parked

- Project-level suppression or denylisting of user-installed extensions.
- Bulk installation of all project-declared extensions into user scope.
- Inheriting points, models, supported harnesses, extension-specific settings, or other configuration from the user file.
- User-scope activation of instructions, consumer directories, bundled artifacts, or harness artifacts.
- Shipping the incubating extension set inside the published checkout-free `@nseng-ai/ns` distribution.
