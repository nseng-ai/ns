# Internal Code Family Consolidated

## Summary

The destination-map review selected one `code` family for every internal skill whose
identity begins with `code-`. This moves internal GitHub, Graphite, validation, review
remediation, and workflow-router skills out of the previously proposed `prs`, `graphite`,
`validation`, `review-system`, and `repository-operations` families.

The `prs` family now contains only public and incubating PR product workflows:
`pr-make-accountable` and `pr-address`.

## Objective Impact

The family rule for internal code workflows is now identity-aligned and mechanically clear:
all 11 internal `code-*` skills have destinations under `skills/internal/code/`. Their flat
harness identities remain unchanged. The complete map still contains 58 unique identities
and destinations, and this review decision does not authorize migration or complete the
joint ADR-plus-map approval gate.

## Follow-Ups

- Continue reviewing the remaining destination map and explicitly approve ADR 0046 and the
  complete map together before any canonical skill moves.
- During cutover, preserve all `code-*` invocation names while moving their canonical
  sources into `skills/internal/code/`.
