# Roadmap

## Work

- [~] Whole-repo capability inventory and disposition audit — catalog every capability in `/Users/schrockn/code/nonslop`, not just `areg`: `areg` modules/templates/tests; all 21 nonslop `ns-*` skills; existing asdl-tools vendored `ns-*` copies; missing skills; duplicate/renamed skill names; lockfile entries; README/AGENTS/CLAUDE instructions; `docs/skill-standards.md`; sync/cleanup scripts; GitHub workflows/actions; just/dprint/pyproject/release recipes; agent configuration; local development integrations such as `local.just`; checkout-local `.agents`/`.claude` symlinked capabilities such as twerk links; empty/skeletal package directories such as `packages/nonslop-dev`; and every live `nonslop`/`nseng-ai/nonslop` reference. Produce a migration map that names each destination and disposition (`migrate`, `rewrite`, `fold`, `retire`, `ignore as cache/build/local-only`) before moving files. Evidence so far: `nonslop-capability-inventory.md` seeds the whole-checkout capability catalog; still needs final per-item dispositions before files move.
- [ ] Port `areg` as a standalone workspace package — create `packages/areg`, move/adapt source and tests, wire root workspace metadata, keep the `areg` script, and remove the root dev dependency on `nonslop`. Evidence: `areg` unit/scenario/gateway tests exercise `create-project`, `check`, `update-skills`, `exec skillx`, and `exec nsx` with fake gateways.
- [ ] Promote the exact `ns-*` catalog to first-party local skills — create canonical `skills/<name>/` directories for all 21 nonslop skills, reconcile differing existing copies, create `.agents`/`.claude` symlinks, and update `skills-lock.json` to local sources. Evidence: local-skill structure checks pass and the migrated catalog includes the nonslop-only skills.
- [ ] Repoint distribution and command references — rewrite `areg` defaults, generated templates, `nsx`, `ns-install`, `ns-skillx`, `ns-skill-management`, just recipes, docs, and tests from `nonslop`/`nseng-ai/nonslop`/`uvx nonslop` to `areg` and `dagster-io/asdl-tools`. Evidence: targeted searches show no stale live references outside explicit retirement notes.
- [ ] Prove nonslop deletion readiness — demonstrate that normal repo development and skill invocation no longer require `/Users/schrockn/code/nonslop`, the old package, or the old GitHub source. Evidence: targeted package tests and relevant repo checks pass, and a final dependency/reference search supports deletion readiness.

## Parked

- Actual deletion of `/Users/schrockn/code/nonslop`, deletion/archive of `nseng-ai/nonslop`, or removal of external project artifacts — perform only after an explicit future request.
- Mounting `areg` under the top-level `asdl` CLI — revisit only if the standalone package boundary becomes a burden.
- Backward-compatible `nonslop` package aliases or `uvx nonslop` command support — intentionally out of scope for these private in-development projects.
