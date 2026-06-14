# Port Handoff to TypeScript

## Thesis

`handoff` should become TypeScript-backed by default as the third production vertical slice of the broader asdl toolkit TypeScript migration, following the completed `pr-address` and `brmem` cutovers.

The port should preserve the current public handoff model: Handoff Artifacts are directed Markdown work-context artifacts stored as Branch Memory Entries in the `handoff` Namespace, keyed by flat `<handoff-slug>.md` Handoff Keys. The user-facing standalone `handoff` CLI owns inventory and cleanup actions (`list`, `delete`, `gc`), while create and pickup remain skill/Pi workflows over Branch Memory and the `handoff list` inventory. This Objective is not a redesign of the handoff lifecycle.

The TypeScript implementation should live in a standalone `ts/packages/handoff` package named `@asdl/handoff`, exporting both a reusable package surface and the public `handoff` CLI. It should use the TypeScript `brmem` CLI/library boundary as the storage primitive, `@asdl/core` Git helpers for ordinary branch facts, and `@asdl/clinkr` for command rendering and machine envelopes. The current Python `packages/asdl-handoff` package remains the reference/fallback only until TypeScript parity, public shim evidence, and skill/Pi compatibility are proven; then the Python package and `asdl` plugin path should be retired deliberately.

This capability differs from `brmem`: it is a consumer workflow over Branch Memory, not the storage layer itself. The central correctness concern is therefore preserving user-facing handoff inventory/admin semantics and Pi/skill expectations while depending on the already-TypeScript `brmem` public surface. The main framework seam expected from this port is proper Markdown rendering in `@asdl/clinkr`, because Python handoff has a distinct markdown list renderer and TS Clinkr currently routes markdown through the human renderer.

## Scope

- The standalone public `handoff` CLI operations currently implemented by Python:
  - `handoff list [--branch <branch> | --all] [--include-deleted] [--format human|json|markdown|md]`
  - `handoff delete [--branch <branch>] [-f|--force] <slug>`
  - `handoff gc [--dry-run] [-f|--force]`
- Stable command names, flags, exit codes, JSON machine envelopes, user-facing Handoff Slug/Key validation, Branch State classification, interactive confirmation behavior, and markdown list output.
- The Handoff Namespace storage contract: namespace `handoff`, flat Handoff Keys shaped as `<handoff-slug>.md`, and Branch Memory Entry Locators as technical evidence rather than the primary user model.
- A new `ts/packages/handoff` package with TypeScript source, scenario tests, fake-driven gateway tests, limited real-git/real-`brmem` smoke tests, README, package `CONTEXT.md`, and a run-from-source `handoff` shim.
- A package-local Handoff Branch Memory gateway over the public TypeScript `brmem` CLI, plus narrow read-only git plumbing for per-entry Handoff Summary `updated_at` timestamps if `brmem check` continues to expose Snapshot metadata rather than per-entry change time.
- A minimal `@asdl/clinkr` Markdown renderer hook if still absent when implementation begins.
- Public install and developer workflow updates: `just install-handoff`, `just install-tools`, docs/skills that mention handoff installation or runtime, and final removal of the Python package from uv workspace/config/publish paths.
- Plugin-retirement documentation: the current Python package exposes an `asdl.plugins` entry point for `asdl handoff`; this Objective should retire that plugin unless fresh inventory finds active user-facing usage that must be preserved.
- Objective tracking and umbrella migration updates showing Handoff / `handoff` as TS-default after cutover.

## Non-Goals

- No new `handoff create` CLI operation. Create remains the `handoff-create` skill and Pi `/handoff:create` workflow storing through Branch Memory.
- No new `handoff pickup` CLI operation. Pickup remains the `handoff-pickup` skill and Pi `/handoff:pickup` workflow reading Branch Memory artifacts and using `handoff list` for inventory.
- No handoff storage redesign: no manifests, indexes, registries, nested keys, tombstones, archives, temp-file handoff directories, hidden metadata, or non-Branch-Memory storage.
- No change to the Handoff Namespace (`handoff`), Handoff Key shape (`<slug>.md`), or flat-key rule.
- No npm registry publish or checkout-free bundled distribution requirement. The accepted distribution model is the run-from-source shim, matching `pr-address` and `brmem`.
- No broad migration of Pi `/handoff:*` UX code into `@asdl/handoff` unless required to preserve the public CLI contract. Pi command parsing, picker UI, and prompt construction can remain in `@asdl/pi-extensions`.
- No shared Branch Memory consumer abstraction or new `@asdl/core` gateway extraction unless repeated evidence after the local implementation proves the seam. Use narrow package-local adapters first.
- No long-term Python fallback after cutover criteria are met.

## Completion Criteria

