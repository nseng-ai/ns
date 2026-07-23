# Plan: Make `grill_ask` inactive until an explicit structured-grill workflow

## Goal and outcome

Change the repo-local Pi integration so `grill_ask` is registered in Pi's tool catalog but is not active/model-visible by default. The first explicit structured-grill command in a Pi session activates it, and it remains active for the rest of that session.

The explicit activation entrypoints are:

- `/pi:grill-me`
- `/pi:grill-with-docs`
- `/ns:plan:grill-and-save`

Remove `grill_ask`'s active-only `promptSnippet` and `promptGuidelines`; the structured-grill kickoff prompts remain the source of behavioral instructions. This limits the runtime change to one additive tool-schema activation and avoids changing the system prompt when the tool becomes active. Do not add end-of-grill deactivation: session-long activation is the decided lifecycle and avoids a second non-additive mutation, ownership/reference-counting machinery, and abort cleanup.

## Provenance and drift anchors

- Prepared on branch `master` at commit `2e3ba2973`, 2026-07-23, clean working tree. Branch/commit are forensics only; branch-context attachment determines the implementation branch.
- Drift anchors verified at planning time (recheck before editing):
  - `ts/packages/internal/pi-tools/src/grill/extension.ts` ~lines 108–137: `pi.registerTool({... promptSnippet, promptGuidelines ...})` for `grill_ask`.
  - `ts/packages/hosts/pi/src/kit/grill/surfaces.ts:3`: `export const GRILL_ASK_TOOL_NAME = "grill_ask";` (constants-only module).
  - `ts/packages/capabilities/branch-context/src/pi/enriched-plan-save.ts:210`: `export async function handleWriteGrilledPlanCommand(`.
  - `getActiveTools`/`setActiveTools` appear nowhere in `ts/` yet.

## Context and discovered facts

- `.pi/extensions/grill-ui.ts` is auto-discovered when Pi starts in this trusted repo. It delegates to `@internal/pi-tools/grill/extension`.
- `registerGrillUiExtension` in `ts/packages/internal/pi-tools/src/grill/extension.ts` currently registers the two `/pi:*` commands and unconditionally registers `grill_ask`. Because registered extension tools are active by default, the tool and its prompt metadata are currently present throughout normal repo Pi sessions.
- Installed Pi supports runtime registration and activation through `registerTool`, `getActiveTools`, and `setActiveTools` (all on `pi`). `setActiveTools` immediately changes callable tools and rebuilds the prompt from active tool metadata; unknown names are ignored. There is no public `unregisterTool` API.
- Pi's documented cache behavior distinguishes additive dynamic tool loading from system-prompt changes. Adding a registered tool can use native deferred loading on supported models, while tools with `promptSnippet` or `promptGuidelines` also alter the system prompt and can invalidate the stable prefix. Unsupported models still receive the updated full tool list, so this change is cache-friendlier rather than cache-neutral.
- `registerTool` is legal during extension factory execution, but active-tool actions should be performed after the runtime is bound. Use `session_start` to establish inactive-by-default state rather than calling `setActiveTools` directly during extension factory loading.
- `handleStructuredGrillCommand` in `ts/packages/internal/pi-tools/src/grill/runtime.ts` (~lines 46–68) already waits for idle before dispatching its kickoff prompt. Note: skill expansion can fail and the kickoff is still sent with fallback text (~lines 61–67). **Decision:** activation happens after a non-empty target is resolved and immediately before `pi.sendUserMessage` — including on the skill-expansion fallback path. A cancelled editor or empty target does not activate the tool.
- `/ns:plan:grill-and-save` is a separate consumer in `ts/packages/capabilities/branch-context/src/pi/enriched-plan-save.ts`. It also waits for idle and sends a self-contained prompt that requires `grill_ask`; it must activate the tool before sending that prompt. Its handler receives `BranchContextPiCommandApi` (`Omit<ExtensionAPI, "exec">` built via `Object.create(pi)` delegation in `src/pi/pi-command-api.ts`), not the raw `ExtensionAPI` — new active-tool methods added to the branch-context `ExtensionAPI` flow through this adapter automatically.
- The grill package's local `ExtensionAPI` in `ts/packages/internal/pi-tools/src/grill/protocol.ts` has no `on` method; the existing `session_start` hook for the status widget uses a runtime guard on an `unknown` host (`registerGrillStatusLifecycle` in `status.ts` ~lines 37–41). **Decision:** follow that established guard pattern for the new startup-deactivation lifecycle handler, composing with the existing status lifecycle registration, rather than widening the typed `ExtensionAPI` with `on`.
- The `/pi:*` prompts are already self-contained through `skills/pi-grill-ui/SKILL.md`, `skills/pi-grill-with-docs-ui/SKILL.md`, and fallback/contract text in `ts/packages/internal/pi-tools/src/grill/prompts.ts`. The `/ns:plan:grill-and-save` prompt likewise embeds its structured grilling contract. Removing global prompt metadata therefore does not remove workflow instructions.
- A new, resumed, forked, or reloaded Pi session reconstructs/rebinds extension runtime state and emits `session_start`. The decided semantics are inactive at each such session start, then active for the remainder of that session after an explicit structured-grill command.
- This work did not overlap an active Objective at planning time. Standing orientation still requires fake-driven default tests and keeps real-runtime checks in the integration lane.

