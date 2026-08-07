---
name: objective-autorun
description: "Drive an Objective through repeated parent-judged implementation steps in either portable Git mode or optional ns-bookended runner mode. Use for \"run this objective\", \"autorun this Objective\", \"run N steps\", or \"implement this Objective as a stack\", including when /ns:objective:autorun injects an explicit selection."
---

# objective-autorun

Drive one Objective forward through repeated, parent-judged implementation steps. The skill is the complete workflow: direct use requires only Git, checkout-local Objective Markdown records, and the harness's implementation capability. The optional `/ns:objective:autorun` command only selects an Objective and injects this skill.

Two modes have deliberately different trust contracts:

- **`ns-bookended`** uses `runner-begin` and `runner-finish`; accepted steps end in **runner-attested Runner Checkpoints** and runner-owned provenance commits.
- **`portable`** uses ordinary Git and parent verification; accepted steps end in **parent-verified ordinary local commits**, never Runner Checkpoints.

Use the `objective` umbrella skill when available for shared vocabulary. This skill is otherwise operationally self-contained, including the complete one-step procedure for ns-bookended execution.

## Select and read the Objective

1. If the user supplied a slug or path, use it exactly. Do not infer a different Objective from branch names or changed files.
2. Resolve a slug to `.ns/objectives/<slug>/`. Resolve an explicit Objective directory to that directory, or an explicit `objective.md` path to its parent directory. Refuse any other file path rather than guessing.
3. From the resolved record directory, read `objective.md`, sibling `roadmap.md`, optional `orientation.md`, relevant current `updates/`, and any `## Definition of Progress`, `## Runner Policy`, or row-level `Policy:` / `Evidence:` prose directly from the checkout.
4. Without an explicit selection, enumerate directories below `.ns/objectives/`; exclude records containing `closed.md`, present the remaining records, and ask the user to choose. Do not require `ns objective list`.
5. Stop if the record is missing, closed, ambiguous, or does not provide enough scope for one coherent slice.

Capture the requested roadmap scope, optional step budget, standing guidance, and any explicit mode request. A step budget is a hard ceiling, never a quota.

## Detect mode once

After selecting and reading the Objective, but before launch confirmation, probe both exact help surfaces once:

```bash
ns objective exec runner-begin --help
ns objective exec runner-finish --help
```

Treat each probe as available only when that command succeeds. Do not substitute `command -v ns`.

- If both succeed, default to `ns-bookended`.
- If either fails, select `portable`.
- Honor an explicit portable request even when both succeed.
- If the user explicitly requested `ns-bookended` and either probe failed, refuse that mode and offer a new portable preview. Do not claim equivalent guarantees.

Keep the selected mode for the confirmed run. A material capability or mode change requires a new preview and confirmation.

## Preview and confirm

Before any implementation dispatch, show a compact launch preview containing:

- Objective slug/path and selected roadmap slice(s);
- execution mode and why it was selected;
- branch topology: runner-managed step topology in `ns-bookended`; in `portable`, the exact base branch and HEAD plus the exact run branch, whether it will be created or reused, and its parent relationship;
- verification authority: `runner-attested` or `parent-verified`;
- commit behavior: `runner-finish` provenance commit or one ordinary parent commit per accepted slice;
- validation posture and exact stop/ask boundaries;
- step-budget ceiling;
- publication posture: off by default in `ns-bookended`, and unavailable/not applicable in `portable`.

Wait for an explicit affirmative such as “yes” or “proceed.” Push, submit, PR, merge, land, deploy, and other external writes are not included. If scope, mode, trust, topology, or publication posture changes materially, preview again.

## Shared parent loop

For every step:

1. Derive thin, judgment-bearing guidance from the active roadmap slice and prior result: what coherent slice to take, what the last attempt left behind, and what to avoid. Do not restate the whole Objective.
2. Dispatch exactly one implementation attempt under the selected mode.
3. Read the actual repository/result evidence and judge accept, recover, stop, ask, or continue. Never let child final prose substitute for repository evidence.
4. Judge Semantic Update need between steps. The implementation child must not edit Objective tracking. Use `objective-update` when installed; otherwise follow the checked-in Objective Markdown rules directly. Commit material tracking separately and report it separately.
5. Start another step only after the previous attempt has been judged.

Implementation children inherit the parent's provider, model, and thinking policy by default. An approved provider-local `cheap` route may be selected only before dispatch. A launch failure or malfunction never authorizes reactive model or provider switching.

