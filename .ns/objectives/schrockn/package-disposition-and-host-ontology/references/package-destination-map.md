# Approved TypeScript Package Destination Map

## Purpose and approval status

This is the complete approved map paired with
[`ADR 0045`](../../../../docs/adr/0045-release-disposition-and-owner-nested-package-ontology.md).
The user explicitly approved the map and ADR on 2026-07-25. This settles design and
provides the basis for implementation-stack planning; it does not itself authorize package
moves, identity changes, external publication, or registry writes.

Inventory baseline: the workspace contains **26 manifests**—25 below `ts/packages/` plus
`.ns/extensions/skill-exposure/package.json`. The target adds nine packages by extracting
Pi surfaces, folds one package into `@nseng-ai/ns`, and retains the consolidated internal
Pi tools package, for a proposed **34-package** workspace.

## Legend

- **Disposition**: `public`, `incubating`, or `internal` as defined by ADR 0045.
- **Action**: `move`, `rename`, `split`, `fold`, or a combination.
- **Release consequence**: what must change in public-package catalogs or qualification.
- **Curated API gate**: extraction cannot land until the named extension exposes everything
  the Pi package needs without private/deep imports.

## Approved target tree

```text
ts/packages/
├── public/
│   ├── ns/
│   ├── sdk/
│   ├── extension-kit/
│   ├── infra/{brmem,clinkr,foundation}/
│   └── tools/packagechk/
├── incubating/
│   ├── extensions/{branch-context,flow,handoffs,harness-artifacts,herdr,objectives,plans,
│   │              pr-feedback,reviews,skill-exposure,slots}/
│   ├── hosts/pi/
│   │   ├── runtime/pi-runtime/
│   │   └── extensions/{pi-ns-branch-context,pi-ns-flow,pi-ns-handoffs,pi-ns-herdr,
│   │                    pi-ns-objectives,pi-ns-pr-feedback}/
│   └── tools/vibechk/
└── internal/
    ├── dev/{ns-dev,typescript-style-guard}/
    └── hosts/pi/
        ├── extensions/{harness-session,model-shortcuts,worktree-status}/
        ├── subagents/ns-pi-subagents/
        └── tools/{pi-editor-mods,pi-tools}/
```

## Existing-package disposition map

