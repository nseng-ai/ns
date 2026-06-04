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
2. The extension creates a semantic handoff slug before saving.
3. The current session saves a directed handoff for the current cwd/current git branch.
4. If the handoff is saved successfully, a new focused cmux tab opens in the current workspace.
5. The tab title is:

```text
handoff: <slug>
```

6. The new tab starts Pi in the same cwd.
7. The new Pi loads the handoff, summarizes what it loaded, then waits for user instruction.

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

### Scope constraints for v1

- Project-local extension in this repo.
- Requires active cmux context.
- Uses current cwd and current git branch only.
- Opens a new tab in the current cmux workspace.
- Does not support cross-repo, cross-branch, or new-worktree handoffs.
- Does not manage the launched tab after opening it.

### Failure behavior

Fail closed with clear recovery guidance.

Do not open the pickup tab unless the handoff was saved successfully.

Failure cases include:

- not running inside cmux
- no current git branch / detached HEAD
- handoff save failure
- selected slug already exists
- cmux tab launch failure
- Pi launch failure

If the slug already exists, v1 aborts and asks the user to rerun with a different focus/slug. It does not overwrite.

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

- The prerequisite directed-handoff work provides a save/load path that can be invoked from a project-local Pi extension without redesigning handoff persistence.
- The active cmux context exposes enough information to open a focused tab in the current workspace and start Pi in the current cwd.
- A semantic slug can be derived before saving, and the save path can fail closed on collisions.

Risks:

- cmux launch or tab-title APIs may be less deterministic than the spec assumes, especially around detecting launch failure versus Pi startup failure.
- Capturing useful current-session context without leaking secrets or storing large/generated output may require tighter handoff-save guidance than the v1 command surface suggests.
- The pickup Pi must reliably load one specific handoff and then wait, rather than accidentally continuing autonomous work or loading the wrong artifact.

## Open Questions

- What exact cmux API or command should the extension use to open a focused tab in the current workspace?
- How should v1 distinguish cmux tab launch failure from Pi launch failure, if cmux only reports the tab creation result?
- What slug-generation rules are sufficient to be semantic, stable, and low-collision for continuation focuses?
