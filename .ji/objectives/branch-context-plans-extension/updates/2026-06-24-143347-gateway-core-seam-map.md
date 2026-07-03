# Gateway Core Seam Map

## Summary

Recorded the branch-context/plans command-face, Peer API, and core boundaries in package context docs and completed the gateway-injected core roadmap slice.

Saved-plan selection already had sufficient internal core seams: `extractSavedPlanFileEvidenceFromSessionEntry`, `validateSessionSavedPlanCandidate`, and `findLatestSessionSavedPlanFile` operate over unknown session entries, resolved `PlanStoreDirectoryEvidence`, and filesystem/path validation, while plan-store identity helpers accept injectable `PlanStoreOptions.git`. `resolveSelectedSavedPlanFile` remains a command-face/edge convenience because it accepts `CommandExecApi` to resolve explicit/session/latest plan sources and construct real adapters only when an injected gateway is not supplied.

Branch-context creation now has an explicit resolved-source core, `createBranchContextFromResolvedSource`, over injected Git, Branch Memory, and Graphite gateways plus a resolved plan source. The existing `createBranchContextFromFile` surface remains an adapter that resolves the plan source and delegates to that core. Existing formatting helpers remain presentation helpers, not core workflow logic.

## Objective Impact

- Completed the roadmap row for extracting or identifying gateway-injected cores for saved-plan selection and branch-context attachment workflows.
- Kept `@sdl/branch-context/api` and `@sdl/plans/api` public Peer API surfaces unchanged.
- Preserved saved-plan storage layout, slug and filename behavior, Branch Memory namespace/key behavior, branch naming, attached-plan source resolution, and user-visible command semantics.
- Added `ts/packages/plans/CONTEXT.md` and `ts/packages/branch-context/CONTEXT.md` to define Saved Plan, Local Plan Store, Saved-Plan Selection, Plans Command Face/Peer API/Core, Branch Context, Attached Plan, Branch Context Creation/Attach, Branch Context Command Face/Peer API/Core.
- Updated `CONTEXT-MAP.md` to list the new contexts and record the `@sdl/plans`, `@sdl/branch-context`, and sibling Peer API relationships.

## Follow-Ups

- Migrate Pi branch-context/enriched-plan adapters to the curated seams where they need in-process capability behavior.
- Retire obsolete broad/deep sibling imports and record the final boundary after Pi/remaining consumers are migrated.
- Consider whether any currently internal cores should later be exported through `@sdl/branch-context/api` or `@sdl/plans/api`; this slice deliberately kept Peer APIs unchanged.
