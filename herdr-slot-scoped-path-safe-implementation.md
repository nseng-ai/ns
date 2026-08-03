# Make Herdr Session Implementation Explicitly Slot-Scoped and Path-Safe

## Goal and outcome

Make `/ns:herdr:impl:session:{space,tab}` clearly disclose that approved implementation runs on a newly created branch in an isolated ns Slot worktree, and reduce the risk that the fresh destination agent follows source-session absolute paths and edits the source/old Slot.

The intended outcome is:

- The source session continues to use a non-interactive `pi --fork <source-session-file> --no-tools --print ...` process only to derive the implementation prompt.
- The destination implementation session remains a **fresh, non-forked** interactive Pi process started with its cwd set to the checked-out destination Slot worktree.
- Before approval, the menu explicitly says that implementation creates a new branch and runs in an isolated Slot, and presents the source checkout as context rather than as the execution checkout.
- After launch, the source session reports the actual destination worktree path returned by Slot checkout.
- The prompt-generation instructions require repository anchors to be repo-relative rather than absolute source-worktree paths.
- At destination startup, Herdr prepends destination-owned execution instructions establishing the destination session cwd as authoritative and requiring source-session paths to be rebased under it.
- This is an **instruction-level guardrail**, not a filesystem sandbox or a hard prohibition on out-of-worktree writes. Do not claim stronger isolation than Pi provides.

## Requirements decisions from grilling

- Keep isolated Slot execution as the default and only direct implementation behavior.
- Use instruction-only protection rather than introducing expected-worktree transport, canonical-path startup verification, a guarded tool layer, or OS-level filesystem isolation.
- Apply path-safety guidance in both places:
  1. the forked source-session prompt generator; and
  2. the destination startup bootstrap.
- Make the source approval UI explicit: rename the implementation action, show source/destination context near the menu, and report the allocated destination worktree after successful launch.
- Do not use `pi --fork` for the destination implementation session.

## Context and discovered facts

### Current process model

`ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-session.ts` has two conceptually separate stages:

1. `generateSessionImplementationPrompt()` starts a tool-less, non-visible process using:

   ```text
   pi --fork <source-session-file> [model/thinking flags] --no-tools --print <request>
   ```

   It runs at the source `CommandContext.cwd` and only derives a self-contained prompt.

2. After explicit approval, the ordinary prompt implementation pipeline creates a collision-resolved branch, stores the prompt in Branch Memory, checks the branch out through a Slot client, creates the Herdr destination at the returned Slot worktree, and launches a fresh Pi process.

`ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/impl-prompt-launch.ts` currently builds the destination command as effectively:

```text
HERDR_IMPL_PROMPT_BRANCH=<branch> exec pi [model/thinking flags]
```

`buildPiLaunchArgs(undefined, ...)` does not add `--fork`. Preserve that behavior.

### Current Slot and destination behavior

`handleHerdrSlotImplPrompt()` in `src/core/impl-prompt.ts` creates the implementation branch relative to the selected current-branch or Local-trunk basis. `implTrackedBranchPrompt()` then calls `launchPreparedBranch()`.

`launchPreparedBranch()` in `@nseng-ai/herdr`:

- calls `slotClient.checkoutBranch({ branchName })`;
- receives a `SlotCheckoutTarget` containing `branchName` and `worktreePath`;
- creates either a Herdr workspace or tab with `cwd: target.worktreePath`;
- runs the fresh Pi command in the created pane;
- returns the checkout target in `result.target.checkout`.

Thus the destination process is already rooted in the new Slot by construction. The confusion and residual risk come from hidden UI semantics and source-session absolute paths, not from intentional destination use of the source cwd.

### Current destination bootstrap

`src/pi/impl-prompt-bootstrap.ts` consumes the one-shot `HERDR_IMPL_PROMPT_BRANCH` marker, acts only on initial `session_start` with reason `startup`, verifies the destination's current branch, loads `ns-impl/prompt.md` from Branch Memory, and sends the stored content as the first user message.

The bootstrap does not fork the source session. It currently injects the stored prompt verbatim and therefore supplies no destination-path guidance.

### Existing safety boundaries

Pi and Herdr are trusted local tooling, not filesystem sandboxes. A model with normal tools can access an absolute path outside its cwd. The planned guardrail must therefore be described honestly as reducing accidental edits caused by copied source paths, not preventing adversarial or arbitrary out-of-worktree writes.

The existing branch check remains useful and should remain intact, but this plan does not add expected-worktree path transport or fail-closed worktree verification because the selected requirement is instruction-only protection.