## Files, symbols, tests, and docs

### Primary implementation

- `ts/packages/hosts/pi/src/kit/grill/surfaces.ts`
  - Keep the shared command/tool constants.
  - Add a small, host-neutral activation helper or narrow active-tool host contract so both owning consumers use one idempotent implementation that preserves all currently active tools.
- `ts/packages/internal/pi-tools/src/grill/extension.ts`
  - Remove `promptSnippet` and `promptGuidelines` from the `grill_ask` definition.
  - Register a `session_start` lifecycle handler that removes only `GRILL_ASK_TOOL_NAME` from the current active set.
  - Keep tool catalog registration at extension load.
- `ts/packages/internal/pi-tools/src/grill/runtime.ts`
  - Activate `grill_ask` only after a non-empty grill target, immediately before sending the kickoff message (both the skill-expanded and fallback paths).
- `ts/packages/internal/pi-tools/src/grill/protocol.ts`
  - Extend the narrow local host contract with the active-tool capabilities actually used (`getActiveTools`, `setActiveTools`). Lifecycle registration stays on the `unknown`-host guard pattern shared with the status lifecycle.
- `ts/packages/capabilities/branch-context/src/pi/enriched-plan-save.ts`
  - Activate `grill_ask` after `waitForIdle()` and before dispatching the `/ns:plan:grill-and-save` prompt.
- `ts/packages/capabilities/branch-context/src/pi/host-types.ts`
  - Add the narrow active-tool methods required by the command path. If added as required interface members, update **every** fake implementing this interface (see below).

### Tests and fakes

- `ts/packages/internal/pi-tools/test/grill/grill-ui.test.ts`
  - Extend `FakePi` to model registered tools separately from active tools and to capture supported lifecycle handlers.
  - Replace assertions that depend on global `promptSnippet`/`promptGuidelines` with assertions that these fields are absent.
  - Verify `grill_ask` is registered but removed from the active set at `session_start` while unrelated active tools remain.
  - Verify each `/pi:*` command activates `grill_ask` before sending its kickoff prompt (including the skill-expansion fallback path), preserves unrelated active tools, and is idempotent on repeated invocation.
  - Verify an empty/cancelled target does not activate the tool.
- `ts/packages/capabilities/branch-context/test/pi/branch-context-extension-support.ts`
  - Extend the branch-context fake host with active-tool state and `getActiveTools`/`setActiveTools` behavior.
- `ts/packages/capabilities/branch-context/test/integration/pi/branch-context-real-brmem.test.ts`
  - `StdinDroppingPi` (~line 65) also `implements ExtensionAPI` and will fail typecheck if the new methods are required; update it too.
