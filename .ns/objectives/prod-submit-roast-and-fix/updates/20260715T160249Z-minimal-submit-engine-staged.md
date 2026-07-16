# Semantic Update: minimal submit engine staged without default migration

## Summary

Flow now has a narrow two-phase minimal-submit Capability API. Read-only planning
uses structured Graphite metadata to classify the current branch and derive the
current/non-trunk-downstack impact scope. Execution rechecks source, cleanliness, and
topology before readiness, optional automatic restack, readiness recheck, current
stack submit, and thin current-PR verification. Results carry the semantic failure
stage and conservative local/remote mutation evidence.

`ns flow submit --minimal` exposes that clean-tree path. It does not load or validate
`flow.submit.pre` installations and runs no hooks, checkpoint, metadata prewrite, PR
prose, or model work. Graphite `--force` remains opt-in through Flow's explicit
`--force`; the default omits it.

## Objective Impact

This is an implementation staging step for the already-resolved submission-class
surface. It does not complete the Objective: default `ns flow submit` retains its
existing order and behavior, and migration to cheap submit remains open alongside
`ns flow ship`, review/autofix integration, prose migration, attestations, intent
routing, and live dogfooding.

No real submit, push, PR mutation, deployment, or live publication was performed or
claimed by this update.

## Follow-Ups

- Migrate default submit only when the ship/prose ownership work is ready to preserve
  the decided two-verb contract.
- Implement and route completion-oriented workflows through `ns flow ship`.
- Live-proof the completed submit/ship lifecycle separately; fake-driven validation of
  the staged engine is not live publication evidence.
