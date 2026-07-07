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

**Explicitly not acquired here:** individual third-party skills. The umbrella retired `npx skills` wrapping and first-party GitHub *skill* acquisition permanently. This record fetches *modules* (npm packages / repos that statically declare `ns.harnessArtifacts` in `package.json`); it does not fetch loose skills, and it does not reopen the retired channel.

## Starting state (source-grounded)

- **Provisioning from modules already works; only acquisition is missing.** `@nseng-ai/harness-artifacts` parses static `ns.harnessArtifacts` declarations (`module-artifact-declaration.ts`) without executing module code; the reconcile planner/driver plus minimal top-level `ns update` provision first-party and extension-root artifacts with a per-file SHA-256 install manifest, idempotence, and clobber protection. Acquisition only needs to put modules on disk where discovery already looks (or extend discovery to a new fetched-module root).
- **Today's arrival paths:** committed `.ns/extensions/` directories and the XDG root — i.e., vendoring, which gives pinning for free via git.
- **`ns.toml` exists** at the repo root (written by `ns init`, parsed via `ts/packages/capabilities/harness-artifacts/src/ns-toml.ts` and consumed by the ns-init flow) and already carries the project's `harnesses = [...]` selection; the `artifact-packages` list would extend this file, not invent new state.
- **Pi's mechanism is the debugged reference:** uniform spec grammar, pinned-npm skip semantics, git-refs-reconciled-not-advanced, self-update kept separate from artifact update.
- **Umbrella risk acceptance carried in (see Risks):** project trust gating was deliberately retired at the umbrella (2026-07-07); fetched modules will provision prompt-payload skill files with no consent gate.

## Scope

- **Decide, then implement, the source-spec grammar** for the `ns.toml` declaration list (working name `artifact-packages`), starting from pi's `npm:pkg@ver` / `git:host/user/repo@ref` / local-path grammar. Which source kinds ship in the first slice is an open question — npm-only first is acceptable.
- **Decide fetched-module storage**: where acquired modules land on disk (a managed root the discovery layer reads), how that location is recorded/inspected, and how it stays git-native and inspectable per the umbrella's no-hidden-database rule.
- **Fetch + resolve**: materialize each declared spec into a resolved module directory; surface failures as diagnostics, not hidden behavior. LBYL over EAFP.
- **Version resolution / update semantics per source kind** (owned here): pinned specs are stable and skipped; unpinned/ref specs reconcile to the declared spec on `ns update`. Self-update of ns itself stays out of scope.
- **Hand off to existing provisioning unchanged**: acquired modules flow through the same static-declaration discovery, reconcile planner, manifest, and clobber rules as directory-present modules. If the shared core needs widening, keep changes additive (the proving-consumer lesson from `npm-bundled-artifact-provisioning`).
- **Record design decisions as Semantic Updates** before their implementation slices.

## Non-Goals

- **No marketplace or remote catalog discovery** (retired umbrella disposition): sources are explicitly declared specs, never searched or browsed.
- **No `npx skills` wrapping/replacement and no first-party acquisition of individual third-party skills** (retired permanently): modules only.
- **No semantic-version solver or dependency graph** (umbrella hard non-goal): specs resolve one module each; module dependencies are not traversed.
- **No trust/consent gate in this record** — deliberately, per the umbrella's retirement of trust gating (see Risks); do not add one silently, and do not remove the risk note.
- No executed module code during discovery or acquisition-time hooks; declarations stay static data.
- No hidden database or cache as durable state; whatever records exist must be explicit, inspectable files.
- No `agent` / `extension-bundle` provisioning semantics (parked at the umbrella; types already accommodate).

## Completion Criteria

- A project can declare at least one remote source spec in `ns.toml`, run `ns update`, and get the module fetched and its declared artifacts provisioned into the selected harness roots through the existing manifest-aware core — with failures surfaced as diagnostics.
- The spec grammar, storage-location, and update-semantics decisions are recorded as Semantic Updates and implemented consistently (pinned skipped; unpinned reconciled to spec).
- The existing arrival paths (committed `.ns/extensions/`, XDG root, first-party catalog) keep working unchanged; shared-core changes, if any, are additive.
- Repeat `ns update` with unchanged specs is idempotent; changing a spec reconciles to it.
- Full `just` green (main suite, style guard, tsgo, edge sweep `sweep-ok`).

## Definition of Progress

Keepable progress resolves a front-loaded design question as a recorded decision, or advances an implementation slice consistent with recorded decisions, with passing validation. Do not keep changes that guess at unrecorded design decisions, execute module code during discovery/acquisition, introduce hidden durable state, add or remove the trust posture silently, or reopen retired acquisition channels.

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

- **Trust posture (carried umbrella risk acceptance, restated per the disposition record):** the umbrella retired project trust gating 2026-07-07 while graduating this record — so remotely fetched modules will provision skill files (prompt-injection payloads by design) into harness directories with **no consent gate**. This is a deliberate risk acceptance under ns's private/unreleased trusted-repo contract, and this record makes it strictly more exposed: acquisition means content no longer arrives only by someone committing it to a trusted repo. Re-judge this acceptance here with real fetch semantics on the table; if ns's audience widens, pi's project-trust model (trust store + `--approve`) is the recorded blueprint, reopened as a fresh Objective.
- **Scope gravity toward a package manager:** resolution, caching, and dependency traversal all beckon. Defend with the hard non-goals: one spec → one module, no graph, no solver.
- **Network flakiness contaminating `ns update`:** fetch failures must degrade to per-module diagnostics, not break provisioning of already-present modules (the collision-skip precedent from the thermo remediation applies).
- **Storage-location mistakes are sticky:** a wrong fetched-module root ships inertia. Decide it deliberately, git-native and inspectable, before the first fetch slice.
- **Fire-and-forget umbrella** on the parent side — mirrored here; the umbrella must keep this row's `[~]` current and synthesize closure.

## Open Questions

- **Spec grammar adoption:** take pi's grammar verbatim (`npm:pkg@ver` / `git:host/user/repo@ref` / local path) or a subset first? Which source kinds ship in slice one (npm-only is the lean candidate)?
- **Fetched-module storage:** where do acquired modules live (a managed sibling of `.ns/extensions/`? an XDG cache-like root with an explicit record file?), and what makes it inspectable and git-native?
- **Fetch mechanics:** npm registry access mechanism (pack/extract vs install), git transport, and how these go behind a gateway for fake-driven tests.
- **Interaction with `ns update`:** does acquisition run inside `ns update` unconditionally, behind a flag, or as a separate `ns`-surface verb that `ns update` composes?
- **Local-path specs:** are they acquisition (copied/linked into the managed root) or just discovery pointers?
