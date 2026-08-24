---
name: ns-gs-restack-resolve
disable-model-invocation: true
description: "Drive the local `ns gs restack-resolve` workflow: full inter-branch scope by default or explicit downstack scope, resolving each conflict stop safely and sequentially."
---

# ns-gs-restack-resolve

Drive the local gh-stack restack-resolve workflow from the current worktree.
Use **full inter-branch scope** by default; use **downstack inter-branch scope**
only when the user explicitly asks for ancestors/current scope.

This skill is a parent-session driver. It owns the initial CLI fast path, scope
and recovery narration, sequential subagent dispatch, interpretation of
structured CLI and repository evidence, final checks, and user-facing
escalation. For each individual conflict stop, delegate all resolution policy
to **`code-resolve-merge-conflicts`** at
`skills/incubating/code/code-resolve-merge-conflicts/SKILL.md`, using only the
driver parameters in **Conflict subagent prompt**. Do not restate or improvise
its safe categories, verification gate, edit rules, staging rules, escalation
payload, or abort policy.

## Entry points

- **Pi:** `/ns:gs:restack-resolve` is the preferred command surface and resolves
  this exact skill from Pi's effective inventory.
- **Other harnesses:** invoke this skill directly from the current repository
  state.

## Scope and hard boundaries

- Generic or ambiguous restack intent means `RESTACK_SCOPE=full`.
- Explicit ancestors/current-only intent means `RESTACK_SCOPE=downstack`.
- “Full” means the provider's full **local inter-branch** operation from the
  current branch. “Downstack” means its narrower local inter-branch operation.
- The initial full command is `ns gs restack-resolve --yes`; the initial
  downstack command is `ns gs restack-resolve --downstack --yes`.
- Every continuation is `ns gs restack-resolve --yes`. Never pass `--downstack`
  while a rebase is active. Continuation resumes provider state; it does not
  reconstruct or rediscover the original scope. Keep narrating the originally
  selected scope without claiming the continuation command encodes it.
- This workflow does not fetch, update, or integrate trunk. It does not push or
  reconcile GitHub state.
- Never run raw Git continue, any provider-private operation, Slot release,
  Graphite, automatic abort, or a second start command for an interruption.
- If repository or CLI evidence is malformed, contradictory, ambiguous, or
  positively identifies a conflict outside the originally selected scope, stop
  without staging, continuing, or aborting. Do not invent topology inspection
  to try to reconstruct scope.

The audit invariant is:

> one conflict stop = one engine run = one CLI continuation = one fresh
> same-worktree subagent

A child may invoke the continuation CLI at most once. If that invocation reaches
another conflict stop, the child must leave it untouched; the parent launches a
fresh child for the new stop.

## Workflow

### 1. Select and state scope

Set `RESTACK_SCOPE` before mutation. Tell the user that the selected full or
downstack scope is local inter-branch scope and does not update trunk. Do not
infer a different scope after an interruption.

### 2. Run the initial fast path

In the parent session, run exactly one structured command:

```bash
ns gs restack-resolve --yes --format json
# or, only for explicit downstack intent:
ns gs restack-resolve --downstack --yes --format json
```

Read the complete Clinkr envelope and its structured `data`. Branch on evidence,
not exit code alone:

- `data.outcome=completed`: go to **Completion**.
- `data.outcome=conflict-stopped`, `data.currentOperation=rebase`, and nonempty
  `data.unmergedPaths`: refresh with `git status`, then go to **Conflict loop**.
- `data.outcome=refused`: report the bounded diagnostic and final recovery
  instruction. Do not work around the refusal.
- Missing, malformed, or contradictory fields: stop as ambiguous. Do not stage,
  continue, abort, or retry.

A pre-existing recognized conflict stop can make this first call a non-mutating
refusal with recovery `resolve-conflicts`; after structured evidence and fresh
`git status` agree that the rebase is stopped at unresolved paths, enter the
conflict loop. A resolved-and-staged interruption may make the first call the
single continuation for that stop; treat its result normally. Never rerun the
start command merely because an operation is already active.

### 3. Conflict loop

For each observed conflict stop:

1. In the parent, reconcile the latest structured CLI result with fresh
   `git status`. Require an active rebase and the same unresolved paths. If the
   evidence disagrees or cannot identify one current stop, escalate as
   ambiguous without mutation.
2. Launch exactly one fresh subagent in this same worktree with the prompt
   below. Never launch conflict children in parallel.
