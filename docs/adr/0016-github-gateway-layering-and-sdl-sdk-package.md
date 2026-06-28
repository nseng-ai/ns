# ADR 0016: GitHub gateway layering and the `sdl-sdk` author package

## Status

Accepted — refines ADR 0009 (Extension Layering and the Extension Dependency Graph)
and ADR 0004 (pr-address TypeScript Package Boundary). Both stand as written; this ADR
sharpens where GitHub gateway seams versus gateway implementation mechanics live, and
fixes the SDL author SDK to a dedicated package.

## Context

Two coordinated structural questions came due on the same branch.

**1. Where does GitHub status/feedback logic belong?** A fused `@sdl/core/github-status`
module had grown to hold three different concerns: GitHub repo/PR identity and git
remote URL normalization, PR status/check rollup mechanics, and PR-feedback gateway
plumbing. The tempting next move was to "lift GitHub status logic into a GitHub
capability" — a generic above-SDK GitHub capability package that would own everything
GitHub. That framing is wrong: most of this code is reusable protocol mechanics
(GraphQL queries, pagination, normalizers) for an external service, not capability
*policy*. PR-feedback is a `pr-address` concern; identity and status rollup are neutral
infra. There is no shared GitHub *domain* to justify a capability.

**2. Where does the SDL author SDK live?** The author SDK was exported as a subpath of
the host package, `@sdl/kernel/sdk`. That conflated two roles in one package: `@sdl/kernel`
is the host/kernel (module loader, text generation, command IO, `./cli`, `./context`),
while the author SDK is a distinct layer that extension authors import. Carrying the SDK
as a host subpath blurred the SDK boundary that ADR 0009 defines and made the SDK's
dependency surface implicit.

## Decision

### GitHub gateway layering

**Reject the generic GitHub capability.** No `@sdl/github` (or equivalent) capability
package is introduced. The guiding principle:

> Capability packages own gateway *seams* and capability-facing interfaces. Lower
> packages (`@sdl/core`) may own complex *real* gateway implementation mechanics for
> external protocols when those mechanics are reusable and are not capability policy.

Applying it:

- **`@sdl/core/github-status` is split** into two clearer neutral-infra subpaths:
  - `@sdl/core/github-identity` — GitHub repo/PR identity and git remote URL
    normalization.
  - `@sdl/core/github-pr-status` — PR status/check rollup: query/args, parsing,
    normalization, tally, classification, and superseded workflow-run filtering.

  `@sdl/core/github-status` no longer exists.

- **The PR-feedback gateway seam moves up to the capability layer.** The
  `GithubPrFeedbackGateway` interface and the PR-feedback domain types are owned and
  surfaced by `@sdl/address/api`. Seam consumers import only from there.

- **The lower real mechanics stay in `@sdl/core/github-pr-feedback`.**
  `RealGithubPrFeedbackGateway`, the GraphQL args/queries/schemas, pagination,
  normalizers, and low-level status normalization remain neutral infra. The
  PR-feedback DTOs are declared in `@sdl/core` and re-exported through
  `@sdl/address/api` so the capability owns the *seam vocabulary* without `@sdl/core`
  depending on `@sdl/address`.

- **Dependency direction is `pr-address` → `core`, never the reverse.** `@sdl/core`
  must never depend on `@sdl/address`.

### `sdl-sdk` author package

**Hard-cut the SDL author SDK out of `@sdl/kernel` into a dedicated workspace package.**

- The author SDK implementation moves from the `@sdl/kernel/sdk` host subpath into a new
  top-level workspace package named and imported as the **unscoped** specifier
  `sdl-sdk` (path `ts/packages/kernel-sdk`). It depends only on `@sdl/clinkr`,
  `@sdl/core`, `@sdl/domain-primitives-transitional`, and `zod`.

- `sdl-sdk` is the **only** SDL author import specifier — in code, tests, error
  messages, and the jiti virtual-module binding. The old `@sdl/kernel/sdk` author
  export/import path is **removed with no compatibility shim** (private, unreleased
  repo; a deliberate contract break).

- `@sdl/kernel` remains the **host/kernel**. It still owns `module-loader.ts`,
  `pi-text-generation.ts`, `command-io.ts`, `./cli`, `./context`, and the rest of the
  kernel surface. The jiti virtual module in `module-loader.ts` now binds `sdl-sdk`,
  preserving shared SDK/Zod object identity for selected extension modules across the
  host/extension seam (the requirement ADR 0008 codified).

- **Layering:** `sdl-sdk` *is* the SDK layer. It is not neutral infra (which sits below
  the SDK) and not host/capability domain (which sits above the SDK). In ADR 0009's
  terms, the SDK tier is now the SDL kernel (`@sdl/kernel`) plus the `sdl-sdk` package.

## Consequences

- The reusable-mechanics-versus-policy boundary is now explicit and reusable as a
  principle for future external-protocol gateways: keep the real protocol mechanics low
  when they are reusable and policy-free, and own the seam in the capability that has
  the policy.
- `@sdl/core` GitHub code is legible: identity, status rollup, and feedback mechanics
  are three named subpaths instead of one fused module.
- Address owns its gateway contract end to end through `@sdl/address/api`, with no
  new capability package and no upward dependency from `@sdl/core`.
- The SDK boundary from ADR 0009 is now a real package boundary, not an implicit host
  subpath. `sdl-sdk`'s dependency surface is explicit and minimal.
- All author-facing docs, examples, error messages, and tooling reference `sdl-sdk`.
  ADR 0008's identity binding and ADRs 0009/0012's "SDK tier" language are updated to
  name `sdl-sdk`.

## Rejected Alternatives

- **Move GitHub status logic into a generic GitHub capability.** Rejected: there is no
  shared GitHub capability *domain* — the code is reusable external-protocol mechanics
  (identity, status rollup) plus one capability-owned seam (PR-feedback, owned by
  pr-address). A generic capability would invent a policy layer that nothing needs and
  would pull neutral infra above the SDK.
- **Keep the fused `@sdl/core/github-status` module.** Rejected: it conflated identity,
  status rollup, and feedback mechanics, hiding the seam boundary the split makes
  explicit.
- **Push the PR-feedback gateway seam down into `@sdl/core`.** Rejected: the seam is a
  capability-facing interface; owning it in `@sdl/core` would either invert the
  dependency direction or strand pr-address policy below the SDK.
- **Keep the author SDK as the `@sdl/kernel/sdk` host subpath.** Rejected: it blurs the
  host/kernel versus SDK-layer boundary and leaves the SDK's dependency surface
  implicit.
- **Provide a `@sdl/kernel/sdk` compatibility shim during the cutover.** Rejected: the repo
  is private and unreleased, so a single hard cutover is cheaper than carrying a
  deprecated alias.
