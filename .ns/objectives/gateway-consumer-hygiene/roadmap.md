# Roadmap

## Work

- [x] **A — Docs bundle** (lands with this Objective): publish the Consumer
      Gateway / command-shape convention and its routing.
  - `docs/conventions/consumer-gateways-and-command-shape.md` (new): the
    three-tier rule (Consumer Gateways, kit-owned command-shape, gateway-object
    sharing) plus the inversion rule and the justified single-consumer
    exception.
  - `ts/packages/capability-kit/AGENTS.md` (new): the kit admission test —
    tool-vocabulary-only export names, two-consumers-or-justification for new
    barrel exports, routing to the convention doc and ADR 0019.
  - Root `AGENTS.md`: routing clause on the "Keep units small and testable"
    architecture bullet.
  - `docs/adr/0019-gateway-real-implementation-placement-gate.md`: Status
    amendment resolving the `git` row toward `capability-kit-owned`.
  - Root `CONTEXT.md`: new **Consumer Gateway** term beside Gateway/Kit Gateway.
  - Policy: lands as this Objective's own slice; no separate execution row.
  - Evidence: `just dprint-fix` clean; cited file/symbol references verified at
    write time. Landed on `gateway-hygiene/docs-and-objective`; full `just`
    green.
- [x] **B — Kit export demotion**: move the flow-only `execNs*` family
      (`execNsCommand`, `createNsCliExecAdapter`, `execNsGit`,
      `readNsGitPorcelainStatus`, `ExecNsCommandOptions`,
      `NsGitPorcelainStatusResult`) out of the `capability-kit` `git` barrel
      (`ts/packages/capability-kit/src/git/index.ts`) into flow
      (`ts/packages/capabilities/flow/src/ns/`), and drop the roughly six dead
      barrel re-exports (`readLocalBranchRefs` plus its four types,
      `parseGitStatusPaths`, `parseGitNameStatusPaths`,
      `GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_FORMAT`, the non-`At`
      `detectGitOperationInProgress` variant, and `nodeGitWorktreeStateFs`).
      One-shot move + repoint commit.
  - Policy: direct execution; grep-verify no additional consumers of each moved
    or dropped symbol first; steer if a "dead" re-export turns out to have a
    live consumer.
  - Evidence: targeted flow + capability-kit Vitest, `just ts-check`, and
    stale-reference grep verification. Landed on
    `gateway-hygiene/kit-demotion`: grep gate clean (zero imports of any
    demoted symbol from the barrel), capability-kit 296 + flow 448 tests
    passed, full `just` green. One stale style-guard test fixture repointed to
    a kept barrel symbol.
- [x] **C — Pick-narrowing exemplars**: convert 1–2-method `GitGateway`
      consumers to `Pick`-narrowed Consumer Gateways —
      hosts/pi worktree-status (`headCommit`), pr-feedback (`currentBranch`,
      `isInsideWorkTree`), retros (`optionalRepoRoot`, `currentBranch`), and
      areg (`optionalRepoRoot`, `gitPath`). Objectives, slots, branch-context,
      plans, reviews, and flow stay as-is (they exercise enough of the contract
      to keep typing against the full interface).
  - Policy: direct execution; one consumer per checkpoint is fine.
  - Evidence: targeted Vitest per converted package plus `just ts-check`.
    Landed on `gateway-hygiene/pick-narrowing`: `WorktreeStatusGitGateway`,
    `PrAddressGitGateway`, `RetrosGitGateway`, `AregGitGateway`; pr-feedback
    110 + retros 79 + areg 197 + pi 275 tests passed, full `just` green. One
    audit correction: pi worktree-status also threads `originUrl` into the kit
    github identity helper — narrowed in row D1's slice.