3. Await it completely. Then reread `git status` and the child's complete
   structured CLI evidence in the parent. The final prose is not authority.
4. Classify the observed result:
   - **advanced:** the child's one continuation reached a later conflict stop;
     launch one fresh child for that new stop.
   - **completed:** go to **Completion**.
   - **escalation:** return control to the parent conversation and present the
     engine payload to the user. Leave this invocation stopped; do not launch a
     second child for the same stop, stage a decision, continue, or abort.
   - **bail or ambiguity:** stop and report what is resolved, what remains, the
     original scope, and the exact repository/CLI state. Do not abort.

Do not convert an unverified behavior or pre-existing-failure claim into fact or
a validation whitelist. Verify it independently or preserve the `unverified`
label in later prompts and reports.

## Conflict subagent prompt

Fill in `RESTACK_SCOPE` from the parent-selected original scope.

```text
You are resolving exactly one conflict stop in an ns GS restack that is already
in progress in this same worktree.

Orchestrator-decided facts:
- Original RESTACK_SCOPE: <full|downstack> local inter-branch scope
- Continue command: ns gs restack-resolve --yes --format json
- Extra bail-out condition: repository/CLI evidence cannot unambiguously show
  this same active rebase conflict stop or the continuation outcome, or it
  positively identifies a conflict outside the original RESTACK_SCOPE
- Post-completion checks: return the complete structured CLI envelope plus fresh
  git status to the parent; the parent owns final checks
- Escalation channel: return-to-parent

Follow skills/incubating/code/code-resolve-merge-conflicts/SKILL.md as the sole
conflict-resolution policy authority with those driver parameters.

Agent-decided work:
- Inspect git status and identify the current stopped commit and conflicted
  files.
- Apply only resolutions allowed by the engine and run its verification and
  marker-sweep gates.
- Stage only an accepted resolution.
- Invoke `ns gs restack-resolve --yes --format json` if and only if the engine
  permits continuation.
- Capture the complete structured CLI envelope, then inspect git status only
  enough to classify the resulting state.

Hard constraints:
- Do not prompt the user; escalation returns to the parent.
- Do not abort, skip, rerun a start command, or use raw Git continue.
- Do not run `gh stack` directly, provider-private operations, Graphite, or Slot
  release commands.
- Do not resolve a later conflict stop reached by continuation.
- Invoke the continuation command at most once.
- If state is ambiguous, do not stage, continue, or abort.
- The original scope is narration and safety context. Do not claim the
  continuation command reconstructs it.

Output contract: end with this delimited result block and fill every line:
--- GS CONFLICT SUBAGENT RESULT ---
outcome: advanced | completed | escalation | bail
original_scope: full | downstack
files_resolved: <paths or none>
safe_categories_used: <engine categories or none>
verification: <commands and pass/fail results>
continuation_ran: yes | no
cli_evidence: <complete structured envelope, or none with reason>
repository_evidence: <fresh git status summary>
traceability_check: <base|incoming|intent-diff|mechanical-propagation|mixed; note "no novel logic" or describe novel logic>
behavior_evidence: <not_applicable | observed: command + concise output | unverified: reason>
preexisting_failure_evidence: <not_applicable | observed: base SHA + command + concise output | unverified: reason>
summary: <concise summary>

For outcome=escalation, also include the engine's complete escalation payload:
affected file, both sides, intent-diff, proposed resolution and reasoning, why
it is outside the safe set, and current repository state.
--- END GS CONFLICT SUBAGENT RESULT ---
```

## Completion

The parent must reread the completed structured CLI envelope and run:

```bash
git status
git log --oneline -5
```

Require `data.outcome=completed`, `data.currentOperation=none`, no unmerged
paths, and a clean `git status`. Report the original full/downstack local
inter-branch scope and whether any conflicts were resolved. Explicitly remind
the user that completion did not fetch or integrate trunk and did not push or
reconcile GitHub state.

If generated files were accepted during conflict resolution, follow the
engine's regeneration policy before calling the overall workflow done. If final
CLI and repository evidence disagree, stop and report ambiguity rather than
retrying or aborting.

## Bail-out

Use the engine's bail-out policy plus this driver's ambiguity condition. Leave
the operation stopped. Report resolved files, remaining conflicts, original
scope, the last CLI invocation and structured outcome, and fresh `git status`.
Never offer completed/full-restack language when only a stopped or ambiguous
state is observed.
