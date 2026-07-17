# Review record — process, dropped findings, and clean attestations

Companion to `review-findings.md`. This file preserves how the 2026-07-14
thermo-nuclear review ran, which draft findings the adversarial challenge dropped (and
why — do not re-propose them without new evidence), and what was verified clean (do not
re-flag it).

## Process

Scope: the full cloud-dispatch Graphite stack, PRs #3587–#3620 (22 commits, tip
`cloud-dispatch/topic-reference-docs`, merge-base `master`). Code surface: the entire
new `ts/packages/capabilities/vercel` package (126 files, ~16.7k lines). Non-code
surface: `.ns/objectives/cloud-execution/**` references/updates, CONTEXT edits,
`ns.toml`, deleted `docs/wayfinding/ns-cloud-capabilities/**`.

Seven parallel slice reviewers, each applying the thermo-nuclear standards while
respecting the cloud-execution orientation (sanctioned Vercel coupling,
supervision-only workflow steps, no backend-agnostic abstractions):

1. mint/auth/http/api routes
2. trigger + workflows (the `*-id.ts` scheme, registration chain)
3. sandbox/supervision/probes
4. dispatch core (`dispatch-run.ts`/`dispatch-steps.ts`, harness registry, failure
   ownership)
5. ns CLI `dispatch prompt` (core, six real gateways, foundation reuse)
6. pi-runner/build/packaging (build-deployable, deployability gate, hermetic artifacts)
7. docs/config/consumer surface (doc-vs-code contract spot checks)

They produced ~55 draft findings (9 HIGH / 18 MEDIUM / 27 LOW). An adversarial
challenger then re-verified every HIGH/MEDIUM against the actual code with explicit
instructions to refute — including pressure-testing probe retirement against the
still-open steel-thread rerun, the dual failure channel against Workflow SDK retry
semantics, and the subpackage extraction against the conventions doc. Outcome: 9
dropped, 14 downgraded, several remedies reframed. Two independent-convergence signals
strengthened the top finding (H1 found separately by the sandbox and dispatch
reviewers; H7 by the sandbox and cross-cutting reviewers).

Verdict as delivered: the stack does not clear the thermo-nuclear approval bar as-is —
H1 (dual failure channel) was recommended as the one pre-merge fix, H2 (probe
retirement) as a scheduled post-rerun slice, everything else as fast-follow. That
review found no behavioral defect in the dispatch path; the later focused review below
narrowly supersedes this statement for the combined launch step's sandbox-identity
durability window.

## Focused lifecycle and observability review (2026-07-16)

Scope: the dispatch sandbox creation/launch lifecycle, diagnostic normalization,
Workflow event writer, and canonical Vercel Workflow inspection skill. The review kept
H10 at HIGH and M19–M21 at MEDIUM after challenge: the post-create durability window
can lose cleanup ownership; the other three are bounded contract defects rather than
HIGH-impact lifecycle failures. H10 narrowly supersedes only the earlier clean
attestation that `maxRetries = 0` on one combined launch step was sufficient. Credential
discipline, deterministic-core/Node-step separation, and failure precedence remain
clean.

The challenge explicitly dropped generic splitting of the near-1k-line dispatch module:
the accepted remedy is the minimal durable-identity seam, not decomposition by size.
Full report-comment pagination remains parked with the existing L9 concurrency upgrade
pair; this review supplied no trigger to promote it.

## Dropped findings — do not re-propose without new evidence

- **H6 (extract `executeSupervisionProbeRun`):** the branching and untested
  launch-failure path in `workflows/supervision-probe.ts` are real, but the whole file
  is deleted by the H2 retirement slice; extracting an executor for a workflow scheduled
  for retirement is wasted motion.
