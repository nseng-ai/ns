# Port the asdl Toolkit to TypeScript

## Thesis

Port the active first-party asdl toolkit from Python to idiomatic TypeScript so the same capability set can integrate cleanly with Pi, server-side web surfaces, and standard Node/npm distribution while converging on one implementation language.

The migration should proceed through production vertical slices, not a blind module-for-module rewrite. Each slice should preserve stable user-facing CLI and skill contracts while replacing the implementation with TypeScript, extracting shared TS foundations only as repeated seams become real.

`pr-address` is the first proving slice. Its detailed operation inventory, architecture, and cutover plan belong in a separate capability subobjective. Its completed TypeScript cutover is now the first production reference for later capability ports; reusable lessons live in [`porting-playbook.md`](porting-playbook.md).

## Scope

- Active first-party user-facing CLI and skill-backed capabilities.
- Shared core dependencies required by those capabilities.
- Stable command, JSON, wrapper, and documentation contracts needed for TS takeover.
- A gradually emerging internal JS/TS clinkr-style command framework.
- Adapter-neutral core logic reusable from Pi integrations and server-side web code.
- Explicit per-capability CLI distribution decisions for local-checkout development and installed skill use. npm/pnpm packaging remains the default TS toolchain direction, but a capability may accept another documented TS-backed model when real consumers do not require registry or checkout-free execution.
- A lightweight migration ledger that records capability status and rationale for parked, retired, or out-of-scope Python paths.

## Migration Ledger

Initial status classes are planning guidance for the port, not a substitute for per-capability subobjectives. `TS-default` means the active implementation is already TypeScript for the relevant user-facing path. `Unstarted` means the capability is in scope but still Python-backed or not yet evaluated for cutover. `Parked pending evidence` means the repo contains a first-party package or skill, but the umbrella Objective needs active-use or strategic-value evidence before committing to a port.

