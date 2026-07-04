# Objective Critique (2026-07-04)

Red-team critique of this Objective as of branch `explorer-dispatch-auth-failover-schema-fix`
(head after `8e62380a4`). Read-only review; no changes applied. Suggested changes are
recorded at the bottom and tracked as a roadmap item.

## Verdict: go-with-changes

The direction is sound and the adopt-vs-build decision is unusually well-evidenced — the
load-bearing substrate claims were verified directly in code and hold. But the roadmap
marks item 2 (explorer agent definition) done while its evidence is broken on the branch
head: 2 of 17 explore tests fail, and two unstated risks deserve a recorded decision
before the fan-out tool (item 3) builds on this layer.

## Concerns, ranked

### 1. Roadmap item 2 is checked `[x]` but its evidence fails on the branch head (high)

`EXPLORER_AGENT_REPO_RELATIVE_PATH` is `".ji/pi/agents/explorer.md"`
(`ts/packages/local/pi-tools/src/explore/contract.ts:2`), but the agent actually lives at
`.ns/pi/agents/explorer.md` — `.ji/` does not exist anywhere in the worktree (the ns
cutover, commit `29204e8d8`, is in this branch's history). Running the suite: both tests
in `test/explore/contract.test.ts` fail with `Could not find .ji/pi/agents/explorer.md`.
The same commit (`d7e90c185`) added the agent file under `.ns/` and the constant under
`.ji/` — internally inconsistent from birth, likely a pre-rename cherry-pick. Related
drift: the test fake uses `filePath: "/fake/.ji/pi/agents/explorer.md"`
(`src/explore/testing.ts:49`), and the roadmap evidence cites `.ji/pi/agents/explorer.md`
and "12 fake-driven tests" (actual: 17). This also violates the active `rename-ji-to-ns`
orientation ("avoid introducing new `.ji`-named surfaces"). The fix is small, but an
objective whose done-item evidence doesn't pass on its own branch shouldn't proceed to
item 3 as-is.

### 2. Unstated risk: explorer children bypass the home-directory guard (medium)

Children launch with `--no-extensions` (`runner-subagents/subagent-process.ts:523`),
which the contract comment correctly treats as part of the read-only guarantee — but it
also strips `.pi/extensions/home-directory-guard.ts`, the session extension that blocks
home-root-targeted tool calls. A child explorer with `grep`/`find` has no such guard and
no cwd jail. Read-only is capability-enforced; *scope* is prompt-enforced only
("scouting the current working directory", `.ns/pi/agents/explorer.md:15`). Given the
standing rule against broad home traversal, the Objective should record this as a known
risk with a decision (accept, inject the guard via the existing
`--extension runtimeExtensionPath` seam at `subagent-process.ts:524-525`, or document
why prompt-scoping suffices).

### 3. Thesis overstates "no result context economy" (low)

The substrate already has a parent-facing economy:
`MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS = 48_000` with a session-file pointer on truncation
(`runner-subagents/extension.ts:31,181`). What's genuinely missing is a *scout-sized*
bounded preview (oh-my-pi's 5,000-char shape). The roadmap plans exactly that, so this
is a prose accuracy issue, not a design flaw — but the Thesis's "no" claims should
survive a code check, and this one doesn't quite.

### 4. Cheap-model policy is Anthropic-only; "cheap by default" silently degrades (low)

`resolveExplorerLaunchPlan` (`src/explore/model-policy.ts:23-36`) returns `inherit` for
a non-Anthropic parent without Anthropic auth — explorers then run at full parent-model
price with no cheap option for Google/OpenAI families
(`MODEL_PROVIDER_FAMILY_PROVIDERS` supports them; the policy doesn't). Fine for this
repo's dogfood environment, but it's an unstated scoping decision that contradicts the
completion criterion "on a cheaper model by default" in non-Anthropic sessions.

### 5. The read-only comment's justification rests on a version-skewed fact (low)

`contract.ts:5-9` claims "Pi core ships exactly seven tools" — verified true at the
pinned 0.79.1 (`ToolName` in `pi-coding-agent/dist/core/tools/index.d.ts:21`), but
children spawn via the *installed* CLI (0.80.3 per the decision update), which the
workspace types can't vouch for. The guarantee actually rests on positive-allowlist
semantics (robust to new upstream tools), so the conclusion holds; the stated reasoning
is weaker than the mechanism.

## Stated assumptions, classified

| Assumption | Classification |
|---|---|
| Pi 0.80.x extension API stays stable enough | **Plausible but unchecked** — workspace pins 0.79.1 with a pi-ai patch (`ts/pnpm-workspace.yaml:11-13`); the survey's "additive-stable 0.73→0.80" claim rests on the first-party example, not independently verifiable. The pin/installed-CLI skew is recorded honestly in the decision update. |
| 2026-07-02 survey stays representative | **Plausible but unchecked** — checkouts exist under `~/code/githubs/`; heads were re-pulled per the update, which honestly reports the freshness risk was borne out. Two days old; decays fast, but the decision is durable (ADR 0023). |
| Haiku-class recon is useful under a strict contract | **Plausible but unchecked at n=1** — one real smoke (accurate, line-cited, $0.055). The roadmap itself flags the no-`bash` risk was not stressed; the dogfood item is the right control. |
| Two-layer delivery path (`.pi/extensions/` shim → `ts/packages/`) | **Verified** — e.g. `.pi/extensions/dispatch-runner-subagent.ts` is a 3-line shim over `@internal/pi-tools`; explore's shim is correctly deferred to item 3. |
| Risk: build = owning Pi SDK churn | **Verified real and contained** — the only direct upstream import in this slice is `AuthStorage` inside `@ns/pi/runtime/auth.ts:1-9`, matching the "mediated seam" claim; the upstream docstring confirms `getAuthStatus` is non-refreshing. |
| Risk: no-`bash` recon loss | **Verified real** — allowlist is `read,grep,find,ls` (`contract.ts:10`), passed through to child argv (integration-tested at `test/explore/dispatch.test.ts:245`); mitigation path (vetted read-only command tool) is stated. |
| Risk: consolidation likely parks | **Verified plausible** — thermo-council's pool is deliberately local ("Keep this local until a second caller…", `thermo-council/orchestrator.ts:190`) and carries review-specific coupling. |

## Mechanism→goal fit and cheapest alternative — both check out

Traced the built path end to end: definition load (`.ns/pi/agents` discovery,
`agent-definition.ts:44-52`) → `{{prompt}}` composition (verified placeholder in
`explorer.md:58`) → launch plan → dispatch with allowlist → single-retry failover on
`error`/`protocol-error` only, with abort short-circuits — the failover matrix is
well-tested (9 dispatch tests cover every branch). The cheapest alternative — exposing
`tools` on the existing `dispatch_runner_subagent` tool and letting the model call it N
times — fails for a real reason: the neutral `ToolDefinition` has no `executionMode`, so
parallel tool calls run sequentially; batch fan-out inside one `execute` is required,
exactly as the decision update records. The complexity budget is honest: the two
speculative items (fleet/transcript viewer, in-process adapter) are explicitly
non-blocking.

## Suggested changes (not yet applied)

1. Fix `EXPLORER_AGENT_REPO_RELATIVE_PATH` to `.ns/…`, the `testing.ts` fake path, and
   the roadmap's `.ji` citation + test count — item 2's evidence must pass on the branch
   that claims it.
2. Add the child-extension-bypass (home-directory-guard) item to Assumptions and Risks
   with an explicit decision.
3. Soften the Thesis's "no result context economy" to name the actual gap (scout-sized
   preview vs the existing 48k cap + pointer), and note the Anthropic-only cheap-model
   policy.