- Current Python `handoff` public contracts are inventoried and classified as durable contract vs incidental implementation detail, with the contract inventory checked into this Objective.
- `@asdl/clinkr` supports distinct markdown rendering for rendered commands, or the Objective records why that framework gap no longer blocks Handoff parity.
- `ts/packages/handoff` exists as a TypeScript workspace package with package metadata, `handoff` bin, curated exports, README, package `CONTEXT.md`, and focused `check`/`test` scripts.
- TypeScript `handoff list`, `handoff delete`, and `handoff gc` preserve the stable CLI flags, JSON envelope/data fields, exit codes, confirmation behavior, and user-facing messages, or intentionally diverge only with documented compatibility rationale and tests.
- `handoff list --format markdown` and `--format md` preserve the durable markdown table contract used by current Python tests.
- Scenario tests cover the current Python scenario matrix for help/version/runtime, list, delete, and gc. Gateway tests cover fake behavior and real adapter protocol details. Limited real-git/real-`brmem` smoke tests prove the TypeScript CLI works against real Branch Memory refs in throwaway repositories.
- Existing Pi/skill consumers that shell out to `handoff list --format json` continue to work without changing their public behavior.
- Public distribution is cut over to a TypeScript run-from-source shim installed by `just install-handoff` and included in `just install-tools`; runtime diagnostics identify the TypeScript implementation.
- The Python `packages/asdl-handoff` package is removed from active workspace/config/test/publish paths after parity and distribution evidence land; the `asdl handoff` plugin path is deliberately retired or an explicit preservation decision is recorded before deletion.
- Handoff domain vocabulary is moved or updated so active package context points at `ts/packages/handoff/CONTEXT.md`, and `CONTEXT-MAP.md` no longer treats the Python package as the active context owner after deletion.
- The umbrella TypeScript migration Objective records Handoff / `handoff` as TS-default and captures reusable lessons from this port, including markdown rendering, Branch Memory consumer boundaries, and plugin retirement.

## Definition of Progress

Progress is keepable when it moves Handoff toward TypeScript-default behavior while preserving or explicitly reclassifying the public handoff contract.

Keepable progress should do at least one of the following:

- Clarify or preserve a durable handoff contract: command surface, JSON schema, markdown output, interactive confirmation, Handoff Slug/Key validation, Branch State semantics, storage namespace/key shape, or plugin-retirement policy.
- Port a coherent vertical slice to TypeScript, preferably `list` before destructive operations, with fake-driven tests and targeted validation.
- Strengthen compatibility evidence with scenario tests, gateway tests, markdown fixtures, or throwaway-repo real smoke tests.
- Reduce Python fallback scope only after equivalent TypeScript behavior, docs, and invocation paths are covered.
- Feed a proven framework or migration lesson into `@asdl/clinkr`, `@asdl/core`, or the umbrella TypeScript migration playbook.

Do not keep changes that:

- Change the Handoff Namespace, flat Handoff Key shape, Handoff Slug semantics, Branch State values, JSON field names, or exit-code behavior without explicit compatibility rationale and tests.
- Add `handoff create` or `handoff pickup` CLI operations as part of this migration without a separate design decision.
- Preserve the Python `asdl handoff` plugin by leaving a Python shim/fallback in active paths without an explicit product decision.
- Rewire Pi handoff workflows in a way that changes public `/handoff:create`, `/handoff:pickup`, `/handoff:list`, or `/ccc:handoff-tab` behavior unless the roadmap row explicitly covers that compatibility change.
- Extract shared gateways or framework abstractions before the package-local implementation proves the seam.
- Delete `packages/asdl-handoff` before TS parity, public shim behavior, plugin-retirement decision, docs/skill updates, and validation evidence exist.

Useful evidence includes targeted Vitest tests, TypeScript workspace checks, Python reference scenario comparisons before deletion, real shim runtime smoke, throwaway git repository smoke tests using TypeScript `brmem`, focused Pi extension tests that consume `handoff list`, full `just` validation for deletion/cutover rows, and Semantic Updates recording compatibility decisions or fallback-retirement evidence.

## Runner Policy

This Objective is execution-friendly for `objective-next` across non-parked roadmap rows under the boundaries below. A runner may preview one coherent slice, then execute it after user confirmation.

