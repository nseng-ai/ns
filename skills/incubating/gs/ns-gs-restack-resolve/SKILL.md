---
name: ns-gs-restack-resolve
disable-model-invocation: true
description: "Drive the local `ns gs restack-resolve` conflict-resolution workflow."
---

# ns-gs-restack-resolve

Drive the local gh-stack restack-resolve workflow from the current worktree.
Use **full inter-branch scope** by default; use **downstack inter-branch scope**
only when the user explicitly asks for ancestors/current scope.

This skill is the parent-session **driver**: it owns the initial CLI run, scope
narration, sequential subagent dispatch, interpretation of structured CLI and
repository evidence, final checks, and user-facing escalation. All resolution
policy for each conflict stop belongs to the **engine**,
`code-resolve-merge-conflicts` at
`skills/incubating/code/code-resolve-merge-conflicts/SKILL.md`, configured only
through the driver parameters in **Conflict subagent prompt**. The engine's safe
categories, verification gate, edit and staging rules, escalation payload, and
abort policy apply as written there.

## Scope

- Generic or ambiguous restack intent means `RESTACK_SCOPE=full`.
- Explicit ancestors/current-only intent means `RESTACK_SCOPE=downstack`.
- "Full" is the provider's full **local inter-branch** operation from the
  current branch; "downstack" is its narrower local inter-branch operation.
  Neither fetches, updates, or integrates trunk, and neither pushes or
  reconciles GitHub state.
- Scope is selected once, before any mutation, and carried as narration for the
  rest of the run. After an interruption, keep the originally selected scope.

## Mutation whitelist

The only mutations this workflow performs, all inside a conflict subagent:

1. Stage an engine-accepted resolution.
2. Run the continuation command, `ns gs restack-resolve --yes --format json`,
   at most once per conflict stop.

Everything else — abort, raw `git rebase --continue`, provider-private
operations, Graphite, Slot release, a second start command — is outside the
workflow. When evidence is malformed, contradictory, ambiguous, or positively
identifies a conflict outside the selected scope, the correct move is to stop
and report; scope is never reconstructed by topology inspection.

The audit invariant:

> one conflict stop = one engine run = one CLI continuation = one fresh
> same-worktree subagent

If a child's one continuation reaches another conflict stop, that new stop
belongs to a fresh child launched by the parent.

## Workflow

### 1. Select and state scope

Set `RESTACK_SCOPE`. Tell the user the selected scope is local inter-branch
only and leaves trunk, pushes, and GitHub state untouched.

### 2. Run the initial fast path

In the parent session, run exactly one structured command:

```bash
ns gs restack-resolve --yes --format json
# or, only for explicit downstack intent:
ns gs restack-resolve --downstack --yes --format json
```

Read the structured JSON envelope and branch on its `data`, not exit code
alone:

- `data.outcome=completed` → **Completion**.
- `data.outcome=conflict-stopped` with `data.currentOperation=rebase` and
  nonempty `data.unmergedPaths` → refresh with `git status`, then **Conflict
  loop**.
- `data.outcome=refused` → report the bounded diagnostic and final recovery
  instruction, and stop there.
- Missing, malformed, or contradictory fields → stop as ambiguous, without
  mutation.

Two pre-existing-state branches: a recognized conflict stop can make this first
call a non-mutating refusal with recovery `resolve-conflicts` — once the
envelope and fresh `git status` agree the rebase is stopped at unresolved
paths, enter the conflict loop. A resolved-and-staged interruption may make the
first call the single continuation for that stop; treat its result normally. An
already-active operation is resumed through the conflict loop, not through a
second start command.

### 3. Conflict loop

Every continuation in this loop is `ns gs restack-resolve --yes --format json`
— continuation resumes provider state and never takes `--downstack`. For each
observed conflict stop:

1. In the parent, reconcile the latest structured CLI result with fresh
   `git status`. Require an active rebase and the same unresolved paths; if the
   evidence disagrees or cannot identify one current stop, escalate as
   ambiguous without mutation.
2. Launch exactly one fresh subagent in this same worktree with the prompt
   below, sequentially — one child per stop.
3. When it returns, reread `git status` and the child's structured CLI
   evidence in the parent; the child's prose summary is not authority.
4. Classify the observed result:
   - **advanced:** the child's one continuation reached a later conflict stop;
     launch one fresh child for that stop.
   - **completed:** go to **Completion**.
   - **escalation:** present the engine's escalation payload to the user and
     leave the operation stopped at this stop; the user's decision drives what
     happens next.
   - **bail or ambiguity:** stop and report what is resolved, what remains,
     the original scope, and the exact repository/CLI state, leaving the
     operation stopped.

Carry any `unverified` behavior or pre-existing-failure label forward
unchanged in later prompts and reports until independently verified.

## Conflict subagent prompt

Fill in `RESTACK_SCOPE` from the parent-selected original scope.

```text
You are resolving exactly one conflict stop in an ns GS restack that is already
in progress in this same worktree.

Driver parameters (orchestrator-decided):
- Original RESTACK_SCOPE: <full|downstack> local inter-branch scope — narration
  and safety context only; the continuation command does not encode it
- Continue command: ns gs restack-resolve --yes --format json
- Extra bail-out condition: repository/CLI evidence cannot unambiguously show
  this same active rebase conflict stop or the continuation outcome, or it
  positively identifies a conflict outside the original RESTACK_SCOPE
- Post-completion checks: return the complete structured CLI envelope plus
  fresh git status to the parent; the parent owns final checks
- Escalation channel: return-to-parent

Follow skills/incubating/code/code-resolve-merge-conflicts/SKILL.md as the sole
conflict-resolution policy authority with those driver parameters.

Your mutation whitelist:
1. Stage a resolution the engine accepts.
2. Run the continue command at most once, and only when the engine permits
   continuation.
Everything else — abort, skip, raw Git continue, a start command, `gh stack`,
provider-private operations, Graphite, Slot release — is outside your task. If
the continuation reaches a later conflict stop, leave it untouched and report
outcome=advanced. If state is ambiguous, stop without staging, continuing, or
aborting, and report outcome=bail.

Output contract: end with this delimited result block and fill every line:
--- GS CONFLICT SUBAGENT RESULT ---
outcome: advanced | completed | escalation | bail
original_scope: full | downstack
files_resolved: <paths or none>
continuation_ran: yes | no
cli_evidence: <complete structured envelope, or none with reason>
repository_evidence: <fresh git status summary>
engine_report: <per the engine's evidence rules: safe categories used,
verification commands and results, and any behavior or pre-existing-failure
claims with their observed/unverified labels>
summary: <concise summary>

For outcome=escalation, include the engine's complete escalation payload.
--- END GS CONFLICT SUBAGENT RESULT ---
```

## Completion

Reread the completed structured CLI envelope in the parent and run:

```bash
git status
git log --oneline -5
```

Require `data.outcome=completed`, `data.currentOperation=none`, no unmerged
paths, and a clean `git status`. Report the original full/downstack local
inter-branch scope and whether any conflicts were resolved, and remind the
user that completion left trunk, pushes, and GitHub state untouched.

If generated files were accepted during conflict resolution, follow the
engine's regeneration policy before calling the overall workflow done. If final
CLI and repository evidence disagree, stop and report ambiguity.

## Bail-out

Use the engine's bail-out policy plus this driver's ambiguity condition. Leave
the operation stopped and report: resolved files, remaining conflicts, original
scope, the last CLI invocation and structured outcome, and fresh `git status`.
Describe only the stopped or ambiguous state that is observed.
