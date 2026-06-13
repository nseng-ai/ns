# Port brmem to TypeScript

## Thesis

`brmem` (Branch Memory) should become TypeScript-backed by default as the second production vertical slice of the broader asdl toolkit migration, applying the reusable porting playbook refined from the `pr-address` cutover. The port should preserve the existing public skill, CLI, JSON-envelope, exit-code, and git-ref storage contracts while replacing the Python implementation with idiomatic, testable TypeScript.

`brmem` differs from `pr-address` in three ways that shape this slice: it is foundational rather than a leaf (sibling capabilities consume it), its durable state is a cross-language git-ref layout that Python and TypeScript must both read and write interchangeably during transition, and it has no `asdl` plugin to retire — only a standalone `brmem` console script. Those differences make git-ref storage parity, not GitHub mutation safety, the central correctness concern.

The new implementation lives in a standalone `ts/packages/brmem` package that exports both a reusable library and the CLI, mirroring the deliberate self-containment of the Python `brmem` package and keeping it importable by sibling TypeScript consumers. Native brmem proves the git ref/blob/tree plumbing seam that later capability ports and consumers will reuse.

## Scope

- Public `brmem` skill invocation and the standalone `brmem` CLI in both local-checkout and installed-skill contexts.
- The current user-facing operation set: `put`, `get`, `delete`, `list`, `check`, `copy`, `export`, and the skill-facing `exec resolve-prompt`. This includes their flags (`--branch`, `--namespace`, `--base`, `--all-branches`, `--at`, `--file`, `--stdin`, `--force`, `--format json`, `--output-dir`, `--overwrite`, `--dry-run`, `--key-glob`, `--from-branch`, `--to-branch`) and `--format json` machine envelopes.
- The git-ref storage contract: the `refs/brmem/base/<encoded-branch>` and `refs/brmem/ns/<namespace>/<encoded-branch>` layout, branch encoding (`/` → `---`), per-`(namespace, branch)` snapshot trees with entries as blobs at `<key>`, and the `<snapshot-ref>:<key>` Entry Locator. TypeScript-written and Python-written entries must be mutually readable through the same refs.
- Entry Key validation rules, Namespace rules (single path segment, reserved `base`), and content limits (UTF-8 text, binary rejection, 1 MiB cap unless `--force`).
- Exit-code semantics, especially `check` returning `0` present / `1` absent / `2` invalid-or-failure, and the documented abort behaviors (existing entry, invalid key, detached HEAD, copy conflict).
- `exec resolve-prompt` behavior: `.brmem/prompts/...` project/global tier resolution, `data.path` / `data.tier` JSON output, and exit-`2` failure surfacing.
- A standalone TypeScript library API plus a git gateway boundary capable of ref/blob/tree plumbing (`update-ref`, `commit-tree`, `for-each-ref`, `show`, current-branch and detached-HEAD detection), with in-memory fakes.
- Scenario, golden, and contract parity evidence sufficient to preserve stable behavior while identifying accidental Python implementation details.
- Run-from-source wrapper distribution for installed skill usage, following the accepted `pr-address` model: a shim installed by a `just` recipe that runs the checkout's TypeScript CLI, allowed to require an asdl checkout with `ts/node_modules`.
- Short, explicit Python fallback retirement after TypeScript default behavior is proven, ending in deletion of `packages/brmem` from active paths.

## Non-Goals

- No user-facing `brmem` workflow or command-surface redesign by default; breaking contract changes require explicit approval and compatibility rationale.
- No blind module-for-module port of the Python `brmem` package or of Python `asdl-core` git helpers.
- No change to the git-ref storage layout, branch encoding, Entry Locator shape, or Entry Key / Namespace rules while Python and TypeScript must interoperate; any change requires an explicit cross-language migration decision.
- No rewiring of existing TypeScript consumers in this Objective. Migrating `@asdl/core/brmem-cli.ts` (the shell-out launcher) and `branch-context/brmem-gateway.ts` onto native brmem is deliberate follow-up, tracked separately; this Objective only delivers native brmem and proves it can back them.
- No extraction of a shared git ref/blob/tree gateway into `@asdl/core` until a second consumer proves the seam. Keep brmem-specific git plumbing package-local; coordinate only genuinely reusable gaps with `ts-cli-foundation`.
- No direct browser-compatibility requirement; brmem depends on local git state.
- No npm registry publish requirement for cutover.
- No long-term Python fallback after cutover criteria are met.

## Completion Criteria