- Direct execution is allowed for repository-local files and local validation: TypeScript package code/tests, Clinkr framework support, wrapper scripts, checked-in docs, Objective files, skills, package context files, workspace config, and throwaway-repo tests that create/delete local `refs/brmem/...` only in temporary repositories.
- Direct execution should prefer vertical slices: inventory first, then markdown renderer support if still needed, then `list`, then `delete`, then `gc`, then public shim/docs, then Python deletion, then Objective/umbrella closeout.
- Steer or ask first when a slice would intentionally change Handoff Namespace, Handoff Key/Slug semantics, JSON envelope/data fields, exit-code behavior, interactive prompt semantics, plugin-retirement policy, Pi command behavior, or public distribution model.
- Ask before deleting `packages/asdl-handoff`, removing the `asdl handoff` plugin path, adding new create/pickup CLI operations, extracting shared gateways into `@asdl/core`, or changing `@asdl/clinkr` semantics beyond the minimal markdown-renderer hook.
- No external write-capable actions are in scope by default: no PR submission, no npm/PyPI publishing, no deployment, no GitHub mutation, and no writes to refs outside local throwaway test repositories. If Graphite PR submission is desired later, use the repo's Graphite workflow and explicit user confirmation.
- Validation before keeping work should be targeted first (`pnpm --dir ts/packages/handoff run check`, `pnpm --dir ts/packages/handoff run test`, focused Clinkr tests, focused Pi extension tests), then broaden to `pnpm --dir ts run check`, `pnpm --dir ts run test`, and finally `just` for workspace/config/deletion rows.
- Work may be left as an ordinary repository diff with code, tests, docs, Objective files, and wrapper scripts. Do not leave generated temp export files, throwaway git repositories, stray `refs/brmem/...` in the working repository, or unstated compatibility changes.
- Row-level `Policy:` notes in `roadmap.md` refine these defaults and are prose guidance, not hidden workflow state.

## Assumptions and Risks

Assumptions:

- The active public Handoff CLI contract is the standalone `handoff` command, not the `asdl handoff` plugin path. The Python plugin can be retired like the `pr-address` plugin if inventory does not find active user-facing usage.
- Current create/pickup behavior is intentionally skill/Pi-owned. The TypeScript package does not need new create/pickup CLI commands to complete the port.
- The TypeScript `brmem` CLI is now the correct storage boundary for handoff operations. Direct native `@asdl/brmem` imports are appropriate for stable public validation/ref-layout helpers when they simplify package-local code without bypassing Branch Memory storage behavior; implementation evidence now includes reusing the public `mustEntryLocator` helper for Handoff Entry Locator construction.
- `@asdl/core` Git helpers are sufficient for ordinary branch facts such as current branch and local branch presence; per-entry Branch Memory updated timestamps may still need package-local read-only git plumbing.
- The run-from-source shim distribution model accepted for `pr-address` and `brmem` is adequate for `handoff`; implementation evidence showed `just install-handoff` must also remove a stale project-venv `handoff` console script so the standalone command resolves to the TypeScript shim in activated dev environments.
- TypeScript Clinkr's Python-parity machine envelope remains the correct v1 machine contract for migrated CLIs.

Risks:

- The `asdl handoff` plugin path might still be used by undocumented consumers. Mitigation: inventory repo docs/skills/tests before deletion and record the retirement decision.
- Markdown rendering may be subtly wrong if TS Clinkr continues to collapse markdown into human rendering. This framework risk is de-risked for Clinkr by the first-class `renderMarkdown` hook and focused/full TypeScript validation on PR #1504; the remaining Handoff risk is preserving exact `handoff list` markdown table bytes when the Handoff package consumes the hook.
- Per-entry `updated_at` is easy to confuse with Snapshot head date. The Python handoff adapter deliberately used direct git log by key because public `brmem check` exposed Snapshot metadata. Mitigation: preserve per-entry timestamp behavior with tests.
- Interactive confirmation must keep JSON stdout machine-readable. Prompts/previews need stderr routing under JSON mode.
- Deleting the Python package affects uv workspace config, plugin discovery tests, publish configuration, and context docs; final deletion must run broad validation.
- Scope creep into Pi workflow redesign, create/pickup CLI additions, or shared abstraction extraction could delay the vertical port. Keep these parked unless explicitly selected.

## Open Questions

- Does fresh inventory find any active user-facing `asdl handoff` plugin usage that should block plugin retirement, or can the standalone `handoff` CLI become the sole active public surface?
- Resolved for v1: `@asdl/handoff` uses public `@asdl/brmem` helper exports for validation/ref-layout, including `mustEntryLocator`, and the public `brmem` CLI for storage operations. Keep broader native storage imports out of scope unless a later implementation slice proves a simpler public boundary.
- Is exact markdown table output required beyond current Python scenario assertions, or is structured markdown compatibility enough once tests preserve headings/columns/rows/order?
- Should package-local per-entry timestamp git plumbing later become a shared `brmem` helper/API, and only after which second consumer proves the seam?
- What commit should be recorded as the final rollback/reference point for Python `packages/asdl-handoff` once deletion lands?
