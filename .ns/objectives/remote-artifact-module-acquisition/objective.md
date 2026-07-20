---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; graduated 2026-07-07 from the parked "remote acquisition sources for artifact-bearing modules" row (a user decision, against the keep-parked recommendation). Owns the first-party fetch path for artifact-bearing npm modules and version-resolution-for-fetched-modules; the umbrella coordinates the reusable-subsystem ambition and remaining deferred breadth.
---

# Remote Acquisition of Artifact-Bearing Modules

## Thesis

Give ns a first-party way to **acquire** artifact-bearing extension modules from remote sources, so a project can declare "I want these extensions" and have ns fetch and provision them — instead of every module having to arrive vendored in the checkout. This landed: declared `ns.toml` `extensions = [...]` specs (`npm:pkg[@ver]` or local paths) are acquired into the managed root and flow through descriptor-based discovery and activation reconciliation; acquisition ends where the reconcile/activation core begins.

The design starting point was pi's debugged update mechanism (see `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`; that Objective is now closed): a uniform source-spec grammar — `npm:pkg@version`, `git:host/user/repo@ref`, local paths — with its pinning semantics (pinned npm versions stable/repaired in place; floating specs refreshed; git refs, when they ship, reconciled *to the ref*, not past it). This record also owns **version resolution for fetched modules**: what "update this extension" means per source kind.

**Command-surface note (2026-07-12 rebaseline):** this record's 2026-07-07 pi-verbatim `ns update` composition contract (`--extensions`/`--all`/`--self`) was implemented and then **superseded on trunk** by the customer-facing `ns extension` lifecycle group (`ns extension install|update|uninstall`), designed and owned by the `ship-objectives-to-customers` Objective (its 2026-07-09 README-driven design). Bare `ns update` is now a reserved self-update-only surface that errors `self-update-not-implemented` and points at `ns extension update <source>`; `ns update --extensions` is a rejected retired flag with explicit test coverage. The acquisition mechanics, storage model, grammar, and pinning semantics this record decided and built remain the substrate under the new verbs. What remains open here: real-remote end-to-end evidence and the ns self-update mechanism behind bare `ns update`.

This is a **bounded execution Subobjective** under the `skill-management-subsystem` umbrella; its front-loaded design questions (grammar, storage, fetch mechanics, update semantics, trust posture) are all resolved as recorded decisions.

**Explicitly not acquired here:** individual third-party skills. The umbrella retired `npx skills` wrapping and first-party GitHub *skill* acquisition permanently. This record fetches *modules* (npm packages / repos that declare an ns extension descriptor — `exports["./ns-extension"]` in `package.json`); it does not fetch loose skills, and it does not reopen the retired channel.

## Starting state (source-grounded, rebaselined 2026-07-12)

- **Acquisition and provisioning both work.** `@nseng-ai/kernel` owns spec parsing, managed npm package paths, and fakeable acquisition gateways with a real npm adapter (`ts/packages/kernel/src/extensions/acquisition.ts`, `ts/packages/kernel/src/project-config/managed-extension-paths.ts`); `@nseng-ai/ns-init` owns the install/update/uninstall lifecycle gateways and activation reconciliation (`ts/packages/capabilities/ns-init/src/extension-acquisition.ts`, `install-extension.ts`, `update-extension.ts`); descriptor-based artifact discovery and the manifest-aware reconcile core live in `@nseng-ai/harness-artifacts`.
- **Arrival paths changed under the descriptor migration:** the old directory-presence arrival (committed `.ns/extensions/` scan, XDG-root scan) no longer exists in source — extensions arrive as preinstalled first-party descriptors (wired in the ns host CLI) or as declared `ns.toml` `extensions = [...]` specs (local paths resolved in place; npm specs in the managed root). Descriptor import executes module code at catalog/discovery time under the trusted-repo posture (see `updates/20260708T171326Z-...`).
- **`ns.toml` is the declaration store:** top-level `extensions = [...]` is scanned by `ts/packages/kernel/src/project-config/ns-toml-extension-syntax.ts`, edited format-preservingly by `ns-toml-extensions-edit.ts` (install records exact specs; uninstall removes them), and `harnesses = [...]` still selects harness roots (`ts/packages/capabilities/harness-artifacts/src/ns-toml.ts`).
- **Pi's mechanism remains the debugged reference** for grammar, managed layout, pinning, and identity; the command-verb composition diverged deliberately under `ship-objectives-to-customers` (per-source lifecycle verbs instead of pi-verbatim `ns update` modes).
- **Umbrella risk acceptance carried in (see Risks):** project trust gating was deliberately retired at the umbrella (2026-07-07); fetched modules provision prompt-payload skill files with no consent gate.

