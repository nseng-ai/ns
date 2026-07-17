# Reconciled findings ledger — thermo-nuclear review of the cloud-dispatch stack

Source: thermo-nuclear code-quality review (2026-07-14) of the full cloud-dispatch
Graphite stack (PRs #3587–#3620, branch tip `cloud-dispatch/topic-reference-docs`),
whose code surface is the new `ts/packages/capabilities/vercel` package (~16.7k lines,
all new) plus the cloud-execution objective docs. Seven parallel slice reviewers
produced ~55 draft findings; an adversarial challenge pass verified every HIGH/MEDIUM
against the code, dropped 9, downgraded 14, and reframed several remedies. This file is
the surviving ledger. Process, dropped findings, and clean attestations live in
`review-record.md`.

IDs are stable: `H*`/`M*`/`L*` from the draft, with the challenger's final severity
noted where it differs. Roadmap rows in this objective reference these IDs.

Review-scope note: severities judge implementation quality and maintainability. The
2026-07-14 review found no behavioral defect in the dispatch path; the later focused
lifecycle review recorded below found a durability defect at H10 and narrowly
supersedes that earlier conclusion for the combined launch step only.

## HIGH

### H1 — Dual failure channel through the sandbox/dispatch gateways

Found independently by two reviewers; challenger KEEP at HIGH.

All six methods of `src/dispatch/real-dispatch-sandbox-gateway.ts:117-170` return
`{ok: true}` unconditionally; failures cross as throws by design (the header comment
declares workflow step functions the sole normalization boundary). Yet every result
union in `dispatch-run.ts:298-316` carries an `{ok: false}` arm that only
`test/dispatch/support/dispatch-sandbox-fake.ts` produces (15 paired `*Fails`/`*Throws`
flags). Every step in `dispatch-steps.ts` therefore pays for both channels: ~10 paired
`try/catch` + `if (result.ok === false)` blocks with the same failure literal duplicated
per site — "Clone token mint failed." ×3 (124/133/136), "Sandbox creation failed." ×2
(153/156), "Dispatch result read failed." ×2 (363/366), "Landing token mint failed." ×3
(452/461/464), "Landing push failed." ×2 (477/480), "Sandbox cleanup failed." ×2
(499/502). The same pattern repeats in `src/sandbox/supervision-probe-steps.ts` (4 pairs
at 48-59, 70-80, 89-101, 114-123). Paired throw/failure tests account for roughly a
third of the 767-line `dispatch-steps.test.ts`. Meanwhile `real-sandbox-gateway.ts` uses
the opposite convention (catch-and-normalize; its `ok: false` is real), so the package
holds two error philosophies with a dishonest contract between them.

Challenger's SDK check: returning results from step bodies is deliberate (one poll
failure tolerated in `supervision.ts`; orchestration-level resilience) — but that
justifies exactly one channel. The gateway-union `ok: false` arms are the redundant
second one, dead in production.

**Remedy:** pick one convention package-wide. Preferred: delete the never-produced
`ok: false` arms from the six dispatch result unions (and the four supervision ones, if
they survive H2) and let steps normalize throws only; fakes throw instead of scripting
`*Fails`. Alternative: normalize in adapters like `real-sandbox-gateway.ts` and delete
the step try/catches. Either way ~⅓ of `dispatch-steps.test.ts` and the dual fake flags
disappear with behavior preserved.

### H2 — Probe machinery outlived its recorded retirement trigger (~1,300 lines)

Challenger KEEP at HIGH with remedy reframed as a *scheduled* slice.

`src/sandbox/supervision-probe.ts:10-12` states the fold condition: "Probe-specific
modules remain until the long-run live pass is proven and folded; neutral
`supervision.ts` survives that retirement." The cloud-execution roadmap records that
pass complete (840-second supervision run, 2026-07-14) with facts folded into
`references/dispatch-live-evidence.md`, and real dispatch has run live. The probe-only
surface still shipping in the production deployable: `hello-probe.ts` (231),
`workflow-probe.ts` (115), `supervision-probe.ts` (285), `supervision-probe-steps.ts`
(125), `real-sandbox-gateway.ts` (156), `real-supervision-sandbox-gateway.ts` (103),
`workflows/{hello,sandbox-probe,supervision-probe}.ts` + `-id.ts` siblings, plus probe
branches in `src/http/wire.ts`, `src/trigger/contracts.ts`,
`trigger/workflow-run-gateway.ts`, `trigger/real-workflow-run-gateway.ts`,
`trigger/workflow-ids.ts`. Nothing outside the probes consumes any of it.

