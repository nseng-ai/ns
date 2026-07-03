# ts/packages/hosts -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 8 confirmed finding(s) (2 high, 4 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/hosts/pi

1. **Divergent Change** (high) -- `ts/packages/hosts/pi/src/commands/cli-extension.ts:603-779`
   - Roast: This module changes for at least three unrelated reasons — slash-command-to-CLI bridging, an embedded live-progress rendering engine, and a homegrown JSONL trace logger — so any one of those concerns can ripple edits through a 1000-line file that should only know about command dispatch.
   - Evidence: `class LiveCommandProgress { ... render(): void { ... this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, this.widgetLines(elapsed), ...) } }` (lines 603-779) sits alongside a full diagnostic subsystem `function traceCliCommand(event, fields)` / `isTraceEnabled` / `tracePreview` / `cliCommandTracePath` (lines 901-949), both bolted onto the same file as `runRegisteredCliCommand`'s argument-parsing and dispatch logic.
   - Smallest fix: Extract LiveCommandProgress (status/widget rendering) and the trace-logging helpers into their own modules that cli-extension.ts imports, leaving this file with just command registration and dispatch.

2. **Duplicated Code** (high) -- `ts/packages/hosts/pi/src/skills/expansion.ts:218-225,257-264`
   - Roast: Two 'invoke a skill prompt turn' functions copy-paste the exact same eight-line success/fallback notify block, so the UI-messaging rule now has two places it can quietly drift apart.
   - Evidence: invokeSkillPromptTurn and invokeRepoSkillPromptTurn both contain the identical block: `if (ctx.hasUI === true) { const message = skill === undefined ? fallbackMessage : skillPromptTurnSuccessMessage(options.successMessage, skill); const level = skill === undefined ? "warning" : "info"; ctx.ui.notify(message, level); }` followed by the identical `await host.sendUserMessage(buildPrompt(skill?.block));`
   - Smallest fix: Extract a shared `notifySkillResolution(ctx, skill, fallbackMessage, successMessage)` (or a single `resolveAndDeliverSkillPrompt` helper parameterized by the skill-lookup strategy) and call it from both functions instead of repeating the notify/send logic.

3. **Duplicated Code** (medium) -- `ts/packages/hosts/pi/src/shared/message-delivery.ts:1-12`
   - Roast: The 'how should this message be delivered' concept gets reinvented twice in the same package — once as UserMessageDelivery/AgentMessageDelivery here, once as SessionUserMessageDelivery in sessions/replacement.ts — with no shared source of truth tying the two enumerations together.
   - Evidence: shared/message-delivery.ts declares `UserMessageDelivery = "followUp" | "steer"` and `AgentMessageDelivery = UserMessageDelivery | "nextTurn"` with matching options interfaces, while sessions/replacement.ts independently declares `SessionUserMessageDelivery = "steer" | "followUp" | "nextTurn"` (the same three values, redefined from scratch) and its own SessionUserMessageOptions, which runtime/extension-types.ts then has to alias back together.
   - Smallest fix: Pick one module as the canonical home for the delivery-mode union (e.g. shared/message-delivery.ts) and have sessions/replacement.ts import/extend it instead of re-declaring the same literal union independently.

4. **Primitive Obsession** (low) -- `ts/packages/hosts/pi/src/commands/ack.ts:63`
   - Roast: Notify-level is a real shared concept across this command stack, but every file reinvents its own slightly-different string union for it instead of importing one type.
   - Evidence: `export type CommandProgressNotifyLevel = "info" | "success" | "warning" | "error";` here, vs `type NotifyLevel = "info" | "warning" | "error";` in commands/cli-extension.ts:34, vs the inline `level?: "info" | "warning" | "error"` in command-helpers.ts:13 and pr/extension.ts:85/482 — four separate, slightly inconsistent (one even adds "success") redeclarations of the same domain value.
   - Smallest fix: Define one `NotifyLevel` (and a superset variant if "success" is genuinely needed) in a shared module and import it everywhere instead of re-declaring the union per file.

5. **Speculative Generality** (low) -- `ts/packages/hosts/pi/src/shared/errors.ts:7-9`
   - Roast: diagnosticErrorMessage exists purely to be tested by itself; nothing in the actual codebase ever calls it, so it's a second error-to-string converter nobody asked for.
   - Evidence: `export function diagnosticErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }` has zero production call sites in the repo (only referenced from its own `test/shared-errors.test.ts`), while the sibling `errorMessage` in the same file is the one actually used.
   - Smallest fix: Delete diagnosticErrorMessage (and its test) until a real caller needs a distinct non-Error stringification rule from errorMessage; reintroduce it inline at the point of need if one shows up.

## ts/packages/hosts/sdlcc

1. **Shotgun Surgery** (medium) -- `ts/packages/hosts/sdlcc/src/cmux-report.ts:248-253`
   - Roast: Formatting 'an external command failed' has been hand-rolled separately in cmux-report.ts and stack-map-effects.ts (with subtly different wording), plus inlined again in stack-map-model-loader.ts and objective-tab.ts — change the failure-message contract once and you must hunt down four copies.
   - Evidence: cmux-report.ts:248-253 `commandFailureMessage` returns `${commandName} exited ${result.code}. stdout: ... stderr: ...`; stack-map-effects.ts:233-235 redefines an almost-identical `commandFailureMessage` that says `failed with exit code` instead; stack-map-model-loader.ts:262-266 and objective-tab.ts:46-49 inline the same stdout/stderr-fallback pattern again.
   - Smallest fix: Pull the command-failure formatting into command-runner.ts (or a small shared helper module) as one function and call it from all four sites.

2. **Duplicated Code** (medium) -- `ts/packages/hosts/sdlcc/src/stack-map-effects.ts:215-220`
   - Roast: openNewActivationPlan is a byte-for-byte clone of stack-map.ts's openNewPlan (and a third near-twin, openNewChoice, sits a few lines above it in the same file) — three places that all have to agree on 'spread slot only when defined' for cmux open-new construction.
   - Evidence: stack-map-effects.ts:215-220 `function openNewActivationPlan(branch, slot) { return slot === undefined ? { type: "open-new", branch } : { type: "open-new", branch, slot }; }` duplicates stack-map.ts:308-313 `function openNewPlan(branch, slot) { return slot === undefined ? { type: "open-new", branch } : { type: "open-new", branch, slot }; }`.
   - Smallest fix: Export openNewPlan from stack-map.ts and call it from stack-map-effects.ts (and from openNewChoice's call site) instead of redefining the same conditional-spread shape three times.

3. **Duplicated Code** (medium) -- `ts/packages/hosts/sdlcc/src/stack-map.ts:643-645`
   - Roast: The exact same three-line modulo-wrap function is retyped verbatim in three different files instead of living once in the shared tabs/key-input or tab-module module everyone already imports from.
   - Evidence: `function wrapIndex(index: number, length: number): number { return ((index % length) + length) % length; }` appears identically in stack-map.ts:643, objective-tab.ts:188, and tabs/tab-host-renderer.ts:154.
   - Smallest fix: Move wrapIndex into tabs/key-input.ts (or a small tabs/list-nav.ts) and import it from the three call sites.
