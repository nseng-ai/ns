# ADR 0056: Harness-Aware User Extension Layer

## Status

Accepted

Refines the user extension scope of ADR 0051 and the user npm storage lifecycle of ADR 0055. ADR 0051's "user scope means command availability only" decision is superseded by the contribution matrix below; its user configuration file, byte-preserving edit, built-in reservation, and failure-isolation decisions remain accepted, as does ADR 0053's source-identity precedence.

## Context

ADRs 0051–0053 made user-installed extensions contribute commands machine-wide without repository activation. Extension descriptors also declare bundled skills, point definitions, instructions, and consumer directories. Project scope activates those artifacts into one repository; user scope had no way to provision the per-user artifact roots that agent harnesses read (`~/.claude/skills`, `~/.agents/skills`, `~/.pi/agent/skills`), and no way to say which harnesses a user actually runs.

Provisioning user artifacts for every known harness would write into directories the user never uses, and exposing user commands to every caller would let one machine-wide declaration change behavior in contexts that never opted in. ns also cannot detect which harness spawned it: an `ns` process looks the same under Claude Code, Codex, Pi, or a bare terminal. Project `ns.toml` already selects harnesses explicitly through top-level `supported_harnesses`; user scope needs the same explicit selection plus an explicit per-invocation harness identity.

## Decision

### Supported harnesses in the user configuration

The XDG user `ns.toml` accepts a top-level `supported_harnesses` array holding only the canonical harness IDs `claude-code`, `codex`, and `pi`. Aliases (for example `claude`) are invocation-time conveniences and are invalid in persisted lists. The list must be a non-empty string array; duplicates are tolerated and deduplicated. An invalid list is a source-labelled user-scope diagnostic and behaves as if no harness were selected. Lifecycle edits to `extensions` continue to preserve every other byte of the file, including `supported_harnesses` and unrelated content. Existing user configurations without `supported_harnesses` keep their declarations byte-intact but contribute nothing until the user opts in; ns never defaults the selection to all harnesses.

### Active harness identity

The Active harness is supplied explicitly through the `NS_HARNESS` environment variable of the ns invocation. Values are matched case-insensitively and invocation aliases normalize to canonical IDs. ns performs no harness sniffing.

The **User extension layer** is enabled for one invocation only when `NS_HARNESS` resolves to a canonical harness that is present in the user `supported_harnesses` list. Missing, blank, unknown, or unlisted identity disables the layer fail-closed. The gate is evaluated once per invocation and its decision feeds every user-scope contribution surface; command discovery and point discovery must not re-derive it independently.

Disabling the layer disables only User descriptor contributions. Built-in commands, preinstalled catalogs, Project descriptors, and Project activation are unaffected. User lifecycle administration (`ns extension install|list|update|uninstall --scope user`) is deliberately not gated: a user must be able to manage declarations from a bare terminal.

A missing or blank `NS_HARNESS` is the normal direct-shell state and is silent in catalog composition. An unknown `NS_HARNESS` value and a malformed `supported_harnesses` list are actionable misconfigurations and emit source-labelled diagnostics under the existing invocation-scoped classification. `extension list --scope user` reports the full gate decision either way.

### Harness identity injection responsibility

Only Pi has an ns-owned executable integration seam. Every repo-owned Pi→ns invocation path injects `NS_HARNESS=pi` into an explicitly copied per-invocation environment; no path mutates `process.env`. The injected identity wins over any inherited `NS_HARNESS` value, because an ns invocation launched from inside Pi is under Pi regardless of what the parent shell exported.

Claude Code and Codex remain explicit-shell integrations. Repo-owned examples and workflow commands that are genuinely owned by one of those harnesses invoke ns as `NS_HARNESS=claude-code ns …` or `NS_HARNESS=codex ns …`. Direct external callers carry the same responsibility; a caller that supplies no identity gets the fail-closed default. This ADR does not introduce a universal launcher for other harnesses.

### Contribution matrix

When the User extension layer is enabled, User descriptors contribute:

- **Commands**, at the existing `user` catalog level of ADR 0051/0053 (above preinstalled, below project, built-ins reserved).
- **Point definitions**, layered as built-in fallback < enabled User < Project. Project definitions replace User definitions by full point ID. Duplicate point IDs within one scope exclude every conflicting definition at that scope and emit deterministic source-labelled diagnostics.
- **Bundled skills**, provisioned by user lifecycle operations into the user-scope skill root of every configured supported harness (honoring `CLAUDE_CONFIG_DIR` and the XDG/home path contracts).

Everything else a descriptor can declare stays dormant at user scope and is reported as dormant: instructions, consumer directories, hooks, prompt installations, repository instruction files, models, and extension-specific settings are never activated or written from user scope. Point **installations** remain Project-owned; a user `[points]` table or prompt path has no runtime meaning. Project declaration and activation remain the only way to apply repository effects.

### Provisioning and deletion authority

