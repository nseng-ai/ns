# Bundle Persistence, Episodes Export, and Read-Only Interrogation Landed; Objective Closed

## Summary

The final four roadmap capabilities landed on `master` in the `d4d442d6c` stack ("[cp] Persist frozen context bundles and add read-only interrogation"), with refinement in `6fb441ea5` (manifest-centred bundle shape, batch segmentation outcome, ready/degraded chat availability), hardening in `1fc88e968` (empty-context bundles, interrogation close races), and structural refactors in `40793fbdb`, `5fb0e06b6`, and `80a4bb20c`:

- **Bundle persistence** — `bundle.ts` / `bundle-store.ts` freeze the provider-visible context into immutable `context-profiles/<sessionId>/<ordinal>/` bundles (`manifest.json`, `messages.jsonl`, `system-prompt.md`), with manifest-summary reuse detection and session-context reconstruction on reload.
- **Episodes export** — the segmentation/analysis batch runs to completion independent of overlay close/refresh and writes terminal `episodes.json` once per committed bundle.
- **Interrogation core** — `interrogation-session.ts` / `interrogation-controller.ts` / `interrogation-prompt.ts` / `interrogation-transcript.ts` spawn a read-only embedded agent session scoped to a persisted bundle, with bundle-contract prompting and ready/degraded availability.
- **Interrogation UI** — `p` from overview/episode scopes opens an overlay chat frame; `interrogation-render.ts` renders the transcript; bundle status chrome and degraded messaging live in `render.ts`/`view.ts`.

This work landed with an `objective.md` edit (a `## Roadmap` section and widened Completion Criteria) but without `roadmap.md` rows or a Semantic Update; this update backfills the tracking. The interim `## Roadmap` section in `objective.md` moved into `roadmap.md` rows and Scope capability entries 5–7.

## Objective Impact

- All roadmap Work rows are now `[x]` with evidence; nothing is parked.
- Scope's LM policy gained a clarification: the fixed-cheap-model rule covers segmentation/analysis; the interrogation chat is user-initiated per question and uses the host session's selected model, degrading visibly when none is selected. A matching accepted risk (interrogation token spend) was added.
- Completion Criteria are satisfied, so the Closure Gate closed the objective in this update: `## Closure` records the outcome and `closed.md` now exists. Verification: full pi-extensions Vitest suite passed (`pnpm --dir ts/packages/pi-extensions run test`).

## Follow-Ups

- Analysis-model user-configurability stays an open question, deferred; any future work belongs to a new objective.
- The advisory/actionable layer (e.g., flagging rot episodes as compaction candidates) remains an explicit non-goal here and a candidate future objective.