- `ts/packages/capabilities/branch-context/test/pi/enriched-plan-commands.test.ts`
  - Verify `/ns:plan:grill-and-save` activates `grill_ask` before `sendUserMessage`, preserves existing tools, and remains idempotent.
  - Verify `/ns:plan:save` and unrelated branch-context commands do not activate it.
- `ts/packages/hosts/pi/test/integration/node-runtime-imports.test.ts`
  - No expected behavior change; retain its cold-import and full project-extension startup checks as integration validation.

### Documentation

- `docs/pi/README.md` — update the `.pi/extensions/grill-ui.ts` inventory and structured-grill surface description: catalog-registered but inactive until an explicit structured-grill command, then active for that session.
- `docs/pi/branch-context-workflow.md` — clarify that `/ns:plan:grill-and-save` activates the structured tool on invocation rather than depending on global availability.
- `docs/agents/matt-pocock-skills.md` — preserve the melded-surface requirements, but clarify that operational `grill_ask` instructions live in the self-contained kickoff skill/prompt content rather than active-tool global prompt guidelines.

The installed Pi documentation used for this plan is `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`, especially its `registerTool`, `getActiveTools`/`setActiveTools`, and Dynamic Tool Loading sections. The canonical example is `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/dynamic-tools.ts`. These are investigation inputs, not repository files to edit.

## Implementation steps

1. **Define one idempotent activation operation.** In the existing `@nseng-ai/pi/grill/surfaces` export, define a narrow host shape containing `getActiveTools(): string[]` and `setActiveTools(names: string[]): void`, plus an `activateGrillAskTool(host)` helper. It should read the current set at call time, return without mutation if already active, otherwise append `GRILL_ASK_TOOL_NAME` while preserving order and every unrelated tool. If a matching deactivation helper is useful for startup, it must similarly filter only `grill_ask` from the current set; do not save or restore whole snapshots.

2. **Make the grill extension inactive by default after runtime binding.** Keep `pi.registerTool` in `registerGrillUiExtension`, but remove the definition's `promptSnippet` and complete `promptGuidelines` array. Register a `session_start` handler — via the same `unknown`-host runtime-guard pattern used by `registerGrillStatusLifecycle` — that removes only `grill_ask` from the then-current active set. Compose this with the existing status lifecycle registration without duplicating or weakening status widget behavior. The handler must be safe when `grill_ask` is already absent and must preserve all other active tools.

3. **Activate from the two `/pi:*` command paths.** In `handleStructuredGrillCommand`, retain the current order through `waitForIdle`, target resolution, and skill expansion/fallback. After a valid target and just before `pi.sendUserMessage` — on both the expanded and fallback branches — call the shared activation operation. This ensures the first model request for the kickoff sees the tool, while a cancelled editor or empty target leaves it inactive. Extend the local `ExtensionAPI` type with only the required active-tool capabilities.

4. **Activate from `/ns:plan:grill-and-save`.** In `handleWriteGrilledPlanCommand`, call the same shared activation operation after the idle wait and before `sendUserMessage`. The handler's `BranchContextPiCommandApi` adapter delegates to the underlying `pi`, so methods added to the branch-context `ExtensionAPI` are available without adapter changes. Do not activate from `/ns:plan:save`, tool registration, branch-context extension startup, or other planning/branch commands. Do not create an inter-extension event bus or direct dependency on the internal grill package; the shared surface/helper already belongs to `@nseng-ai/pi`.

5. **Adapt fake-driven tests.** Model registered-tool catalog state and active-tool state distinctly. Test event ordering explicitly where useful: `wait` precedes activation, activation precedes `send`. Cover preservation of unrelated tools, repeated activation, startup deactivation, and no activation on cancelled/empty `/pi:*` input. Update both branch-context fakes (`branch-context-extension-support.ts` and integration `StdinDroppingPi`) if the interface members are required. Remove the old expectation that tool-level global guidelines carry the grill contract; retain prompt tests proving the same requirements are present in kickoff content.

