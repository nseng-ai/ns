# Roadmap

## Work

- [x] Record the out-of-sequence selection in the parent TypeScript migration Objective.
  - Updated `port-asdl-toolkit-to-typescript` so `areg` is no longer merely parked pending evidence, and explained why this Objective intentionally jumps ahead of the default `handoff`/`objective` sequence.
  - Evidence: parent migration ledger, roadmap, and Semantic Update `updates/2026-06-14T210247Z-areg-promoted-out-of-sequence.md` identify `areg-typescript-port` as the active capability slice and preserve the remaining sequence implications.
- [ ] Inventory current `areg` contracts before porting implementation.
  - Classify durable versus incidental behavior for CLI commands, hidden `exec skillx` JSON, help/usage output, exit codes, managed project files, `skills-lock.json`, `asdl.toml` and legacy `areg.json`, local skill layout checks, command-conversion behavior, and external `git`/`gh`/`npx` boundaries.
  - Evidence: a contract inventory document or Semantic Update cites current Python source/tests and names accepted divergences before implementation relies on them.
- [ ] Establish the TypeScript package shell and gateway seams.
  - Add a `ts/packages/areg` package with strict TypeScript, Vitest tests, package-local command wiring, and fake-driven gateways for filesystem, Git-root/tool checks, `gh api`, `npx skills`, transient skillx workspaces, and project configuration where needed.
  - Keep seams package-local unless repeated use proves a shared `@asdl/core` or `@asdl/clinkr` extraction.
- [ ] Port the hidden `exec skillx` helpers as the first deterministic slice.
  - Preserve parse/list/fetch/cleanup behavior, JSON payloads, selection flow, GitHub listing errors, `npx skills add` transient workspace behavior, and cleanup path safety.
  - Evidence: fake-backed tests and CLI scenario coverage exercise success and failure payloads.
- [ ] Port `areg check` and skill/lockfile validation.
  - Recreate the accepted checks for local/GitHub/git/gitlab skill structures, frontmatter, invoke-only state, lockfile consistency, orphaned installed skills, skill pairing, and user-facing malformed-lockfile errors.
  - Evidence: scenario/unit tests cover the accepted convention set without depending on Python internals.
- [ ] Port `areg init` project bootstrap behavior.
  - Preserve Git-root requirements, bootstrap skill install, agent resolution, managed `AGENTS.md`/`CLAUDE.md` blocks, `asdl.toml` `[areg].agents`, legacy config fallback where accepted, symlink/path safety, and non-destructive config handling.
  - Evidence: fake-backed scenario tests show planning/mutation order and local validation failures do not leave predictable half-applied state.
- [ ] Port `areg update-skills` as the curated lockfile workaround.
  - Preserve filtering by skill/source, dry-run behavior, agent resolution, one-by-one `npx skills add` calls, and aggregate failure reporting while the upstream `npx skills update` bug remains relevant.
  - Evidence: scenario tests verify curated lockfile behavior and documented workaround semantics.
- [ ] Port `areg command convert|revert|list`.
  - Preserve local-skill resolution, invoke-only state transitions, Pi replacement verification, settings edits, symlink/path safety, and revert/list reporting.
  - Evidence: command scenario tests cover local skill names, path-like skill selectors, refusal cases, and replacement-status reporting.
- [ ] Decide and implement the TypeScript distribution/install model.
  - Choose consumer-backed invocation for local checkout development and installed use, update `justfile`/workspace metadata/docs accordingly, and avoid assuming either Python `uvx` or prior run-from-source shims without evidence.
  - Evidence: installation recipe and docs invoke TypeScript-backed `areg` consistently.
- [ ] Cut over public callers and retire the Python package.
  - Remove active references to Python `packages/areg`, delete or archive the package after rollback/reference evidence is recorded, and ensure tests/docs/skills no longer direct users to Python-backed invocation.
  - Evidence: repo searches and relevant workspace checks show `areg` is TS-default and Python is no longer an active path.
- [ ] Feed reusable lessons back into the parent migration Objective.
  - Record any reusable findings about skill-lock parsing, managed project-file mutation, external skill tooling, or distribution that should affect later capability ports.
  - Evidence: parent Semantic Update and, if warranted, `porting-playbook.md` changes capture lessons without moving unproven package-local seams into shared foundations.

## Parked

- Mounting `areg` under the top-level `asdl` CLI or renaming the product surface.
- Redesigning the upstream `npx skills` install/update model instead of preserving the current workaround.
- Broad skill-content audits unrelated to behavior needed by the `areg` port.
- Browser-compatible execution for `areg` workflows that depend on local filesystem, Git, `gh`, or `npx` state.
- Shared TypeScript extraction for skill-lock/project-config/managed-block helpers before a second consumer proves the seam.
