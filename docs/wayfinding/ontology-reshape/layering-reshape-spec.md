# Layering reshape spec

Resolves the ontology-reshape roadmap row "Reexamine extension, host, and kernel
layering vocabulary (grilling)", 2026-07-11. Decisions ratified in a live grilling
session; rationale and the durable rules live in ADR 0033
(`docs/adr/0033-layering-reshape-tier-projected-directories-and-seam-naming.md`).
This spec is the execution handoff: per-item mechanics, verification, and which doc
edits ride which change. Constraints honored: `cross-harness-parity` (Pi additive,
never canonical) and `extension-descriptor-contract` (descriptor modules stay cheap;
author contract untouched).

Already landed with the row resolution (code-independent doc edits, root
`CONTEXT.md`): DI Seam + Gateway entry rewrite, Command Face entry, Checkout-free
distribution + Package preparation entries, Host-surface `repo-local-ns-extension` →
`ns-extension` drift fix. Everything below is **spec, not landed**.

## Execution items

The numbering below is the **intended implementation order** (decided 2026-07-11):
items land 1 → 10 as stacked slices, batch one before batch two. Batch one
(items 1–5) is the mechanical, independently landable set; batch two (items 6–10) is
the follow-on slices that fan out across importers. Each item is independently
landable unless a dependency is noted. "Ride-along docs" means the doc edit belongs
in the same PR as the code change so glossaries never claim a state the code does
not have.

Implementation-attempt note (2026-07-11): a direct-implementation pass started on
batch one (items 1, 2, and part of 4 completed and validated green) and was rolled
back the same session by user steer — no code lands until implementation resumes
deliberately. Two facts learned survive in the item notes: item 3's `rm -rf` needs
the operator's own hands (agent permission boundary), and item 4 is larger than the
sweep suggested (~40 importing files via `@nseng-ai/pi/shared/exec-gateway`, plus a
second local `ExecGateway` type inside `@internal/pi-tools`' feedback-watch that
needs its own rename).

### Batch one — mechanical slices

#### 1. Delete `@nseng-ai/pi-command-surfaces`

Zero importers, zero deps (the last dead dep declaration was removed by PR #3332 —
this item stacks on that branch). Remove the package directory and workspace
references; run the style guard.

#### 2. Retier `reviews`

`capabilities/reviews`: `ns.tier` `standalone-tool` → `capability`. It is
extension-shaped (`./ns-extension`, `./api`, kernel-loaded commands) and the glossary
already lists it as a first-party extension; the tier predates its move into
`capabilities/`. Verify its dependency edges satisfy `capability` rank (current deps:
capability-kit, clinkr, foundation, kernel — all below). The companion `ns-dev`
retier rides item 8's tier merge instead.

#### 3. Delete the 45 untracked residue directories

33 at the `ts/packages/` root, 10 under `infra/`, `hosts/jicc`, `hosts/sdlcc`,
`extensions/flow` (list as of 2026-07-11; re-enumerate at execution). Guard: re-verify
each contains only `node_modules` content before deletion (`find <dir> -not -path
'*/node_modules*' -type f` must be empty); anything else gets flagged, not deleted.
Untracked deletions are unrecoverable.

#### 4. Rename the Pi-host `ExecGateway` type

`@nseng-ai/pi/shared/exec-gateway` renames to `CommandExecApi` vocabulary. Scope
verified 2026-07-11 (larger than the sweep suggested): the module's `ExecGateway` is
a bare alias of foundation's `CommandExecApi` — delete the alias, re-export
`CommandExecApi`, rename the module/subpath to `shared/command-exec` (exports map +
~40 importing files across capabilities, pi-tools, capability-kit, ns-pi-subagents,
and the pi host, including relative in-package imports and the
`test/exec-gateway.test.ts` filename). Separately, `@internal/pi-tools`'
feedback-watch declares its own local `ExecGateway` type in
`src/pr-feedback-watch/feedback-watch/types.ts` — rename it too. Ride-along docs:
the `@nseng-ai/pi/shared/exec-gateway` mention in `hosts/pi/AGENTS.md`.

#### 5. Rename `hosts/ns-cli` → `hosts/ns`

`git mv`; update workspace references. Directory=basename then holds workspace-wide.
Ride-along docs: none (the glossary entries are already landed and name only the
package, not the directory).

### Batch two — follow-on slices

#### 6. Move `ns-pi-subagents` into internal space

