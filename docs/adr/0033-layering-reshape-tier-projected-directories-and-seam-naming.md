# ADR 0033: Tier-projected directories, seven-tier taxonomy, and seam naming

## Status

Accepted — amends ADR 0032 (tier list, Neutral Infra follow-up execution) and the root
`CONTEXT.md` architecture-boundary vocabulary. Decided 2026-07-11 in the
`ontology-reshape` layering grilling session; execution mechanics live in
`docs/wayfinding/ontology-reshape/layering-reshape-spec.md`.

## Context

The workspace ran two parallel package-classification systems: role directories
(`hosts/`, `capabilities/`, `internal/`, …) and the machine-enforced `ns.tier`
taxonomy. They disagreed four times (`hosts/pi-command-surfaces` = `capability`,
`extensions/ns-pi-subagents` = `internal-pi-tool`, `capabilities/reviews` =
`standalone-tool`, `internal/ns-dev` = `internal-pi-tool`), so directory position could
not be trusted as architecture. Separately: the `capability-pi` tier had zero occupants
and — under ADR 0032's single-tier-packages rule — no possible occupant; the rank edge
between `internal-pi-tool` and `internal-tool` was unused; 45 untracked residue
directories under `ts/packages/` made the topology illegible from `ls`; the
brmem→capability-kit tier debt edge cited a placement decision ADR 0032 has since made;
and the root glossary's Gateway entry cited an `ExecGateway` symbol that no longer
exists while claiming every external-service boundary carries the `Gateway` suffix.

## Decision

### 1. `ns.tier` is canonical; role directories are an enforced projection

The tier is the single system of record. Role directories remain, but the style guard
enforces a tier→directory map so `ls` is trustworthy:

| tier              | directory                     |
| ----------------- | ----------------------------- |
| `neutral-infra`   | `infra/`                      |
| `sdk`             | `kernel/` (top level)         |
| `capability-kit`  | `capability-kit/` (top level) |
| `capability`      | `capabilities/`               |
| `host`            | `hosts/`                      |
| `standalone-tool` | `tools/`                      |
| `internal-tool`   | `internal/`                   |

No exceptions. The four disagreements are resolved by deletion
(`@nseng-ai/pi-command-surfaces`, zero consumers), retier (`reviews` → `capability`,
`ns-dev` → `internal-tool`), and relocation (`ns-pi-subagents` → internal space with an
`@internal` rescope; the then-empty `extensions/` role directory is deleted).

### 2. The tier taxonomy trims from nine to seven

`capability-pi` is deleted (structurally unoccupiable: capability Pi presentations are
subpackages, and packages are single-tier per ADR 0032). `internal-pi-tool` merges into
`internal-tool` (its rank edge over `internal-tool` was unused; Pi-specificity remains
visible from dependencies and prose — pi `CONTEXT.md`'s *Internal Pi-tool* survives as a
prose pattern, not a layering category). Canonical tiers: `neutral-infra`, `sdk`,
`capability-kit`, `capability`, `host`, `standalone-tool`, `internal-tool`. This amends
ADR 0032's nine-value list.

### 3. DI Seams and Gateways are distinct categories; suffix marks the category, placement follows contract shape

A **DI Seam** is any injected, test-substitutable boundary. A **Gateway** is the subset
abstracting a stateful or heavyweight external service or capability (git, GitHub,
process execution) — lightweight primitives (`Clock`, `TimerScheduler`) are DI seams,
not Gateways. The `Gateway` suffix marks genuine heavyweight-service seams wherever
they live; a seam's placement (Kit Gateway vs Neutral Infra, ADR 0032) follows its
contract's ns-shape and is not reflected in the suffix. Incumbent generic names win
absent confusion: foundation's exec seam is `CommandExecApi`, and the name
`ExecGateway` is retired everywhere, including the Pi-host
`@nseng-ai/pi/shared/exec-gateway` type, which is renamed to `CommandExecApi`
vocabulary.

### 4. The git seam relocates to foundation; brmem becomes honestly Neutral Infra

This is the explicit follow-up work ADR 0032 anticipated for existing Kit Gateways,
scoped to git only (github, graphite, and cmux stay put). The whole
`capability-kit/git` subpackage — contract, `RealGitGateway`, worktree-state facts,
local-ref reader, fakes — moves to `foundation/git`, keeping the `GitGateway` name and
healing the contract-in-`kit/`/adapters-in-`git/` blur. brmem's global prompt root
moves off `resolveNsXdgPath` to generic XDG resolution with a brmem-owned segment. The
brmem→capability-kit tier debt edge is then deleted, not reworded.

### 5. The command-backed skill registry folds into areg

`@nseng-ai/command-backed-skill-registry` is deleted; its aggregation module moves into
`@nseng-ai/areg`, which gains the five capability-`/pi` dependencies, and
`@internal/pi-tools/backing-skill-commands` imports the rows from areg. The
Host-surface subpackage rule ("only its host may import") is amended to name areg's
registry module as the sanctioned second `/pi` importer — recording a bend the deleted
package had already made silently. The decision is passed to the
`skill-management-subsystem` Objective as recorded input via an Objective Edge.

### 6. `hosts/ns-cli` renames to `hosts/ns`; the distribution pair is glossaried

Directory equals package basename workspace-wide. Both `ns` bins stay; **Checkout-free
distribution** and **Package preparation** enter the root glossary.

### 7. The kernel rename question is parked

Whether `@nseng-ai/kernel` keeps its name or renames to SDK/host/loader language is
deferred until the `extension-descriptor-contract` Objective closes, since the name
anchors that initiative's public author contract. Until then, no *new* kernel-brand
prose (no glossary entry committing to the OS analogy) so the parked decision stays
cheap in both directions.

## Consequences

- One classification system of record; `ls ts/packages` shows exactly the tracked role
  roots after the 45 untracked residue directories are removed (verified
  `node_modules`-only before deletion).
- Three packages disappear from the topology (`pi-command-surfaces`,
  `command-backed-skill-registry` by fold, plus the `extensions/` role directory);
  every remaining tier value changes what some package may import.
- The style guard gains a tier→directory conformance rule and loses the
  brmem debt edge, the `capability-pi` definition, and the `internal-pi-tool` tier.
- Doc edits that depend on code changes (the seven-tier glossary list, the
  Host-surface areg amendment, directory rules) ride the executing PRs; the
  code-independent glossary edits (DI Seam/Gateway rewrite, Command Face,
  Checkout-free distribution, `ns-extension` drift fix) landed with this ADR.
