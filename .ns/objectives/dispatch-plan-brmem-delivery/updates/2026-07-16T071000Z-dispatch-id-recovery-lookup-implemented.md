# Dispatch ID recovery lookup implemented

## Summary

Workflow run recovery by Dispatch ID is locally implemented behind an explicit Analytics gateway. The recovery query filters on the exact `dispatch.id` Workflow attribute, requests at most two matches, and returns typed outcomes for zero, one, or multiple matches rather than guessing. Analytics unavailability, invalid Dispatch IDs, and lookup failures are also explicit outcomes.

The implementation is fake-tested only. No live Workflow Analytics request, credential use, workflow trigger, or other external action occurred.

## Objective Impact

The last planned local behavior in the workflow and sandbox row is implemented. Combined with the preceding workflow commits, the dispatch spine now has typed locator transport, `dispatch.id` start attribution, exact-ref sandbox retrieval and deterministic plan-member precheck, a `brmem get`-first harness instruction, and exact-attribute recovery semantics.

The roadmap row remains in progress solely because `build:deployable` cannot run in this worktree without local Vercel Project Settings. Local autorun may continue into command and wrapper work while preserving that validation blocker, but it must not claim the workflow row complete or perform `vercel pull`/credentialed setup.

## Follow-Ups

- Wire recovery outcomes into the command or observation surface where useful for failure recovery and machine provenance.
- Obtain successful `build:deployable` evidence from a linked or repository-supported hermetic checkout before marking the workflow row complete.
- Live-prove Analytics filtering and eventual-observation behavior only during the separately authorized end-to-end interlude.
