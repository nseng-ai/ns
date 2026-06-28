# `@sdl/domain-primitives-transitional`

Disposable below-SDK holding pen for SDL domain primitives that are shared by current workspace packages but do **not** belong in the public SDL extension SDK.

## Why this package exists

SDL is being split into clear layers:

1. **Below SDK:** neutral infrastructure such as `@sdl/core`, `@sdl/clinkr`, `@sdl/graphite`, and `@sdl/brmem`.
2. **SDK/kernel:** the SDL kernel (`@sdl/kernel`) plus the `sdl-sdk` package, the small public host API used by SDL extension authors.
3. **Above SDK:** product capabilities such as flow, handoff, objectives, branch-context, plans, PR address, slots, roaster, aretro, and CCC orchestration.

Before this package existed, some SDK-independent domain primitives lived in `@sdl/kernel` and were consumed through internal workspace subpaths such as `@sdl/kernel/pending-worktree` and `@sdl/kernel/checkpoint-flow`. That made the SDL kernel look like the owner of workflow policy and shared product-domain helpers.

This package makes that debt explicit. It extracts those shared primitives out of `@sdl/kernel` without pretending they are permanent neutral infrastructure or public SDK author API.

## What belongs here

Only SDK-independent primitives that are still needed by multiple workspace packages during the extension-architecture migration:

- checkpoint message and checkpoint-flow helpers;
- pending-worktree snapshot helpers;
- temporary file re-exports used by domain flows;
- text-generation model-selection helper types/constants;
- text-repair re-exports used by checkpoint/text flows.

The current public surface is deliberately narrow and mirrored by subpath:

```ts
import { prepareCheckpointMessage } from "@sdl/domain-primitives-transitional/checkpoint-flow";
import { loadPendingWorktreeSnapshot } from "@sdl/domain-primitives-transitional/pending-worktree";
import { selectCheckpointModelRef } from "@sdl/domain-primitives-transitional/text-generation";
```

There is intentionally no root barrel export. Import the exact primitive subpath so every dependency remains greppable and visibly transitional.

## What must not belong here

Do not add:

- public SDL extension-author API — that belongs in `sdl-sdk` after an explicit SDK promotion decision;
- `ctx`-dependent extension helper code — shared capability substrate belongs above the SDK, usually in `@sdl/capability-kit` or the owning capability package;
- command faces, CLI registration, Pi mirrors, or presentation policy;
- Capability APIs — use the `@sdl/<cap>/api` convention in the owning capability package;
- dependencies on `@sdl/kernel`.

The dependency direction is important: this package is below the SDL SDK/kernel. If a helper needs to import `@sdl/kernel`, it does not belong here.

## How consumers should think about this package

Every import from this package is architectural debt with a name tag. It is acceptable while capabilities are being migrated, but it should feel temporary at the call site:

```ts
import type { PendingWorktreeSnapshot } from "@sdl/domain-primitives-transitional/pending-worktree";
```

That import says: "this package still needs a shared primitive that has not yet moved into the right above-SDK capability boundary."

Do not wrap these imports in broad barrels that hide the transitional dependency.

## Deletion criteria

This package is successful when it can be deleted.

Delete it after:

1. each capability has moved to its above-SDK package/extension boundary;
2. consumer→provider capability dependencies use Capability APIs such as `@sdl/<cap>/api` instead of transitional primitive subpaths;
3. CCC consumes Capability APIs as the highest-fan-out consumer rather than reaching into transitional primitives;
4. no workspace package imports `@sdl/domain-primitives-transitional/*`.

Until then, keep this package small, boring, and obviously temporary.