## Scope

- **Source-spec grammar** (decided, implemented): `npm:pkg[@ver]` and local paths ship; `git:host/user/repo@ref` is reserved and rejected early with a per-spec unsupported diagnostic (`ts/packages/kernel/src/project-config/points.ts`).
- **Fetched-module storage** (decided, implemented): each canonical npm package identity owns a private managed project at `.ns/managed-extensions/npm/<package-name>/`, with the installed top-level module at that leaf's `node_modules/<package-name>` (`managed-extension-paths.ts`); the managed root is gitignored via a repo-root `.gitignore` rule written by activation. No lockfile — the spec is the record; the real adapter installs with `--no-save --package-lock=false --ignore-scripts --legacy-peer-deps` and removes lock residue.
- **Fetch + resolve** (implemented): declared specs materialize into resolved module directories behind fakeable gateways; failures surface as per-extension diagnostics, not hidden behavior. LBYL over EAFP.
- **Version resolution / update semantics per source kind** (owned here, implemented in the lifecycle shape): `ns extension update <source>` is single-target with explicit acquisition intents — `refresh-floating` (unpinned npm reconciles to current registry resolution), `ensure-pinned` (pinned npm installed if missing, otherwise stable/repaired), `local-in-place` (local pointers reactivated without copying). Whole-list/fleet update (`--all`) is deliberately deferred (parked in `ship-objectives-to-customers`).
- **Hand off to existing provisioning**: acquired modules flow through the same descriptor discovery, activation reconciliation, manifest, and clobber rules as preinstalled/local modules; shared-core changes stayed additive.
- **ns self-update mechanism** (remaining, added 2026-07-07 by user instruction): build it behind the reserved bare `ns update` surface; until it lands, bare `ns update` errors with a clear diagnostic pointing at `ns extension update <source>`.
- **Record design decisions as Semantic Updates** before their implementation slices (all decision rows are done).

## Non-Goals

- **No marketplace or remote catalog discovery** (retired umbrella disposition): sources are explicitly declared specs, never searched or browsed.
- **No `npx skills` wrapping/replacement and no first-party acquisition of individual third-party skills** (retired permanently): modules only.
- **No ns-owned semantic-version solver or dependency graph** (umbrella hard non-goal): each declared extension spec resolves one top-level module; npm installs that module's runtime dependencies inside its private managed project, but ns does not model, traverse, solve, or provision extension dependencies as first-class specs.
- **No trust/consent gate in this record** — deliberately, per the umbrella's retirement of trust gating, re-affirmed 2026-07-07 with fetch semantics on the table (see Risks); do not add one silently, and do not remove the risk note.
- No install/update side-effect hooks run silently during acquisition (the real npm adapter passes `--ignore-scripts`). Descriptor import itself executes module code at catalog/discovery time under the trusted-repo posture, accepted per `updates/20260708T171326Z-...`.
- No hidden database or cache as durable state; the ns.toml spec list, the inspectable managed root, and manifest provenance are the records.
- **Not owned here: the customer command-surface design.** The `ns extension` verb group (install/uninstall/update semantics, init-before-install ordering, exact-spec idempotence) is owned by `ship-objectives-to-customers`; this record owns the acquisition substrate and the self-update row.

## Completion Criteria