- **M7 (split `preflight.ts` out of `core.ts`):** `core.ts:52-56` carries an explicit
  recorded decision rejecting exactly this extraction ("extraction would add ownership
  indirection rather than create a deeper module"), and preflight's result feeds the
  trigger connection. A pure file split against an in-code rationale, with no drift or
  bug risk shown. (The M4+M5 dispatch-client extraction moves the *directory*, not this
  intra-module boundary.)
- **M13(a) (replace the harness registry with a switch):** the registry is not a
  speculative one-entry indirection — the cloud-execution roadmap's claude-code row
  explicitly reactivates "when one complete Claude Code registry entry supplies
  provisioning, launch, …"; it is the designed extension point with a scheduled second
  entry. Replacing it to save ~35 lines and then reverting is churn. (M13(b), the
  package-manager parser's placement, survives as a LOW.)
- **M16 (move gateway contracts out of probe modules):** verified (adapters import the
  probe module for their seams), but every listed file is deleted by H2; standalone it
  is a type relocation.
- **L3/L4/L5 (probe-internal polish):** triple parameter validation, the constant
  `markerOutput` field, optional-only-for-fakes `session.name` — all subsumed by the H2
  deletion.
- **L22 (foundation `Result` in pi-runner):** the bespoke `{ok}` unions match the
  dispatch-side serializable-result convention; mixing foundation `Result` into
  pi-runner alone would reduce package-internal consistency.
- **L23 (drop the DOM lib from tsconfig):** dubious — the package's `api/*.ts` handlers
  are typed against web `Request`/`Response`, which is plausibly why DOM is present, and
  the removal was never verified to typecheck.
- **Generic route shell (part of draft H4):** `route-context.ts` is genuinely
  trigger-specific; a parameterized shell over three routes adds a concept. The
  surviving remedy is the `??`-collapse plus a shared 500-formatter.
- **Delete the pi-runner io seam (part of draft M10):** the seam is not a 1:1 mirror
  and is what lets tests assert the partial-write→rename ordering — the
  contract-critical atomic completion-signal invariant. Surviving remedy: failure
  messages + integration-lane tests.
- **Below-bar adjacent note:** `withReportGateway` swallows report-gateway errors so a
  failed anchor-PR report leaves no operator trace beyond `failureReported: false`;
  judged below the bar standalone, adjacent to M10's forensics point. Parked on the
  roadmap.

## Clean attestations — verified good; do not re-flag

- **Credential discipline (package-wide):** clone token in-memory at creation; landing
  token late-minted into a single landing command's env; value-free error messages;
  tokens never in step results, journals, or gateway outputs — all *tested* with
  `not.toContain` leak assertions. The mint purpose model (schema accepts `landing`,
  handler 403s it, wire success pins `purpose: "clone"`) is deliberate 401/403-vs-400
  layering, well covered.
- **`dispatch-run.ts` / `dispatch-steps.ts` split:** principled, not size-based — the
  replay-deterministic, dependency-free workflow-body core vs Node-side step I/O, a real
  Workflow SDK constraint; `workflows/dispatch.ts` remains thin wiring.
  **Narrow supersession (2026-07-16):** the earlier parenthetical claiming
  `maxRetries = 0` on launch alone was sufficient is superseded by H10. Sandbox creation
  and preparation/detached launch are now separate zero-retry steps so `sandboxName`
  becomes durable before post-create work. `resolveDispatchDisposition` remains a clean
  pure function with correct precedence (cleanup > supervision > harness > landing),
  well tested.
- **Consumer-gateway discipline:** `Pick<GitGateway, …>` narrowing, entrypoint binding
  (`context.ts` binds real adapters at the command entry; workflow steps bind at step
  entry — the correct entrypoint for durable serverless steps), vendor types confined to
  adapters. The three GitHub channels (octokit App auth in mint; REST+fetch with
  in-workflow App token in dispatch report; user's own `gh` CLI locally) are genuinely
  different credential/exec substrates per the Tier-3 rule and must NOT be consolidated.
- **Foundation reuse in the CLI:** git facts genuinely reused via `RealGitGateway`
  (`repoRoot`/`currentBranch`/`headCommit`/`statusPaths`); the raw argv builders cover
  only operations foundation lacks (`push`, `ls-remote`, `commit-tree`) — verified as
  the only spellings in the repo. `commands/prompt.ts` matches the canonical command
  shape (`createNsDomainCommand`, positional schema, `resultSchema` union, ADR-0012
  bounds, `negative`/`failure`/`usageError` channels).
- **Style-guard hygiene (~16.7k lines):** no `as unknown as`; no raw production timers
  (the only sleep is the Workflow SDK's durable zero-compute suspension, injected as a
  dep into `superviseDetachedRun`); no banned shared-test-state mutation; the repeated
  `=== false` narrowing idiom is consistently justified by the documented Vercel-builder
  strictNullChecks constraint.
- **`supervision.ts`:** the right canonical home, genuinely reused — one poll-loop
  implementation backs both the supervision probe and `executeDispatchRun`. It survives
  the H2 retirement by design.
- **`run-id-stamp.ts`:** legitimate — the stamp marker format is a real cross-side
  contract (CLI stamping, TUI parsing), not mere string formatting.
- **`real-anchor-id.ts`:** a legitimate 6-line determinism seam, not fragmentation.
- **`sandbox/validation.ts` vs `dispatch/validation.ts`:** NOT duplicates — different
  domains (commit SHA vs run id), and dispatch correctly imports `isCommitSha` rather
  than copying it. (The L6 finding is about `dispatch/validation.ts`'s re-export path,
  not cross-module duplication.)
- **`handleTriggerRequest`/`handleRunStatusRequest`:** clean linear pipelines with
  correct fail-closed ordering and no 401/403 information-leak asymmetry; the auth
  machinery shared from mint is real reuse. `real-workflow-run-gateway.ts` is a textbook
  thin adapter (vendor types confined, LBYL normalization, error classification).
- **`build-deployable.ts` structure:** not one long imperative script — each step
  delegates judgment to pure, zod-validated predicates in the deployability module; the
  hermetic-artifact approach was a deliberate fix for a real production packaging
  blocker.
- **`runner.ts` lifecycle:** cleanly phased (prompt read → agent loop → finalize commit
  → decision log → atomic result write last), pure orchestration over two gateway seams
  with the write-ordering invariant asserted in tests; `main.ts` is a genuinely thin
  entrypoint.
- **Docs vs code:** every spot-checked contract lines up — all eight `NS_DISPATCH_*`
  env vars, the `x-ns-dispatch-oidc-token` header, `/api/mint|trigger|runs` routes,
  workflow names, Pi-only registry facts, clone-vs-landing token phases, the pi-runner
  lifecycle contract, probe marker, `pnpm@11.8.0`, script names, and all evidence
  identifiers (deployment, run IDs, PR #3612). `ns.toml [dispatch]` keys match the
  parser exactly, with optional-in-schema URLs correctly required at the preflight
  layer. The README-draft promotion path is explicitly stated (satisfying
  platform-and-consumer); the dispatch-extension closure is complete with no dangling
  live references.
- **Sequencing:** essentially all awaits in the dispatch path are order-dependent
  (mint→create, land→cleanup→report); the only flagged parallelization is the L16
  preflight trio in the CLI.
