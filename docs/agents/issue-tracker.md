# Issue Tracker

How agents resolve the issue-tracker references and operations that vendored
skills delegate to this document.

## Repo tracker

Real work-tracking issues live on GitHub. Issue references found in commit
messages (`#123`, `Closes #45`) resolve against this repo's GitHub issues via
`gh issue view <n>` (load the `code-gh` skill for anything beyond a simple
view).

## Wayfinding operations

The `wayfinder` skill delegates all physical tracker representation to this
section. This repo uses a **single-document tracker**: a wayfinder map and all
of its tickets live in one committed markdown file — one artifact per effort,
multiple items within it. There is no map issue, no child issues, no labels,
and no tracker UI.

This is a deliberate divergence from upstream wayfinder's multi-issue bias.
The Objectives-backed way to run wayfinding-shaped work is the Objective
ideation pattern (`objective-create-wayfinding`); choose between the two at
invocation time. This tracker never creates Objectives.

### The map

- One file per effort: `docs/wayfinding/<slug>.md`, committed to the repo.
- The file carries the skill's map sections (`## Destination`, `## Notes`,
  `## Decisions so far`, `## Not yet specified`, `## Out of scope`) plus a
  `## Tickets` section holding every ticket.
- The `wayfinder:map` label is implied by the file's location; no label
  mechanics exist.
- Because tickets live in the map file, the skill's "open tickets are not
  listed on the map" rule is void here: the `## Tickets` section is both the
  store and the query surface.

### Tickets

Each ticket is a `###` subsection of `## Tickets`:

```markdown
### <Ticket name>

- type: research | prototype | grilling | task
- status: open | closed
- blocked by: [<Ticket name>](#anchor) (omit when unblocked)

**Question:** <the decision or investigation this ticket resolves>

**Resolution:** <written when the ticket closes>
```

- **Identity / refer-by-name**: the heading text is the ticket's name; link it
  with the heading anchor. There are no issue ids.
- **Blocking**: `blocked by` lines referencing sibling ticket headings — this
  is the "native" dependency relationship.
- **Closing**: set `status: closed`, write the **Resolution** under the
  ticket (this is the resolution comment), and append the one-line gist to
  `## Decisions so far` linking the ticket's anchor.
- **Out-of-scope closes**: set `status: closed`, note why under the ticket,
  and record the gist in `## Out of scope` instead of Decisions so far.

### Frontier query

Read `## Tickets`: the frontier is every ticket with `status: open` whose
`blocked by` entries are all closed (or absent).

### Claiming

No-op. Maps in this tracker are single-writer — one session works a map at a
time — so the skill's claim/assignee steps are skipped. If concurrent sessions
ever need to share a map, add a `claimed by: <who>` line to the ticket; until
then, an open ticket on the frontier is takeable.

### Assets

Assets produced while resolving a ticket (research summaries, prototypes)
live in `docs/wayfinding/<slug>/` next to the map, linked from the ticket's
Resolution — never pasted into the map.
