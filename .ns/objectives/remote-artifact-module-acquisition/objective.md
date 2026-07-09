---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; graduated 2026-07-07 from the parked "remote acquisition sources for artifact-bearing modules" row (a user decision, against the keep-parked recommendation). Owns the first-party fetch path for artifact-bearing npm modules and version-resolution-for-fetched-modules; the umbrella coordinates the reusable-subsystem ambition and remaining deferred breadth.
---

# Remote Acquisition of Artifact-Bearing Modules

## Thesis

Give ns a first-party way to **acquire** artifact-bearing modules from remote sources, so a project can declare "I want these modules" and `ns update` can fetch and provision them — instead of every module having to arrive by directory presence (committed under `.ns/extensions/` or placed in the XDG root). The anticipated shape (recorded in the `npm-bundled-artifact-provisioning` child, decision `20260706T194500Z` §6): a declaration list in `ns.toml` (working name `artifact-packages`), resolved to modules on disk, which then flow through the **existing** npm-module-bundled provisioning core unchanged — acquisition ends where the reconcile planner begins.

The design starting point is pi's debugged update mechanism (see `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`): a uniform source-spec grammar — `npm:pkg@version`, `git:host/user/repo@ref`, local paths — with its pinning semantics (pinned npm versions are skipped by updates; git refs are *reconciled to the ref*, not advanced past it). This record also owns **version resolution for fetched modules**, assigned here from the umbrella's former lifecycle row: what "update this module" means per source kind.

This is a **bounded execution Subobjective** under the `skill-management-subsystem` umbrella, but design-heavy at the front: the spec grammar, storage location for fetched modules, and update semantics are open questions that must be resolved as recorded decisions before implementation slices run.

**Explicitly not acquired here:** individual third-party skills. The umbrella retired `npx skills` wrapping and first-party GitHub *skill* acquisition permanently. This record fetches *modules* (npm packages / repos that declare an ns extension descriptor — `exports["./ns-extension"]` in `package.json`, since superseding static `ns.harnessArtifacts`); it does not fetch loose skills, and it does not reopen the retired channel.

## Starting state (source-grounded)

- **Provisioning from modules already works; only acquisition is missing.** `@nseng-ai/harness-artifacts` resolves an extension module's bundled harness artifacts from its ns extension descriptor (`module-artifact-declaration.ts` imports and validates `exports["./ns-extension"]`; descriptor import now executes module code at catalog/discovery time under the trusted-repo posture, superseding the earlier static-`ns.harnessArtifacts` no-execution model — see `updates/20260708T171326Z-...`); the reconcile planner/driver plus minimal top-level `ns update` provision first-party and extension-root artifacts with a per-file SHA-256 install manifest, idempotence, and clobber protection. Acquisition only needs to put modules on disk where discovery already looks (or extend discovery to a new fetched-module root).
- **Today's arrival paths:** committed `.ns/extensions/` directories and the XDG root — i.e., vendoring, which gives pinning for free via git.
- **`ns.toml` exists** at the repo root (written by `ns init`, parsed via `ts/packages/capabilities/harness-artifacts/src/ns-toml.ts` and consumed by the ns-init flow) and already carries the project's `harnesses = [...]` selection; the `artifact-packages` list would extend this file, not invent new state.
- **Pi's mechanism is the debugged reference:** uniform spec grammar, pinned-npm skip semantics, git-refs-reconciled-not-advanced, self-update kept separate from artifact update.
- **Umbrella risk acceptance carried in (see Risks):** project trust gating was deliberately retired at the umbrella (2026-07-07); fetched modules will provision prompt-payload skill files with no consent gate.

## Scope

- **Decide, then implement, the source-spec grammar** for the `ns.toml` declaration list (working name `artifact-packages`), starting from pi's `npm:pkg@ver` / `git:host/user/repo@ref` / local-path grammar. Which source kinds ship in the first slice is an open question — npm-only first is acceptable.
- **Decide fetched-module storage**: where acquired modules land on disk (a managed root the discovery layer reads), how that location is recorded/inspected, and how it stays git-native and inspectable per the umbrella's no-hidden-database rule.
- **Fetch + resolve**: materialize each declared spec into a resolved module directory; surface failures as diagnostics, not hidden behavior. LBYL over EAFP.
- **Version resolution / update semantics per source kind** (owned here): pinned specs are stable and skipped; unpinned/ref specs reconcile to the declared spec on `ns update --extensions`. The command contract is pi-verbatim (decided 2026-07-07, `updates/20260707T200657Z-...`): bare `ns update`/`--self` = self-update only, `--extensions` = acquisition + provisioning, `--all` = both, with per-spec targeting of declared specs. The ns **self-update mechanism** is now a late in-scope roadmap row (added 2026-07-07 by user instruction); until it lands, bare `ns update` errors with a clear use-`--extensions` diagnostic.
- **Hand off to existing provisioning unchanged**: acquired modules flow through the same descriptor-based discovery, reconcile planner, manifest, and clobber rules as directory-present modules. If the shared core needs widening, keep changes additive (the proving-consumer lesson from `npm-bundled-artifact-provisioning`).
- **Record design decisions as Semantic Updates** before their implementation slices.

## Non-Goals