- A project can declare at least one remote source spec (via `ns extension install npm:...` recording it in `ns.toml` `extensions = [...]`), get the module fetched into the managed root, and its declared artifacts provisioned into the selected harness roots through the manifest-aware activation core — with failures surfaced as per-extension diagnostics. *(Implemented; awaiting the real-remote end-to-end evidence row.)*
- The spec grammar, storage-location, and update-semantics decisions are recorded as Semantic Updates and implemented consistently (pinned stable/repaired, floating refreshed, local reactivated in place). *(Met.)*
- Preinstalled first-party descriptors and locally declared extensions keep working unchanged alongside acquired modules; shared-core changes stayed additive. *(Met — the old directory-presence/XDG arrival path was retired separately by the descriptor-contract migration, not broken by acquisition.)*
- Repeat lifecycle operations with unchanged specs are idempotent; changing a spec reconciles managed state to it. *(Implemented; exercised in lifecycle tests.)*
- **Remaining:** real-remote end-to-end evidence — one real remote module declared, fetched from the registry, and provisioned into `pi`/`claude-code`/`codex` roots with manifest hashes (current acquisition tests use fake exec channels only).
- **Remaining:** the ns self-update mechanism lands behind the reserved bare `ns update` surface (today it errors `self-update-not-implemented`).
- Full `just` green (main suite, style guard, native `tsc`, edge sweep `sweep-ok`).

## Definition of Progress

Keepable progress advances a remaining row (real-remote evidence, self-update) or hardens the acquisition substrate consistent with recorded decisions, with passing validation. Do not keep changes that guess at unrecorded design decisions, run arbitrary install/update side-effect hooks silently during acquisition, introduce hidden durable state, add or remove the trust posture silently, reopen retired acquisition channels, or redesign the `ns extension` customer surface here (that surface is owned by `ship-objectives-to-customers`).

## Runner Policy

Design rows are done; execution follows recorded decisions.

- **Direct execution allowed when:** the slice implements an already-recorded decision within `@nseng-ai/kernel` acquisition/project-config, `@nseng-ai/ns-init` lifecycle wiring, `@nseng-ai/harness-artifacts`, and their tests, with passing validation.
- **Steer or ask first when:** a slice would change the spec grammar, the managed storage layout, update/pinning semantics, network-fetch mechanics (registry access, git transport), the `ns extension` verb contract (owned elsewhere), or any shared-core API widening — record the decision and confirm before implementing.
- **How work may change files:** local edits only, committed per slice on a feature branch (never `main`/`master`); clean tree and green validation per step. Tests must not perform real network fetches; acquisition I/O goes behind a gateway with a fake. (The real-remote evidence row is an explicit, user-visible verification run, not a test.)
- **Will not happen unless explicitly requested:** pushing, PR creation/submission, publishing, real registry/network writes, provisioning into real user-global harness directories outside tests or explicit user-invoked commands, or any external write-capable action.

## Assumptions and Risks

Assumptions:

- Pi's spec grammar and pinning semantics transferred to ns essentially as adopted; the verb composition diverged (per-source lifecycle verbs instead of pi-verbatim update modes) without reshaping the grammar or storage model.
- Acquisition stays cleanly layered before descriptor discovery/activation; the reconcile core remained additively widened only.
- The real-remote evidence row can be satisfied through `ship-objectives-to-customers`' checkout-free verification thread (`ns extension install npm:@nseng-ai/objectives` in a foreign repo) — if that thread stalls, this record still owns producing equivalent evidence.

Risks:

