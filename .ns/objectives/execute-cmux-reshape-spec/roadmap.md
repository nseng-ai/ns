# Roadmap

Each `[ ]` row is one runner-sized slice of the attached
`cmux-reshape-execution-stack` plan (`brmem get cmux-reshape-execution-stack.md
--namespace branch-context` on the stack branches) — the plan section of the
same name is the row's authoritative scope. Slices are strictly sequential:
each branch stacks on the previous.

## Work

- [x] Slice 1 — `cmux-reshape/trim-flow-facade` (spec item 1): trim the
      flow-facade residue inside `capabilities/ccc`.
  - Landed pre-extraction as commit `206832e28`; evidence in the parent record's
    `updates/2026-07-12-cmux-reshape-slice-1-executed.md`. Kept here for stack
    continuity.
- [x] Slice 2 — `cmux-reshape/rename-package` (spec item 2): `git mv` the
      package to `capabilities/cmux` and `src/cmux` to `src/core`, rename to
      `@nseng-ai/cmux` with `CMUX_PACKAGE_IDENTITY`, and run the
      `@nseng-ai/ccc` → `@nseng-ai/cmux` exact-pair substitution over the
      enumerated live-source set.
  - Landed locally on `cmux-reshape/rename-package`; `just` and the live-source
    stale-package-name grep passed. Re-enumeration found additional in-scope
    package-name consumers, recorded in the Slice 2 Semantic Update.
- [x] Slice 3 — `cmux-reshape/rehome-bin-as-extension` (spec item 3): delete
      the `ccc` bin and `./cli` export, add the `./ns-extension` descriptor
      (`ns cmux exec workspace-summary` via kernel source-dev discovery, no
      registration edit anywhere), rewire the `objective-sidebar.ts` runtime
      caller, and add the CLI scenario tests the `ts/AGENTS.md` gates require.
  - Completed locally on `cmux-reshape/rehome-bin-as-extension`, including all
    five re-ratified caller locations. Root `just` passed and
    `ns cmux exec workspace-summary --help` resolved through source-dev
    discovery with no registration edit.
- [x] Slice 4 — `cmux-reshape/rename-surfaces-and-skills` (spec items 4+5):
      rename command surfaces (`ns:ccc:` → `ns:cmux:` exact pair), re-mint the
      handoffs extension id, `git mv` the four skills to `ns-cmux-*` with both
      symlink layers recreated, and rename the areg registry rows and
      exported registration symbol.
  - Completed locally on `cmux-reshape/rename-surfaces-and-skills`; root `just`
    and `areg check` passed, `areg skill find ns-cmux-sidebar` resolved, no live
    `ns:ccc:` hits or old skill paths remain, and all eight symlinks resolve.
- [ ] Slice 5 — `cmux-reshape/ripple-renames` (spec item 7): rename the
      `ccc-dispatch` Branch Memory namespace and tmpdir prefix and the
      `NS_CCC_SIDEBAR_MODEL` env var, with their test/fixture blast radius.
  - Policy: direct execution; these are breaking runtime-config renames with no
    aliases and no migration — the step report must carry the PR-description
    callouts (orphaned pre-rename staged dispatch prompts are acceptable; env
    var renamed without alias).
  - Evidence: `just` green; grep for `ccc-dispatch` and `NS_CCC_` over live
    source returns nothing.
- [ ] Slice 6 — `cmux-reshape/glossary-and-docs` (spec items 6+8): rewrite
      `capabilities/cmux/CONTEXT.md` from scratch per the spec's term list,
      re-home the worktree-status entries to `hosts/pi/CONTEXT.md`, rewrite the
      root `CONTEXT.md` CCC entry (Avoid gains "CCC" / "Cmux Command and
      Control"), replace the cmux `AGENTS.md` essay with a checklist pointer,
      and apply the kit comment ride-along.
  - Policy: direct execution; escalate the `Project-local adapter` keep/retire
    disposition before committing — every other term disposition is already
    ratified by ADR 0034.
  - Evidence: `just` green (includes `dprint check` and the objective sweep);
    final stack-wide word-boundary `ccc`/`CCC` grep over live source shows only
    deliberate immutable history.
- [ ] Closeout — run the plan's trust-nothing checklist on the top slice:
      rerun `just`; diff each slice's changed files against its plan scope list
      and justify every extra; re-read changed tests for behavior (not just
      renamed strings); account for every hit of the final `ccc` grep; confirm
      no submit happened and no `[cp]` commits exist.
  - Policy: direct execution for the checks; steer on any discrepancy found.
    Parent-row handoff and this record's closure are parent-session judgment,
    not a runner row.

## Parked

- Everything the plan marks out of scope stays with its owner: dispatch CLI
  parity (future e2e-docs effort), capability-kit `kit/` contents and
  `BrmemExecGateway` (parent Objective's junk-drawer grilling row), the
  `@nseng-ai/kernel` name (parked in the parent roadmap), slot-owned
  `code-smush` / stack-map surfaces.
