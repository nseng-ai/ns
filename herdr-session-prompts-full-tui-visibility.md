# Make Herdr session implementation prompts fully visible

## Goal and user-visible outcome

When a user runs `/ns:herdr:impl:session:space [focus]` or `/ns:herdr:impl:session:tab [focus]`, the privately generated implementation prompt must be fully readable in the source Pi transcript before the approval menu appears. Today the custom transcript entry defaults to a six-line preview followed by an “expand to view” marker, so a long prompt can be effectively hidden while the menu asks whether to implement it. After this change, every generated line is rendered by default before the choices to implement, load into the editor, or cancel.

Success means both session commands retain their existing generation and approval sequence, the prompt remains TUI-only and excluded from source-session LLM context, and users no longer need a separate expansion action merely to inspect it. **Load into editor for review/edit** remains the explicit editing path, not the only visibility path.

## Provenance and drift anchor

Planning baseline: branch `master`, commit `29482e2f945f806bcadd7f21285a44b31d678ad2`, 2026-08-03. The SHA is forensic context, not implementation authority. Before editing, compare live code to these current-state excerpts:

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-session.ts` contains `const COLLAPSED_PROMPT_PREVIEW_LINES = 6;`.
- `renderSessionImplPromptEntry(...)` passes the caller-provided `expanded` and `previewLineLimit: COLLAPSED_PROMPT_PREVIEW_LINES` into `createFoldableTextEntryComponent(...)`.
- The shared session command handler calls `appendEntry(SESSION_IMPL_PROMPT_ENTRY_TYPE, ...)` before `selectSessionPromptAction(pi)`.
- `docs/pi/README.md` describes a “prompt-free ... menu”; this currently means the menu labels omit prompt text, but becomes misleading unless that distinction is explicit.

If these excerpts have materially changed, re-evaluate the smallest local design rather than mechanically applying this plan.

## Non-negotiable decisions and constraints

1. Keep `pi.appendEntry()` plus the registered entry renderer. Do not switch to `sendMessage()` or `sendUserMessage()`: those participate in conversation/model context, while custom entries are durable TUI-only state.
2. Preserve ordering: generation succeeds, the full entry is appended/rendered, then checkout semantics and the approval menu are presented. No implementation mutation may move ahead of approval.
3. Full visibility is the default even when Pi invokes the renderer with `{ expanded: false }`. Make this specific prompt entry always produce the expanded body; do not globally alter Pi expansion behavior or the shared foldable renderer.
4. Reuse `createFoldableTextEntryComponent` for display-width safety, ANSI-safe truncation, gutter styling, and stable header/body layout. Call it with `expanded: true` and `previewLineLimit: lines.length`; the latter truthfully declares that all lines are eligible even though expanded mode ignores the limit. Remove the obsolete six-line constant. Do not broaden the shared helper API for this feature.
5. Preserve action semantics: implementation enters the branch/Branch Memory/Slot pipeline; editor loading prefills the matching prompt command; cancel or dismissal performs no implementation mutation.
6. This is a Pi host-presentation change. Do not alter prompt-generation instructions, Branch Memory payloads, branch-basis selection, Slot checkout, Herdr destination launch, or destination bootstrap behavior.

## Scope boundary

In scope:

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-session.ts`, specifically `renderSessionImplPromptEntry` and obsolete preview configuration.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl-session.test.ts`, especially rendering and command privacy assertions.
- Session-prompt presentation prose in the adapter README/CONTEXT, Herdr domain CONTEXT, `docs/herdr/command-catalog.md`, and `docs/pi/README.md`.

Out of scope:

- `@nseng-ai/pi-runtime/terminal/foldable-text-entry`: it already supports complete expanded rendering and is shared by unrelated entries.
- Prompt generation, execution, Branch Memory, Slots, Herdr core gateways, and destination bootstrap: no behavior change is requested.
- Generic/upstream Pi TUI: the project-local adapter can implement the requested behavior.

## Inherited evidence and revalidation

### Stable inherited evidence

Installed Earendil Pi documentation was consulted during planning: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` and `docs/tui.md`, accessed 2026-08-03. It states that `pi.appendEntry()` custom entries do not participate in LLM context and can render in the interactive transcript via `pi.registerEntryRenderer()`. Entry renderers receive `{ expanded }`, and TUI components must obey display-width limits. This supports retaining the custom-entry architecture and existing width-safe helper. Revalidate these off-repo facts if the installed Pi version or types have changed.

The shared helper’s repository tests establish that `expanded: true` renders every body line and that output remains within terminal display width across ANSI and Unicode cases. No shared-helper change is needed.

### Revalidate during implementation

