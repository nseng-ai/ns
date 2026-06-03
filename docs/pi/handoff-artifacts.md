# Handoff Artifacts

A handoff is a directed, saved work-context artifact for a specific future continuation. It is written for future-you, a future agent, a future worktree, or a teammate who needs to resume one focused piece of work.

The public model is:

- **Save a handoff** when pausing or transferring focused work.
- **Pick up a handoff** when resuming from a saved artifact.
- **List handoffs** when choosing what to resume.
- **Resume from a handoff** after it has been picked up.

Branch Memory may store the artifact, but Branch Memory namespaces, keys, refs, and commits are technical locators. They should not be the default user model.

## Vocabulary decisions

Use these terms in normal Pi commands, skills, docs, notifications, and prompts:

| Term                         | Meaning                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Handoff artifact, or handoff | A saved Markdown work-context artifact for a specific continuation.                                        |
| Continuation focus           | The future work the handoff prepares: what should the next session continue, decide, verify, or implement? |
| Save a handoff               | Create the artifact and store it so another session can pick it up.                                        |
| Pick up a handoff            | Select and inject a saved artifact as active context.                                                      |
| Handoff slug                 | A semantic, user-recognizable selector such as `address-review-feedback`.                                  |
| Technical locator            | Storage details such as branch, namespace, entry key, ref, and commit.                                     |

Avoid these as the default user-facing model:

- "write/read a Branch Memory entry"
- "Branch Memory handoff" except when explaining the current storage implementation
- namespace/key/ref-first instructions in success, picker, or prompt copy
- undirected "session summary" language when the user asked for a handoff

It is fine to show a compact technical locator after a successful save/pickup, on error, or in recovery documentation.

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

| Mechanism               | Trigger                                     | Persistence                                            | Direction                                                     | Use                                                            |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Compaction              | Automatic context pressure or `/compact`    | Pi session internals                                   | Usually preserves enough context for the current conversation | Keep the current session under the model context window.       |
| Generic session summary | Explicit request to summarize what happened | Wherever the user asks to put it                       | Often retrospective and history-shaped                        | Explain or archive the session's history.                      |
| Handoff artifact        | Explicit save/transfer/resume intent        | Saved artifact, currently stored through Branch Memory | Future-continuation focused                                   | Let another session pick up focused work context and continue. |

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

## Pickup and list flow implications

A pickup flow should let the user choose by slug, picker, or search words without knowing storage keys. Normal pickup copy should say what handoff was picked up and from which branch.

Good pickup copy:

```text
Picked up handoff `address-review-feedback` from branch `feature/review`.
```

The Python CLI's normal list output should show compact handoff inventory tables with slug and recency:

```text
Handoffs on feature/review

Handoff                  Updated
address-review-feedback  2h ago
```

All-branch listing defaults to active local branches and should keep branch context and local branch state visible while avoiding storage details:

```text
Handoffs across active branches

Branch          State   Handoff                    Updated
feature/review  active  address-review-feedback    2h ago
```

When the user opts into deleted-branch recovery with `handoff list --all --include-deleted`, include deleted local branches and keep their state visible:

```text
Handoffs across branches

Branch          State    Handoff                    Updated
feature/review  active   address-review-feedback    2h ago
feature/docs    deleted  document-handoff-surface   5d ago
```

Pi picker/card UIs may enrich this with previews and copyable pickup commands, but normal list output should not expose storage keys, namespaces, refs, or `brmem` commands. Optional technical locators belong only in expanded/diagnostic output, JSON output for automation, or recovery documentation. `handoff list --format markdown` emits a pipe table; `handoff list --format json` includes exact `updated_at` timestamps, the selected `include_deleted` filter, and `branch_state` values for agents and scripts.

## Current commands and skills

Project-local Pi commands:

```text
/handoff:create <continuation focus>
/handoff:pickup [--branch <branch>] [semantic-slug|search words]
/handoff:list [--branch <branch> | --all]
```

Examples:

```text
/handoff:create address review feedback after test cleanup
/handoff:pickup address-review-feedback
/handoff:list
/handoff:list --all
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

Low-level `brmem` operations remain valid for debugging, recovery, and non-Pi harnesses that need to implement the storage contract directly. Public save/pickup/list UX should hide those details until the user needs technical evidence.

Useful recovery commands:

```text
handoff list --branch <branch>
handoff list --all
handoff list --all --format json
handoff list --all --include-deleted
handoff list --all --include-deleted --format json
handoff gc --dry-run
brmem get <semantic-slug>.md --namespace handoffs --branch <branch>
```

`handoff gc` deletes saved handoffs whose local branch no longer exists. Use `handoff gc --dry-run` to preview candidates and `handoff gc --force` to delete without prompting. Garbage collection deletes handoff entries only; it does not delete git branches, remote branches, Graphite state, or non-handoff Branch Memory entries.

There is no backwards compatibility shim, alias, or migration for earlier handoff storage names because there are no users to preserve. Older design notes may mention previous names only as historical context.
