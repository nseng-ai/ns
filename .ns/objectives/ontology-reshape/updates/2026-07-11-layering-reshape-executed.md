# Layering reshape executed: all ten spec items landed as a local stack

## Summary

The ADR 0033 / `layering-reshape-spec.md` execution items 1–10 are implemented as
nine stacked local Graphite branches on `layering-reshape/record-decisions`
(item 3 produced no commit by design). Every slice passed the full repo validation
(`just`: tsgo + ~5k Vitest + style guard + dprint + objective sweep) before the next
began. Per ratified session policy the stack is local-only — no `gt submit`; user
reviews first.

## Per-item evidence

1. `layering-reshape/delete-pi-command-surfaces` — package deleted; live
   `public-package-set.mjs` exclusion entry removed (a reference the spec missed);
   CONTEXT-MAP count 29 → 28 in both occurrences; lockfile regenerated.
2. `layering-reshape/retier-reviews` — one-line `ns.tier` `standalone-tool` →
   `capability`; all four workspace deps already tier-legal.
3. *(no commit)* — residue deletion executed by the user via a verified script. Count
   was **52 deletion roots, not the spec's 45/plan's 46**: six additional
   node_modules-only residue dirs under `capabilities/` (address, aretro, handoff,
   objective, roaster, slot) surfaced on re-enumeration. Every root was individually
   verified (zero tracked files; no content outside `node_modules`) both before
   emission and again inside the script before any deletion; deletion by exact path.
4. `layering-reshape/rename-pi-exec-gateway` — module → `command-exec.ts`, subpath →
   `./shared/command-exec`, alias deleted, `CommandExecApi` re-exported; importers
   rewritten by import origin (hosts/pi internal by hand; 7-package Workflow fan-out
   for the 35 external files); worktree-status's own separate interface renamed
   `WorktreeStatusExecApi`; AGENTS.md/CONTEXT.md/fake-driven-testing-skill vocabulary
   ride-alongs. `BrmemExecGateway` (capability-kit brmem-cli's distinct symbol) left
   as-is — not the pi seam; a candidate for the kit junk-drawer grilling row.
5. `layering-reshape/rename-hosts-ns-cli-dir` — `git mv hosts/ns-cli hosts/ns` + 9
   path-literal files (justfile, reviews.yml, publish script, ns-dev shared.ts +
   scenario tests, package test script, 2 integration tests); noise `ns-cli`
   substrings untouched.
6. `layering-reshape/move-ns-pi-subagents-internal` — moved to
   `internal/ns-pi-subagents`, rescoped `@internal/ns-pi-subagents` (tier kept
   `internal-pi-tool` until item 8); all consumers rewritten including `.pi` loaders,
   `workspace-packages.ts` map, style-guard fixture labels, package-local
   README/AGENTS/CLAUDE/AUTHORING docs the plan hadn't enumerated; empty `extensions/`
   role directory removed.
7. `layering-reshape/fold-skill-registry-into-areg` — module + test moved into areg;
   areg gains the five capability deps and re-exports the registry surface from its
   root barrel; pi-tools imports `@nseng-ai/areg`; both `public-package-set.mjs`
   entries removed; Host-surface subpackage glossary entry amended to name the
   sanctioned second `pi`-subpackage importer. The existing Objective Edge to
   `skill-management-subsystem` already records the fold — nothing added.
8. `layering-reshape/trim-tier-taxonomy` — `capability-pi` deleted and
   `internal-pi-tool` merged into `internal-tool` across all three taxonomy
   structures; pi-tools, ns-dev, ns-pi-subagents retiered; guard-test capability-pi
   cases deleted and internal-pi-tool cases renamed/deduped; doc sweep (root
   CONTEXT.md tier enumeration + retirement note, CONTEXT-MAP, hosts/pi CONTEXT,
   ts/packages README, docs/pi README, architecture-topology-report tier ids and
   color map). The spec's claim that `subpackage-conventions.md` enumerates tiers was
   confirmed stale — no edit there.
9. `layering-reshape/tier-directory-projection-guard` —
   `NS_TS_TIER_DIRECTORY_PROJECTION` rule module mirroring `internal-space.ts`;
   tier→directory only; kernel/ and capability-kit/ as exact single-package homes;
   synthetic case table plus real-repo empty assertion (all 27 packages project
   cleanly); projection documented at the top of `ts/packages/README.md`, whose stale
   migration-residue prose is now gone.
10. `layering-reshape/git-seam-to-foundation` — `capability-kit/src/git` +
    4 test suites → `foundation/git` (exports, subpackage rows, local-ref-reader
    barrel exports added for the graphite consumers); `kit/git-contract.ts` folded
    into `git/contract.ts` and deleted; `createNsGitGateway` stays kit-owned in
    `kit/git-gateway.ts` re-exported from the capability-kit root barrel; nine
    factory call sites split imports (factory from capability-kit, `GitGateway` type
    from foundation/git); ~145 importer files rewritten; brmem uses generic
    `resolveXdgHome` + brmem-owned `ns/brmem/prompts` segments and drops its
    capability-kit dep; the brmem→capability-kit debt edge is deleted and the guard
    passes without it; CONTEXT.md Extension Layering + Neutral Infra entries now name
    `@nseng-ai/foundation/git` as a live neutral-infra gateway.

## Experience notes (input for the "Decide the reshaping handoff vehicle" row)

- The spec + ratified plan handed off cleanly: a 10-agent read-only verification
  sweep before execution caught every stale spec claim (item 4's false
  feedback-watch claim and missed worktree-status interface; item 5's
  already-renamed package; item 7's double registry listing) and none caused rework
  mid-flight.
- Ground truth kept moving between sweep and execution (46 → 52 residue dirs; fixture
  labels renamed by an earlier slice changing a later slice's expected edit).
  Re-enumeration at execution time, not sweep time, was load-bearing twice.
- One mechanical hazard worth recording for future sweeps: substring-unsafe renames.
  `@nseng-ai/capability-kit/git` is a prefix of `.../capability-kit/github`; a blanket
  substitution corrupted 36 files' github imports before an immediate global check
  caught it (foundation has no github subpath, so detection and reversal were exact).
  Rename specs should state the word-boundary rule alongside the pair.
- Execution shapes: items 1, 2, 5–9 inline; item 4's external importers via a
  7-agent Workflow fan-out; item 10's ~145-file rewrite done as a single
  deterministic substitution instead of the planned agent fan-out (one literal pair,
  one process, same disjointness guarantee) — deviation noted, verified by full
  suite.
- Watch item honored: no stray `[cp]` checkpoint commits appeared; each slice sits on
  its own branch, `just` green per slice.
