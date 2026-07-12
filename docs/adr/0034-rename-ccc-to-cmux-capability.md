# ADR 0034: Rename CCC to the cmux capability

## Status

Accepted — decided 2026-07-11 in the `ontology-reshape` CCC/orchestration grilling
session; execution mechanics live in
`docs/wayfinding/ontology-reshape/cmux-reshape-spec.md`. Amends the root `CONTEXT.md`
CCC vocabulary and supersedes the CCC-boundary framing in
`ts/packages/capabilities/ccc/CONTEXT.md`.

## Context

The grilling row asked whether CCC ("Cmux Command and Control") is a real domain
concept or an accretion. The evidence said accretion:

- The package's real content is one domain: driving cmux workspaces (prompt/trunk/plan
  dispatch, sidebar summaries, workspace summary, claude-plan-tab, slot open-branch,
  branch-slug generation). The "command and control" framing existed to justify a
  grab-bag boundary the old `CONTEXT-MAP.md` needed paragraphs to describe.
- The glossary was the heaviest-drifted context file in the repo (drift audit
  2026-07-10): phantom `core`/`autobranch` subpackages, two entries for the retired
  `/ns:objective:stack-impl`, and claimed ownership of worktree-status observability
  that lives entirely in `hosts/pi` with zero `@nseng-ai/ccc` imports.
- The non-cmux content was residue: `./land`, `./trunk-pull`, and `./autoslot` export
  subpaths are pure re-export shims over `@nseng-ai/flow/api` whose only importers are
  the package's own tests.
- The standalone `ccc` bin registers exactly one hidden command
  (`exec cmux-workspace-summary`) — a whole CLI entrypoint for one operation, outside
  the kernel extension-descriptor pattern every other capability uses.
- The adjacent unscoped `nscc` host (one letter from CCC) was already dispositioned by
  deletion in an earlier slice of this row.

## Decision

1. **Strong-form rename.** `@nseng-ai/ccc` becomes `@nseng-ai/cmux` at
   `ts/packages/capabilities/cmux`. "CCC" and "Cmux Command and Control" are retired
   outright as anti-vocabulary. No compatibility aliases. The capability is defined in
   one line: the capability that drives cmux workspaces. Naming a first-party unit
   after the external tool it drives follows existing precedent
   (`capability-kit/graphite`, `capability-kit/git`, `capability-kit/github`,
   `capability-kit/cmux`).
2. **Flow-facade residue deleted.** The `./land`, `./trunk-pull`, `./autoslot`
   subpaths, `autoslot-presentation.ts`, and their tests are removed; the
   `@nseng-ai/flow` dependency is dropped if nothing real remains using it. Source
   -control lifecycle vocabulary has no home in this capability.
3. **Command surfaces.** Pi namespace `/ns:ccc:*` → `/ns:cmux:*` with extension id
   `cmux`. The standalone `ccc` bin is deleted — a bin named `cmux` would shadow the
   external cmux CLI, and the kernel extension-descriptor pattern is the sanctioned
   home — so the one command re-homes as `ns cmux exec workspace-summary`.
4. **Skills.** `ccc-*` skills rename to `ns-cmux-*` (matching the `ns-flow-*`
   convention): `ns-cmux-sidebar`, `ns-cmux-stack-map`, `ns-cmux-available-work`,
   `ns-cmux-branch-triage`. Handoffs keeps end-to-end ownership of handoff-tab and
   re-mints it as `ns:cmux:handoff-tab` (the namespace names the UX-surface domain,
   not the owner).
5. **Kit substrate stays.** `capability-kit/cmux` (command shape, gateway, Pi-launch,
   cmux/Pi runtime typings) remains intact as the neutral substrate; `hosts/pi` builds
   on its runtime typings, so moving it above the host tier would create a cycle. The
   stale "can move to a dedicated cmux package" comment is deleted.
6. **Glossary disposition.** `capabilities/cmux/CONTEXT.md` is rewritten from scratch
   as a minimal cmux glossary; the CCC-era meta-terms (CCC boundary, CCC orchestration
   layer, CCC Pi subpackage, CCC command surface, Stable non-CCC orchestration
   surface, Objective stack implementation orchestration, Flow land consumption, Lower
   capability, Orchestration candidate, Portable command progress as capability-local
   guidance) are retired. Worktree-status and Graphite-metadata-status vocabulary
   re-homes to `hosts/pi/CONTEXT.md`, matching real ownership. The root `CONTEXT.md`
   CCC entry is rewritten as the cmux-capability entry with CCC in its Avoid list.
7. **Internal structure.** Subpackages become `api, core, ns, pi`; `src/cmux/` renames
   to `src/core/` (no package/subpackage name stutter); `src/ns/` reduces to the
   kernel extension module; `CCC_PACKAGE_IDENTITY` becomes `CMUX_PACKAGE_IDENTITY`
   with `ownedConcerns` trimmed to cmux-workspace orchestration.
8. **Cross-initiative boundary.** This reshape builds no dispatch CLI parity. The
   `cross-harness-parity` Objective closes by explicit decision: its remaining goals
   (dispatch parity, command-output summaries, parity-table sweep) are released to the
   future end-to-end docs effort, and its "Pi is additive, never canonical" doctrine
   re-homes there.
9. **Ripple sweep, uniform.** Branch Memory namespace `ccc-dispatch` →
   `cmux-dispatch` (transient staged prompts; no migration), `NS_CCC_SIDEBAR_MODEL` →
   `NS_CMUX_SIDEBAR_MODEL` (breaking config rename), `.pi/extensions/ccc.ts` →
   `cmux.ts`, areg generic-backing-skill rows to `ns:cmux:*`, and the doc sweep rides
   the executing PR.

## Consequences

- One sentence now describes the package's boundary; the orchestration-layer
  meta-vocabulary (a chunk of the ontology's describing-language impurity) is gone.
- Breaking renames land without aliases: Pi command names, skill names, the env var,
  and the Branch Memory namespace all change at once. This repo is private and
  pre-release; breakage is sanctioned.
- The dispatch family remains Pi-only. That gap is now tracked by the e2e-docs
  successor effort, not by a live parity objective.
- Historical records (Objective updates, wayfinding sweep assets, retros, older ADRs)
  keep the CCC name as immutable history; only live claims are rewritten.
