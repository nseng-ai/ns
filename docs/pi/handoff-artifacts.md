# Handoff Artifacts

A handoff is a directed, saved, loadable work-context artifact for a specific future continuation. It is written for future-you, a future agent, a future worktree, or a teammate who needs to resume one focused piece of work.

The public model is:

- **Save a handoff** when pausing or transferring focused work.
- **Load a handoff** when resuming from a saved artifact.
- **List handoffs** when choosing what to resume.
- **Resume from a handoff** after it has been loaded.

Branch Memory may store the artifact, but Branch Memory namespaces, keys, refs, and commits are technical locators. They should not be the default user model.

## Vocabulary decisions

Use these terms in normal Pi commands, skills, docs, notifications, and prompts:

| Term                         | Meaning                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Handoff artifact, or handoff | A saved Markdown work-context artifact for a specific continuation.                                        |
| Continuation focus           | The future work the handoff prepares: what should the next session continue, decide, verify, or implement? |
| Save a handoff               | Create the artifact and store it so another session can load it.                                           |
| Load a handoff               | Select and inject a saved artifact as active context.                                                      |
| Handoff slug                 | A semantic, user-recognizable selector such as `address-review-feedback`.                                  |
| Technical locator            | Storage details such as branch, namespace, entry key, ref, and commit.                                     |

Avoid these as the default user-facing model:

- "write/read a Branch Memory entry"
- "Branch Memory handoff" except when explaining the current storage implementation
- namespace/key/ref-first instructions in success, picker, or prompt copy
- undirected "session summary" language when the user asked for a handoff

It is fine to show a compact technical locator after a successful save/load, on error, or in recovery documentation.

## What makes a handoff directed

A handoff is not just what happened. It answers a future-continuation question:

> Given this requested focus, what does the next session need to know to proceed correctly?

Two handoffs from the same conversation may differ if they prepare different future continuations. For example, one handoff might prepare a reviewer to check test failures, while another prepares an implementer to continue a command rename.

A useful handoff normally includes:

- title or slug
- continuation focus
- branch or repository context when relevant
- current state: what is done and not done
- decisions, findings, constraints, and gotchas
- concrete next steps
- useful commands, files, PRs, issues, docs, or technical locators
- staleness warnings when the artifact depends on branch state

## Handoff vs. compaction vs. generic summary

| Mechanism               | Trigger                                     | Persistence                                            | Direction                                                     | Use                                                         |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Compaction              | Automatic context pressure or `/compact`    | Pi session internals                                   | Usually preserves enough context for the current conversation | Keep the current session under the model context window.    |
| Generic session summary | Explicit request to summarize what happened | Wherever the user asks to put it                       | Often retrospective and history-shaped                        | Explain or archive the session's history.                   |
| Handoff artifact        | Explicit save/transfer/resume intent        | Saved artifact, currently stored through Branch Memory | Future-continuation focused                                   | Let another session load focused work context and continue. |

Compaction is an in-session context-management mechanism. It is not a named saved artifact and should not be treated as the durable resume surface.

A generic session summary can be useful, but it is usually organized around what happened. A handoff is organized around what a future continuation must do next.

## Save flow implications

A save flow should make the continuation focus first-class. If the user says only "save a handoff" without enough focus, ask a cheap clarifying question rather than producing an undirected summary.

Good save copy:

```text
What should the future session continue from this handoff?
```

Good success copy:

```text
Saved handoff `address-review-feedback` on branch `feature/review`.
```

Optional technical detail:

```text
Technical locator:
Namespace: handoffs
Entry: address-review-feedback.md
```

## Load and list flow implications

A load flow should let the user choose by slug, picker, or search words without knowing storage keys. Normal load copy should say what handoff was loaded and from which branch.

Good load copy:

```text
Loaded handoff `address-review-feedback` from branch `feature/review`.
```

Current-branch listing should show handoff slugs or titles and enough metadata to choose one. All-branch listing must include a branch column so stale or branch-specific artifacts are understandable.

Recommended list columns:

- branch when listing across branches
- slug or title
- short continuation focus or preview when available
- updated/stored time when available
- optional technical locator only in expanded or diagnostic output

## Current commands and skills

Project-local Pi commands:

```text
/handoff:create <continuation focus>
/handoff:load [--branch <branch>] [semantic-slug|search words]
/handoff:list [--branch <branch> | --all-branches]
```

Examples:

```text
/handoff:create address review feedback after test cleanup
/handoff:load address-review-feedback
/handoff:list
/handoff:list --all-branches
```

Portable first-party skills:

- `handoff-save`
- `handoff-load`

`/handoff:create` requires a meaningful continuation focus. If the user omits it, the command asks:

```text
What should the future session continue from this handoff?
```

and does not save until the user answers.

## Branch Memory boundary

The current storage contract is:

```text
namespace: handoffs
key:       <semantic-slug>.md
branch:    <branch carrying the handoff>
```

Low-level `brmem` operations remain valid for debugging, recovery, and non-Pi harnesses that need to implement the storage contract directly. Public save/load/list UX should hide those details until the user needs technical evidence.

Useful recovery commands:

```text
brmem list --namespace handoffs --branch <branch> --format json
brmem list --namespace handoffs --all-branches --format json
brmem get <semantic-slug>.md --namespace handoffs --branch <branch>
```

There is no backwards compatibility shim, alias, or migration for earlier handoff storage names because there are no users to preserve. Older design notes may mention previous names only as historical context.
