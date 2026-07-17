# Roadmap

Rows reference finding IDs in `references/review-findings.md`, which carries the full
evidence and reconciled remedy for each — read the referenced entry before working a
row. Rows are severity-shaped: one row per HIGH and per surviving MEDIUM, themed batch
rows for the LOWs. Order within `## Work` is the suggested burn-down order (gates and
interactions noted per row), but rows without a stated dependency may land in any
order. Validation (`just`, targeted suites) is completion evidence recorded in row
notes — never a standalone row.

## Work

- [x] **H10 + M19–M21 — Harden sandbox lifecycle and observation boundaries.**
      Created the sandbox in its own zero-retry Workflow step so only its safe name
      crosses into durable state; returned and thrown post-create failures clean up
      before reporting; carried diagnostics are re-normalized; event sink,
      serialization, status stream, and writer-lock release are best-effort; the
      canonical inspection skill defines an active-run observation cutoff.
      - [x] H10: durable sandbox identity before preparation and detached launch.
      - [x] M19: `DispatchDiagnosticError` fields cannot bypass normalization.
      - [x] M20: observability failures cannot change dispatch behavior.
      - [x] M21: active/stuck inspection is bounded and explicitly open-ended.
      Evidence: focused lifecycle/diagnostic/observability tests passed (134 tests), the
      full Vercel package passed (749 tests), focused and workspace typechecks passed,
      `areg check`, Objective checks, formatting, lint, style guard, and full `just`
      passed. `build:deployable` could not run without local Vercel project settings or
      `VERCEL_TOKEN`; no build, deployment, billable sandbox, or live-run proof is
      claimed.
- [ ] **H1 — Collapse the dual failure channel.** Delete the never-produced
      `ok: false` arms from the six dispatch result unions (and the four supervision
      ones if they survive H2), make the fakes throw, and remove the paired
      try/catch + ok-check blocks and duplicate-literal failure sites in
      `dispatch-steps.ts`; one error-propagation convention package-wide. May land in
      the review stack itself before merge — if so, close this row with that PR as
      evidence. Record the convention choice (delete-arms vs normalize-in-adapter) in
      a Semantic Update.
      Evidence: `just` green; `dispatch-steps.test.ts` shrinks by roughly its paired
      throw/failure tests with no live branch losing coverage.
- [ ] **H2 — Probe retirement slice.** Gated: land only after cloud-execution's
      controlled Pi rerun closes the steel thread (keeps that rerun's deployment delta
      confined to the Pi repairs). Delete supervision-probe and workflow-probe
      machinery, their trigger branches, and both probe sandbox adapters; keep
      `supervision.ts`. Settle hello-probe's fate as an explicit decision with
      cloud-execution's setup-skill row (retain as deploy smoke/acceptance tool, or
      retire). Dissolves H3, H5, H8, and the sandbox halves of M17 by subtraction —
      re-check those rows when this lands.
- [ ] **H3 + H5 — Conditional consolidation (only what H2 leaves standing).** If any
      probe machinery is retained: merge the surviving sandbox adapters into one real
      adapter with narrowed consumer-gateway types (H3). Either way, after H2: inline
      the surviving `workflowManifestId` call(s) into `trigger/workflow-ids.ts`, have
      `WorkflowRunGateway.startWorkflow` accept `TriggerRequest` directly, and delete
      `toWorkflowStartRequest` plus the hand-maintained `WorkflowStartRequest` union
      (H5). Skip-and-record if H2 leaves nothing to consolidate.
- [x] **M4+M5 — Extract the dispatch client out of the `ns` host surface.** Moved
      `src/ns/dispatch-prompt/` into the manifest-declared `dispatch-client` feature
      subpackage. Follow-up review refined the package-shared `[dispatch]` parser into
      neutral `src/config/` ownership; dispatch-client retains invocation-specific
      preflight refinement. `src/ns/` retains the
      extension descriptor and command adapter, while `src/api/index.ts` preserves the
      curated `@nseng-ai/vercel/api` re-export without exposing a public
      `./dispatch-client` subpath. Feature-owned tests and support now live under
      `test/dispatch-client/`; the ns command scenario remains under `test/ns/`.
      Evidence: the focused Vercel package typecheck and all 622 package tests passed;
      repo-wide TypeScript format, lint, and style-guard checks passed. The later
      Graphite-aware dispatch source-publication feature consumed this extracted seam
      through `dispatch-client` without recreating the old `src/ns/dispatch-prompt/`
      ownership; that behavior work does not close any additional thermo row.
- [x] **H9 — Single checkout-root constant.** Exported
      `DISPATCH_CHECKOUT_PACKAGE_ROOT` from the harness registry and derived both
      `PI_RUNNER_ENTRY_PATH` and the pi-runner workspace bin path from it. Tests pin
      both derivations. Evidence: the focused Vercel package typecheck and all 622
      package tests passed; repo-wide TypeScript format, lint, and style-guard checks
      passed.
