# ASDL Stack Run Pi Extension

Project-local Pi extension for coordinating ASDL Objective implementation stacks. The extension owns the mechanical control plane: stack-plan storage, branch/session start, pointer ledgers, completion handoff storage, and recovery/status diagnostics. The agent still implements the code and updates the Objective.

## Commands

- `/stack-run [--replace] <local-plan-file-or-branch-memory-key>` stores or loads a canonical stack plan, starts or resumes the first incomplete slice branch, writes/validates its pointer ledger, and opens a fresh Pi session with a kickoff prompt.
- `/objective-stack-impl [--replan] [objective-slug]` plans an open Objective stack when no canonical plan exists, or loads the Branch Memory-only plan and starts/resumes the first incomplete slice. In non-UI modes, `objective-slug` is required; interactive mode can select from open `.asdl/objectives/*/` records.
- `/stack-status <local-plan-file-or-branch-memory-key>` shows plan, branch, ledger, handoff, worktree, git, and Graphite diagnostics. With no argument, it tries to infer the plan from the current branch's `stack-runs` ledger.
- `/stack-closeout <tool-call-id>` is an internal follow-up queued by `stack_slice_done`; it stores the agent-drafted completion handoff.

## Objective stack implementation flow

`/objective-stack-impl` is a confirm-then-continue workflow when a plan is missing:

1. Run `/objective-stack-impl <objective-slug>` from the intended plan branch.
2. If `stack-plans/<objective-slug>.md` is absent on that branch, Pi opens a fresh planning session. The prompt includes the Objective, roadmap, Semantic Updates, required stack-plan schema, and the Branch Memory destination.
3. The planning agent collaborates with the user until the final plan is confirmed, then replies with only an `<asdl-stack-plan-confirmation>...</asdl-stack-plan-confirmation>` marker containing the final Markdown plan. The planning agent does not run `brmem put`.
4. The extension detects the marker, validates the plan, presents a controlled confirmation, stores the plan in Branch Memory, and queues `/objective-stack-impl <objective-slug>` as a follow-up on the user's behalf. The follow-up validates and loads the Branch Memory plan, then reuses the normal stack-run orchestration.

`--replan` always starts a fresh planning session even when a plan already exists. The replacement prompt instructs the planning agent to treat the final plan as a total replacement and require explicit user confirmation before emitting the final confirmation marker. The extension still performs the controlled store confirmation before overwriting Branch Memory.

Canonical `/objective-stack-impl` plans live only in Branch Memory namespace `stack-plans`, keyed by `<objective-slug>.md` on the invocation branch. Local plan files are not part of this command's persistence model. Existing plans are parsed and checked against the selected Objective slug before implementation starts; invalid existing plans fail closed so the user can inspect or intentionally replan.

## Plan format

A local plan is Markdown with frontmatter. The Markdown body remains human guidance; the extension only checks that each planned branch string appears literally somewhere in the body.

```markdown
---
schema: asdl.stack-plan.v1
objective: asdl-stack-run-extension
planned_branches:
  - asdl-stack-run-extension/extension-skeleton
  - asdl-stack-run-extension/plan-storage
---

## PR 1 — Extension skeleton

Branch: `asdl-stack-run-extension/extension-skeleton`

## PR 2 — Plan storage

Branch: `asdl-stack-run-extension/plan-storage`
```

Validation rules:

- `schema` must be exactly `asdl.stack-plan.v1`.
- `objective` must be a non-empty slug/key segment with no `/`, `..`, or surrounding whitespace.
- `planned_branches` must be a non-empty array of unique non-empty strings.
- Planned branches must not contain literal `---`.
- Every planned branch must appear literally in the Markdown body.

## Branch Memory layout

Namespaces:

- `stack-plans`: canonical plan Markdown.
- `stack-runs`: branch-local pointer ledgers.
- `session-artifacts`: completion handoffs.

Keys:

- Plan key: `<objective>.md` in `stack-plans` on the plan branch.
- Ledger key: `<objective>/<escaped-branch>.md` in `stack-runs` on the slice branch.
- Handoff key: `handoffs/<objective>-<escaped-branch>.md` in `session-artifacts` on the slice branch.

Branch escaping is `branch.replaceAll("/", "---")`; branch names containing literal `---` are rejected.

## Slice ledger format

Each started slice receives a pointer-only ledger:

```yaml
---
schema: asdl.stack-slice-ledger.v1
plan:
  branch: <plan-branch>
  namespace: stack-plans
  key: <objective>.md
  sha256: <plan-content-hash>
---

This slice was started from the canonical Branch Memory stack plan above.
Completion is inferred from the derived handoff artifact on this branch.
```

The ledger deliberately has no `running`, `complete`, `blocked`, or other lifecycle fields.

## Completion and blockage tools

`stack_slice_done` accepts:

```ts
{
  summary: string;
  validation: string;
  handoff_markdown: string;
  semantic_update_file?: string;
  followups?: string[];
}
```

Use it only after code, tests, Objective update, Graphite commit/amend, and handoff draft are ready. It queues `/stack-closeout <tool-call-id>`, which verifies the current branch ledger and plan hash before storing the handoff under the derived `session-artifacts` key.

`stack_slice_blocked` accepts:

```ts
{
  reason: string;
  attempted: string;
  next_steps?: string;
}
```

Blocked slices stop in v1 and do not write completion handoffs.

## Recovery and status

`/stack-run` resumes by recomputing the first planned branch without a derived completion handoff. If that branch already exists and has a valid ledger matching the canonical plan hash, the extension checks it out and starts a fresh session instead of recreating it. Plan/ledger hash drift fails closed.

`/stack-status` reports:

- plan branch, namespace, key, and hash;
- objective slug;
- ordered planned branches;
- per branch: git branch existence, ledger presence, handoff presence, and completion;
- first incomplete branch;
- warnings for dirty worktree, missing git branch, missing ledger, missing handoff, plan hash drift, invalid ledger, and Graphite parent mismatch/unavailability.

## V1 limitations

- The extension does not implement the slice; it only starts sessions and stores artifacts.
- Markdown task sections are not parsed.
- `stack_slice_done` is trusted for v1; mechanical verification of Objective updates, validation reruns, changed files, and clean worktree remains parked.
- Pending closeout payloads are in memory. If the runtime reloads before `/stack-closeout`, call `stack_slice_done` again.
- Branch rename/restack repair is fail-closed; use `/stack-status` diagnostics and repair manually.
- The extension never submits Graphite PRs.
