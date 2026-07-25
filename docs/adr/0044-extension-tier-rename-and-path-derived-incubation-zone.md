# ADR 0044: `extension` tier values and a path-derived incubation zone

## Status

Accepted. Decided 2026-07-25, executing the code half of the
`rename-capability-to-extension` Objective together with the extension-demotion row of the
`professional-repo-curation` umbrella.

Amends ADR 0033 §1, whose tier→directory projection admitted **no exceptions**, and ADR
0033 §2's canonical tier list. ADR 0033's decision context stands as written; this ADR
records what changed after it.

## Context

ADR 0033 made `ns.tier` the single system of record and role directories a guard-enforced
projection of it, with no exceptions. Since then two pressures landed on that model from
opposite directions.

The `rename-capability-to-extension` Objective settled that **ns extension** replaces
**capability** as the canonical domain term, and landed the vocabulary layer across the
root `CONTEXT.md`, `CONTEXT-MAP.md`, and all 12 nested `CONTEXT.md` files. It deliberately
parked the machine-readable half — package identity, tier values, code symbols, and
physical directories — because renaming `ts/packages/capabilities/` on its own would move
those paths twice: the `professional-repo-curation` umbrella independently plans to demote
the same packages into a flat `ts/packages/incubator/`.

Separately, the demotion itself is not expressible under a no-exceptions projection. Every
one of the 11 packages keeps its architectural classification — they are ns extensions, and
the layering, cycle, and topology-circle rules that read `ns.tier` must keep applying —
while deliberately *not* living at the directory their tier projects to. Under ADR 0033 the
only ways to express that were to retier them (destroying the layering signal) or to add an
`incubating` tier (a second, competing classification axis, exactly what ADR 0033 deleted).

## Decision

### 1. The `capability` and `capability-kit` tier values become `extension` and `extension-kit`

`ns.tier` values, `packageTierIds`, `tierRank`, the tier display labels (`"capability"` →
`"extension"`, `"capability kit"` → `"extension kit"`), the `@nseng-ai/capability-kit`
package identity, and the 22 `capability`-named ns-domain code symbols all rename. `tierRank`
order is unchanged: the layering policy is untouched, only its vocabulary.

This is a hard cutover with no compatibility aliases — ns is private and unreleased. The
tier→directory map becomes:

| tier              | directory                    |
| ----------------- | ---------------------------- |
| `neutral-infra`   | `infra/`                     |
| `sdk`             | `sdk/` (top level)           |
| `extension-kit`   | `extension-kit/` (top level) |
| `extension`       | `extensions/`                |
| `host`            | `hosts/`                     |
| `standalone-tool` | `tools/`                     |
| `internal-tool`   | `internal/`                  |

`extensions/` is **declared but unoccupied**: it names the graduation home for a tier-
`extension` package without creating the directory. Keeping the entry rather than deleting
it means graduation out of the incubation zone is a one-package move with no taxonomy edit,
and it is why this cutover moves each path exactly once — the intermediate `extensions/`
directory the Objective ruled out is never created.

### 2. `ts/packages/incubator/<package>` is a path-derived zone exempt from directory projection

Zone membership is derived from the path and nothing else. No manifest field declares it, no
tier value encodes it, and no allowlist enumerates it. A package under
`ts/packages/incubator/<name>` — exactly one segment below the zone directory, matching the
role-dir shape so a nested subpackage directory is not exempted along with its parent — is
skipped by `NS_TS_TIER_DIRECTORY_PROJECTION`.

The exemption is scoped to that one rule. Incubating packages keep their declared `ns.tier`
and remain fully governed by tier layering, the extension dependency-cycle rule, topology
circles, subpackage conformance, and the private-peer-import rule. The zone suspends *where
a package lives*, never *what it is*.

The 11 ns extensions move out of `ts/packages/capabilities/` into the zone, and
`capabilities/` disappears.

### 3. Tier-valued sets in guard code are typed against the taxonomy

`source-rules.ts`'s lower-layer surface tier set was an inferred `Set<string>` holding
`"capability-kit"`. A tier rename there would not have failed typecheck: the rule would have
silently stopped covering the kit, forever, with nothing red. It is now
`new Set<PackageTierId>([...])`. Likewise the topology-report extractor's untyped
`tier !== "capability"` comparison in `.mjs` — which `just` never runs — now imports a named
constant derived from the taxonomy instead of repeating a literal.

Any new tier-valued comparison must be typed against `PackageTierId` or read a taxonomy-
derived export. An untyped tier literal is a silent-decommission hazard, not a style nit.

## Consequences

- `ls ts/packages/` no longer reads architecture for incubating packages. The zone is the
  declared price: `ns.tier` remains the system of record, and the guard still enforces the
  projection everywhere outside the zone.
- ADR 0033's "no exceptions" claim is superseded by exactly one exception, with a
  path-derived membership rule that cannot drift from a declaration.
- The projection's `extension` → `extensions/` entry is unexercised while all 11 extensions
  incubate. The tier-`extension`-outside-the-zone-violates and `extension-kit`-exact-dir
  cases are covered by negative tests, so the rule proves something even with an empty
  role directory.
- Graduating a package out of incubation is a `git mv` into `extensions/`; the guard then
  enforces its tier's directory again with no taxonomy change.
- The zone gives `professional-repo-curation`'s remaining demotion work (hosts, rough tools)
  and its zone-invariant row a path-derived mechanism to build on rather than inventing one.
- Prose in live `README`s, `docs/`, and skills still says "capability" in places; that sweep
  is a separate roadmap row and is deliberately not part of this cutover.
