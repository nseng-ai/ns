# Domain Core seam closeout decision

## Summary

Reviewed the remaining Address read primitives and Pi PR feedback watch/fingerprint behavior after the branch-to-PR mapping, `pr-checks`, `download-feedback`, and review-thread mutation core seams landed.

The remaining read primitives are retained as command leaves:

- `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, and `pr-discussion-comments` each perform one injected `GithubPrFeedbackGateway` read and translate the gateway DTO into the stable command payload.
- `pr-review-threads` adds only the command-local `--include-resolved` selection before the same payload translation. The richer unresolved/empty/automation filtering, counts, target resolution, and Markdown assembly already live in `core/download-feedback.ts` and `core/feedback-snapshot.ts`.
- `primitive-results.ts` remains command-schema translation for those read leaves; extracting it into new core wrappers would add indirection without new reusable Address domain behavior.

Pi watch/fingerprint behavior remains Pi presentation/session residue for now. The pure-ish REST fingerprint parsers and deterministic keys are tested, but their only current consumer is `/pr:watch-feedback`; the surrounding model is tied to watch-specific trigger keys, live session state, dirty-tree/idle gating, timers, status rendering, prompt injection, Pi `ExecGateway`/`gh` subprocess policy, and heavy-snapshot fallback. A future extraction should require a concrete Address API consumer or non-Pi command need.

## Objective Impact

This completes the Domain Core seams row. Every candidate area is now either extracted into an Address-owned gateway-injected core seam or explicitly parked with rationale:

- branch-to-PR mapping: `core/branch-pr-mapping.ts`;
- check/status target resolution and payload normalization: `core/pr-checks.ts`;
- feedback snapshot, filtering/counts, target resolution, and Markdown assembly: `core/feedback-snapshot.ts` and `core/download-feedback.ts`;
- review-thread reply/resolve mutation orchestration and payload construction: `core/review-thread-mutations.ts`;
- remaining read primitives: retained command leaves and payload mappers;
- Pi watch/fingerprint: parked as Pi presentation/session residue until a focused consumer-driven Address API follow-up exists.

The final docs/context/parent Objective refresh row remains open and should record the completed boundary in a separate slice.

## Follow-Ups

- Run the final PR Address/Pi/SDL/root context refresh slice.
- If another consumer later needs watch/fingerprint behavior, design a focused `@sdl/address/api` seam instead of importing Pi watch internals or private Address core modules.
