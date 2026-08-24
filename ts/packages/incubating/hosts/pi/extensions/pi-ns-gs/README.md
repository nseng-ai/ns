# @nseng-ai/pi-ns-gs

Incubating Pi host adapter for [`@nseng-ai/gs`](../../../../extensions/gs/README.md).

It directly discovers `/ns:gs:restack-resolve`, loads a fresh ns CLI module for every invocation,
and delegates deterministic local mutation to `ns gs restack-resolve --format json --yes`. Completion
returns without an LM turn. A trustworthy conflict stop invokes exactly the effective
`ns-gs-restack-resolve` skill captured before mutation, with structured CLI evidence and the user's
resolver context.

The adapter fails closed for missing or ambiguous skills, malformed or mismatched envelopes, process
failure, usage errors, refusals, and protocol failures. It never edits conflicts, loops, controls
provider mechanics, manages Slots, aborts, integrates trunk, pushes, or mutates GitHub.