- **Trust posture (carried umbrella risk acceptance — re-judged and accepted 2026-07-07):** the umbrella retired project trust gating 2026-07-07 while graduating this record — so remotely fetched modules provision skill files (prompt-injection payloads by design) into harness directories with **no consent gate**, and descriptor import executes fetched module code at catalog time. Acceptance continues under ns's private/unreleased trusted-repo contract, explicitly extended to executable fetched content (`updates/20260707T193019Z-...`, `updates/20260708T171326Z-...`). If ns's audience widens, pi's project-trust model (trust store + `--approve`) is the recorded blueprint, reopened as a fresh Objective.
- **Scope gravity toward becoming a package manager:** npm acquisition deliberately uses managed package-manager installs, but ns must keep defending the hard non-goals: one declared spec → one top-level extension, no ns-modeled dependency graph, no ns-owned solver, no marketplace/catalog semantics.
- **Network flakiness contaminating lifecycle commands:** fetch failures must stay per-extension diagnostics and must not break provisioning of already-present modules (per-extension failure isolation is implemented in the lifecycle result shapes).
- **Storage-location mistakes are sticky — mitigated:** per-package private managed projects (implemented; `updates/20260710T145816Z-...`) prevent one package-manager operation from rewriting another extension's bytes; legacy shared-project bytes remain ignored in place, with no migration or pruning surface decided.
- **Surface-drift breadcrumbs:** retired `ns update --extensions` wording still lingers in code and docs (`ts/packages/capabilities/harness-artifacts/src/reconcile.ts` target-not-declared message; `ts/packages/kernel/docs/writing-an-ns-extension.md`) — cleanup belongs with the surface owner, but it can mislead agents working here.
- **Fire-and-forget umbrella** on the parent side — mirrored here; the umbrella must keep this row's status current and synthesize closure.

## Open Questions

- ~~**Interaction with `ns update`**~~ — resolved 2026-07-07 (`updates/20260707T200657Z-...`) as pi-verbatim modes, then **superseded on trunk** (see `updates/20260712T171229Z-extension-lifecycle-supersedes-pi-verbatim-update-contract.md`): the `ns extension` lifecycle group owns acquisition verbs; bare `ns update` is reserved for self-update and errors until that mechanism ships.
- ~~**Update semantics detail**~~ — resolved 2026-07-07 (`updates/20260707T200657Z-...`); surviving shape at HEAD: single-target `ns extension update <source>` with `refresh-floating` / `ensure-pinned` / `local-in-place` intents; removal is now a real verb (`ns extension uninstall`, identity-matched) rather than report-only diagnostics.
- ~~**Trust posture with executable extensions**~~ — resolved 2026-07-07 (`updates/20260707T193019Z-...`): trust gate deferred; kernel loading of executable CLI-group extensions from fetched managed-root modules is allowed as a later slice.
- ~~**Local-path specs**~~ — resolved 2026-07-07 (`updates/20260707T193019Z-...`): pointers to on-disk paths without copying; implemented as `local-in-place` lifecycle behavior.

## Closure

Closed 2026-07-20 as completed.

Outcome: the acquisition substrate this record owned is landed and in service. Declared `ns.toml` `extensions = [...]` specs (pi-derived grammar: `npm:pkg[@ver]`, local paths; git reserved) are acquired into per-package private managed projects under `.ns/managed-extensions/`, flow through descriptor-based discovery and activation reconciliation, and are updated with per-source-kind semantics (`refresh-floating` / `ensure-pinned` / `local-in-place`). The front-loaded design questions — grammar, storage, fetch mechanics, update semantics, trust posture (deferred under the trusted-repo assumption) — are all resolved as recorded decisions in this record's updates. The 2026-07-12 rebaseline stands: the customer-facing verbs are `ns extension install|update|uninstall` (owned by `ship-objectives-to-customers`); this record's mechanics are the substrate beneath them.

Residue at closure, recorded as restart pointers rather than open work:

- **Real-remote end-to-end evidence** (acquire a real npm-published extension in a foreign checkout) was never captured; the path is exercised by tests and the published-package verification under the customer-shipping program, but a dedicated real-remote proof remains unwitnessed.
- **ns self-update** behind bare `ns update` (currently a reserved stub erroring `self-update-not-implemented`) is a distinct mechanism deserving its own record if it becomes real work; it should not reopen this one.
- The retired `ns update --extensions` wording breadcrumbs noted in Risks remain for the surface owner.

Closure decision made in the 2026-07-20 open-objective portfolio review. The parent umbrella (`skill-management-subsystem`) synthesizes and closes alongside this record.
