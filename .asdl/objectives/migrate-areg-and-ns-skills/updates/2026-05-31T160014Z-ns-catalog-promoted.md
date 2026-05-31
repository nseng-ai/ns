# ns Catalog Promoted to Local Skills

## Summary

The exact 21-skill `ns-*` catalog from the retiring nonslop checkout has been promoted into this repo's first-party local-skill layout.

The migrated catalog now has canonical `skills/<name>/` directories, `.agents/skills/<name>` symlinks to `../../skills/<name>`, `.claude/skills/<name>` symlinks to `../../.agents/skills/<name>`, and local `skills/<name>` entries in `skills-lock.json`. The six nonslop-only skills are present: `ns-create-bun-ts-project`, `ns-install`, `ns-setup-dprint-gh-ci`, `ns-setup-pypi-publish`, `ns-setup-python-gh-ci`, and `ns-setup-repo-to-use-gt`.

Reconciliation choices are reflected in the migrated files: `ns-dignified-python` keeps the asdl-tools reference organization while adopting the retiring source's more general subprocess guidance that allows explicit `check=False` when handling `returncode`; `ns-py-fake-driven-testing` adopts the retiring source's optional Layer 6 conformance guidance, and `ns-fake-driven-test-layout` was updated to document optional `tests/conformance/` placement.

Distribution references were also repointed: `ns-install`, `ns-skillx`, `nsx`, and `ns-skill-management` now call `areg` and `dagster-io/asdl-tools`; the stale root `refresh-nonslop` recipe is replaced by `refresh-skills`; repo skill-management tests and the agent resource catalog no longer describe the migrated catalog as vendored/external.

Verification: `uv run areg check`, `uv run areg exec skillx parse "dagster-io/asdl-tools --skill ns-pytest"`, `uv run pytest packages/areg/tests -q`, `just dprint-check`, and full `just` passed. A live-reference search across the migrated repo surfaces found no remaining actionable dependency on the old package, checkout, or GitHub source.

## Objective Impact

The `Promote the exact ns-* catalog to first-party local skills`, `Repoint distribution and command references`, and `Prove nonslop deletion readiness` roadmap rows are now complete under landed-state semantics.

The asdl-only `ns-setup-python-ci` variant has been intentionally retired after `ns-setup-python-gh-ci` landed under the exact nonslop catalog name. The Objective is deletion-ready for the old nonslop checkout/repo from this repo's perspective; actual deletion, archive, or redirect remains parked as an explicit future destructive action.

## Follow-Ups

- Submit the branch update so PR #753 includes the promoted local skills and deletion-readiness evidence.
- If desired, run the Objective closure workflow after review; the remaining parked items are explicitly out of scope for this Objective.
