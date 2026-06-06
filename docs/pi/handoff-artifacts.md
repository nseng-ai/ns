# Handoff Artifacts

A handoff is a directed, durable work-context artifact for a specific future continuation. It is written for future-you, a future agent, a future worktree, or a teammate who needs to resume one focused piece of work.

The public model is:

- **Create a handoff** when pausing or transferring focused work.
- **Pick up a handoff** when selecting an existing artifact, including when the user asks to resume from it.
- **List handoffs** when choosing which handoff to pick up.
- **Delete a handoff** when explicitly removing one artifact by exact slug through the Python CLI.
- Continue the recorded work only after pickup has presented a summary and the user asks to proceed.

Branch Memory may store the artifact, but Branch Memory namespaces, keys, refs, and commits are technical locators. They should not be the default user model.

## Vocabulary decisions

Use these terms in normal Pi commands, skills, docs, notifications, and prompts:

| Term                         | Meaning                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Handoff artifact, or handoff | A durable Markdown work-context artifact for a specific continuation.                                      |
| Continuation focus           | The future work the handoff prepares: what should the next session continue, decide, verify, or implement? |
| Create a handoff             | Create the artifact and store it so another session can pick it up.                                        |
| Pick up a handoff            | Select an existing artifact, present its continuation summary, and wait for user direction.                |
| Handoff slug                 | A semantic, user-recognizable selector such as `address-review-feedback`.                                  |
| Technical locator            | Storage details such as branch, namespace, entry key, ref, and commit.                                     |

Avoid these as the default user-facing model:

- "save a handoff"
- "load a handoff"
- "write/read a Branch Memory entry"
- "Branch Memory handoff" except when explaining the current storage implementation
- namespace/key/ref-first instructions in success, picker, or prompt copy
- undirected "session summary" language when the user asked for a handoff

It is fine to show a compact technical locator after a successful create/pickup, on error, or in recovery documentation.

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

| Mechanism               | Trigger                                     | Persistence                                              | Direction                                                     | Use                                                            |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Compaction              | Automatic context pressure or `/compact`    | Pi session internals                                     | Usually preserves enough context for the current conversation | Keep the current session under the model context window.       |
| Generic session summary | Explicit request to summarize what happened | Wherever the user asks to put it                         | Often retrospective and history-shaped                        | Explain or archive the session's history.                      |
| Handoff artifact        | Explicit create/transfer/resume intent      | Durable artifact, currently stored through Branch Memory | Future-continuation focused                                   | Let another session pick up focused work context and continue. |

Compaction is an in-session context-management mechanism. It is not a named durable artifact and should not be treated as the durable resume surface.

A generic session summary can be useful, but it is usually organized around what happened. A handoff is organized around what a future continuation must do next.

## Create flow implications

Requests to write or stash durable handoff context route to the create flow, but normal success copy and glossary language should still say create a handoff.

A create flow should make the continuation focus first-class. If the user says only "create a handoff" without enough focus, ask a cheap clarifying question rather than producing an undirected summary.

Good create copy:

```text
What should the future session continue from this handoff?
```

Good success copy:

```text
Created handoff `address-review-feedback` on branch `feature/review`.
```

Optional technical detail:

```text
Technical locator:
Namespace: handoff
Entry: address-review-feedback.md
```

## Pickup and list flow implications

A pickup flow should let the user choose by slug, picker, or search words without knowing storage keys. Normal pickup copy should say what handoff was picked up and from which branch. After reading the selected artifact, pickup should present a concise summary of the continuation focus, proposed next steps, and verification risks, then wait for the user's next instruction rather than automatically executing the artifact's next step.

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

Python CLI commands:

```text
handoff list [--branch <branch> | --all] [--include-deleted]
handoff delete [--branch <branch>] [-f|--force] <semantic-slug>
handoff gc [--dry-run|-f]
```

There is currently no `/handoff:delete` Pi command. Single-handoff deletion is available through the Python CLI only. `handoff delete` accepts the exact handoff slug without `.md`; `handoff delete alpha.md` is rejected so deletion cannot silently reinterpret storage keys as user-facing slugs.

Examples:

```text
/handoff:create address review feedback after test cleanup
/handoff:pickup address-review-feedback
/handoff:list
/handoff:list --all
```

Portable first-party skills:

- `handoff-create`
- `handoff-pickup`

There are no `handoff-save` or `handoff-load` skill aliases; those names are rejected handoff terminology, not compatibility entrypoints.

`/handoff:create` requires a meaningful continuation focus. If the user omits it, the command asks:

```text
What should the future session continue from this handoff?
```

and does not create the handoff until the user answers.

## Branch Memory boundary

The current storage contract is:

```text
namespace: handoff
key:       <semantic-slug>.md
branch:    <branch carrying the handoff>
```

Low-level `brmem` operations remain valid for debugging, recovery, and non-Pi harnesses that need to implement the storage contract directly. Public create, pick up, and list UX should hide those details until the user needs technical evidence.

Useful recovery commands:

```text
handoff list --branch <branch>
handoff list --all
handoff list --all --format json
handoff list --all --include-deleted
handoff list --all --include-deleted --format json
handoff delete [--branch <branch>] [-f|--force] <semantic-slug>
handoff gc --dry-run
brmem get <semantic-slug>.md --namespace handoff --branch <branch>
```

`handoff delete` removes exactly one handoff from the target branch by exact slug. Pass `--branch <branch>` to remove a handoff from a non-current or locally deleted branch; pass `--force` to skip the confirmation prompt.

`handoff gc` deletes handoffs whose local branch no longer exists. Use `handoff gc --dry-run` to preview candidates and `handoff gc --force` to delete without prompting. Garbage collection deletes handoff entries only; it does not delete git branches, remote branches, Graphite state, or non-handoff Branch Memory entries.

Normal handoff commands read only the `handoff` namespace. Older design notes may mention previous names only as historical context; they are not normal fallback storage.
