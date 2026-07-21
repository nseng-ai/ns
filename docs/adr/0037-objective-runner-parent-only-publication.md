# ADR 0037: Objective Runner parent-only publication after checkpoint judgment

## Status

Accepted

Refines ADR 0040 (formerly numbered 0022) and ADR 0024 only for conditional post-checkpoint publication. Their implementation-child prohibition, runner-owned commit, verification gate, Runner Checkpoint trust split, and parent-judgment decisions remain unchanged.

## Context

ADR 0040 made every Objective Runner step local-only so an implementation child could not turn a prose execution policy into external-write authority. ADR 0024 moved child dispatch into the parent harness without changing that boundary. The resulting absolute rule is safe, but it also prevents trusted orchestration from publishing work after the runner has verified and committed it.

A publish-capable autorun must not collapse the two trust zones. The implementation child is untrusted narrative and implementation work: it receives no publication authorization, target, summary artifact, scratch path, or credential, and it cannot commit or perform an external write. The parent is trusted orchestration: it reads runner-attested checkpoint facts, makes the tracking and continuation judgments, and may invoke a narrow publisher only when a human explicitly authorized that invocation.

## Decision

Keep an **Objective Runner step** absolutely local-only. `runner-begin`, the implementation child, and `runner-finish` do not push or mutate a pull request. `runner-finish` still ends by returning the Runner Checkpoint after creating only the verified local provenance commit.

Permit a distinct **parent-only publication** action after a committed checkpoint, subject to all of the following rules.

### Authorization and binding

Publication requires two independent keys:

1. durable prose in the selected Objective's `## Runner Policy` permits the path; and
2. a human confirms a launch preview naming the Objective slug, current non-trunk branch, already-existing pull request, local launch HEAD, and remote PR head, after which the parent supplies an explicit policy attestation.

The CLI does not parse Runner Policy. The attestation records the trusted parent's judgment that it read the policy and obtained exact launch confirmation; it does not convert Markdown into machine state.

Authorization is bound to one autorun invocation, one Objective slug, one current branch, one existing pull request and head branch, and the launch/last-published head facts. It is held by the parent in a versioned, validated artifact outside the repository. It is not a secret or bearer token, is never put in Objective records, Branch Memory, repository configuration, or a registry, and expires when the invocation ends and its scratch artifacts are removed. Successful publications may return chained head facts for the same invocation; they do not create a durable grant.

The parent must re-check the complete binding immediately before mutation. Missing attestation, Objective/branch/PR drift, dirty or unverified local state, non-descendant history, or remote-head drift refuses before any external write. Publication never creates a PR, changes branches, submits or reshapes a Graphite stack, force-pushes, merges, lands, deploys, or calls an arbitrary write API.

### Required ordering

For each publishable step, ordering is fixed:

1. `runner-finish` verifies the slice, creates the local Runner commit, and returns the Runner Checkpoint.
2. The parent reads runner-attested facts and judges whether to keep, continue, recover, stop, or record Objective impact.
3. The parent records and commits any material Objective tracking.
4. The parent supplies a typed cumulative publication summary derived from runner-attested commit facts plus parent judgment.
5. A separate parent-invoked publisher revalidates the bound target, pushes exactly the bound current branch with normal fast-forward semantics, confirms the existing PR head, and best-effort updates its managed section.

A child report is never publication authority or a trusted publication summary. `runner-finish` does not invoke the publisher, and publication cannot occur inside the one-step harness tool call.

### Cumulative managed section

The parent summary names the Objective slug and intended published head and contains ordered Runner commit evidence, validation outcomes, material Objective tracking commits when present, and every parent decision that would otherwise have required escalation. An empty decision list is explicit. Objective-owned code determines and renders these facts; it does not accept arbitrary PR-body text from the child.

Flow-owned mechanics replace one slug-bound `Objective Runner` marker region idempotently while preserving all non-managed prose and other managed regions. Each successful edit regenerates the complete cumulative section, so a later publication can heal an earlier missed edit. A malformed region or a region owned by another Objective is a pre-mutation refusal, not permission to overwrite it.

### Partial failure

Branch push and PR-body edit are deliberately not atomic:

- push refusal or failure is a publication failure and no PR edit follows;
- push success followed by PR-edit failure is a precise successful-partial outcome;
- that partial outcome advances the invocation's last-published head, does not invalidate the verified local step, does not force the autorun to stop, and never triggers rollback or force-push;
- a later successful edit uses the full cumulative summary to heal the stale section.

## Why

The distinction is temporal and architectural rather than verbal: implementation happens inside a credential-blind, external-write-forbidden step; publication happens only after the runner's local commit and the parent's checkpoint and tracking judgments. Exact invocation facts provide fail-closed authorization without turning Objective prose into schema or inventing persistent permission state.

Keeping Objective eligibility and summary policy separate from Flow-owned Git/GitHub mechanics preserves the capability boundary. Accepting push/edit partial success reflects the real non-atomic system while retaining a safe recovery path through cumulative regeneration.

## Consequences

- Canonical child prompts and the one-step tool continue to prohibit commits and every external write absolutely.
- Autorun is local-only by default. Parent-only publication is an explicit launch mode, unavailable unless both authorization keys and exact existing-PR binding are present.
- Publication credentials and parent-held artifacts never enter the child prompt or process contract.
- Parent digesting distinguishes runner-attested local facts, child-reported claims, parent tracking/judgment, branch-push outcome, and best-effort PR-summary outcome.
- Working bind/publish commands and Flow mutation mechanics are separate implementation work; this ADR does not make an unimplemented command available.