Challenger constraints on timing:

- The pending controlled Pi rerun (cloud-execution steel-thread row) exercises the
  *dispatch* workflow, not the probes — probes are not the re-verification tool. But the
  retirement slice changes the deployed workflow inventory, so it lands **after** the
  rerun closes the steel thread, keeping the rerun's deployment delta confined to the
  Pi repairs.
- `references/dispatch-setup-and-preflight.md` §"Controlled private-repository probe"
  makes the hello-probe path part of the future setup skill's acceptance procedure.
  Hello's machinery (probe core, `scripts/sandbox-hello-probe.ts`, its adapter) is
  retained or retired only as an explicit decision settled with the setup-skill roadmap
  row in cloud-execution.

**Remedy:** a retirement slice deleting supervision-probe + workflow-probe machinery,
their trigger branches, and both probe sandbox adapters (keep `supervision.ts`, which
dispatch reuses). Settle hello's fate with the setup-skill row. This slice dissolves
H3, H5, H6, H8, M16, and the sandbox halves of M17/L3/L4/L5 by subtraction.

### H10 — Sandbox identity was not durable before post-create work

A focused lifecycle review found that the former single non-retryable launch step
created a Vercel Sandbox and then performed checkout reads, harness resolution, context
writes, provisioning, and detached launch before returning `sandboxName` to durable
Workflow state. Worker loss in that post-create window left orchestration unable to
attempt cleanup; only the configured sandbox timeout remained. Adversarial disposition:
KEEP at HIGH because the leaked billable resource and missing cleanup ownership cross a
durability boundary.

**Remedy:** split creation from preparation/launch into two non-retryable Workflow
steps. The creation result carries only the safe sandbox name; every returned or thrown
post-create launch failure cleans up through that durable identity before reporting.

## MEDIUM

### M19 — `DispatchDiagnosticError` could bypass normalization

`normalizeDispatchFailure` spread the diagnostic carried by a public
`DispatchDiagnosticError`, overriding only `operation`. A future constructor caller
could therefore bypass identifier validation, status bounds, message redaction, and
message truncation. Adversarial disposition: KEEP at MEDIUM; the current real adapter
passed normalized data, but the public boundary made the invariant caller-dependent.

**Remedy:** reconstruct every carried field through the same private normalizers while
keeping the outer operation authoritative.

### M20 — Workflow event failures could alter dispatch behavior

The primary event sink ran outside containment, the stream-failure marker reused that
same potentially throwing sink, and writer-lock release could escape. Adversarial
disposition: KEEP at MEDIUM because observational machinery must not change workflow
results or prevent the independent stream attempt.

**Remedy:** contain event serialization and sink invocation, stream creation/write, the
safe failure marker, and lock release; test independent and simultaneous failures.

### M21 — Active-run inspection lacked a bounded observation cutoff

The canonical Workflow inspection skill required both `run_start` and `run_end`, but a
non-terminal or stuck run has no trustworthy terminal timestamp. Adversarial
disposition: KEEP at MEDIUM because this made the diagnostic procedure least useful
for the runs that most need inspection and invited an invented end time.

**Remedy:** capture one UTC observation cutoff after topology collection, use it for
`--until`, label the interval active/open-ended and observed through that cutoff, and
avoid terminal or current-status claims beyond it.

### H3 (downgraded from HIGH; conditional on H2) — Three real adapters over one SDK

`real-sandbox-gateway.ts`, `real-supervision-sandbox-gateway.ts`,
`real-dispatch-sandbox-gateway.ts` are three separately maintained wrapper stacks over
`@vercel/sandbox`. `stopSandbox` (supervision :92-101 vs dispatch :160-169) is
line-for-line identical including the stopped/stopping idempotency business rule and its
comment; `readSandboxFile` identical; `runDetachedSandboxCommand` identical modulo env.
`SupervisionSandboxGateway` (supervision-probe.ts:257-271) is a strict structural subset
of `DispatchSandboxGateway` (dispatch-run.ts:265-295). **Execute only if probes are
retained after H2:** merge to one real adapter exposing the union surface; consumers
keep narrowed consumer-gateway types (Tier-1 pattern,
`docs/conventions/consumer-gateways-and-command-shape.md`). If H2 lands as expected, the
two probe adapters are deleted and this reduces to one adapter by subtraction.

