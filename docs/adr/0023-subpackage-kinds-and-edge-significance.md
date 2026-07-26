# ADR 0023: Manifest-Declared Subpackages and Edge-Significance Kinds

## Status

Accepted

## Context

Published package may hold several architecture units worth tracking without splitting into separate npm packages. Those units must be explicit, importer-significant, derived from manifests, not guessed from directory layout or source size.

## Decision

Container package declares its architecture units in `package.json` at `ns.subpackages`. Each named subpackage roots at `src/<name>/`; topology and guard tooling read manifest declaration and export map. Multiple export subpaths may belong to one subpackage.

Package under conversion may declare `ns.remainder: true` for source not yet claimed by named subpackages. Remainder is explicit transition state, not `"."` sentinel, not permanent miscellaneous unit. Properly formed container package has no remainder.

Subpackage earns rank by anchoring class of dependency edges its siblings do not, never by LOC. Every declared subpackage has one of four kinds:

- **API-kind:** deliberate cross-package runtime door. Names open; container may have several precise API-kind subpackages. Literal `api` name required for ns extension's curated extension package API at `@nseng-ai/<extension>/api`.
- **Testing:** literal `testing` cross-package test contract; runtime imports forbidden.
- **Host-surface:** thin `ns`, `pi`, or `ns-extension` adapter imported only by its named host. `ns-extension` surface carries descriptor metadata for SDK discovery; not extension package API.
- **Feature:** domain-meaningful vertical whose edges stay inside package; host-free.

Feature-level `api` or `testing` module serves sibling subpackages only, unless its surface deliberately promoted to API-kind or extracted. Internal horizontal layers such as operations, gateways, commands, shared code, shell adapters are folders inside owning kind, not subpackages. `core` valid only when it names package's central domain feature, never as layer dump.

Cross-package imports target declared exports belonging to API-kind subpackages, plus Testing exports from tests. Host surfaces stay host-restricted. Every subpackage inherits its package's single `ns.tier`; no subpackage tier overrides.

## Consequences

- Manifests, export maps, topology, guards describe same package-internal boundaries.
- Foundation can expose several precise API-kind doors without giant façade barrel.
- Extension consumers get one literal `/api` specialization; command, descriptor, Pi adapters stay separate host surfaces.
- Large private implementation folders do not become architecture nodes by size alone.

## Alternatives

- **Directory auto-discovery:** rejected because arbitrary folders are not architecture units.
- **One mandatory API façade:** rejected because it erases precise contracts and creates meaningless fan-in.
- **Layers as subpackages:** rejected because layer names do not identify distinct importer classes.
- **Hidden or sentinel remainder:** rejected because transition state must be explicit.
- **Subpackage tier overrides:** rejected because one package is one distribution and tier unit.