- **No marketplace or remote catalog discovery** (retired umbrella disposition): sources are explicitly declared specs, never searched or browsed.
- **No `npx skills` wrapping/replacement and no first-party acquisition of individual third-party skills** (retired permanently): modules only.
- **No ns-owned semantic-version solver or dependency graph** (umbrella hard non-goal): each declared extension spec resolves one top-level module. The selected npm acquisition mechanics may let the package manager install that module's runtime dependencies, but ns does not model, traverse, solve, or provision extension dependencies as first-class specs.
- **No trust/consent gate in this record** — deliberately, per the umbrella's retirement of trust gating, re-affirmed 2026-07-07 with fetch semantics on the table (see Risks); do not add one silently, and do not remove the risk note.
- No install/update side-effect hooks run silently during acquisition. (Extension-metadata discovery now imports the ns extension descriptor module — descriptor code executes at catalog/discovery time under the trusted-repo posture, accepted per `updates/20260708T171326Z-...`, superseding the earlier "declarations stay static data" non-goal; acquisition itself must still not run arbitrary install/update hooks silently.)
- No hidden database or cache as durable state; whatever records exist must be explicit, inspectable files.
- No `agent` / `extension-bundle` provisioning semantics (parked at the umbrella; types already accommodate).

## Completion Criteria

- A project can declare at least one remote source spec in `ns.toml`, run `ns update --extensions`, and get the module fetched and its declared artifacts provisioned into the selected harness roots through the existing manifest-aware core — with failures surfaced as diagnostics.
- The spec grammar, storage-location, and update-semantics decisions are recorded as Semantic Updates and implemented consistently (pinned skipped; unpinned reconciled to spec).
- The existing arrival paths (committed `.ns/extensions/`, XDG root, first-party catalog) keep working unchanged; shared-core changes, if any, are additive.
- Repeat `ns update --extensions` with unchanged specs is idempotent; changing a spec reconciles to it.
- The pi-verbatim command surface is implemented per the recorded contract, and the ns self-update mechanism (late roadmap row) lands behind bare `ns update`/`--self`.
- Full `just` green (main suite, style guard, tsgo, edge sweep `sweep-ok`).

## Definition of Progress

Keepable progress resolves a front-loaded design question as a recorded decision, or advances an implementation slice consistent with recorded decisions, with passing validation. Do not keep changes that guess at unrecorded design decisions, run arbitrary install/update side-effect hooks silently during acquisition, introduce hidden durable state, add or remove the trust posture silently, or reopen retired acquisition channels.

## Runner Policy

Design-heavy at the front; execution follows recorded decisions.

- **Direct execution allowed when:** the slice implements an already-recorded design decision within `@nseng-ai/harness-artifacts`, `ns` CLI wiring, `ns-toml` parsing, and their tests, with passing validation.
- **Steer or ask first when:** a slice would decide the spec grammar, the fetched-module storage location, update/pinning semantics, network-fetch mechanics (registry access, git transport), or any shared-core API widening — record the decision and confirm before implementing.
- **How work may change files:** local edits only, committed per slice on a feature branch (never `main`/`master`); clean tree and green validation per step. Tests must not perform real network fetches; acquisition I/O goes behind a gateway with a fake.
- **Will not happen unless explicitly requested:** pushing, PR creation/submission, publishing, real registry/network writes, provisioning into real user-global harness directories outside tests or explicit user-invoked commands, or any external write-capable action.

## Assumptions and Risks

Assumptions:

- Pi's spec grammar and pinning semantics transfer to ns with little adaptation; we adopt a debugged design rather than inventing one.
- Acquisition can be cleanly layered *before* existing discovery/provisioning, keeping the reconcile core unchanged or additively widened.
- npm-first is a viable first slice; git and local-path sources can follow without reshaping the grammar.

Risks:

- **Trust posture (carried umbrella risk acceptance — re-judged and accepted 2026-07-07):** the umbrella retired project trust gating 2026-07-07 while graduating this record — so remotely fetched modules will provision skill files (prompt-injection payloads by design) into harness directories with **no consent gate**. Re-judged with real fetch semantics on the table (`updates/20260707T193019Z-...`): acceptance continues under ns's private/unreleased trusted-repo contract, now explicitly extended to **executable** fetched content — the kernel may later load CLI-group command extensions from fetched managed-root modules. If ns's audience widens, pi's project-trust model (trust store + `--approve`) is the recorded blueprint, reopened as a fresh Objective.
- **Scope gravity toward becoming a package manager:** npm acquisition now deliberately uses a managed package-manager install to match pi and support runtime dependencies, but ns must still defend the hard non-goals: one declared spec → one top-level extension, no ns-modeled dependency graph, no ns-owned solver, and no marketplace/catalog semantics.
- **Network flakiness contaminating `ns update`:** fetch failures must degrade to per-module diagnostics, not break provisioning of already-present modules (the collision-skip precedent from the thermo remediation applies).
- **Storage-location mistakes are sticky:** a wrong fetched-module root ships inertia. Decide it deliberately, git-native and inspectable, before the first fetch slice.
- **Fire-and-forget umbrella** on the parent side — mirrored here; the umbrella must keep this row's `[~]` current and synthesize closure.

## Open Questions

- ~~**Interaction with `ns update`**~~ — resolved 2026-07-07 (`updates/20260707T200657Z-...`): pi-verbatim modes; bare `ns update` is self-update only and errors until the self-update mechanism ships; `--extensions` owns acquisition + provisioning.
- ~~**Update semantics detail**~~ — resolved 2026-07-07 (`updates/20260707T200657Z-...`): pinned installed-if-missing/skipped, unpinned reconciled to registry resolution, git reconciled-to-ref, local paths validated pointers; per-extension failure isolation; idempotent unchanged specs; removed specs report-only (removal verb deferred).
- ~~**Trust posture with executable extensions**~~ — resolved 2026-07-07 (`updates/20260707T193019Z-...`): trust gate deferred; kernel loading of executable CLI-group extensions from fetched managed-root modules is allowed as a later slice.
- ~~**Local-path specs**~~ — resolved 2026-07-07 (`updates/20260707T193019Z-...`): pointers to on-disk paths without copying, mimicking pi; supersedes the storage decision's mounting leaning.