|  # | Current package and path                                                | Proposed disposition and destination                                    | Final identity                                | Action and rationale                                                                                                                                                             | Dependency / release consequence                                                                                                                                                                                                                     |
| -: | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1 | `@nseng-ai/ns` — `hosts/ns/`                                            | `public/ns/`                                                            | `@nseng-ai/ns`                                | Move. This is the checkout-free product distribution, not an external harness adapter.                                                                                           | Public closure requires all bundled/runtime source dependencies to be public or folded. Keep dedicated bundle/pack/smoke pipeline.                                                                                                                   |
|  2 | `@nseng-ai/sdk` — `sdk/`                                                | `public/sdk/`                                                           | `@nseng-ai/sdk`                               | Move; retain the public author API and leaf/name match.                                                                                                                          | Remains in the public release set and product SDK fold.                                                                                                                                                                                              |
|  3 | `@nseng-ai/extension-kit` — `extension-kit/`                            | `public/extension-kit/`                                                 | `@nseng-ai/extension-kit`                     | Move; retain first-party extension-building substrate.                                                                                                                           | Remains public; dependency closure stays over public Foundation, Clinkr, and SDK.                                                                                                                                                                    |
|  4 | `@nseng-ai/brmem` — `infra/brmem/`                                      | `public/infra/brmem/`                                                   | `@nseng-ai/brmem`                             | Move. Public CLI/library contract exists; checkout-free packaging must replace source-shim guidance.                                                                             | Remains public; qualify its binary and npm install path.                                                                                                                                                                                             |
|  5 | `@nseng-ai/clinkr` — `infra/clinkr/`                                    | `public/infra/clinkr/`                                                  | `@nseng-ai/clinkr`                            | Move. Stable neutral CLI framework dependency.                                                                                                                                   | Remains early in public release order.                                                                                                                                                                                                               |
|  6 | `@nseng-ai/foundation` — `infra/foundation/`                            | `public/infra/foundation/`                                              | `@nseng-ai/foundation`                        | Move. Stable neutral infrastructure with broad public dependents.                                                                                                                | Remains early in public release order.                                                                                                                                                                                                               |
|  7 | `@nseng-ai/branch-context` — `incubator/branch-context/`                | `incubating/extensions/branch-context/`                                 | `@nseng-ai/branch-context`                    | Move and split out Pi code. All ns extensions remain incubating for the initial organizational cutover.                                                                          | Remove `./pi*` exports and Pi peer. Existing checkout-free evidence remains promotion evidence. Pi extraction listed below.                                                                                                                          |
|  8 | `@nseng-ai/handoffs` — `incubator/handoffs/`                            | `incubating/extensions/handoffs/`                                       | `@nseng-ai/handoffs`                          | Move and split out Pi code. All ns extensions remain incubating for the initial organizational cutover.                                                                          | Remove `./pi*` exports and Pi peer; expose any launch integration required by Herdr through a curated harness-independent API.                                                                                                                       |
|  9 | `@nseng-ai/harness-artifacts` — `incubator/harness-artifacts/`          | `incubating/extensions/harness-artifacts/`                              | `@nseng-ai/harness-artifacts`                 | Move. All ns extensions remain incubating for the initial organizational cutover.                                                                                                | The public ns product must remove or fold this runtime edge to satisfy disposition closure.                                                                                                                                                          |
| 10 | `@nseng-ai/objectives` — `incubator/objectives/`                        | `incubating/extensions/objectives/`                                     | `@nseng-ai/objectives`                        | Move and split out Pi code. All ns extensions remain incubating for the initial organizational cutover.                                                                          | Remove `./pi*` exports and Pi peer. Its dependency on incubating Flow is allowed. Remove Objectives from the public release catalog until promoted.                                                                                                  |
| 11 | `@nseng-ai/plans` — `incubator/plans/`                                  | `incubating/extensions/plans/`                                          | `@nseng-ai/plans`                             | Move. All ns extensions remain incubating for the initial organizational cutover.                                                                                                | No Pi extraction is needed.                                                                                                                                                                                                                          |
| 12 | `@nseng-ai/pr-feedback` — `incubator/pr-feedback/`                      | `incubating/extensions/pr-feedback/`                                    | `@nseng-ai/pr-feedback`                       | Move. All ns extensions remain incubating for the initial organizational cutover; its checkout-free quickstart remains promotion work.                                           | Remove from the public release catalog. Pi presentation moves out.                                                                                                                                                                                   |
| 13 | `@nseng-ai/reviews` — `incubator/reviews/`                              | `incubating/extensions/reviews/`                                        | `@nseng-ai/reviews`                           | Move. All ns extensions remain incubating for the initial organizational cutover; invoking the external `pi` CLI through a gateway does not make it Pi-owned.                    | Document Pi CLI as an optional external adapter rather than host coupling.                                                                                                                                                                           |
| 14 | `@nseng-ai/slots` — `incubator/slots/`                                  | `incubating/extensions/slots/`                                          | `@nseng-ai/slots`                             | Move. All ns extensions remain incubating for the initial organizational cutover.                                                                                                | Its Flow edge is allowed within incubating disposition.                                                                                                                                                                                              |
| 15 | `@nseng-ai/flow` — `incubator/flow/`                                    | `incubating/extensions/flow/`                                           | `@nseng-ai/flow`                              | Move and split out Pi code. Broad lifecycle surface and active reshaping make release intent real but warrant incomplete.                                                        | Remove from public release catalog until promoted. Public Objectives must no longer runtime-depend on Flow. Pi extraction listed below.                                                                                                              |
| 16 | `@nseng-ai/herdr` — `incubator/herdr/`                                  | `incubating/extensions/herdr/`                                          | `@nseng-ai/herdr`                             | Move and split out Pi code. Active orchestration reshaping keeps it incubating.                                                                                                  | May depend on public and incubating packages. Remove Pi peer and Pi exports.                                                                                                                                                                         |
| 17 | `@nseng-ai/packagechk` — `tools/packagechk/`                            | `public/tools/packagechk/`                                              | `@nseng-ai/packagechk`                        | Move. It is a standalone registry tool with a bounded public contract.                                                                                                           | Retain in public catalog; add ordinary pack/install evidence if missing. Public disposition approved.                                                                                                                                                |
| 18 | `@nseng-ai/pi-editor-mods` — `tools/pi-editor-mods/`                    | `internal/hosts/pi/tools/pi-editor-mods/`                               | `@internal/pi-editor-mods`                    | Move and rename. Despite existing npm/Pi installation prose, this is project-only Pi tooling by user decision.                                                                   | Set `private: true`, remove from the public release catalog, and update discovery/import metadata.                                                                                                                                                   |
| 19 | `@nseng-ai/vibechk` — `tools/vibechk/`                                  | `incubating/tools/vibechk/`                                             | `@nseng-ai/vibechk`                           | Move. External intent exists, but source-shim installation and missing publish workflow show the contract is not warranted yet.                                                  | Remove from public release catalog until its external contract and adapters are complete.                                                                                                                                                            |
| 20 | `@nseng-ai/pi` — `hosts/pi/`                                            | `incubating/hosts/pi/runtime/pi-runtime/` plus extension packages below | `@nseng-ai/pi-runtime` for retained substrate | Rename and split. Runtime helpers are reusable Pi substrate, but the package remains incubating by user decision; project behavior must leave the runtime.                       | Replace every `@nseng-ai/pi/*` import. Because every extracted Pi adapter consumes Pi Runtime, those adapters are incubating too. Remove old `@nseng-ai/pi` from the public release machinery and do not add Pi Runtime or adapters until promotion. |
| 21 | `@internal/ns-dev` — `internal/ns-dev/`                                 | `internal/dev/ns-dev/`                                                  | `@internal/ns-dev`                            | Move. Repository release/development machinery remains internal.                                                                                                                 | Keep private; update all release topology discovery for disposition roots.                                                                                                                                                                           |
| 22 | `@internal/typescript-style-guard` — `internal/typescript-style-guard/` | `internal/dev/typescript-style-guard/`                                  | `@internal/typescript-style-guard`            | Move. Repo architecture enforcement remains internal.                                                                                                                            | Keep private; replace tier-directory projection with typed disposition/ownership checks.                                                                                                                                                             |
| 23 | `@internal/ns-pi-subagents` — `internal/ns-pi-subagents/`               | `internal/hosts/pi/subagents/ns-pi-subagents/`                          | `@internal/ns-pi-subagents`                   | Move. It is project-only Pi extension/runtime infrastructure.                                                                                                                    | Keep private; depend on `@nseng-ai/pi-runtime`.                                                                                                                                                                                                      |
| 24 | `@internal/pi-tools` — `internal/pi-tools/`                             | `internal/hosts/pi/tools/pi-tools/`                                     | `@internal/pi-tools`                          | Move without splitting, by user decision. The existing subpackages remain the package's internal topology.                                                                       | Keep private. Root dev dependencies and `.pi` discovery adapters retain the package identity while paths change.                                                                                                                                     |
| 25 | `@nseng-ai/ns-init` — `incubator/ns-init/`                              | fold into `public/ns/`                                                  | no separate final identity                    | Fold into `@nseng-ai/ns`. It is private product bootstrap behavior and cannot remain a private package under `public`; a separate internal package would violate public closure. | Remove workspace package and dependency edge; preserve behavior/tests inside ns product package. **Approval required: fold rather than make `ns-init` a public extension.**                                                                          |
| 26 | `@nseng-ai/skill-exposure` — `.ns/extensions/skill-exposure/`           | `incubating/extensions/skill-exposure/`                                 | `@nseng-ai/skill-exposure`                    | Move without rename. The rule that all ns extensions initially remain incubating resolves its disposition while moving package-grade code out of `.ns/`.                         | Retain the `@nseng-ai/*` identity; its incubating dependencies are allowed.                                                                                                                                                                          |