### H4 (downgraded from HIGH; remedy reframed) — Auth assembly duplication across routes

Verified duplication: the jose-vs-override authenticator ternary appears identically
(with the same comment block) in `api/mint.ts:43-46` and
`src/trigger/route-context.ts:47-50`; `misconfiguredHandler` (mint.ts:80-82) duplicates
`triggerRouteConfigurationErrorResponse` (route-context.ts:60-64); the
`readJsonBody` + invalid-request-400 preamble is verbatim between `api/mint.ts:58-61`
and `api/trigger.ts:29-32`. Challenger **rejected** the draft's "generic route shell in
src/http/" remedy — `route-context.ts` is genuinely trigger-specific (parses
`TriggerRuntimeConfig`, constructs `workflowRuns`); a parameterized shell over three
routes adds a concept. **Reframed remedy:** collapse the ternary via
`createDevelopmentCallerAuthenticator(config, (options.createOidcGateway ?? createJoseVercelOidcGateway)(config))`
— deleting `createJoseDevelopmentCallerAuthenticator` (development-oidc.ts:95-100) and
both ternaries (the adjacent `createGitHubGateway` option already uses exactly this `??`
shape) — plus a trivial shared 500-formatter. No new abstraction.

### H5 (downgraded from HIGH; post-H2) — Workflow registration chain

Adding a workflow touches seven sites: `workflows/<x>.ts`, `workflows/<x>-id.ts`,
`http/wire.ts` `triggerWorkflowValues`, `trigger/workflow-ids.ts`, `trigger/contracts.ts`
schema branch, `trigger/workflow-run-gateway.ts` union branch,
`trigger/real-workflow-run-gateway.ts` switch branch. `toWorkflowStartRequest`
(handle-trigger-request.ts:100-125) is a structural identity re-nesting validated
`TriggerRequest` fields under `input`, after which the adapter switches *again* to
unpack into positional SDK args; the `WorkflowStartRequest` union
(workflow-run-gateway.ts:22-29) is a hand-maintained mirror of the zod union. **After
H2** (one workflow remains): inline the surviving `workflowManifestId` call into
`workflow-ids.ts` (the `-id.ts` builder comment justifies separation from workflow
modules, not one file per workflow) and have `WorkflowRunGateway.startWorkflow` accept
`TriggerRequest` directly, deleting `toWorkflowStartRequest` and the union mirror.

### H7 (downgraded from HIGH) — Dead duplicate of `isSafeSandboxName`

`src/sandbox/sandbox-name.ts:5` and `src/sandbox/contracts.ts:8` export byte-identical
regex functions (`/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`). All production imports
(`hello-probe.ts:2`, `supervision-probe-steps.ts:12`, `dispatch-steps.ts:31`) target
`contracts.ts`; the only importer of `sandbox-name.ts` is its own unit test — the
dedicated test pins the dead copy of the reattach-by-name safety regex. **Remedy:**
delete `sandbox-name.ts`, retarget `test/sandbox/sandbox-name.test.ts` at
`contracts.ts`.

### H8 (downgraded from HIGH) — Test names assert the opposite of their bodies

`test/sandbox/real-supervision-sandbox-gateway.test.ts:113` "normalizes a creation throw
to a safe failure" asserts `rejects.toThrow` (no normalization); `:124` "stops the
created sandbox when the detached launch fails, rather than leaking it" asserts
`stopCalls === 0`. Leftovers from a retired normalize-in-adapter design; they
misdocument sandbox-leak safety. **Remedy:** rename to the real contract (honest names
exist at lines 161/194). Moot if H2 deletes the file.

### H9 (downgraded from HIGH; top of MEDIUM band) — Checkout root hardcoded twice, once non-greppably