`ts/packages/extensions/ns-pi-subagents` → `ts/packages/internal/ns-pi-subagents`;
rescope `@nseng-ai/ns-pi-subagents` → `@internal/ns-pi-subagents`. Consumers to
update: `@internal/pi-tools` (thermo-council, context-profiler, tests),
`@internal/typescript-style-guard` test, and the project-local
`.pi/extensions/objective-autorun.ts` loader (package.json URL + specifier). Delete
the then-empty `extensions/` role directory. Ride-along docs: delete pi
`CONTEXT.md`'s special-case ("or, for the subagent tools, under
`@nseng-ai/ns-pi-subagents/runner-subagents`").

#### 7. Fold `command-backed-skill-registry` into areg

Move `hosts/command-backed-skill-registry/src/index.ts` (205 lines) into
`@nseng-ai/areg` as a module (not a subpackage); delete the package. areg gains deps
on `@nseng-ai/{ccc,flow,handoffs,objectives,branch-context}/pi` (tier-legal:
`standalone-tool` ranks above `capability`). Update importers:
`@internal/pi-tools/backing-skill-commands` and areg's own operations/tests.
Ride-along docs: amend the root glossary **Host-surface subpackage** entry ("only its
host may import") to name areg's registry module as the sanctioned second `/pi`
importer. Coordination: the Objective Edge to `skill-management-subsystem` records
this as input to their design space — check it before reshaping skill surfaces
further.

#### 8. Trim the tier taxonomy to seven

In `@internal/typescript-style-guard/src/package-tier-taxonomy.ts`: delete
`capability-pi` (definition + rank entry); merge `internal-pi-tool` into
`internal-tool` (retier `@internal/pi-tools`, `@internal/ns-dev` — its
`internal-pi-tool` value is wrong regardless, no Pi surface exists in the package —
and, after item 6, `@internal/ns-pi-subagents`). Ride-along docs: update the root
glossary **Package Tier** entry's canonical tier list (currently names nine) and any
tier enumeration in `docs/conventions/subpackage-conventions.md`.

#### 9. Add the tier→directory projection rule to the style guard

New guard rule enforcing the ADR 0033 map (`neutral-infra`→`infra/`, `sdk`→`kernel/`,
`capability-kit`→`capability-kit/`, `capability`→`capabilities/`, `host`→`hosts/`,
`standalone-tool`→`tools/`, `internal-tool`→`internal/`). Depends on items 1, 2, and
5–8 (or lands with per-item suppressions removed as they land). Ride-along docs:
record the projection rule wherever the guard's rules are documented.

#### 10. Relocate the git seam to foundation; make brmem honestly neutral

The explicit follow-up ADR 0032 anticipated, scoped to git only:

- Move the whole `capability-kit/git` subpackage — contract (currently
  `kit/git-contract.ts`, healing that blur), `RealGitGateway`, worktree-state facts,
  local-ref reader, status paths, fakes/testing — to a new `foundation/git`
  API-kind subpackage. **`GitGateway` keeps its name** (ADR 0033 §3). Clean cut, no
  transitional re-export; update all importers mechanically.
- Replace brmem's `resolveNsXdgPath` usage with generic XDG resolution
  (foundation/config) plus a brmem-owned segment; brmem's global prompt root moves
  accordingly (unreleased; no migration needed).
- Delete the brmem→capability-kit tier debt edge from the style guard.
- Ride-along docs: root glossary sentences placing the git gateway in
  `capability-kit/git` (Extension Layering intro, Kit Gateway entry), the
  capability-kit graphite/kit context references, and the Neutral Infra example list.

## Parked

- **Kernel rename** — parked until `extension-descriptor-contract` closes (ADR 0033
  §7). No new kernel-brand prose meanwhile. Unparked 2026-07-12: the trigger fired
  and the rename re-entered the roadmap as the "Spec the kernel → sdk rename"
  grilling row.

## Out of scope for this spec

- `nscc` naming/absorption — CCC/orchestration grilling row.
- Roaster/reviews naming residue — review/feedback grilling row.
- Foundation domain-residue move-ups, `config` collapse, what `kit` is, Machine
  Envelope ownership, checkpoint seam — graduated Question Row.
- clinkr/areg brand expansions — graduated Question Row.

## Verification

Per item: `just` (native `tsc` + Vitest + guard) green; after items 8–9, the style guard is
the proof the taxonomy and projection hold. After item 3, `ls ts/packages` shows
exactly the tracked role roots. Corrected sweep finding recorded here for the record:
`@internal/pi-tools`'s `side-session` is a live, conformant Feature subpackage
(imported by stack-view and context-profiler) — the "dead or unshipped" suspect from
the hosts/kernel sweep is withdrawn.
