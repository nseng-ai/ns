# ADR 0023: Manifest-Declared Subpackages and Edge-Significance Kinds

## Status

Accepted

## Context

A published package may contain several architecture units worth tracking without splitting them into separate npm packages. Those units must be explicit, importer-significant, and derived from manifests rather than guessed from directory layout or source size.

## Decision

A container package declares its architecture units in `package.json` at `ns.subpackages`. Each named subpackage is rooted at `src/<name>/`; topology and guard tooling read the manifest declaration and export map. Multiple export subpaths may belong to one subpackage.

A package being converted may declare `ns.remainder: true` for source not yet claimed by named subpackages. Remainder is explicit transition state, not a `"."` sentinel or a permanent miscellaneous unit. A properly formed container package has no remainder.

A subpackage earns rank by anchoring a class of dependency edges its siblings do not, never by LOC. Every declared subpackage has one of four kinds:

- **API-kind:** a deliberate cross-package runtime door. Names are open and a container may have several precise API-kind subpackages. The literal `api` name is required for an ns extension's curated extension package API at `@nseng-ai/<extension>/api`.
- **Testing:** the literal `testing` cross-package test contract; runtime imports are forbidden.
- **Host-surface:** a thin `ns`, `pi`, or `ns-extension` adapter imported only by its named host. The `ns-extension` surface carries descriptor metadata for SDK discovery; it is not an extension package API.
- **Feature:** a domain-meaningful vertical whose edges stay inside the package and which remains host-free.

A feature-level `api` or `testing` module serves sibling subpackages only unless its surface is deliberately promoted to API-kind or extracted. Internal horizontal layers such as operations, gateways, commands, shared code, and shell adapters are folders inside an owning kind, not subpackages. `core` is valid only when it names the package's central domain feature, not as a layer dump.

Cross-package imports target declared exports belonging to API-kind subpackages, plus Testing exports from tests. Host surfaces remain host-restricted. Every subpackage inherits its package's single `ns.tier`; there are no subpackage tier overrides.

## Consequences

- Manifests, export maps, topology, and guards describe the same package-internal boundaries.
- Foundation can expose several precise API-kind doors without a giant façade barrel.
- Extension consumers get one literal `/api` specialization while command, descriptor, and Pi adapters remain separate host surfaces.
- Large private implementation folders do not become architecture nodes merely because they are large.

## Alternatives

- **Directory auto-discovery:** rejected because arbitrary folders are not architecture units.
- **One mandatory API façade:** rejected because it erases precise contracts and creates meaningless fan-in.
- **Layers as subpackages:** rejected because layer names do not identify distinct importer classes.
- **Hidden or sentinel remainder:** rejected because transition state must be explicit.
- **Subpackage tier overrides:** rejected because one package is one distribution and tier unit.
