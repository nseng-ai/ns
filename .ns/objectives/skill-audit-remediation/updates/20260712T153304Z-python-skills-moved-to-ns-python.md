# Python skill family moved to nseng-ai/ns-python

## Summary

By explicit user decision, all nine python-specific skills left this repo for the
new private repo `nseng-ai/ns-python` (fresh copy from commit `ec34d3749`,
post-Tranche-0 content, areg invocation overlays stripped; no vendor-back):
`dignified-python`, `dignified-python-tripwire`, `pytest`,
`python-fake-driven-testing`, `python-fake-driven-test-layout`,
`create-python-package`, `create-python-dev-cli`, `setup-pypi-publish`,
`setup-python-gh-ci`.

ns-side removal: skill dirs, the five mirror symlink pairs, nine
`skills-lock.json` entries, nine Pi exclusions; the five command-backed entries
left areg's `command-backed-skill-registry.ts` (surfaces `dignified:python`,
`dignified:python-tripwire`, `python:pytest`, `python:fake-driven-testing`,
`python:fake-driven-test-layout`) with their tests; the dormant
`.ns/reviews/dignified-python-tripwire` review definition (repo tracks only 3
`.py` files, all objective tooling) and the plans-write prompt's Python
review-subagent guidance were removed with their paired test assertions;
`project-setup` lost its four Python routes and now points at ns-python;
`skill-audit`'s Load With list and skill-conventions' examples dropped the moved
names.

## Objective Impact

The audit fleet this objective remediates no longer contains the python family.
Tranche 0's python fixes landed before the move and travelled with the copy.
Roadmap guidance for T1 (python family branch), T2 (setup-python-gh-ci), and T3
(dignified-python versions/* and python-fake-driven-testing TOCs,
setup-python-gh-ci criteria) is trimmed accordingly; those findings are out of
scope here and can be picked up in ns-python if wanted.

## Follow-Ups

- The remaining T1–T4 python findings in `references/audit-findings.md` are
  historical record only; remediating them now happens in ns-python.
- ns-python has no skill-management/areg tooling; decide its conventions
  separately if it grows beyond a plain skills repo.