- Confirm `renderSessionImplPromptEntry` remains registered only for `SESSION_IMPL_PROMPT_ENTRY_TYPE` and receives prompt text in entry data.
- Confirm append still precedes selection for both space and tab through their shared handler. Source-order inspection plus the existing command test is sufficient; do not expand the fake harness solely to model TUI paint timing.
- Search live prose for `foldable`, `collapsed`, `preview`, `expand to view`, and `prompt-free` around Herdr session implementation, updating only stale statements.

### Explicitly unresolved

None. The requested behavior is narrow and the current extension API supports it directly.

## Implementation slices

### 1. Make the entry fully visible by default

In `renderSessionImplPromptEntry`, preserve prompt splitting, title, gutter, and theme. Stop destructuring/using the caller’s `expanded` flag and invoke the helper with `expanded: true` and `previewLineLimit: lines.length`. Remove `COLLAPSED_PROMPT_PREVIEW_LINES`. Name the unused renderer-options parameter consistently with repository style rather than retaining dead state.

No independent gate until the regression test changes; verified by the focused package test in slice 2.

### 2. Make regression coverage express the user contract

Replace the existing “folded by default and in full when expanded” test with a test using more than six lines. Assert that `{ expanded: false }` includes the final line and contains neither `more lines` nor `expand to view`; `{ expanded: true }` should remain complete. Preserve or extend assertions for the title, blank separator, accent gutter, and text styling.

Retain command-level evidence that the appended custom entry contains the complete prompt and `sentUserMessages` remains empty. The handler’s source order and this test together are the regression contract; no synthetic event trace is required.

Gate: `pnpm --dir ts --filter @nseng-ai/pi-ns-herdr test`. Expected: the adapter suite passes with default full visibility covered.

### 3. Synchronize presentation documentation

Execution mode: precise semantic edits, not a script or refactor swarm. Although several prose files change, each paragraph has different ownership and wording; read affected sections and edit them individually.

State that the complete generated prompt appears as a TUI-only transcript entry before the action menu while remaining absent from model context. Preserve “prompt-free menu” only if explicitly clarified to mean action labels do not embed prompt text; otherwise use unambiguous “approval menu” language. Keep editor loading framed as review/editing rather than visibility.

No independent gate; verified by formatting and the final stale-language search.

## Validation and expected outcomes

- Focused behavior: `pnpm --dir ts --filter @nseng-ai/pi-ns-herdr test` succeeds.
- Package type safety: `pnpm --dir ts --filter @nseng-ai/pi-ns-herdr check` succeeds.
- Use `just ts-format-fix` or `just dprint-fix` only if the corresponding check reports drift, then rerun validation.
- Final repository baseline: `just` succeeds.
- Final concept-drift check: run bounded `rg` over the Herdr adapter, Herdr contexts, and Herdr/Pi docs for `foldable|collapsed|preview|expand to view|prompt-free`; every remaining match must accurately describe live behavior.
- If an interactive Pi session is available, perform a proportional manual smoke with one session command and a generated prompt longer than the terminal height: verify transcript scrolling exposes the complete entry, the menu remains reachable, then cancel and verify no implementation mutation. Repeat for the tab command only if shared registration has diverged. Lack of an interactive environment is reportable, not a reason to block the automated change.

## STOP conditions

1. Stop and reassess if live Pi no longer makes an appended entry available before a command handler proceeds to `ui.select`; the ordering premise may require a custom approval UI.
2. Stop if manual or existing product evidence shows full rendering prevents the menu from being reachable in supported Pi TUI behavior. Do not silently restore a hidden preview; design an explicit scrollable review UI.
3. Stop if full visibility requires changing shared foldable-renderer semantics for unrelated consumers. Keep behavior local or obtain explicit approval for broader scope.

## Checkpoint and subagent strategy

This is a small, coherent change; use one final commit rather than intermediate `ns flow cp` checkpoints. Subagent orchestration opportunities: none for implementation, because code, tests, and prose form one tightly coupled presentation contract and delegation overhead exceeds isolation value.

## Closeout review

After implementation and focused validation pass, run exactly one in-session TypeScript-style review subagent using `subagent` with `agent: "task"`, a review-only prompt that loads `.agents/skills/typescript-style/SKILL.md` and reviews only the changed diff; do not permit edits. For Pi/OpenAI review-only routing, `routing: "cheap"` may resolve to the review-capable `openai-codex/gpt-5.6-luna:medium`; otherwise inherit rather than reactively reroute. Inspect final status/text, fix only local mechanical low-risk findings, and rerun focused validation after fixes. Do not repeat the style subagent.

Finally compare changed files to the scope boundary, inspect the assertions rather than trusting green output, rerun declared gates, and document deviations.