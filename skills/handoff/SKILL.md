---
name: handoff
description: "Use for explicit handoff capability, reference, diagnostics, cleanup, or Pi command questions: handoff artifact, continuation focus, saved handoff, handoff namespace, /handoff:create, /handoff:pickup, /handoff:list, or handoff gc. For save/pickup/list execution, use handoff-save or handoff-load."
---

# handoff

Shared model for asdl handoffs. A handoff is a directed, saved work-context artifact for a specific future continuation. It is not in-session compaction, not a generic transcript summary, and not a temp-file note.

Use the step skills for execution:

- `handoff-save`: save/create/write/stash a durable handoff.
- `handoff-load`: pick up, choose, resume from, or list saved handoffs.

## Vocabulary

- **Handoff artifact**: Markdown context saved for future-you, a future agent, a future worktree, or a teammate.
- **Continuation focus**: what the next session should continue, decide, verify, or implement.
- **Semantic slug**: the user-facing pickup hint, stored as `<semantic-slug>.md`.
- **Technical locator**: branch plus Branch Memory namespace `handoffs` and key `<semantic-slug>.md`.

Normal copy should say "handoff" first. Mention Branch Memory namespace/key/ref only as storage evidence, diagnostics, or recovery detail.

## Storage contract

- Namespace: `handoffs`
- Key shape: flat `<semantic-slug>.md`
- Content: concise Markdown, UTF-8 text only
- No secrets, credentials, binary data, generated build output, or large logs
- No `/` in normal handoff keys; do not create nested `handoffs/<slug>.md` entries

## User-facing surfaces

Pi slash commands:

- `/handoff:create <continuation focus>` starts the save workflow.
- `/handoff:pickup [--branch <branch>] [slug|search words]` loads a handoff and queues it as active context.
- `/handoff:list [--branch <branch>|--all]` lists handoffs and copyable pickup commands.

CLI surfaces:

- `handoff list [--branch <branch>|--all] [--include-deleted] --format json`
- `handoff gc [--dry-run|-f]`
- `brmem get|check|put ... --namespace handoffs` remains the storage/recovery layer.

## Boundaries

- Do not use the old temp-directory handoff pattern.
- Do not write a handoff when the user only asked for in-session summarization or compaction.
- Do not invent a separate index or manifest; the semantic slug is the chooser metadata.
- If a saved handoff appears stale, verify current repo state before acting.
