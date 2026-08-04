# Gitplane Reconciliation Contract and Proof Matrix

## Summary

Create the first, documentation-only PR in the `gitplane-reconciliation-stack-rebuild` Objective. The PR freezes only the reconciliation decisions required to keep the later source-facts, planner, durable-store, engine, and CLI slices aligned. It adds no TypeScript, package exports, fixtures, tests, planner/store/engine behavior, or placeholder test cases.

The contract is authoritative for the rebuild but provisional because Gitplane is new and requirements remain in flux. Decisions that do not materially constrain this PR or the immediately following slices must be labeled for re-examination in the slice that implements them rather than settled speculatively.

## Objective and source evidence

- Selected Objective: `.ns/objectives/gitplane-reconciliation-stack-rebuild/`
- Roadmap target: the first row, **Contract and proof matrix**.
- Parent Gitplane contract:
  - `.ns/objectives/gitplane/references/README-draft.md`
  - `.ns/objectives/gitplane/references/SPEC-draft.md`
  - `.ns/objectives/gitplane/objective.md`
  - `.ns/objectives/gitplane/roadmap.md`
- Prototype reference: commit `09d75c3ae` on the retained `gitplane-cursor-reconciliation-baseline-repair` branch / PR #4076.
- The prototype is evidence to account for, not code to land. Its notable contract choices included per-artifact writes, a `planDigest`, and event-reconstruction values `complete | skipped | not-applicable`; this PR deliberately clarifies or replaces those choices where stated below.
- Existing public core intent remains `reconcile(context, options)`. The future Gather → Decide → Apply planner remains internal.

## Confirmed PR boundary

### In scope

1. Amend the normative SPEC with named reconciliation invariants and a curated scenario/proof matrix.
2. Amend the user-facing README draft only for observable behavior.
3. Update the rebuild Objective and roadmap so their durable tracking matches the contract decisions, including replacement of baseline-digest language with a reconciliation attempt ID and frozen plan.
4. Give each scenario a stable semantic ID and identify the later implementation slice that must add its public-interface end-to-end scenario coverage.
5. Mark nonessential downstream decisions as provisional TODOs requiring re-examination when their owning slice is implemented.

### Out of scope

- Any `.ts`, package manifest, export, schema, gateway, fake, fixture, or test change.
- Typed contract-vector infrastructure. Add vectors later only when they can be consumed by an end-to-end scenario through `reconcile(context, options)`; test supporting infrastructure when that infrastructure is introduced.
- Pending/skipped tests or fake implementation added solely to make future scenarios compile.
- Planner fact/plan types, exact durable row shapes, SQL details, attempt recovery commands, CLI rendering, and final error-code names.
- Exhaustive comparison with prototype commit `09d75c3ae`; retain the Objective's complete stack-tip behavioral-accounting requirement.
- Redesign beyond clarifications needed to establish the rebuild's proof obligations.

## Files to change

### 1. `.ns/objectives/gitplane/references/SPEC-draft.md`

Expand the `gitplane reconcile <commit> [--full]`, reconciliation events, and reconciliation errors sections. Add a compact **Reconciliation proof matrix** subsection near those normative semantics.

Freeze these rebuild invariants:

- **Truth and validation:** Gather source/store facts and validate the complete corpus and semantic plan before the first materialization write. Planning uses Git facts and the persisted frozen attempt, never partially materialized rows.
- **Transition precedence:** at most one event per artifact, ordered `created → restored → revised → moved → none → deleted`; revision wins over a simultaneous move; generic-to-classified is a revision.
- **Initial full reconciliation:** materializes current truth but emits no artifact events.
- **Event reconstruction statuses:**
  - `not-requested`: normal incremental reconciliation, including normal equal-cursor cleanup-only behavior;
  - `performed`: full reconciliation where comparable history is available; equal-cursor full repair can report this while naturally emitting no transition events;
  - `skipped-no-baseline`: initial full reconciliation;
  - `skipped-baseline-unavailable`: a recorded prior cursor commit cannot be read;
  - `skipped-non-forward-history`: full repair targets an older or divergent commit.
  - All `skipped-*` cases emit no events.
