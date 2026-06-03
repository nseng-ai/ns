# Roadmap

## Work

- [x] Rework `areg init` into a safer preflight/planning/apply flow, including explicit behavior for existing `areg.json`, malformed managed blocks, prompts, and partial-failure prevention.
      Evidence: `init_project` now builds a full `InitPlan`/`TextWritePlan` before any side effects, so local validation aborts before touching the filesystem or `npx`. `test_init_project.py` scenario tests cover malformed agents/claude managed blocks erroring before install (`fake_npx.invocations == []`), invalid and non-object `areg.json` erroring before install, unknown-key preservation, non-destructive `npx` failure, and successful initialization (landed commit `a2086b45`).
- [ ] Harden destructive and path-sensitive filesystem operations with canonical path validation and symlink policy for managed writes, `.claude` settings, and `skillx cleanup`.
      Evidence: tests cover traversal, symlink escape, non-directory, missing, and happy-path cleanup/write cases.
- [ ] Clean up areg's external boundary model so host-tool checks, Git root discovery, `gh`, `npx skills`, and project skill state have coherent injectable ownership.
      Evidence: scenario tests avoid patching unrelated global process state except at real-gateway sanity boundaries.
- [ ] Make lockfile handling explicitly typed and user-facing, including malformed JSON shape errors and stricter skill lock consistency validation.
      Evidence: invalid lockfile shapes fail with clear Click errors, and repository lock entries satisfy the enforced hash contract.
- [ ] Reconcile migrated skill docs/templates with repo conventions and generated artifact expectations.
      Evidence: `create-python-dev-cli`, `python-fake-driven-test-layout`, `setup-python-gh-ci`, `create-python-package`, and lockfile docs/tests no longer contradict the repo's package/import and CI conventions.
- [ ] Re-run the strict review against the remediated branch and capture any remaining intentional deferrals.
      Evidence: targeted tests and relevant repo checks pass, and remaining review comments are either resolved or explicitly parked.

## Parked

- Broader redesign of `npx skills` update/install semantics beyond what areg needs for this branch.
- Full content audit of every migrated skill outside the concrete review findings.
