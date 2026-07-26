# ADR 0037: Objective Runner Parent-Only Publication

## Status

Accepted

## Context

An Objective Runner step deliberately separates untrusted implementation from runner-attested local state. Giving its child publication credentials or allowing `runner-finish` to publish would let prose execution policy become external-write authority and collapse that trust boundary.

Trusted parent orchestration may nevertheless need to publish a verified local checkpoint. That exception needs narrow authorization, exact target binding, and behavior that reflects the non-atomic push and pull-request update operations.

## Decision

The Objective Runner step remains absolutely local-only. `runner-begin`, the implementation child, and `runner-finish` cannot push or mutate a pull request. Publication is a separate parent-invoked action available only after `runner-finish` has created a verified local provenance commit and returned its checkpoint.

Publication requires both:

1. durable prose in the selected Objective's `## Runner Policy` permitting it; and
2. exact human confirmation of a launch preview, represented by a parent policy attestation.

The authorization is versioned, validated, held outside the repository, and bound to one invocation, Objective slug, current non-trunk branch, already-existing pull request and head branch, launch head, remote head, and subsequently chained last-published head. It is ephemeral orchestration state, not a secret, bearer token, Objective field, Branch Memory entry, repository setting, or durable grant. The CLI validates the attestation but does not interpret Runner Policy.

Immediately before every write, the publisher revalidates the full binding and the runner checkpoint: attestation, Objective and branch identity, pull request identity and head branch, clean verified local state, descendant history, intended local head, and unchanged remote head. Drift or missing evidence refuses before mutation.

Ordering is fixed:

1. `runner-finish` verifies and commits locally.
2. The parent judges the checkpoint and continuation or recovery.
3. The parent records and commits any material Objective tracking.
4. The parent constructs a typed cumulative summary from runner-attested commit and validation facts plus explicit parent decisions.
5. The parent invokes the publisher, which pushes exactly the bound branch with normal fast-forward semantics, confirms the existing pull request head, and best-effort replaces one slug-bound managed summary section.

Child claims are never publication authority or trusted summary input. Publication cannot occur inside the one-step subagent call and cannot create a pull request, change branches, reshape or submit a stack, force-push, merge, land, deploy, or invoke an arbitrary external-write API.

Push and pull-request editing are not atomic. Push refusal or failure stops before the edit. Push success followed by edit failure is a successful-partial result: it advances the invocation's last-published head, preserves the valid local checkpoint, does not roll back or force-push, and may be healed by a later full cumulative managed-section update.

## Consequences

- Local-only execution is the default; publication requires two independent authorization keys and exact existing-PR binding.
- Credentials, authorization artifacts, publication targets, and summaries never enter the child prompt or contract.
- Parent digesting distinguishes runner-attested facts, child claims, parent judgment and tracking, push outcome, and PR-edit outcome.
- Cumulative regeneration makes a stale managed section recoverable while preserving all unmanaged PR prose and regions owned by other Objectives.
- The explicit successful-partial outcome reflects external reality without weakening verification or inventing rollback authority.

## Alternatives

- **Child or `runner-finish` publication:** rejected because it grants external authority inside the implementation trust zone.
- **Persistent or prose-derived grant:** rejected because authorization must be explicit, ephemeral, and exactly bound.
- **PR creation, force push, stack mutation, or merge authority:** rejected as broader than checkpoint publication.
- **Treat push and PR edit as atomic:** rejected because rollback would require unsafe history mutation and cannot undo an observed push.