## Pi split and extraction map

These rows create packages in addition to the 26-package baseline.

| Source surface                       | Final destination and identity                                                            | Disposition | Classification and extraction gate                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reusable helpers from `@nseng-ai/pi` | `incubating/hosts/pi/runtime/pi-runtime/` — `@nseng-ai/pi-runtime`                        | incubating  | Pi runtime substrate: runtime types, command/registration helpers, command-exec adapter, parity, session replacement, model/LM-JSON, skill expansion, errors/timers, ripgrep defaults, and terminal layout/presentation. Exclude project commands and domain behavior.                                 |
| `branch-context/src/pi`              | `incubating/hosts/pi/extensions/pi-ns-branch-context/` — `@nseng-ai/pi-ns-branch-context` | incubating  | ns-backed Pi adapter. Consume `@nseng-ai/branch-context/api`, `@nseng-ai/plans/api`, and `@nseng-ai/pi-runtime`. Its `@nseng-ai/pi/grill/surfaces` edge cannot follow Grill into internal space: move the narrow host-neutral activation contract into Pi Runtime or remove that optional integration. |
| `handoffs/src/pi`                    | `incubating/hosts/pi/extensions/pi-ns-handoffs/` — `@nseng-ai/pi-ns-handoffs`             | incubating  | ns-backed Pi adapter. Consume `@nseng-ai/handoffs/api` and runtime. Move handoff launch presentation here; expose harness-independent launch planning from Handoffs if needed.                                                                                                                         |
| `objectives/src/pi`                  | `incubating/hosts/pi/extensions/pi-ns-objectives/` — `@nseng-ai/pi-ns-objectives`         | incubating  | ns-backed Pi adapter. Consume `@nseng-ai/objectives/api` and runtime. The large adapter must not preserve imports from Objective private command modules.                                                                                                                                              |
| `flow/src/pi`                        | `incubating/hosts/pi/extensions/pi-ns-flow/` — `@nseng-ai/pi-ns-flow`                     | incubating  | ns-backed Pi adapter. Current `ns-extension.ts` imports private Flow command implementation; add/narrow curated Flow APIs before extraction.                                                                                                                                                           |
| `herdr/src/pi`                       | `incubating/hosts/pi/extensions/pi-ns-herdr/` — `@nseng-ai/pi-ns-herdr`                   | incubating  | ns-backed Pi adapter. Current core imports Branch Context Pi formatting and Pi code imports Handoffs Pi launch; move formatting/launch planning to harness-independent curated APIs before extraction.                                                                                                 |
| `hosts/pi/src/core/pr`               | `incubating/hosts/pi/extensions/pi-ns-pr-feedback/` — `@nseng-ai/pi-ns-pr-feedback`       | incubating  | ns-backed PR Feedback presentation. Consume `@nseng-ai/pr-feedback/api`; no host-private Address behavior remains in runtime. The `pi-ns-pr-feedback` identity is approved.                                                                                                                            |
| `hosts/pi/src/worktree-status`       | `internal/hosts/pi/extensions/worktree-status/` — `@internal/worktree-status`             | internal    | Pi-native repo status/footer extension. Natural name because it does not adapt an ns extension. Private internal disposition approved.                                                                                                                                                                 |
| host model-shortcuts surface         | `internal/hosts/pi/extensions/model-shortcuts/` — `@internal/model-shortcuts`             | internal    | Pi-native repo configuration UX; keep out of reusable runtime.                                                                                                                                                                                                                                         |
| host harness-session surface         | `internal/hosts/pi/extensions/harness-session/` — `@internal/harness-session`             | internal    | Pi-native repo session behavior; keep out of reusable runtime.                                                                                                                                                                                                                                         |

