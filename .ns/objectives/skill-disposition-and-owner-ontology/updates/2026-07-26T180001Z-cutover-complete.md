# Skill Tree Cutover Complete

## Summary

The approved 58-skill destination map is implemented exactly: canonical leaves now comprise 1 public, 23 incubating, and 34 internal skills, with no direct first-party child under `skills/` and matching leaf/frontmatter identities. All 58 flat first-party `.agents` symlinks resolve to nested canonical sources, `.claude` remains flat through `.agents`, the 16 real vendored `.agents` directories are unchanged, and `skills-lock.json` changes exactly the 58 local source paths while preserving hashes and vendored entries. `skills/README.md` is now the authoritative tree contract.

Exposure policy did not change. Current first-party output is 14 normal, 35 command-backed, and 9 invoke-only; the plan's 14/34/10 aggregate was stale, while the four Flow changes only removed contradictory `metadata.internal`. Public `pr-make-accountable` now requires only Git and authenticated `gh`, with `ns flow submit` optional.

Independent review found and remediation fixed an incubating `objective-next` mandatory dependency on internal `code-graphite` plus two skill-management procedure/safety defects. Validation passed through `just`, integration and isolated lanes, `just skill-exposure-check`, structural checks, and focused package suites.

## Objective Impact

Both remaining roadmap rows are complete and all completion criteria are evidenced, so the Objective closes as completed and is ready for synthesis by `professional-repo-curation`.

`INSTALL_INTERNAL_SKILLS=1 npx skills check` is deliberately not cited as passing evidence: it attempted an external vendored refresh, failed for two skills, and mutated vendored files; all accidental effects were restored. Repository validation and explicit exposure/structural checks pass. The runtime `.agents` descriptor's legacy `sourceType: vendored` label for first-party symlinks is nomenclature only and does not block closure.

## Follow-Ups

- Let `professional-repo-curation` synthesize the completed Subobjective through the preserved Objective edge.
- Consider renaming the runtime descriptor's legacy `sourceType: vendored` value for first-party symlinks in a separate tooling slice if the nomenclature becomes materially confusing.
- Treat external-refresh behavior in `INSTALL_INTERNAL_SKILLS=1 npx skills check` as a separate tooling concern; do not use it as cutover qualification evidence without controlling that refresh path.
