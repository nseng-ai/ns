# Harness artifacts downstack feedback follow-up

## Summary

After `harness-artifacts-post-review-cleanup` closed and PR #3241 was submitted, unresolved downstack feedback remained on PRs #3222, #3226, and #3229. Top follow-up PR #3243 addressed that feedback without rewriting historical downstack commits, and post-submit `ns address exec` replies/resolutions brought those PRs to zero unresolved review threads.

## Objective Impact

The umbrella closure narrative remains true: the child is still closed, but it now carries a post-submit hygiene update for the downstack review tail. The follow-up is limited to already-owned cleanup themes:

- shared XDG HOME/env merge semantics in `@nseng-ai/foundation/xdg-path`;
- kernel/harness-artifacts consumers using that helper and preserving HOME when no explicit override exists;
- one named raw kernel CLI context input shape;
- a shared `ProvisionFirstPartySkillFailure` matcher consumed by thin adapters;
- restored `optionalEntry` diagnostic normalization.

This does not reopen parked umbrella breadth such as uninstall/staleness, remote acquisition, trust gating, or additional artifact kinds.

## Follow-Ups

- No further action for the #3222/#3226/#3229 downstack review tail; final refresh showed zero unresolved threads.
- Keep any future ambiguous thread open with rationale rather than treating this umbrella update as blanket authority to close it.