6. **Update user/developer documentation.** Document inactive-by-default, explicit command activation, and session-long persistence. State the cache rationale precisely: removing active prompt metadata avoids a system-prompt mutation, while adding a tool schema may still affect provider cache behavior and only supported models receive Pi's native deferred-loading optimization. Do not claim cache neutrality or guaranteed KV-cache preservation.

7. **Run a stale-reference audit.** Search for `grill_ask`, `promptSnippet`, `promptGuidelines`, `getActiveTools`, and `setActiveTools` across the touched package tests/docs. Ensure no documentation still says `grill_ask` is globally active in every repo Pi session and no test still requires the removed global metadata.

## Execution strategy

This is a same-shape change across a small number of semantically distinct TypeScript, test, and documentation files. Per `skills/enriched-plan-save/references/refactor-execution-strategy.md`, use direct inspection and precise edits rather than an ad hoc replacement script or codemod: the changes are lifecycle- and consumer-specific, not a purely syntactic API rename. Keep the shared active-set transformation in one helper, then make explicit call-site edits in the two consumer packages. Finish with bounded grep checks for stale global-availability and prompt-metadata assumptions.

## Checkpoint strategy

Two natural `ns flow cp` checkpoints: (1) after the grill package (helper + extension + runtime + its tests) is green under focused tests; (2) after the branch-context consumer, fakes, and docs are done. Skip intermediate checkpoints if the whole change lands quickly in one coherent pass.

## Validation guidance

Use repository-owned validation and autofix commands (all cited `just` recipes exist):

1. Focused default-lane tests for the internal grill package and branch-context package, using their package test scripts or the equivalent filtered Vitest invocation.
2. `just ts-format-check`; if it fails, run `just ts-format-fix` and recheck.
3. `just ts-lint`; if autofixable, run `just ts-lint-fix` and recheck.
4. `just ts-check`.
5. `just ts-test`.
6. `just ts-test-integration` to retain actual project-extension cold-import/startup coverage.
7. `just ts-test-typescript-style-guard` and any remaining default repo gate required by `just`.
8. `just dprint-check` for changed Markdown; use `just dprint-fix` rather than manual formatter churn if needed.
9. Run final bounded `rg` checks confirming kickoff prompts still contain the complete structured contract and the `grill_ask` tool definition no longer supplies active prompt metadata.

A manual Pi smoke check is useful after automated validation: start a fresh/reloaded session, confirm `grill_ask` is absent from active tools, invoke one structured-grill command, confirm it becomes callable for the kickoff and stays active afterward, then start a new session and confirm it is inactive again. Treat this as runtime evidence, not a substitute for fake-driven tests.

## Inherited evidence and revalidation

**Stable inherited evidence** (verified against `master` @ `2e3ba2973`, 2026-07-23):

- Installed Pi (`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`) exposes `pi.getActiveTools()` / `pi.setActiveTools(names)`; unknown names are ignored; no public `unregisterTool`; dynamic tool loading is cache-friendlier than prompt-metadata changes but not cache-neutral.
- All referenced files, symbols, command constants, test files, doc files, and `just` recipes exist as described.

**Revalidate during implementation:**

- Line-anchored excerpts above (extension.ts `promptSnippet` block, runtime.ts dispatch ordering, `handleWriteGrilledPlanCommand` location, `StdinDroppingPi`) — compare against live code before editing.
- Installed Pi version behavior for `setActiveTools` during `session_start` (confirm no ordering surprises in a manual smoke check).

**Explicitly unresolved:** none material; required-vs-optional interface members is left to the implementer (required + updating both fakes is the recommended default).

## Risks, assumptions, and open questions

