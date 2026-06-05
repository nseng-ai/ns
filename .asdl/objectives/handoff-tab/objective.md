# /handoff-tab

## Thesis

Implement `/handoff-tab` as a project-local Pi/cmux extension command that turns the current work into a directed handoff and immediately opens a new focused cmux tab where Pi picks up that handoff. This Objective is downstream of the current branch's handoff work: it should reuse the directed-handoff foundation rather than re-litigating the storage model.

## Scope

Spec to implement:

```text
/handoff-tab
```

### Goal

`/handoff-tab` creates a directed handoff for the current work and opens a new focused cmux tab running Pi, where Pi begins by picking up that handoff.

### User-facing command

```text
/handoff-tab <continuation focus>
```

If no focus is provided, the command prompts the user for one.

### Core flow

1. User runs `/handoff-tab <focus>` from a Pi session inside cmux.
2. The command handler resolves the current git branch, derives a semantic handoff slug from the focus, checks that `<slug>.md` does not already exist in Branch Memory namespace `handoffs` for that branch, and verifies a cmux caller context is present.
3. The command handler queues a current-session Pi prompt that uses the existing `handoff-save` workflow with the exact branch and slug. The current Pi writes the directed handoff artifact; the command handler does not try to synthesize the artifact body deterministically.
4. After `brmem put` succeeds, the current Pi calls a new deterministic extension tool with the exact branch and slug.
5. The tool verifies the handoff exists before touching cmux. If verification fails, no tab opens.
6. The tool creates a focused terminal surface in the current cmux workspace/pane, renames it to:

```text
handoff: <slug>
```

7. The tool sends a Pi launch command to that surface from the same cwd. The launch prompt is:

```text
/handoff:pickup --branch <branch> <slug>
```

8. The new Pi loads the handoff, summarizes what it loaded, then waits for user instruction.

### Handoff requirements

A successful handoff must include:

- continuation focus
- relevant context/current state
- decisions and findings
- concrete next steps
- useful files/commands/locators

It must redact secrets and avoid storing credentials, tokens, PII, binary data, large logs, or generated build output.

### Original session behavior

After launch, the original Pi session remains open and usable. It shows a concise confirmation including:

- handoff slug
- branch
- new tab title

### Implementation decisions for v1

- Register `/handoff-tab` from the existing project-local handoff extension surface, not as a separate global extension.
- Reuse the existing `handoff-save` skill prompt expansion and Branch Memory contract (`handoffs/<slug>.md`) for artifact content and storage.
- Add a deterministic launch tool, tentatively `handoff_tab_launch`, that is callable by the current Pi after the artifact is saved.
- Derive the slug in the command handler before saving using the same public handoff slug rules: lowercase, punctuation/whitespace to `-`, remove non-alphanumeric except `-`, collapse runs, trim, and keep concise.
- Use existing cmux CLI primitives rather than adding cmux code:
  - `cmux identify --json --id-format both` to capture caller `workspace_id`, `pane_id`, `surface_id`, and `window_id`;
  - `cmux --json new-surface --type terminal --workspace <workspace_id> --pane <pane_id> --window <window_id> --focus true` to create the pickup tab;
  - `cmux rename-tab --workspace <workspace_id> --surface <created-surface-id> --title "handoff: <slug>"` to set the title;
  - `cmux send --workspace <workspace_id> --surface <created-surface-id> -- <pi-launch-command>\\n` to start Pi.
- Build the Pi launch command with the existing cmux `buildPiLaunchCommand` / `getPiLaunchOptions` helpers so provider, model, and thinking level match current cmux dispatch commands.
- Treat successful `cmux send` as “Pi launch requested”; v1 does not supervise whether the new Pi process later exits or whether the pickup turn completes.

### Scope constraints for v1

- Project-local extension in this repo.
- Requires active cmux caller context from `CMUX_WORKSPACE_ID` / `CMUX_SURFACE_ID` and `cmux identify`.
- Uses current cwd and current git branch only.
- Opens a new focused terminal surface/tab in the current cmux workspace/pane.
- Does not support cross-repo, cross-branch, or new-worktree handoffs.
- Does not manage or supervise the launched tab after sending the Pi launch command.

### Failure behavior

Fail closed with clear recovery guidance.

Do not open the pickup tab unless the handoff was saved successfully.

Failure cases include:

- not running inside cmux or `cmux identify` cannot resolve the caller workspace/pane
- no current git branch / detached HEAD
- selected slug already exists before saving
- current Pi does not save the requested handoff
- launch tool cannot verify the handoff after save
- cmux surface creation failure
- cmux tab-title rename failure
- cmux send failure when requesting Pi launch

If the slug already exists, v1 aborts and asks the user to rerun with a different focus/slug. It does not overwrite. If surface creation succeeds but rename or send fails, v1 reports the created surface id/title context as recovery evidence; it does not delete or supervise the tab.

## Non-Goals

- Cross-repo, cross-branch, or new-worktree handoffs.
- Managing or supervising the launched tab after opening it.
- Overwriting existing handoff artifacts on slug collision.
- Replacing the directed handoff storage/design already introduced by the prerequisite branch.
- Turning this Objective into a general cmux session-management system.

## Completion Criteria

- `/handoff-tab finish X` saves a directed handoff for “finish X”.
- A focused cmux tab opens in the same workspace.
- The new tab is titled `handoff: <slug>`.
- Pi starts in the same cwd.
- New Pi loads the handoff, summarizes it, and waits.
- Original session remains open and confirms success with the handoff slug, branch, and new tab title.
- Outside cmux, the command fails clearly without creating a tab.
- Existing handoff slug collisions do not overwrite prior handoffs.

## Assumptions and Risks

Assumptions:

- The prerequisite directed-handoff work provides a save/load path that can be invoked by the current Pi through the existing `handoff-save` skill and `brmem` commands without redesigning handoff persistence.
- The active cmux context exposes enough information to open a focused terminal surface in the current workspace/pane and target it with later rename/send commands.
- A semantic slug can be derived before saving, and the save path can fail closed on collisions.
- Launching the pickup Pi by sending a command to a newly created cmux terminal surface is acceptable for v1; supervising process startup and pickup completion is out of scope.

Risks:

- The two-phase command/tool flow depends on the current Pi following the prompt: save the artifact first, then call the deterministic launch tool with the exact slug and branch. Mitigation: make the launch tool verify the handoff exists before opening a tab.
- Capturing useful current-session context without leaking secrets or storing large/generated output remains a handoff-save prompt-quality risk rather than a deterministic extension concern.
- cmux surface creation can succeed while later rename/send fails, leaving a manually recoverable extra tab. V1 should report the created surface context instead of pretending the whole operation was atomic.
- The pickup Pi must reliably load one specific handoff and then wait. Mitigation: launch with an explicit `/handoff:pickup --branch <branch> <slug>` prompt rather than search terms.

## Open Questions

- Should the deterministic launch tool be exposed as a normal model-visible custom tool name (`handoff_tab_launch`) or hidden behind command-scoped prompt guidance only? The implementation should choose the smallest prompt/tool surface that is testable in Pi extensions.
- Should v1 create a fallback recovery command in the success/failure copy, such as `/handoff:pickup --branch <branch> <slug>`, for manual paste into an already-open cmux tab?
