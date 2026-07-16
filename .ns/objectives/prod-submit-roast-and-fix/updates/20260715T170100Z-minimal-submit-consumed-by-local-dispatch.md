# Minimal Submit Consumed by Local Dispatch

## Summary

The staged Flow minimal-submit client now has its first narrow in-process consumer: local Vercel dispatch source publication. Dispatch performs read-only structured Graphite impact planning first, owns conditional Tier-3 authorization, and invokes Flow execution with expected source, automatic restack, and `force: false`. Flow retains readiness, restack/recheck, current/downstack submit, thin verification, and conservative mutation evidence.

The consumer does not widen cheap submit: no hooks, checkpoint, metadata prewrite, descriptions, model work, review, autofix, attestation, or `ship` behavior enters the path.

## Objective Impact

This is supporting evidence for the decided cheap-submit semantics, not completion of the Objective. Default `ns flow submit` remains unchanged; `--minimal` is still staged. Default migration, prose ownership transfer, `ns flow ship`, review/autofix integration, intent routing, attestations, and live dogfooding remain open.

No real submit, push, PR mutation, deployment, or dispatch was performed or claimed.

## Follow-Ups

- Keep the curated minimal-submit API narrow while the default migration remains open.
- Move default submit behavior only with the corresponding `ship`/prose ownership work.
- Verify the completed submit/ship lifecycle separately from fake-driven dispatch composition.