| Capability                                    | Status                                  | Rationale / evidence                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr-address`                                  | TS-default; completed first cutover     | Standalone TypeScript `pr-address` CLI is the sole active surface; the `asdl pr-address` plugin is retired, `packages/asdl-pr-address` is deleted, the golden corpus lives under `ts/packages/pr-address`, rollback is external PyPI `asdl-pr-address==0.1.1`, and the accepted installed model is the run-from-source shim rather than checkout-free bundling or npm publish.                                                     |
| Branch Memory / `brmem`                       | TS-default; completed second cutover    | Standalone `ts/packages/brmem` library and CLI are the active public surface; the TypeScript shim is installed by `just install-brmem` / `install-tools`; `packages/brmem` is deleted from tracked active paths; rollback/reference evidence is in-repo commit `44c3e9992b424c4b174ccaeb9f4567bb8f611dc1`; direct native-library consumer migration remains parked while existing consumers use the public CLI shell-out boundary. |
| Objectives / `objective`                      | Unstarted                               | Objective skill family and `asdl-objectives` CLI are active coordination surfaces.                                                                                                                                                                                                                                                                                                                                                 |
| Handoff / `handoff`                           | TS-default; completed third cutover     | Standalone TypeScript `@asdl/handoff` CLI is the active public inventory/admin surface; `packages/asdl-handoff` and the `asdl handoff` plugin path are retired, the shim is installed by `just install-handoff` / `install-tools`, create/pickup remain Pi/skill workflows over Branch Memory, and rollback/reference evidence is in-repo commit `c7953b640c94fad4182df35c277fe19dfbe5eca7`.                                       |
| Branch retrospectives / `aretro`              | Unstarted                               | Public `branch-retro` skill wraps the `aretro` CLI for deterministic retrospective evidence.                                                                                                                                                                                                                                                                                                                                       |
| Roaster / review workflows                    | Unstarted                               | First-party `roaster` CLI and plugin support review/addressing workflows with recent Objective history.                                                                                                                                                                                                                                                                                                                            |
| Slots / `slot`                                | Unstarted                               | First-party `asdl-slots` CLI and plugin support slot/Graphite workflow concepts referenced by repo policy.                                                                                                                                                                                                                                                                                                                         |
| Vibe check / `vibechk`                        | Unstarted pending subobjective evidence | First-party CLI and open `vibechk-v1` Objective indicate likely active value; confirm scope before porting.                                                                                                                                                                                                                                                                                                                        |
| `asdl-dev` code workflow CLI                  | TS-default                              | Existing TS package backs checkpoint, submit, preview-url, and related code workflow skills.                                                                                                                                                                                                                                                                                                                                       |
| Planned Branch                                | TS-default                              | Existing TS package and Pi/skill surfaces already cover planned-branch workflows.                                                                                                                                                                                                                                                                                                                                                  |
| Pi extension / CCC runtime surfaces           | TS-default foundation                   | Existing TS packages provide Pi extension, command-control, and runtime integration surfaces.                                                                                                                                                                                                                                                                                                                                      |
| `ts-plans`                                    | TS-default foundation                   | Existing TS package supports trusted TypeScript recipe plans.                                                                                                                                                                                                                                                                                                                                                                      |
| Python `asdl-core`                            | Reference source; not direct port       | Treat as domain-contract and fixture source; port concepts only as proven TS seams.                                                                                                                                                                                                                                                                                                                                                |
| `areg`                                        | Parked pending evidence                 | First-party CLI exists, but active user-facing value needs confirmation before committing to a port.                                                                                                                                                                                                                                                                                                                               |
| `packagechk`                                  | Parked pending evidence                 | First-party CLI exists, but active user-facing value needs confirmation before committing to a port.                                                                                                                                                                                                                                                                                                                               |
| `asdl-dispatcher` / `dispatcher`              | Unstarted                               | First-party CLI/plugin exists and is strategically important for coding-task dispatch, even though the current Python surface is thin.                                                                                                                                                                                                                                                                                             |
| Python-specific project creation/setup skills | Out of scope unless redefined           | These are authoring/setup workflows for Python packages or repo scaffolding, not necessarily active toolkit runtime capabilities.                                                                                                                                                                                                                                                                                                  |

## Planned Capability Order

The durable default sequence is:

1. `pr-address`
2. Branch Memory / `brmem`
3. Handoff / `handoff`
4. Objectives / `objective`
5. `asdl-dispatcher` / `dispatcher`
6. Roaster / review workflows
7. Slots / `slot`
8. Vibe check / `vibechk`
9. Branch retrospectives / `aretro`

`aretro` is intentionally last so retrospective/evidence-analysis work benefits from mature git, Graphite, command-runtime, and evidence payload foundations rather than driving early architecture. `asdl-dispatcher` is promoted into the in-scope sequence because coding-task dispatch is strategically important for future agent orchestration.

## Non-Goals

- No workflow or CLI/skill contract redesign by default; breaking contract improvements require explicit subobjective approval and compatibility notes.
- No blind Python module-for-module port.
- No speculative rewrite of inactive, vendored, experimental, or unclear-value Python code.
- No requirement that every toolkit capability run directly in browsers.
- No broad shared-platform rewrite before vertical slices prove the seams.
- No long-term Python fallback for capabilities that have completed TS cutover and retirement.

## Completion Criteria

- All active first-party user-facing capabilities run through TypeScript by default.
- Python fallbacks for in-scope capabilities have passed through an explicit short retirement phase and are deleted, archived, or otherwise removed from active paths.
- Remaining Python code is explicitly marked out of scope, retired, archived, or retained only for a documented non-toolkit reason.
- Public skills, wrappers, README/developer docs, and distribution instructions point at TypeScript-backed paths and each capability's accepted distribution model.
- Shared TS foundations cover recurring seams such as command runtime, gateway interfaces, schemas, structured failures, and golden-test support.
- The migration ledger records final status and rationale for every active first-party capability considered by the objective.
- A reusable porting playbook has been refined from the first full capability cutover and applied to later subobjectives.

## Assumptions and Risks

Assumptions:

- Active user-facing toolkit value is concentrated in first-party CLI and skill-backed capabilities, not every historical Python package or module.
- Stable CLI/skill contracts plus golden/scenario coverage are sufficient to let implementations change language without disrupting agents and users.
- The existing TS workspace direction—pnpm workspaces, Node ESM, strict TypeScript, and Vitest—is the right default toolchain for the migration.
- Server-side web integration is the primary web requirement for most toolkit capabilities; direct browser execution is only needed where the domain naturally supports it.
- Shared TS foundations will be better shaped by repeated vertical slices than by porting Python `asdl-core` as a module map up front.
- The `pr-address` and `brmem` cutovers confirm this direction: package-local seams can prove runtime, payload/reference, git-gateway, wrapper, and deletion behavior before only repeated framework gaps move into shared TS packages.

Risks:

- Keeping Python fallback paths too long could undermine the single-language goal and create duplicated maintenance surfaces.
- Deleting Python too aggressively could remove a useful rollback/reference path before TS contracts and fixtures are mature.
- A first capability slice could overfit shared abstractions to `pr-address`; second-use extraction and the reusable porting playbook mitigate this by treating `pr-address` as evidence, not as a universal template.
- Existing tests or golden fixtures may encode accidental behavior; each subobjective must distinguish durable contract from incidental implementation detail.
- Distribution, installed-skill wrapper behavior, and Pi integration may expose packaging constraints not visible in the previous Python/uvx model. `pr-address` and `brmem` deliberately accepted run-from-source shims with checkout and `ts/node_modules` preconditions; future ports must make their own consumer-backed distribution decision.
- Some Python capabilities may have unclear current value; porting them without evidence would distract from the living toolkit.

## Open Questions

- Which remaining parked ledger entries have enough active-use or strategic-value evidence to promote into in-scope capability subobjectives?
- Resolved (2026-06-10): the internal JS/TS clinkr foundation ships as two repo-private workspace packages — `@asdl/clinkr` (schema-first command framework) and `@asdl/core` (foundation modules: primitives, exec runtime, brmem-cli, with gateways and testing exports to follow). Both unpublished by design; tracked by the `ts-cli-foundation` subobjective.
- What is the minimal compatibility window for each Python fallback retirement phase?
- Resolved (2026-06-13): `brmem` follows `pr-address`, holding the persisted order. Fresh integration-leverage evidence confirmed rather than changed it — existing TypeScript code already depended on `brmem` (the `@asdl/core` launcher and `branch-context` gateway) before the capability became TS-default. The `brmem-typescript-port` subobjective now records the completed second cutover.
- Resolved (2026-06-13): the reusable playbook from the first full cutover lives in `.asdl/objectives/port-asdl-toolkit-to-typescript/porting-playbook.md` and is linked from the umbrella roadmap.
