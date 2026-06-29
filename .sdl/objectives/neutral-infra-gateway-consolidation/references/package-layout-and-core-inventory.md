# Package Layout and `@sdl/core` Inventory Reference

## Purpose

This reference captures the package-layout analysis behind the final shape of the
`neutral-infra-gateway-consolidation` Objective. It is not a roadmap checklist; it is a durable
orientation aid for future migration slices, especially the final capability-reorganization cleanup.

## End-state package layout

### `@sdl/core` / eventual pure utility package

The current `@sdl/core` name is misleading once this Objective lands. Its target role is only pure
neutral-infra utilities: deterministic transforms, value/result shapes, text helpers, slug parsing,
formatting helpers, and other functions with no real-world I/O, no runtime wiring, no host-service
semantics, and no external-tool wrappers.

Likely remaining exports/classes of exports after decomposition:

- text normalization/truncation/table/presentation helpers
- terminal escape/presentation helpers that only transform strings
- result/error formatting and primitive record/path/hash helpers
- branch/model parsing pieces that are pure
- markdown/frontmatter and managed-region helpers
- `machine-envelope` only after removing its dependency on `exec`
- `runner-usage` if confirmed I/O-free

No remaining export should perform subprocess work, git/GitHub I/O, filesystem writes, stdin reads,
time/timer service work, runtime bootstrapping, or capability-domain behavior.

The package may deserve a later rename (for example `@sdl/pure`, `@sdl/neutral`, or another name)
after non-pure doors are gone. The rename itself is not required to complete the current gateway
migration unless the Objective is explicitly extended again.

### `@sdl/capability-kit`

Capability Kit owns capability-facing gateway seams:

- per-domain interfaces and shared result/error shapes
- in-memory fakes and testing support
- light adapters/factories that connect SDK `ctx` facilities to capability gateway interfaces
- small first-party capability-building helpers when SDK/kernel are the wrong home

Likely seams include:

- `@sdl/capability-kit/git` and `/git/testing`
- an execution seam for command execution / child-process result handling
- `@sdl/capability-kit/github/*`
- `@sdl/capability-kit/xdg`
- `@sdl/capability-kit/temp-files`
- `@sdl/capability-kit/workspace-root`
- `@sdl/capability-kit/shell`
- `@sdl/capability-kit/text-repair`

ADR 0019 is the controlling rule for real implementations: large real adapters do not automatically
move wholesale into Capability Kit. Capability Kit should stay a seam/fake/light-adapter substrate,
not become a dumping ground for every complex real gateway implementation.

### Standalone real gateway packages

Complex reusable real implementations may remain standalone or move to dedicated real packages when
ADR 0019's placement gate says folding them into Capability Kit would bloat the kit or create awkward
reuse/dependency pressure.

Likely candidates:

- `RealGitGateway` / real git implementation
- real child-process execution adapter
- complex GitHub PR-feedback and PR-status implementations
- `@sdl/graphite`
- `@sdl/cmux`

These packages are still outside `@sdl/core`. Capabilities should consume kit seams, not raw real
adapters directly.

### `sdl-sdk`

`sdl-sdk` owns author-facing interfaces and types for intrinsic host services reached through the
vended API object (`ctx`). Examples:

- command I/O
- progress
- stdin/input
- clock/time
- timers
- stable execution result/formatting types only where they are part of `ctx.exec` semantics

The SDK should not become a dumping ground for derived external-tool gateways such as git or GitHub.

### `@sdl/kernel`

The kernel owns hidden implementations and runtime wiring for SDK-provided services, plus runtime
harness code that creates/wires the vended API object. `cli-entry` or its replacement likely belongs
here or in a named neutral CLI-runtime infra package.

### Capability packages

Capability packages should be reorganized at the end of this Objective so their imports and local
module layout reflect the final seams:

- no imports from old `@sdl/core/exec`, `@sdl/core/git`, or other raw-I/O doors
- gateway dependencies via injected `@sdl/capability-kit/<domain>` seams
- intrinsic host services via `ctx` / `sdl-sdk` interfaces
- capability-to-capability dependencies only through curated `@sdl/<cap>/api` surfaces
- no product-domain behavior pushed into Capability Kit or SDK just to share code

This final reorganization is package/import/layout cleanup, not a redesign of capability behavior,
commands, or product policy.

## Current `@sdl/core` inventory at the time of this reference

### Pure-ish utilities

These are the parts most likely to remain in the pure package, subject to final I/O inspection:

- `@sdl/core` root (`formatErrorMessage`, `isPathInside`, `isRecord`, `sha256Digest`,
  `truncatedSha256Digest`)
- `@sdl/core/branch-slug`
- `@sdl/core/primitives`
- `@sdl/core/result`
- `@sdl/core/markdown-frontmatter`
- `@sdl/core/managed-region`
- `@sdl/core/text-table`
- `@sdl/core/terminal-escapes`
- `@sdl/core/terminal-presentation`
- `@sdl/core/text-normalization`
- `@sdl/core/text-truncation`
- `@sdl/core/time-format`
- `@sdl/core/runner-usage`
- `@sdl/core/machine-envelope` after removing the pure helper dependency it currently takes from
  `exec`
- the pure parsing part of `@sdl/core/model-slug`

### Real I/O / external-tool gateways

These are a bad fit for `@sdl/core` and are direct Objective migration targets:

- `@sdl/core/exec`
- `@sdl/core/git`
- `@sdl/core/git/testing`
- `@sdl/core/github-cli`
- `@sdl/core/github-pr-feedback`
- `@sdl/core/github-identity`
- `@sdl/core/github-pr-status`
- `@sdl/core/text-repair`
- the non-pure subprocess/environment part of `@sdl/core/model-slug`

### Filesystem / environment helpers

These are precise environment/resource helpers, not pure utilities:

- `@sdl/core/xdg`
- `@sdl/core/temp-files`
- `@sdl/core/workspace-root`
- `@sdl/core/shell-support`

They should move to appropriate kit seams or other ADR 0019-selected homes; do not replace them with
a generic filesystem gateway.

### SDK / host services

These are intrinsic host services and should become `sdl-sdk` interfaces plus hidden kernel
implementations:

- `@sdl/core/command-io`
- `@sdl/core/progress-phase`
- `@sdl/core/stdin`
- `@sdl/core/clock`
- `@sdl/core/timers`

### Runtime harness

- `@sdl/core/cli-entry` — runtime/program boot code, not a pure utility concern.

### Exception / debt

- `@sdl/core/brmem-cli` — exception-adjacent brmem helper; brmem relocation is parked for a separate
  Objective.
- `@sdl/core/testing` — aggregate test helpers that must be split into pure test helpers vs gateway,
  temp, subprocess, and fake/testing support under the matching owning packages.

## Naming implication

The current `@sdl/core` package name overclaims. Once only pure neutral-infra utilities remain,
possible future names include:

- `@sdl/pure` — strongest invariant signal; anything with I/O obviously does not belong.
- `@sdl/neutral` — aligns with neutral-infra vocabulary but is broader and easier to misuse.
- `@sdl/util` — conventional but risks becoming a junk drawer.
- `@sdl/foundation` — sounds low-level but may recreate the same overbroad "core" problem.
- `@sdl/primitives` — good for values/types but too narrow for text and markdown helpers.

The migration can complete without renaming the package, but any later rename should happen only
after the non-pure exports are gone so the rename does not obscure the gateway/service migration.