### Internal Pi tools retained as one package

`@internal/pi-tools` remains one private container package at
`internal/hosts/pi/tools/pi-tools/`. Its existing nine `ns.subpackages` units remain inside
that package: `backing-skill-commands`, `code-workflows`, `context-profiler`, `grill`,
`pr-feedback-watch`, `side-session`, `slash-command-rerank`, `stack-view`, and
`thermo-council`.

## Dependency consequences that must be designed before cutover

1. **Objectives → Flow:** both packages are incubating, so the current runtime edge is
   allowed by disposition closure. Curated API and architectural tier rules still apply;
   disposition no longer forces an extraction solely to make Objectives public.
2. **ns product closure:** folding ns-init removes one private dependency. Because all ns
   extensions are incubating, public `@nseng-ai/ns` must remove or fold its runtime source
   dependencies on Branch Context and Harness Artifacts. Product preparation must not pull
   incubating or internal source transitively.
3. **Pi runtime closure:** incubating `@nseng-ai/pi-runtime` must not depend on project
   behavior that belongs in a Pi adapter or internal tool. It may depend on public or
   incubating packages, but PR Feedback presentation and repo-specific extensions still
   leave the runtime.
4. **Pi adapter APIs:** each `pi-ns-*` package imports its extension's curated `/api` surface
   and `@nseng-ai/pi-runtime`; private source imports are migration blockers. Flow, Herdr,
   Handoffs, and Objectives need focused API audits. Branch Context's current Grill surface
   edge must become a narrow incubating Pi Runtime contract or be removed; an incubating
   adapter may not depend on internal Grill.
