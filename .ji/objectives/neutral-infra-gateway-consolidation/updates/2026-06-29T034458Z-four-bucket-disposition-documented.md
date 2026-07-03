# Four-Bucket Disposition Documented

## Summary

The first documentation slice landed for the neutral-infra gateway consolidation Objective. ADR 0018 records the four-bucket rule for classifying `@sdl/core` exports: pure utility, Kit gateway, SDK-provided service, and runtime harness. It also includes a disposition table covering every current export in `ts/packages/infra/core/package.json`, including the ambiguous residual exports and the `@sdl/brmem` exception-adjacent `brmem-cli` helper.

`CONTEXT.md` now carries concise current vocabulary for Pure Utility, Kit Gateway, SDK-provided service, Runtime Harness, and the broadened first-party Capability Kit gateway-library role. ADR 0016 now has a minimal historical cross-reference noting that ADR 0018 refines GitHub gateway mechanics placement.

## Objective Impact

The first roadmap row is complete: the classification rule, the "reached-through-`ctx` ⇒ SDK-provided" test, and the per-subpath disposition table are checked in. The next implementation slices can use ADR 0018 as the authoritative source for moving `git`, `exec`, `github-*`, SDK-provided services, runtime harness code, and residual helpers without re-litigating every export's bucket.

Notable risk decisions recorded in ADR 0018:

- ADR 0016's Address seam remains valid, but its target placement for GitHub real mechanics in `@sdl/core` is superseded by the new `@sdl/capability-kit/github` target.
- Filesystem-backed helpers are classified as precise domain helpers such as XDG, shell, temp-files, or workspace-root; the Objective still rejects a generic shared `FileSystemGateway`.
- `@sdl/brmem` remains a named out-of-scope follow-up; only `@sdl/core/brmem-cli` was classified.
- The capability import-ban guard remains parked/follow-up, not part of this slice.

## Follow-Ups

- Start the next roadmap relocation slice from ADR 0018's table rather than from the older approximate export inventory.
- Split mixed exports during relocation where ADR 0018 says the current export combines pure helpers and non-pure gateway behavior, especially `model-slug`, `machine-envelope`'s dependency on pure `tailText`, and `@sdl/core/testing`'s aggregate helpers.
- Keep existing Semantic Updates immutable; future corrections to the disposition table should be recorded in new updates and, if they change the architecture decision, a refining ADR.
