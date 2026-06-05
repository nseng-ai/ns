# Npx skills and skillx workspace boundary resolved

## Summary

The remaining project-skill-state portion of the external-boundary remediation has landed in the current working-tree evidence. The implementation keeps `NpxSkills` as the narrow gateway for invoking the external `npx skills add` command while removing default fake filesystem mutation from `FakeNpxSkills`.

`FakeNpxSkills` now records requested `add` invocations and supports configured failure injection only; it no longer writes `.agents/`, `.claude/`, or `skills-lock.json` into test directories. Code that genuinely needs an inspectable fetched skill tree, `areg exec skillx fetch`, now depends on an explicit skillx transient-workspace gateway. The real workspace installer creates a `skillx.*` temp directory, invokes the injected `NpxSkills` gateway, reads the installed `.agents/skills` tree, and returns the real paths expected by the skillx JSON contract. The fake workspace installer is in-memory, records invocations, and returns deterministic virtual paths and file lists without touching disk.

Scenario tests for `areg init` and `areg update-skills` now assert npx invocations and areg-owned outputs instead of incidental fake-created install artifacts. The post-install `.claude` symlink revalidation test remains covered by a deliberate test-local mutating `NpxSkills` stub. Skillx unit/scenario tests now use the workspace fake for fetch behavior, while real gateway sanity tests cover the real workspace reader with controlled npx stubs.

Evidence basis: local working-tree diff on branch `areg-npx-skills-skillx-workspace-boundary` against Graphite parent `injectable-areg-environment-gateway`; no PR evidence was required. Verification: targeted areg gateway/unit/scenario suites passed; `just lint`, `just format-check`, `just ty`, `uv run pytest packages/areg/tests -q`, and `just test` passed.

## Objective Impact

- Roadmap Work item #3 moved from `[~]` to `[x]`: host-tool checks, Git-root discovery, `gh`, `npx skills`, and skillx project-skill inspection now have coherent injectable ownership for current areg surfaces.
- The open `NpxSkills.add` design question is resolved for this Objective slice: production `NpxSkills.add` remains a side-effectful external-command boundary; inspectable transient skill trees are owned by the skillx workspace gateway; default fakes stay non-I/O.
- The installed-skill-tree versus project-filesystem-state risk is de-risked for `areg init`, `areg update-skills`, and `areg exec skillx fetch` without expanding into the parked broader redesign of upstream `npx skills` install/update semantics.

## Follow-Ups

- Continue with the remaining Objective rows: typed/user-facing lockfile validation, migrated skill docs/template reconciliation, and final strict review rerun.
- Leave broader `npx skills` install/update semantics parked unless future areg behavior requires areg-owned persistent skill-state application.