- **Decided lifecycle:** activation is one-way within the current Pi session. Do not implement end-of-grill deactivation, ownership tokens, reference counting, or `agent_settled` cleanup.
- **Session boundary semantics:** new/resumed/forked/reloaded extension runtimes start inactive via `session_start`; an unfinished grill restored into a new session does not automatically reactivate the tool. The user must invoke an explicit structured-grill command again. Document this if it is user-visible in practice.
- **Host ordering:** active-tool methods are runtime actions. Do not call them in the extension factory before binding; use `session_start` for initial deactivation and command handlers for activation.
- **Extension load order:** branch-context and grill are separate project extensions. The branch-context command may request activation only after all project extensions have loaded in a normal session. If `grill_ask` was excluded/not registered by host configuration, `setActiveTools` ignores the unknown name; the existing structured-plan prompt's unavailable-tool behavior remains the safety path. Tests should not pretend activation can manufacture an unregistered tool.
- **Cache behavior:** removing `promptSnippet`/`promptGuidelines` avoids an activation-time system-prompt change. It does not guarantee preservation of provider KV caches because the active schema set still changes; native deferred loading is model/provider dependent.
- **Instruction ownership:** behavioral guidance must remain complete in kickoff prompts/skills. Future changes to the grill contract must update those self-contained surfaces and their tests, not reintroduce global tool prompt guidelines.
- **No product compatibility burden:** ns is private and unreleased, but the three existing command workflows must continue to work without a new user step.

### Plan-specific STOP conditions

- STOP if `pi.getActiveTools`/`pi.setActiveTools` are missing from the installed Pi host or behave non-additively (e.g., `setActiveTools` resets other extensions' tools) — the whole design assumes an additive active-set transformation.
- STOP if removing `promptGuidelines` breaks any kickoff path's behavioral contract in tests (indicates a kickoff prompt is not actually self-contained and must be fixed first, not papered over by restoring global metadata).
- STOP if the `session_start` guard pattern cannot compose with the existing status lifecycle without duplicating registration (indicates a structural conflict needing a design decision, not a workaround).

## Subagent orchestration opportunities

None recommended for implementation: the change is a small, tightly coupled lifecycle edit across two packages sharing one helper; splitting it risks contract drift between the helper and its two consumers. Use a single review-only subagent at closeout (below).

## Scope boundary

- **In scope:** the grill/branch-context files, tests, fakes, and docs listed above.
- **Out of scope:** `docs-site/` (deploy-gated), the kickoff prompt/skill content itself (`skills/pi-grill-ui/`, `skills/pi-grill-with-docs-ui/`, `prompts.ts` contract text — it already carries the behavioral contract and must not change semantically), any inter-extension event bus, and any end-of-grill deactivation machinery.

## Review and remediation

Before considering the implementation complete, review the diff along these axes:

- **Availability:** Is `grill_ask` absent from fresh-session active tools but still catalog-registered?
- **Activation coverage:** Do all three explicit structured-grill commands activate it before their first model request (including the `/pi:*` skill-expansion fallback path), and do no unrelated commands activate it?
- **State preservation:** Do activation/deactivation transformations preserve other extensions' current active-tool choices without restoring stale snapshots?
- **Prompt contract:** Are structured options, recommendations, remaining estimate, status/end/freeform behavior, and validation-question policy still present in each self-contained kickoff path after global metadata removal?
- **Lifecycle:** Does every `session_start` establish inactive state without attempting runtime action during extension factory loading?
- **Cache claims:** Do comments/docs avoid promising that dynamic activation cannot invalidate provider caches?
- **Test realism:** Do fakes distinguish registered catalog tools from active model-visible tools and assert ordering/idempotence?

If review finds a consumer that cannot activate through the shared host contract, first add the smallest typed host seam at the owning boundary. Do not solve it with ambient records, hidden globals, package-deep imports, or an inter-extension event protocol unless concrete evidence shows the direct active-tool API cannot satisfy the workflow.

After implementation is complete and focused validation passes, run exactly one in-session `typescript-style` review subagent on the changed diff (review-only; use the review definition's `default_model` if available, e.g. Pi/OpenAI `openai-codex/gpt-5.6-luna:medium`). Inspect its final text/status, remediate only local/mechanical/low-risk findings, rerun focused validation after easy fixes, and report judgment calls instead of guessing. Do not repeat the style review after remediation; the final PR review is the last checkstep. Close out with a trust-nothing pass: rerun the declared gates, compare changed files against the scope boundary, and read the changed test assertions for meaningful coverage rather than trusting green output.
