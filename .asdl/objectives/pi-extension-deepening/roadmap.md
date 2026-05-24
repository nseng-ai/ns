# Roadmap

## Work

- [x] Establish the replacement Objective identity.
  - Use slug `pi-extension-deepening` because it names the desired outcome rather than the initial triage process.
  - Supersede `pi-extension-architecture-deepening` rather than continuing under the older process-oriented scope.
- [x] Preserve the architecture assessment context.
  - Add `assessment.md` as the durable evidence file for how the candidate list was derived.
  - Include the docs, source files, tests, validation commands, focused subagent exploration, and post-`git pull` Objective-list changes that informed the assessment.
- [x] Close the superseded Objective.
  - Add `## Closure` to `.asdl/objectives/pi-extension-architecture-deepening/objective.md`.
  - Add `.asdl/objectives/pi-extension-architecture-deepening/closed.md` as a Closure Marker.
- [ ] Triage the candidate list in `assessment.md`.
  - For each candidate, choose exactly one disposition: implement, reject with reason, park with rationale, or split into a follow-on Objective.
  - Record meaningful decisions through Objective updates as work proceeds.
- [ ] Decide the Pi host seam candidate.
  - Evaluate whether a shared project-local Pi host Module should own `ExtensionAPI`, command context, UI, message renderer, and fake host shapes.
  - Include `.pi/extensions/land.ts` and `.pi/extensions/submit.ts` import-path drift in the decision.
- [ ] Decide the command execution candidate beyond the current narrow `command-runtime.ts` helpers.
  - Determine whether `/submit`, `land-stack` command streaming, `just-fix`, Objective commands, and Branch Memory commands prove a deeper command execution Module.
  - Preserve the old decision that pure text/result helpers are already shared; do not reopen it unless new evidence warrants it.
- [ ] Decide the Clinkr Machine envelope and Branch Memory CLI candidates.
  - Evaluate whether Objective and Branch Memory JSON envelope parsing should share a Module.
  - Evaluate whether Branch Memory CLI discovery/execution should move out of `create-brmem-plan.ts` and `worktree-status.ts`.
- [ ] Decide the presentation/linkification candidate.
  - Compare `docs/pi/extension-message-linkification.md`, `land-stack/command-stream.ts`, `worktree-status.ts`, `runner-subagent-demo.ts`, and `.pi/extensions/submit.ts`.
  - Resolve OSC 8 URL sanitization, ANSI/OSC stripping, message detail contracts, and renderer helpers.
- [ ] Decide `worktree-status` internal seams.
  - Preserve the small external status Interface.
  - Explore internal Seams for observation/watchers, status gathering, and rendering so tests can cover behavior without real session/UI races.
- [ ] Decide `land-stack` test-surface and internal seam work.
  - Keep `/land-stack` as the external Interface.
  - Improve locality around stack facts, PR facts, worktree conflicts, landing orchestration, command streaming, and presentation only where tests and the deletion test justify it.
- [ ] Decide runner subagent contract cleanup.
  - Preserve the deep runner subagent helper.
  - Resolve naming drift, result presentation duplication, and stale child-session terminology in docs and code.
- [ ] Decide vibecoded extension promotion work.
  - Classify `.pi/extensions/submit.ts`, `.pi/extensions/land.ts`, and `.pi/extensions/just-fix.ts` as promote, retire, keep vibecoded, or split.
  - Consult Graphite/GitHub guidance before changing `/submit` or landing behavior.
- [ ] Implement accepted refactors in coherent slices.
  - Add or update fake-driven tests before or with risky behavior changes.
  - Validate TypeScript changes with `bun run --cwd ts check` and `bun run --cwd ts test`.
  - Run broader repo checks when Python, Objective, docs, or repo-wide behavior changes require it.
- [ ] Close by explicit human decision.
  - Confirm every candidate has a disposition.
  - Confirm accepted refactors and documentation updates are complete enough.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Decide later whether the terms vibecoded extension layer and engineered extension layer belong in `CONTEXT.md` as broader ASDL domain vocabulary.
- [ ] Consider a separate Objective for Pi package publication or install-layout cleanup if extension distribution becomes a real seam.
- [ ] Consider a separate Objective for Python Objective-list architecture only if new Objective-list work appears; the current `master` implementation is already deeply split into list models, render, status, inventory, updates, touches, and branch slices.
