# Roadmap

## Work

- [x] Rework `areg init` into a safer preflight/planning/apply flow, including explicit behavior for existing `areg.json`, malformed managed blocks, prompts, and partial-failure prevention.
      Evidence: `init_project` now builds a full `InitPlan`/`TextWritePlan` before any side effects, so local validation aborts before touching the filesystem or `npx`. `test_init_project.py` scenario tests cover malformed agents/claude managed blocks (including doubled-start, doubled-end, and end-before-start marker variants) erroring before install (`fake_npx.invocations == []`), invalid and non-object `areg.json` erroring before install, path-shape preflight failures (wrong-type `asdl.toml`/`AGENTS.md`/`CLAUDE.md`/`.claude`/settings) before install, `asdl.toml` `[areg]` agents preservation/replacement, non-destructive `npx` failure that also preserves pre-existing planned files, and successful initialization (landed commit `a2086b45`).
- [x] Harden destructive and path-sensitive filesystem operations with canonical path validation and symlink policy for managed writes, `.claude` settings, and `skillx cleanup`.
      Evidence: commit `7379b9ae` rejects symlinked `areg init` managed files, symlinked `.claude`/settings paths, and outside-project write targets during apply-time validation; `skillx cleanup` now rejects symlinks, non-directories, canonical temp-root escapes, and `rmtree` failures with clean JSON `CleanupResult` errors. Tests cover `AGENTS.md`, `CLAUDE.md`, `asdl.toml`, `.claude`, settings symlink refusal before install, post-`npx` settings-parent revalidation, cleanup traversal escape, symlink, non-directory, missing, rmtree failure, and happy-path cleanup/write behavior. Verification: targeted areg suite passed; full `just` passed.
- [x] Clean up areg's external boundary model so host-tool checks, Git root discovery, `gh`, `npx skills`, and project skill state have coherent injectable ownership.
      Evidence: commit `0470dc19` introduces an injectable `AregEnvironment` for `gh`/`npx` availability and Git-root discovery, threads it through `AregContext`, removes global `shutil.which` checks from `preconditions.py`, removes direct Git subprocess discovery from `init_project.py`, and moves scenario precondition/init/skillx/update-skills coverage to fakes. The follow-up workspace-boundary slice keeps `NpxSkills` as the side-effectful external-command gateway, makes `FakeNpxSkills` a non-I/O invocation recorder, and adds an explicit skillx transient-workspace gateway with real and in-memory fake implementations for inspectable fetched skill trees. Scenario tests for `init` and `update-skills` now assert npx invocations and areg-owned writes rather than fake-created install artifacts; skillx fetch tests use the new workspace fake. Verification: targeted areg gateway/unit/scenario suites passed; `just lint`, `just format-check`, `just ty`, `uv run pytest packages/areg/tests -q`, and `just test` passed.
- [ ] Make lockfile handling explicitly typed and user-facing, including malformed JSON shape errors and stricter skill lock consistency validation.
      Evidence: invalid lockfile shapes fail with clear Click errors, and repository lock entries satisfy the enforced hash contract.
- [ ] Reconcile migrated skill docs/templates with repo conventions and generated artifact expectations.
      Evidence: `create-python-dev-cli`, `python-fake-driven-test-layout`, `setup-python-gh-ci`, `create-python-package`, and lockfile docs/tests no longer contradict the repo's package/import and CI conventions.
- [ ] Re-run the strict review against the remediated branch and capture any remaining intentional deferrals.
      Evidence: targeted tests and relevant repo checks pass, and remaining review comments are either resolved or explicitly parked.

## Parked

- Broader redesign of `npx skills` update/install semantics beyond what areg needs for this branch.
- Full content audit of every migrated skill outside the concrete review findings.
