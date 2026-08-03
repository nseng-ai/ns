# Land main-confirmation slot-cleanup selector (Pi) — fold keep/free choice into the upfront landing confirmation

## Goal / outcome

Give interactive Pi users a three-way choice at `ns flow land`'s **main landing confirmation** when landing from a managed slot without explicit flags:

1. **Land and keep the slot + local branch** (default — matches today's preserve default),
2. **Land, then free the slot and delete the landed local branch** (same mutation as `--free`),
3. **Cancel landing**.

Everywhere a selection capability is unavailable (terminal ns CLI, print/RPC/agent modes, hosts without a select seam), behavior stays exactly as it is after PR #4026 ("Make `land` preserve managed slots by default and add explicit `--free` cleanup"): yes/no confirmation, silent preserve default, `--free` as the only cleanup route, preserved-slot info hint.

## Resolved requirements (decided during grilling — treat as fixed)

- **Upfront, not post-landing:** the choice is folded into the main landing confirmation (the pre-merge confirmation becomes a selector), not asked after landing succeeds.
- **`--up` (Upstack Continuation): no selector.** `land --up` keeps the plain yes/no confirmation; landed-branch disposition stays flag-driven (`--free` deletes it after successful continuation). Continuation always preserves the invoking slot.
- **Host scope: Pi-only selector, graceful degradation.** Thread an optional `select` seam end-to-end (mirroring the existing optional `confirm` seam). Do **not** build a terminal select prompt; the terminal ns CLI and all non-select hosts keep current confirm behavior.
- **Flags bypass the selector.** `--free` keeps today's yes/no confirm with the cleanup-impact preview (the flag is the consent). `--yes` skips the main confirmation entirely and lands with flag-derived policy (preserve unless `--free`). Non-interactive behavior (refusal without `--yes`) is unchanged.
- **Esc / dismissed selector = cancel landing** (safe: no mutation), matching declined-confirmation semantics ("Cancelled before merge; no PRs were landed.").
- Dry runs never prompt (dry-run returns before the confirmation block in both paths).

## Context and discovered facts (verified on branch `make-land-preserve-default`, PR #4026, head `68c1a37f1`)

This plan builds directly on PR #4026, which made `preserve` the default cleanup policy, collapsed `LandingCleanupPolicy` to `"preserve" | "free"`, removed `--preserve`/`--force` and the entire separate post-landing-cleanup confirmation (request kind, gateway options, `declined` report variant, decision plumbing), and added a preserved-slot hint. **Implementation must start from that branch (or wherever it has landed).**

### Seam map for `select` (currently confirm-only at every layer)

| Layer | File | Current state |
| --- | --- | --- |
| Pi runtime ctx | `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/runtime/extension-types.ts` (~line 126) | `CommandContext.ui` already has `select?(title: string, items: string[]): Promise<string | undefined>` (used by pi-ns-objectives `extension.ts` ~565 and pi-ns-handoffs `pickup-list.ts` ~411 as precedents) |
| Pi CLI bridge | `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts` | `CommandContext.ui` (bridge-local structural type, ~line 116) has `confirm?` but **no** `select?`; `CliCommandRunDeps` (~line 72) has `confirm?: CliCommandConfirmPrompt` only; bridging happens at ~line 445: wraps `ctx.ui.confirm`, sets progress phase `"waiting for confirmation"`, restores `"running CLI command"` in `finally` |
| ns CLI runner | `ts/packages/public/ns/src/cli/index.ts` | `RunNsCliDeps extends Omit<NsCliDeps, "context">` and spreads `...deps` — adding a field to `NsCliDeps` flows through automatically |
| SDK CLI deps | `ts/packages/public/sdk/src/cli/index.ts` | `NsCliDeps.confirm?: NsConfirmPrompt` (~line 113); threaded via `optionalEntries({ ..., confirm: deps.confirm })` into `buildNsCliContext` (~line 259) and the completion-resolver invocation (~line 192) |
| SDK API | `ts/packages/public/sdk/src/sdk/execution.ts` | `NsConfirmOptions`/`NsConfirmPrompt` (~lines 19–27); `NsExtensionApi.confirm?: ExplicitUndefined<"public-api-compatibility", NsConfirmPrompt>` (~line 68). No select type exists. Exports via `ts/packages/public/sdk/src/sdk/index.ts` (~line 27) |
| Terminal CLI | `ts/packages/public/sdk/src/cli/context.ts` | `createTerminalConfirmPrompt()` only — intentionally **no** terminal select (out of scope) |
| Flow command | `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts` (~line 93) | passes `...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm })` into `runLandCli` |
| Flow land CLI | `ts/packages/incubating/extensions/flow/src/land/land.ts` | `LandCliConfirmPrompt` type; input `confirm?`; builds ctx with `hasUI: confirm !== undefined` and `ui.confirm` (~lines 108–150) |
| Flow ctx type | `ts/packages/incubating/extensions/flow/src/land/stack/types.ts` | `LandStackCommandContext.ui`: `notify`, `confirm`, `setStatus`, `setWidget?` — no select |

The Pi extension registration chain is: `pi-ns-flow/src/project-extension.ts` → `registerFlowExtension` (`extension.ts`) → `registerCliCommandExtension(pi, { cliName: "ns", runCli: createFreshNsCliRunner() })` → `runNsCli(args, deps)` from `@nseng-ai/ns/cli`. Pi's real runtime ctx structurally satisfies the bridge's `CommandContext`, so adding `select?` to the bridge type picks up Pi's existing capability with no Pi-core change.

### Flow land confirmation/cleanup architecture (post-PR-#4026)

- **Confirmation gateway:** `flow/src/land/execution/host-seams.ts` defines `LandConfirmationRequest` kinds `main-landing` (carries `plan`, optional `cleanup?: PostLandingSlotCleanupPreview`), `single-branch-main-landing` (carries `pullRequest`, `trunk`, optional `cleanup?`), `free-managed-slots`, `submit-required-updates`; `LandConfirmationDecision` is `approved {approvalSource: "prompted" | "approved-upfront"} | declined | refused-with-fully-worded-failure`.
- **Flow gateway adapter:** `flow/src/land/flow-land-confirmation-gateway.ts` maps each kind to yes/no `confirmLandStackAction` options (`flow/src/land/stack/pre-merge-confirmation.ts`; uses `ctx.ui.confirm`, refuses when `!ctx.hasUI`). `createUpfrontApprovedLandConfirmationGateway(base, approvedKinds)` short-circuits kinds approved by flags (`--yes` → `main-landing` + `single-branch-main-landing`, via `flow/src/land/landing-confirmation-policy.ts`).
- **Cleanup previews:** `planManagedSlotPostLandingCleanup({cleanup, shape})` (`flow/src/land/execution/post-landing-cleanup.ts`) returns a `PostLandingSlotCleanupPreview { branch, repoRoot, slotName, localBranchDisposition }` **only when** `postLandingCleanupTarget` resolves, and that returns `undefined` when `policy === "preserve"` or `mode === "dry-run"` or not in a managed slot. So today the main confirmation shows a cleanup impact preview only under `--free`.
- **Stack path:** `flow/src/land/execution/execute.ts` builds `cleanupRequest` from `request.cleanup` (policy) + mode (~line 137), computes `cleanupPreview` (~line 212), confirms `main-landing` (~line 213), and after the merge loop runs `executePostLandingCleanup` with `cleanupRequest`. Dry-run returns before the confirmation. `executeCleanupOnlyLanding` (current branch is trunk / nothing to land) runs cleanup without a main confirmation. `continuationPreservationReport(shape)` produces the preserved report for `--up`.
- **Fast path:** `flow/src/land/execution/single-branch-landing.ts` returns early for dry-run (~line 79), computes `cleanupPreview` (~line 85), confirms `single-branch-main-landing` (~line 93). Cleanup then runs in dispatch glue: `flow/src/land/landing-dispatch.ts` → `runPostLandingSlotCleanup({landContext, ctx, args, shape})` (`flow/src/land/post-landing-slot-cleanup.ts`), which derives policy from args via `postLandingCleanupRequestFromArgs`. PR #4026 removed the old `beforeMergeValue` decision plumbing; `runSingleBranchFastPathLanding` (`flow/src/land/single-branch-fast-path.ts`) now returns a bare `LandOutcome`.
- **Preserved report/hint:** `PostLandingSlotCleanupReport` `preserved` variant carries `slotName`/`branch`; `formatPreservedSlotHint` (`flow/src/land/land-presentation.ts`) renders "Kept <slot> and local branch <branch> — run `ns slot free --wt <slot>` when done, or pass --free next time."
- **Flags:** `flow/src/land/stack/flags.ts` descriptors: `--yes/-y`, `--dry-run`, `--free/-F`, `--up`, `--verbose`. `ParsedArgs` in `flow/src/land/stack/types.ts`.

### Repo conventions that apply

- TypeScript rules in `ts/AGENTS.md` (native tsc, Vitest, oxlint/oxfmt via `just ts-format-fix` / `just ts-lint-fix`); `exactOptionalPropertyTypes` spread idiom (`optionalEntry`/`optionalEntries` from `@nseng-ai/foundation/primitives`); optional public-SDK fields use the `ExplicitUndefined<"public-api-compatibility", T>` wrapper (mirror `confirm`).
- `CONTEXT.md` files must be updated in the same change as ground truth (`ts/packages/incubating/extensions/flow/CONTEXT.md` defines **Canonical Landing Execution**, **Upstack Continuation**, **Land Domain Core** terms).
- Fake-driven testing: extend existing unit suites; no real subprocess/UI in default lanes.
- This work touches the orienting objective `opt-in-stacking-and-provider-neutrality` only tangentially (land is Flow/Graphite-branded surface, explicitly allowed to stay Graphite-branded); do not add new ambient Graphite couplings.

## Design

### New optional select seam (mirrors confirm at every layer)

```ts
// ts/packages/public/sdk/src/sdk/execution.ts
export type NsSelectPrompt = (
	title: string,
	options: readonly string[],
) => Promise<string | undefined> | string | undefined;
// NsExtensionApi:
select?: ExplicitUndefined<"public-api-compatibility", NsSelectPrompt>;
```

Threaded: Pi bridge `CommandContext.ui.select?` → `CliCommandRunDeps.select?` → `runNsCli` deps → `NsCliDeps.select?` → `buildNsCliContext` → `NsExtensionApi.select` → flow `ns/commands/land.ts` → `runLandCli` input `select?: LandCliSelectPrompt` → `LandStackCommandContext.ui.select?`.

### Choice offering and decision (flow land)

- `host-seams.ts`: add `readonly cleanupChoice?: PostLandingSlotCleanupPreview` to the `main-landing` and `single-branch-main-landing` request variants. Extend the approved decision: `readonly cleanupPolicy?: LandingCleanupPolicy` (present only when a choice was offered and the user picked; absent means flag-derived policy stands, including the `--yes` upfront-approved gateway).
- **Offering condition** (both paths): mode is execute (dry-run already returned), flag-derived policy is `preserve` (no `--free`), continuation is not `upstack`, and a cleanup target would exist under a hypothetical `free` policy — compute via `planManagedSlotPostLandingCleanup({ cleanup: { mode: "execute", policy: "free" }, shape })`. When that preview is defined, attach it as `cleanupChoice`.
- **Gateway adapter** (`flow-land-confirmation-gateway.ts`): for the two main-landing kinds, when `request.cleanupChoice !== undefined && ctx.hasUI && ctx.ui.select !== undefined`, take a selector path instead of `confirmLandStackAction`:
  1. Present the existing confirmation details (plan / PR summary text) via `ctx.ui.notify(..., "info")` so the user sees what will land (Pi's `select` has no message body).
  2. `await ctx.ui.select(title, [keepLabel, freeLabel, cancelLabel])` with labels built by new pure helpers in `land-presentation.ts` (e.g. `landingCleanupChoiceTitle(...)`, `landingCleanupChoiceLabels(preview)`), naming the slot and branch concretely, keep marked "(default)", and the free label spelling out slot-free + branch-delete (or keep-trunk wording when `localBranchDisposition === "keep-trunk"`).
  3. Map: keep → `{ type: "approved", approvalSource: "prompted", cleanupPolicy: "preserve" }`; free → same with `"free"`; cancel or `undefined` → the existing declined path/failure ("Cancelled before merge; no PRs were landed.").
  - When select is unavailable or `cleanupChoice` absent: existing yes/no confirm, decision without `cleanupPolicy`. `--free` runs never set `cleanupChoice` (policy is not preserve), so they keep the impact-preview confirm via the existing `cleanup` field.
- **Stack path override** (`execute.ts`): after the approved `mainDecision`, derive `effectiveCleanupRequest = decision.cleanupPolicy === undefined ? cleanupRequest : { ...cleanupRequest, policy: decision.cleanupPolicy }` and use it for post-landing cleanup and its skip reports from that point on. Pre-confirmation uses of `cleanupRequest` (dry-run report, cleanup-only path, `--up` preservation reports) stay flag-based. `executeCleanupOnlyLanding` never offers the choice (nothing lands).
- **Fast path override:** `executeSingleBranchLanding` records the approved decision's `cleanupPolicy` and returns it on the merged outcome (`readonly chosenCleanupPolicy?: LandingCleanupPolicy`). `runSingleBranchFastPathLanding` returns `{ outcome: LandOutcome; chosenCleanupPolicy?: LandingCleanupPolicy }`; `landing-dispatch.ts` threads it into `runPostLandingSlotCleanup`, which accepts an optional `cleanupPolicyOverride` applied over `postLandingCleanupRequestFromArgs(args)`. (This deliberately reintroduces a minimal version of the plumbing PR #4026 removed — now carrying a user choice rather than a confirmation decision.)
- **`--up`:** `shouldContinueUpstack` requests never attach `cleanupChoice` (offering condition excludes upstack continuation), so `--up` keeps the plain confirm by construction.
- Choosing "keep" explicitly still produces the `preserved` report and hint (harmless; the hint carries the slot-free command).

## Files to change

Platform (public SDK + Pi runtime):
- `ts/packages/public/sdk/src/sdk/execution.ts` — `NsSelectPrompt`, `NsExtensionApi.select?`.
- `ts/packages/public/sdk/src/sdk/index.ts` — export `NsSelectPrompt`.
- `ts/packages/public/sdk/src/cli/index.ts` — `NsCliDeps.select?`; thread `select: deps.select` everywhere `confirm: deps.confirm` is threaded (`buildNsCliContext` input and its context assembly; the completion-resolver invocation only if it forwards confirm into command contexts — mirror confirm exactly).
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts` — `CommandContext.ui.select?` (match `extension-types.ts` signature), `CliCommandRunDeps.select?: CliCommandSelectPrompt`, bridge next to the confirm bridge (~line 445) with phase `"waiting for selection"` and `finally` restore to `"running CLI command"`.

Flow:
- `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts` — pass `ctx.select` into `runLandCli`.
- `ts/packages/incubating/extensions/flow/src/land/land.ts` — `LandCliSelectPrompt`; input `select?`; wire `ui.select` (keep `hasUI: confirm !== undefined`).
- `ts/packages/incubating/extensions/flow/src/land/stack/types.ts` — `LandStackCommandContext.ui.select?`.
- `ts/packages/incubating/extensions/flow/src/land/execution/host-seams.ts` — `cleanupChoice?` on the two main-landing kinds; `cleanupPolicy?` on approved decision.
- `ts/packages/incubating/extensions/flow/src/land/execution/execute.ts` — compute/attach `cleanupChoice`; effective-policy override after approval.
- `ts/packages/incubating/extensions/flow/src/land/execution/single-branch-landing.ts` — compute/attach `cleanupChoice`; `chosenCleanupPolicy` on merged outcome.
- `ts/packages/incubating/extensions/flow/src/land/single-branch-fast-path.ts` — return shape `{ outcome, chosenCleanupPolicy? }`.
- `ts/packages/incubating/extensions/flow/src/land/landing-dispatch.ts` — thread override into cleanup glue.
- `ts/packages/incubating/extensions/flow/src/land/post-landing-slot-cleanup.ts` — `cleanupPolicyOverride?` option.
- `ts/packages/incubating/extensions/flow/src/land/flow-land-confirmation-gateway.ts` — selector path for main-landing kinds.
- `ts/packages/incubating/extensions/flow/src/land/land-presentation.ts` — choice title/label helpers; `usage()` note that interactive Pi offers the keep/free choice at the landing confirmation.
- Docs: `ts/packages/incubating/extensions/flow/README.md` (land section: interactive hosts with a selection capability offer keep/free at the main confirmation; flags bypass), `ts/packages/incubating/extensions/flow/CONTEXT.md` (Canonical Landing Execution: main confirmation may carry a keep/free cleanup choice on selection-capable hosts; the approved decision's chosen policy overrides the flag-derived policy; flags/`--yes` bypass).

Tests (extend existing suites; mirror confirm-seam coverage where it exists):
- `flow/test/unit/flow-land-confirmation-gateway.test.ts` — selector offered/mapped (keep/free/cancel/Esc), fallback to confirm when select absent or `cleanupChoice` absent, `--free` impact-confirm unchanged.
- `flow/test/land/unit/execute.test.ts` — stack scenario: choice offered under preserve default in managed slot; chosen `free` runs cleanup mutation; chosen keep yields `preserved` report; `--yes` upfront approval keeps flag policy; `--up` never offers.
- `flow/test/unit/single-branch-fast-path.test.ts`, `flow/test/unit/post-landing-slot-cleanup.test.ts`, `flow/test/land/unit/*` — fast-path chosen-policy plumbing and override.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts` — select bridging (phase set/restore, absence tolerated), mirroring confirm bridge tests.
- SDK: wherever `NsCliDeps.confirm` threading is covered, add `select` parity.

## Implementation steps

1. **SDK select seam** — `execution.ts` + `index.ts` export; `cli/index.ts` threading. `ns/src/cli/index.ts` needs no edit (`RunNsCliDeps` inherits). Verify with `just ts-check`.
2. **Pi bridge** — `cli-extension.ts` types + bridging; test alongside.
3. **Flow context plumbing** — `stack/types.ts`, `land.ts`, `ns/commands/land.ts`.
4. **Host-seam types** — `host-seams.ts` request/decision extensions (compile-driven fixes in gateway/tests as needed).
5. **Gateway selector path** — presentation helpers + `flow-land-confirmation-gateway.ts` mapping; unit tests for all mappings.
6. **Stack-path offering + override** — `execute.ts`; execute tests.
7. **Fast-path offering + override plumbing** — `single-branch-landing.ts`, `single-branch-fast-path.ts`, `landing-dispatch.ts`, `post-landing-slot-cleanup.ts`; tests.
8. **Docs sync** — README, `usage()`, CONTEXT.md in the same change.
9. **Full validation** (below), then manual Pi smoke if feasible.

Execution strategy: heterogeneous edits with tight type coupling — implement sequentially in one session, compile-driven (`just ts-check` between steps). The select-seam threading (steps 1–3) is a small repeated pattern across ~6 files; apply it directly by mirroring the `confirm` field at each site — no fan-out or scripted rewrite is warranted.

## Validation guidance

- `just ts-format-fix` then `just` (default repo validation) at the end; `just ts-check` incrementally.
- Targeted Vitest: flow land suites (`ts/packages/incubating/extensions/flow/test/land/unit/`, `test/unit/*land*`, gateway/policy/cleanup tests), `pi-runtime` cli-extension tests, and any SDK cli-context tests touched.
- Manual smoke (optional, interactive Pi): `/ns:flow:land --dry-run` unchanged; a real landing from a managed slot without flags should show the notify + selector; `--free` and `--yes` should not.

## Risks, assumptions, open questions

- **Pi select UX is list-only** (title + string items, no message body): plan details are notified before the selector. Verify readability in Pi manually; if the notify is lost in scrollback, a follow-up could render details in the title or a widget — out of scope here.
- **Assumption:** Pi's runtime `CommandContext.ui.select` (extension-types.ts) is live in the harness build the repo runs; the bridge only needs the structural type added. If the select signature drifts (e.g. `readonly string[]` vs `string[]`), align the seam types to Pi's actual signature.
- **Assumption:** decision-type extension (`cleanupPolicy?` on approved) does not break other `LandConfirmationGateway` consumers — kinds `free-managed-slots`/`submit-required-updates` ignore it; the upfront-approved gateway returns it absent.
- **Esc-as-cancel** was chosen deliberately (selector replaces the main confirmation); if user feedback prefers Esc-as-keep, only the gateway mapping changes.
- The fast-path plumbing intentionally reintroduces a small outcome-carried value that PR #4026 removed; keep it minimal (`chosenCleanupPolicy` only) to avoid re-growing the removed decision machinery.
- Non-Pi selection-capable hosts (none today) get the selector automatically once they provide `NsExtensionApi.select` — that is intended, not accidental scope.

## Review / remediation

- Re-read `flow/CONTEXT.md` terms after editing: the closed cleanup policy stays two-valued (`preserve` / `free`); the selector chooses between them, it does not add a policy value. Avoid describing the selector as a new confirmation "kind" — it is a presentation of the existing main-landing confirmation.
- Confirm no behavior change in: dry-run, `--yes`, `--free`, `--up`, non-interactive, cleanup-only, and non-managed-worktree paths (test matrix above).
- If `just` reports dprint formatting failures, run `just dprint-fix`; for TS lint/format use `just ts-lint-fix` / `just ts-format-fix` rather than hand-editing formatter output.
- If PR #4026's branch has been rebased/landed by implementation time, re-verify the line anchors cited above (they are post-#4026 positions) before editing.
