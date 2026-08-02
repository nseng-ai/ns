# ADR 0052: Objective Autorun PR Title Annotation

## Status

Accepted

## Context

Pull requests created for accepted Objective autorun slices benefit from a visible, human-facing attribution to the Objective and accepted slice. That attribution must not become machine state, publication authorization, or another Objective-specific pull-request mutation protocol.

Flow owns generic pull-request submission and initial metadata generation. Its generic `--title-prefix` option can apply one deterministic prefix to every pull request newly created by a submit invocation without teaching Flow about Objectives. Objectives owns the meaning of its slug and accepted autorun ordinal, while the trusted parent owns the boundary between local autorun and a separately authorized submit operation.

The accepted ordinal cannot be recovered safely from branch names, commit prose, stack position, dispatch count, or other ambient evidence. Existing pull requests also must not be retitled merely because they are in a widened metadata-regeneration scope.

## Decision

For a separately authorized submit of an accepted autorun slice, the trusted parent constructs this exact prefix:

```text
[obj:<objective-slug>] [autorun:<accepted-ordinal>]
```

The parent passes the complete prefix to Flow through the generic `ns flow submit --title-prefix <text>` option. It does so only after the autorun step has been accepted and submit has received its own explicit authorization. The selected Objective slug and accepted ordinal must already be explicit, trusted facts. The parent never infers the ordinal from branch names, commit prose, stack position, dispatch count, the number of prior pull requests, or any other heuristic.

One `--title-prefix` value applies uniformly to every pull request newly created in that submit invocation's scope. If different accepted ordinals need different prefixes, they require separate submit scopes. Flow preserves the prefix and may truncate only the generated candidate title to satisfy its title-length contract.

The prefix never applies to a pull request that existed before the submit invocation. This remains true when `--generate-pr-inventory` widens metadata regeneration to existing pull requests: those existing pull requests receive ordinary regenerated titles, not the prefix. Later accepted steps, cumulative runner publication, ordinary resubmission, and metadata regeneration do not add or refresh the prefix on an existing pull request.

Pull-request titles remain human-facing metadata. Neither Objectives nor Flow may parse the prefix as machine state, use it to recover an accepted ordinal, or treat it as policy evidence or authorization.

ADR 0037 publication remains body-only. It neither reads nor edits titles. Portable autorun remains local-only; any later submit or pull-request creation is a separate explicitly requested workflow after portable autorun ends.

## Consequences

- Newly created autorun pull requests have deterministic Objective and accepted-slice attribution without Objective-specific title-generation machinery.
- Flow remains generic: it validates and applies an opaque title prefix but does not interpret Objective records or autorun semantics.
- The trusted parent must retain the accepted ordinal as an explicit fact and must obtain separate submit authorization before constructing and passing the prefix.
- A submit invocation has one prefix for all newly created pull requests in its scope.
- Existing pull requests are never retroactively prefixed, including during complete metadata regeneration.
- Titles are not a durable state store, protocol message, or authorization channel.

## Alternatives

- **Objectives-owned prompt, model operation, or fallback title generator:** rejected; the required annotation is deterministic, and generic Flow prefix composition is sufficient.
- **Inferring the accepted ordinal:** rejected; branch, commit, stack, and dispatch evidence do not authoritatively identify an accepted ordinal.
- **Cumulative publication-time retitling:** rejected; ADR 0037 is body-only, and titles are write-once creation metadata for this policy.
- **Prefixing existing pull requests during regeneration:** rejected; regeneration must not manufacture creation-time Objective attribution.
- **Flow-owned Objective policy:** rejected; Flow should carry an opaque generic prefix, not interpret Objective semantics.
