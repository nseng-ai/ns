# Roadmap

## Work

- [x] Rework `areg init` into a safer preflight/planning/apply flow, including explicit behavior for existing `areg.json`, malformed managed blocks, prompts, and partial-failure prevention.
      Evidence: scenario tests cover successful initialization, prompts and `--yes`/`--no-append`, malformed managed marker variants before install, invalid/non-object and existing `areg.json` semantics, path-shape preflight failures before install, and `npx skills add` failure preserving planned local files. Targeted areg tests and full `just` passed locally.
- [x] Harden destructive and path-sensitive filesystem operations with canonical path validation and symlink policy for managed writes, `.claude` settings, and `skillx cleanup`.
      Evidence: `skillx cleanup` tests cover valid removal plus traversal/canonical escape, parent-symlink escape, target symlink, broken symlink, non-directory, missing, wrong-prefix, and outside-temp-root refusals; CLI scenario coverage verifies JSON failure output. `areg init` scenario tests cover symlink rejection before install for `areg.json`, `AGENTS.md`, `CLAUDE.md`, `.claude`, `.claude/settings.local.json`, and a broken managed symlink. Targeted areg tests, all areg tests, and full `just` passed locally.
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
