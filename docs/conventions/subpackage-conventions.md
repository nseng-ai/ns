# Subpackage conventions

Read this before creating a workspace package, declaring or renaming entries in `ns.subpackages`, adding `exports` entries to a container package, or restructuring a container package's `src/` layout.

Decision record: ADR 0022 (container packages, manifest-declared subpackages) and ADR 0023 (subpackage kinds, edge-significance rank). Canonical vocabulary: the package-topology cluster in the root `CONTEXT.md`.

## The rank test

A subpackage exists to make a class of dependency edges visible to topology and guard tooling. Before declaring one, answer: **which importers does this unit anchor that the package's other subpackages don't?** If there is no distinct answer, it is a folder, not a subpackage. Source size is irrelevant in both directions — a tiny `api` earns its rank from inbound edges; a large internal layer earns nothing from LOC.

## The four kinds

| Kind         | Names                                                                    | Sanctioned importers                    |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| API          | `api`                                                                    | any package (runtime)                   |
| Testing      | `testing`                                                                | any package (tests only)                |
| Host surface | `ns`, `pi`, `repo-local-ns-extension`                                    | the named host only                     |
| Feature      | open, domain-meaningful (`land-stack`, `submit`, `cmux`, `lifecycle`, …) | sibling subpackages in the same package |

- **API** hosts the package's Capability API (`@nseng-ai/<cap>/api`) as a thin contract/facade. It is the only cross-package programmatic door; logic lives in features, not here.
- **Testing** exports fakes and test kits for other packages' tests. Never imported by runtime code.
- **Host surfaces** are thin adapters consumed by exactly one host: `ns` by the ns CLI kernel wiring, `pi` by the Pi host stack, `repo-local-ns-extension` by kernel extension loading. Per-feature entry points live inside the surface (`pi/land-stack.ts`), so surfaces stay thin and features stay host-free.
- **Features** are the package's real domain verticals — the entries that make the topology report say something package-specific. They never import host surfaces, and their edges stay intra-package.

## Naming rules

- The contract and host-surface vocabulary is **closed**: `api`, `testing`, `ns`, `pi`, `repo-local-ns-extension`. Do not invent synonyms.
- Never declare internal layers as subpackages: `operations`, `gateways`, `commands`, `shared`, `shell`, `kit`. They are folders inside the kind that owns them.
- `core` is acceptable only as the feature subpackage naming the package's central domain (when the package's namesake concept *is* the feature). It is not a home for consolidated layers.
- Feature names must mean something in the package's domain. Prefer the term the package's `CONTEXT.md` already uses.

## Import rules in practice

- Cross-package runtime imports target `<pkg>/api` only. Cross-package test imports may also target `<pkg>/testing`.
- Host-surface subpaths are imported only by their host packages.
- A feature-level `api`/`testing` module (for example `@nseng-ai/flow/land/api`) serves sibling subpackages in the same package only. If another package wants it, route the need through the package `api` — or read the demand as a promotion signal and extract the feature into its own package (see `docs/conventions/platform-and-consumer.md` for the promotion-path discipline).

## Lower-tier public subpaths

A container may declare `ns.subpackageTiers` only for public subpaths whose effective tier is lower than the container package's tier (for example a host package exposing an SDK-like public subpath during a transition). Keys must exactly match entries in `ns.subpackages`, and values must be known package tiers. This is not a general dependency escape hatch: it documents the rank of the named public subpackage, and guard tooling must validate actual subpath imports rather than legalizing arbitrary whole-package edges.

## Adding or consolidating

When adding a subpackage: state its kind, confirm it passes the rank test, root it at `src/<name>/`, declare it in `ns.subpackages`, and keep every `exports` subpath resolving inside a declared subpackage (multiple export subpaths may belong to one subpackage); the TypeScript style guard enforces this via `NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE`. A container package mid-conversion may declare `ns.remainder: true` per ADR 0022; a properly formed container has no remainder.

When consolidating an existing package:

1. Fold layer entries (`operations`, `gateways`, `commands`, `shared`, `shell`) into the feature, `api`, or host surface that owns them.
2. Merge crumb entries that anchor no distinct edge class into their nearest owner.
3. Move per-feature host adapters into the host-surface subpackage.
4. Update `ns.subpackages` and the `exports` map together; the topology report (`skills/architecture-topology-report`) is the fastest way to eyeball the result.
