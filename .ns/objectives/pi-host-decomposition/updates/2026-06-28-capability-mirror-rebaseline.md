# Capability Mirror Rebaseline

## Summary

The capability-mirror lane was rebaselined after the Pi-tool package extractions and completed capability child Objectives. The major host-resident mirrors now have explicit statuses for this Objective:

- Handoff: thin Pi shell complete; portable artifact lifecycle is owned by `@sdl/handoff` / `@sdl/handoff/api`, while Pi keeps session launch, tab/self replacement, picker, and prompt presentation.
- Branch Context + Plans: thin Pi shell complete; saved-plan selection and branch-context attachment/load/create behavior are delegated through `@sdl/plans/api` and `@sdl/branch-context/api`, while Pi keeps slash-command parsing, acknowledgement, status messages, and fresh-session launch orchestration.
- Objective: thin Pi shell complete; Objective listing, selection, candidates, and skill-prompt helpers are consumed through `@sdl/objective/api`, while Pi keeps slash-command registration, completions, and skill invocation presentation.
- PR feedback: not a Pi-native tool extraction candidate. Portable PR feedback collection/checks/thread mutations remain owned by `pr-address` / `@sdl/pr-address/api` and are invoked through the `pr-address exec ...` command face today; Pi keeps editor prefill, read-only TUI previews, stack-download assembly, and opt-in live watch/prompt injection as Presentation Host residue.

No broad code movement was made in this rebaseline slice. The main decision is that PR feedback should not become a Pi-stacked tool package; any future reduction of PR feedback domain residue should happen as a focused `pr-address` Capability/API follow-up, not as host-to-tool extraction.

## Objective Impact

This completes the roadmap requirement to record each major capability mirror's status before final host export/context cleanup.

Evidence inspected:

- Handoff files under `ts/packages/hosts/pi/src/handoff/` use `@sdl/handoff/api` for list/read behavior and the portable `sdl handoff create` / handoff-create skill for creation, while `handoff:tab`, `handoff:self`, Claude launch, cmux launch, and session replacement remain Pi presentation/session behavior. Minor final-rebaseline hygiene remains possible because several Pi handoff files still import identity helpers from `@sdl/handoff/identity` even though `@sdl/handoff/api` re-exports them; that is not a decomposition blocker.
- Branch Context files under `ts/packages/hosts/pi/src/branch-context/` delegate saved-plan resolution to `@sdl/plans/api` and branch-context creation/load/evidence/prompt behavior to `@sdl/branch-context/api`; the remaining host code is Pi command parsing, progress/status output, dry-run rendering, and implementation-session launch tail.
- Objective files under `ts/packages/hosts/pi/src/objectives/` consume `@sdl/objective/api` for candidates, list rendering, list argument parsing/completion, picker/selection helpers, and Objective client reads; remaining host code is Pi command registration, completions, and skill prompt invocation.
- PR files under `ts/packages/hosts/pi/src/pr/` already delegate portable download, review-thread, check, and map-branch-PR collection to `pr-address exec ...` and Graphite stack discovery to `sdl slot gt exec ...`. Remaining host code is intentional Pi presentation/session behavior: editor prefill, stack-prompt assembly, modal preview views, check-log summarization UI, live watch state, branch-session event persistence, dirty-tree/idle gating, REST-fingerprint polling optimization, and prompt injection. The direct `gh` calls in `feedback-watch/github.ts` support the live watch fingerprint/check-status loop and should be moved only if `pr-address` grows a reusable watch/fingerprint API.

The mirror-thinning lane can now be treated as status-complete for this Objective. The remaining Objective work is the final `@sdl/pi` export/context/decomposition-guidance rebaseline and then closure readiness assessment.

## Follow-Ups

- Rebaseline `@sdl/pi` exports and context language against the final disposition: Pi-tool packages extracted, runner/terminal neutral surfaces accepted, and capability mirrors status-complete.
- During final host export cleanup, consider repointing Pi handoff identity imports from `@sdl/handoff/identity` to `@sdl/handoff/api` if that can be done mechanically without changing behavior.
- If future work wants to thin PR feedback further, spawn or update a focused `pr-address` Capability/API follow-up. Candidate seams are typed download-result/schema exports, reusable feedback fingerprint/watch helpers, or a portable watch operation; do not create a Pi-tool package for PR feedback.