`src/dispatch/harness-registry.ts:13` has the greppable
`PI_RUNNER_ENTRY_PATH = "ts/packages/capabilities/vercel/src/pi-runner/main.ts"`;
`src/pi-runner/real-pi-coding-agent-gateway.ts:96-115` rebuilds the same root as
`join(options.cwd, "ts", "packages", "capabilities", "vercel", "node_modules", ".bin")`
— a segment list no grep for the package path will find. A package move updates the
constant and silently strands the join-list; the failure surfaces only inside a billable
production sandbox (pi's child processes lose the `pi` bin). **Remedy:** one exported
`DISPATCH_CHECKOUT_PACKAGE_ROOT` constant; derive both. Interacts with M4+M5 (paths move
in that extraction — land the constant with or before it).

### M1 — Twin runtime-config relabel shims

`src/mint/runtime-config.ts:88-96` and `src/trigger/runtime-config.ts:21-37` both wrap
`parseOidcTrustConfig` failures into
`{code: "<route>-endpoint-misconfigured", message: "<Route> endpoint configuration is invalid: ${variable}."}`,
differing only in the route word. They drag five plumbing types
(`MintOidcTrustConfigParseResult`, `MintEndpointConfigError`,
`TriggerRuntimeConfigError`, `TriggerRuntimeConfigParseResult`, the
`Pick` at route-context.ts:24); `TriggerRuntimeConfig`/`TriggerEnvironment` are bare
aliases of the auth types; `test/trigger/runtime-config.test.ts` (68 lines) re-tests the
shim. Route-specific wire codes must survive. **Remedy:** single config-error type plus
one shared formatter (pairs naturally with H4's slice); delete
`trigger/runtime-config.ts` and its test.

### M4+M5 (merged) — Extract the dispatch client out of the `ns` host surface

`docs/conventions/subpackage-conventions.md`: host surfaces are "thin adapters consumed
by exactly one host … surfaces stay thin and features stay host-free", and the `api`
door is "a thin contract/facade; logic lives in features, not here."
`src/ns/dispatch-prompt/` is ~1,400 lines of feature logic inside the host surface
(core.ts 472, contracts.ts 208, six `real-*` adapters ~533, content/context/error 188);
only `extension.ts` (12 lines) and `commands/prompt.ts` are host-shaped. Meanwhile
`src/api/project-config.ts` (150-line `[dispatch]` TOML parser) sits behind the facade
door with only internal importers (`core.ts`, `scripts/sandbox-hello-probe.ts` deep-import
it; zero external `@nseng-ai/vercel/api` consumers repo-wide). **Remedy:** one slice —
extract a `dispatch-client` feature subpackage holding `dispatch-prompt/*` plus the
project-config parser; `src/ns/` keeps the extension descriptor and command adapter;
`src/api/index.ts` re-exports. Land H9's constant with it (paths move). Also gives the
future `dispatch plan|handoff` commands a feature home.

### M6 — Local `ScriptedCommandRunner` duplicates foundation's, same name, weaker

`test/ns/support/scripted-command-runner.ts:36`: on script exhaustion it silently
replays the last response forever (`?? this.responses.at(-1) ?? exited()`), so an
adapter issuing an unexpected extra subprocess call can never fail a test.
`@nseng-ai/foundation/exec/testing` exports `ScriptedCommandRunner` /
`ScriptedCommandExecApi` verifying command+args (exit 99 on mismatch, `assertDone()`);
`ts/packages/tools/areg/test/support/scripted-command-runner.ts` shows the sanctioned
re-export pattern. Local `exited()` duplicates `exitedResult()` (a third spelling in
`dispatch-command-error.test.ts:9`). **Remedy:** delete the module; adopt foundation's.
A real test-strength loss today, not just dedup.

### M10 (remedy reframed) — Workspace-gateway failures discard all forensics; Node io untested

`src/pi-runner/real-dispatch-workspace-gateway.ts`: all six methods
`catch { return {ok: false} }`, discarding errno/git stderr — in a headless sandbox
where logs are the only forensics, and the live-run history (fallback commit recovery,
the PATH defect) proves diagnosis matters. The Node io layer
(`createNodeDispatchWorkspaceIo`: ENOENT narrowing, execFile error narrowing,
atomic-rename mechanics) is unreachable from its test, which injects `FakeIo`.
Challenger **rejected** deleting the io seam — it is not a 1:1 mirror (6 primitives vs 6
composed gateway methods) and it is what lets tests assert the partial-write→rename
*ordering*, the contract-critical atomic completion-signal invariant. **Remedy:**
(a) add a `message` (via `formatErrorMessage`) to the workspace failure arms and thread
it into `failedCompletion`; (b) add integration-lane tests (`test/integration/`, per
ts/AGENTS.md) covering the real Node io against a temp dir + real git. No conflict with
the fast default suite.

### M11 — `build-deployable.ts` double-reads `config.json` with two meanings

`scripts/build-deployable.ts:184,248`: `validateAndBuildWorkflows` reads
`paths.configPath` (the vercel build's config) immediately before `workflow build`
overwrites that same file; `verifyWorkflowManifestQueueAndSources` re-reads it as the
workflow build's config. Neither function name signals config capture; a reorder
silently merges a config with itself inside the deployment gate, and
`mergeBuildOutputConfig`'s version check cannot catch it (same version). **Remedy:**
hoist both reads into `main()` adjacent to the commands that produce them, or have each
build step snapshot and return its own config.

### M18 — Doc-contract coherence (load-bearing for a README-driven objective)

All four sub-claims challenger-verified:

1. `.ns/objectives/harness-session-generation/objective.md:2-5` edge annotation still
   says cloud-execution consumes harnesses behind "AI SDK harness adapters" — an
   architecture this same stack retired; the cloud-execution orientation explicitly
   forbids reintroducing it. Fix the parenthetical to "workflow-supervised in-sandbox
   harness runners" (matching the back-edge).
2. `references/README-draft.md` Quick start (line ~30) presents `/ns:dispatch:plan` as
   usable while line ~68 marks it "(planned)". Mark or remove the Quick-start
   alternative.
3. `references/vercel-workflow-ui-observability-research.md` is orphaned: absent from
   `references/README.md` (the map created one commit earlier) and from
   roadmap/objective, with actionable recommendations invisible to future sessions. Map
   it and capture accepted recommendations where they belong.
4. The reorg's own "link, don't restate" rule is violated: the 8-variable
   `NS_DISPATCH_*` env table is stated in full twice with divergent Purpose wording
   (`dispatch-credentials-and-trust.md:94-103` = declared owner, and
   `README-draft.md:280-289`); the per-dispatch preflight checklist ×3
   (`dispatch-setup-and-preflight.md:142-159`, `dispatch-anchor-and-landing.md:16-28`,
   `README-draft.md:258-268`); the `build:deployable` gate ×3. `references/README.md`
   also creates two authority owners (README-draft above topic refs at line 11 vs "each
   topic reference owns current engineering truth" at line 33). One full statement per
   contract; restatements become a line + link; state which layer wins for facts that
   are both user-facing and engineering truth.

## LOW

Grouped here by theme to match the roadmap's batch rows. Items marked *(narrowed)* or
*(reframed)* carry the challenger's adjustment.

### Batch A — mint/auth/trigger polish

- **M2 (downgraded):** self-inflicted env-parsing ceremony in
  `src/mint/runtime-config.ts:47-86,116-120` and `src/auth/oidc-trust-config.ts:22-72`
  — `z.strictObject` forces the manual four-key pick; the `is*EnvironmentName` guards
  are provably always-true; the `…EnvironmentNames` arrays restate schema keys.
  Non-strict `z.object` over the raw environment + `typeof issuePath === "string"`
  deletes ~40 lines, zero behavior change.
- **L1:** `MintResponse` (mint/contracts.ts:10-24) carries unreachable members — no
  code path constructs `status: 500` or `"mint-endpoint-misconfigured"` as a
  `MintResponse` (the 500 path builds a raw `Response`). Drop them so the handler type
  states what the handler produces.
- **L2:** `isInstallationAuthentication` (mint/real-gateways.ts:110-116) is named like a
  type guard but takes an already-typed value and returns bare `boolean`; rename to
  reflect output validation.
- **L11:** `createWorkflowRunGateway?: (config: TriggerRuntimeConfig) => …`
  (route-context.ts:21) passes OIDC trust config the factory never uses (real gateway
  takes none; every test injection ignores it). Drop the parameter.
- **M17 (downgraded):** per-test-file fake reimplementation despite shared support:
  `InMemoryGitHubInstallationTokenGateway` hand-copied twice + a `RecordingGitHubGateway`
  variant; `InMemoryVercelOidcGateway` re-declared despite the identical
  `test/support/route-fakes.ts` export; three hand-rolled `WorkflowRunGateway` fakes
  (handle-trigger-request/trigger-endpoint/runs-endpoint tests), the first a strict
  superset. One fake per gateway in shared support. (Sandbox-fake half moot under H2.)

### Batch B — dispatch module polish

- **L6:** `dispatch/validation.ts` (9 lines) is fully re-exported by
  `run-id-stamp.ts:10`, creating two canonical import paths (`trigger/contracts.ts` uses
  one, `ns/dispatch-prompt/core.ts` the other). Merge into `run-id-stamp.ts`.
- **L7 (narrowed):** dead `"invalid-input"` arm in `DispatchLaunchResult`
  (dispatch-run.ts:333) from re-validating input `executeDispatchRun` already validated;
  if ever reached, the launch-failure branch would report against the anchor the doc
  comment declares untrusted for exactly this code. Fix the arm; the re-validation
  itself is deliberate at-least-once defense — keep it.
- **L8:** transient sandbox read failures labeled configuration errors
  (dispatch-steps.ts:181-206): a flaky `readSandboxFile` for ns.toml returns
  `"dispatch-misconfigured"` / "configuration is invalid". Map read failures to
  `launch-failed`; reserve misconfigured for parse verdicts on read content.
- **L9:** non-atomic GET→PATCH on the anchor PR body
  (real-dispatch-report-gateway.ts:91-107; `real-anchor-pr-gateway.ts` same shape), plus
  first-100-comments scan with a GET→POST race across retries. Windows are small and
  dispatch owns the PR; acknowledge in a header comment at minimum.
- **L10:** `WorkflowDispatchRunResult` failure variant (dispatch-run.ts:373-382) makes
  `anchorBranch`/`anchorPrNumber`/`sandboxName`/`polls` optional to accommodate the
  single `invalid-input` case; split that variant and make the always-present fields
  required.
- **L12:** six eta-expanded step wirings in `workflows/dispatch.ts:59-65`
  (`launch: async (run) => await launchDispatchStep(run)` → `launch: launchDispatchStep`);
  only the `sleep` adapter genuinely adapts a type.
- **L26:** `completion-contract.ts` (5 lines) — its dependency-free-sharing rationale is
  void (both consumers already import `dispatch-run.ts`, itself dependency-free). Fold
  `DispatchHarnessCompletion` into `dispatch-run.ts` beside its parser.
- **M14 (downgraded):** the launch-failure branch (dispatch-run.ts:517-536) shares the
  4-line cleanup-wins overwrite with `resolveDispatchDisposition`; routing it through
  the disposition requires widening its input — more concepts than the four lines it
  deletes. Take only if a cheap shared helper falls out of H1's restructuring.
- **M15 (downgraded):** `DispatchSandboxSdkSandbox` + `wrapSandbox`
  (real-dispatch-sandbox-gateway.ts:17-111) hand-mirror the vendor surface as a test
  seam; vendor drift is compiler-caught today (wrapSandbox calls the real methods) and
  `runDetachedCommand` genuinely adapts. Optional: type structurally via
  `Pick<Sandbox, …>` to drop ~55 lines.
- **M13(b) (downgraded):** the ~65-line `ts/package.json` parser + failure taxonomy +
  branded `ValidatedPnpmVersion` in `harness-registry.ts:31-115` has one consumer
  (`harness-invocation.ts:94`); fold it there. The branded type guards interpolation
  into a sandbox command — do not weaken it in the move. (M13(a), replacing the registry
  with a switch, was DROPPED — see review-record.md.)

### Batch C — ns CLI polish

- **M8 (downgraded):** `real-workspace-git-gateway.ts:15` takes two seams (foundation
  git-facts gateway + raw `CommandRunner`) into one substrate; coherence holds by
  construction at the single call site today. Optional: accept one `CommandExecApi`
  (optional `coreGit` override) per the `RealSlotRepositoryGateway` precedent; also
  deletes `DispatchLocalGitFactsGateway` from contracts.ts (see L14).
- **M3 (downgraded, reframed):** twin ns.toml `[dispatch]` parsers
  (`src/api/project-config.ts:82-106` strict vs `src/dispatch/harness-invocation.ts:37-43`
  loose) — the asymmetry is defensibly deliberate (strict at the local authoring
  boundary; tolerant when reading arbitrary dispatched SHAs). Remedy is narrowed to:
  shared table/key-name constants and a comment recording the deliberate
  strict-local/tolerant-remote asymmetry. Do not unify the parse stacks.
- **L13 (narrowed):** move the pre-mutation input bounds check (prompt/revision) before
  the anchor push (`core.ts:411` runs after two remote mutations, contradicting the
  line-330 contract). The post-PR full re-check is deliberately placed and commented —
  keep it.
- **L14:** `DispatchLocalGitFactsGateway` (contracts.ts:23) is adapter-internal plumbing
  in the core's seam-vocabulary file; move into `real-workspace-git-gateway.ts` (falls
  out of M8).
- **L15:** `.env.local` resolved via `new URL("../../../.env.local", import.meta.url)`
  (real-local-token-gateway.ts:21) ties credential lookup to on-disk source layout;
  have `context.ts` pass `envLocalPath` explicitly.
- **L16:** three independent preflight reads await sequentially (core.ts:70-92: config,
  package-manager config, OIDC token) with no data dependency; `Promise.all` then check
  in fixed report order.
- **L17:** `Awaited<ReturnType<…>>` at core.ts:224 obfuscates the exported
  `DispatchTriggerIdentityResult`.
- **L18:** dead ternary `check.status === "ok" ? "ok" : "failed"` on an `"ok"|"failed"`
  union (commands/prompt.ts:205).
- **L19:** `stampAnchorPrRunId` (a `gh pr edit` op) returns
  `DispatchGitOperationResult` (contracts.ts:101) — rename the shared shape
  (`DispatchOperationResult`) rather than adding a second type.
- **L20:** `dispatch-prompt-fakes.ts:66` keeps double books — per-method recording
  arrays plus the shared `recordOperation` ledger threaded through five constructors;
  only one test asserts on the ledger. One typed ledger with derived views drops ~⅓ of
  380 lines.

### Batch D — pi-runner/build cleanup

- **M9 (downgraded):** hidden, non-idempotent `process.env` PATH mutation inside
  `createSession` (real-pi-coding-agent-gateway.ts:35); hoist into `main.ts` (the
  process entry owns process-level concerns) or make idempotent; take env from caller.
- **M12 (downgraded):** `deployability/gate.ts` spans three concerns (API hermeticity
  7-102, workflow packaging 104-204, config merge 206-241); its two test files already
  split on that seam but live under `test/api/`. Split the module, move tests to
  `test/deployability/`, and delete the `findMissingTriggerWorkflowManifestIds` wrapper
  (the script imports `triggerWorkflowIds` anyway).
- **L24:** identical `.func`-directory listing duplicated (build-deployable.ts:85-89 vs
  127-131); one `listFunctionDirectories(root)` helper.
- **L25 (narrowed):** replace hand-rolled `isFileMissingError`
  (real-dispatch-workspace-gateway.ts:96-100) with foundation's `errorCodeFromUnknown`
  (already imported elsewhere in this package). The execFile wrapper is NOT a hand-rolled
  promisify — it deliberately resolves non-zero exits as values, which
  `promisify(execFile)` does not; keep it.
- **L21 (tied to H2/hello fate):** `scripts/sandbox-hello-probe.ts:11-16,107,127`
  re-declares the mint wire contract (weaker schema than
  `wire.ts`'s `mintSuccessResponseSchema`), the `x-ns-dispatch-oidc-token` header
  literal, and a URL validator duplicating `isCredentialFreeHttpsUrl`. If the script is
  retained as the setup acceptance tool, import from `wire.ts`/`project-config.ts`.

### Batch E — docs repoints (fold into the M18 row)

- **L27a:** `references/credentials-design.md` (~lines 120, 168-170) still says
  workflow-side minting "remain[s] pending the batched live pass" after that pass ran;
  add a dated supersession note pointing at the live-evidence entry (design records hold
  rationale, not status).
- **L27b:** the stack deletes `docs/wayfinding/ns-cloud-capabilities/ideas.md` while the
  open `stack-smush` objective's
  `references/ccc-disjoint-scope-dispatch-proposal.md:334` still cites it; repoint to
  cloud-execution or annotate retired.
