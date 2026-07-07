# Warning Notification Helper Removed

## Summary

The `toWarningNotifications` helper remains intentionally absent from the Flow land public API. Local repo search found no in-repo consumers, and `ts/packages/capabilities/flow/src/land/api.ts` continues not to export it.

Future consumers should use the land-domain `LandingWarning` data model and the current exports from `@nseng-ai/flow/land` instead of depending on a renderer-specific notification mapper.

## Objective Impact

This records contract evidence for the Flow land architecture deepening work: warning data stays in the domain layer, while presentation and notification rendering remain outside the capability API.
