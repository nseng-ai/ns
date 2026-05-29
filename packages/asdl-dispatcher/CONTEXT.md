# Dispatcher

asdl-dispatcher is the **Tool** that turns a user-supplied **Task** into a remote **Dispatch** through a selected **Dispatch Backend**. The first supported backend is GitHub Actions.

## Language

**Task**:
A freeform, user-supplied unit of work to be handed to remote automation. A Task may involve code changes, investigation, review, or other repository work; it is not limited to coding and does not need a tracker-backed identity.
_Avoid_: Coding Task, Job (collides with GitHub Actions), Issue (collides with tracker items), Objective (belongs to the Objectives context)

**Dispatch**:
One stateless request to run a **Task** remotely through a selected **Dispatch Backend**. A Dispatch is the handoff envelope asdl-dispatcher creates or observes; the Tool keeps no Dispatch history, and the backend's native record is not the Tool's domain noun.
_Avoid_: Run (collides with backend-native run records and implies persisted Tool history), Invocation (belongs to PR Address), Review (belongs to Reviewer), Assignment (collides with Slots)

**Dispatch Backend**:
The remote execution substrate selected for a **Dispatch** by a stable option value. The first supported value is `github-actions`.
_Avoid_: Provider (overloaded with LLM/vendor billing), Executor (too mechanical), Harness (belongs to agent-side execution)

**Target Ref**:
The git ref a **Dispatch** asks the backend to run against, defaulting to the current branch. The Target Ref is handoff context, not part of the Task text; the same Task dispatched against two refs is two Dispatches.
_Avoid_: Branch (too narrow — tags or SHAs may be valid refs), Base Ref (collides with diff/review contexts), Checkout (operation, not identity)

## Relationships

- The asdl-dispatcher **Tool** ships the standalone CLI `dispatcher` and an asdl plugin subgroup; it ships no Public Skill for now.
- A **Task** is the work to be performed; a **Dispatch** is the remote request carrying that Task into a Dispatch Backend.
- An Objective or issue may be a source for Task text, but Dispatcher does not own Objective lifecycle, claiming, reconciliation, or roadmap semantics.
- A Dispatch targets exactly one **Dispatch Backend**; the initial backend option value is `github-actions`.
- The Dispatcher Tool keeps no Dispatch history, run registry, replay log, or result model; any backend-native run record or task-specific output belongs to the backend or task.
- A Dispatch has exactly one **Target Ref**, defaulting to the current branch.
- A Dispatch targets a remote backend rather than a local **Harness**, local **Slot**, or asdl-reviewer **Reviewer**.
- A Target Ref may have been prepared in a Slot, but Dispatcher does not allocate, free, or require Slots.
- A Task may ask remote automation to run Reviewer, but Dispatcher does not own Reviewer, Review, Finding, or Rendering semantics.

## Example dialogue

> **Dev:** "Can I use Dispatcher for an investigation task, or only for code-writing?"
> **Domain expert:** "Use it for a **Task**. The Task may result in code, but the domain concept is broader than coding. The **Dispatch** is just the remote handoff through the selected Dispatch Backend."
>
> **Dev:** "Is a Dispatch the same thing as a GitHub Actions workflow run?"
> **Domain expert:** "No. A **Dispatch** is the Tool-level request to hand off a Task. With the `github-actions` backend, GitHub Actions may create a workflow run to execute it, but that workflow run is the backend's record, not the asdl-dispatcher domain noun. Dispatcher does not keep its own Dispatch history."
>
> **Dev:** "If I send the same Task from two branches, is that one Task with two attempts?"
> **Domain expert:** "No. The Task text may be identical, but each **Dispatch** has its own **Target Ref**. Same Task, different Target Ref, different Dispatch."
>
> **Dev:** "Can Dispatcher send an Objective to GitHub Actions?"
> **Domain expert:** "It can send Task text derived from an Objective, but Dispatcher does not manage Objective lifecycle. Claiming, reconciliation, and roadmap semantics stay in the Objectives context."
>
> **Dev:** "Does Dispatcher need to allocate a Slot before sending the Task?"
> **Domain expert:** "No. A **Slot** may be where the Target Ref was prepared locally, but Slot allocation and Freeing stay in the Slots context. Dispatcher only needs the Target Ref to hand off remotely."
>
> **Dev:** "If the Task says 'run reviewer security', does Dispatcher now understand Reviews?"
> **Domain expert:** "No. That instruction is just Task text to Dispatcher. Reviewer owns Reviewer, Review, Finding, and Rendering semantics."
>
> **Dev:** "Where does the result of a Dispatch live?"
> **Domain expert:** "For now, Dispatcher does not own a result model. Look at the backend or the Task-specific surface: workflow logs, PR comments, branches, artifacts, or whatever the remote automation produced."
>
> **Dev:** "Is there a Dispatcher Skill I should install?"
> **Domain expert:** "Not for now. Dispatcher is a CLI and asdl plugin subgroup. Other Skills may call it later, but the Tool does not currently own a Public Skill workflow."

## Flagged ambiguities

- The package description and CLI help formerly said "Dispatch coding tasks to GitHub Actions." Resolved: user-facing copy now says "Dispatch tasks to remote backends." The domain term is **Task**, not **Coding Task**, and GitHub Actions is the first **Dispatch Backend**, not the permanent boundary of the Tool.
- Backend-native run URLs, run ids, records, and task-specific outputs do not need Dispatcher domain nouns yet. Describe them directly as backend-native or task-specific details.
- No CLI operation names are locked by the ontology yet; **Dispatch** is the domain noun, not necessarily the command token.