- [x] **D1 — Kit contract verbs**: add `hasStagedChanges`,
      `checkStagedWhitespace`, `unstageAll`, and `checkout` to `GitGateway`,
      `RealGitGateway`, and `InMemoryGitGateway` with tests; add
      `KnownGitErrorCodes` `git_staged_probe_failed`,
      `git_staged_whitespace_failed`, `git_unstage_failed`, and
      `git_checkout_failed`.
  - Policy: direct execution for an additive extension; steer first if any verb
    proves non-additive against an existing consumer.
  - Evidence: `pnpm --dir ts --filter @nseng-ai/capability-kit test` with
    real/fake parity, `just ts-check`. Landed on
    `gateway-hygiene/kit-git-verbs`: capability-kit 304 + pi 275 tests passed,
    full `just` green. `checkout` reuses `GitBranchParams`; fake knobs
    `stagedChanges` / per-verb `*Failure` / `*Calls` getters; also narrowed
    `resolveGithubRepositoryIdentityFromOrigin` to
    `Pick<GitGateway, "originUrl">` (spillover from row C).
- [x] **D2 — Objectives runner gate**: route the index-clean and
      staged-whitespace checks in
      `ts/packages/capabilities/objectives/src/runner/gate.ts` through
      `ctx.git`, dropping the ad-hoc `exec` git calls.
  - Policy: direct execution; steer first if the Pi exec-seam gateway wiring
    needs a new adapter.
  - Evidence: targeted objectives Vitest, `just ts-check`. Landed on
    `gateway-hygiene/objectives-gate-seam`: objectives 295 tests passed
    (integration `runner-finish-git.test.ts` untouched); unit and scenario
    gate tests moved from scripted-exec argv assertions to InMemory gateway
    knobs and call logs; best-effort `unstageAll` failure note preserved; full
    `just` green.
- [x] **D3 — Flow autobranch Consumer Gateway**: introduce an
      `AutobranchGitGateway` over the existing 3-arg exec closure; route the
      plain-git ops in `upstream.ts`, `latest-commit-preparation.ts`,
      `latest-commit-transaction.ts`, and `dirty-transaction.ts` through it.
      The multi-tool exec channel stays alongside; failure-catalog messages stay
      byte-identical.
  - Policy: direct execution; steer first if seaming changes any failure-catalog
    message.
  - Evidence: targeted flow autobranch Vitest with message assertions, and
    grep/diff verification that failure-catalog text is unchanged. Landed on
    `gateway-hygiene/autobranch-gateway`: flow 448 tests passed; no expected
    failure-message string literal changed; `AutobranchExec` alias fixed to
    the real 3-arg shape; `createGitWorldExec` untouched with a new
    `createGitWorldHarness` wrapper keeping argv-level event assertions
    verbatim; public `FlowAutobranchCheckpointInput` unchanged; full `just`
    green.
- [x] **D4 — branch-context checkout**: change
      `ts/packages/capabilities/branch-context/src/pi/gt/upstack-impl-launch.ts`
      to take `git: Pick<GitGateway, "checkout">` instead of raw host exec; the
      caller constructs a `RealGitGateway` with a 30s timeout.
  - Policy: direct execution.
  - Evidence: targeted branch-context Vitest, `just ts-check`. Landed on
    `gateway-hygiene/branch-context-checkout`: branch-context tests passed;
    the `{cwd, timeout: 30_000}` argv-level checkout assertion survived
    verbatim; two failure-message expectations moved to the gateway's
    `formatCommandFailure` / `git_startup_failed` shapes;
    `formatCheckoutFailureOutput` and the local timeout const deleted; full
    `just` green.

## Parked

- [ ] **Read-only ad-hoc git callers** — flow trunk-pull / smart-restack /
      stack-squash, ccc cmux, pi worktree-status reads, and nscc. These read git
      state without a gateway seam. Pull into Work deliberately once it is worth
      deciding per site whether each merits a Consumer Gateway or is fine as a
      direct read. Row D seams only the mutation sites; these reads are out of
      scope for the current waves.