- The current public `brmem` CLI, skill, JSON-envelope, exit-code, git-ref storage, and validation contracts are inventoried and classified as durable contract versus incidental Python behavior before the implementation is designed.
- A TypeScript implementation in `ts/packages/brmem` becomes the default for public `brmem` invocation in local-checkout and installed-skill contexts, exposing both a reusable library and the CLI built through `@asdl/clinkr`.
- All eight operations (`put`, `get`, `delete`, `list`, `check`, `copy`, `export`, `exec resolve-prompt`) preserve their flags, human output, `--format json` envelopes, exit codes, and abort behaviors, or change them only with explicit compatibility rationale and tests.
- The git-ref storage layout, branch encoding, snapshot-tree shape, and Entry Locator are byte-compatible with the Python implementation: an entry written by one implementation is readable and listable by the other through the same refs, proven by cross-language parity evidence.
- Entry Key validation, Namespace rules, and content limits (UTF-8, binary rejection, 1 MiB `--force` cap) match the Python contract.
- Fake-driven unit and scenario tests, golden/contract parity, and limited safe real-git smoke evidence cover the migration; the git gateway has its own real-adapter tests while the Python reference is in-repo.
- Public skill docs, wrapper behavior, and developer/distribution docs point to the TypeScript path: local-checkout execution plus the accepted run-from-source installed shim.
- Python fallback has a short explicit retirement phase ending in deletion of `packages/brmem` from active paths once parity and distribution evidence exist; rollback after deletion is recorded explicitly (in-repo git history and/or a frozen external artifact).
- Lessons and any reusable git ref/blob/tree seam are fed back to the umbrella playbook and, where a second consumer proves the seam, recommended to `ts-cli-foundation`.

## Definition of Progress

Progress is keepable when it moves `brmem` toward TypeScript-default behavior while preserving or explicitly reclassifying public and storage contracts.

Keepable progress should do at least one of the following:

- Port a coherent operation slice to TypeScript with the smallest local runtime, schema, and git-gateway seams that slice needs.
- Add or strengthen fake-driven unit, scenario, golden, cross-language git-ref parity, or safe real-git smoke evidence for preserved behavior.
- Reduce active Python fallback scope after TypeScript parity for the affected surface is proven.
- Clarify public contract, storage-interop, distribution, or wrapper compatibility decisions in checked-in docs or Objective updates.
- Feed a proven, repeated git-plumbing or migration seam into the umbrella playbook.

Do not keep changes that:

- Alter the git-ref layout, branch encoding, Entry Locator, Entry Key rules, Namespace rules, or content limits without an explicit cross-language compatibility decision and tests.
- Change public CLI, JSON-envelope, or exit-code behavior without explicit rationale and tests.
- Extract a shared git gateway into `@asdl/core` before a second consumer proves the seam.
- Rewire existing TypeScript consumers (`@asdl/core` launcher, branch-context gateway) — that is out of scope for this Objective.
- Remove the Python fallback for a surface before equivalent TypeScript behavior, docs, and invocation paths are covered.

Useful evidence includes targeted Vitest/TypeScript tests, cross-language parity probes against Python-written refs, fake-driven git/filesystem/process gateway tests, safe read-only real-git smoke evidence, and Semantic Updates recording compatibility decisions, deliberate contract changes, cutover decisions, and fallback-retirement evidence.

## Runner Policy

This Objective is execution-friendly for `objective-next` across every non-parked roadmap row under the boundaries below. A runner may preview a single coherent slice, then execute it after user confirmation without needing a new policy change.

- Direct execution is allowed when the slice is confined to repository files and local validation: TypeScript package code, tests, wrappers, checked-in docs, Objective files, and golden/parity fixtures, including parity probes that read and write `refs/brmem/...` in a local throwaway test repository.
- Direct execution should prefer vertical operation slices over framework-first work, starting from the git-ref storage and gateway seam, then a first read-only operation, then the remaining operations on proven seams.
- Steer or ask first when a slice would intentionally change public contracts, the git-ref storage layout, branch encoding, Entry Locator, Entry Key or Namespace rules, content limits, JSON-envelope or exit-code semantics, wrapper/installed-skill behavior, or fallback-retirement timing.
- Ask before deleting `packages/brmem` or other broad Python areas, extracting a shared git gateway into `@asdl/core`, or rewiring existing TypeScript consumers.
- No external write-capable actions are in scope: no PR submission, no npm/PyPI publishing, and no writes to refs outside a local throwaway test repository. brmem performs no GitHub or network operations.
- Validation before keeping work should be targeted to the slice first (`pnpm --dir ts/packages/brmem run check` / `run test`), then broaden to package/workspace checks when the slice touches shared wrappers, distribution, or workspace config; deletion rows broaden to full `just`. If full validation is expensive or blocked, record the exact narrower evidence and blocker.
- Work may be left as a normal repository diff containing code, tests, docs, and Objective updates. Do not leave generated export files, stray `refs/brmem/...` in the working repository, or unstated compatibility changes.
- Roadmap row-level `Policy:` notes refine these defaults for that row; they do not create hidden state or a task queue.

