---
name: handoff-pickup
disable-model-invocation: true
description: "Pick up, choose, or list handoff artifacts, present a handoff summary, and wait for user direction. Use when the user says pick up handoff, resume handoff, continue from handoff, choose a handoff, or list handoffs."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(ns handoff *)"
  - "Bash(brmem *)"
---

# handoff-pickup

Pick up, choose, or list Markdown handoff artifacts, present the selected handoff's summary, and wait for user direction before continuing work. This is the pickup/list/review step in the `handoff` skill family; load the `handoff` umbrella for shared terminology, lifecycle, storage contract, diagnostics, cleanup, and admin flows. Treat resume-from wording as pickup intent, not a separate lifecycle action.

## Storage contract

- Namespace: `handoff`
- Entry key shape: flat `<semantic-slug>.md`; do not accept `/`-containing selectors in the normal handoff UX

The semantic slug is the chooser metadata. Do not expect a separate index, summary entry, or machine-readable manifest.

## Choose the branch scope

For current-branch pickup or list:

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise use the current branch:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD and the user did not provide a branch. If the user asks to discover handoffs across branches, use all-branch listing instead.

## List handoffs

Current branch:

```bash
ns handoff list --format json
```

Explicit branch:

```bash
ns handoff list --branch <branch> --format json
```

All active local branches:

```bash
ns handoff list --all --format json
```

All branch states, including deleted local branches:

```bash
ns handoff list --all --include-deleted --format json
```

Use `--include-deleted` for recovery, cleanup, or when the user explicitly asks for deleted or stale branch handoffs.

- The JSON payload's `data.handoffs` list contains handoff records with `branch`, `branchState`, `slug`, `key`, `entryLocator`, and `updatedAt`; `data.includeDeleted` records whether deleted local branches were included.
- Show normal results as handoff choices grouped by branch when listing across branches, including branch state.
- Call out `deleted` branches when relevant because those handoffs may be cleanup candidates.
- For each choice, show the slug, recency or a short continuation focus/preview when available, and a copyable pickup command such as `/ns:handoff:pickup <slug>` or `/ns:handoff:pickup --branch <branch> <slug>` when speaking to a Pi user.
- Avoid exposing raw storage keys unless the user needs technical recovery detail.

If no handoffs exist, report that none were found, naming the scope searched, in handoff vocabulary.

For delete or cleanup, load the `handoff` umbrella.

## Select the handoff

Prefer selection by explicit identity before inference:

1. If the user provides an exact key like `foo.md`, pick it up.
2. If the user provides a slug like `foo`, normalize it to `foo.md` and pick it up when present.
3. If exactly one handoff exists in the selected branch scope, pick it up.
4. If the user provided search words, match them against the semantic slug:
   - split the slug on `-`, `_`, and `.`
   - ignore the `.md` suffix
   - prefer slugs containing all requested terms
   - if exactly one candidate clearly matches, pick it up
5. If several candidates remain plausible, ask the user to choose. Print branch and candidate slugs; do not require the user to know storage keys.

## Read and present summary

Read the selected artifact through the portable command face:

```bash
ns handoff pickup <semantic-slug> --branch <branch> --format json
```

Use the JSON envelope's `data.content` as active context for summarization, with `data.branch`, `data.slug`, `data.key`, `data.entryLocator`, and `data.summary` as technical evidence. Present a concise handoff summary, then stop and wait for the user's explicit instruction before running commands, editing files, or continuing implementation. Use raw `brmem get <semantic-slug>.md --namespace handoff --branch <branch>` only for storage diagnostics/recovery.

Report in handoff vocabulary first:

- Branch
- Handoff slug picked up
- Continuation focus or current state, if the artifact identifies one
- Proposed immediate next step(s) from the artifact, phrased as proposed work rather than work you will now take
- Risks, stale assumptions, missing context, or verification needed before continuing

Include a compact technical locator when useful:

- Namespace: `handoff`
- Entry: `<semantic-slug>.md`

End with a short handoff-control question such as: `How would you like me to proceed?`

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work, call that out in the summary when evident from the artifact or already-known context. Do not automatically inspect, verify, or mutate the repository after pickup unless the user asks. If verification is needed, list it as a recommended next step and wait.

For copy, move, delete, garbage collection, or other administrative repair flows, load the `handoff` umbrella's diagnostics/admin reference instead of improvising broad Branch Memory operations.