- **Provisional apply phase order:** persist attempt/frozen plan → all revisions → all lineage → all current state → all classified targets → all events → cursor CAS → resolve errors → delete the attempt. Within each materialization phase, process artifacts in canonical artifact-ID order. Skip inapplicable phases without reordering. This is an adapter-neutral semantic order, not SQL statement or transaction ordering. Mark it authoritative for the rebuild but subject to explicit amendment when the engine/fault-injection slice tests it.
- **Completion:** cursor CAS is the completed-materialization boundary. `cursorAdvanced` is per invocation: a cleanup failure after that invocation's successful CAS reports `true`; a later cleanup-only invocation reports `false` even though the durable cursor already points at the target.
- **Failure split:**
  - structural failures are deterministic history, corpus, legality, classification/schema, attempt-conflict, baseline/frozen-plan conflict, or CAS precondition mismatch outcomes; they do not create durable reconciliation-error rows;
  - operational failures are failures to execute required source/store operations. Once the write phase begins, Gitplane records a sanitized durable reconciliation error best-effort where applicable; persistence failure never replaces the primary failure;
  - distinguish semantic CAS mismatch from an operational CAS backend failure, and semantic attempt conflict from an operational attempt-store failure;
  - failure-recording side effects are not part of the happy-path phase sequence.
- **Attempt identity:** replace the prototype's `planDigest` contract with a deterministic `gpa_` reconciliation attempt ID derived by length-framed hashing of source ID, expected cursor commit or an explicit initial-sync sentinel, target commit, and mode. The exact derivation function and literal identity test are deferred to the durable-store slice.
- **Frozen retry authority:** persist one complete adapter-neutral semantic apply plan under the attempt ID and replay it verbatim after interruption. It includes the prior/current facts, identities, transition/event outcome, target identity, and derived projection values needed to apply without rereading source artifacts or reinterpreting changed kind registration. It excludes adapter-specific SQL and mutable progress markers. The exact durable type/schema remains provisional for the planner and durable-store slices.
- **Single pending attempt invariant:** a source cannot silently replace an unresolved attempt; matching work reuses its frozen plan, conflict fails structurally, and post-CAS residue is cleanup-only. Explicitly defer detailed stale-attempt recovery, mode-mismatch handling, operator controls, and exact lookup precedence to the durable-store/engine slices because they do not alter this PR.

Add a curated matrix rather than a Cartesian product. Use stable IDs, dimensions, expected semantic outcome, proof obligation, and owning future slice. Suggested groups and minimum cases:

- `history-*`: initial normal rejection; initial full; incremental descendant; incremental equal; older/divergent normal rejection; full descendant/equal/older/divergent; merge rejection; unavailable prior history.
- `lifecycle-*`: create; delete; restore; move; revise; simultaneous revise+move precedence; unchanged; generic-to-classified; classified-to-generic rejection; established kind/API change rejection; legal/illegal schema transition; same-path ID replacement; duplicate target ID.
- `events-*`: each five-value reconstruction status; initial full no events; at-most-one event and precedence; deterministic retry identity/sequence as a later proof obligation.
- `attempt-*`: first attempt persistence; matching retry reuses the frozen plan; conflicting pending attempt fails structurally; post-CAS cleanup-only residue. Mark stale-attempt/operator recovery and exact storage-shape cases as provisional TODOs rather than inventing outcomes.
- `failure-*`: pre-write structural failure with no durable error; materialization backend failure with best-effort durable error; CAS mismatch versus CAS backend failure; primary failure survives error-recording failure; post-CAS cleanup failure.
- `completion-*`: successful CAS with `cursorAdvanced: true`; pre-CAS failure with `false`; same-invocation post-CAS failure with `true`; later cleanup-only failure/success with `false`; stable revision/event/target outcomes after shared-state retry (owned by the engine fault-injection slice).

The matrix is normative documentation, not a typed catalog in this PR. Each row should carry an owner such as `source facts`, `planner`, `durable store`, `engine E2E`, or `CLI E2E`. Later slices must add each scenario when its product behavior and test infrastructure are added. Do not add broad combinatorial generation or claim implementation proof in this PR.

### 2. `.ns/objectives/gitplane/references/README-draft.md`

Keep this change narrowly user-observable. State that:

- initial `--full` establishes materialized state without inventing historical artifact events;
- cursor advancement is the completed-materialization boundary;
- cleanup may fail after materialization completed, and a later equal-cursor invocation may perform cleanup only without replaying materialization or events;
- `cursorAdvanced` describes whether the current invocation advanced the cursor.