### Documentation drift

`ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/README.md` and `CONTEXT.md` still describe an older session flow that only prefills an editor and never mutates state. Current code and `docs/herdr/command-catalog.md` instead implement an approval-gated direct implementation path. Reconcile these package docs while documenting the new Slot/path semantics.

## Files, symbols, tests, and docs

### Primary implementation

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-session.ts`
  - `SESSION_PROMPT_ACTIONS`
  - `SYSTEM_PROMPT`
  - session command handler around `appendEntry()` / `selectSessionPromptAction()`
  - `selectSessionPromptAction()`
  - `buildSummaryRequest()`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-prompt-bootstrap.ts`
  - `registerHerdrImplPromptBootstrap()`
  - add a small pure helper for constructing the destination-scoped first user prompt
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/impl-prompt.ts`
  - `implTrackedBranchPrompt()` success notification
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/impl-prompt-launch.ts`
  - preserve the fresh non-forked launch; comments may be sharpened if needed, but do not add `--fork` or path payloads

### Tests

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl-session.test.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl-prompt-bootstrap.test.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl.test.ts`
- `ts/packages/incubating/extensions/herdr/test/prepared-launch.test.ts` only if return/evidence expectations need clarification; the existing tests already prove destination creation receives the Slot worktree

### Documentation and domain language

- `docs/herdr/command-catalog.md`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/README.md`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/CONTEXT.md`
- `ts/packages/incubating/extensions/herdr/CONTEXT.md`
- `ts/packages/incubating/extensions/herdr/AGENTS.md` only if a standing invariant is needed; avoid adding procedural duplication if the implementation/docs fully establish the behavior

## Implementation steps

### 1. Make source-session prompt generation emit checkout-portable anchors

Update the `SYSTEM_PROMPT` in `src/pi/impl-session.ts` without changing the `pi --fork` mechanics.

Add explicit generation requirements along these lines:

- Treat the source checkout and its absolute filesystem paths as context only.
- Express repository file and symbol anchors as paths relative to the repository root.
- Do not direct the destination agent to edit an absolute source-worktree path.
- If an absolute non-repository path is materially necessary, identify it as external context rather than as the implementation checkout.
- State that a fresh destination session will execute from another Slot worktree and must use that destination cwd as authoritative.

Keep the existing requirements for a directed, self-contained prompt, verified facts versus assumptions, validation expectations, and no tool use. Do not place the generated prompt in shell arguments beyond the existing tool-less `--print` request, and do not expose generated content through progress or diagnostics.

Add or update `buildSummaryRequest()` assertions in `herdr-impl-session.test.ts` to prove the request contains the repo-relative/path-rebasing requirements while retaining the supplied or default continuation focus.

### 2. Make the approval UI tell the truth before mutation

Change `SESSION_PROMPT_ACTIONS.implement` from the ambiguous “Implement this prompt now” to explicit wording such as:

```text
Implement on a new branch in an isolated Slot
```

Immediately before presenting the approval menu, present compact source/destination context without including prompt content. The context should state:

- `Source checkout: <pi.cwd>`
- `Execution checkout: new branch in an isolated Slot`
- `Branch basis: selected after approval` (because current implementation does not resolve Current branch versus Local trunk until it enters the approved implementation pipeline)

Use the existing Pi presentation seam in a way that remains visible near the selection and does not require pre-allocating or mutating a Slot. A compact info notification before `ui.select` is acceptable and matches the existing contract that identifiers and compact workflow evidence may appear in the source transcript. If the Pi selection title can cleanly carry multiline context without harming presentation, prefer a focused helper rather than duplicating strings.

Do **not** move branch creation or Slot checkout ahead of approval. Cancellation and menu dismissal must continue to cause no Git, Branch Memory, Slot, or Herdr implementation mutation.

Update tests to verify:

- the action label explicitly names the new branch and isolated Slot;
- source cwd and the not-yet-allocated destination semantics are shown before selection;
- no generated prompt content appears in that context;
- cancel, dismissal, load-editor, unavailable-menu, and generation-failure paths retain their current mutation guarantees;
- direct implementation still receives the prepared prompt only after explicit approval.

### 3. Add a destination-owned execution preamble at bootstrap time

In `src/pi/impl-prompt-bootstrap.ts`, add a small pure helper, preferably exported for focused testing, that combines:

1. a Herdr-owned destination execution preamble derived from runtime facts already available at startup (`ctx.cwd` and the expected branch marker); and
2. the stored implementation prompt.

The preamble should clearly state:

- this is the destination implementation checkout;
- the destination session cwd is `<ctx.cwd>` and is authoritative for repository work;
- the expected implementation branch is `<expectedBranch>`;
- source-session checkout paths and absolute repository paths are context only;
- repository paths in the implementation prompt must be interpreted/rebased relative to the destination repository root/cwd;
- the agent must not edit the source/old Slot merely because an absolute source path appears in inherited context;
- normal repo instructions and validation still apply.

Keep the wording concise enough not to overwhelm the implementation prompt. Frame it as execution context, not as a claim of sandbox enforcement.

After the existing current-branch check and successful Branch Memory load, call `sendUserMessage()` with the preamble plus stored content rather than raw stored content. Preserve all existing one-shot marker consumption, startup-reason filtering, payload-free errors, and no-replay behavior.

Do not:

- add `--fork` to the destination process;
- resume or fork the source session in the destination;
- transport the source session file;
- transport the expected destination path in environment variables;
- add canonical worktree verification or claim fail-closed path enforcement;
- rewrite or overwrite the retained Branch Memory entry solely to add the runtime preamble.

Keeping the preamble runtime-owned ensures replayable stored content remains the generated implementation payload while each destination receives authoritative cwd facts from its own startup context.

Update bootstrap tests to assert:

- the first user message contains destination cwd, expected branch, path-rebasing instructions, and the complete stored prompt;
- prompt ordering clearly puts destination execution context before implementation content;
- ordinary sessions and non-startup reasons remain no-ops;
- wrong/detached/unresolvable branch and Branch Memory failures send no prompt;
- marker consumption and payload-free diagnostics remain unchanged.

### 4. Report the actual destination worktree after launch

In `implTrackedBranchPrompt()`'s successful result notification, add explicit evidence from:

```ts
result.target.checkout.worktreePath
```

Use a clear line such as:

```text
Destination worktree: <path>
```

Retain branch, parent, start point, payload locator, byte count, and conditional Entry Locator evidence. This makes the checkout transition diagnosable after Slot allocation and gives the user a concrete way to distinguish the destination from the source cwd.

Update prompt-space and prompt-tab assertions in `herdr-impl.test.ts` to require the destination worktree line while preserving existing checks that:

- Herdr destination creation uses `WORKTREE` rather than `ROOT`;
- the pane command contains only the branch marker plus Pi model/thinking flags;
- the pane command remains prompt-free and non-forked;
- source prompt text does not leak into shell commands or notifications.

Add an explicit negative assertion that the destination pane command does not contain `--fork` so future refactors cannot accidentally conflate prompt generation with destination execution.

### 5. Reconcile docs and canonical vocabulary

Update `docs/herdr/command-catalog.md` and both Herdr package context files to describe the complete behavior:

- `pi --fork` belongs only to private source-session prompt derivation and runs with tools disabled;
- explicit approval starts implementation on a collision-resolved new branch checked out in an isolated Slot;
- the destination is a fresh Pi session, not a fork/resume of the source conversation;
- Herdr creates the destination with the Slot checkout's worktree path;
- generator and bootstrap instructions rebase repository anchors to the destination checkout;
- the source and destination paths are disclosed before/after launch respectively;
- this is an instruction-level accidental-edit guardrail, not a filesystem sandbox.

Correct stale `README.md` / `CONTEXT.md` claims that session commands only prefill the editor and never mutate. Preserve the distinction between:

- **Herdr implementation workflow** as the user outcome;
- **Prepared Herdr Launch** as destination/process mechanics;
- **Slot checkout target** as the destination worktree evidence;
- source checkout context versus destination execution checkout.

Keep `workspace` limited to upstream Herdr mechanics; user-facing prose should say space, tab, Slot, checkout, and worktree as appropriate.

### 6. Review the complete behavioral flow

Review the final implementation end to end:

1. Source session persists and starts a tool-less `pi --fork` only for prompt generation.
2. Generator emits checkout-portable, repo-relative anchors.
3. Source UI discloses isolated Slot execution before approval.
4. Cancel/edit paths do not enter branch or Slot mutation.
5. Approved flow selects branch basis, creates a branch, stores the payload, and checks it out in a Slot.
6. Herdr creates the destination using the returned Slot worktree.
7. Destination command starts fresh Pi without `--fork`.
8. Bootstrap verifies the expected branch, loads Branch Memory, prepends destination cwd guidance, and injects the first user message once.
9. Source success evidence identifies the destination worktree.

Check that no wording implies that instructions enforce filesystem confinement.

## Execution strategy

This is a semantic workflow change across a small, tightly related set of TypeScript and Markdown files, not a same-shape symbol/API migration. Use precise, reviewed edits at each named seam rather than an opaque text-replacement script or codemod. Keep shared wording behind small helpers/constants where code tests need stable behavior, but do not create a broad abstraction solely to deduplicate documentation prose.

Because the documentation updates are semantic and package-specific, edit each affected section deliberately. Finish with bounded `rg` checks for stale claims such as “never auto-submit or mutate,” ambiguous “Implement this prompt now,” and any documentation implying the destination session is forked.

## Validation guidance

Follow `ts/AGENTS.md`, `ts/packages/incubating/extensions/herdr/AGENTS.md`, and the TypeScript skills during implementation.

Run focused tests while iterating, including the package tests covering:

- `herdr-impl-session.test.ts`
- `herdr-impl-prompt-bootstrap.test.ts`
- `herdr-impl.test.ts`
- `prepared-launch.test.ts` if touched

Then run repository-required validation appropriate to the changed TypeScript architecture:

- `just ts-format-fix` if formatting fails rather than hand-formatting generated output;
- `just ts-lint-fix` for autofixable lint failures;
- `just ts-check`;
- the relevant TS test suite, preferably the full workspace lane per repo policy;
- `just ts-test-typescript-style-guard` because the change touches TypeScript architecture and tests, and this specialized lane is not included by default;
- `just` as the default repository validation entrypoint.

Perform bounded stale-language searches, for example over the two Herdr packages and `docs/herdr`, for:

- `Implement this prompt now`
- `visible model summary turn`
- `never auto-submit or mutate`
- claims that session commands only prefill the editor
- claims that destination implementation uses `--fork`

Manually inspect the final launch-command assertions to ensure `--fork` appears only in source prompt-generation expectations.

## Risks, assumptions, and open questions

### Accepted limitation: no hard filesystem confinement

The chosen implementation is instruction-only. A normally tooled Pi agent can still access an explicitly supplied absolute path outside its cwd. The change reduces accidental source-Slot edits caused by inherited paths but cannot guarantee prevention. Documentation and notifications must not call this a sandbox or fail-closed filesystem boundary.

### Prompt compliance risk

The forked generator may still reproduce an absolute path despite instructions. The destination preamble is intentionally the second line of defense and must tell the implementation agent to rebase such paths. Tests can prove instruction presence and message composition, not model compliance.

### Presentation portability

Pi's selection interface accepts a title and string options, not rich option descriptions. Keep the explicit action self-contained and present source/destination context through a supported nearby UI surface. Do not mutate or allocate a Slot merely to obtain an exact destination path before approval.

### Branch basis timing

Current branch versus Local trunk is selected only after direct implementation approval. Before approval, present that fact honestly rather than pretending the basis is already known. Do not restructure branch-basis selection unless implementation evidence shows the existing interaction seam cannot support truthful presentation.

### Shared bootstrap scope

The prompt bootstrap is shared by tracked-branch prompt implementation, so the destination preamble may protect direct prompt/session flows consistently. Ensure wording is generic to implementation payloads and does not falsely claim every prompt originated from a session. The generator-specific repo-relative instruction belongs only to the session generator.

### No unresolved material requirements

Command names, Branch Memory storage (`ns-impl/prompt.md`), collision behavior, branch-basis policy, fresh destination launch, and compatibility expectations remain unchanged. The change is additive presentation and prompt guidance plus corrected documentation.

## Review and remediation

After implementation and validation, perform a focused review against both specification and repo standards:

- Confirm source and destination process semantics are not conflated.
- Confirm the destination launch remains fresh and non-forked.
- Confirm cancellation and load-editor paths remain mutation-free.
- Confirm no prompt content leaks into shell commands, environment values, progress, or failure diagnostics.
- Confirm destination worktree evidence comes from the actual Slot checkout result, not from source cwd or path guessing.
- Confirm path-safety wording consistently says instruction/guardrail rather than sandbox/enforcement.
- Confirm `README.md`, both relevant `CONTEXT.md` files, and the command catalog agree with implemented behavior.

If review finds a need for guaranteed prevention of out-of-worktree writes, do not silently strengthen wording. Record that as a separate design requiring a real filesystem/tool-enforcement capability; it is outside this plan's selected instruction-only scope.