- [ ] **H4 + M1 — Auth assembly and config-shim collapse.** The `??`-collapse deleting
      `createJoseDevelopmentCallerAuthenticator` and both authenticator ternaries; one
      shared config-error formatter; delete `trigger/runtime-config.ts`, its five
      plumbing types, and its 68-line shim test. No generic route shell (explicitly
      rejected — see review-record.md).
- [ ] **M6 — Adopt foundation's scripted exec fakes.** Delete
      `test/ns/support/scripted-command-runner.ts` (silent-replay-on-exhaustion trap);
      use `@nseng-ai/foundation/exec/testing` (`ScriptedCommandExecApi` /
      `exitedResult`, areg re-export pattern); fold the third `exited()` spelling.
- [ ] **M10 — Workspace-gateway forensics and integration coverage.** Add `message`
      (via `formatErrorMessage`) to the six workspace failure arms and thread into
      `failedCompletion`; add `test/integration/` coverage for the real Node io (temp
      dir + real git). Keep the io seam — it guards the atomic completion-signal
      ordering invariant.
- [ ] **M11 — Make the config.json double-read explicit in build-deployable.** Hoist
      both reads into `main()` adjacent to the commands that produce them (or snapshot
      per step); the ordering dependency must be visible at one site.
- [ ] **H7 + H8 — Sandbox-name dedupe and honest test names.** Delete
      `src/sandbox/sandbox-name.ts`, retarget its test at `contracts.ts` (H7). Rename
      the two contradicting test titles in
      `real-supervision-sandbox-gateway.test.ts:113,124` (H8) — moot if H2 has already
      deleted that file. Quick slice; can land any time.
- [ ] **M18 + Batch E — Doc-contract coherence.** Fix the stale
      harness-session-generation edge annotation (counterpart-frontmatter edit; run
      `ns objective check --all` after); mark or remove the `/ns:dispatch:plan`
      Quick-start block in README-draft; map the orphaned observability research doc
      and route its recommendations; reduce each restated contract (env table,
      preflight checklist, deploy gate) to one normative home plus links, and state
      which layer wins; add the credentials-design supersession note and repoint the
      stack-smush citation (L27). Also repair the structurally invalid update file the
      stack introduced: `cloud-execution/updates/2026-07-14T095517Z-reference-docs-reorganized-by-topic.md`
      lacks the required `## Objective Impact` and `## Follow-Ups` headings, failing
      `ns objective check cloud-execution` (2 pre-existing errors, found 2026-07-14
      during this objective's creation) — best fixed in the review stack before merge
      since the file is immutable once landed. Worth doing early — restatement drift
      compounds while open.
- [ ] **Batch A — mint/auth/trigger polish.** M2 (env-parsing ceremony), L1
      (unreachable `MintResponse` members), L2 (guard-shaped name), L11 (unused factory
      param), M17's mint/trigger fake dedupe into shared support. Per-item detail in
      the ledger.
- [ ] **Batch B — dispatch module polish.** L6 (validation re-export path), L7 (dead
      `invalid-input` arm; keep the re-check), L8 (transient reads mislabeled
      misconfigured), L9 (acknowledge the non-atomic PR read-modify-write — see the
      recorded shortcut/upgrade pair in objective.md), L10 (split the failure variant),
      L12 (eta-expansions), L26 (fold completion-contract), M13(b) (fold the
      package-manager parser into harness-invocation without weakening
      `ValidatedPnpmVersion`), optional M14/M15 only if they fall out of H1's
      restructuring for free.
- [ ] **Batch C — ns CLI polish.** M8 (single exec seam, optional), M3 (shared
      `[dispatch]` key constants + asymmetry comment; do NOT unify parse stacks), L13
      (pre-mutation bounds check placement; keep the post-PR re-check), L14–L20 per the
      ledger.
- [ ] **Batch D — pi-runner/build cleanup.** M9 (hoist the PATH mutation to
      `main.ts`), M12 (split the deployability module; move its tests out of
      `test/api/`; delete the trigger-coupled wrapper), L24 (func-listing helper), L25
      (foundation `errorCodeFromUnknown` only — keep the deliberate execFile wrapper),
      L21 (hello-probe script wire-contract dedupe — only if hello survives H2's
      decision; otherwise record moot).

## Parked

- **`withReportGateway` operator trace:** report-gateway errors are swallowed, leaving
  only `failureReported: false` — judged below the bar standalone by the adversarial
  pass; revisit if M10's forensics work makes a cheap shared shape obvious.
- **L9 upgrade pair:** `If-Match`/ETag conditional PATCH + full comment pagination for
  the anchor-PR report gateway — parked until dispatch volume makes write collisions
  plausible (see the shortcut/upgrade pair in objective.md).