## Assumptions and Risks

Assumptions:

- Stable `brmem` contracts can be preserved through JSON-envelope checks, scenario tests, golden fixtures, exit-code assertions, and cross-language git-ref parity probes.
- The strongest current public-contract sources are the public skill (`.agents/skills/brmem/SKILL.md`), the package `AGENTS.md`, source group registration (`packages/brmem/src/brmem/group.py`), `ref_layout.py` / `key_validation.py` / `content_limits.py`, and the package's scenario/unit tests. Treat these as stronger compatibility evidence than partial prose when sources disagree.
- The current TypeScript workspace is the right home: pnpm workspaces, Node ESM, strict TypeScript, Vitest, and command shells built through `@asdl/clinkr`.
- brmem's only external dependency is local git; preserving the ref layout and Entry Locator is sufficient for Python/TypeScript interoperability during transition.
- The run-from-source shim accepted for `pr-address` is an adequate installed model for `brmem`; checkout-free bundling and npm publish are not required for cutover.
- Sibling TypeScript consumers can continue shelling out to the `brmem` CLI through the existing `@asdl/core` launcher until their own follow-up migration; native brmem does not need to rewire them to be the default.

Risks:

- Git-ref plumbing parity is the central risk: branch encoding (`/` → `---`), snapshot-tree construction, `commit-tree`/`update-ref` semantics, and Entry Locator formatting must match Python exactly, or Python- and TypeScript-written entries diverge and silently stop interoperating. Initial mitigation is now in place through cross-language round-trip parity probes in throwaway repositories while the Python reference remains in-repo; keep extending that evidence as write/export/prompt CLI behavior lands.
- The shared TypeScript git gateway is still in-flight under `ts-cli-foundation`. brmem needs ref/blob/tree plumbing heavier than ordinary git facts; if it waits on a shared gateway it may stall, and if it over-generalizes early it may overfit. Mitigation: keep brmem's git plumbing package-local, mirroring the pr-address↔clinkr ownership split, and promote only a proven, second-consumer seam to `ts-cli-foundation`.
- Exit-code and abort-path contracts (`check` `0/1/2`, copy-conflict abort, detached-HEAD-when-branch-omitted, existing-entry abort) are easy to get subtly wrong and are load-bearing for the skill's documented behavior; they need explicit tests, not just happy-path coverage.
- Some Python tests or fixtures may encode accidental implementation behavior rather than durable contract; each slice must distinguish the two before pinning a fixture.
- Deleting `packages/brmem` too early could remove a useful rollback/reference and cross-language parity oracle before TypeScript contracts are mature; deletion is gated on parity, distribution, and skill-doc evidence.
- Keeping the Python fallback too long undermines the single-language goal and leaves two implementations writing the same refs; the retirement phase should be short and explicit once parity is proven.
- Scope creep into consumer migration (`@asdl/core` launcher, branch-context gateway) would blur this Objective's boundary; that work is deliberately deferred.
- **Temporary CI dependency to remove at cutover:** the cross-language parity tests (`ts/packages/brmem/test/gateways/python-parity.test.ts`) shell out to the Python `brmem` CLI via `uv`, so the `typescript` job in `.github/workflows/ci.yml` now runs `./.github/actions/setup-python-uv` (Python + `uv` + `uv sync`). This couples the otherwise pure-TypeScript CI job to the Python toolchain. When the Python reference is retired (parity tests deleted alongside `packages/brmem`), **uninstall that dependency**: remove the `setup-python-uv` step from the `typescript` job so the TS pipeline stops depending on Python/`uv`.

## Open Questions

- Which `--format json` envelopes and `list`/`check`/`export`/`copy` outputs require byte-for-byte parity, and which are structured compatibility where key order or formatting may intentionally differ?
- The initial cross-language parity probe set now covers Python-written Base/named/nested Entries read and listed by TypeScript, TypeScript-written workflow Namespace Entries read and checked by Python, and TypeScript key-glob copy preserving Python-readable destination Entries. Remaining parity work should add probes only when new public CLI surfaces (`put`, `delete`, `copy`, `export`, `exec resolve-prompt`) expose behavior not already covered by the storage seam.
- Which git ref/blob/tree plumbing pieces, if any, are reusable enough to belong in a shared `@asdl/core` gateway, and only after which second consumer proves the seam?
- What is the post-deletion rollback reference for `packages/brmem` — in-repo git history alone, or a frozen external artifact — and what compatibility window precedes deletion?
- Does `exec resolve-prompt`'s `.brmem/prompts/...` project/global tier resolution have filesystem-layout details (search order, global location) that must be reproduced exactly versus reclassified?