## `ns-bookended` mode

This is the ADR 0024 protocol, expressed here without a special model-visible tool.

### Begin

Create a fresh private scratch directory outside the repository. Every default or recovery attempt gets fresh `facts.json` and `report.json` paths; never reuse a report path.

Run:

```bash
ns objective exec runner-begin <slug> [--recover] \
  [--guidance <text-or-@file>] \
  --report-path <outside-repo>/report.json \
  --format json > <outside-repo>/facts.json
```

Preserve the machine envelope unchanged. If begin refuses or the envelope has no prompt, nothing is dispatched; judge or stop.

### Dispatch

Dispatch one fresh harness implementation subagent in the same worktree with the emitted `prompt` **verbatim**. Do not append instructions, tracking edits, publication authority, credentials, or scratch authorization. Do not touch the worktree while the child runs.

The child report, not final chat prose, is the protocol artifact. A cancelled dispatch leaves uncertain worktree state: inspect it and do not pretend finish ran.

### Finish and judge

For every non-cancelled child outcome, run finish once:

```bash
ns objective exec runner-finish <slug> --facts @<outside-repo>/facts.json --format json
```

Read the returned Runner Checkpoint. Keep runner-attested facts distinct from unverified child narrative. Only `runner-finish` may create the accepted implementation commit and use `Objective-Runner-Step` or `Objective-Runner-Mode` trailers.

A repairable failure may receive a fresh recovery attempt with `--recover`, a new report path, and sharpened guidance. Recovery repairs the visible dirty tree; it is not an automatic retry. Do not reset ambiguous work.

ADR 0037 publication remains a separate parent-only operation after a real committed Runner Checkpoint, parent judgment, and material tracking. It is off unless durable policy, exact human authorization, an existing PR binding, and an implemented publisher all satisfy that ADR. Never substitute raw write commands.

## `portable` mode

Portable mode is prompt-driven orchestration with honest parent verification. It does not imitate runner artifacts or provenance.

### Prepare one dedicated run branch

Before the launch preview:

- require a clean worktree and attached HEAD;
- determine repository-declared trunk when available, otherwise protect `main` and `master`;
- record the current branch and HEAD as the proposed **base branch**, not as implicit authorization to implement there;
- derive or propose a dedicated **run branch** name from the Objective slug, following repository naming rules;
- check for local and remote collisions for that exact run-branch name;
- when the run branch does not exist, preview that it will be created from the recorded base branch and HEAD according to repository instructions, using ordinary Git when no stronger repository workflow is prescribed;
- when it already exists, stop and ask whether to reuse that exact branch, choose another name, or abort; do not silently reuse it;
- reuse any existing branch—including the currently checked-out branch—only when the user explicitly identified its exact name as the implementation destination before the preview, or explicitly confirms a preview that labels its exact name as an existing run branch to reuse. Being current, clean, non-trunk, Objective-related, or the branch that introduced the Objective record is not explicit selection;
- never use or commit on trunk as the run branch;
- keep every accepted implementation and tracking commit for this run on the single run branch.

After confirmation and before the first dispatch:

1. Revalidate the clean worktree, attached HEAD, base branch, and base HEAD captured by the preview. A mismatch requires a new preview and confirmation.
2. Create and check out the dedicated run branch, or check out the exact existing branch whose reuse was explicitly authorized.
3. Establish repository-required parent tracking. In a Graphite repository, create/track the run branch as a child of the previewed base branch; do not flatten it onto trunk.
4. Verify that either the run branch was created during this confirmed launch or reuse of its exact name was explicitly authorized. Otherwise stop.
5. Record the first portable dispatch baseline only after branch preparation succeeds.

Do not require Graphite, Branch Context, or a branch per step. The dedicated run branch is one branch for the entire portable run, not one branch per accepted slice.

### Record the baseline

Immediately before each dispatch, record parent-held session evidence:

- current branch;
- current HEAD;
- porcelain status, including staged state;
- Objective slug/path and selected slice.

This is not a runner facts artifact and creates no attestation.

### Dispatch one focused slice

Prefer a fresh harness implementation subagent when available. If the harness cannot provide fresh-session isolation, disclose that limitation in the preview or stop if isolation is required by policy.

Tell the child to:

- read the named Objective record and follow the thin parent guidance;
- stay on the current branch and implement exactly one coherent slice;
- leave all repository changes uncommitted and avoid staging unless repository tooling unavoidably does so;
- run relevant checks and report what it ran;
- leave Objective tracking unchanged;
- avoid every push, submit, publish, PR, merge, land, deploy, and external-write action.

Do not require the runner JSON report schema. Consume structured harness output when available; otherwise final prose remains an unverified child claim.

### Verify as the parent

Inspect the repository yourself. Before accepting, verify all of the following:

- branch and HEAD exactly match the baseline, so the child neither switched branches nor committed;
- the diff is non-empty and belongs to the selected slice;
- staged state is unchanged from the baseline unless a known repository command explains it and the parent explicitly accepts it;
- no unexpected files or evident external side effects appeared;
- `git diff --check` succeeds;
- repository-appropriate focused and default checks succeed;
- the actual diff implements a coherent accepted slice.

Do not use the child's validation statement as proof. Label conclusions **parent-verified**.

On success, create one ordinary local commit following repository conventions. Do not add `Objective-Runner-Step`, `Objective-Runner-Mode`, or other runner provenance. The commit is not a Runner Checkpoint.

On a repairable failure, leave the dirty tree visible and make a fresh recovery dispatch on the same branch with sharpened guidance. On ambiguous, unsafe, repeated, or out-of-scope failure, stop and ask. Never auto-reset or discard uncertain work.

ADR 0037 publication is **unavailable/not applicable** in portable mode. Do not invoke the runner binder or publisher and do not feed it a portable commit. A later push, submit, or PR operation is a separate explicitly requested workflow after autorun ends.

## Child and step boundaries

Every implementation child in either mode has this prohibition:

> Do not push, submit, publish, merge, land, create or update pull requests, deploy, or perform any other write-capable external action. Do not run `git push`, `gt submit`, `gh pr create`, `ns flow submit`, PR mutation, or an equivalent. In `ns-bookended`, none of these actions may run from inside the Objective Runner step. Leave Objective tracking to the parent.

In `ns-bookended`, the child has no publication authority, `runner-finish` alone owns the verified local implementation commit, and any authorized publication is a distinct parent-only action after the Runner Checkpoint, parent judgment, and material tracking. In `portable`, the child leaves changes uncommitted and the parent owns the ordinary local implementation commit; runner publication is unavailable.

## Autorun PR titles

Only after accepting a slice and obtaining separate authorization to submit may the trusted parent construct the fixed prefix `[obj:<slug>] [autorun:<accepted-ordinal>]` and pass it to `ns flow submit --title-prefix <prefix>`. Carry the selected Objective slug and accepted ordinal as explicit trusted facts. Never infer the ordinal from a branch name, commit prose, stack position, dispatch count, PR count, or other ambient evidence.

One prefix applies to every pull request newly created in that submit invocation's scope. If slices require different accepted ordinals, submit them in separate scopes. Existing pull requests are never prefixed, including when `--generate-pr-inventory` regenerates their metadata; later accepted steps and cumulative runner publication do not add or refresh the prefix.

Treat titles as human-facing metadata only, never as machine state, policy evidence, or authorization. Implementation children and `runner-finish` never create or edit pull requests. ADR 0037 publication remains body-only. Portable autorun remains local-only, so any later submit or pull-request creation is a separate explicitly requested workflow after autorun ends.

## Stop conditions

Stop and state why when any applies:

- the selected slice or completion criteria are met;
- the step budget is exhausted;
- Objective policy says stop or ask;
- a child stop reason survives parent judgment;
- branch, HEAD, scope, trust, compatibility, or external-write evidence is ambiguous;
- a recovery fails twice for the same step;
- a verification gate fails twice after reasonable local attempts;
- repeated dispatch or bookend malfunctions occur;
- continuing would require silent reset, scope expansion, mode weakening, or unapproved external action.

These are ceilings, not a hidden retry loop. A clear judgment stop is a successful autorun outcome.

## End of run

Leave HEAD on the run's last branch and preserve unresolved dirty state when stopping for recovery or judgment. Do not launch a handoff or publish unless separately requested and authorized outside portable autorun or through the exact ADR 0037 bookended path.

Read `references/run-digest.md` and finish with its exact `## Autorun digest` structure. Keep runner-attested evidence, parent-verified evidence, child claims, tracking commits, and publication outcomes visibly distinct.