User lifecycle operations provision descriptor-bundled skills into every configured harness root using the shared artifact reconciliation engine parameterized by an explicit scope, harness selection, trusted path context, and package deletion authority. Manifest-carried facts are validated, never trusted: an existing ownership-manifest entry may be retained, replaced, or removed only when its scope equals the requested reconciliation scope, its harness matches the inspected root, its target and manifest paths sit under the trusted root, its key agrees with harness/scope/kind/identity, the operating package is authorized for every removal reason (including same-target replacement and deselected harnesses), and tracked hashes plus safe-removal inspection authorize deletion. A malformed or mismatched entry blocks mutation with a diagnostic; it is never rewritten into a cross-scope provision or silently orphaned. Targeted per-extension operations never remove or rewrite entries owned by unrelated packages, and there is no `--force` override.

Cross-root filesystem application is not atomic. Preflight is strict before mutation, apply rechecks stale facts, failures report every completed transition plus retained paths, and retries are idempotent.

### Uninstall contract

`ns extension uninstall --scope user` distinguishes four cases:

1. **Package identity available.** Targeted artifact removal is prepared and validated before `ns.toml` changes. Edited owned files, unsafe or malformed manifest facts, path/scope mismatches, ambiguous ownership, or any other preflight blocker leaves the declaration and all artifacts unchanged.
2. **Declared local source or descriptor has disappeared and package identity cannot be established from the source.** The declaration is removed but artifacts are retained. The result reports an explicit `artifacts-retained-package-identity-unavailable` outcome with the retained-artifact uncertainty and manual-recovery guidance. Deletion authority is never inferred from manifests alone and no new durable ownership index is introduced. This is a deliberate exception to preflight-before-declaration: no deletion is authorized, so removing the dead declaration cannot orphan anything ns was entitled to delete.
3. **Preflight succeeded.** Declaration authority is removed first (ADR 0055's compare-and-write guard), then targeted artifact removals apply, then lifecycle-owned npm bytes are cleaned where applicable. Any later failure reports declaration completion, every completed artifact transition, retained paths, acquisition/cleanup state, and safe retry guidance.
4. **Declaration already absent.** A supplied source argument does not broaden deletion authority. Only cleanup supported by the same validated lifecycle identity and ownership rules runs.

### Reconciliation timing

Hand-editing `supported_harnesses` never triggers whole-machine reconciliation. Each lifecycle operation reconciles only its targeted extension against the harness set configured at that moment; adding or removing a harness by hand creates a drift window that closes per extension on its next lifecycle operation. `extension list --scope user` is read-only: it reports the gate decision, configured harnesses, planned/orphaned/drifted facts it can safely inspect, and the deferred-reconciliation rule, without mutating state and without claiming precision its evidence cannot support. Successful installation is likewise not reported as current command availability; contribution visibility derives from the same gate decision the catalogs use.

## Acceptance examples

- `NS_HARNESS=pi` with user `supported_harnesses = ["pi"]`: user commands and point definitions appear; install provisions bundled skills into the Pi user skill root (and every other configured root).
- Same configuration, `NS_HARNESS` unset or `NS_HARNESS=browser`: no user commands or definitions; built-ins and project extensions unchanged; `extension list --scope user` explains the disabled layer.
- One extension with `supported_harnesses = ["claude-code", "codex", "pi"]`: bundled skills are provisioned into all three user roots with per-root ownership manifests.
- Package A declaring skill `review` cannot remove package B's provisioned `review`; the collision is a blocking diagnostic.
- A provisioned skill file edited by hand blocks uninstall of an identifiable package before `ns.toml` changes.
- A declared local descriptor directory that no longer exists uninstalls to declaration removal plus retained artifacts and an explicit identity-unavailable report.

## Consequences

- Command and point catalogs consume one shared effective user-layer selection; the gate, user config parsing, and ADR 0053 suppression are computed once.
- The canonical harness vocabulary must be shared between SDK catalog/config code and ns provisioning through a narrow internal workspace boundary rather than duplicated.
- Pi's CLI bridge carries harness identity as an explicit invocation dependency; other harnesses' identity lives in their owned shell surfaces and external caller documentation.
- User artifact reconciliation reuses the Project engine only after that engine is parameterized by explicit scope/authority instead of manifest-trusted facts.
- Users who never set `NS_HARNESS` see no user extension contributions even after a successful install; lifecycle and list output must make that state legible rather than reporting availability.

## Considered Options

- **Detect the harness automatically (parent process, TTY, harness-specific env):** rejected as unreliable sniffing that turns misdetection into silent cross-harness contribution changes.
- **Default `supported_harnesses` to all known harnesses:** rejected because it writes artifacts into roots the user never uses and widens deletion authority without explicit intent.
- **Gate lifecycle administration by the Active harness:** rejected because users must manage machine state from a bare terminal, where identity is legitimately absent.
- **Whole-machine reconciliation when `supported_harnesses` changes:** rejected because a hand edit would trigger mass deletion/provisioning without a targeted operation or its preflight; per-extension reconciliation keeps authority scoped and retryable.
- **Manifest-derived deletion for missing local sources:** rejected because manifests record what was written, not current authority; deleting from them alone risks removing artifacts a different package now legitimately owns.
- **A `--force` escape hatch for blocked preflight:** rejected because every known blocker signals either user-authored changes or corrupt state, and both need explicit human resolution rather than broadened authority.
