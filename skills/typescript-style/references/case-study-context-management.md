# Case Study — Context and Workflow Management

Use this pattern for agents, job runners, sync engines, editors, build systems, or any stateful workflow
that repeatedly folds durable history into a working context, runs a step, records events, and decides
whether to compact, retry, or stop.

## 1. Durable history vs. working context

Separate what you store from what you execute with:

```ts
type HistoryEntry =
  | { type: "message"; message: Message }
  | { type: "summary"; summary: string; coveredEntryIds: string[] }
  | { type: "setting_change"; key: string; value: unknown }
  | { type: "checkpoint"; id: string; createdAt: number };

interface WorkingContext {
  messages: Message[];
  settings: ResolvedSettings;
  checkpoints: Map<string, Checkpoint>;
}
```

A pure reducer folds durable entries into the working shape. That makes replay, testing, and compaction
straightforward.

## 2. Budgeting and compaction

Use real measurements where you have them; estimate only the unknown tail.

```ts
function shouldCompact(used: number, limit: number, reserve: number): boolean {
  return used > limit - reserve;
}
```

Prefer explicit reserve values over percentage-only knobs. A fixed reserve says what the next operation
needs; percentages often hide the real invariant.

Compaction should produce a new durable entry rather than mutating old history in place:

```ts
interface SummaryEntry {
  type: "summary";
  summary: string;
  coveredEntryIds: string[];
  createdAt: number;
}
```

## 3. Plain loop over locals

A workflow loop can be simple and explicit:

```ts
while (true) {
  const context = buildWorkingContext(history, settings);
  const step = await runStep(context, runtime);
  history.push(...step.entries);

  if (step.type === "done") break;
  if (step.type === "retry") continue;
  if (shouldCompact(step.usedBudget, settings.budgetLimit, settings.reserveBudget)) {
    history.push(await compact(history, settings));
  }
}
```

Avoid parallel lifecycles unless they express genuinely different states. A linear dispatcher with clear
phase names is often easier to debug than an abstract state machine framework.

## 4. Planning and execution phases

Split complex actions into interceptable phases:

```ts
const plan = prepareToolCall(context, request);
const prepared = await hooks.onPrepared(plan);
const execution = await executePreparedToolCall(prepared, runtime);
const finalized = finalizeToolCall(prepared, execution);
```

Benefits:

- pure planning is easy to test;
- hooks can inspect or replace plans before side effects;
- execution owns I/O and cancellation;
- finalization owns event normalization and durable history entries.

## 5. Retry and recovery

Retry should be a first-class event/result, not a hidden recursive call. Record why a retry happened
and what changed before the next attempt.

```ts
type StepResult =
  | { type: "continue"; entries: HistoryEntry[]; usedBudget: number }
  | { type: "retry"; entries: HistoryEntry[]; reason: "overflow" | "transient_failure" }
  | { type: "done"; entries: HistoryEntry[] };
```

This makes retries visible to tests, logs, and users.

## 6. Hook boundaries

Hooks need clear contracts:

- observe only;
- transform payload;
- veto;
- replace execution;
- handle failure.

Do not infer capabilities from callback presence. Declare them in the hook type or registration options.

## 7. State ownership

Keep one owner for each mutable concept:

- history store owns durable entries;
- loop owns current run lifecycle;
- runtime owns I/O collaborators;
- UI owns rendering and input;
- compaction owns summaries and budget decisions.

If two objects can both mutate the same lifecycle state, you probably need a narrower API or a single
coordinator.

## What to copy

- Durable history as typed entries.
- Pure fold from history to working context.
- Budgeting based on real measurements plus estimated tail.
- Explicit reserve thresholds.
- Linear loop with named phases.
- Planning/execution/finalization split for side-effectful work.
- Retry as typed data, not hidden control flow.
