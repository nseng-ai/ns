# Dispatch anchor and landing

## Ownership

This living reference owns the git/GitHub result protocol: source reachability, anchor
initialization, up-front PR creation, Workflow run stamping, produced-history landing,
decision logs, failure reporting, and cleanup of failed setup mutations.

The user-facing promise remains in `README-draft.md`. Credentials live in
`dispatch-credentials-and-trust.md`; Workflow runtime behavior lives in
`dispatch-workflow-and-sandbox-runtime.md`; evidence lives in
`dispatch-live-evidence.md`.

## Local submission order

`ns dispatch prompt` performs refusal and preflight checks before mutation, then:

1. resolve repository root, current branch, and exact HEAD;
2. refuse a dirty worktree and list dirty paths;
3. validate dispatch configuration, package manager, Development token presence, and
   deployed identity acceptance, obtaining a canonical IANA `anchor_timezone`;
4. normalize the explicit `--slug/-s` override or derive a semantic slug from the
   dispatched prompt;
5. read the injected clock once, format `YYYYMMDD-HHmmss` in `anchor_timezone`, and select
   the first remotely available name from
   `dispatch/<semantic-slug>-<timestamp>`, then `-2` through `-50`;
6. read the source branch's remote tip;
7. push the source branch when missing or not equal to HEAD;
8. initialize and push the anchor branch;
9. open the anchor PR against the source branch;
10. start the dispatch Workflow;
11. stamp the returned run ID into the PR description.

Every push or PR mutation requires the explicit consent required by the Objective's Runner
Policy. Slug generation, timezone validation, or availability failure happens before the
first mutation and starts no dispatch. No source/random fallback is attempted. Availability
is necessarily a look-before-push check: if a concurrent dispatch claims the same name, the
existing anchor-push failure reports the race rather than overwriting or retrying after
mutation.

## Semantic anchor naming inputs

The durable anchor name records work intent and civil-time context, while source provenance
remains in the PR base/body. Prompt dispatch sends `{ kind: "prompt", content, cwd }` through
the dispatch-owned content-slug Consumer Gateway; the same interface accepts `kind: "plan"`
for the future plan command after it resolves full plan content. The implementation reuses
capability-kit content-slug generation and Foundation branch-slug normalization without
invoking Flow's Graphite/worktree autobranch workflow. Model failure is terminal; the
explicit slug override is the recovery and automation path.

## Why the anchor needs an initialization commit

GitHub cannot open a PR when head and base point to the same commit. The original
implementation pushed the anchor at the exact source revision, then received:

```text
No commits between <source> and <anchor>
```

The corrected protocol creates a metadata-only empty commit:

```text
source:  A
          \
anchor:   B  Initialize cloud dispatch anchor
```

`B` has `A` as parent and the same tree. GitHub sees one commit ahead and can open the PR,
while the initial PR has no file diff.

The first failed attempt pushed
`dispatch/cloud-dispatch-hermetic-deployable-269efe79`, created no PR, and started no
Workflow. The orphan branch was deleted after explicit authorization.

## Anchor PR contract

The PR opens before the Workflow starts and records:

- source branch;
- exact dispatched revision;
- dispatched prompt or work reference;
- explanation of landing and failure behavior;
- marked Workflow run-ID line after trigger success.

The marked run-ID line is idempotently replaced rather than appended. It is the durable
join between GitHub status and Vercel Workflow observability.

The PR is based on the source branch, so the initialization commit contributes no file diff
and the eventual diff shows only produced work.

## Landing protocol

The agent works in a fresh checkout at the dispatched SHA without a push credential. At
completion:

1. validate the runner result and decision log;
2. determine whether the agent produced commits;
3. if the checkout is dirty but uncommitted, create a fallback commit under the App bot
   identity;
4. mint a fresh landing-purpose token in the Workflow process;
5. inject it only into the landing command;
6. force-push produced history to the pre-created anchor branch;
7. replace the metadata-only initialization state;
8. publish the marked decision-log section in the PR description.

The force-push is deliberate and scoped to the unique `dispatch/` anchor. The workflow never
pushes the user's source branch.

Landing and PR reporting are idempotent because Workflow steps may retry.

## Normal versus fallback commits

Normal success means the agent validates and commits its own work. The supervisor lands that
history.

Fallback success means the agent left an otherwise valid dirty checkout. The supervisor may
create `Commit dispatched work the agent left uncommitted` so work is not silently lost.
This is recovery behavior, not evidence that the harness's command and commit path is
healthy.

The first completed dispatch used fallback landing because Pi's Bash calls were blocked by
missing extension lifecycle initialization. Runner details and required reverification live
in `dispatch-pi-runner.md`.

## Decision log and failure reporting

The PR description contains a marked decision-log section. It records judgments the remote
agent made without a human, validation performed, limitations, and final state. Updating the
marked section is idempotent.

When the run fails after PR creation:

- the anchor PR remains open;
- a failure comment identifies the safe semantic reason and run locator;
- no failure is hidden solely in Vercel logs;
- the branch/PR becomes the triage surface.

If submission fails before Workflow start, the CLI reports exactly which remote artifact
already exists so cleanup or retry is deliberate.

## Verification checklist

A completed dispatch is verified from both systems:

- Workflow status is terminal on the expected deployment;
- PR base/head branches are correct;
- run-ID marker remains present;
- initialization-only history was replaced;
- files match the prompt;
- landed commit identity and message are visible;
- decision log is present;
- no success claim depends only on Workflow completion;
- PR checks are reported separately from dispatch completion.

## Live evidence

PR #3612 and run `wrun_01KXFZ14SBRCGTSPP5PEH19C3T` proved up-front anchor creation,
run-ID stamping, completed Workflow status, one-file fallback landing, and decision-log
publication. Exact locators and bounded claims are in `dispatch-live-evidence.md`.

## Open work

- Reverify normal agent-created commit landing after the Pi lifecycle fix.
- Verify the success path without fallback commit creation.
- Preserve explicit consent for every future source/anchor push and PR mutation.
