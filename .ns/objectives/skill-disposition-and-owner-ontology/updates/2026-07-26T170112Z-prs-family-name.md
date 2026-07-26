# PR Family Name Selected

## Summary

The destination-map review selected `prs` as the stable family name for GitHub and pull
request workflows, replacing the proposed `github-collaboration` name. The affected skills
are `code-fix-gh-stack`, `code-gh`, `pr-address`, and `pr-make-accountable`; their
harness-visible identities remain unchanged.

## Objective Impact

The shorter family name keeps ownership centered on the pull-request workflow rather than
on a particular collaboration provider. The map remains complete with 58 unique identities
and destinations. This naming decision does not authorize migration or complete the joint
ADR-plus-map approval gate.

## Follow-Ups

- Continue reviewing the remaining destination map and explicitly approve ADR 0046 and the
  complete map together before any canonical skill moves.
- During cutover, update all four canonical destinations to their disposition-specific
  `prs` family while preserving flat harness identities.
