# ADR 0037: Objective Runner Parent-Only Publication

## Status

Accepted

## Context

Objective Runner step deliberately separates untrusted implementation from runner-attested local state. Giving its child publication credentials, or letting `runner-finish` publish, turns prose execution policy into external-write authority; collapses that trust boundary.

Trusted parent orchestration may still need to publish verified local checkpoint. That exception requires narrow authorization, exact target binding, behavior reflecting non-atomic push and pull-request update operations.

## Decision

Objective Runner step stays absolutely local-only. `runner-begin`, implementation child, `runner-finish` cannot push or mutate pull request. Publication is separate parent-invoked action, available only after `runner-finish` created verified local provenance commit and returned its checkpoint.

Publication requires both:

1. durable prose in selected Objective's `## Runner Policy` permitting it; and
2. exact human confirmation of launch preview, represented by parent policy attestation.

Authorization is versioned, validated, held outside repository, bound to one invocation, Objective slug, current non-trunk branch, already-existing pull request and head branch, launch head, remote head, subsequently chained last-published head. Ephemeral orchestration state; not secret, bearer token, Objective field, Branch Memory entry, repository setting, or durable grant. CLI validates attestation; does not interpret Runner Policy.

Immediately before every write, publisher revalidates full binding and runner checkpoint: attestation, Objective and branch identity, pull request identity and head branch, clean verified local state, descendant history, intended local head, unchanged remote head. Drift or missing evidence refuses before mutation.

Ordering fixed:

1. `runner-finish` verifies and commits locally.
2. Parent judges checkpoint and continuation or recovery.
3. Parent records and commits any material Objective tracking.
4. Parent builds typed cumulative summary from runner-attested commit and validation facts plus explicit parent decisions.
5. Parent invokes publisher, which pushes exactly bound branch with normal fast-forward semantics, confirms existing pull request head, best-effort replaces one slug-bound managed summary section.

Child claims are never publication authority or trusted summary input. Publication cannot occur inside one-step subagent call; cannot create pull request, change branches, reshape or submit stack, force-push, merge, land, deploy, or invoke arbitrary external-write API.

Push and pull-request editing are not atomic. Push refusal or failure stops before edit. Push success then edit failure is successful-partial result: advances invocation's last-published head, preserves valid local checkpoint, does not roll back or force-push, may be healed by later full cumulative managed-section update.

## Consequences

- Local-only execution is default; publication requires two independent authorization keys and exact existing-PR binding.
- Credentials, authorization artifacts, publication targets, summaries never enter child prompt or contract.
- Parent digesting distinguishes runner-attested facts, child claims, parent judgment and tracking, push outcome, PR-edit outcome.
- Cumulative regeneration makes stale managed section recoverable while preserving all unmanaged PR prose and regions owned by other Objectives.
- Explicit successful-partial outcome reflects external reality without weakening verification or inventing rollback authority.

## Alternatives

- **Child or `runner-finish` publication:** rejected: grants external authority inside implementation trust zone.
- **Persistent or prose-derived grant:** rejected: authorization must be explicit, ephemeral, exactly bound.
- **PR creation, force push, stack mutation, or merge authority:** rejected: broader than checkpoint publication.
- **Treat push and PR edit as atomic:** rejected: rollback would need unsafe history mutation, cannot undo observed push.