5. **Internal scope:** all internal leaves are `private: true`, use `@internal/*`, and have no
   public/incubating runtime consumer. Internal-to-incubating/public dependencies remain
   allowed.
6. **Release catalog:** derive release candidates from `public/` plus explicit package
   qualification rules rather than the current hard-coded intended-public set. Remove every
   extension, Pi Editor Mods, Vibechk, and old Pi entries. Do not add Pi Runtime or any
   `pi-ns-*` adapter until they are promoted from incubating.
7. **Workspace discovery:** replace current role-directory globs and `.ns/extensions/*`
   workspace inclusion with the three recursive disposition roots. Discovery must reject a
   package outside those roots.

## Identity and path checks

The final guard must verify for every workspace manifest:

- first segment is exactly `public`, `incubating`, or `internal`;
- package leaf equals the unscoped npm name;
- no two packages share a leaf, even across scopes or dispositions;
- public/incubating use `@nseng-ai/*`; internal uses `@internal/*` and `private: true`;
- disposition closure follows ADR 0045's matrix;
- current `ns.tier` values and tier dependency rules remain independently valid;
- ns extensions have no `pi` subpackage/export, upstream Pi dependency, or Pi registration;
- every `pi-ns-*` package is under a Pi host `extensions/` category and depends on the
  corresponding extension API without deep imports.

## Documentation and reference reconciliation

The coordinated migration must update at least:

- `ts/packages/README.md` to the final shared contract;
- `ts/packages/{public,incubating,internal}/hosts/pi/README.md` only as needed, with one
  authoritative Pi ontology document rather than duplicated rules;
- `ts/pnpm-workspace.yaml`, lockfile, release package-set code, package preparation, tests,
  Just recipes, and path-based scripts;
- root `CONTEXT.md`, `CONTEXT-MAP.md`, package `CONTEXT.md` files, and package READMEs;
- `.pi/extensions/*` discovery adapters and parity source-package identities;
- active Objective guidance, especially `professional-repo-curation`;
- mutable guides/conventions that state old paths. Historical ADRs and immutable Objective
  updates are not rewritten.

## Approved reconciliation for `professional-repo-curation`

The approved design requires the parent Objective and orientation to replace these live
claims:

- Replace the “two-zone” and flat `incubator/` destination with the three-disposition model.
- Replace the clean→incubator invariant with disposition closure.
- Treat package placement as owned by this Subobjective, not an open parent decision.
- Preserve the parent's presentation, checkout-free ship, privacy, operational-decoupling,
  and transfer responsibilities.
- Replace “remaining incubator resident” synthesis with explicit disposition and support
  claims derived from the landed map.

Approved parent direction:

> Transfer this repository in place after professional presentation, checkout-free product
> paths, and the approved public/incubating/internal package disposition model are landed
> and enforced. The package-ontology Subobjective owns the atomic tree cutover and host
> separation; the parent owns presentation, transfer readiness, and synthesis of which
> public packages are actually presented as supported product surfaces.

## Approval checklist

Recorded user decisions:

1. `@nseng-ai/objectives` is incubating; its Flow edge does not require repair solely for
   disposition closure.
2. `@nseng-ai/packagechk` is public.
3. `@nseng-ai/pi-runtime` is incubating; therefore every `pi-ns-*` adapter that consumes it
   is incubating too.
4. `@internal/pi-tools` remains one private package; it is not split during this cutover.
   Its README lists the nine current tools and records a near-term follow-up to reorganize
   them into separate subfolders inside the package.
5. Private `@nseng-ai/ns-init` folds into `@nseng-ai/ns`.
6. Skill Exposure remains `@nseng-ai/skill-exposure` and moves to
   `incubating/extensions/skill-exposure/` under the rule that all ns extensions initially
   remain incubating.
7. The PR Feedback Pi adapter identity is `@nseng-ai/pi-ns-pr-feedback`, not
   `pi-ns-address`.
8. Worktree Status remains private as `@internal/worktree-status`.
9. SDK and Extension Kit are direct disposition-root leaves (`public/sdk/` and
   `public/extension-kit/`), without redundant category nesting.
10. Every ns extension is incubating for the initial organizational cutover.
11. Pi Editor Mods is internal as `@internal/pi-editor-mods`.

Whole-map approval was granted on 2026-07-25. The approval authorizes implementation-stack
design next; it does not itself authorize package moves or external publication.