Do not expose attempt IDs, frozen-plan fields, deletion guards, global phase internals, structural taxonomy, SQL/schema design, or unresolved recovery policy in the README.

### 3. `.ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md`

Record the grilled decisions so later sessions do not revert to prototype assumptions:

- Replace the Completion Criterion / risk wording that requires a `baseline digest` with the deterministic `gpa_` attempt ID plus persisted frozen semantic plan.
- Preserve the complete fault-injection and stable-identity proof at stack tip.
- Clarify the Non-Goal against redesign: this contract slice may explicitly amend ambiguities exposed by the proof matrix; the confirmed attempt-ID, event-status, completion, failure-classification, and phase-order decisions are intentional rebuild amendments rather than silent prototype drift.
- Add an assumption/risk note that Gitplane is unreleased and these requirements are provisional. The documented invariants coordinate the stack, but implementation-owning slices must re-examine decisions not necessary to earlier PRs and amend the contract/Objective explicitly if evidence changes them.
- Preserve complete semantic accounting against `09d75c3ae` as a closure criterion.

### 4. `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md`

Rewrite the first row before marking it complete:

- Replace `canonical vectors` / `baseline digest` with normative invariants, stable scenario IDs, coverage ownership, attempt-ID/frozen-plan semantics, and reviewed prototype deviations.
- Make the proof obligation documentation-level: complete, internally consistent, and sufficient to assign later end-to-end proof without implementation noise.
- Record that typed vectors arrive with executable public-interface scenarios, not in this PR.

Update later rows only where they contradict the new contract:

- planner row: constructs the complete adapter-neutral frozen semantic plan and projections;
- durable-store row: implements/persists the deterministic attempt ID and frozen plan, makes the schema-version decision, and tests its infrastructure when added;
- engine row: use global phase barriers rather than prototype per-artifact ordering, then exercise failure before/after every write boundary over shared state;
- CLI/closure rows: retain public-interface E2E coverage and complete prototype accounting.

Mark only the contract/proof-matrix row `[x]`. Do not imply that implementation, executable vectors, fault injection, or prototype equivalence is complete.

## Review questions for PR 1

1. Does every frozen invariant materially constrain an early rebuild slice, or should it be moved to a provisional implementation-time TODO?
2. Is every event status mapped to all normal/full history modes, with initial full and skipped cases unambiguously producing no events?
3. Does `cursorAdvanced` consistently mean advancement by this invocation rather than current durable cursor equality?
4. Are structural precondition conflicts separated from operational adapter failures and durable-error policy?
5. Does the frozen plan contain enough semantic information to prevent source/configuration reinterpretation on retry without freezing an adapter schema?
6. Does the matrix cover each distinct contract outcome and high-risk interaction without becoming a Cartesian suite?
7. Is every scenario assigned to the earliest future slice capable of proving it end to end through `reconcile(context, options)`?
8. Are README edits limited to observable behavior?
9. Are deviations from `09d75c3ae` conspicuous while full behavioral accounting remains deferred to stack tip?

## Validation

This is a Markdown/Objective-only PR; do not claim TypeScript or runtime behavior evidence.

Run:

```sh
dprint check \
  .ns/objectives/gitplane/references/README-draft.md \
  .ns/objectives/gitplane/references/SPEC-draft.md \
  .ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md \
  .ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md
ns objective check gitplane
ns objective check gitplane-reconciliation-stack-rebuild
```

If dprint fails, run `just dprint-fix`, inspect that only intended formatting changed, then rerun the scoped check and both Objective checks.

Review the final diff against prototype commit `09d75c3ae` only for the explicit contract differences introduced by PR 1. Do not claim exhaustive prototype accounting; that remains a stack-tip closure obligation.

## Completion evidence

PR 1 is complete when:

- the four planned Markdown files contain the agreed contract, proof matrix, observable README clarifications, and synchronized Objective tracking;
- the first rebuild roadmap row alone is marked complete;
- each canonical scenario has a stable ID and owning implementation/E2E slice;
- unnecessary downstream choices are visibly provisional and assigned for implementation-time re-examination;
- no TypeScript, test, package, schema, fixture, or export file changed;
- scoped dprint and both Objective checks pass;
- review confirms the intentional differences from `09d75c3ae` are named without weakening stack-tip behavioral accounting.