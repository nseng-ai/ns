# @nseng-ai/pi-ns-gs

Incubating Pi host adapter for [`@nseng-ai/gs`](../../../../extensions/gs/README.md).

It directly discovers `/ns:gs:restack-resolve` and `/ns:gs:autobranch`, loading a fresh ns CLI module for every invocation. Each router captures its exact effective skill before mutation and delegates deterministic work to the matching JSON CLI with `--yes`.

Verified completion returns without an LM turn. Restack hands only a trustworthy conflict stop to `ns-gs-restack-resolve`. Autobranch reports ordinary refusal and hands only known-partial or ambiguous forward-recovery evidence to `ns-gs-autobranch`, preserving all non-option text as user context.

The adapter fails closed for missing or ambiguous skills, malformed or mismatched envelopes, process failure, usage errors, and protocol failures. It never edits conflicts, replays autobranch effects, controls provider mechanics, manages Slots, rolls back, integrates trunk, pushes, or mutates GitHub.
