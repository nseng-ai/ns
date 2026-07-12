# T4 routing retrofit executed

## Summary

First Tranche 4 slice executed via an Objective Runner step on
`skill-audit-t4-routing-retrofit` (commit f08035a9). The accepted routing retrofit
(frontload item 5) is done: code-thermostack's Preflight now derives STACK_BASE_REF
from `ns slot gt exec stack-branches --downstack --format json` instead of a manual
parent walk, and code-gt-linearize-descendants' step 2 replaces its recursive
`gt children`/`gt parent` enumeration with `stack-branches --format json`, routing
the forked-stack case to the sibling `stack-map-branches` exec (full-scope
stack-branches intentionally fails `forked-stack`). The child verified the live CLI
contract via `--help`, `--json-schema`, real runs in both scopes, and the command
source before writing skill text — resolving the two HIGH hand-rolled-traversal
findings without extending any CLI.

Residuals kept by design: linearize's per-branch evidence gathering stays hand-rolled
(that is the graduated `descendants-report` record, frontload item 8), and
thermostack's tracked-branch preflight overlap was left for its own finding.

Validation: `just` green, `areg check` OK, both skills healthy via `areg skill show`.

## Objective Impact

Tranche 4 is in progress: accepted item 5 of 5 done (routing retrofit). All four
Graphite stack-ops skills now route topology reads through tested exec commands.
Remaining: backup-refs, wait-for-checks, handoff slug/term-matching, the
episode-slice script, the three graduate records, and the skill-management-subsystem
note.

## Follow-Ups

- Next T4 slices: the four remaining accepted implementations, then graduate records
  plus the areg-mutations note.
