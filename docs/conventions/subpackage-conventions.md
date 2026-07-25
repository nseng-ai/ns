# Subpackage conventions

Read this before creating a workspace package, declaring or renaming entries in `ns.subpackages`, adding `exports` entries to a container package, or restructuring a container package's `src/` layout.

Decision record: ADR 0022 (container packages, manifest-declared subpackages), ADR 0023 (subpackage kinds, edge-significance rank), and ADR 0032 (multiple API-kind subpackages, single-tier packages). Canonical vocabulary: the package-topology cluster in the root `CONTEXT.md`.

## The rank test

A subpackage exists to make a class of dependency edges visible to topology and guard tooling. Before declaring one, answer: **which importers does this unit anchor that the package's other subpackages don't?** If there is no distinct answer, it is a folder, not a subpackage. Source size is irrelevant in both directions — a tiny `api` earns its rank from inbound edges; a large internal layer earns nothing from LOC.

## The four kinds

| Kind         | Names                                                                    | Sanctioned importers                    |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| API-kind     | open; `api` required for an extension package API                        | any package (runtime)                   |
| Testing      | `testing`                                                                | any package (tests only)                |
| Host surface | `ns`, `pi`                                                               | the named host only                     |
| Feature      | open, domain-meaningful (`land-stack`, `submit`, `cmux`, `lifecycle`, …) | sibling subpackages in the same package |

- **API-kind** subpackages are the package's deliberate cross-package programmatic doors: any declared subpackage with supported cross-package runtime exports is API-kind, regardless of name, and a container may have several (`@nseng-ai/foundation/exec` and `@nseng-ai/foundation/time` are both API-kind). An extension's package API must still be the literally named `api` subpackage (`@nseng-ai/<ext>/api`), a thin contract/facade; logic lives in features, not here. Do not consolidate precise API-kind doors into one façade barrel.
- **Testing** exports fakes and test kits for other packages' tests. Never imported by runtime code.
- **Host surfaces** are thin adapters consumed by exactly one host: `ns` by the ns CLI SDK wiring and `pi` by the Pi host stack. Per-feature entry points live inside the surface (`pi/land-stack.ts`), so surfaces stay thin and features stay host-free.
- **Features** are the package's real domain verticals — the entries that make the topology report say something package-specific. They never import host surfaces, and their edges stay intra-package. Private implementation layers of an API-kind subpackage are folders inside it, not sibling feature subpackages.

## Naming rules

- The extension package API, testing, and host-surface vocabulary is **closed**: `api`, `testing`, `ns`, `pi`. Do not invent synonyms such as `public` or `contract`. Other API-kind subpackages carry their domain name (`exec`, `time`), exactly like features — being exported is what makes them API-kind, not a reserved name.
- Never declare internal layers as subpackages: `operations`, `gateways`, `commands`, `shared`, `shell`, `kit`. They are folders inside the kind that owns them.
- `core` is acceptable only as the feature subpackage naming the package's central domain (when the package's namesake concept *is* the feature). It is not a home for consolidated layers.
- Feature names must mean something in the package's domain. Prefer the term the package's `CONTEXT.md` already uses.

## Import rules in practice

- Cross-package runtime imports target exported API-kind subpackages only. For an ns extension package API that means `<pkg>/api`; for a package with several API-kind doors it means the precise exported subpath (`@nseng-ai/foundation/exec`). Cross-package test imports may also target `<pkg>/testing`.
- Host-surface subpaths are imported only by their host packages.
- A feature-level `api`/`testing` module (for example `@nseng-ai/flow/land/api`) serves sibling subpackages in the same package only. If another package wants it, route the need through an existing API-kind subpackage — or read the demand as a promotion signal: either deliberately declare the feature's surface API-kind, or extract the feature into its own package (see `docs/conventions/platform-and-consumer.md` for the promotion-path discipline).

## Subpackage tiers: one package, one tier

A package lives in a single tier: `ns.tier` is the tier for the package and every declared subpackage (ADR 0032). `ns.subpackageTiers` is not part of the model — the TypeScript style guard rejects any manifest declaring the key. Cross-package layering is enforced against the owning package's tier for every topology circle; guard tooling still validates actual subpath imports rather than legalizing arbitrary whole-package edges. A subpackage that genuinely earns a different tier is a promotion signal: extract it into its own package with its own `ns.tier`.

## Adding or consolidating

When adding a subpackage: state its kind, confirm it passes the rank test, root it at `src/<name>/`, declare it in `ns.subpackages`, and keep every `exports` subpath resolving inside a declared subpackage (multiple export subpaths may belong to one subpackage); the TypeScript style guard enforces this via `NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE`. A container package mid-conversion may declare `ns.remainder: true` per ADR 0022; a properly formed container has no remainder.

When consolidating an existing package:

1. Fold layer entries (`operations`, `gateways`, `commands`, `shared`, `shell`) into the feature, `api`, or host surface that owns them.
2. Merge crumb entries that anchor no distinct edge class into their nearest owner.
3. Move per-feature host adapters into the host-surface subpackage.
4. Update `ns.subpackages` and the `exports` map together; the topology report (`skills/architecture-topology-report`) is the fastest way to eyeball the result.
